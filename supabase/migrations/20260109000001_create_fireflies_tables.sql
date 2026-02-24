-- Create Fireflies Integration Tables
-- This migration creates the necessary tables for Fireflies.ai integration

-- ============================================================================
-- 1. Create fireflies_integrations table
-- ============================================================================

CREATE TABLE IF NOT EXISTS fireflies_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- API Key (Fireflies uses API key auth, not OAuth)
  api_key TEXT NOT NULL,

  -- Fireflies User Info (populated after first successful API call)
  fireflies_user_email TEXT,
  fireflies_team_id TEXT,

  -- Sync Configuration
  sync_all_team_meetings BOOLEAN DEFAULT false,

  -- Status
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints - one active integration per user
  UNIQUE(user_id)
);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_fireflies_integrations_user_id
  ON fireflies_integrations(user_id)
  WHERE is_active = true;

-- ============================================================================
-- 2. Create fireflies_sync_state table
-- ============================================================================

CREATE TABLE IF NOT EXISTS fireflies_sync_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES fireflies_integrations(id) ON DELETE CASCADE,

  -- Sync Status
  sync_status TEXT NOT NULL DEFAULT 'idle'
    CHECK (sync_status IN ('idle', 'syncing', 'error')),
  last_successful_sync TIMESTAMPTZ,
  last_synced_date TIMESTAMPTZ, -- Latest meeting date we've synced

  -- Error Tracking
  error_message TEXT,
  error_count INTEGER DEFAULT 0,
  last_error_at TIMESTAMPTZ,

  -- Metrics
  meetings_synced INTEGER DEFAULT 0,
  total_meetings_found INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(user_id),
  UNIQUE(integration_id)
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_fireflies_sync_state_user_id
  ON fireflies_sync_state(user_id);

CREATE INDEX IF NOT EXISTS idx_fireflies_sync_state_integration_id
  ON fireflies_sync_state(integration_id);

-- ============================================================================
-- 3. Enable Row Level Security
-- ============================================================================

ALTER TABLE fireflies_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE fireflies_sync_state ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. Create RLS Policies for fireflies_integrations
-- ============================================================================

-- Users can view their own integration
CREATE POLICY "Users can view their own Fireflies integration"
  ON fireflies_integrations
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own integration
CREATE POLICY "Users can insert their own Fireflies integration"
  ON fireflies_integrations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own integration
CREATE POLICY "Users can update their own Fireflies integration"
  ON fireflies_integrations
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own integration
CREATE POLICY "Users can delete their own Fireflies integration"
  ON fireflies_integrations
  FOR DELETE
  USING (auth.uid() = user_id);

-- Service role can manage all integrations (for Edge Functions)
CREATE POLICY "Service role can manage all Fireflies integrations"
  ON fireflies_integrations
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- ============================================================================
-- 5. Create RLS Policies for fireflies_sync_state
-- ============================================================================

-- Users can view their own sync state
CREATE POLICY "Users can view their own Fireflies sync state"
  ON fireflies_sync_state
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own sync state
CREATE POLICY "Users can insert their own Fireflies sync state"
  ON fireflies_sync_state
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own sync state
CREATE POLICY "Users can update their own Fireflies sync state"
  ON fireflies_sync_state
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role can manage all sync states (for Edge Functions)
CREATE POLICY "Service role can manage all Fireflies sync states"
  ON fireflies_sync_state
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- ============================================================================
-- 6. Add table comments
-- ============================================================================

COMMENT ON TABLE fireflies_integrations IS 'Stores user Fireflies.ai API integrations';
COMMENT ON TABLE fireflies_sync_state IS 'Tracks sync status and metrics for Fireflies integrations';
