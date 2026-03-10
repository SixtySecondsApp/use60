-- Migration: NOTIF-005 — Add dedup guard to deal notification DB triggers
-- Description: Prevents duplicate notifications during bulk deal imports by adding
--   1. Per-deal dedup: skip if same deal was already notified within the last hour
--   2. Per-org rate limit: max 10 deal notifications per org per minute
-- Replaces trigger functions from 20260205000005_deal_notifications.sql
-- Safe: uses CREATE OR REPLACE FUNCTION — no trigger recreation needed.

-- ========================================
-- TRIGGER 1: High-Value Deal Created (with dedup)
-- ========================================

CREATE OR REPLACE FUNCTION notify_on_high_value_deal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_threshold NUMERIC := 50000; -- $50k default threshold
  v_org_id UUID;
  v_owner_name TEXT;
  v_recent_count INTEGER;
BEGIN
  -- Get org_id from the deal owner's membership
  SELECT org_id INTO v_org_id
  FROM organization_memberships
  WHERE user_id = NEW.owner_id
    AND member_status = 'active'
  LIMIT 1;

  -- Only proceed if we found an org and deal value exceeds threshold
  IF v_org_id IS NOT NULL AND NEW.value >= v_threshold THEN

    -- Dedup: skip if this deal was already notified within the last hour
    PERFORM 1 FROM notifications
    WHERE category = 'deal'
      AND metadata->>'deal_id' = NEW.id::text
      AND created_at > NOW() - INTERVAL '1 hour'
    LIMIT 1;

    IF FOUND THEN
      RETURN NEW; -- Skip, already notified
    END IF;

    -- Rate limit: max 10 deal notifications per org per minute
    SELECT COUNT(*) INTO v_recent_count
    FROM notifications
    WHERE category = 'deal'
      AND metadata->>'org_id' = v_org_id::text
      AND created_at > NOW() - INTERVAL '1 minute';

    IF v_recent_count >= 10 THEN
      RETURN NEW; -- Rate limited
    END IF;

    -- Get owner name
    SELECT COALESCE(NULLIF(trim(first_name || ' ' || last_name), ''), email) INTO v_owner_name FROM profiles WHERE id = NEW.owner_id;

    -- Notify org owners and admins
    PERFORM notify_org_members(
      p_org_id := v_org_id,
      p_role_filter := ARRAY['owner', 'admin'],
      p_title := 'High-Value Deal Created: ' || COALESCE(NEW.name, 'Untitled Deal'),
      p_message := 'A deal worth $' || TO_CHAR(NEW.value, 'FM999,999,999') || ' was created by ' ||
                   COALESCE(v_owner_name, 'a team member'),
      p_type := 'success',
      p_category := 'deal',
      p_action_url := '/deals/' || NEW.id,
      p_metadata := jsonb_build_object(
        'deal_id', NEW.id,
        'deal_name', NEW.name,
        'deal_value', NEW.value,
        'owner_id', NEW.owner_id,
        'owner_name', v_owner_name,
        'stage', NEW.stage,
        'threshold', v_threshold
      ),
      p_is_org_wide := TRUE
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ========================================
-- TRIGGER 2: Deal Closed (Won or Lost) (with dedup)
-- ========================================

CREATE OR REPLACE FUNCTION notify_on_deal_closed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_owner_name TEXT;
  v_is_won BOOLEAN;
  v_recent_count INTEGER;
BEGIN
  -- Only trigger when stage changes TO closed_won or closed_lost
  IF OLD.stage != NEW.stage AND NEW.stage IN ('closed_won', 'closed_lost') THEN
    v_is_won := (NEW.stage = 'closed_won');

    -- Get org_id from the deal owner's membership
    SELECT org_id INTO v_org_id
    FROM organization_memberships
    WHERE user_id = NEW.owner_id
      AND member_status = 'active'
    LIMIT 1;

    IF v_org_id IS NOT NULL THEN

      -- Dedup: skip if this deal+stage was already notified within the last hour
      PERFORM 1 FROM notifications
      WHERE category = 'deal'
        AND metadata->>'deal_id' = NEW.id::text
        AND metadata->>'new_stage' = NEW.stage
        AND created_at > NOW() - INTERVAL '1 hour'
      LIMIT 1;

      IF FOUND THEN
        RETURN NEW; -- Skip, already notified
      END IF;

      -- Rate limit: max 10 deal notifications per org per minute
      SELECT COUNT(*) INTO v_recent_count
      FROM notifications
      WHERE category = 'deal'
        AND metadata->>'org_id' = v_org_id::text
        AND created_at > NOW() - INTERVAL '1 minute';

      IF v_recent_count >= 10 THEN
        RETURN NEW; -- Rate limited
      END IF;

      -- Get owner name
      SELECT COALESCE(NULLIF(trim(first_name || ' ' || last_name), ''), email) INTO v_owner_name FROM profiles WHERE id = NEW.owner_id;

      -- Notify org owners and admins
      PERFORM notify_org_members(
        p_org_id := v_org_id,
        p_role_filter := ARRAY['owner', 'admin'],
        p_title := CASE
          WHEN v_is_won THEN '🎉 Deal Won: ' || COALESCE(NEW.name, 'Untitled Deal')
          ELSE 'Deal Lost: ' || COALESCE(NEW.name, 'Untitled Deal')
        END,
        p_message := 'Deal worth $' || TO_CHAR(COALESCE(NEW.value, 0), 'FM999,999,999') ||
                     ' was ' || CASE WHEN v_is_won THEN 'won' ELSE 'lost' END || ' by ' ||
                     COALESCE(v_owner_name, 'a team member'),
        p_type := CASE WHEN v_is_won THEN 'success' ELSE 'warning' END,
        p_category := 'deal',
        p_action_url := '/deals/' || NEW.id,
        p_metadata := jsonb_build_object(
          'deal_id', NEW.id,
          'deal_name', NEW.name,
          'deal_value', NEW.value,
          'owner_id', NEW.owner_id,
          'owner_name', v_owner_name,
          'old_stage', OLD.stage,
          'new_stage', NEW.stage,
          'is_won', v_is_won
        ),
        p_is_org_wide := TRUE
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ========================================
-- Updated comments
-- ========================================

COMMENT ON FUNCTION notify_on_high_value_deal IS
'Trigger function: Notifies org owners/admins when a deal with value >= $50k is created. Includes 1-hour dedup and 10/min/org rate limit.';

COMMENT ON FUNCTION notify_on_deal_closed IS
'Trigger function: Notifies org owners/admins when a deal is marked as won or lost. Includes 1-hour dedup (per deal+stage) and 10/min/org rate limit.';

-- ========================================
-- Verification
-- ========================================

DO $$
BEGIN
  RAISE NOTICE 'NOTIF-005: Deal notification dedup guards applied:';
  RAISE NOTICE '  - notify_on_high_value_deal: 1h dedup + 10/min/org rate limit';
  RAISE NOTICE '  - notify_on_deal_closed: 1h dedup (deal+stage) + 10/min/org rate limit';
END $$;
