-- Migration: Notification Queue for Intelligent Delivery
-- Story: ORG-NOTIF-014
-- Description: Queue system for respecting user preferences and preventing notification spam

-- ========================================
-- TABLE: Notification Queue
-- ========================================

CREATE TABLE IF NOT EXISTS notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('info', 'success', 'warning', 'error')),
  category TEXT NOT NULL CHECK (category IN ('team', 'deal', 'system', 'digest')),
  action_url TEXT,
  is_org_wide BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  priority INT NOT NULL DEFAULT 0,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_delivery_state CHECK (
    (delivered_at IS NULL AND failed_at IS NULL) OR
    (delivered_at IS NOT NULL AND failed_at IS NULL) OR
    (delivered_at IS NULL AND failed_at IS NOT NULL)
  )
);

CREATE INDEX idx_notification_queue_user_pending
ON notification_queue(user_id, scheduled_for)
WHERE delivered_at IS NULL AND failed_at IS NULL;

CREATE INDEX idx_notification_queue_org_pending
ON notification_queue(org_id, scheduled_for)
WHERE delivered_at IS NULL AND failed_at IS NULL;

CREATE INDEX idx_notification_queue_scheduled
ON notification_queue(scheduled_for)
WHERE delivered_at IS NULL AND failed_at IS NULL;

-- Enable RLS
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;

-- Only service role can access queue
CREATE POLICY "Service role only" ON notification_queue
FOR ALL USING (public.is_service_role());

-- ========================================
-- FUNCTION: Enqueue Notification
-- ========================================

CREATE OR REPLACE FUNCTION enqueue_notification(
  p_user_id UUID,
  p_org_id UUID,
  p_title TEXT,
  p_message TEXT,
  p_type TEXT,
  p_category TEXT,
  p_action_url TEXT,
  p_is_org_wide BOOLEAN,
  p_metadata JSONB,
  p_priority INT DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue_id UUID;
  v_scheduled_for TIMESTAMPTZ;
BEGIN
  -- Default to immediate delivery
  v_scheduled_for := NOW();

  -- TODO: Check user preferences and adjust scheduled_for based on:
  -- - Delivery frequency preference (immediate, hourly, daily)
  -- - Do not disturb hours
  -- - Category mute settings

  -- Insert into queue
  INSERT INTO notification_queue (
    user_id,
    org_id,
    title,
    message,
    type,
    category,
    action_url,
    is_org_wide,
    metadata,
    priority,
    scheduled_for
  )
  VALUES (
    p_user_id,
    p_org_id,
    p_title,
    p_message,
    p_type,
    p_category,
    p_action_url,
    p_is_org_wide,
    p_metadata,
    p_priority,
    v_scheduled_for
  )
  RETURNING id INTO v_queue_id;

  RETURN v_queue_id;
END;
$$;

-- ========================================
-- FUNCTION: Process Notification Queue
-- ========================================

CREATE OR REPLACE FUNCTION process_notification_queue(
  p_batch_size INT DEFAULT 100
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification RECORD;
  v_processed_count INT := 0;
  v_notification_id UUID;
BEGIN
  -- Process notifications that are due
  FOR v_notification IN
    SELECT *
    FROM notification_queue
    WHERE delivered_at IS NULL
      AND failed_at IS NULL
      AND scheduled_for <= NOW()
    ORDER BY priority DESC, scheduled_for ASC
    LIMIT p_batch_size
  LOOP
    BEGIN
      -- Create actual notification
      INSERT INTO notifications (
        user_id,
        org_id,
        title,
        message,
        type,
        category,
        action_url,
        is_org_wide,
        metadata,
        created_at
      )
      VALUES (
        v_notification.user_id,
        v_notification.org_id,
        v_notification.title,
        v_notification.message,
        v_notification.type,
        v_notification.category,
        v_notification.action_url,
        v_notification.is_org_wide,
        v_notification.metadata,
        NOW()
      )
      RETURNING id INTO v_notification_id;

      -- Mark as delivered
      UPDATE notification_queue
      SET delivered_at = NOW(),
          metadata = metadata || jsonb_build_object('notification_id', v_notification_id)
      WHERE id = v_notification.id;

      v_processed_count := v_processed_count + 1;

    EXCEPTION WHEN OTHERS THEN
      -- Mark as failed and increment retry count
      UPDATE notification_queue
      SET failed_at = CASE
          WHEN retry_count >= 2 THEN NOW()  -- Max 3 attempts
          ELSE NULL
        END,
        retry_count = retry_count + 1,
        scheduled_for = CASE
          WHEN retry_count < 2 THEN NOW() + (POWER(2, retry_count) || ' minutes')::INTERVAL
          ELSE scheduled_for
        END,
        failure_reason = SQLERRM
      WHERE id = v_notification.id;
    END;
  END LOOP;

  RETURN v_processed_count;
END;
$$;

-- ========================================
-- FUNCTION: Clean Old Queue Items
-- ========================================

CREATE OR REPLACE FUNCTION cleanup_notification_queue(
  p_days_old INT DEFAULT 7
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INT;
BEGIN
  -- Delete delivered or permanently failed items older than specified days
  DELETE FROM notification_queue
  WHERE (delivered_at IS NOT NULL OR (failed_at IS NOT NULL AND retry_count >= 3))
    AND (COALESCE(delivered_at, failed_at) < NOW() - (p_days_old || ' days')::INTERVAL);

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;

-- ========================================
-- Add comments for documentation
-- ========================================

COMMENT ON TABLE notification_queue IS
'Queue for intelligent notification delivery respecting user preferences and preventing spam.';

COMMENT ON FUNCTION enqueue_notification IS
'Adds notification to queue with scheduling based on user preferences. Returns queue ID.';

COMMENT ON FUNCTION process_notification_queue IS
'Processes queued notifications that are due for delivery. Returns count processed.';

COMMENT ON FUNCTION cleanup_notification_queue IS
'Deletes delivered/failed queue items older than specified days. Returns count deleted.';

-- ========================================
-- Verification
-- ========================================

DO $$
BEGIN
  RAISE NOTICE 'Notification queue system created:';
  RAISE NOTICE '  ✓ notification_queue table';
  RAISE NOTICE '  ✓ enqueue_notification() - Add to queue';
  RAISE NOTICE '  ✓ process_notification_queue() - Deliver due notifications';
  RAISE NOTICE '  ✓ cleanup_notification_queue() - Clean old items';
  RAISE NOTICE '';
  RAISE NOTICE 'Setup cron jobs:';
  RAISE NOTICE '  - Process queue every 1 min: SELECT cron.schedule(''process-notif-queue'', ''* * * * *'', $job$SELECT process_notification_queue(100)$job$);';
  RAISE NOTICE '  - Clean queue daily: SELECT cron.schedule(''clean-notif-queue'', ''0 3 * * *'', $job$SELECT cleanup_notification_queue(7)$job$);';
  RAISE NOTICE '';
  RAISE NOTICE 'Features:';
  RAISE NOTICE '  - Priority-based delivery';
  RAISE NOTICE '  - Automatic retry with exponential backoff (3 attempts max)';
  RAISE NOTICE '  - Scheduled delivery (future: respect user preferences)';
END $$;
