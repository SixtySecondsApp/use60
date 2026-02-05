# Bug Fix Summary: Rejoin Organization Flow

**Date**: 2026-02-05
**Environment**: Staging (staging.use60.com)
**Status**: ✅ Fixed & Deployed

---

## Bugs Fixed

### Bug #1: Type Mismatch in Rejoin Notification Trigger
**Severity**: 🔴 Critical
**Error**: `column "entity_id" is of type uuid but expression is of type text`

**What Happened**:
- User leaves organization
- User clicks "Request to Rejoin"
- Database trigger fires to notify admins
- **ERROR**: Trigger tries to insert `NEW.id::text` into UUID column

**Root Cause**:
Line 269 in `supabase/migrations/20260205100100_add_join_request_notifications.sql`:
```sql
entity_id,          -- UUID column
NEW.id::text,       -- ❌ Casting to text causes type mismatch
```

**Fix Applied**:
```sql
entity_id,          -- UUID column
NEW.id,             -- ✅ Pass UUID directly (no cast)
```

**Migration**: `20260205120000_fix_rejoin_notification_entity_id.sql`

---

### Bug #2 / Enhancement: Auto-Accept Rejoin When Admin Sent Invitation
**Severity**: 🟡 Medium (User Experience Improvement)

**Current Flow (Before Fix)**:
1. Admin sends rejoin invitation → only sends email (no DB record)
2. User clicks link → must still "request to rejoin"
3. Admin must manually approve → redundant step
4. User gets approved → finally rejoins

**Problem**: Admin already invited user, but system still requires manual approval. User has to wait for admin to check email and approve.

**New Flow (After Fix)**:
1. Admin sends rejoin invitation → **records invitation in database**
2. User clicks "Request to Rejoin" → **system checks for invitation**
3. If invitation exists → **auto-approves immediately**
4. User rejoins → redirected to dashboard

**Changes Made**:

1. **New Table**: `rejoin_invitations`
   - Tracks admin-sent invitations
   - 30-day expiration
   - Status: active, used, expired

2. **Updated RPC**: `request_rejoin`
   - Checks for existing active invitation
   - Auto-approves if invitation found
   - Returns `auto_approved: true` flag

3. **New RPC**: `record_rejoin_invitation`
   - Called when admin sends invitation
   - Records invitation in database
   - Validates permissions

4. **Frontend Updates**:
   - `RemovedUserStep.tsx`: Handles auto-approval response
   - `OrganizationManagementPage.tsx`: Calls `record_rejoin_invitation` RPC

**Migration**: `20260205120100_add_rejoin_invitations_tracking.sql`

---

## Testing

### Test Case 1: Rejoin Without Invitation
**Steps**:
1. User leaves organization
2. User clicks "Request to Rejoin"
3. **Expected**: Request created, user sees "pending approval" message
4. Admin must approve manually

✅ **Result**: Works as expected (normal flow)

### Test Case 2: Rejoin With Invitation (Auto-Approve)
**Steps**:
1. Admin sends rejoin invitation to user
2. User clicks "Request to Rejoin"
3. **Expected**: Auto-approved, redirected to dashboard immediately
4. Success message: "Welcome back! Your admin already invited you to rejoin."

✅ **Result**: Auto-approval works

### Test Case 3: Expired Invitation
**Steps**:
1. Admin sends rejoin invitation
2. Wait 31+ days (or manually expire)
3. User clicks "Request to Rejoin"
4. **Expected**: Creates normal pending request (invitation expired)

✅ **Result**: Falls back to normal flow

---

## Database Changes

### New Table: `rejoin_invitations`
```sql
CREATE TABLE public.rejoin_invitations (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  invited_by uuid NOT NULL,
  invited_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (NOW() + interval '30 days'),
  status text NOT NULL CHECK (status IN ('active', 'used', 'expired')),
  used_at timestamptz,
  created_at timestamptz
);
```

### Updated Functions:
- `notify_admins_on_rejoin_request()` - Fixed entity_id type
- `request_rejoin(p_org_id)` - Added auto-approval logic
- `record_rejoin_invitation(p_org_id, p_user_id)` - New function

---

## Files Modified

### Migrations:
- ✅ `supabase/migrations/20260205120000_fix_rejoin_notification_entity_id.sql` (NEW)
- ✅ `supabase/migrations/20260205120100_add_rejoin_invitations_tracking.sql` (NEW)

### Frontend:
- ✅ `src/pages/onboarding/v2/RemovedUserStep.tsx`
- ✅ `src/pages/settings/OrganizationManagementPage.tsx`

---

## Deployment Status

**Staging**: ✅ Applied successfully
- Fix #1: ✅ Deployed
- Fix #2: ✅ Deployed

**Production**: ⏳ Ready to deploy

---

## User Impact

**Before Fixes**:
- ❌ Error when requesting to rejoin (blocking bug)
- 😐 Manual approval required even after admin invitation

**After Fixes**:
- ✅ Rejoin request works correctly
- 🎉 Auto-approval when admin already invited user
- ⚡ Faster onboarding for returning members

---

## Next Steps

1. ✅ Test in staging environment
2. ⏳ Deploy to production
3. ⏳ Monitor error logs for any issues
4. ⏳ Update user documentation

---

## Rollback Plan

If issues arise:

```sql
-- Rollback Fix #2 (auto-approval)
DROP TABLE IF EXISTS public.rejoin_invitations CASCADE;

-- Revert request_rejoin to original version
-- (use migration from 20260202093845_create_request_rejoin_rpc.sql)
```

Fix #1 has no rollback concerns (simple type fix).
