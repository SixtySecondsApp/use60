-- Migration: Add profile status sync trigger
-- Ensures profile_status stays in sync with join request status

-- Trigger to keep profile_status in sync with join request status
CREATE OR REPLACE FUNCTION sync_profile_status_from_join_request()
RETURNS TRIGGER AS $$
BEGIN
  -- When join request is approved, set profile to active
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    UPDATE profiles
    SET profile_status = 'active'
    WHERE id = NEW.user_id;

    RAISE NOTICE 'Profile status updated to active for user %', NEW.user_id;
  END IF;

  -- When join request is rejected, set profile to rejected
  IF NEW.status = 'rejected' AND (OLD.status IS NULL OR OLD.status != 'rejected') THEN
    UPDATE profiles
    SET profile_status = 'rejected'
    WHERE id = NEW.user_id;

    RAISE NOTICE 'Profile status updated to rejected for user %', NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_sync_profile_status ON organization_join_requests;

-- Create trigger
CREATE TRIGGER trigger_sync_profile_status
  AFTER UPDATE OF status ON organization_join_requests
  FOR EACH ROW
  EXECUTE FUNCTION sync_profile_status_from_join_request();
