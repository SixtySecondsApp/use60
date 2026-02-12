# Progress: Org Fact Profile & Client Profiles

## Status: ALL STORIES COMPLETE

| # | Story | Status | Agent |
|---|-------|--------|-------|
| OFP-001+008 | Schema migration (is_org_profile + CRM linking + context_profile_id) | Done | team-lead |
| OFP-002 | Types, service, hooks for org profile | Done | team-lead |
| OFP-003 | Onboarding auto-create org fact profile | Done | onboarding-agent |
| OFP-004 | Sync bridge: research → org context | Done | sync-bridge-agent |
| OFP-005 | FactProfilesPage 'Your Business' tab/badge | Done | ui-profiles-agent |
| OFP-006 | Client profiles CRM entity linking | Done | crm-linking-agent |
| OFP-007 | Settings Company Profile section | Done | settings-agent |
| OFP-009 | Backend enrichment context from fact profiles | Done | enrichment-agent |
| OFP-010 | Ops profile focus selector | Done | ops-selector-agent |

## Files Changed (43 files, +4524 / -461)

### Schema
- `supabase/migrations/20260212_org_fact_profile.sql` — NEW: is_org_profile, CRM linking, context_profile_id

### Types / Service / Hooks
- `src/lib/types/factProfile.ts` — Added is_org_profile, linked_* fields
- `src/lib/services/factProfileService.ts` — getOrgProfile(), syncToOrgContext(), updated createProfile()
- `src/lib/hooks/useFactProfiles.ts` — useOrgProfile(), useSyncOrgProfileToContext()

### Onboarding
- `src/pages/onboarding/v2/CompletionStep.tsx` — Auto-create org profile on onboarding completion

### Edge Functions
- `supabase/functions/research-fact-profile/index.ts` — Post-research sync to org context
- `supabase/functions/enrich-dynamic-table/index.ts` — buildFactProfileContext(), resolveFactProfileContext(), fallback chain

### Fact Profiles UI
- `src/pages/FactProfilesPage.tsx` — 'Your Business' tab, hasOrgProfile detection
- `src/components/fact-profiles/FactProfileCard.tsx` — Org profile badge, Shield icon, disabled delete, CRM linking chips
- `src/components/fact-profiles/FactProfileGrid.tsx` — Org profile tab filter, pinned at top
- `src/components/fact-profiles/NewFactProfileDialog.tsx` — hasOrgProfile guard, CRM linking fields
- `src/components/fact-profiles/FactProfileView.tsx` — Linked entities section

### Ops Context Switching
- `src/pages/OpsDetailPage.tsx` — Profile focus selector dropdown
- `src/components/ops/EditEnrichmentModal.tsx` — Active context profile info
- `src/lib/services/opsTableService.ts` — updateTableContextProfile()

### Settings
- `src/components/settings/OrgProfileSettings.tsx` — NEW: Company Profile section
- `src/pages/settings/AIPersonalizationSettings.tsx` — Integrated OrgProfileSettings
