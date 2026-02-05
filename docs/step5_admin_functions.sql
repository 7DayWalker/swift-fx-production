-- ============================================================
-- ADMIN SUPPORT FUNCTIONS + POLICIES
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Admin stats function (for admin dashboard cards)
CREATE OR REPLACE FUNCTION public.get_admin_stats()
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'total_users',    (SELECT count(*) FROM profiles),
    'premium_users',  (SELECT count(*) FROM profiles WHERE role = 'premium'),
    'vip_users',      (SELECT count(*) FROM profiles WHERE role = 'vip'),
    'admin_users',    (SELECT count(*) FROM profiles WHERE role = 'admin'),
    'total_signals',  (SELECT count(*) FROM signals),
    'total_ai_analyses', 0
  );
$$;
GRANT EXECUTE ON FUNCTION public.get_admin_stats() TO authenticated;

-- 2. Get all users function (joins profiles + auth.users for email)
CREATE OR REPLACE FUNCTION public.get_all_users()
RETURNS TABLE (
  user_id    uuid,
  name       text,
  email      text,
  role       text,
  admin_role text,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id         AS user_id,
    p.name,
    au.email,
    p.role::text,
    p.admin_role::text,
    p.created_at
  FROM profiles p
  JOIN auth.users au ON au.id = p.id
  ORDER BY p.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_all_users() TO authenticated;

-- 3. Admin can READ all profiles (for user management)
CREATE POLICY "profiles_select_admin"
  ON profiles FOR SELECT TO authenticated
  USING (get_my_role() = 'admin');

-- 4. Admin can UPDATE all profiles (for role changes)
CREATE POLICY "profiles_update_admin"
  ON profiles FOR UPDATE TO authenticated
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

-- ============================================================
-- DONE! Verify:
--   SELECT proname FROM pg_proc WHERE proname IN ('get_admin_stats','get_all_users');
--   SELECT policyname FROM pg_policies WHERE tablename = 'profiles';
-- ============================================================
