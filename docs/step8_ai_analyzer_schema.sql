-- ============================================================
-- STEP 8: AI Analyzer Schema (ai_analyses table)
-- Run in Supabase SQL Editor
-- ============================================================

-- Create ai_analyses table to store AI analysis history
CREATE TABLE IF NOT EXISTS ai_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    response TEXT NOT NULL,
    model VARCHAR(50) DEFAULT 'gpt-4o-mini',
    tokens_used INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE ai_analyses ENABLE ROW LEVEL SECURITY;

-- Users can read their own analyses
CREATE POLICY "ai_analyses_select_own"
    ON ai_analyses FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- Edge Function inserts via service role (bypasses RLS)
-- No INSERT policy needed for authenticated users since Edge Function uses service key

-- Admin can read all analyses
CREATE POLICY "ai_analyses_select_admin"
    ON ai_analyses FOR SELECT TO authenticated
    USING (get_my_role() = 'admin');

-- Add index for faster user lookups
CREATE INDEX IF NOT EXISTS idx_ai_analyses_user_id ON ai_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_created_at ON ai_analyses(created_at DESC);

-- ============================================================
-- VERIFY: Ensure profiles table has usage tracking columns
-- (These should already exist from initial setup)
-- ============================================================
-- If they don't exist, uncomment and run:
-- ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ai_weekly_used INTEGER DEFAULT 0;
-- ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ai_weekly_reset TIMESTAMPTZ DEFAULT NOW();

-- ============================================================
-- DONE! Verify with:
--   SELECT * FROM information_schema.tables WHERE table_name = 'ai_analyses';
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'ai_analyses';
-- ============================================================
