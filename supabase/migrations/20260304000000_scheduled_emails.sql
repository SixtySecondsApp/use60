-- FU-007: scheduled_emails table and send-scheduled-emails cron
-- Stores follow-up emails queued for scheduled delivery

CREATE TABLE IF NOT EXISTS scheduled_emails (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_email      text NOT NULL,
  subject       text NOT NULL,
  body          text NOT NULL,
  scheduled_at  timestamptz NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  meeting_id    uuid REFERENCES meetings(id) ON DELETE SET NULL,
  draft_id      uuid,  -- references follow_up_drafts.id (see note below)
  sent_at       timestamptz,
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Ensure all required columns exist (earlier migration may have a different schema)
ALTER TABLE scheduled_emails ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE scheduled_emails ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE scheduled_emails ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
ALTER TABLE scheduled_emails ADD COLUMN IF NOT EXISTS to_email text;
ALTER TABLE scheduled_emails ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE scheduled_emails ADD COLUMN IF NOT EXISTS body text;
ALTER TABLE scheduled_emails ADD COLUMN IF NOT EXISTS sent_at timestamptz;
ALTER TABLE scheduled_emails ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE scheduled_emails ADD COLUMN IF NOT EXISTS draft_id uuid;
ALTER TABLE scheduled_emails ADD COLUMN IF NOT EXISTS meeting_id uuid;
ALTER TABLE scheduled_emails ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';
ALTER TABLE scheduled_emails ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE scheduled_emails ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Indexes for cron query performance
CREATE INDEX IF NOT EXISTS scheduled_emails_status_scheduled_at_idx
  ON scheduled_emails (status, scheduled_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS scheduled_emails_org_user_idx
  ON scheduled_emails (org_id, user_id);

CREATE INDEX IF NOT EXISTS scheduled_emails_meeting_idx
  ON scheduled_emails (meeting_id)
  WHERE meeting_id IS NOT NULL;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_scheduled_emails_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scheduled_emails_updated_at ON scheduled_emails;
CREATE TRIGGER scheduled_emails_updated_at
  BEFORE UPDATE ON scheduled_emails
  FOR EACH ROW EXECUTE FUNCTION update_scheduled_emails_updated_at();

-- RLS
ALTER TABLE scheduled_emails ENABLE ROW LEVEL SECURITY;

-- Users can only see their own org's scheduled emails
DROP POLICY IF EXISTS "scheduled_emails_select" ON scheduled_emails;
CREATE POLICY "scheduled_emails_select" ON scheduled_emails
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM organization_memberships WHERE user_id = auth.uid()
    )
  );

-- Users can only insert their own scheduled emails
DROP POLICY IF EXISTS "scheduled_emails_insert" ON scheduled_emails;
CREATE POLICY "scheduled_emails_insert" ON scheduled_emails
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND org_id IN (
      SELECT org_id FROM organization_memberships WHERE user_id = auth.uid()
    )
  );

-- Users can update/cancel their own scheduled emails
DROP POLICY IF EXISTS "scheduled_emails_update" ON scheduled_emails;
CREATE POLICY "scheduled_emails_update" ON scheduled_emails
  FOR UPDATE USING (
    user_id = auth.uid()
    AND org_id IN (
      SELECT org_id FROM organization_memberships WHERE user_id = auth.uid()
    )
  );

-- Users can delete (cancel) their own scheduled emails
DROP POLICY IF EXISTS "scheduled_emails_delete" ON scheduled_emails;
CREATE POLICY "scheduled_emails_delete" ON scheduled_emails
  FOR DELETE USING (
    user_id = auth.uid()
    AND org_id IN (
      SELECT org_id FROM organization_memberships WHERE user_id = auth.uid()
    )
  );

-- follow_up_drafts table: stores AI-generated follow-up drafts for in-app review
CREATE TABLE IF NOT EXISTS follow_up_drafts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meeting_id      uuid REFERENCES meetings(id) ON DELETE SET NULL,
  to_email        text NOT NULL,
  to_name         text,
  subject         text NOT NULL,
  body            text NOT NULL,
  edited_body     text,  -- user's edited version (original body preserved)
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'editing', 'approved', 'scheduled', 'sent', 'rejected', 'expired')),
  buying_signals  jsonb,
  generated_at    timestamptz NOT NULL DEFAULT now(),
  approved_at     timestamptz,
  sent_at         timestamptz,
  rejected_at     timestamptz,
  expires_at      timestamptz,
  scheduled_email_id uuid REFERENCES scheduled_emails(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS follow_up_drafts_org_user_idx
  ON follow_up_drafts (org_id, user_id);

CREATE INDEX IF NOT EXISTS follow_up_drafts_status_idx
  ON follow_up_drafts (status);

CREATE INDEX IF NOT EXISTS follow_up_drafts_meeting_idx
  ON follow_up_drafts (meeting_id)
  WHERE meeting_id IS NOT NULL;

CREATE OR REPLACE FUNCTION update_follow_up_drafts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS follow_up_drafts_updated_at ON follow_up_drafts;
CREATE TRIGGER follow_up_drafts_updated_at
  BEFORE UPDATE ON follow_up_drafts
  FOR EACH ROW EXECUTE FUNCTION update_follow_up_drafts_updated_at();

ALTER TABLE follow_up_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "follow_up_drafts_select" ON follow_up_drafts;
CREATE POLICY "follow_up_drafts_select" ON follow_up_drafts
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM organization_memberships WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "follow_up_drafts_insert" ON follow_up_drafts;
CREATE POLICY "follow_up_drafts_insert" ON follow_up_drafts
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND org_id IN (
      SELECT org_id FROM organization_memberships WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "follow_up_drafts_update" ON follow_up_drafts;
CREATE POLICY "follow_up_drafts_update" ON follow_up_drafts
  FOR UPDATE USING (
    org_id IN (
      SELECT org_id FROM organization_memberships WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "follow_up_drafts_delete" ON follow_up_drafts;
CREATE POLICY "follow_up_drafts_delete" ON follow_up_drafts
  FOR DELETE USING (
    user_id = auth.uid()
    AND org_id IN (
      SELECT org_id FROM organization_memberships WHERE user_id = auth.uid()
    )
  );
