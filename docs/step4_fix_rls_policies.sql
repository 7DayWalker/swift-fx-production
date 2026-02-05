-- ============================================================
-- STEP 4 FIX: Corrected RLS Policies (fixes infinite recursion)
-- ============================================================
-- Problem: Previous policies queried `profiles` table inside 
-- their own conditions, causing infinite recursion.
-- Solution: A SECURITY DEFINER function that bypasses RLS.
-- ============================================================

-- 1. Drop ALL existing policies to start fresh
DO $$ 
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
  RAISE NOTICE 'All existing policies dropped.';
END $$;

-- 2. Create a SECURITY DEFINER function to safely get the current user's role.
--    Because it runs with the function owner's privileges, it bypasses RLS
--    on the profiles table, breaking the recursion cycle.
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role::text FROM profiles WHERE id = auth.uid()),
    'free'
  );
$$;

-- Grant execute to all roles that need it
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO anon;

-- ============================================================
-- PROFILES TABLE POLICIES
-- ============================================================

-- Users can read their own profile
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- Users can update their own profile (name, etc.)
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Allow the trigger to insert profiles on signup
CREATE POLICY "profiles_insert_trigger"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- PLANS TABLE POLICIES
-- ============================================================

-- Everyone (including anon/unauthenticated) can read active plans
CREATE POLICY "plans_select_public"
  ON plans FOR SELECT
  USING (is_active = true);

-- Admin can manage plans
CREATE POLICY "plans_admin_all"
  ON plans FOR ALL TO authenticated
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

-- ============================================================
-- SUBSCRIPTIONS TABLE POLICIES
-- ============================================================

-- Users can read their own subscriptions
CREATE POLICY "subscriptions_select_own"
  ON subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Admin can read ALL subscriptions
CREATE POLICY "subscriptions_select_admin"
  ON subscriptions FOR SELECT TO authenticated
  USING (get_my_role() = 'admin');

-- Admin can manage subscriptions
CREATE POLICY "subscriptions_admin_write"
  ON subscriptions FOR ALL TO authenticated
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

-- ============================================================
-- SIGNALS TABLE POLICIES
-- ============================================================

-- Anon users can read FREE signals only
CREATE POLICY "signals_select_free_anon"
  ON signals FOR SELECT TO anon
  USING (visibility = 'free');

-- Authenticated users: read signals based on their effective tier
CREATE POLICY "signals_select_auth"
  ON signals FOR SELECT TO authenticated
  USING (
    CASE get_my_role()
      WHEN 'admin' THEN true          -- admin sees everything
      WHEN 'vip'   THEN true          -- vip sees everything
      WHEN 'premium' THEN visibility IN ('free', 'premium')
      ELSE visibility = 'free'        -- free users see free only
    END
  );

-- Admin can create signals
CREATE POLICY "signals_insert_admin"
  ON signals FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = 'admin');

-- Admin can update signals
CREATE POLICY "signals_update_admin"
  ON signals FOR UPDATE TO authenticated
  USING (get_my_role() = 'admin');

-- Admin can delete signals
CREATE POLICY "signals_delete_admin"
  ON signals FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');

-- ============================================================
-- DONE! Verify with:
--   SELECT tablename, policyname FROM pg_policies 
--   WHERE schemaname = 'public' ORDER BY tablename;
-- ============================================================
