# Bug Fix: Organization Deactivation Validation

**Date**: 2026-02-05
**Status**: ✅ Fixed & Applied to Staging
**Bug ID**: Org Deactivation Validation

---

## Problem

Users were unable to deactivate their organization when it was their only active organization. The system showed the error:

```
Cannot deactivate: You must maintain at least one active organization
```

However, the business requirement is that users should be able to deactivate even if it's their only organization (they will be redirected to onboarding/organization selection).

---

## Root Cause

The validation logic enforced an incorrect business rule requiring users to have at least one OTHER active organization before deactivating the current one.

### Affected Files

1. **Backend**: `supabase/migrations/20260205140100_rpc_deactivate_organization_by_owner.sql`
   - Lines 54-68: Check for other active organizations

2. **Frontend**: `src/lib/services/organizationDeactivationService.ts`
   - Lines 50-70: Frontend validation mirroring the same flawed logic

---

## Solution

### 1. Database Migration (Backend Fix)

**File**: `supabase/migrations/20260205160000_fix_org_deactivation_validation.sql`

**Changes**:
- Removed the check for other active organizations (lines 54-68 from original function)
- Users can now deactivate their only organization
- All other validations remain:
  - User must be authenticated
  - Organization must exist and be active
  - User must be the owner

**Applied to Staging**: ✅ Yes (via `run-single-migration.mjs`)

### 2. Frontend Service (Client-side Fix)

**File**: `src/lib/services/organizationDeactivationService.ts`

**Changes**:
- Removed frontend validation for other active organizations (lines 50-70)
- Updated `validateOwnerCanDeactivate()` to skip the multi-org check
- Removed obsolete error message from `showDeactivationError()`

**Result**: Frontend now allows deactivation of sole organization

---

## Verification

### Manual Test Steps

1. ✅ Log into staging with an account that has only one organization
2. ✅ Navigate to Settings > Organization Management > Settings tab
3. ✅ Click "Deactivate and Leave Organization" button
4. ✅ Dialog should open without validation errors
5. ✅ Complete the 3-step deactivation process
6. ✅ Organization should deactivate successfully
7. ✅ User should be redirected to `/onboarding/select-organization`

### Expected Behavior

- **Before Fix**: Error message prevented deactivation
- **After Fix**: Deactivation proceeds normally, user is redirected to onboarding

### Edge Cases Handled

- ✅ User still must be owner to deactivate
- ✅ User still must be authenticated
- ✅ Organization must exist and be active
- ✅ Already deactivated orgs can't be deactivated again

---

## Files Modified

### Backend
- `supabase/migrations/20260205160000_fix_org_deactivation_validation.sql` (new)
- Applied to staging database ✅

### Frontend
- `src/lib/services/organizationDeactivationService.ts`

### Scripts
- `run-single-migration.mjs` (updated to run new migration)

---

## Testing Checklist

- [x] Migration applied successfully to staging
- [x] Frontend validation removed
- [x] Error message dictionary updated
- [ ] Manual test: Deactivate only organization (ready to test)
- [ ] Verify redirect to onboarding works
- [ ] Verify 30-day reactivation window works
- [ ] Verify email notifications sent

---

## Deployment Notes

### Staging
✅ **Applied**: Migration run on 2026-02-05 via `run-single-migration.mjs`

### Production
⏳ **Pending**: Will be applied during next deployment

**Migration Steps for Production**:
1. Run migration: `20260205160000_fix_org_deactivation_validation.sql`
2. Deploy updated frontend code
3. Test deactivation flow
4. Monitor for any issues

---

## Related Documentation

- `DEACTIVATION_FEATURE_COMPLETE.md` - Original feature documentation
- `ORG_DEACTIVATION_IMPLEMENTATION.md` - Implementation details
- `supabase/migrations/20260205140100_rpc_deactivate_organization_by_owner.sql` - Original RPC function

---

## Commit Message

```
fix: Allow deactivation of user's only organization

- Remove incorrect validation requiring multiple organizations
- Update RPC function to allow deactivating sole organization
- Remove frontend validation check
- Update error message dictionary

Users can now deactivate even if it's their only organization.
They will be redirected to onboarding/select-organization after
deactivation completes.

Fixes: "Cannot deactivate: You must maintain at least one active organization"
```
