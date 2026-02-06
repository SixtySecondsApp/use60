# CRITICAL FIX: Inactive Organization Display Issue

**Date:** 2026-02-06
**Status:** ✅ FIXED
**Severity:** 🔴 Critical - Users couldn't see inactive organization page
**Commit:** ee843103

---

## Problem

After deactivating an organization, users saw "No organization selected" instead of the inactive organization page with proper messaging and reactivation options.

### Screenshot of Bug

User reported: "This screenshot should not be possible, I should not be able to access the dashboard if the organization doesn't exist / is deactivated."

The Organization Management page showed:
```
⚠️ No organization selected
```

Instead of redirecting to `/inactive-organization` with:
- Organization name
- Deactivation date
- "Request Reactivation" button (for owners)
- 30-day countdown timer

---

## Root Cause Analysis

### Primary Issue: Filtering Out Inactive Orgs Too Early

**Location:** `src/lib/stores/orgStore.ts` (line 206)

**Problem Code:**
```typescript
const orgs: Organization[] = orgMemberships
  .map((m) => m.organization)
  .filter((org): org is Organization => org !== undefined)
  .filter((org) => org.is_active !== false); // ❌ THIS REMOVED INACTIVE ORGS
```

**What Happened:**
1. User deactivates organization
2. Database sets `is_active = false`
3. `loadOrganizations()` fetches all memberships
4. Filter removes any org where `is_active === false`
5. Deactivated org is no longer in the `organizations` array
6. `activeOrgId` can't find matching org → becomes `null`
7. `activeOrg` becomes `null`
8. InactiveOrganizationScreen has no data to display

### Flow Diagram: Before Fix

```
User deactivates org
    ↓
DB: is_active = false
    ↓
Page reload triggers orgStore.loadOrganizations()
    ↓
Query fetches ALL memberships (including inactive org)
    ↓
Filter: .filter((org) => org.is_active !== false)
    ↓
Inactive org REMOVED from array ❌
    ↓
activeOrgId can't find org → null
    ↓
activeOrg = null
    ↓
InactiveOrganizationScreen shows "No organization selected"
```

---

## The Fix

### Solution: Keep Inactive Orgs in Store

**Key Insight:** We need inactive org data to display on the InactiveOrganizationScreen. The filtering was happening too early.

**New Approach:**
1. **Store ALL orgs** (active and inactive) in the organizations array
2. **Prefer active orgs** when selecting the default `activeOrgId`
3. **Allow inactive orgId** if it's persisted (user needs to see inactive page)
4. **Redirect in OrgContext** when it detects `is_active === false`

### Code Changes

#### Change 1: Remove Premature Filtering

**File:** `src/lib/stores/orgStore.ts`

**Before:**
```typescript
const orgs: Organization[] = orgMemberships
  .map((m) => m.organization)
  .filter((org): org is Organization => org !== undefined)
  .filter((org) => org.is_active !== false); // ❌ Removed inactive orgs
```

**After:**
```typescript
// Keep ALL organizations including inactive ones in the store
// We need inactive org data to display on the InactiveOrganizationScreen
const orgs: Organization[] = orgMemberships
  .map((m) => m.organization)
  .filter((org): org is Organization => org !== undefined);
```

#### Change 2: Prefer Active Orgs for Default Selection

**File:** `src/lib/stores/orgStore.ts`

**Before:**
```typescript
const envDefaultOrgId = getDefaultOrgId();
if (!activeOrgId && envDefaultOrgId && orgs.some((o) => o.id === envDefaultOrgId)) {
  activeOrgId = envDefaultOrgId;
}

if (!activeOrgId && orgs.length > 1) {
  const counts = await Promise.all(
    orgs.map(async (org) => { // ❌ Included inactive orgs in selection
```

**After:**
```typescript
const envDefaultOrgId = getDefaultOrgId();
if (!activeOrgId && envDefaultOrgId && orgs.some((o) => o.id === envDefaultOrgId && o.is_active !== false)) {
  activeOrgId = envDefaultOrgId;
}

if (!activeOrgId && orgs.length > 1) {
  // Filter to only active orgs when selecting default
  const activeOrgs = orgs.filter((o) => o.is_active !== false);

  const counts = await Promise.all(
    activeOrgs.map(async (org) => { // ✅ Only active orgs for selection
```

#### Change 3: Fallback to Active Org First

**File:** `src/lib/stores/orgStore.ts`

**Before:**
```typescript
if (!activeOrgId) {
  activeOrgId = orgs[0]?.id || null; // ❌ Could pick inactive org
}
```

**After:**
```typescript
if (!activeOrgId) {
  // Prefer first active org, fallback to any org if all are inactive
  const firstActiveOrg = orgs.find((o) => o.is_active !== false);
  activeOrgId = firstActiveOrg?.id || orgs[0]?.id || null;
}
```

#### Change 4: Updated switchOrg Comment

**File:** `src/lib/contexts/OrgContext.tsx`

**Before:**
```typescript
// Check if org is active before switching
const org = organizations.find((o) => o.id === orgId);
if (org && org.is_active === false) {
  logger.error('[OrgContext] Cannot switch to inactive org:', orgId);
```

**After:**
```typescript
// Check if org is active before allowing switch
const org = organizations.find((o) => o.id === orgId);
if (org && org.is_active === false) {
  logger.warn('[OrgContext] Attempting to switch to inactive org - redirecting to inactive page');
```

---

## Flow After Fix

```
User deactivates org
    ↓
DB: is_active = false
    ↓
Page reload triggers orgStore.loadOrganizations()
    ↓
Query fetches ALL memberships (including inactive org)
    ↓
Keep ALL orgs in array (active AND inactive) ✅
    ↓
activeOrgId still points to deactivated org ✅
    ↓
activeOrg = { ...org, is_active: false } ✅
    ↓
OrgContext detects is_active === false
    ↓
Redirects to /inactive-organization
    ↓
InactiveOrganizationScreen displays:
  - Organization name
  - Deactivation date & reason
  - 30-day countdown
  - "Request Reactivation" button (owners only)
  - "Leave Organization" button (members)
```

---

## Why This Fix Works

### Before: Data Loss Problem

The previous approach tried to prevent users from accessing inactive orgs by filtering them out of the store entirely. This caused a **data loss problem**:

- Filter removes inactive org → `activeOrg` becomes null
- Can't display org name, dates, or any deactivation info
- User sees generic error instead of helpful inactive page

### After: Separation of Concerns

The new approach **separates data storage from access control**:

1. **Data Layer (orgStore):** Stores ALL org data, including inactive orgs
2. **Access Control (OrgContext):** Checks `is_active` status and redirects if needed
3. **UI Layer (InactiveOrganizationScreen):** Has all the data it needs to display

This follows the principle: **Keep the data, control the access.**

---

## Testing Checklist

### ✅ Scenario 1: Owner Deactivates Organization
```
1. Sign in as organization owner
2. Navigate to Settings → Organization Management
3. Click "Deactivate Organization"
4. Complete deactivation flow
5. ✅ Redirected to /inactive-organization
6. ✅ See organization name: "Organization"
7. ✅ See "Request Reactivation" button
8. ✅ See 30-day countdown timer
9. Refresh page
10. ✅ Stay on /inactive-organization with all data visible
```

### ✅ Scenario 2: Member Accesses Inactive Org
```
1. Sign in as organization member
2. Organization is already deactivated
3. ✅ Immediately see /inactive-organization
4. ✅ See organization name
5. ✅ Do NOT see "Request Reactivation" button
6. ✅ See "Leave Organization" button
7. ✅ See message to contact owner
```

### ✅ Scenario 3: Multiple Orgs (One Inactive)
```
1. User has 2 orgs: "Acme Corp" (active), "Old Startup" (inactive)
2. Default org selection: "Acme Corp" (active) ✅
3. Switch to "Old Startup" → redirect to /inactive-organization ✅
4. Switch back to "Acme Corp" → dashboard accessible ✅
```

### ✅ Scenario 4: All Orgs Inactive
```
1. User has 1 org, it's deactivated
2. activeOrgId = deactivated org (no active orgs available) ✅
3. Page shows /inactive-organization with org data ✅
4. User can see reactivation options
```

---

## Technical Details

### State Management Strategy

**Zustand Store (orgStore):**
- Purpose: Store ALL organization data
- Principle: Data availability
- Filter: None (keep all orgs)

**React Context (OrgContext):**
- Purpose: Manage active org and permissions
- Principle: Access control
- Logic: Detect inactive status, trigger redirect

**UI Components:**
- InactiveOrganizationScreen: Display org data, show appropriate actions
- ProtectedRoute: Secondary check (defense in depth)

### Why Keep Inactive Orgs?

1. **Display Requirements:** The inactive page needs org data (name, dates, reason)
2. **User Experience:** Helpful error page vs generic "No org" message
3. **Reactivation Flow:** Owner needs to see which org to reactivate
4. **Historical Data:** User may need to export data before deletion
5. **Audit Trail:** Track which org user belonged to

### Default Selection Logic

**Priority:**
1. Persisted `activeOrgId` (even if inactive) - user may need inactive page
2. Default org from env var (if active)
3. "Sixty Seconds" org with most meetings (active only)
4. Org with most meetings (active only)
5. First active org
6. First org (if all inactive)

This ensures:
- Active orgs are preferred for new sessions
- Inactive orgs are preserved for users who need them
- No data loss during org selection

---

## Related Issues

- ✅ Owner detection bug (FIXED - Story 1)
- ✅ Route-level guard (FIXED - Story 2)
- ✅ Hide deactivation UI (FIXED - Story 3)
- ✅ Redirect after deactivation (FIXED - Story 4)
- ✅ **Inactive org display** (FIXED - this document)

---

## Performance Impact

**Minimal:** Keeping inactive orgs in the array adds negligible overhead:
- Typical user: 1-3 orgs total
- Inactive orgs: Usually 0, rarely >1
- Array operations: O(n) with n ≈ 1-3

**Memory:** ~1KB per org object (insignificant)
**Query time:** No change (orgs already fetched)
**Render time:** No change (inactive orgs not rendered in org selector)

---

## Security Considerations

**RLS Policies:** Unchanged
- Users can still only see orgs they're members of
- RLS on `organization_memberships` table still applies
- Inactive orgs are not a security risk (user already has access)

**Data Visibility:**
- Inactive org data is not sensitive
- User was already a member
- Showing org name & deactivation date is expected behavior

---

## Future Considerations

### Auto-Cleanup After 30 Days

When the auto-deletion runs (30 days after deactivation):
1. Org row deleted from database
2. Org disappears from user's memberships
3. `loadOrganizations()` won't fetch it anymore
4. User redirected to onboarding or next available org

**No code changes needed** - the deletion will naturally remove the org from the system.

### Reactivation Flow

When org is reactivated:
1. Database sets `is_active = true`
2. Realtime subscription in OrgContext updates store
3. User can switch back to the org normally
4. No page reload needed (reactive)

**Already implemented** - the realtime subscription handles this.

---

## Success Criteria

- ✅ Inactive orgs preserved in store
- ✅ Active orgs preferred for default selection
- ✅ InactiveOrganizationScreen displays org data correctly
- ✅ No "No organization selected" errors
- ✅ Proper redirect flow after deactivation
- ✅ Page refresh works correctly
- ✅ Multi-org scenarios handled
- ✅ Owner vs member UI differentiation works

---

**Fix Status:** Complete and Tested ✅
**Ready for:** Staging deployment, then production
**Risk Level:** Low (defensive coding, preserves data)
