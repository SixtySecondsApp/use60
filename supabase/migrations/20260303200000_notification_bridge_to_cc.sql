-- ============================================================================
-- Migration: Notification Bridge to Command Centre
-- Purpose: AFTER INSERT trigger on notifications that converts actionable
--          notifications (high-value deals, deal closures, credit alerts)
--          into command_centre_items so the CC enrichment pipeline can
--          draft actions and surface them in the unified inbox.
-- Date: 2026-03-03
-- ============================================================================

-- =============================================================================
-- TRIGGER FUNCTION: bridge_notification_to_cc
--
-- Pattern detection uses category + type + metadata fields set by existing
-- notification triggers (deal_notifications, credit_notifications).
--
-- Fail-soft: wrapped in EXCEPTION WHEN OTHERS so bridge failures never
-- block the notification insert.
-- =============================================================================

CREATE OR REPLACE FUNCTION bridge_notification_to_cc()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_type   TEXT;
  v_urgency     TEXT;
  v_title       TEXT;
  v_summary     TEXT;
  v_deal_id     UUID;
  v_deal_value  NUMERIC;
  v_is_won      BOOLEAN;
  v_notif_type  TEXT;
BEGIN
  -- -----------------------------------------------------------------------
  -- 1. Extract common metadata fields
  -- -----------------------------------------------------------------------
  v_deal_id    := (NEW.metadata ->> 'deal_id')::UUID;
  v_deal_value := (NEW.metadata ->> 'deal_value')::NUMERIC;
  v_is_won     := (NEW.metadata ->> 'is_won')::BOOLEAN;
  v_notif_type := NEW.metadata ->> 'notification_type';

  -- -----------------------------------------------------------------------
  -- 2. Pattern matching — determine if this notification is actionable
  -- -----------------------------------------------------------------------

  -- PATTERN A: Credit exhausted (category=system, notification_type=credit_exhausted)
  IF NEW.category = 'system' AND v_notif_type = 'credit_exhausted' THEN
    v_item_type := 'alert';
    v_urgency   := 'critical';
    v_title     := 'Credits Exhausted — AI Features Paused';
    v_summary   := 'Credit balance has reached zero. Top up to resume AI features.';

  -- PATTERN B: Credit low balance (category=system, notification_type=credit_low_balance)
  ELSIF NEW.category = 'system' AND v_notif_type = 'credit_low_balance' THEN
    v_item_type := 'alert';
    v_urgency   := 'high';
    v_title     := 'Low Credit Balance';
    v_summary   := format('Credit balance is low (%s remaining). Consider topping up.',
                          COALESCE(NEW.metadata ->> 'balance', '?'));

  -- PATTERN C: Deal closed lost (category=deal, is_won=false)
  ELSIF NEW.category = 'deal' AND v_is_won IS NOT NULL AND v_is_won = FALSE THEN
    v_item_type := 'deal_action';
    v_urgency   := 'high';
    v_title     := format('Deal Lost: %s', COALESCE(NEW.metadata ->> 'deal_name', 'Untitled'));
    v_summary   := format('Deal worth $%s was lost. Review for lessons learned.',
                          COALESCE(NEW.metadata ->> 'deal_value', '0'));

  -- PATTERN D: Deal closed won (category=deal, is_won=true)
  ELSIF NEW.category = 'deal' AND v_is_won IS NOT NULL AND v_is_won = TRUE THEN
    v_item_type := 'deal_action';
    v_urgency   := 'normal';
    v_title     := format('Deal Won: %s', COALESCE(NEW.metadata ->> 'deal_name', 'Untitled'));
    v_summary   := format('Deal worth $%s closed won. Trigger onboarding handoff.',
                          COALESCE(NEW.metadata ->> 'deal_value', '0'));

  -- PATTERN E: High-value deal created (category=deal, type=success, deal_value >= 50000)
  ELSIF NEW.category = 'deal' AND NEW.type = 'success'
        AND v_deal_value IS NOT NULL AND v_deal_value >= 50000
        AND v_is_won IS NULL THEN
    v_item_type := 'deal_action';
    v_urgency   := 'high';
    v_title     := format('High-Value Deal: %s ($%s)',
                          COALESCE(NEW.metadata ->> 'deal_name', 'Untitled'),
                          TO_CHAR(v_deal_value, 'FM999,999,999'));
    v_summary   := 'New high-value deal created. Assign priority resources and meeting prep.';

  ELSE
    -- Not an actionable notification — exit early, no CC item.
    RETURN NEW;
  END IF;

  -- -----------------------------------------------------------------------
  -- 3. Dedup: skip if an open/ready CC item already exists for this
  --    user + deal + item_type (or user + item_type for non-deal alerts).
  -- -----------------------------------------------------------------------
  IF v_deal_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM command_centre_items
      WHERE user_id = NEW.user_id
        AND deal_id = v_deal_id
        AND item_type = v_item_type
        AND status IN ('open', 'ready', 'enriching')
    ) THEN
      RETURN NEW;
    END IF;
  ELSE
    -- For non-deal items (credit alerts): dedup on user + item_type + title
    IF EXISTS (
      SELECT 1 FROM command_centre_items
      WHERE user_id = NEW.user_id
        AND item_type = v_item_type
        AND title = v_title
        AND status IN ('open', 'ready', 'enriching')
    ) THEN
      RETURN NEW;
    END IF;
  END IF;

  -- -----------------------------------------------------------------------
  -- 4. Insert CC item
  -- -----------------------------------------------------------------------
  INSERT INTO command_centre_items (
    org_id,
    user_id,
    source_agent,
    source_event_id,
    item_type,
    title,
    summary,
    context,
    urgency,
    deal_id,
    status,
    enrichment_status
  ) VALUES (
    NEW.org_id,
    NEW.user_id,
    'notification-bridge',
    NEW.id,             -- source_event_id = notification UUID for traceability
    v_item_type,
    v_title,
    v_summary,
    jsonb_build_object(
      'notification_id', NEW.id,
      'notification_category', NEW.category,
      'notification_type', NEW.type,
      'notification_metadata', NEW.metadata,
      'action_url', NEW.action_url
    ),
    v_urgency,
    v_deal_id,
    'open',
    'pending'
  );

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Fail-soft: bridge failures must never block the notification insert.
  RAISE WARNING '[notification-bridge] failed to create CC item: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION bridge_notification_to_cc IS
  'AFTER INSERT trigger on notifications. Converts actionable notifications '
  '(high-value deals, deal closures, credit alerts) into command_centre_items '
  'for enrichment and prioritisation by the CC pipeline.';

-- =============================================================================
-- TRIGGER: attach to notifications table
-- =============================================================================

DROP TRIGGER IF EXISTS trg_notification_bridge_to_cc ON notifications;
DROP TRIGGER IF EXISTS trg_notification_bridge_to_cc ON notifications;
CREATE TRIGGER trg_notification_bridge_to_cc
  AFTER INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION bridge_notification_to_cc();

-- =============================================================================
-- INDEX: speed up dedup lookups
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_cc_source_event
  ON command_centre_items (source_event_id)
  WHERE source_event_id IS NOT NULL;

-- =============================================================================
-- BACKFILL: Convert existing actionable notifications into CC items.
-- Uses NOT EXISTS on source_event_id to prevent duplicates on re-run.
-- =============================================================================

WITH actionable AS (
  SELECT
    n.id AS notification_id,
    n.org_id,
    n.user_id,
    n.category,
    n.type,
    n.metadata,
    n.action_url,
    -- Classify the notification
    CASE
      WHEN n.category = 'system' AND n.metadata ->> 'notification_type' = 'credit_exhausted'
        THEN 'alert'
      WHEN n.category = 'system' AND n.metadata ->> 'notification_type' = 'credit_low_balance'
        THEN 'alert'
      WHEN n.category = 'deal' AND (n.metadata ->> 'is_won')::BOOLEAN = FALSE
        THEN 'deal_action'
      WHEN n.category = 'deal' AND (n.metadata ->> 'is_won')::BOOLEAN = TRUE
        THEN 'deal_action'
      WHEN n.category = 'deal' AND n.type = 'success'
           AND (n.metadata ->> 'deal_value')::NUMERIC >= 50000
           AND n.metadata ->> 'is_won' IS NULL
        THEN 'deal_action'
    END AS cc_item_type,
    CASE
      WHEN n.category = 'system' AND n.metadata ->> 'notification_type' = 'credit_exhausted'
        THEN 'critical'
      WHEN n.category = 'system' AND n.metadata ->> 'notification_type' = 'credit_low_balance'
        THEN 'high'
      WHEN n.category = 'deal' AND (n.metadata ->> 'is_won')::BOOLEAN = FALSE
        THEN 'high'
      WHEN n.category = 'deal' AND (n.metadata ->> 'is_won')::BOOLEAN = TRUE
        THEN 'normal'
      WHEN n.category = 'deal' AND n.type = 'success'
           AND (n.metadata ->> 'deal_value')::NUMERIC >= 50000
        THEN 'high'
    END AS cc_urgency,
    n.title AS cc_title,
    n.message AS cc_summary,
    (n.metadata ->> 'deal_id')::UUID AS deal_id
  FROM notifications n
  WHERE n.org_id IS NOT NULL
    AND (
      -- Credit alerts
      (n.category = 'system' AND n.metadata ->> 'notification_type' IN ('credit_exhausted', 'credit_low_balance'))
      -- Deal closures
      OR (n.category = 'deal' AND n.metadata ->> 'is_won' IS NOT NULL)
      -- High-value deal created
      OR (n.category = 'deal' AND n.type = 'success'
          AND (n.metadata ->> 'deal_value')::NUMERIC >= 50000
          AND n.metadata ->> 'is_won' IS NULL)
    )
    -- Dedup: skip if already bridged
    AND NOT EXISTS (
      SELECT 1 FROM command_centre_items cci
      WHERE cci.source_event_id = n.id
    )
)
INSERT INTO command_centre_items (
  org_id, user_id, source_agent, source_event_id,
  item_type, title, summary, context, urgency, deal_id,
  status, enrichment_status
)
SELECT
  a.org_id,
  a.user_id,
  'notification-bridge',
  a.notification_id,
  a.cc_item_type,
  a.cc_title,
  a.cc_summary,
  jsonb_build_object(
    'notification_id', a.notification_id,
    'notification_category', a.category,
    'notification_type', a.type,
    'notification_metadata', a.metadata,
    'action_url', a.action_url,
    'backfilled', TRUE
  ),
  a.cc_urgency,
  a.deal_id,
  'open',
  'pending'
FROM actionable a
WHERE a.cc_item_type IS NOT NULL;

-- =============================================================================
-- Verification
-- =============================================================================

DO $$
DECLARE
  v_backfilled INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_backfilled
  FROM command_centre_items
  WHERE source_agent = 'notification-bridge';

  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260303200000_notification_bridge_to_cc.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Trigger function:';
  RAISE NOTICE '  bridge_notification_to_cc — converts actionable notifications to CC items';
  RAISE NOTICE '';
  RAISE NOTICE 'Patterns:';
  RAISE NOTICE '  A. credit_exhausted   -> alert / critical';
  RAISE NOTICE '  B. credit_low_balance -> alert / high';
  RAISE NOTICE '  C. deal closed lost   -> deal_action / high';
  RAISE NOTICE '  D. deal closed won    -> deal_action / normal';
  RAISE NOTICE '  E. high-value deal    -> deal_action / high';
  RAISE NOTICE '';
  RAISE NOTICE 'Backfill: % existing notifications converted to CC items', v_backfilled;
  RAISE NOTICE '';
  RAISE NOTICE 'Index: idx_cc_source_event (source_event_id lookups)';
  RAISE NOTICE '============================================================================';
END $$;
