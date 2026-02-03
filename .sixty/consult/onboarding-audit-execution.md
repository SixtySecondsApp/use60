# Execution Plan: Onboarding Flow Bug Fixes

**Feature**: `onboarding-audit`
**Source**: `.sixty/consult/onboarding-audit.md`
**Plan**: `.sixty/plan.json`
**Branch**: `fix/go-live-bug-fixes`

---

## Execution Order

### Phase 1: CRITICAL (run in parallel)

#### OB-001: Add domain check for business email users before enrichment
- **Bug**: 1 + Gap 1
- **File**: `src/lib/stores/onboardingV2Store.ts`
- **What**: `setUserEmail()` at line 455 skips org domain check for business emails, causing duplicate orgs
- **Fix**:
  1. Make `setUserEmail` async (or add follow-up async action)
  2. Extract domain from business email
  3. Query `organizations` by `company_domain` (exact match, line 509-514 pattern)
  4. Fallback to `find_similar_organizations_by_domain` RPC (line 520-528 pattern)
  5. Single match → auto-join org (create membership)
  6. Multiple matches → `currentStep = 'organization_selection'`
  7. No match → proceed to `enrichment_loading` as before

#### OB-002: Fix PendingApprovalPage to mark onboarding complete on approval
- **Bug**: 8
- **File**: `src/pages/auth/PendingApprovalPage.tsx`
- **What**: Approval handler at line 147 navigates to `/dashboard` without marking onboarding complete → redirect loop
- **Fix**:
  1. Before `toast.success` at line 149, add:
     ```ts
     await supabase.from('user_onboarding_progress').upsert({
       user_id: user.id,
       onboarding_step: 'complete',
       completed_at: new Date().toISOString()
     }, { onConflict: 'user_id' });
     ```
  2. Clear onboarding localStorage: `localStorage.removeItem(\`sixty_onboarding_${user.id}\`)`

---

### Phase 2: HIGH/MEDIUM (run in parallel)

#### OB-003: Fix entry.company → entry.company_name
- **Bugs**: 3 + 11
- **File**: `src/lib/services/waitlistAdminService.ts`
- **Fix**:
  1. Line 71: change select to `'id, email, full_name, status, company_name'`
  2. Line 74 type: add `company_name: string | null`
  3. Line 134: change `entry.company` to `entry.company_name`
  4. Line 331: change `entry.company` to `entry.company_name`

#### OB-004: Fix submitWebsite multi-org match → show selection UI
- **Bug**: 6
- **File**: `src/lib/stores/onboardingV2Store.ts`
- **Depends on**: OB-001
- **Fix**: At line 526, filter fuzzy matches with score > 0.7. If 2+ matches:
  ```ts
  const highScoreMatches = fuzzyMatches.filter(m => m.similarity_score > 0.7);
  if (highScoreMatches.length > 1) {
    set({ currentStep: 'organization_selection', similarOrganizations: highScoreMatches, matchSearchTerm: domain });
    return;
  }
  ```

#### OB-005: Fix createOrganizationFromManualData return value
- **Bug**: 7
- **File**: `src/lib/stores/onboardingV2Store.ts`
- **Fix**:
  1. Line 704: change `return organizationName;` to `return null;`
  2. In `submitManualEnrichment` (~line 930-940), guard:
     ```ts
     const finalOrgId = await createOrganizationFromManualData(manualData);
     if (finalOrgId) { set({ organizationId: finalOrgId }); }
     ```

#### OB-006: Fix RequestRejectedPage query
- **Bug**: 4
- **File**: `src/pages/auth/RequestRejectedPage.tsx`
- **Fix**:
  1. Line 34: change to `.select('org_id, rejection_reason, organizations(name)')`
  2. Lines 42-44: change to `orgName: data.organizations?.name || 'the organization'`

---

### Phase 3: LOW (run in parallel)

#### OB-007: Unify template type in single vs bulk grant
- **Bug**: 2
- **File**: `src/lib/services/waitlistAdminService.ts`
- **Fix**:
  1. Line 324: change `template_type` from `'waitlist_welcome'` to `'waitlist_invite'`
  2. Add `expiry_time: '7 days'` to variables at line 327

#### OB-008: Add restart/back option during enrichment steps
- **Gap**: 2
- **Files**: `EnrichmentLoadingStep.tsx`, `EnrichmentResultStep.tsx`, `SkillsConfigStep.tsx`
- **Fix**: Add "Start Over" link at bottom of each step. On click: call `onboardingV2Store.reset()`

---

### Phase 4: Verification

#### OB-009: End-to-end test of complete onboarding flow
- **Depends on**: All OB-001 through OB-008
- **Test paths**:
  1. Business email + existing org domain → auto-join → dashboard
  2. Business email + new domain → enrichment → skills → dashboard
  3. Business email + multi-match domain → org selection → choose → dashboard
  4. Personal email + website match → join request → approval → dashboard (no loop)
  5. Personal email + no website → manual enrichment → similar org → selection
  6. Join request denied → restart onboarding OR create own org
  7. Verify company_name in email templates
  8. Verify RequestRejectedPage shows real org name

---

## Quick Reference

| Story | Severity | Files Changed | Parallel Group |
|-------|----------|---------------|----------------|
| OB-001 | CRITICAL | onboardingV2Store.ts | Phase 1 |
| OB-002 | CRITICAL | PendingApprovalPage.tsx | Phase 1 |
| OB-003 | MEDIUM | waitlistAdminService.ts | Phase 2 |
| OB-004 | HIGH | onboardingV2Store.ts | Phase 2 (after OB-001) |
| OB-005 | HIGH | onboardingV2Store.ts | Phase 2 |
| OB-006 | MEDIUM | RequestRejectedPage.tsx | Phase 2 |
| OB-007 | LOW | waitlistAdminService.ts | Phase 3 |
| OB-008 | LOW | Onboarding step components | Phase 3 |
| OB-009 | - | Manual testing | Phase 4 |

## To Execute

Run `/60-run` to start executing stories from the plan.
