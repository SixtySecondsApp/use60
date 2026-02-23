-- Add service_preferences column to google_integrations if it doesn't already exist.
-- This column stores per-service enable/disable flags (gmail, calendar, drive).
-- The column is JSONB to allow flexible extension in future.

ALTER TABLE google_integrations
  ADD COLUMN IF NOT EXISTS service_preferences JSONB NULL;

COMMENT ON COLUMN google_integrations.service_preferences IS
  'Per-service toggle flags: { "gmail": boolean, "calendar": boolean, "drive": boolean }. NULL means all services enabled (default).';
