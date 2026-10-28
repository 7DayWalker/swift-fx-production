-- =============================================================================
-- Migration: 20261028130000_production_security_hardening
-- Purpose:
--   1. Add missing profile lifecycle/contact columns used by FastAPI settings/admin routes
--   2. Prevent privilege & subscription self-escalation on public.profiles
--   3. Enforce admin authorization & revoke anon access on SECURITY DEFINER RPCs
--   4. Harden public.signals & storage.objects RLS policies
--   5. Pin search_path on trigger functions
-- =============================================================================

-- 1. Add missing columns on public.profiles (idempotent, non-breaking)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_by uuid,
  ADD COLUMN IF NOT EXISTS deactivation_reason text,
  ADD COLUMN IF NOT EXISTS restored_at timestamptz,
  ADD COLUMN IF NOT EXISTS restored_by uuid;

-- 2. Pin search_path on trigger functions
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, name, role, admin_enabled, referral_code)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email, 'Trader'),
    'free'::public.user_role,
    false,
    'REF' || UPPER(SUBSTRING(REPLACE(NEW.id::text, '-', ''), 1, 8))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- 3. Protect privileged columns on public.profiles from client-side tampering
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Trusted backend / database superuser roles bypass column restrictions
  IF current_user IN ('service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin')
     OR COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.role := 'free'::public.user_role;
    NEW.admin_role := NULL;
    NEW.admin_enabled := false;
    NEW.subscription := 'free';
    NEW.subscription_tier := 'free';
    NEW.subscription_status := 'inactive';
    NEW.subscription_expiry := NULL;
    NEW.subscription_platform := NULL;
    NEW.subscription_product_id := NULL;
    NEW.subscription_auto_renew := false;
    NEW.subscription_is_trial := false;
    NEW.activated_at := NULL;
    NEW.ai_weekly_used := 0;
    NEW.account_status := 'active';
    NEW.deactivated_at := NULL;
    NEW.deactivated_by := NULL;
    NEW.restored_at := NULL;
    NEW.restored_by := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.role IS DISTINCT FROM OLD.role
       OR NEW.admin_role IS DISTINCT FROM OLD.admin_role
       OR NEW.admin_enabled IS DISTINCT FROM OLD.admin_enabled
       OR NEW.referral_code IS DISTINCT FROM OLD.referral_code
       OR NEW.ai_weekly_used IS DISTINCT FROM OLD.ai_weekly_used
       OR NEW.ai_weekly_reset IS DISTINCT FROM OLD.ai_weekly_reset
       OR NEW.subscription IS DISTINCT FROM OLD.subscription
       OR NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
       OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
       OR NEW.subscription_expiry IS DISTINCT FROM OLD.subscription_expiry
       OR NEW.subscription_platform IS DISTINCT FROM OLD.subscription_platform
       OR NEW.subscription_product_id IS DISTINCT FROM OLD.subscription_product_id
       OR NEW.subscription_auto_renew IS DISTINCT FROM OLD.subscription_auto_renew
       OR NEW.subscription_is_trial IS DISTINCT FROM OLD.subscription_is_trial
       OR NEW.activated_at IS DISTINCT FROM OLD.activated_at
       OR NEW.account_status IS DISTINCT FROM OLD.account_status
       OR NEW.deactivated_at IS DISTINCT FROM OLD.deactivated_at
       OR NEW.deactivated_by IS DISTINCT FROM OLD.deactivated_by
       OR NEW.restored_at IS DISTINCT FROM OLD.restored_at
       OR NEW.restored_by IS DISTINCT FROM OLD.restored_by
    THEN
      RAISE EXCEPTION 'Forbidden: privileged profile attributes cannot be modified directly'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_protect_profile_privileged_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileged_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_privileged_columns();

-- Tighten profiles_insert_trigger policy to authenticated users only (auth trigger bypasses RLS via SECURITY DEFINER)
DROP POLICY IF EXISTS "profiles_insert_trigger" ON public.profiles;
CREATE POLICY "profiles_insert_trigger"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- 4. Update get_my_active_tier() to check BOTH subscriptions AND profiles.subscription*
CREATE OR REPLACE FUNCTION public.get_my_active_tier()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_profile_tier text;
  v_sub_tier text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'free';
  END IF;

  SELECT
    p.role::text,
    CASE
      WHEN COALESCE(p.subscription_tier, p.subscription, 'free') IN ('vip', 'premium')
           AND (p.subscription_expiry IS NULL OR p.subscription_expiry > NOW())
           AND COALESCE(p.subscription_status, 'active') IN ('active', 'grace_period', 'trialing')
      THEN LOWER(COALESCE(p.subscription_tier, p.subscription))
      ELSE 'free'
    END
  INTO v_role, v_profile_tier
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF v_role IN ('admin', 'super_admin') THEN
    RETURN 'vip';
  END IF;

  SELECT LOWER(pl.tier::text)
  INTO v_sub_tier
  FROM public.subscriptions s
  JOIN public.plans pl ON s.plan_id = pl.id
  WHERE s.user_id = v_uid
    AND s.status = 'active'
    AND (s.current_period_end IS NULL OR s.current_period_end > NOW())
  ORDER BY CASE LOWER(pl.tier::text) WHEN 'vip' THEN 2 WHEN 'premium' THEN 1 ELSE 0 END DESC
  LIMIT 1;

  IF v_profile_tier = 'vip' OR v_sub_tier = 'vip' OR v_role = 'vip' THEN
    RETURN 'vip';
  END IF;
  IF v_profile_tier = 'premium' OR v_sub_tier = 'premium' OR v_role = 'premium' THEN
    RETURN 'premium';
  END IF;

  RETURN 'free';
END;
$function$;

-- 5. Enforce admin authorization inside get_all_users() & get_admin_stats()
CREATE OR REPLACE FUNCTION public.get_all_users()
RETURNS TABLE(
  user_id uuid,
  name text,
  email text,
  role text,
  admin_role text,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin')
     AND COALESCE(auth.role(), '') <> 'service_role'
     AND NOT EXISTS (
       SELECT 1
       FROM public.profiles caller
       WHERE caller.id = auth.uid()
         AND caller.role IN ('admin'::public.user_role, 'super_admin'::public.user_role)
         AND COALESCE(caller.admin_enabled, true) = true
     )
  THEN
    RAISE EXCEPTION 'Forbidden: admin privileges required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS user_id,
    p.name,
    au.email::text AS email,
    p.role::text AS role,
    p.admin_role::text AS admin_role,
    p.created_at
  FROM public.profiles p
  JOIN auth.users au ON au.id = p.id
  ORDER BY p.created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_stats()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result json;
BEGIN
  IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin')
     AND COALESCE(auth.role(), '') <> 'service_role'
     AND NOT EXISTS (
       SELECT 1
       FROM public.profiles caller
       WHERE caller.id = auth.uid()
         AND caller.role IN ('admin'::public.user_role, 'super_admin'::public.user_role)
         AND COALESCE(caller.admin_enabled, true) = true
     )
  THEN
    RAISE EXCEPTION 'Forbidden: admin privileges required'
      USING ERRCODE = '42501';
  END IF;

  SELECT json_build_object(
    'total_users', (SELECT count(*) FROM public.profiles),
    'premium_users', (
      SELECT count(*) FROM public.profiles p
      WHERE (
        LOWER(COALESCE(p.subscription_tier, p.subscription, p.role::text)) = 'premium'
        AND (p.subscription_expiry IS NULL OR p.subscription_expiry > NOW())
      )
    ),
    'vip_users', (
      SELECT count(*) FROM public.profiles p
      WHERE p.role NOT IN ('admin'::public.user_role, 'super_admin'::public.user_role)
        AND LOWER(COALESCE(p.subscription_tier, p.subscription, p.role::text)) = 'vip'
        AND (p.subscription_expiry IS NULL OR p.subscription_expiry > NOW())
    ),
    'admin_users', (SELECT count(*) FROM public.profiles WHERE role IN ('admin'::public.user_role, 'super_admin'::public.user_role)),
    'total_signals', (SELECT count(*) FROM public.signals),
    'total_ai_analyses', (SELECT count(*) FROM public.ai_analyses)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- 6. Revoke anon EXECUTE on RPCs
REVOKE EXECUTE ON FUNCTION public.get_all_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_all_users() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_admin_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_stats() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_community_posts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_community_posts() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_post_comments(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_post_comments(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_my_active_tier() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_active_tier() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, service_role;

-- 7. Harden public.signals SELECT policy against direct tier bypass
DROP POLICY IF EXISTS "signals_select_auth" ON public.signals;
CREATE POLICY "signals_select_auth"
  ON public.signals
  FOR SELECT
  TO authenticated
  USING (
    visibility = 'free'::public.signal_visibility
    OR public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])
    OR (
      visibility = 'premium'::public.signal_visibility
      AND public.get_my_active_tier() = ANY (ARRAY['premium'::text, 'vip'::text])
    )
    OR (
      visibility = 'vip'::public.signal_visibility
      AND public.get_my_active_tier() = 'vip'::text
    )
  );

-- 8. Harden storage.objects policies (admin-only writes on Swift Insights, owner-folder writes on avatars)
DROP POLICY IF EXISTS "swift-insights-videos insert" ON storage.objects;
CREATE POLICY "swift-insights-videos insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'swift-insights-videos'::text
    AND public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])
  );

DROP POLICY IF EXISTS "swift-insights-videos update" ON storage.objects;
CREATE POLICY "swift-insights-videos update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'swift-insights-videos'::text
    AND public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])
  )
  WITH CHECK (
    bucket_id = 'swift-insights-videos'::text
    AND public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])
  );

DROP POLICY IF EXISTS "swift-insights-videos delete" ON storage.objects;
CREATE POLICY "swift-insights-videos delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'swift-insights-videos'::text
    AND public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])
  );

DROP POLICY IF EXISTS "swift-insights-thumbnails insert" ON storage.objects;
CREATE POLICY "swift-insights-thumbnails insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'swift-insights-thumbnails'::text
    AND public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])
  );

DROP POLICY IF EXISTS "swift-insights-thumbnails update" ON storage.objects;
CREATE POLICY "swift-insights-thumbnails update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'swift-insights-thumbnails'::text
    AND public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])
  )
  WITH CHECK (
    bucket_id = 'swift-insights-thumbnails'::text
    AND public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])
  );

DROP POLICY IF EXISTS "swift-insights-thumbnails delete" ON storage.objects;
CREATE POLICY "swift-insights-thumbnails delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'swift-insights-thumbnails'::text
    AND public.get_my_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])
  );

DROP POLICY IF EXISTS "avatars authenticated insert 1oj01fe_0" ON storage.objects;
CREATE POLICY "avatars authenticated insert 1oj01fe_0"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'::text
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );
