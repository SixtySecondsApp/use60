-- Migration: Add deal notification triggers
-- Story: ORG-NOTIF-005
-- Description: Notify org owners/admins about high-value deals and deal closures

-- ========================================
-- TRIGGER 1: High-Value Deal Created
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
BEGIN
  -- Get org_id from the deal owner's membership
  SELECT org_id INTO v_org_id
  FROM organization_memberships
  WHERE user_id = NEW.owner_id
    AND member_status = 'active'
  LIMIT 1;

  -- Only proceed if we found an org and deal value exceeds threshold
  IF v_org_id IS NOT NULL AND NEW.value >= v_threshold THEN
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

DROP TRIGGER IF EXISTS high_value_deal_notification ON deals;
CREATE TRIGGER high_value_deal_notification
  AFTER INSERT ON deals
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_high_value_deal();

-- ========================================
-- TRIGGER 2: Deal Closed (Won or Lost)
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

DROP TRIGGER IF EXISTS deal_closed_notification ON deals;
CREATE TRIGGER deal_closed_notification
  AFTER UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_deal_closed();

-- ========================================
-- Add comments for documentation
-- ========================================

COMMENT ON FUNCTION notify_on_high_value_deal IS
'Trigger function: Notifies org owners/admins when a deal with value >= $50k is created.';

COMMENT ON FUNCTION notify_on_deal_closed IS
'Trigger function: Notifies org owners/admins when a deal is marked as won or lost.';

-- ========================================
-- Verification
-- ========================================

DO $$
BEGIN
  RAISE NOTICE 'Deal notification triggers created:';
  RAISE NOTICE '  ✓ high_value_deal_notification trigger';
  RAISE NOTICE '  ✓ deal_closed_notification trigger';
  RAISE NOTICE '';
  RAISE NOTICE 'Admins/owners will be notified when:';
  RAISE NOTICE '  - A deal worth $50,000 or more is created';
  RAISE NOTICE '  - Any deal is marked as won or lost';
END $$;
