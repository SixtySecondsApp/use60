# Bug Report: Organization Deactivation Foreign Key Mismatch

**Generated:** 2026-02-05
**Feature:** Organization Deactivation
**Symptom:** PGRST200 error when trying to deactivate organization with members

---

## Executive Summary

**Root Cause:** Foreign key name mismatch between code and database schema
**Severity:** 🔴 Critical
**Confidence:** 99% (exact error message matches PostgREST FK lookup failure)
**Impact:** Organization deactivation feature completely broken
**User Impact:** Owners cannot deactivate organizations

---

## Reported Symptom

```
Error Message:
GET https://.../organization_memberships?select=user_id,role,profiles!organization_memberships_user_id_fkey(id,email,full_name)&org_id=eq.a187307e...&member_status=neq.removed 400 (Bad Request)

PGRST200: Could not find a relationship between 'organization_memberships' and 'profiles' in the schema cache

Details: "Searched for a foreign key relationship between 'organization_memberships' and 'profiles' in the schema 'public', but no matches were found."
```

**User Action:** Owner clicks "Continue" in DeactivateOrganizationDialog step 1 → Step 2 fails to load members

---

## Root Cause Analysis

### The Problem

The code references a foreign key constraint that **does not exist** in the database schema:

| Aspect | Details |
|--------|---------|
| **Code Reference** | `profiles!organization_memberships_user_id_fkey` |
| **Actual FK Name** | `organization_memberships_profiles_fk` |
| **Location** | `organizationDeactivationService.ts:133` |

### What's Happening

```
1. User clicks "Continue" in deactivation dialog
2. DeactivateOrganizationDialog.tsx:65 calls getAllOrgMembers(orgId)
3. getAllOrgMembers() line 133 uses PostgREST join syntax with wrong FK name:
   profiles!organization_memberships_user_id_fkey(...)
4. PostgREST searches for FK constraint with that exact name
5. PostgREST finds DIFFERENT FK name in schema: organization_memberships_profiles_fk
6. PostgREST throws PGRST200 error: "relationship not found"
7. Error bubbles up, member list fails to load
8. User cannot proceed with deactivation
```

### Database Schema Evidence

**Migration 20260202213000_add_organization_memberships_profiles_fk.sql:**
```sql
ALTER TABLE public.organization_memberships
ADD CONSTRAINT organization_memberships_profiles_fk
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
```

**Baseline schema (00000000000000_baseline.sql:45605):**
```sql
ADD CONSTRAINT "organization_memberships_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
```

**The Mismatch:**
- Old FK (still referenced in code): `organization_memberships_user_id_fkey` → `auth.users(id)`
- New FK (actual database): `organization_memberships_profiles_fk` → `public.profiles(id)`

---

## Agent Findings Summary

### 🔍 CODE TRACER

**Execution Path:**
```
User clicks "Continue" (DeactivateOrganizationDialog.tsx:229)
  ↓
handleGoToReview() (line 62)
  ↓
getAllOrgMembers(orgId) (organizationDeactivationService.ts:125)
  ↓
Supabase query with wrong FK name (line 133)
  ↓
PostgREST 400 error (PGRST200)
  ↓
Error caught, toast shown: "Failed to load organization members"
```

**Key Files:**
- `src/components/dialogs/DeactivateOrganizationDialog.tsx` - User interaction
- `src/lib/services/organizationDeactivationService.ts` - Query with wrong FK
- `supabase/migrations/20260202213000_add_organization_memberships_profiles_fk.sql` - Migration that changed FK name

### 🧠 LOGIC ANALYZER

**Issue:** Incorrect FK reference syntax in PostgREST join

**Location:** `organizationDeactivationService.ts:127-134`

```typescript
const { data: memberships, error: membershipsError } = await supabase
  .from('organization_memberships')
  .select(
    `
    user_id,
    role,
    profiles!organization_memberships_user_id_fkey(id, email, full_name)
    //         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    //         BUG: This FK constraint doesn't exist
  `
  )
```

**Explanation:**
PostgREST resource embedding syntax `profiles!<fkey_name>(columns)` requires the **exact constraint name** from the database. The code uses an outdated name from when `organization_memberships.user_id` referenced `auth.users`. After migration 20260202213000, the FK now references `profiles.id` with a different constraint name.

**Why It Fails:**
PostgREST performs FK lookup at query time by searching `pg_constraint` for the exact constraint name. When not found, it throws PGRST200.

### 🚨 ERROR TRACKER

**Error Handling Analysis:**

1. **Primary Error:** PGRST200 from PostgREST (400 Bad Request)
2. **Caught By:** `getAllOrgMembers()` catch block (line 147-150)
3. **User Feedback:** Toast error "Failed to load organization members"
4. **State Impact:** Dialog remains on step 1, user cannot proceed

**Error Handling Gap:**
The error message shown to user is generic. It doesn't indicate the issue is a system configuration problem (FK mismatch) vs. a transient network error. User might retry repeatedly thinking it's temporary.

### 🔎 EDGE CASE HUNTER

**Scenarios Affected:**
- ✅ Organization with 0 members (owner only) - **FAILS** (error on empty result too)
- ✅ Organization with 1+ members - **FAILS** (primary scenario)
- ✅ Organization with removed members - **FAILS** (query filters excluded members but FK still wrong)

**Scenarios NOT Affected:**
- Other queries that don't use this FK join syntax
- Direct queries to `organization_memberships` without joins
- Queries using different FK relationship (if any)

**Workarounds (none practical):**
- Cannot manually load members (requires database access)
- Cannot skip member review step (required by UI flow)
- Cannot proceed with deactivation at all

---

## Impact Assessment

| Severity | Assessment |
|----------|------------|
| **Critical** | Feature completely broken - 100% failure rate |
| **User Impact** | All owners attempting deactivation are blocked |
| **Data Risk** | None - read operation only |
| **Frequency** | Every attempt |
| **Workaround** | None available to users |

---

## Fix Plan

### BUG-001 [P0] Fix foreign key constraint name in getAllOrgMembers

**File:** `src/lib/services/organizationDeactivationService.ts`
**Lines:** 127-138
**Priority:** P0 - Blocks all deactivations
**Estimated Time:** 5 minutes

**Approach:**

Update the FK reference to match the actual database constraint name. There are two options:

**Option A (Recommended):** Use the actual FK constraint name
```typescript
const { data: memberships, error: membershipsError } = await supabase
  .from('organization_memberships')
  .select(
    `
    user_id,
    role,
    profiles!organization_memberships_profiles_fk(id, email, full_name)
  `
  )
```

**Option B:** Let PostgREST auto-detect the FK (remove explicit hint)
```typescript
const { data: memberships, error: membershipsError } = await supabase
  .from('organization_memberships')
  .select(
    `
    user_id,
    role,
    profiles(id, email, full_name)
  `
  )
```

**Recommended:** Option A is more explicit and prevents future ambiguity if multiple FKs exist.

**Dependencies:** None
**Blocks:** All deactivation functionality

**Code Changes:**
```diff
- profiles!organization_memberships_user_id_fkey(id, email, full_name)
+ profiles!organization_memberships_profiles_fk(id, email, full_name)
```

**Test Cases:**
- ✅ Load members for org with owner only (1 member)
- ✅ Load members for org with multiple members
- ✅ Load members for org with removed members (excluded from results)
- ✅ Verify correct member data returned (id, email, full_name, role)
- ✅ Proceed through all 3 deactivation dialog steps
- ✅ Successfully deactivate organization

---

### BUG-002 [P2] Improve error message specificity

**File:** `src/lib/services/organizationDeactivationService.ts`
**Lines:** 147-150
**Priority:** P2 - Quality of life improvement
**Estimated Time:** 5 minutes

**Current Error Handling:**
```typescript
} catch (error) {
  logger.error('[OrganizationDeactivationService] Error fetching org members:', error);
  throw error;
}
```

**Issue:** Generic error message doesn't help user understand if it's:
- System configuration issue (should report to support)
- Network issue (retry might work)
- Permission issue (check their role)

**Approach:** Add error type detection and user-friendly messages

```typescript
} catch (error) {
  logger.error('[OrganizationDeactivationService] Error fetching org members:', error);

  // Check for common error patterns
  if (error?.code === 'PGRST200') {
    // Schema relationship error - system configuration issue
    logger.error('PostgREST schema relationship error - check FK constraints');
    throw new Error('System configuration error. Please contact support.');
  }

  if (error?.message?.includes('network')) {
    throw new Error('Network error. Please check your connection and try again.');
  }

  throw error; // Re-throw unknown errors
}
```

**Dependencies:** None (can be done independently of BUG-001)

**Test Cases:**
- ✅ PGRST200 error shows "System configuration error"
- ✅ Network error shows "Network error"
- ✅ Unknown errors still bubble up with original message

---

### BUG-003 [P3] Add FK constraint verification migration

**File:** New migration file
**Priority:** P3 - Prevent future regressions
**Estimated Time:** 10 minutes

**Approach:** Create a migration that verifies the expected FK constraint exists

```sql
-- Verify organization_memberships → profiles FK exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organization_memberships_profiles_fk'
    AND conrelid = 'organization_memberships'::regclass
  ) THEN
    RAISE EXCEPTION 'Missing FK constraint: organization_memberships_profiles_fk';
  END IF;
END $$;
```

This makes future schema issues fail fast at migration time instead of at runtime.

---

## Test Plan

### Manual Testing

**Prerequisites:**
1. Have an organization with at least 1 member (owner)
2. Be logged in as the owner
3. Navigate to Organization Settings

**Test Case 1: Single Owner Deactivation**
- [ ] Click "Deactivate Organization"
- [ ] Select deactivation reason
- [ ] Click "Continue"
- [ ] **Expected:** Members list loads showing owner (you)
- [ ] **Expected:** No PGRST200 error in console
- [ ] Check "I understand" checkbox
- [ ] Click "Continue to Confirmation"
- [ ] Type "DEACTIVATE"
- [ ] Click "Deactivate Organization"
- [ ] **Expected:** Success toast, redirected to org selection

**Test Case 2: Multi-Member Organization**
- [ ] Create org with 2-3 members
- [ ] As owner, start deactivation flow
- [ ] Click "Continue" at step 1
- [ ] **Expected:** All members shown in list with correct names/emails/roles
- [ ] Complete deactivation
- [ ] **Expected:** All members lose access

**Test Case 3: Organization With Removed Members**
- [ ] Create org with 3 members
- [ ] Remove 1 member (set member_status='removed')
- [ ] Start deactivation
- [ ] **Expected:** Only 2 active members shown (removed member excluded)

**Test Case 4: Error Handling**
- [ ] Disconnect network
- [ ] Start deactivation flow
- [ ] **Expected:** Clear error message (not generic "failed")

### Automated Testing

**Unit Test: getAllOrgMembers with correct FK**
```typescript
describe('getAllOrgMembers', () => {
  it('should load members using correct FK constraint name', async () => {
    const orgId = 'test-org-id';
    const members = await getAllOrgMembers(orgId);

    expect(members).toBeDefined();
    expect(Array.isArray(members)).toBe(true);
  });

  it('should exclude removed members', async () => {
    // Test that member_status='removed' are filtered out
  });

  it('should handle PGRST200 errors gracefully', async () => {
    // Mock PGRST200 error response
    // Verify user-friendly error message
  });
});
```

**Integration Test: Full Deactivation Flow**
```typescript
describe('Organization Deactivation', () => {
  it('should complete deactivation with owner as only member', async () => {
    // Create org with owner only
    // Start deactivation
    // Load members
    // Verify owner shown
    // Complete deactivation
    // Verify org.is_active = false
  });

  it('should show all active members in review step', async () => {
    // Create org with 3 members (1 removed)
    // Load members for deactivation
    // Verify only 2 active members returned
  });
});
```

---

## Prevention

**How did this happen?**

1. Migration `20260202213000` changed FK from `auth.users` → `profiles`
2. Migration created new constraint with different name
3. Code wasn't updated to reference new constraint name
4. No automated test caught the mismatch
5. Feature likely wasn't manually tested after migration

**Prevention Measures:**

1. **FK Name Convention:** Establish naming convention for FK constraints
   - Format: `{source_table}_{target_table}_fk`
   - OR: `{source_table}_{column}_fkey`
   - Document which convention is used

2. **Code Search on FK Changes:** When renaming/changing FK:
   ```bash
   git grep -n "old_fk_name"  # Find all references before migrating
   ```

3. **Integration Tests:** Add tests that actually query with joins
   - Current tests might mock Supabase, missing real FK issues
   - Add E2E tests that hit real database

4. **Migration Checklist:**
   ```markdown
   - [ ] Search codebase for old FK name references
   - [ ] Update all PostgREST join syntax
   - [ ] Run integration tests
   - [ ] Manual test affected features
   ```

5. **Static Analysis:** Consider linting rule to detect FK references
   - Flag `profiles!{anything}_fkey(...)` patterns
   - Require FK names match database schema

---

## Additional Context

### Related Files

- `src/lib/services/organizationDeactivationService.ts` - Service with bug
- `src/components/dialogs/DeactivateOrganizationDialog.tsx` - UI that calls service
- `supabase/migrations/20260202213000_add_organization_memberships_profiles_fk.sql` - Migration that created new FK
- `supabase/migrations/00000000000000_baseline.sql` - Shows old FK name

### PostgREST Resource Embedding Syntax

**Auto-detect (implicit):**
```typescript
.select('organization_memberships(*, profiles(*))')
```
PostgREST automatically finds FK relationships. Works if only one FK exists between tables.

**Explicit FK hint:**
```typescript
.select('profiles!organization_memberships_profiles_fk(id, email)')
```
Tells PostgREST exactly which FK constraint to use. Required if:
- Multiple FKs exist between same tables
- You want to be explicit/self-documenting
- Performance optimization (skips FK lookup)

**The Bug:**
Code used explicit FK hint with wrong constraint name → PostgREST FK lookup fails → PGRST200 error

---

## Technical Notes

### Why PGRST200?

PostgREST error codes:
- `PGRST200`: Schema relationship not found
- `PGRST116`: Row not found (if using `.single()`)
- `PGRST301`: Forbidden (RLS policy)

Our error is PGRST200 because PostgREST searches `pg_constraint` table for the exact FK constraint name. When not found, it cannot establish the relationship between tables.

### FK Constraint Lookup Query

PostgREST internally runs something like:
```sql
SELECT conname, confrelid
FROM pg_constraint
WHERE conrelid = 'organization_memberships'::regclass
  AND conname = 'organization_memberships_user_id_fkey';  -- Not found!
```

Since `organization_memberships_user_id_fkey` doesn't exist, PostgREST throws PGRST200.

The actual FK constraint is `organization_memberships_profiles_fk`:
```sql
SELECT conname FROM pg_constraint
WHERE conrelid = 'organization_memberships'::regclass
  AND confrelid = 'profiles'::regclass;
-- Returns: organization_memberships_profiles_fk
```

---

## Summary

| Aspect | Details |
|--------|---------|
| **Root Cause** | FK constraint name mismatch between code and database |
| **Location** | `organizationDeactivationService.ts:133` |
| **Fix** | Change `organization_memberships_user_id_fkey` → `organization_memberships_profiles_fk` |
| **Severity** | Critical - feature completely broken |
| **Estimated Fix Time** | 5 minutes (1 line change) |
| **Testing Time** | 15 minutes |
| **Priority** | P0 - Fix immediately |

---

**Next Steps:**
1. Apply BUG-001 fix (update FK constraint name)
2. Test deactivation flow manually
3. Run integration tests
4. Consider BUG-002 (better error messages)
5. Consider BUG-003 (FK verification migration)
