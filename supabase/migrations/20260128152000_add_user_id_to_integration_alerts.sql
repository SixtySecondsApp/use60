-- Add user_id column to integration_alerts table
-- This allows filtering alerts by user for per-user integrations

ALTER TABLE integration_alerts
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add index for efficient user-based queries
CREATE INDEX IF NOT EXISTS idx_integration_alerts_user_id
ON integration_alerts(user_id);

-- Add comment
COMMENT ON COLUMN integration_alerts.user_id IS 'User who owns the integration that triggered this alert. NULL for org-wide integrations.';
