-- ============================================================================
-- Fix: credit_menu_history trigger — variable scoping error
-- ============================================================================
-- v_event was declared inside a nested DECLARE...BEGIN...END block but
-- referenced OUTSIDE that block in the INSERT statement, causing a runtime
-- error on every UPDATE to credit_menu ("Failed to save price").
--
-- Fix: declare v_event at the function level so it's in scope for the INSERT.

CREATE OR REPLACE FUNCTION log_credit_menu_history()
RETURNS TRIGGER AS $$
DECLARE
  v_event TEXT := 'updated';
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO credit_menu_history
      (action_id, event_type, new_cost_low, new_cost_medium, new_cost_high,
       new_is_active, menu_version, changed_by)
    VALUES
      (NEW.action_id, 'created', NEW.cost_low, NEW.cost_medium, NEW.cost_high,
       NEW.is_active, NEW.menu_version, NEW.updated_by);
  ELSIF TG_OP = 'UPDATE' THEN
    -- Determine event type
    IF OLD.is_active = false AND NEW.is_active = true THEN
      v_event := 'activated';
    ELSIF OLD.is_active = true AND NEW.is_active = false THEN
      v_event := 'deactivated';
    END IF;

    INSERT INTO credit_menu_history
      (action_id, event_type,
       prev_cost_low, prev_cost_medium, prev_cost_high, prev_is_active,
       new_cost_low,  new_cost_medium,  new_cost_high,  new_is_active,
       menu_version, changed_by)
    VALUES
      (NEW.action_id, v_event,
       OLD.cost_low, OLD.cost_medium, OLD.cost_high, OLD.is_active,
       NEW.cost_low, NEW.cost_medium, NEW.cost_high, NEW.is_active,
       NEW.menu_version, NEW.updated_by);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
