-- REPLAY-006: Add instant_replay_completed flag to user_onboarding_progress
-- + Fix source_type CHECK constraint on meetings to include 'fireflies'

-- 1. Add instant_replay_completed flag to user_onboarding_progress
ALTER TABLE public.user_onboarding_progress
  ADD COLUMN IF NOT EXISTS instant_replay_completed BOOLEAN DEFAULT false;

-- 2. Add instant_replay_meeting_id FK to meetings table (nullable)
ALTER TABLE public.user_onboarding_progress
  ADD COLUMN IF NOT EXISTS instant_replay_meeting_id UUID REFERENCES public.meetings(id);

-- 3. Fix source_type CHECK constraint on meetings to include 'fireflies'
-- Current values: 'fathom', 'voice', '60_notetaker'
-- Adding: 'fireflies' for Fireflies integration meetings
ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_source_type_check;
ALTER TABLE public.meetings ADD CONSTRAINT meetings_source_type_check
  CHECK (source_type = ANY (ARRAY['fathom'::text, 'voice'::text, '60_notetaker'::text, 'fireflies'::text]));
