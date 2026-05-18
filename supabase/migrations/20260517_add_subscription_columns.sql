ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS subscription text DEFAULT 'free',
ADD COLUMN IF NOT EXISTS subscription_tier text DEFAULT 'free',
ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'inactive',
ADD COLUMN IF NOT EXISTS subscription_expiry timestamptz,
ADD COLUMN IF NOT EXISTS subscription_platform text,
ADD COLUMN IF NOT EXISTS subscription_product_id text,
ADD COLUMN IF NOT EXISTS subscription_auto_renew boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS subscription_is_trial boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS activated_at timestamptz;
