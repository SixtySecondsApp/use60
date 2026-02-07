-- Migration: Create Fireflies.ai Integration Tables
-- Purpose: Store API keys and sync state for Fireflies.ai API integration
-- Date: 2026-01-02
-- Pattern: Following fathom_integrations pattern (per-user integration)

-- ============================================================================
-- 1. Create fireflies_integrations table for API keys
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
-- 2. Create fireflies_sync_state table for tracking sync progress
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

CREATE INDEX IF NOT EXISTS idx_fireflies_sync_state_status
  ON fireflies_sync_state(sync_status)
  WHERE sync_status = 'syncing';

-- ============================================================================
-- 3. Add provider column to meetings table for multi-provider support
-- ============================================================================

-- Add provider/source column to distinguish meeting sources
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'fathom';

-- Add generic external_id for non-Fathom providers
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS external_id TEXT;

-- Add comment explaining the provider column
COMMENT ON COLUMN meetings.provider IS 
  'Meeting source/integration: fathom, fireflies, zoom, gong, teams, recall_ai, grain, otter, manual';

-- Create index for provider lookups
CREATE INDEX IF NOT EXISTS idx_meetings_provider
  ON meetings(provider);

-- Create index for external_id lookups (for Fireflies, Zoom, etc.)
CREATE INDEX IF NOT EXISTS idx_meetings_external_id
  ON meetings(external_id)
  WHERE external_id IS NOT NULL;

-- ============================================================================
-- 4. Enable Row Level Security (RLS)
-- ============================================================================

ALTER TABLE fireflies_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE fireflies_sync_state ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 5. Create RLS Policies for fireflies_integrations
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
-- 6. Create RLS Policies for fireflies_sync_state
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
-- 7. Create function to update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_fireflies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. Create triggers for updated_at
-- ============================================================================
DROP TRIGGER IF EXISTS update_fireflies_integrations_updated_at ON fireflies_integrations;
CREATE TRIGGER update_fireflies_integrations_updated_at
  BEFORE UPDATE ON fireflies_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_fireflies_updated_at();

DROP TRIGGER IF EXISTS update_fireflies_sync_state_updated_at ON fireflies_sync_state;
CREATE TRIGGER update_fireflies_sync_state_updated_at
  BEFORE UPDATE ON fireflies_sync_state
  FOR EACH ROW
  EXECUTE FUNCTION update_fireflies_updated_at();

-- ============================================================================
-- 9. Create helper function to get active integration for user
-- ============================================================================

CREATE OR REPLACE FUNCTION get_active_fireflies_integration(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  api_key TEXT,
  fireflies_user_email TEXT,
  fireflies_team_id TEXT,
  sync_all_team_meetings BOOLEAN,
  last_sync_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    fi.id,
    fi.user_id,
    fi.api_key,
    fi.fireflies_user_email,
    fi.fireflies_team_id,
    fi.sync_all_team_meetings,
    fi.last_sync_at
  FROM fireflies_integrations fi
  WHERE fi.user_id = p_user_id
    AND fi.is_active = true
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 10. Grant permissions
-- ============================================================================

-- Grant execute on helper function to authenticated users
GRANT EXECUTE ON FUNCTION get_active_fireflies_integration(UUID) TO authenticated;

-- Grant execute on update function to postgres (for triggers)
GRANT EXECUTE ON FUNCTION update_fireflies_updated_at() TO postgres;

-- ============================================================================
-- Migration Complete
-- ============================================================================

COMMENT ON TABLE fireflies_integrations IS 'Stores API keys and connection status for Fireflies.ai API integration';
COMMENT ON TABLE fireflies_sync_state IS 'Tracks sync progress and status for each user Fireflies integration';
