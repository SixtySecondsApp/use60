# PRD-123: Setup Wizard & Activation Checklist

**Priority:** Tier 1 — Ship Blocker
**Current Score:** 2 (SCAFFOLD) — components exist but disconnected from app
**Target Score:** 4 (BETA)
**Estimated Effort:** 6-8 hours
**Dependencies:** None

---

## Problem

The setup wizard is fully built but disconnected:
- `SetupWizardDialog.tsx` (70 lines) — main container
- 5 setup steps: Calendar, Notetaker, CRM, Follow-Up, Test
- `setupWizardStore.ts` (182 lines) — state management
- Supporting components: Welcome, Stepper, Complete, SidebarIndicator

But it's **not mounted in App.tsx**. New users who complete onboarding v2 (signup flow) have no guided path to connect their integrations. The activation checklist on the dashboard exists but:
1. **Setup wizard not triggered** — no logic detects "new user, incomplete setup"
2. **No integration health status** — users can't see which integrations are connected vs broken
3. **No re-entry point** — if a user skips setup, there's no way back without finding settings manually
4. **Activation checklist is embedded but not prominent** — it should drive the first-week experience

## Goal

Wire the setup wizard into the app so new users are guided through integration setup, with a persistent activation checklist that tracks completion and re-entry.

## Success Criteria

- [ ] Setup wizard triggers automatically for new users (no integrations connected)
- [ ] Wizard accessible via "Complete Setup" button on dashboard activation checklist
- [ ] Integration health indicators on dashboard (connected, disconnected, error)
- [ ] Persistent activation checklist with progress tracking (dismiss after 100%)
- [ ] Setup sidebar indicator for incomplete setup
- [ ] Re-entry from Settings → "Run Setup Wizard Again"

## Stories

| ID | Title | Type | Est | Dependencies |
|----|-------|------|-----|-------------|
| SETUP-001 | Mount SetupWizardDialog in AppLayout with trigger logic | frontend | 1.5h | — |
| SETUP-002 | Add auto-trigger for new users (no integrations connected) | frontend | 1h | SETUP-001 |
| SETUP-003 | Wire activation checklist "Complete Setup" button to wizard | frontend | 1h | SETUP-001 |
| SETUP-004 | Add integration health indicators to dashboard | frontend | 1.5h | — |
| SETUP-005 | Make activation checklist persistent with progress tracking | frontend | 1h | — |
| SETUP-006 | Add "Run Setup Wizard Again" entry point in Settings | frontend | 0.5h | SETUP-001 |
| SETUP-007 | Add setup sidebar indicator for incomplete integrations | frontend | 1h | SETUP-001 |

## Technical Notes

- `SetupWizardDialog.tsx` (70 lines) in `/src/components/setup-wizard/` — already built, just needs mounting
- `setupWizardStore.ts` (182 lines) — handles state, step progression, completion tracking
- Setup steps: CalendarSetupStep, NotetakerSetupStep, CrmSetupStep, FollowUpSetupStep, TestSetupStep
- `SetupWizardSidebarIndicator.tsx` exists — mount in sidebar/nav
- Trigger logic: check `integration_credentials` table for org — if zero rows, show wizard
- Integration health: query `integration_credentials` for each type (google, hubspot, slack, etc.), check `status` column
- Activation checklist already renders on Dashboard.tsx — make it sticky for first 7 days or until all steps complete
- Re-entry: add menu item in Settings page sidebar under "Setup" section
- Consider storing wizard completion in `user_preferences` table to prevent re-showing after dismiss
