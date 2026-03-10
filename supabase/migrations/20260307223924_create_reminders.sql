-- Migration: create_reminders
-- Date: 20260307223924
--
-- What this migration does:
--   Creates the reminders table for one-shot time-based notifications.
--   Users say "remind me at 3pm to follow up with Acme" and the system
--   delivers via notification/Slack at the specified time.
--
-- Rollback strategy:
--   DROP TABLE IF EXISTS public.reminders CASCADE;

CREATE TABLE IF NOT EXISTS public.reminders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  remind_at timestamptz NOT NULL,
  message text NOT NULL,
  context_type text DEFAULT 'general' CHECK (context_type IN ('deal', 'contact', 'task', 'meeting', 'general')),
  context_id uuid,
  delivered boolean DEFAULT false,
  delivery_channel text DEFAULT 'in_app' CHECK (delivery_channel IN ('in_app', 'slack')),
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Due reminders query: undelivered, ordered by remind_at
CREATE INDEX IF NOT EXISTS idx_reminders_due
  ON public.reminders (remind_at)
  WHERE delivered = false;

-- User's reminders
CREATE INDEX IF NOT EXISTS idx_reminders_user
  ON public.reminders (user_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

-- Service role: full access (for process-reminders edge function)
DROP POLICY IF EXISTS "Service role full access to reminders" ON public.reminders;
CREATE POLICY "Service role full access to reminders"
  ON public.reminders
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can CRUD their own reminders
DROP POLICY IF EXISTS "Users can manage their own reminders" ON public.reminders;
CREATE POLICY "Users can manage their own reminders"
  ON public.reminders
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
