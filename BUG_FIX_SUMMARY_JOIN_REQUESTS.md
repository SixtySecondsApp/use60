# Bug Fix Summary: Join Request Visibility Issue

**Date**: 2026-02-05
**Status**: ✅ Frontend Complete | ⚠️ Database Migrations Pending Manual Application

---

## 🐛 Root Cause Identified

The `org_admins_view_join_requests` and `org_admins_update_join_requests` RLS policies were created **before** the `member_status` column existed and were **never updated** when soft-delete functionality was added. This caused admins with inactive memberships to see empty results instead of proper error messages.

---

## ✅ Fixes Applied (Frontend)

### 1. Added Logger Import
**File**: `src/pages/settings/OrganizationManagementPage.tsx`
- Added missing `import { logger } from '@/lib/utils/logger'`
- Prevents ReferenceError at runtime

### 2. Added Auto-Refresh to Join Requests Query
**File**: `src/pages/settings/OrganizationManagementPage.tsx`
- Added `refetchInterval: 30000` (30 seconds)
- Matches rejoin requests pattern
- New requests appear automatically without manual refresh

### 3. Improved Error Handling in Service
**File**: `src/lib/services/joinRequestService.ts`
- Added permission pre-check before querying
- Added comprehensive error logging
- Changed to throw errors instead of returning empty arrays
- Clear error messages for permission denials

### 4. Added Error State Display in UI
**File**: `src/pages/settings/JoinRequestsPage.tsx`
- Destructured `error` from useQuery
- Added error message UI with red styling
- Distinguished error state from empty state
- User sees "Failed to load join requests: [reason]" instead of "No pending requests"

---

## ⚠️ Database Migrations - Manual Application Required

The automated `supabase db push` encountered migration history conflicts. Please apply these SQL statements manually via the Supabase Dashboard.

### Migration 1: Fix RLS Policies (CRITICAL)

**Location**: `supabase/migrations/20260205130000_fix_join_requests_rls_member_status.sql`

**SQL to Execute**:
```sql
-- Fix RLS policies for organization_join_requests
DROP POLICY IF EXISTS "org_admins_view_join_requests" ON organization_join_requests;
DROP POLICY IF EXISTS "org_admins_update_join_requests" ON organization_join_requests;

CREATE POLICY "org_admins_view_join_requests"
  ON organization_join_requests
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM organization_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND member_status = 'active'  -- CRITICAL FIX
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
      AND member_status = 'active'  -- CRITICAL FIX
    )
  );
```

### Migration 2: Fix RPC Functions (Defense in Depth)

**Location**: `supabase/migrations/20260205130100_fix_join_requests_rpc_member_status.sql`

**SQL to Execute**:
```sql
-- Drop and recreate approve_join_request with member_status check
DROP FUNCTION IF EXISTS approve_join_request(uuid, uuid);

CREATE OR REPLACE FUNCTION approve_join_request(
  p_request_id uuid,
  p_actioned_by_user_id uuid
)
RETURNS TABLE (
  success boolean,
  message text,
  org_id uuid,
  user_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request organization_join_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_request
  FROM organization_join_requests
  WHERE id = p_request_id
  AND status = 'pending';

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      false,
      'Join request not found or already processed'::text,
      NULL::uuid,
      NULL::uuid;
    RETURN;
  END IF;

  -- Verify caller is ACTIVE admin (FIXED: added member_status check)
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE org_id = v_request.org_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin')
    AND member_status = 'active'  -- CRITICAL FIX
  ) THEN
    RETURN QUERY SELECT
      false,
      'Unauthorized: only active org admins can approve requests'::text,
      NULL::uuid,
      NULL::uuid;
    RETURN;
  END IF;

  -- Check if user is already a member
  IF EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE org_id = v_request.org_id
    AND user_id = v_request.user_id
  ) THEN
    UPDATE organization_join_requests
    SET status = 'approved',
        actioned_by = auth.uid(),
        actioned_at = NOW()
    WHERE id = p_request_id;

    RETURN QUERY SELECT
      true,
      'User is already a member'::text,
      v_request.org_id,
      v_request.user_id;
    RETURN;
  END IF;

  -- Create membership
  INSERT INTO organization_memberships (
    org_id,
    user_id,
    role
  ) VALUES (
    v_request.org_id,
    v_request.user_id,
    'member'
  );

  -- Update request status
  UPDATE organization_join_requests
  SET status = 'approved',
      actioned_by = auth.uid(),
      actioned_at = NOW()
  WHERE id = p_request_id;

  RETURN QUERY SELECT
    true,
    'Join request approved'::text,
    v_request.org_id,
    v_request.user_id;
END;
$$;

-- Drop and recreate reject_join_request with member_status check
DROP FUNCTION IF EXISTS reject_join_request(uuid, uuid, text);

CREATE OR REPLACE FUNCTION reject_join_request(
  p_request_id uuid,
  p_actioned_by_user_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request organization_join_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_request
  FROM organization_join_requests
  WHERE id = p_request_id
  AND status = 'pending';

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      false,
      'Join request not found or already processed'::text;
    RETURN;
  END IF;

  -- Verify caller is ACTIVE admin (FIXED: added member_status check)
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE org_id = v_request.org_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin')
    AND member_status = 'active'  -- CRITICAL FIX
  ) THEN
    RETURN QUERY SELECT
      false,
      'Unauthorized: only active org admins can reject requests'::text;
    RETURN;
  END IF;

  -- Update request status
  UPDATE organization_join_requests
  SET status = 'rejected',
      actioned_by = auth.uid(),
      actioned_at = NOW(),
      rejection_reason = p_reason
  WHERE id = p_request_id;

  RETURN QUERY SELECT
    true,
    'Join request rejected'::text;
END;
$$;
```

---

## 📋 How to Apply Database Migrations

### Option 1: Supabase Dashboard (Recommended)

1. Go to https://app.supabase.com
2. Select your project
3. Navigate to **SQL Editor** → **New Query**
4. Copy and paste **Migration 1** SQL above
5. Click **Run** ▶️
6. Verify success (should see "Success. No rows returned")
7. Repeat for **Migration 2**

### Option 2: Fix Migration History & Push

If you want to use the CLI:

```bash
# This will require syncing migration history
supabase db pull
supabase db push
```

---

## ✅ Testing Checklist

After applying migrations:

- [ ] Active admin can see pending join requests
- [ ] Removed admin gets "Your membership is not active" error
- [ ] New join request appears within 30 seconds without manual refresh
- [ ] Error messages display clearly in UI (red box with error text)
- [ ] Multi-org: switching orgs shows correct requests for each
- [ ] Regular member (not admin) gets "You do not have permission" error
- [ ] Logger messages appear in console without errors

---

## 📊 All Bugs Fixed

| Bug | Status | File |
|-----|--------|------|
| BUG-001 🔴 RLS SELECT policy missing member_status | ⚠️ Manual | Migration 1 |
| BUG-002 🔴 RLS UPDATE policy missing member_status | ⚠️ Manual | Migration 1 |
| BUG-003 🟠 No refetchInterval | ✅ Applied | OrganizationManagementPage.tsx |
| BUG-004 🟡 Missing logger import | ✅ Applied | OrganizationManagementPage.tsx |
| BUG-005 🟠 Silent error handling | ✅ Applied | joinRequestService.ts |
| BUG-006 🟡 No error UI | ✅ Applied | JoinRequestsPage.tsx |
| BUG-007 🟡 RPC functions missing check | ⚠️ Manual | Migration 2 |

---

## 📁 Files Modified

### Frontend (Already Applied)
- `src/pages/settings/OrganizationManagementPage.tsx`
- `src/lib/services/joinRequestService.ts`
- `src/pages/settings/JoinRequestsPage.tsx`

### Database (Awaiting Manual Application)
- `supabase/migrations/20260205130000_fix_join_requests_rls_member_status.sql`
- `supabase/migrations/20260205130100_fix_join_requests_rpc_member_status.sql`

### Documentation
- `.sixty/bugplan.json` - Detailed bug tracking plan
- `BUG_FIX_SUMMARY_JOIN_REQUESTS.md` - This file

---

## 🎯 Next Steps

1. **Apply Database Migrations** (see instructions above)
2. **Test the Fix** (use checklist above)
3. **Verify in Production** - Check that admin users can now see pending join requests
4. **Monitor Logs** - Watch for any permission errors in console

---

## 📝 Notes

- Frontend changes are deployed immediately (no restart needed)
- Database migrations are **backwards compatible** (safe to apply anytime)
- RLS policies are non-destructive (DROP IF EXISTS + CREATE)
- No data loss or downtime expected
