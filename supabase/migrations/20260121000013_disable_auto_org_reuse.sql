-- Migration: Disable aggressive auto-organization reuse
-- Problem: find_similar_org_name() causes new users to be added to existing orgs with similar names
-- Example: User A signs up with "Test Company", User B signs up with "Test Company" -> both in same org!
--
-- Solution: Remove the reuse logic and always create fresh organizations for new users
-- Users can still manually invite others or accept invitations to join existing orgs

-- 1. Drop the trigger that causes reuse
DROP TRIGGER IF EXISTS trigger_auto_org_for_new_user ON profiles;

-- 2. Drop the problematic find_similar_org_name function
DROP FUNCTION IF EXISTS find_similar_org_name(text);

-- 3. Recreate auto_create_org_for_new_user WITHOUT the reuse check
CREATE OR REPLACE FUNCTION "public"."auto_create_org_for_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_org_id UUID;
  v_org_name TEXT;
  v_user_email TEXT;
  v_waitlist_company_name TEXT;
BEGIN
  -- Check if user already has an organization membership
  IF EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE user_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  -- Get user's email from auth.users or profile
  SELECT COALESCE(au.email, NEW.email) INTO v_user_email
  FROM auth.users au
  WHERE au.id = NEW.id;

  -- Fallback to profile email if auth.users lookup fails
  IF v_user_email IS NULL THEN
    v_user_email := NEW.email;
  END IF;

  -- Try to get company_name from waitlist entry by email (user_id might not be linked yet)
  -- Check both by user_id (if already linked) and by email (for new signups)
  SELECT company_name INTO v_waitlist_company_name
  FROM meetings_waitlist
  WHERE (user_id = NEW.id OR LOWER(email) = LOWER(v_user_email))
    AND company_name IS NOT NULL
    AND TRIM(company_name) != ''
  ORDER BY
    CASE WHEN user_id = NEW.id THEN 1 ELSE 2 END, -- Prefer linked entries
    created_at ASC
  LIMIT 1;

  -- Determine organization name
  IF v_waitlist_company_name IS NOT NULL AND LENGTH(TRIM(v_waitlist_company_name)) > 0 THEN
    -- Use company name from waitlist
    v_org_name := normalize_org_name(v_waitlist_company_name);
  ELSIF (NEW.first_name IS NOT NULL AND LENGTH(TRIM(NEW.first_name)) > 0) OR
        (NEW.last_name IS NOT NULL AND LENGTH(TRIM(NEW.last_name)) > 0) THEN
    -- Fallback to user's name
    v_org_name := TRIM(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, '')) || '''s Organization';
  ELSIF v_user_email IS NOT NULL AND v_user_email LIKE '%@%' THEN
    -- Fallback to email domain
    v_org_name := INITCAP(SPLIT_PART(SPLIT_PART(v_user_email, '@', 2), '.', 1));
  ELSE
    v_org_name := 'My Organization';
  END IF;

  -- Clean up the name
  v_org_name := TRIM(v_org_name);
  IF v_org_name = '''s Organization' OR v_org_name = '' THEN
    v_org_name := 'My Organization';
  END IF;

  -- ALWAYS create a new organization (no reuse check)
  -- This prevents users with similar company names from being added to the same org
  INSERT INTO organizations (name, created_by, is_active, created_at, updated_at)
  VALUES (v_org_name, NEW.id, true, NOW(), NOW())
  RETURNING id INTO v_org_id;

  -- Add user as owner of the organization
  INSERT INTO organization_memberships (org_id, user_id, role, created_at, updated_at)
  VALUES (v_org_id, NEW.id, 'owner', NOW(), NOW());

  RAISE NOTICE 'Created new organization "%" (id: %) for user %', v_org_name, v_org_id, NEW.id;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail signup
    RAISE WARNING 'Failed to create organization for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- 4. Update function comment
COMMENT ON FUNCTION "public"."auto_create_org_for_new_user"() IS 'Automatically creates a fresh organization for each new user. Does NOT reuse existing orgs based on name matching - prevents users from being accidentally added to existing organizations.';

-- 5. Recreate the trigger
CREATE TRIGGER trigger_auto_org_for_new_user
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_org_for_new_user();
