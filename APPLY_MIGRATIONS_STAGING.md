# Apply Onboarding Bug Fix Migrations to Staging

## Overview

There are **5 migrations** that need to be applied to the staging database to fix the onboarding bugs.

**Database**: `caerqjzvuerejfrdtygb` (Staging)
**URL**: https://staging.use60.com

---

## Migrations to Apply

### 1. Fix Join Requests RLS Policies
**File**: `supabase/migrations/20260205130000_fix_join_requests_rls_member_status.sql`
**Purpose**: Add `member_status = 'active'` check to RLS policies

### 2. Fix Join Requests RPC Functions
**File**: `supabase/migrations/20260205130100_fix_join_requests_rpc_member_status.sql`
**Purpose**: Update RPC functions to check active member status

### 3. Add Organization Deletion Scheduler
**File**: `supabase/migrations/20260205140000_add_org_deletion_scheduler.sql`
**Purpose**: Scheduled cleanup of inactive organizations

### 4. Add Deactivate Organization RPC
**File**: `supabase/migrations/20260205140100_rpc_deactivate_organization_by_owner.sql`
**Purpose**: Allow owners to deactivate their organizations

### 5. **Fix Fuzzy Matching Active Members** ⭐ (CRITICAL FOR BUG FIX)
**File**: `supabase/migrations/20260205150000_fix_fuzzy_matching_active_members.sql`
**Purpose**: Update `find_similar_organizations_by_domain` to only count active members

---

## Method 1: Via Supabase Dashboard (Recommended)

1. Go to https://supabase.com/dashboard/project/caerqjzvuerejfrdtygb

2. Navigate to: **SQL Editor** → **New Query**

3. **For each migration file**, copy the SQL and run it:

   a. Open the migration file
   b. Copy entire contents
   c. Paste into SQL Editor
   d. Click **Run**
   e. Verify success message

4. Repeat for all 5 migrations **in order**

---

## Method 2: Via psql (If you have PostgreSQL client)

```bash
# Set password
export PGPASSWORD="Gi7JO1tz2NupAzHt"

# Apply each migration
psql -h aws-0-eu-west-1.pooler.supabase.com \
     -p 5432 \
     -U postgres.caerqjzvuerejfrdtygb \
     -d postgres \
     -f supabase/migrations/20260205130000_fix_join_requests_rls_member_status.sql

psql -h aws-0-eu-west-1.pooler.supabase.com \
     -p 5432 \
     -U postgres.caerqjzvuerejfrdtygb \
     -d postgres \
     -f supabase/migrations/20260205130100_fix_join_requests_rpc_member_status.sql

psql -h aws-0-eu-west-1.pooler.supabase.com \
     -p 5432 \
     -U postgres.caerqjzvuerejfrdtygb \
     -d postgres \
     -f supabase/migrations/20260205140000_add_org_deletion_scheduler.sql

psql -h aws-0-eu-west-1.pooler.supabase.com \
     -p 5432 \
     -U postgres.caerqjzvuerejfrdtygb \
     -d postgres \
     -f supabase/migrations/20260205140100_rpc_deactivate_organization_by_owner.sql

psql -h aws-0-eu-west-1.pooler.supabase.com \
     -p 5432 \
     -U postgres.caerqjzvuerejfrdtygb \
     -d postgres \
     -f supabase/migrations/20260205150000_fix_fuzzy_matching_active_members.sql
```

---

## Method 3: Copy/Paste (Quick & Easy)

### Migration 1: Fix RLS Policies

Open SQL Editor and run:

```sql
-- Drop existing policies
DROP POLICY IF EXISTS "org_admins_view_join_requests" ON organization_join_requests;
DROP POLICY IF EXISTS "org_admins_update_join_requests" ON organization_join_requests;

-- Recreate with member_status check
CREATE POLICY "org_admins_view_join_requests"
  ON organization_join_requests
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM organization_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND member_status = 'active'  -- NEW: Only active members
    )
  );

CREATE POLICY "org_admins_update_join_requests"
  ON organization_join_requests
  FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM organization_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND member_status = 'active'  -- NEW: Only active members
    )
  );
```

### Migration 5: Fix Fuzzy Matching (MOST IMPORTANT)

```sql
CREATE OR REPLACE FUNCTION "public"."find_similar_organizations_by_domain"(
  p_search_domain text,
  p_limit int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  name text,
  company_domain text,
  member_count bigint,
  similarity_score float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.company_domain,
    COUNT(om.user_id) as member_count,
    CASE
      WHEN LOWER(o.company_domain) = LOWER(p_search_domain) THEN 1.0
      WHEN LOWER(REPLACE(o.company_domain, 'www.', '')) = LOWER(REPLACE(p_search_domain, 'www.', '')) THEN 0.95
      WHEN LOWER(o.company_domain) LIKE LOWER('%' || p_search_domain || '%') THEN 0.85
      WHEN LOWER(p_search_domain) LIKE LOWER('%' || o.company_domain || '%') THEN 0.85
      ELSE 0.6
    END::float as similarity_score
  FROM organizations o
  LEFT JOIN organization_memberships om ON o.id = om.org_id
    AND om.member_status = 'active'  -- NEW: Only count active members
  WHERE
    o.is_active = true
    AND o.company_domain IS NOT NULL
    AND (
      LOWER(o.company_domain) = LOWER(p_search_domain)
      OR LOWER(REPLACE(o.company_domain, 'www.', '')) = LOWER(REPLACE(p_search_domain, 'www.', ''))
      OR LOWER(o.company_domain) LIKE LOWER('%' || p_search_domain || '%')
      OR LOWER(p_search_domain) LIKE LOWER('%' || o.company_domain || '%')
    )
  GROUP BY o.id, o.name, o.company_domain
  HAVING COUNT(om.user_id) > 0  -- Only show orgs with active members
  ORDER BY similarity_score DESC, member_count DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION find_similar_organizations_by_domain(text, int) IS
'Finds organizations with similar domains using fuzzy matching.
Only returns organizations with at least 1 active member to prevent joining ghost orgs.
Used during onboarding website input step.';

-- Verification
DO $$
BEGIN
  RAISE NOTICE '✅ Updated find_similar_organizations_by_domain to filter active members only';
END $$;
```

---

## Verification

After applying migrations, verify:

```sql
-- Check that the RPC function was updated
SELECT routine_name, routine_definition
FROM information_schema.routines
WHERE routine_name = 'find_similar_organizations_by_domain';

-- Check RLS policies
SELECT policyname, tablename
FROM pg_policies
WHERE tablename = 'organization_join_requests';
```

---

## Testing After Migration

1. **Test onboarding with company website**
   - Should not auto-join (create join request instead)

2. **Test empty org filtering**
   - Organizations with 0 active members should not appear

3. **Test join request flow**
   - Active admins should see join requests
   - Removed admins should NOT see join requests

---

## Troubleshooting

### If migration fails with "already exists"
This is safe - the migration was already applied. Skip to next migration.

### If migration fails with "does not exist"
The object doesn't exist yet. This is expected for DROP statements.

### If you get permission errors
Make sure you're using the service_role key or postgres user in Supabase dashboard.

---

## Files Location

All migration files are in: `supabase/migrations/`

You can copy them from the project folder or read them directly in your code editor.
