-- ============================================================
-- STEP 10: ROLE ENUM MIGRATION (DESTRUCTIVE - RUN WITH CAUTION)
-- Run in Supabase SQL Editor AFTER step9 is verified working
-- ============================================================
--
-- PREREQUISITE CHECKS (run these first):
-- 
--   -- Check if any users have free/premium/vip roles
--   SELECT role, count(*) FROM profiles GROUP BY role;
--   
--   -- These should all be 0 before proceeding:
--   SELECT count(*) FROM profiles WHERE role IN ('free', 'premium', 'vip');
--
-- ============================================================

-- ============================================================
-- PART 4A: MIGRATE EXISTING DATA
-- ============================================================
-- Convert all free/premium/vip roles to 'user'
-- (Subscription tiers are now in subscriptions table)

UPDATE profiles 
SET role = 'user' 
WHERE role IN ('free', 'premium', 'vip');

-- ============================================================
-- PART 4B: UPDATE get_my_role() FUNCTION
-- ============================================================
-- Now returns only: 'user', 'admin', 'super_admin'

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role::text FROM profiles WHERE id = auth.uid()),
    'user'  -- Default to 'user' instead of 'free'
  );
$$;

-- ============================================================
-- PART 4C: DROP AND RECREATE ENUM (PostgreSQL limitation)
-- ============================================================
-- PostgreSQL doesn't support removing values from enums directly.
-- We need to: 
-- 1. Create new enum
-- 2. Update column to use new enum
-- 3. Drop old enum

-- Step 1: Create new enum type
CREATE TYPE user_role_new AS ENUM ('user', 'admin', 'super_admin');

-- Step 2: Update the column to use new enum
ALTER TABLE profiles 
  ALTER COLUMN role TYPE user_role_new 
  USING role::text::user_role_new;

-- Step 3: Drop old enum and rename new one
DROP TYPE IF EXISTS user_role;
ALTER TYPE user_role_new RENAME TO user_role;

-- ============================================================
-- PART 4D: UPDATE RLS POLICIES TO USE NEW ROLE VALUES
-- ============================================================

-- Update signals RLS for admin check
DROP POLICY IF EXISTS "signals_select_auth" ON signals;

CREATE POLICY "signals_select_auth"
  ON signals FOR SELECT TO authenticated
  USING (
    CASE 
      WHEN get_my_role() IN ('admin', 'super_admin') THEN true
      ELSE 
        CASE get_my_active_tier()
          WHEN 'vip'     THEN true
          WHEN 'premium' THEN visibility IN ('free', 'premium')
          ELSE visibility = 'free'
        END
    END
  );

-- Update plans admin policy
DROP POLICY IF EXISTS "plans_admin_all" ON plans;

CREATE POLICY "plans_admin_all"
  ON plans FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'super_admin'))
  WITH CHECK (get_my_role() IN ('admin', 'super_admin'));

-- Update subscriptions admin policy
DROP POLICY IF EXISTS "subscriptions_admin_write" ON subscriptions;

CREATE POLICY "subscriptions_admin_write"
  ON subscriptions FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'super_admin'))
  WITH CHECK (get_my_role() IN ('admin', 'super_admin'));

-- Update profiles admin policies
DROP POLICY IF EXISTS "profiles_select_admin" ON profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;

CREATE POLICY "profiles_select_admin"
  ON profiles FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'super_admin'));

CREATE POLICY "profiles_update_admin"
  ON profiles FOR UPDATE TO authenticated
  USING (get_my_role() IN ('admin', 'super_admin'))
  WITH CHECK (get_my_role() IN ('admin', 'super_admin'));

-- Update ai_analyses admin policy
DROP POLICY IF EXISTS "ai_analyses_select_admin" ON ai_analyses;

CREATE POLICY "ai_analyses_select_admin"
  ON ai_analyses FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'super_admin'));

-- ============================================================
-- DONE! 
-- 
-- VERIFICATION:
--   SELECT enumlabel FROM pg_enum 
--   WHERE enumtypid = 'user_role'::regtype;
--   -- Should return: user, admin, super_admin (NO free/premium/vip)
--
--   SELECT role, count(*) FROM profiles GROUP BY role;
--   -- Should only show: user, admin, super_admin
--
-- ============================================================
