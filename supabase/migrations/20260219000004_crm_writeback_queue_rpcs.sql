-- =====================================================================
-- CRM Write-Back Queue Management RPCs
-- =====================================================================
-- Database functions for atomic queue operations with FOR UPDATE SKIP LOCKED
-- pattern for concurrent worker processing.
-- =====================================================================

-- =====================================================================
-- Dequeue Items for Processing
-- =====================================================================
-- Atomically claims pending/failed items ready for retry.
-- Uses FOR UPDATE SKIP LOCKED to prevent concurrent workers from
-- processing the same item.
-- =====================================================================

CREATE OR REPLACE FUNCTION dequeue_crm_writeback_item(
  batch_size INTEGER DEFAULT 10,
  lock_duration_seconds INTEGER DEFAULT 300
)
RETURNS TABLE (
  id UUID,
  org_id UUID,
  crm_source TEXT,
  entity_type TEXT,
  crm_record_id TEXT,
  local_record_id UUID,
  operation TEXT,
  payload JSONB,
  triggered_by TEXT,
  triggered_by_user_id UUID,
  status TEXT,
  priority INTEGER,
  attempts INTEGER,
  max_attempts INTEGER,
  last_error TEXT,
  next_retry_at TIMESTAMPTZ,
  dedupe_key TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  lock_id TEXT;
  lock_until TIMESTAMPTZ;
BEGIN
  lock_id := gen_random_uuid()::TEXT;
  lock_until := NOW() + (lock_duration_seconds || ' seconds')::INTERVAL;

  -- Find and lock items ready for processing
  RETURN QUERY
  UPDATE crm_writeback_queue q
  SET
    status = 'processing',
    attempts = attempts + 1,
    updated_at = NOW()
  WHERE q.id IN (
    SELECT q2.id
    FROM crm_writeback_queue q2
    WHERE
      q2.status IN ('pending', 'failed')
      AND q2.next_retry_at <= NOW()
      AND q2.attempts < q2.max_attempts
    ORDER BY q2.priority ASC, q2.next_retry_at ASC
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING
    q.id,
    q.org_id,
    q.crm_source,
    q.entity_type,
    q.crm_record_id,
    q.local_record_id,
    q.operation,
    q.payload,
    q.triggered_by,
    q.triggered_by_user_id,
    q.status,
    q.priority,
    q.attempts,
    q.max_attempts,
    q.last_error,
    q.next_retry_at,
    q.dedupe_key,
    q.created_at,
    q.updated_at,
    q.completed_at;
END;
$$;

-- =====================================================================
-- Complete Item (Success)
-- =====================================================================

CREATE OR REPLACE FUNCTION complete_crm_writeback_item(
  item_id UUID,
  result_crm_record_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE crm_writeback_queue
  SET
    status = 'completed',
    completed_at = NOW(),
    updated_at = NOW(),
    crm_record_id = COALESCE(result_crm_record_id, crm_record_id),
    last_error = NULL
  WHERE id = item_id;
END;
$$;

-- =====================================================================
-- Fail Item (Retry or Dead Letter Queue)
-- =====================================================================
-- Exponential backoff: 1min, 5min, 30min, 2h, 12h
-- =====================================================================

CREATE OR REPLACE FUNCTION fail_crm_writeback_item(
  item_id UUID,
  error_msg TEXT,
  move_to_dlq BOOLEAN DEFAULT FALSE
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  current_attempts INTEGER;
  retry_delay_seconds INTEGER;
  retry_delays INTEGER[] := ARRAY[60, 300, 1800, 7200, 43200]; -- 1m, 5m, 30m, 2h, 12h
BEGIN
  -- Get current attempt count
  SELECT attempts INTO current_attempts
  FROM crm_writeback_queue
  WHERE id = item_id;

  IF move_to_dlq THEN
    -- Move to dead letter queue (max retries exceeded)
    UPDATE crm_writeback_queue
    SET
      status = 'dead_letter',
      last_error = error_msg,
      completed_at = NOW(),
      updated_at = NOW()
    WHERE id = item_id;
  ELSE
    -- Get retry delay from schedule (1m, 5m, 30m, 2h, 12h)
    -- If attempts exceeds array length, use the last value (12h)
    retry_delay_seconds := retry_delays[LEAST(current_attempts, array_length(retry_delays, 1))];

    UPDATE crm_writeback_queue
    SET
      status = 'failed',
      last_error = error_msg,
      next_retry_at = NOW() + (retry_delay_seconds || ' seconds')::INTERVAL,
      updated_at = NOW()
    WHERE id = item_id;
  END IF;
END;
$$;

-- =====================================================================
-- Retry Dead Letter Item (Manual Recovery)
-- =====================================================================

CREATE OR REPLACE FUNCTION retry_crm_writeback_item(item_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE crm_writeback_queue
  SET
    status = 'pending',
    attempts = 0,
    next_retry_at = NOW(),
    last_error = NULL,
    updated_at = NOW()
  WHERE id = item_id AND status = 'dead_letter';
END;
$$;

-- =====================================================================
-- Queue Statistics (Monitoring)
-- =====================================================================

CREATE OR REPLACE FUNCTION get_crm_writeback_queue_stats(p_org_id UUID DEFAULT NULL)
RETURNS TABLE (
  org_id UUID,
  pending_count BIGINT,
  processing_count BIGINT,
  failed_count BIGINT,
  dead_letter_count BIGINT,
  completed_last_hour BIGINT,
  avg_retry_count NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    q.org_id,
    COUNT(*) FILTER (WHERE q.status = 'pending') AS pending_count,
    COUNT(*) FILTER (WHERE q.status = 'processing') AS processing_count,
    COUNT(*) FILTER (WHERE q.status = 'failed') AS failed_count,
    COUNT(*) FILTER (WHERE q.status = 'dead_letter') AS dead_letter_count,
    COUNT(*) FILTER (WHERE q.status = 'completed' AND q.completed_at > NOW() - INTERVAL '1 hour') AS completed_last_hour,
    AVG(q.attempts) FILTER (WHERE q.status = 'completed') AS avg_retry_count
  FROM crm_writeback_queue q
  WHERE p_org_id IS NULL OR q.org_id = p_org_id
  GROUP BY q.org_id;
END;
$$;
