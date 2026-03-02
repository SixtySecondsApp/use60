-- Add research column to landing_builder_sessions
-- Stores auto-research data (company, competitors, market context) from landing-research edge function
ALTER TABLE public.landing_builder_sessions
  ADD COLUMN IF NOT EXISTS research jsonb DEFAULT '{}'::jsonb;
