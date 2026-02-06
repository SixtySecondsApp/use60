# Bug Report: Organization Deactivation UX Flow

**Date:** 2026-02-06
**Severity:** 🟡 Medium - UX issue, not a crash
**Status:** 📋 ANALYZED - Ready for implementation

---

## Problem Statement

When a user's organization is already deactivated, they can still access the dashboard and attempt to deactivate it again, receiving the error:
```json
{"error": "Organization is already deactivated", "success": false}
```

**Expected Behavior:**
- If organization is deactivated, users should be immediately redirected to `/inactive-organization` page
- Owners should see "Request Reactivation" button
- Members/admins should NOT see the reactivation button (owner-only action)
- The deactivation should be detected BEFORE they can click "Deactivate Organization"

---

## Current Implementation Analysis

### ✅ What's Already Working

1. **Inactive Organization Page Exists**
   - **File:** `src/pages/InactiveOrganizationScreen.tsx`
   - **Features:**
     - Shows deactivation info (date, reason)
     - Countdown timer for 30-day deletion window
     - Owner vs Member differentiation (lines 249-308)
     - "Request Reactivation" button for owners (line 264-273)
     - "Leave Organization" button for members (line 294-306)
     - Alternative actions (choose different org, sign out)

2. **Route Protection Logic Exists**
   - **File:** `src/components/ProtectedRoute.tsx` (lines 302-380)
   - Checks `isOrgActive` status
   - Redirects to `/inactive-organization` if org is inactive
   - Query happens in effect (lines 303-332)

3. **Deactivation Service Works**
   - **File:** `src/lib/services/organizationDeactivationService.ts`
   - `deactivateOrganizationAsOwner()` RPC function
   - Returns error if already deactivated (line 36-38 in RPC function)

---

## The Bug: Race Condition in Route Protection

### Root Cause

**Problem:** The `ProtectedRoute` check happens AFTER the dashboard loads, causing a delay where:
1. User sees dashboard briefly
2. Can click "Settings" → "Organization Management"
3. Can click "Deactivate Organization"
4. Only THEN gets the error

**Why It Happens:**
```typescript
// ProtectedRoute.tsx:303-332
useEffect(() => {
  const checkOrgActiveStatus = async () => {
    if (!activeOrgId || !user?.id || !isAuthenticated || loading || isPublicRoute) {
      setIsOrgActive(null);  // ❌ Defaults to null
      setIsCheckingOrgActive(false);
      return;
    }

    try {
      setIsCheckingOrgActive(true);
      const { data: org, error } = await supabase
        .from('organizations')
        .select('is_active, name')
        .eq('id', activeOrgId)
        .single();

      if (error) throw error;

      setIsOrgActive(org?.is_active ?? true);  // ❌ Defaults to true on error
    } catch (error) {
      logger.error('[ProtectedRoute] Error checking org status:', error);
      setIsOrgActive(true); // ❌ Fail open to avoid blocking users
    }
  };

  checkOrgActiveStatus();
}, [activeOrgId, user?.id, isAuthenticated, loading, isPublicRoute]);
```

**Issues:**
1. **Async check** - Takes time to execute
2. **Fail-open** - Defaults to `true` on error (line 325)
3. **Loading state** - Shows loading spinner but then allows access
4. **No early abort** - Dashboard renders before check completes

---

## Additional Issues Found

### Issue 1: Owner Detection is Broken
**File:** `src/pages/InactiveOrganizationScreen.tsx:53-63`

```typescript
const checkOwnerStatus = async () => {
  if (!activeOrg?.id || !user?.id) return;

  try {
    // Note: This would need to check org_memberships table
    // For now, we'll assume if deactivation_reason exists, we can show owner messaging
    setIsOwner(!!activeOrg?.deactivation_reason);  // ❌ WRONG!
  } catch (error) {
    logger.error('[InactiveOrganizationScreen] Error checking owner status:', error);
  }
};
```

**Problem:** Checks if `deactivation_reason` exists, not if user is actually the owner!

**Correct Approach:**
```typescript
const { data } = await supabase
  .from('organization_memberships')
  .select('role')
  .eq('org_id', activeOrg.id)
  .eq('user_id', user.id)
  .single();

setIsOwner(data?.role === 'owner');
```

### Issue 2: Organization Context May Cache Stale Data

If `activeOrg` object is cached in `OrganizationContext`, the `is_active` field might be stale even after deactivation.

**Need to verify:** Does deactivation trigger a context refresh?

---

## Solution Design

### Fix 1: Eager Organization Status Check ✅

**Approach:** Check org status in `OrganizationContext` when loading the active org, BEFORE routes render.

**File to Modify:** `src/lib/stores/orgStore.ts` or `src/lib/hooks/useOrganizationContext.ts`

**Change:**
```typescript
// When setting active org, also check is_active
const setActiveOrg = async (orgId: string) => {
  const { data: org } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .single();

  if (!org.is_active) {
    // Don't set as active, redirect immediately
    navigate('/inactive-organization');
    return;
  }

  // Only set active if org is active
  setActiveOrgState(org);
};
```

### Fix 2: Fix Owner Detection ✅

**File:** `src/pages/InactiveOrganizationScreen.tsx:53-63`

**Change:**
```typescript
const checkOwnerStatus = async () => {
  if (!activeOrg?.id || !user?.id) return;

  try {
    const { data } = await supabase
      .from('organization_memberships')
      .select('role')
      .eq('org_id', activeOrg.id)
      .eq('user_id', user.id)
      .maybeSingle();

    setIsOwner(data?.role === 'owner');
  } catch (error) {
    logger.error('[InactiveOrganizationScreen] Error checking owner status:', error);
    setIsOwner(false);  // Default to non-owner on error
  }
};
```

### Fix 3: Prevent Deactivation UI for Inactive Orgs ✅

**File:** `src/pages/settings/OrganizationManagementPage.tsx`

**Change:** Add check before showing "Deactivate Organization" button

```typescript
// Near line 135 where deactivation state is defined
const [canDeactivate, setCanDeactivate] = useState<boolean | null>(null);

useEffect(() => {
  // Check if org is already deactivated
  if (!activeOrg?.is_active) {
    setCanDeactivate(false);
    return;
  }

  // ... existing canDeactivate logic
}, [activeOrg]);
```

### Fix 4: Refresh Org Context After Deactivation ✅

**File:** `src/components/dialogs/DeactivateOrganizationDialog.tsx`

**Change:** After successful deactivation, immediately navigate to inactive page

```typescript
// After handleDeactivate success (around line 100)
if (result.success) {
  toast.success('Organization deactivated', {
    description: 'All members have been notified.'
  });

  // Immediately redirect to inactive page
  navigate('/inactive-organization');
  onClose();
}
```

---

## Implementation Plan

### Story 1: Fix Owner Detection in Inactive Organization Page
**Priority:** P1
**Estimate:** 10 minutes

**Changes:**
- Update `checkOwnerStatus()` in `InactiveOrganizationScreen.tsx`
- Query `organization_memberships` table for user's role
- Set `isOwner` based on actual role, not `deactivation_reason`

**Test:**
- Deactivate org as owner → Should see "Request Reactivation" button
- View inactive org as member → Should NOT see reactivation button

### Story 2: Add Route-Level Organization Status Guard
**Priority:** P0 (Highest)
**Estimate:** 20 minutes

**Changes:**
- Add `isOrgActive` check to `OrganizationContext` or `orgStore`
- Check status when setting active org
- Redirect to `/inactive-organization` immediately if inactive
- Update `ProtectedRoute` to use cached status (no async check needed)

**Test:**
- Deactivate org → Should redirect to inactive page immediately
- Refresh page → Should stay on inactive page (no dashboard flash)
- Try to navigate to `/dashboard` → Should be blocked

### Story 3: Hide Deactivation UI for Inactive Orgs
**Priority:** P1
**Estimate:** 15 minutes

**Changes:**
- Add `canDeactivate` check in `OrganizationManagementPage`
- Hide "Deactivate Organization" button if `is_active === false`
- Show informational message: "This organization is already deactivated"

**Test:**
- Load org management page with inactive org → No deactivate button visible
- Show message: "Organization is inactive. Request reactivation to restore access."

### Story 4: Add Redirect After Deactivation
**Priority:** P1
**Estimate:** 5 minutes

**Changes:**
- In `DeactivateOrganizationDialog.tsx`, add `navigate('/inactive-organization')` after success
- Ensure context is refreshed before navigation

**Test:**
- Deactivate org → Should immediately see inactive organization page
- Back button should not return to dashboard

---

## Testing Checklist

### Scenario 1: Owner Deactivates Organization
```
1. Sign in as organization owner
2. Navigate to Settings → Organization Management
3. Click "Deactivate Organization"
4. Complete deactivation flow
5. ✅ Should immediately redirect to /inactive-organization
6. ✅ Should see "Request Reactivation" button
7. ✅ Should show countdown timer (30 days)
8. Refresh page
9. ✅ Should stay on /inactive-organization (no dashboard flash)
```

### Scenario 2: Member Accesses Inactive Organization
```
1. Sign in as organization member (not owner)
2. Organization is already deactivated
3. ✅ Should immediately see /inactive-organization
4. ✅ Should NOT see "Request Reactivation" button
5. ✅ Should see "Leave Organization" button
6. ✅ Should see message to contact owner
```

### Scenario 3: Admin Accesses Inactive Organization
```
1. Sign in as organization admin (not owner)
2. Organization is already deactivated
3. ✅ Should immediately see /inactive-organization
4. ✅ Should NOT see "Request Reactivation" button
5. ✅ Should see "Leave Organization" button
```

### Scenario 4: Try to Deactivate Already-Deactivated Org
```
1. Sign in as owner
2. Organization is inactive
3. Navigate to /settings/organization-management
4. ✅ Should NOT see "Deactivate Organization" button
5. ✅ Should see message: "This organization is deactivated"
```

### Scenario 5: Multiple Orgs (One Inactive)
```
1. User belongs to 2 organizations
2. One is active, one is inactive
3. Switch to inactive org
4. ✅ Should immediately redirect to /inactive-organization
5. Switch to active org
6. ✅ Should access dashboard normally
```

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Breaking dashboard access for active orgs | 🔴 High | Test thoroughly, fail-open on errors |
| Race condition in context loading | 🟡 Medium | Add loading states, cache status |
| Owner detection wrong | 🟡 Medium | Test with actual owner/member accounts |
| Multiple orgs confusion | 🟢 Low | Test org switching thoroughly |

---

## Files to Modify

| File | Lines | Changes |
|------|-------|---------|
| `src/pages/InactiveOrganizationScreen.tsx` | 53-63 | Fix owner detection |
| `src/lib/hooks/useOrganizationContext.ts` | TBD | Add org status guard |
| `src/pages/settings/OrganizationManagementPage.tsx` | ~135 | Hide deactivation UI |
| `src/components/dialogs/DeactivateOrganizationDialog.tsx` | ~100 | Add redirect after success |
| `src/components/ProtectedRoute.tsx` | 302-380 | Use cached org status |

---

## Success Criteria

- ✅ Users with inactive orgs are immediately redirected (no dashboard flash)
- ✅ Owners see "Request Reactivation" button
- ✅ Members/admins do NOT see reactivation button
- ✅ Deactivation UI is hidden for already-deactivated orgs
- ✅ No "Organization is already deactivated" errors shown
- ✅ Page refreshes preserve inactive state
- ✅ Multi-org switching works correctly

---

## Related Issues

- Organization deactivation full_name bug (FIXED)
- Organization deactivation domain bug (FIXED)

---

**Status:** Ready for implementation. All analysis complete.
