-- Fix for personal email organization creation bug
-- Prevents automatic grouping of unrelated users by email domain
-- See: Fix Personal Email Organization Creation Bug
--
-- Changes:
-- 1. Create personal_email_domains table to maintain list of personal providers
-- 2. Add is_personal_email_domain() helper function
-- 3. Update auto_create_org_for_new_user() trigger to skip org creation for personal emails
-- 4. Add RLS policies for personal_email_domains table
--
-- This allows OnboardingV2 to create organizations AFTER collecting proper company info
-- Team collaboration features (manual invitations) remain intact

-- ============================================================================
-- 1. Create personal_email_domains table
-- ============================================================================

CREATE TABLE IF NOT EXISTS "public"."personal_email_domains" (
  "domain" citext PRIMARY KEY,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  CONSTRAINT "personal_email_domains_domain_not_empty" CHECK (domain != '')
);

ALTER TABLE "public"."personal_email_domains" ENABLE ROW LEVEL SECURITY;

-- RLS policy: Public can read (needed for client-side validation)
-- Drop existing policies first if they exist
DROP POLICY IF EXISTS "public_read_personal_email_domains" ON "public"."personal_email_domains";
DROP POLICY IF EXISTS "admin_manage_personal_email_domains" ON "public"."personal_email_domains";

CREATE POLICY "public_read_personal_email_domains"
  ON "public"."personal_email_domains"
  FOR SELECT
  USING (true);

-- RLS policy: Only admins can manage
CREATE POLICY "admin_manage_personal_email_domains"
  ON "public"."personal_email_domains"
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'authenticated' AND EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true
  ));

-- ============================================================================
-- 2. Insert personal email domains into the table
-- ============================================================================

INSERT INTO "public"."personal_email_domains" (domain) VALUES
  ('gmail.com'),
  ('yahoo.com'),
  ('hotmail.com'),
  ('outlook.com'),
  ('icloud.com'),
  ('aol.com'),
  ('protonmail.com'),
  ('proton.me'),
  ('mail.com'),
  ('ymail.com'),
  ('live.com'),
  ('msn.com'),
  ('me.com'),
  ('mac.com')
ON CONFLICT (domain) DO NOTHING;

-- ============================================================================
-- 3. Create is_personal_email_domain() helper function
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."is_personal_email_domain"(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path TO 'public'
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM personal_email_domains
    WHERE domain = LOWER(SPLIT_PART(p_email, '@', 2))
  );
$$;

ALTER FUNCTION "public"."is_personal_email_domain"(TEXT) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."is_personal_email_domain"(TEXT) IS
'Checks if an email address uses a personal email domain (Gmail, Yahoo, etc). Returns true for personal domains, false for corporate/custom domains.';

-- ============================================================================
-- 4. Update auto_create_org_for_new_user() trigger function
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."auto_create_org_for_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_org_id UUID;
  v_org_name TEXT;
  v_user_email TEXT;
  v_waitlist_company_name TEXT;
  v_normalized_name TEXT;
  v_existing_org_id UUID;
  v_is_personal_email BOOLEAN;
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

  -- Check if user's email is a personal email domain
  -- This check happens BEFORE org creation logic
  v_is_personal_email := is_personal_email_domain(v_user_email);

  -- If personal email AND no company name from waitlist, skip org creation
  -- This defers org creation to OnboardingV2 after collecting company info
  IF v_is_personal_email AND (v_waitlist_company_name IS NULL OR TRIM(v_waitlist_company_name) = '') THEN
    RAISE NOTICE 'Skipping org creation for personal email domain: % - deferred to onboarding', v_user_email;
    RETURN NEW;
  END IF;

  -- Determine organization name (only reached if NOT skipping)
  IF v_waitlist_company_name IS NOT NULL AND LENGTH(TRIM(v_waitlist_company_name)) > 0 THEN
    -- Use company name from waitlist
    v_org_name := normalize_org_name(v_waitlist_company_name);
  ELSIF (NEW.first_name IS NOT NULL AND LENGTH(TRIM(NEW.first_name)) > 0) OR
        (NEW.last_name IS NOT NULL AND LENGTH(TRIM(NEW.last_name)) > 0) THEN
    -- Fallback to user's name
    v_org_name := TRIM(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, '')) || '''s Organization';
  ELSIF v_user_email IS NOT NULL AND v_user_email LIKE '%@%' THEN
    -- Fallback to email domain (only for corporate emails, since personal emails are already skipped)
    v_org_name := INITCAP(SPLIT_PART(SPLIT_PART(v_user_email, '@', 2), '.', 1));
  ELSE
    v_org_name := 'My Organization';
  END IF;

  -- Clean up the name
  v_org_name := TRIM(v_org_name);
  IF v_org_name = '''s Organization' OR v_org_name = '' THEN
    v_org_name := 'My Organization';
  END IF;

  -- Normalize the name for comparison
  v_normalized_name := normalize_org_name(v_org_name);

  -- Check if an organization with similar name already exists
  v_existing_org_id := find_similar_org_name(v_normalized_name);

  IF v_existing_org_id IS NOT NULL THEN
    -- Reuse existing organization
    v_org_id := v_existing_org_id;

    -- Add user as member of existing organization (as owner if they're the first member, otherwise as member)
    INSERT INTO organization_memberships (org_id, user_id, role, created_at, updated_at)
    VALUES (
      v_org_id,
      NEW.id,
      CASE WHEN (SELECT COUNT(*) FROM organization_memberships WHERE org_id = v_org_id) = 0 THEN 'owner' ELSE 'member' END,
      NOW(),
      NOW()
    )
    ON CONFLICT (org_id, user_id) DO NOTHING;

    RAISE NOTICE 'User % added to existing organization "%" (id: %)', NEW.id, v_org_name, v_org_id;
  ELSE
    -- Create new organization with normalized name
    INSERT INTO organizations (name, created_by, is_active, created_at, updated_at)
    VALUES (v_org_name, NEW.id, true, NOW(), NOW())
    RETURNING id INTO v_org_id;

    -- Add user as owner of the organization
    INSERT INTO organization_memberships (org_id, user_id, role, created_at, updated_at)
    VALUES (v_org_id, NEW.id, 'owner', NOW(), NOW());

    RAISE NOTICE 'Created organization "%" (id: %) for user %', v_org_name, v_org_id, NEW.id;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail signup
    RAISE WARNING 'Failed to create organization for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."auto_create_org_for_new_user"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."auto_create_org_for_new_user"() IS
'Automatically creates or links user to organization when profile is created.
Skips org creation for personal email domains (Gmail, Yahoo, etc.) - defers to onboarding.
Uses company_name from waitlist if available, normalizes names to prevent duplicates, and reuses similar organization names.
Corporate emails and waitlist users with company names get org created immediately.';
