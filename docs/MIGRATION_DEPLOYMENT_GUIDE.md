# Migration Deployment Guide

The database migrations have been successfully created, but need to be applied to the remote Supabase database.

## Status
- ✅ Edge function deployed: `sync-profile-names`
- ⏳ Pending: Database migrations
  - `20260121000013_disable_auto_org_reuse.sql`
  - `20260121000014_auto_cleanup_empty_orgs.sql`

## Why Manual Deployment?

The Supabase CLI (`supabase db push`) detected that migrations 20260121000003 through 20260121000011 have already been applied to the remote database. Rather than attempting to reapply them and causing conflicts, we'll apply just the two new migrations directly via the Supabase dashboard.

## How to Deploy

### Option 1: Supabase Dashboard (Recommended) ⭐

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project: `ygdpgliavpxeugaajgrb`
3. Navigate to: **SQL Editor** (left sidebar)
4. Click **New Query**

### Migration 1: Disable Auto-Organization Reuse

Copy the contents of `supabase/migrations/20260121000013_disable_auto_org_reuse.sql` and paste into the SQL Editor:

```sql
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
```

Then click **Run** to execute.

### Migration 2: Auto-Cleanup Empty Organizations

Create a new SQL query and paste:

```sql
-- Migration: Auto-cleanup empty organizations
-- Problem: When the last member leaves an organization, the empty org remains in database
-- Solution: Automatically delete organizations when they have no members

-- 1. Function to cleanup empty organizations after membership deletion
CREATE OR REPLACE FUNCTION cleanup_empty_organizations()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if the organization now has zero members
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE org_id = OLD.org_id
  ) THEN
    -- Delete the empty organization
    DELETE FROM organizations
    WHERE id = OLD.org_id;

    RAISE NOTICE 'Deleted empty organization: %', OLD.org_id;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Trigger to run cleanup after membership deletion
DROP TRIGGER IF EXISTS trigger_cleanup_empty_orgs ON organization_memberships;
CREATE TRIGGER trigger_cleanup_empty_orgs
  AFTER DELETE ON organization_memberships
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_empty_organizations();

-- 3. Manual cleanup function for existing empty organizations
CREATE OR REPLACE FUNCTION cleanup_existing_empty_orgs()
RETURNS TABLE (
  deleted_org_id uuid,
  org_name text
) AS $$
BEGIN
  RETURN QUERY
  DELETE FROM organizations
  WHERE id IN (
    SELECT o.id
    FROM organizations o
    LEFT JOIN organization_memberships om ON o.id = om.org_id
    WHERE om.org_id IS NULL  -- No memberships
  )
  RETURNING id, name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Add comments
COMMENT ON FUNCTION cleanup_empty_organizations() IS 'Automatically deletes an organization when its last member is removed. Runs as trigger on membership deletion.';

COMMENT ON FUNCTION cleanup_existing_empty_orgs() IS 'Manual function to clean up historical empty organizations that no longer have any members. Can be called explicitly with: SELECT cleanup_existing_empty_orgs();';
```

Then click **Run** to execute.

### Verify Deployment

After running both SQL queries, verify they executed successfully by:

1. In the SQL Editor, run a test query:
```sql
-- Check if the trigger exists
SELECT proname FROM pg_proc WHERE proname = 'cleanup_empty_organizations';

-- Check if function exists
SELECT proname FROM pg_proc WHERE proname = 'auto_create_org_for_new_user';
```

You should see both functions returned.

---

## Option 2: Using PostgreSQL CLI

If you prefer to use `psql` directly:

```bash
# Get your database connection string from Supabase dashboard
# (Settings → Database → Connection pooler → PostgreSQL)

psql "postgres://postgres:[PASSWORD]@[HOST]:5432/postgres" < supabase/migrations/20260121000013_disable_auto_org_reuse.sql

psql "postgres://postgres:[PASSWORD]@[HOST]:5432/postgres" < supabase/migrations/20260121000014_auto_cleanup_empty_orgs.sql
```

---

## ✅ Deployment Complete Checklist

After applying the migrations:

- [ ] Migration 1 executed successfully in SQL Editor
- [ ] Migration 2 executed successfully in SQL Editor
- [ ] Verification queries show both functions exist
- [ ] No error messages in SQL Editor output
- [ ] Ready to proceed with testing

---

## Next Steps

Once migrations are deployed, proceed with testing:

1. **Test Phase 1**: Name validation
   - Try entering special characters in signup form
   - Verify error messages appear

2. **Test Phase 2**: Organization assignment
   - Sign up as 2 users with same company name
   - Verify they're in separate organizations

3. **Test Phase 3**: Profile names display
   - Complete signup flow
   - Navigate to team members page
   - Verify full names display (not "Unknown User")

4. **Test Phase 4**: Empty org cleanup
   - Create org with 2 members
   - Remove both members
   - Verify org is auto-deleted

5. **Test Phase 5**: Organization switching
   - Sign up (auto-creates org1)
   - Complete onboarding (creates org2)
   - Verify user only in org2, org1 deleted

6. **Test Phase 6**: End-to-end flow
   - Run complete signup → onboarding → dashboard flow
   - Verify no errors or hangs

---

## Troubleshooting

If you encounter errors:

1. **Duplicate key error (SQLSTATE 23505)**
   - This means the migration was already partially applied
   - Check the `supabase_migrations_schema_migrations` table
   - You may only need to apply parts of the migration

2. **Function already exists error**
   - The `CREATE OR REPLACE` syntax should handle this
   - If you still get an error, use `DROP FUNCTION IF EXISTS` first

3. **Trigger already exists error**
   - Same solution: use `DROP TRIGGER IF EXISTS` as shown in the migrations

For more help, check the [Supabase documentation](https://supabase.com/docs/guides/database/migrations).
