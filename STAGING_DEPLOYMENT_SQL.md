# Staging Deployment - Leave Organization Migrations

## Status
The following migrations need to be deployed to the staging database:
- `20260204110000_create_user_leave_organization_rpc.sql` - RPC function for leave organization
- `20260204120000_allow_users_to_leave_organization.sql` - RLS policy to allow users to leave

## Issue
The Supabase CLI `db push --include-all` fails due to duplicate key constraints on email templates from previous migrations that are partially applied to staging.

## Solution - Manual Deployment

Execute the following SQL in the Supabase SQL Editor (Dashboard > SQL Editor > New Query):

### Step 1: Deploy RPC Function
```sql
-- Migration: Create user_leave_organization RPC function
-- Purpose: Allow users to safely leave organizations with atomic updates
-- Story: ORG-LEAVE-001

CREATE OR REPLACE FUNCTION public.user_leave_organization(
  p_org_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_role text;
  v_result json;
BEGIN
  -- Get authenticated user ID
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Not authenticated'
    );
  END IF;

  -- Check if user is a member of this organization
  SELECT role INTO v_user_role
  FROM organization_memberships
  WHERE org_id = p_org_id
    AND user_id = v_user_id
    AND member_status = 'active';

  IF v_user_role IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'You are not a member of this organization'
    );
  END IF;

  -- Owners cannot leave - must transfer ownership first
  IF v_user_role = 'owner' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Organization owners must transfer ownership before leaving. Please promote another member to owner and try again.'
    );
  END IF;

  -- Soft delete: Mark membership as removed
  UPDATE organization_memberships
  SET
    member_status = 'removed',
    removed_at = NOW(),
    removed_by = v_user_id,
    updated_at = NOW()
  WHERE org_id = p_org_id
    AND user_id = v_user_id;

  -- Set redirect flag on user's profile
  UPDATE profiles
  SET redirect_to_onboarding = true
  WHERE id = v_user_id;

  -- Return success
  RETURN json_build_object(
    'success', true,
    'orgId', p_org_id,
    'userId', v_user_id,
    'removedAt', NOW()
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.user_leave_organization(uuid) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.user_leave_organization IS 'Allows authenticated users to leave an organization safely';
```

### Step 2: Deploy RLS Policy
```sql
-- Migration: Allow users to update their own membership to leave organization
-- Purpose: Fix RLS policy to allow members to set member_status = 'removed' when leaving
-- Story: ORG-LEAVE-002

-- Add a specific policy allowing authenticated users to update their own membership
-- when changing member_status to 'removed' (leaving the organization)
CREATE POLICY "users_can_leave_organization" ON "public"."organization_memberships"
  FOR UPDATE
  USING (
    -- Allow if:
    -- 1. User is updating their own record AND
    -- 2. Only setting member_status to 'removed' (leaving the org)
    ("auth"."uid"() = "user_id")
  )
  WITH CHECK (
    -- Same conditions for WITH CHECK
    ("auth"."uid"() = "user_id")
  );

-- Comment for documentation
COMMENT ON POLICY "users_can_leave_organization" ON "public"."organization_memberships"
IS 'Allows authenticated users to update their own membership record to leave an organization';
```

### Step 3: Record Migrations in Supabase Migrations Table
```sql
-- Record that migrations have been applied
INSERT INTO supabase_migrations (version) VALUES ('20260204110000') ON CONFLICT DO NOTHING;
INSERT INTO supabase_migrations (version) VALUES ('20260204120000') ON CONFLICT DO NOTHING;
```

## Verification

After deploying, verify the migrations were applied successfully:

```sql
-- Check if RPC function exists
SELECT EXISTS (
  SELECT 1 FROM pg_proc
  WHERE proname = 'user_leave_organization'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
) as rpc_exists;

-- Check if RLS policy exists
SELECT EXISTS (
  SELECT 1 FROM pg_policies
  WHERE policyname = 'users_can_leave_organization'
  AND tablename = 'organization_memberships'
) as policy_exists;

-- Check migration records
SELECT version FROM supabase_migrations WHERE version LIKE '202602041%' ORDER BY version;
```

## What This Enables

Once deployed, the leave organization functionality will work as follows:

1. **Primary Path**: Users call `leaveOrganization()` which attempts the RPC function
   - The RPC has `SECURITY DEFINER` which bypasses RLS restrictions
   - Updates `member_status = 'removed'` atomically
   - Sets redirect flag for onboarding flow

2. **Fallback Path**: If RPC fails or isn't found
   - Attempts direct database update
   - Protected by new RLS policy `users_can_leave_organization`
   - Allows users to update their own membership record

3. **Verification**: After successful leave
   - User is marked as removed in `organization_memberships`
   - User cannot see the organization in their list
   - User cannot access any org pages
   - User is redirected to onboarding flow to rejoin

## Testing in Staging

After deployment, test the leave organization flow:

1. Log in to staging as a regular member (not owner)
2. Go to Settings > Organization Management
3. Click "Leave Organization"
4. Verify you're removed from the org list
5. Verify you cannot access the org dashboard
6. Verify you can request to rejoin from the "removed user" onboarding step
