# Consult Report: Onboarding Launch Hardening
Generated: 2026-02-26

## User Request
Comprehensive onboarding audit for public launch readiness. User reported: domain picker auto-selects wrong domain, no join-existing-org option, infinite enrichment items, tab checkmarks broken, Start Over causes logout, post-enrichment logout, bot icon/animation issues, missing settings link.

## Agent Team Deployed
- 3 initial consult agents (Codebase Scout, Risk Scanner, UI Auditor)
- 5 Sonnet investigators (domain picker, auth cascade, org join, UI polish, additional bugs)
- 1 Opus synthesizer (plan creation)

## User Decisions
1. All items (P0 + P1 + P2) in one batch
2. Admin approval always required for org joining

---

## Critical Bug #1: Auth Cascade Logout on Start Over

### Root Cause Chain
1. `resetAndCleanup()` deletes org + membership from DB
2. `pollEnrichmentStatus()` has orphaned `setTimeout` — ID never stored (line 1499)
3. Next poll fires 2s later, calls `refreshSession()` on deleted org
4. RLS blocks query → auth state becomes unstable
5. `queryClient.clear()` triggers async re-fetches
6. `SIGNED_OUT` handler in AuthContext has NO guard for `isResettingOnboarding`
7. Auth cleared → user logged out → redirected to login

### Files
- `src/lib/stores/onboardingV2Store.ts` (lines 1499, 1990-2054)
- `src/lib/contexts/AuthContext.tsx` (lines 268-295)
- `src/components/ProtectedRoute.tsx` (lines 358-362)

### Fix (OLH-001 + OLH-002)
1. Store setTimeout ID → cancel before reset
2. Guard SIGNED_OUT handler with `isResettingOnboarding` check
3. Delay clearing `isResettingOnboarding` by 200ms after reset()

---

## Critical Bug #2: Domain Picker Race Condition

### Root Cause Chain
1. `EnrichmentLoadingStep` mounts → `useEffect` at line 87 fires
2. `startEnrichment(organizationId, domain)` called immediately
3. `domain` prop = email domain (set in `setUserEmail()` line 622)
4. Domain picker UI renders at line 253 — AFTER enrichment already started
5. `resolvedResearchDomain` is null → fallback to email domain
6. User clicks picker → sets `resolvedResearchDomain` — but enrichment already running

### Additional Issues
- Double `setUserEmail()` call in OnboardingV2.tsx (lines 322 and 331)
- `createNewOrganization()` also ignores `resolvedResearchDomain`
- Duplicate `startEnrichment` call from OnboardingV2.tsx useEffect (line 341-346)

### Files
- `src/pages/onboarding/v2/EnrichmentLoadingStep.tsx` (lines 87-102, 253-286)
- `src/lib/stores/onboardingV2Store.ts` (lines 619-625, 1343, 1913-1917)
- `src/pages/onboarding/v2/OnboardingV2.tsx` (lines 313-346)

### Fix (OLH-003)
1. Add `if (hasDomainMismatch) return` guard to mount useEffect
2. Add `hasDomainMismatch` to dependency array
3. Remove duplicate setUserEmail and startEnrichment useEffects
4. Fix createNewOrganization to use resolvedResearchDomain

---

## Critical Bug #3: Org Matching Failures

### GAP 1: RLS blocks exact-match query (dead code)
- `setUserEmail()` line 522 and `submitWebsite()` line 708
- Direct `.from('organizations').select(...).eq('company_domain', domain)` blocked by RLS
- New user has no membership → policy blocks SELECT → always returns null
- Fuzzy RPC (SECURITY DEFINER) compensates, but exact-match code path is dead

### GAP 2: createNewOrganization has no safeguards
- OrganizationSelectionStep allows creating new org even with 100% match showing
- New org has NO company_domain set → UNIQUE constraint doesn't fire
- No confirmation dialog

### GAP 3: Logic inversion in manual data path
- `createOrganizationFromManualData()` line 1023
- `if (similarOrgs.length > 0 && !highConfidenceMatch)` → routes to selection when LOW confidence
- HIGH confidence matches skip selection entirely → wrong

### GAP 4: Wrong requestId in requiresApproval path
- `pendingJoinRequest.requestId` set to `newOrg.id` (org UUID), not join_request row ID
- PendingApprovalStep fails to look up the request → "Organization Name Unavailable"

### GAP 5: Domain as org name
- OrganizationSelectionStep shows "Create New Organization: 'sixtyseconds.video'" (raw domain)

### Files
- `src/lib/stores/onboardingV2Store.ts` (lines 522, 708, 1023, 1090-1106, 1884-1922)
- `src/pages/onboarding/v2/OrganizationSelectionStep.tsx`
- Migration needed for SECURITY DEFINER RPC

### Fix (OLH-005)
New RPC, fix logic inversion, set company_domain, correct requestId, proper org naming

---

## P1 Bugs

### Tab Checkmarks (OLH-009)
- `skillStatuses` only updated on explicit Save/Skip click
- Jumping to later tab leaves intermediate tabs as 'pending'
- `isLoadingSkills` condition always false (defaultSkillConfigs always has key)

### Input Limits (OLH-010)
- MAX_ITEMS=10 enforced on add button but no character counters on list fields
- Paste bypass possible on AddItemButton/EditableItem
- User wants word cap on objections
- `select('*')` in EnrichmentResultStep

### Double-Submit (OLH-006)
- WebsiteInputStep: no loading state, button re-clickable
- ManualEnrichmentStep: no loading state on Complete button
- OrganizationSelectionStep: only selected card disabled, others clickable

### Error Handling (OLH-007)
- handleSubmitWebsite: no try/catch (unhandled promise rejection)
- saveAllSkills: returns false silently, no toast
- Enrichment timeout conflated with retry count

### PendingApprovalStep (OLH-008)
- maybeSingle() on memberships — multi-row PGRST116
- Placeholder cleanup uses fragile name matching
- Cancel button same color as primary

### CompletionStep (OLH-011)
- Credits granted twice (both navigation paths)
- completeStep failure → navigate anyway → infinite redirect loop

### ProtectedRoute (OLH-012)
- Wrong hook import (useOrganizationContext returns React Query object)
- activeOrgId always undefined → org-active guard never fires

---

## P2 UI Polish

### Sales Assistant Animation (OLH-013)
- AssistantOverlay: no animation (instant appear/disappear)
- CommandCenter: full spring system (scale 0.95→1, y 20→0, spring 300/30)
- Quick actions: scrollbar-hide instead of scrollbar-custom

### Icon Consistency (OLH-014)
- Assistant popup: Brain icon (violet gradient)
- Sidebar nav: Bot icon
- No Settings button in popup at all

### Minor UI (OLH-015)
- Domain picker buttons overflow on mobile
- "Analyzing " empty string for manual path
- AgentConfigConfirmStep stale enrichment dep
- Quick Add tab hidden on mobile with no fallback

---

## P3 Issues (tracked but deferred)
- No aria-live regions for enrichment progress
- autoFocus during exit animation clashes
- isResuming never reset to false
- localStorage key inconsistency (email vs ID) — addressed in OLH-012
- Multi-tab store race (no clean fix without server-side locking)

---

## Execution Plan Summary

| Phase | Stories | Parallel Groups | Est. Time |
|-------|---------|----------------|-----------|
| 1: Critical Infrastructure | OLH-001→005 | [001,003,005] then [002,004] | 2.5 hrs |
| 2: Data Integrity | OLH-006→008, 011, 012 | [006,007,008] then [011,012] | 1.8 hrs |
| 3: UX Fixes | OLH-009→010, 013→015 | [009,010] + [013,014,015] | 1.6 hrs |
| 4: Verification | OLH-016 | Sequential | 0.5 hrs |
| **Total** | **16 stories** | **4 phases** | **~6.4 hrs** |
