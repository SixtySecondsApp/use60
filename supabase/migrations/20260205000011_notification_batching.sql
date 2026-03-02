-- Migration: Notification Batching and Consolidation
-- Story: ORG-NOTIF-011
-- Description: Batch similar notifications to reduce noise

-- ========================================
-- TABLE: Notification Batches
-- ========================================

CREATE TABLE IF NOT EXISTS notification_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  batch_key TEXT NOT NULL,
  title TEXT NOT NULL,
  message_template TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('info', 'success', 'warning', 'error')),
  category TEXT NOT NULL CHECK (category IN ('team', 'deal', 'system', 'digest')),
  action_url TEXT,
  recipient_roles TEXT[] NOT NULL DEFAULT ARRAY['owner', 'admin'],
  events JSONB NOT NULL DEFAULT '[]'::jsonb,
  event_count INT NOT NULL DEFAULT 0,
  first_event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, batch_key)
);

CREATE INDEX idx_notification_batches_org_unsent
ON notification_batches(org_id, sent_at)
WHERE sent_at IS NULL;

CREATE INDEX idx_notification_batches_last_event
ON notification_batches(last_event_at)
WHERE sent_at IS NULL;

-- Enable RLS
ALTER TABLE notification_batches ENABLE ROW LEVEL SECURITY;

-- Only service role can access batches
DO $$ BEGIN
  CREATE POLICY "Service role only" ON notification_batches
FOR ALL USING (public.is_service_role());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ========================================
-- FUNCTION: Add Event to Batch
-- ========================================

CREATE OR REPLACE FUNCTION add_to_notification_batch(
  p_org_id UUID,
  p_batch_key TEXT,
  p_title TEXT,
  p_message_template TEXT,
  p_type TEXT,
  p_category TEXT,
  p_action_url TEXT,
  p_recipient_roles TEXT[],
  p_event_data JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id UUID;
BEGIN
  -- Insert or update batch
  INSERT INTO notification_batches (
    org_id,
    batch_key,
    title,
    message_template,
    type,
    category,
    action_url,
    recipient_roles,
    events,
    event_count,
    first_event_at,
    last_event_at
  )
  VALUES (
    p_org_id,
    p_batch_key,
    p_title,
    p_message_template,
    p_type,
    p_category,
    p_action_url,
    p_recipient_roles,
    jsonb_build_array(p_event_data),
    1,
    NOW(),
    NOW()
  )
  ON CONFLICT (org_id, batch_key)
  DO UPDATE SET
    events = notification_batches.events || jsonb_build_array(p_event_data),
    event_count = notification_batches.event_count + 1,
    last_event_at = NOW()
  RETURNING id INTO v_batch_id;

  RETURN v_batch_id;
END;
$$;

-- ========================================
-- FUNCTION: Send Batched Notifications
-- ========================================

CREATE OR REPLACE FUNCTION send_batched_notifications(
  p_batch_delay_minutes INT DEFAULT 15
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch RECORD;
  v_message TEXT;
  v_sent_count INT := 0;
  v_cutoff_time TIMESTAMPTZ;
BEGIN
  -- Only send batches that haven't been updated in the delay period
  v_cutoff_time := NOW() - (p_batch_delay_minutes || ' minutes')::INTERVAL;

  FOR v_batch IN
    SELECT *
    FROM notification_batches
    WHERE sent_at IS NULL
      AND last_event_at < v_cutoff_time
      AND event_count > 0
  LOOP
    -- Build consolidated message
    IF v_batch.event_count = 1 THEN
      v_message := v_batch.message_template;
    ELSE
      v_message := format(
        '%s (%s events in the last %s minutes)',
        v_batch.message_template,
        v_batch.event_count,
        EXTRACT(EPOCH FROM (v_batch.last_event_at - v_batch.first_event_at)) / 60
      );
    END IF;

    -- Send consolidated notification
    PERFORM notify_org_members(
      p_org_id := v_batch.org_id,
      p_role_filter := v_batch.recipient_roles,
      p_title := v_batch.title,
      p_message := v_message,
      p_type := v_batch.type,
      p_category := v_batch.category,
      p_action_url := v_batch.action_url,
      p_metadata := jsonb_build_object(
        'batch_id', v_batch.id,
        'event_count', v_batch.event_count,
        'events', v_batch.events,
        'first_event_at', v_batch.first_event_at,
        'last_event_at', v_batch.last_event_at
      ),
      p_is_org_wide := TRUE
    );

    -- Mark as sent
    UPDATE notification_batches
    SET sent_at = NOW()
    WHERE id = v_batch.id;

    v_sent_count := v_sent_count + 1;
  END LOOP;

  RETURN v_sent_count;
END;
$$;

-- ========================================
-- FUNCTION: Clean Old Batches
-- ========================================

CREATE OR REPLACE FUNCTION cleanup_old_notification_batches(
  p_days_old INT DEFAULT 30
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INT;
BEGIN
  DELETE FROM notification_batches
  WHERE sent_at IS NOT NULL
    AND sent_at < NOW() - (p_days_old || ' days')::INTERVAL;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;

-- ========================================
-- Add comments for documentation
-- ========================================

COMMENT ON TABLE notification_batches IS
'Batches similar notifications to reduce noise. Events accumulate until batch is sent.';

COMMENT ON FUNCTION add_to_notification_batch IS
'Adds an event to a notification batch. Creates new batch or appends to existing one.';

COMMENT ON FUNCTION send_batched_notifications IS
'Sends all batched notifications that haven''t been updated in the specified delay period. Returns count sent.';

COMMENT ON FUNCTION cleanup_old_notification_batches IS
'Deletes sent batches older than specified days. Returns count deleted.';

-- ========================================
-- Verification
-- ========================================

DO $$
BEGIN
  RAISE NOTICE 'Notification batching system created:';
  RAISE NOTICE '  ✓ notification_batches table';
  RAISE NOTICE '  ✓ add_to_notification_batch() - Add event to batch';
  RAISE NOTICE '  ✓ send_batched_notifications() - Send accumulated batches';
  RAISE NOTICE '  ✓ cleanup_old_notification_batches() - Clean old batches';
  RAISE NOTICE '';
  RAISE NOTICE 'Setup cron jobs:';
  RAISE NOTICE '  - Send batches every 15 min: SELECT cron.schedule(''send-batches'', ''*/15 * * * *'', $job$SELECT send_batched_notifications(15)$job$);';
  RAISE NOTICE '  - Clean old batches daily: SELECT cron.schedule(''clean-batches'', ''0 2 * * *'', $job$SELECT cleanup_old_notification_batches(30)$job$);';
END $$;
