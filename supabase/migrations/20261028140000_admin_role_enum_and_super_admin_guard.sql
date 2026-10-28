-- Align public.admin_role enum with backend AdminRole values and restore
-- any Super Admin whose role column was overwritten by subscription updates.

ALTER TYPE public.admin_role ADD VALUE IF NOT EXISTS 'fund_admin';
ALTER TYPE public.admin_role ADD VALUE IF NOT EXISTS 'account_manager';

UPDATE public.profiles
SET role = 'admin',
    updated_at = now()
WHERE admin_role = 'super_admin'
  AND admin_enabled = true
  AND role NOT IN ('admin', 'super_admin');
