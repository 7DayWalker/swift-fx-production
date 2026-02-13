-- ============================================================
-- STEP 11: SIGNALS RLS - ALLOW SELECT FOR ALL AUTHENTICATED
-- Run in Supabase SQL Editor
-- ============================================================
--
-- PURPOSE: Allow all authenticated users to SELECT all signals.
-- Frontend will handle visibility gating with locked overlays.
--
-- CHANGES:
-- - Remove tier-based filtering from SELECT policy
-- - Keep admin-only INSERT/UPDATE/DELETE policies unchanged
--
-- ============================================================

-- Drop existing SELECT policy for authenticated users
DROP POLICY IF EXISTS "signals_select_auth" ON signals;

-- Create new SELECT policy - all authenticated users can read ALL signals
CREATE POLICY "signals_select_auth"
  ON signals FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- VERIFICATION:
--   SELECT policyname, cmd FROM pg_policies 
--   WHERE tablename = 'signals' AND schemaname = 'public';
--
-- Expected result:
--   signals_select_free_anon  | SELECT  (anon sees free only)
--   signals_select_auth       | SELECT  (authenticated sees ALL)
--   signals_insert_admin      | INSERT  (admin only)
--   signals_update_admin      | UPDATE  (admin only)
--   signals_delete_admin      | DELETE  (admin only)
-- ============================================================
