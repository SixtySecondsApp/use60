# Manual Enrichment Flow Execution Trace

## SYMPTOM SUMMARY
User selects "I don't have a website" → fills manual enrichment Q&A → submitted → redirected to `website_input` step → system syncs to `enrichment_result` without user action.

Console logs show:
1. Route to manual_enrichment ✓
2. Route to enrichment_loading ✓
3. **ERROR**: "No organizationId - cannot proceed with enrichment. Redirecting to website_input"
4. Route to website_input ✓
5. Manual enrichment polling begins
6. Route to enrichment_result ✓

---

## EXECUTION PATH: Manual Enrichment Submit Flow

### Entry Point
**File**: `src/pages/onboarding/v2/ManualEnrichmentStep.tsx` (Line 106-133)

```typescript
const handleNext = async () => {
  // ...validation...
  if (isLastQuestion) {
    const manualData: ManualEnrichmentData = { ... };
    setManualData(manualData);  // (1) SET MANUAL DATA IN STORE
    await submitManualEnrichment(organizationId);  // (2) SUBMIT WITH organizationId
  }
}
```

**organizationId Source** (Line 100):
```typescript
const organizationId = storeOrgId || propOrgId;
// storeOrgId = from Zustand store
// propOrgId = passed as prop from OnboardingV2.tsx line 291
```

**Critical**: `organizationId` comes from **props**, but it's **empty** for personal email users!

---

### Call Chain

#### 1. **submitManualEnrichment**
**File**: `src/lib/stores/onboardingV2Store.ts` (Line 1073-1132)

```typescript
submitManualEnrichment: async (organizationId) => {
  let finalOrgId = organizationId;  // (A) Receives empty string for personal email users
  const { manualData } = get();
  if (!manualData) return;

  set({
    isEnrichmentLoading: true,
    enrichmentError: null,
    enrichmentSource: 'manual',
    currentStep: 'enrichment_loading',  // (B) STEP 1: Routes to enrichment_loading
  });

  try {
    const { data: { session } } = await supabase.auth.getSession();

    // (C) RACE CONDITION POINT 1: If organizationId is empty
    if (!finalOrgId || finalOrgId === '') {
      // Creates new org from manual data
      finalOrgId = await get().createOrganizationFromManualData(session.user.id, manualData);

      if (!finalOrgId) {
        // Returned null from selection step - STOP HERE
        set({ isEnrichmentLoading: false });
        return;  // (D) Early exit if user needs to select org
      }
      set({ organizationId: finalOrgId });  // (E) UPDATE STORE WITH NEW ORG ID
    }

    // Invoke edge function
    const { data, error } = await supabase.functions.invoke('deep-enrich-organization', {
      body: {
        action: 'manual',
        organization_id: finalOrgId,
        manual_data: manualData,
      },
    });

    // Start polling
    get().pollEnrichmentStatus(finalOrgId);  // (F) Begin async polling
  }
}
```

**STATE MUTATIONS**:
- Line 1078-1083: `set({ isEnrichmentLoading: true, currentStep: 'enrichment_loading' })`
- Line 1098: `set({ organizationId: finalOrgId })`
- Line 1095: `set({ isEnrichmentLoading: false })`
- Line 1126: `get().pollEnrichmentStatus(finalOrgId)` (async)

**KEY ISSUE**: Organization creation is **async** and happens INSIDE the try block

---

#### 2. **createOrganizationFromManualData**
**File**: `src/lib/stores/onboardingV2Store.ts` (Line 842-970+)

```typescript
createOrganizationFromManualData: async (userId, manualData) => {
  // ... search for similar orgs ...

  if (similarOrgs && similarOrgs.length > 0 && !highConfidenceMatch) {
    // Return null - this routes to organization_selection step
    set({
      organizationCreationInProgress: false,
      currentStep: 'organization_selection',
      similarOrganizations: similarOrgs,
      matchSearchTerm: organizationName,
    });
    return null;  // ← RETURNS NULL!
  }

  // ... create new organization ...
  const { data: newOrg, error: createError } = await supabase
    .from('organizations')
    .insert({ ... })
    .select('id')
    .single();

  // ...add user as owner...

  return newOrg.id;  // Returns the new organization ID
}
```

---

#### 3. **EnrichmentLoadingStep Mount Guard**
**File**: `src/pages/onboarding/v2/EnrichmentLoadingStep.tsx` (Line 49-55)

```typescript
useEffect(() => {
  if (!organizationId || organizationId === '') {
    console.error('[EnrichmentLoadingStep] No organizationId - cannot proceed with enrichment. Redirecting to website_input');
    setStep('website_input');  // ← REDIRECT HAPPENS HERE!
    return;
  }
}, [organizationId, setStep]);
```

**CRITICAL**: This guard checks `organizationId` prop, which is:
- From `OnboardingV2.tsx` line 301: `organizationId={organizationId}` (prop passed down)
- From `OnboardingV2.tsx` line 279: `const organizationId = activeOrgId || ''`
- **For personal email users**: `activeOrgId` is EMPTY STRING!

---

#### 4. **EnrichmentLoadingStep Second Effect (Line 59-74)**
```typescript
useEffect(() => {
  if (!organizationId || organizationId === '') {
    return;  // Guard above already handles redirect
  }

  // Skip manual enrichment start
  if (!domain && enrichmentSource === 'manual') {
    console.log('EnrichmentLoadingStep: Manual enrichment already started, skipping startEnrichment');
    return;
  }

  // Only start enrichment for website-based flow
  if (domain) {
    startEnrichment(organizationId, domain);
  }
}, [organizationId, domain, startEnrichment, enrichmentSource]);
```

---

#### 5. **OnboardingV2 Store Update Effect**
**File**: `src/pages/onboarding/v2/OnboardingV2.tsx` (Line 249-259)

```typescript
useEffect(() => {
  setOrganizationId(organizationId);  // Sync prop to store
  if (userEmail) {
    setUserEmail(userEmail);
  } else if (domain) {
    setDomain(domain);
  }
}, [organizationId, domain, userEmail, setOrganizationId, setDomain, setUserEmail]);
```

**PROBLEM**: `organizationId` prop is **EMPTY** initially!

---

#### 6. **Database Sync Effect**
**File**: `src/pages/onboarding/v2/OnboardingV2.tsx` (Line 227-246)

```typescript
useEffect(() => {
  const syncStepToDatabase = async () => {
    if (!currentStep || currentStep === 'complete' || !user) return;

    try {
      await supabase
        .from('user_onboarding_progress')
        .update({ onboarding_step: currentStep })
        .eq('user_id', user.id);

      console.log('[OnboardingV2] Synced step to database:', currentStep);
    }
  };

  const timeout = setTimeout(syncStepToDatabase, 1000);
  return () => clearTimeout(timeout);
}, [currentStep, user]);
```

**NOTE**: Syncs `website_input` to DB (not the actual current step!)

---

#### 7. **Polling Completes**
**File**: `src/lib/stores/onboardingV2Store.ts` (Line 1209-1252)

```typescript
const poll = async () => {
  try {
    const { data, error } = await supabase.functions.invoke('deep-enrich-organization', {
      body: {
        action: 'status',
        organization_id: organizationId,
      },
    });

    if (status === 'completed' && enrichment) {
      // Update org name
      // Load skills into state
      set({
        enrichment,
        skillConfigs: generatedSkills,
        isEnrichmentLoading: false,
        currentStep: 'enrichment_result',  // ← AUTO-ADVANCE!
        pollingStartTime: null,
        pollingAttempts: 0,
      });
      return;
    }

    // Continue polling
    setTimeout(() => get().pollEnrichmentStatus(organizationId), POLL_INTERVAL);
  }
}
```

---

## ROOT CAUSE ANALYSIS

### The Race Condition

**Timeline**:

```
T0: User submits manual enrichment from ManualEnrichmentStep
    └─ organizationId = "" (empty string from props)
    └─ Calls submitManualEnrichment("")

T1: submitManualEnrichment sets state
    └─ set({ currentStep: 'enrichment_loading' })
    └─ Triggers re-render → EnrichmentLoadingStep mounts
    └─ ASYNC: createOrganizationFromManualData() called

T2: EnrichmentLoadingStep mounts with organizationId = "" (still from props)
    └─ Guard effect checks: if (!organizationId)
    └─ Sets: currentStep = 'website_input' ← OVERWRITES the enrichment_loading state!
    └─ Component unmounts

T3: Later, createOrganizationFromManualData resolves
    └─ ASYNC CALLBACK: set({ organizationId: newOrgId })
    └─ But we're already on website_input step!

T4: pollEnrichmentStatus eventually runs in background
    └─ organizationId is NOW SET in store
    └─ Polling completes successfully
    └─ set({ currentStep: 'enrichment_result' })
    └─ User sees jump from website_input to enrichment_result
```

### Why This Happens

1. **Props don't update in time**: `ManualEnrichmentStep.tsx` receives `organizationId={organizationId}` from props, which is empty for personal email users

2. **Store and props are out of sync**:
   - `submitManualEnrichment` updates `currentStep` in store
   - But `EnrichmentLoadingStep` mounts with stale `organizationId` prop (still empty)
   - The component's guard effect redirects BEFORE the store's `organizationId` is updated

3. **Async operations complete out of order**:
   - Step change (sync) → Component mount with empty organizationId
   - Guard redirects (sync)
   - Organization creation completes (async)
   - Polling completes (async)
   - These update the step again

---

## AFFECTED CODE LOCATIONS

```yaml
execution_paths:
  - name: "Manual Enrichment Submit Flow"
    entry: "ManualEnrichmentStep:handleNext"
    chain:
      - "ManualEnrichmentStep.tsx:106 - handleNext()"
      - "ManualEnrichmentStep.tsx:128 - setManualData()"
      - "ManualEnrichmentStep.tsx:129 - submitManualEnrichment(organizationId)"
      - "onboardingV2Store.ts:1073 - submitManualEnrichment()"
      - "onboardingV2Store.ts:1078-1083 - set({ currentStep: 'enrichment_loading' })"
      - "onboardingV2Store.ts:1091 - createOrganizationFromManualData() [ASYNC]"
      - "EnrichmentLoadingStep.tsx:49-55 - useEffect guard (mounts with stale prop)"
      - "EnrichmentLoadingStep.tsx:52 - setStep('website_input') [OVERWRITES]"
      - "onboardingV2Store.ts:842 - createOrganizationFromManualData() [COMPLETES ASYNC]"
      - "onboardingV2Store.ts:1098 - set({ organizationId: finalOrgId })"
      - "onboardingV2Store.ts:1126 - pollEnrichmentStatus() [ASYNC POLLING]"
      - "onboardingV2Store.ts:1248 - set({ currentStep: 'enrichment_result' })"

    state_mutations:
      - "onboardingV2Store.ts:1078-1083 - set({ isEnrichmentLoading: true, currentStep: 'enrichment_loading' })"
      - "EnrichmentLoadingStep.tsx:52 - setStep('website_input') [RACE CONDITION]"
      - "onboardingV2Store.ts:1098 - set({ organizationId: finalOrgId })"
      - "onboardingV2Store.ts:1248 - set({ currentStep: 'enrichment_result' })"

    async_points:
      - "onboardingV2Store.ts:1086 - supabase.auth.getSession()"
      - "onboardingV2Store.ts:1091 - createOrganizationFromManualData() [ENTIRE FUNCTION]"
      - "onboardingV2Store.ts:1114 - supabase.functions.invoke('deep-enrich-organization')"
      - "onboardingV2Store.ts:1126 - pollEnrichmentStatus() [ASYNC RECURSION]"

suspicious_patterns:
  - location: "ManualEnrichmentStep.tsx:100"
    pattern: |
      const organizationId = storeOrgId || propOrgId;
      // storeOrgId is from Zustand store (may be empty)
      // propOrgId is from parent component prop (empty for personal email users)
      // This is used to call submitManualEnrichment(organizationId) at line 129
      // But submitManualEnrichment EXPECTS organizationId to be defined OR will create one async
    risk: "high"
    issue: "Empty organizationId passed to submitManualEnrichment causes async org creation"

  - location: "EnrichmentLoadingStep.tsx:49-55"
    pattern: |
      useEffect(() => {
        if (!organizationId || organizationId === '') {
          console.error('[EnrichmentLoadingStep] No organizationId - cannot proceed...');
          setStep('website_input');  // ← REDIRECTS!
          return;
        }
      }, [organizationId, setStep]);
    risk: "high"
    issue: |
      This guard runs BEFORE organizationId is updated by submitManualEnrichment.
      The component receives stale prop value (empty string).
      Guard redirects to website_input, overwriting the enrichment_loading step.
      When organizationId is LATER set by submitManualEnrichment, the guard doesn't run again
      because the component is already unmounted/replaced.

  - location: "OnboardingV2.tsx:301"
    pattern: |
      <EnrichmentLoadingStep
        key="loading"
        domain={effectiveDomain}
        organizationId={organizationId}  // ← PASSED FROM PROP
      />
    risk: "high"
    issue: |
      organizationId prop comes from line 279: const organizationId = activeOrgId || ''
      For personal email users, activeOrgId is empty.
      This component receives empty string, guard fires immediately.

  - location: "onboardingV2Store.ts:1091"
    pattern: |
      finalOrgId = await get().createOrganizationFromManualData(session.user.id, manualData);
      if (!finalOrgId) {
        set({ isEnrichmentLoading: false });
        return;  // Early exit if selection step shown
      }
      set({ organizationId: finalOrgId });
    risk: "medium"
    issue: |
      Organization creation is ASYNC but happens in the middle of a state update.
      The state ({ currentStep: 'enrichment_loading' }) is set BEFORE this async operation.
      Meanwhile, EnrichmentLoadingStep mounts with empty organizationId and redirects.
      The async completion of org creation (line 1098) happens after the redirect.

  - location: "onboardingV2Store.ts:1078-1083"
    pattern: |
      set({
        isEnrichmentLoading: true,
        enrichmentError: null,
        enrichmentSource: 'manual',
        currentStep: 'enrichment_loading',  // ← SET BEFORE ORG CREATION COMPLETES
      });
    risk: "high"
    issue: |
      Step is set SYNCHRONOUSLY before organizationId is determined.
      Component mounts with stale prop before async org creation completes.
      No dependency on organizationId being available before mounting EnrichmentLoadingStep.

  - location: "onboardingV2Store.ts:1290-1310"
    pattern: |
      // In pollEnrichmentStatus - recursive polling
      if (status === 'completed' && enrichment) {
        set({
          enrichment,
          skillConfigs: generatedSkills,
          isEnrichmentLoading: false,
          currentStep: 'enrichment_result',  // ← AUTO-ADVANCES FROM website_input
          pollingStartTime: null,
          pollingAttempts: 0,
        });
        return;
      }

      setTimeout(() => get().pollEnrichmentStatus(organizationId), POLL_INTERVAL);
    risk: "medium"
    issue: |
      Polling happens asynchronously in the background.
      When it completes, it overwrites currentStep (possibly to enrichment_result).
      This is why users see the jump from website_input to enrichment_result.
      The step should only advance if we're in the correct step (enrichment_loading).
```

---

## SUMMARY

The manual enrichment flow has a **critical race condition** where:

1. **Organization creation is asynchronous** but `currentStep` is set synchronously to `enrichment_loading`
2. **EnrichmentLoadingStep receives a stale `organizationId` prop** (empty string) and its guard effect redirects to `website_input`
3. **The async organization creation completes later**, updating the store's `organizationId`
4. **Polling completes asynchronously**, auto-advancing to `enrichment_result`
5. **User sees a jump** from `website_input` → `enrichment_result` without clicking anything

**Fix required**: The `currentStep` should only be set to `enrichment_loading` AFTER the organization ID is confirmed (either from props or created from manual data).
