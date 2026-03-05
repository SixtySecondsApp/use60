-- Create fireflies_integrations table for per-user Fireflies.ai integration
-- Each user connects their own Fireflies account via API key

CREATE TABLE "public"."fireflies_integrations" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "api_key" text NOT NULL,
  "fireflies_user_email" citext,
  "fireflies_team_id" text,
  "sync_all_team_meetings" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "last_sync_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,

  -- One active integration per user
  CONSTRAINT "fireflies_integrations_unique_user"
    UNIQUE (user_id)
);

-- Index for active integrations
CREATE INDEX idx_fireflies_integrations_active
  ON fireflies_integrations(user_id)
  WHERE is_active = true;

-- Enable RLS
ALTER TABLE "public"."fireflies_integrations" ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only manage their own integrations
DO $$ BEGIN
  CREATE POLICY "users_manage_own_fireflies_integration"
  ON fireflies_integrations
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create fireflies_sync_state table for tracking sync status
CREATE TABLE "public"."fireflies_sync_state" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "integration_id" uuid NOT NULL REFERENCES fireflies_integrations(id) ON DELETE CASCADE,
  "sync_status" text DEFAULT 'idle' NOT NULL,
  "last_successful_sync" timestamptz,
  "last_synced_date" date,
  "error_message" text,
  "error_count" integer DEFAULT 0 NOT NULL,
  "last_error_at" timestamptz,
  "meetings_synced" integer DEFAULT 0 NOT NULL,
  "total_meetings_found" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,

  CONSTRAINT "fireflies_sync_state_status_check"
    CHECK (sync_status = ANY (ARRAY['idle', 'syncing', 'error'])),

  -- One sync state per user
  CONSTRAINT "fireflies_sync_state_unique_user"
    UNIQUE (user_id)
);

-- Index for active syncs
CREATE INDEX idx_fireflies_sync_state_status
  ON fireflies_sync_state(user_id, sync_status);

-- Enable RLS
ALTER TABLE "public"."fireflies_sync_state" ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view/update their own sync state
DO $$ BEGIN
  CREATE POLICY "users_manage_own_fireflies_sync_state"
  ON fireflies_sync_state
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_fireflies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_fireflies_integrations_updated_at
  BEFORE UPDATE ON fireflies_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_fireflies_updated_at();

CREATE TRIGGER update_fireflies_sync_state_updated_at
  BEFORE UPDATE ON fireflies_sync_state
  FOR EACH ROW
  EXECUTE FUNCTION update_fireflies_updated_at();
