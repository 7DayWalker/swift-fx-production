-- ============================================================
-- STEP 9: SUBSCRIPTION ENFORCEMENT HARDENING
-- Run in Supabase SQL Editor (IN ORDER)
-- ============================================================
-- 
-- GOAL: Make subscriptions table the ONLY source of truth for 
-- premium access. Remove tier logic from profiles.role.
--
-- EXECUTION ORDER:
-- 1. Create get_my_active_tier() function
-- 2. Update signals RLS to reference it
-- 3. Remove tier values from profiles.role
-- 4. Modify ENUM to only user/admin/super_admin
-- ============================================================

-- ============================================================
-- PART 1: CREATE get_my_active_tier() FUNCTION
-- ============================================================
-- This function checks the subscriptions table to determine
-- the user's active tier. Returns 'free' if no active subscription.

CREATE OR REPLACE FUNCTION public.get_my_active_tier()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT 
        CASE 
          WHEN p.tier IS NOT NULL THEN p.tier::text
          ELSE 'free'
        END
      FROM subscriptions s
      JOIN plans p ON s.plan_id = p.id
      WHERE s.user_id = auth.uid()
        AND s.status = 'active'
        AND s.current_period_end > NOW()
      ORDER BY p.tier DESC  -- If multiple, take highest tier
      LIMIT 1
    ),
    'free'  -- Default if no active subscription
  );
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_my_active_tier() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_active_tier() TO anon;

-- ============================================================
-- PART 2: UPDATE SIGNALS RLS TO USE get_my_active_tier()
-- ============================================================
-- Drop existing signal select policy for authenticated users
DROP POLICY IF EXISTS "signals_select_auth" ON signals;

-- Create new policy using subscription-based tier
CREATE POLICY "signals_select_auth"
  ON signals FOR SELECT TO authenticated
  USING (
    CASE 
      WHEN get_my_role() = 'admin' THEN true           -- admin sees everything
      WHEN get_my_role() = 'super_admin' THEN true    -- super_admin sees everything
      ELSE 
        CASE get_my_active_tier()
          WHEN 'vip'     THEN true                     -- vip sees everything
          WHEN 'premium' THEN visibility IN ('free', 'premium')
          ELSE visibility = 'free'                     -- free users see free only
        END
    END
  );

-- ============================================================
-- PART 3: UPDATE get_admin_stats() TO NOT COUNT TIER ROLES
-- ============================================================
-- Premium/VIP counts should come from subscriptions, not profiles.role

CREATE OR REPLACE FUNCTION public.get_admin_stats()
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'total_users',    (SELECT count(*) FROM profiles),
    'premium_users',  (
      SELECT count(DISTINCT user_id) FROM subscriptions s
      JOIN plans p ON s.plan_id = p.id
      WHERE s.status = 'active' 
        AND s.current_period_end > NOW()
        AND p.tier = 'premium'
    ),
    'vip_users',      (
      SELECT count(DISTINCT user_id) FROM subscriptions s
      JOIN plans p ON s.plan_id = p.id
      WHERE s.status = 'active' 
        AND s.current_period_end > NOW()
        AND p.tier = 'vip'
    ),
    'admin_users',    (SELECT count(*) FROM profiles WHERE role IN ('admin', 'super_admin')),
    'total_signals',  (SELECT count(*) FROM signals),
    'total_ai_analyses', (SELECT count(*) FROM ai_analyses)
  );
$$;
GRANT EXECUTE ON FUNCTION public.get_admin_stats() TO authenticated;

-- ============================================================
-- DONE! 
-- 
-- VERIFICATION QUERIES:
--   SELECT get_my_active_tier();  -- Should return 'free', 'premium', or 'vip'
--   SELECT get_my_role();         -- Should return 'user', 'admin', or 'super_admin'
--   SELECT * FROM get_admin_stats();
--
-- IMPORTANT: The ENUM migration (Part 4) should be run AFTER 
-- verifying existing data has been migrated.
-- ============================================================
