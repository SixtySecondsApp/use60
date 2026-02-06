# Deploy Staging Migrations - Organization Member Visibility Fix

## Summary

Two critical migrations need to be applied to your Supabase staging environment to fix the organization member count and owner display bug.

**Environment**: Staging (caerqjzvuerejfrdtygb)

## Deployment Method

Choose one of the options below:

### Option 1: Supabase Dashboard SQL Editor (Recommended)

1. Go to [Supabase Dashboard](https://app.supabase.com/projects/caerqjzvuerejfrdtygb/sql/new)
2. Click **SQL Editor** (left sidebar)
3. Click **+ New Query**
4. Copy and paste the SQL below into the editor
5. Click **Execute**
6. Verify success message appears

### Option 2: Supabase CLI

```bash
cd /c/Users/Media\ 3/Desktop/Max-Projects/sixty-sales-dashboard
SUPABASE_ACCESS_TOKEN=sbp_8e5eef8735fc3f15ed2544a5ad9508a902f2565f npx supabase db push --linked
```

---

## SQL Migrations to Apply

### Migration 1: Create app_auth.is_admin() function

**File**: `supabase/migrations/20260205170000_fix_organization_memberships_rls_policy.sql`

```sql
-- Create app_auth schema and is_admin function
CREATE SCHEMA IF NOT EXISTS app_auth;

CREATE OR REPLACE FUNCTION app_auth.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND is_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- Update RLS policy
DROP POLICY IF EXISTS "organization_memberships_select" ON "public"."organization_memberships";

CREATE POLICY "organization_memberships_select" ON "public"."organization_memberships"
FOR SELECT
USING (
  "public"."is_service_role"()
  OR "app_auth"."is_admin"()
  OR ("public"."get_org_role"("auth"."uid"(), "org_id") = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text", 'readonly'::"text"]))
  OR ("user_id" = "auth"."uid"())
);

COMMENT ON POLICY "organization_memberships_select" ON "public"."organization_memberships" IS
'SELECT policy for organization_memberships:
 - Service role and platform admins can view all memberships
 - Users who are members of the org (in any role) can view all members
 - Users can view their own membership record';
```

### Migration 2: Fix member visibility RLS policy

**File**: `supabase/migrations/20260205180000_fix_organization_member_visibility.sql`

```sql
-- Fix RLS policy to use IS NOT NULL instead of = ANY
DROP POLICY IF EXISTS "organization_memberships_select" ON "public"."organization_memberships";

CREATE POLICY "organization_memberships_select" ON "public"."organization_memberships"
FOR SELECT
USING (
  "public"."is_service_role"()
  OR "app_auth"."is_admin"()
  OR ("public"."get_org_role"("auth"."uid"(), "org_id") IS NOT NULL)
  OR ("user_id" = "auth"."uid"())
);

COMMENT ON POLICY "organization_memberships_select" ON "public"."organization_memberships" IS
'SELECT policy for organization_memberships:
 Rules for viewing membership data:
 1. Service role can view all (edge functions, backend)
 2. Platform admins (is_admin=true) can view all
 3. Users who are members of an org (ANY role) can see all members of that org
 4. Users can always see their own membership record

 Security model: An organization''s member list is private to members.
 Only people already in the organization can see who else is in it.
 This is enforced at the RLS level.';
```

---

## What Gets Fixed

✅ **Member counts display correctly** for organizations you own or are a member of
✅ **Owner information displays** for all accessible organizations
✅ **Platform admins can see** all organization member data
✅ **Security maintained** - Non-members still can't see org member lists

---

## Verification

After applying the migrations:

1. Refresh your staging app: https://localhost:5175
2. Go to Organizations admin page
3. Verify:
   - **Testing Software**: Shows 1 member, owner name displays
   - **Sixty Seconds**: Shows 3 members, owner name displays
   - Other orgs: Show correct counts (or empty if you're not a member)

---

## Connection Details

- **Project URL**: https://caerqjzvuerejfrdtygb.supabase.co
- **Project ID**: caerqjzvuerejfrdtygb
- **Database**: PostgreSQL

---

## Troubleshooting

### Error: "Permission denied for app_auth"

This is expected if you're not a superuser. The migrations should still work.

### Error: "Policy already exists"

The `DROP POLICY IF EXISTS` statement handles this. Run the full migration anyway.

### Member counts still show 0

Make sure both migrations were applied successfully. Check the SQL Editor execution results.

---

## Related Commits

- **e2d93b19**: fix: Resolve organization member visibility in RLS policy
- **7a1cbbc2**: fix: Resolve organization member count display bug
- **a6d71041**: fix: Resolve organization membership state inconsistency bug

---

## Questions?

Refer to `.sixty/bugs/organization-member-visibility-rls-fix.md` for the complete technical analysis of the bug and fix.
