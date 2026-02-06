# RLS 42501 Error Root Cause Analysis

**Date**: 2026-02-05
**Severity**: 🔴 CRITICAL
**Root Cause**: State transition race condition in onboarding manual enrichment
**Error Code**: 42501 - "new row violates row-level security policy for table organization_memberships"

---

## The Symptom vs The Root Cause

### What the User Reported
```
Action: Fill manual enrichment form → Click "Complete"
Expected: Organization created, move to enrichment_loading → enrichment_result
Actual: RLS error 42501 on organization_memberships, redirect to start
Network Error: {
  "code": "42501",
  "details": null,
  "hint": null,
  "message": "new row violates row-level security policy for table \"organization_memberships\""
}
```

### What's Actually Happening

The RLS error is **NOT caused by incorrect RLS policy logic**. Instead, it's a **symptom of a race condition** that causes the `organization_memberships.upsert()` to execute with **incorrect authentication context**.

---

## Root Cause: State Transition Race Condition

### Timeline of the Bug

```
T0 (0ms):     submitManualEnrichment() called with empty organizationId
              User is authenticated via Supabase JWT

T1 (0ms):     set({ currentStep: 'enrichment_loading', ... })
              ↓ SYNC UPDATE - React subscribers notified immediately

T2 (0-1ms):   React re-renders, EnrichmentLoadingStep mounts
              organizationId is still "" (async operation not complete)
              ↓ Component reads stale state

T3 (0-1ms):   EnrichmentLoadingStep guard useEffect fires
              Condition: if (!organizationId || organizationId === '')
              Action: setStep('website_input') ← OVERWRITES enrichment_loading!
              ↓ Step transitions BACKWARDS

T4 (10-50ms): createOrganizationFromManualData() finally completes
              - Creates organization
              - Calls organization_memberships.upsert()
              ✗ BUT: Auth context may have changed during redirect
              ✗ Store state now says step='website_input'
              ✗ organizationId about to be set, but UI already redirected

T5 (10-50ms): set({ organizationId: finalOrgId })
              Too late - component already redirected

T6 (50-100ms): pollEnrichmentStatus() still starts (async doesn't know about redirect)
               Continues polling in background
               Eventually auto-advances to enrichment_result

T7 (1-3s):    Enrichment completes
               set({ currentStep: 'enrichment_result' })
               User sees unexpected jump from website_input to enrichment_result
```

---

## Why RLS Check Fails

### Organization_Memberships INSERT RLS Policy

```sql
CREATE POLICY "organization_memberships_insert" ON "public"."organization_memberships"
  FOR INSERT
  WITH CHECK (
    "public"."is_service_role"()
    OR "app_auth"."is_admin"()
    OR (
      ("user_id" = "auth"."uid"())                           -- Check 1
      AND ("role" = 'owner'::"text")                         -- Check 2
      AND EXISTS (
        SELECT 1 FROM "public"."organizations" "o"
        WHERE ("o"."id" = "organization_memberships"."org_id")
        AND ("o"."created_by" = "auth"."uid"())             -- Check 3
      )
    )
    OR (("user_id" = "auth"."uid"()) AND ("role" = 'member'::"text"))
    OR ("public"."get_org_role"("auth"."uid"(), "org_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))
  );
```

### Why It Fails During Race Condition

The RLS policy requires **all three checks** to pass for a user creating their own org:

1. ✅ **Check 1**: `user_id = auth.uid()` → User inserting their own membership
2. ✅ **Check 2**: `role = 'owner'` → Hardcoded in upsert call
3. ❌ **Check 3**: Organization exists AND `created_by = auth.uid()` → **FAILS**

**Why Check 3 fails**:
- Organization is created **after** the redirect happens
- If there's a timing issue or state corruption from the redirect
- The organization might not exist yet when the upsert is attempted
- Or the `created_by` field might not match the current `auth.uid()`

### The Real Problem

The race condition creates **ambiguous authentication context**:

```typescript
// At T1: User authenticated, organizationId = ""
set({ currentStep: 'enrichment_loading' });

// At T2: Component renders, sees empty organizationId
setStep('website_input');

// At T3-T4: Meanwhile, createOrganizationFromManualData() completes
const { data: newOrg, error: createError } = await supabase
  .from('organizations')
  .insert({
    name: organizationName,
    created_by: userId,  // ← userId from session at T0
    is_active: true,
  })
  .select('id')
  .single();

// At T4: Immediately upsert membership
const { error: memberError } = await supabase
  .from('organization_memberships')
  .upsert({
    org_id: newOrg.id,      // ← Freshly created
    user_id: userId,        // ← From session at T0
    role: 'owner',
  }, {
    onConflict: 'org_id,user_id'
  });
```

**The issue**: During the race condition, if the application state becomes inconsistent, the RLS check for "organization created by this user" might fail due to:
- Session token validation issues
- Store state inconsistency propagating to database layer
- Race condition in organization creation itself

---

## Evidence from Code

### File: src/lib/stores/onboardingV2Store.ts (lines 1078-1098)

**Current BUGGY code**:
```typescript
set({
  isEnrichmentLoading: true,
  enrichmentError: null,
  enrichmentSource: 'manual',
  currentStep: 'enrichment_loading',  // ← Set BEFORE organizationId exists
});

try {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No session');

  // Ensure organizationId exists FIRST
  if (!finalOrgId || finalOrgId === '') {
    finalOrgId = await get().createOrganizationFromManualData(session.user.id, manualData);
    // createOrganizationFromManualData calls organization_memberships.upsert() ← HERE IS THE RLS CHECK
    if (!finalOrgId) {
      set({
        isEnrichmentLoading: false,
        enrichmentError: null,
        currentStep already set by createOrganizationFromManualData
      });
      return;
    }
  }
  // ...
  set({
    organizationId: finalOrgId,  // ← Set AFTER step change (too late!)
    currentStep: 'enrichment_loading',
  });
```

### File: src/pages/onboarding/v2/EnrichmentLoadingStep.tsx (lines 49-55)

**Current code that causes the redirect**:
```typescript
useEffect(() => {
  if (!organizationId || organizationId === '') {
    console.error('[EnrichmentLoadingStep] No organizationId - cannot proceed');
    setStep('website_input');  // ← Overwrites enrichment_loading
    return;
  }
}, [organizationId, setStep]);
```

---

## Why This Causes RLS 42501

The sequence is:

1. **Async operation starts**: `createOrganizationFromManualData()` begins
2. **Race happens**: Step set to `enrichment_loading` BEFORE organizationId ready
3. **Component mounts with stale state**: EnrichmentLoadingStep sees empty organizationId
4. **Guard fires**: Step changes back to `website_input`
5. **State becomes inconsistent**: App state says `website_input` but `createOrganizationFromManualData()` is still running
6. **Organization creation completes**: With session from T0, but app state now corrupted
7. **Membership upsert called**: With potentially stale/mismatched session context
8. **RLS check fails**: Due to state inconsistency

---

## Fix: Ensure Atomic State Update

The solution is to **create the organization FIRST, then set both organizationId and currentStep atomically**:

```typescript
set({
  isEnrichmentLoading: true,
  enrichmentError: null,
  enrichmentSource: 'manual',
  // DON'T set currentStep yet
});

try {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No session');

  // Create organization FIRST
  if (!finalOrgId || finalOrgId === '') {
    finalOrgId = await get().createOrganizationFromManualData(session.user.id, manualData);
    if (!finalOrgId) {
      set({ isEnrichmentLoading: false });
      return;
    }
  }

  // NOW set both organizationId and currentStep together (atomic)
  set({
    organizationId: finalOrgId,
    currentStep: 'enrichment_loading',  // ← Set WITH organizationId
  });

  // Continue...
```

This ensures:
- ✅ Organization created (with valid RLS context)
- ✅ Organization membership inserted (RLS check succeeds)
- ✅ organizationId set in store
- ✅ currentStep set to enrichment_loading
- ✅ React renders with valid state
- ✅ EnrichmentLoadingStep mounts with valid organizationId
- ✅ Guard doesn't fire

---

## Bug Fixes Required

| Bug ID | Issue | File | Severity | Est Time |
|--------|-------|------|----------|----------|
| BUG-001 | Fix state transition order (DON'T set currentStep before organizationId) | onboardingV2Store.ts:1078-1125 | 🔴 P0 | 15m |
| BUG-002 | Ensure atomic state update | onboardingV2Store.ts:1098 | 🔴 P0 | 5m |
| BUG-003 | Add polling guard to stop if organizationId cleared | onboardingV2Store.ts:1176-1286 | 🟠 P1 | 10m |
| BUG-004 | Add enrichment source check to guard | EnrichmentLoadingStep.tsx:49-55 | 🟠 P1 | 10m |
| BUG-005 | Add validation before polling | onboardingV2Store.ts:1126 | 🟡 P2 | 5m |
| BUG-006 | Improve error handling for org selection | onboardingV2Store.ts:1093 | 🟡 P2 | 5m |

**Root Cause Fix**: BUG-001 + BUG-002 (20 minutes)
**Preventative Fixes**: BUG-003 through BUG-006 (30 minutes)

---

## Next Steps

1. Run `/60-bugfix` to implement BUG-001 through BUG-006
2. Test manual enrichment flow with personal email
3. Verify: No RLS 42501 error
4. Verify: Step transitions properly without redirect
5. Verify: Enrichment completes successfully

The existing `.sixty/bugs/onboarding-manual-enrichment-race-condition.md` already documents the complete analysis and fix plan.
