-- Add webhook_setup_dismissed to fathom_integrations
-- Allows users to permanently dismiss the webhook setup notification banner
ALTER TABLE public.fathom_integrations
  ADD COLUMN IF NOT EXISTS webhook_setup_dismissed boolean DEFAULT false;
