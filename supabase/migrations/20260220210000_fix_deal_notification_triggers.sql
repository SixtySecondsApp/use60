-- Fix: deal notification triggers reference non-existent "stage" column
-- The deals table uses stage_id (UUID FK to deal_stages), not a text "stage" column.
-- Both triggers need to JOIN deal_stages to resolve stage names.

-- ========================================
-- FIX 1: notify_on_high_value_deal
-- ========================================

CREATE OR REPLACE FUNCTION notify_on_high_value_deal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_threshold NUMERIC := 50000;
  v_org_id UUID;
  v_owner_name TEXT;
  v_stage_name TEXT;
BEGIN
  SELECT org_id INTO v_org_id
  FROM organization_memberships
  WHERE user_id = NEW.owner_id
    AND member_status = 'active'
  LIMIT 1;

  IF v_org_id IS NOT NULL AND NEW.value >= v_threshold THEN
    SELECT COALESCE(NULLIF(trim(first_name || ' ' || last_name), ''), email)
      INTO v_owner_name FROM profiles WHERE id = NEW.owner_id;

    SELECT name INTO v_stage_name FROM deal_stages WHERE id = NEW.stage_id;

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
        'stage', COALESCE(v_stage_name, 'Unknown'),
        'threshold', v_threshold
      ),
      p_is_org_wide := TRUE
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ========================================
-- FIX 2: notify_on_deal_closed
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
  v_old_stage_name TEXT;
  v_new_stage_name TEXT;
BEGIN
  -- Only trigger when stage_id actually changes
  IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
    -- Look up stage names
    SELECT name INTO v_new_stage_name FROM deal_stages WHERE id = NEW.stage_id;
    SELECT name INTO v_old_stage_name FROM deal_stages WHERE id = OLD.stage_id;

    -- Only proceed for closed stages (case-insensitive, handles various naming)
    IF LOWER(COALESCE(v_new_stage_name, '')) IN ('closed_won', 'closed won', 'signed', 'closed_lost', 'closed lost', 'lost') THEN
      v_is_won := LOWER(v_new_stage_name) IN ('closed_won', 'closed won', 'signed');

      SELECT org_id INTO v_org_id
      FROM organization_memberships
      WHERE user_id = NEW.owner_id
        AND member_status = 'active'
      LIMIT 1;

      IF v_org_id IS NOT NULL THEN
        SELECT COALESCE(NULLIF(trim(first_name || ' ' || last_name), ''), email)
          INTO v_owner_name FROM profiles WHERE id = NEW.owner_id;

        PERFORM notify_org_members(
          p_org_id := v_org_id,
          p_role_filter := ARRAY['owner', 'admin'],
          p_title := CASE
            WHEN v_is_won THEN 'Deal Won: ' || COALESCE(NEW.name, 'Untitled Deal')
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
            'old_stage', COALESCE(v_old_stage_name, 'Unknown'),
            'new_stage', COALESCE(v_new_stage_name, 'Unknown'),
            'is_won', v_is_won
          ),
          p_is_org_wide := TRUE
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
