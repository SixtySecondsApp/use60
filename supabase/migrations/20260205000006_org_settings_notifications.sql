-- Migration: Add organization settings change notification trigger
-- Story: ORG-NOTIF-007
-- Description: Notify admins/owners when organization settings are modified

-- ========================================
-- TRIGGER: Organization Settings Changed
-- ========================================

CREATE OR REPLACE FUNCTION notify_on_org_settings_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actioned_by_name TEXT;
  v_change_description TEXT;
BEGIN
  -- Only trigger if key settings have changed
  IF OLD.name != NEW.name OR
     OLD.logo_url != NEW.logo_url OR
     OLD.notification_settings != NEW.notification_settings OR
     OLD.company_domain != NEW.company_domain THEN

    -- Get name of person who made the change
    SELECT full_name INTO v_actioned_by_name FROM profiles WHERE id = auth.uid();

    -- Build change description
    v_change_description := CASE
      WHEN OLD.name != NEW.name THEN
        'Organization name changed to "' || NEW.name || '"'
      WHEN OLD.logo_url != NEW.logo_url THEN
        'Organization logo updated'
      WHEN OLD.company_domain != NEW.company_domain THEN
        'Organization domain changed to "' || COALESCE(NEW.company_domain, 'none') || '"'
      ELSE
        'Notification settings updated'
    END;

    -- Add who made the change if known
    IF v_actioned_by_name IS NOT NULL THEN
      v_change_description := v_change_description || ' by ' || v_actioned_by_name;
    END IF;

    -- Notify org owners and admins
    PERFORM notify_org_members(
      p_org_id := NEW.id,
      p_role_filter := ARRAY['owner', 'admin'],
      p_title := 'Organization Settings Updated',
      p_message := v_change_description,
      p_type := 'info',
      p_category := 'system',
      p_action_url := '/settings/organization-management',
      p_metadata := jsonb_build_object(
        'org_id', NEW.id,
        'org_name', NEW.name,
        'changed_by', auth.uid(),
        'changed_by_name', v_actioned_by_name,
        'action_timestamp', NOW(),
        'changes', jsonb_build_object(
          'name_changed', (OLD.name != NEW.name),
          'old_name', OLD.name,
          'new_name', NEW.name,
          'logo_changed', (OLD.logo_url != NEW.logo_url),
          'domain_changed', (OLD.company_domain != NEW.company_domain),
          'old_domain', OLD.company_domain,
          'new_domain', NEW.company_domain,
          'settings_changed', (OLD.notification_settings != NEW.notification_settings)
        )
      ),
      p_is_org_wide := TRUE
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS org_settings_changed_notification ON organizations;
CREATE TRIGGER org_settings_changed_notification
  AFTER UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_org_settings_changed();

-- ========================================
-- Add comment for documentation
-- ========================================

COMMENT ON FUNCTION notify_on_org_settings_changed IS
'Trigger function: Notifies org owners/admins when organization settings (name, logo, domain, notification settings) are changed.';

-- ========================================
-- Verification
-- ========================================

DO $$
BEGIN
  RAISE NOTICE 'Organization settings notification trigger created:';
  RAISE NOTICE '  ✓ org_settings_changed_notification trigger';
  RAISE NOTICE '';
  RAISE NOTICE 'Admins/owners will be notified when:';
  RAISE NOTICE '  - Organization name changes';
  RAISE NOTICE '  - Organization logo changes';
  RAISE NOTICE '  - Organization domain changes';
  RAISE NOTICE '  - Notification settings change';
END $$;
