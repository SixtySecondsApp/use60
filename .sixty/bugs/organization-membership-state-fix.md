# Bug Fix: Organization Membership State Inconsistency

**Bug ID**: ORG-MEMBER-001
**Status**: FIXED
**Severity**: Critical
**Date Fixed**: 2026-02-05

## Problem Statement

User creates an organization during onboarding, but when they later try to rejoin the organization, they receive the error:

```
"You are already a member of this organization"
```

However, in the organization admin page, the organization shows **0 members** and the user cannot access it. They can only delete the organization.

This creates an impossible state: the user cannot join (already member) and cannot create a new org (is owner of existing org that appears empty).

## Root Cause Analysis

### Primary Issue: member_status Inconsistency

The `organization_memberships` table has a `member_status` column added to track soft-deletes, with:
- Possible values: `'active'`, `'removed'`, or NULL
- Default: `'active'` (set at table level)

However, when memberships are created during org creation:

**Before Fix** (onboardingV2Store.ts:794-802):
```typescript
// member_status is NOT explicitly set
const { error: memberError } = await supabase
  .from('organization_memberships')
  .upsert({
    org_id: newOrg.id,
    user_id: session.user.id,
    role: 'owner',
    // ❌ NO member_status specified
  }, {
    onConflict: 'org_id,user_id'
  });
```

When `member_status` is NULL or not `'active'`:
- Member count queries filter: `WHERE member_status = 'active'` → counts 0
- "Already member" checks don't filter by status → finds membership anyway

### Secondary Issue: Inconsistent Membership Checks

The `create_join_request` RPC function (prevent_join_empty_orgs.sql) has TWO different checks:

```sql
-- Check 1: Count active members (filters by status)
SELECT COUNT(om.user_id)
FROM organizations o
LEFT JOIN organization_memberships om ON o.id = om.org_id
  AND om.member_status = 'active'  -- FILTERS HERE
WHERE o.id = p_org_id

-- Check 2: Check if already a member (does NOT filter)
IF EXISTS (
  SELECT 1 FROM organization_memberships
  WHERE org_id = p_org_id AND user_id = p_user_id
  -- ❌ NO member_status filter
) THEN
  RETURN 'already a member'
```

**Result of inconsistency**:
1. Check 1 says: 0 active members (org is empty)
2. Check 2 says: Already a member
3. User can't join (already member) and can't create new org (owner conflict)

## Fixes Applied

### Fix #1: Explicit member_status='active' in Frontend (onboardingV2Store.ts)

**Location**: Lines 794-802 and 952-962

```typescript
// AFTER FIX
const { error: memberError } = await supabase
  .from('organization_memberships')
  .upsert({
    org_id: newOrg.id,
    user_id: session.user.id,
    role: 'owner',
    member_status: 'active',  // ✅ EXPLICITLY SET
  }, {
    onConflict: 'org_id,user_id'
  });
```

**Impact**: Ensures memberships always have explicit status set from the frontend.

### Fix #2: Database Trigger for Automatic Initialization (Migration)

**Migration**: 20260205140000_fix_membership_status_initialization.sql

```sql
-- Ensures member_status is always 'active' if not provided
CREATE TRIGGER ensure_member_status_on_insert
BEFORE INSERT ON organization_memberships
FOR EACH ROW
WHEN (NEW.member_status IS NULL)
BEGIN
  NEW.member_status := 'active'
END;
```

**Impact**: Safety net for cases where status isn't explicitly set.

### Fix #3: Fix All Existing NULL Values (Migration)

```sql
UPDATE organization_memberships
SET member_status = 'active'
WHERE member_status IS NULL
  OR member_status NOT IN ('active', 'removed');
```

**Impact**: Fixes phantom memberships already in the database.

### Fix #4: Consistent "Already Member" Check (create_join_request RPC)

**Migration**: 20260205140000_fix_membership_status_initialization.sql

```sql
-- BEFORE: Checked all memberships
IF EXISTS (
  SELECT 1 FROM organization_memberships
  WHERE org_id = p_org_id AND user_id = p_user_id
) THEN
  RETURN 'already a member'

-- AFTER: Check only ACTIVE memberships
IF EXISTS (
  SELECT 1 FROM organization_memberships
  WHERE org_id = p_org_id
    AND user_id = p_user_id
    AND member_status = 'active'  -- ✅ CRITICAL FIX
) THEN
  RETURN 'already a member'
```

**Impact**: Now consistent with member_count logic. Users with removed/NULL memberships can rejoin.

### Fix #5: Explicit Status in approve_join_request (RPC)

**Migration**: 20260205140000_fix_membership_status_initialization.sql

```sql
-- When creating new membership
INSERT INTO organization_memberships (
  org_id,
  user_id,
  role,
  member_status  -- ✅ EXPLICITLY SET
) VALUES (
  p_org_id,
  p_user_id,
  'member',
  'active'  -- ✅ GUARANTEED ACTIVE
);

-- Handle reactivation if removed
IF EXISTS (... AND member_status = 'removed') THEN
  UPDATE organization_memberships
  SET member_status = 'active',  -- ✅ REACTIVATE
      removed_at = NULL,
      removed_by = NULL
```

**Impact**: Approved memberships always have active status.

### Fix #6: Fix Existing Duplicates (Migration)

```sql
-- Clean up any duplicates before adding UNIQUE constraint
DELETE FROM organization_memberships a
USING organization_memberships b
WHERE a.ctid < b.ctid
  AND a.org_id = b.org_id
  AND a.user_id = b.user_id;

-- Add UNIQUE constraint (idempotent)
ALTER TABLE organization_memberships
  ADD CONSTRAINT unique_org_user_membership UNIQUE (org_id, user_id);
```

**Impact**: Prevents future duplicate memberships from being created.

## Verification

### Test Coverage (onboardingV2Store.membership.test.ts)

✅ Member status initialization tests
✅ Member count consistency tests
✅ Database trigger verification
✅ RPC function update verification
✅ End-to-end user journey tests
✅ Migration safety tests

### Manual Testing Scenarios

**Scenario 1: Create Org and Rejoin**
```
Before Fix:
1. User creates org during website_input
2. membership.member_status = NULL
3. User tries to rejoin next day
4. Error: "already a member" + member_count=0
5. TRAP: Can't join, can't create

After Fix:
1. User creates org during website_input
2. membership.member_status = 'active' (explicit)
3. User tries to rejoin next day
4. member_count = 1 (counts active)
5. Error: "already a member" (correct, user IS the owner)
6. NO TRAP: User is properly the owner
```

**Scenario 2: Removed User Rejoin**
```
1. User in org with member_status = 'active'
2. Admin removes user: member_status = 'removed'
3. User submits rejoin request
4. create_join_request: "already a member?" check filters by status
5. Returns false (removed != active)
6. Join request created
7. Admin approves
8. approve_join_request reactivates: member_status = 'active'
9. SUCCESS: User can rejoin
```

## Files Modified

### Frontend Changes
- `src/lib/stores/onboardingV2Store.ts`: Added explicit `member_status: 'active'` in two places (lines 799 and 957)

### Database Migrations
- `supabase/migrations/20260205140000_fix_membership_status_initialization.sql`: Complete fix with:
  - Cleanup of NULL values
  - Trigger for future protection
  - Updated RPC functions
  - UNIQUE constraint for duplicate prevention

### Tests
- `src/lib/stores/__tests__/onboardingV2Store.membership.test.ts`: Comprehensive test suite

## Deployment Notes

1. **Database migration must be applied**: Run `supabase migrate up` to apply the fixes
2. **Frontend code already includes fix**: The explicit `member_status: 'active'` is set
3. **Backwards compatible**: The fixes don't break existing functionality
4. **Safety nets in place**: Database trigger + cleanup handles edge cases

## Before & After Summary

| Aspect | Before Fix | After Fix |
|--------|-----------|-----------|
| member_status on creation | NULL (implicit default) | 'active' (explicit) |
| Member count query | Filters `member_status='active'` | Same (now consistent) |
| "Already member" check | Any status (no filter) | `member_status='active'` (filtered) |
| Phantom memberships | Possible, create trap | Fixed, can rejoin |
| Duplicate memberships | No prevention | UNIQUE constraint |
| Consistency | Inconsistent checks | Fully consistent |

## Impact

**User Experience**:
- ✅ Can create org during onboarding
- ✅ Can rejoin org without getting stuck
- ✅ Admin can manage members (no 0 member trap)
- ✅ Removed users can request to rejoin

**System**:
- ✅ Member count accurate
- ✅ No phantom memberships
- ✅ No duplicate memberships
- ✅ Consistent authorization checks

## Related Issues

This fix addresses:
- Creation workflow completion (BUG-001 through BUG-006 in manual enrichment)
- Race condition in member creation
- Member status visibility in admin
- Owner lockout from organization access

## Future Recommendations

1. **Add validation in RLS policies** to ensure member_status is always set
2. **Add auditing** to track when and why member_status changes
3. **Add dashboard** in admin to show phantom/inactive memberships
4. **Add health check** to periodically validate member count consistency
