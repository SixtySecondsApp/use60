# Proposal Generation Engine V2 — Progress

## Feature: proposal-engine-v2
## PRD: `docs/proposal_system/proposal_pdf_generator.md` (PRD-PG-002)
## Plan: `.sixty/plan-proposal-engine-v2.json`
## Started: 2026-03-02
## Last Updated: 2026-03-02

---

## Phase Overview

| Phase | Name | Stories | Status | Parallel With |
|-------|------|---------|--------|---------------|
| 0 | V1 Foundation | 28 | COMPLETE | — |
| 1 | Style Fingerprint | 5 (STY-001→005) | Pending | Phase 2, Phase 3 |
| 2 | Offering Profile | 6 (OFR-001→006) | Pending | Phase 1, Phase 3 |
| 3 | Gotenberg PDF | 7 (GOT-001→007) | Pending | Phase 1, Phase 2 |
| 4 | 5-Stage Pipeline | 6 (PIP-001→006) | Pending | — (depends on 1+2+3) |
| 5 | One-Click UX | 6 (UX-001→006) | Pending | Phase 6 |
| 6 | All 4 Triggers | 4 (TRG-001→004) | Pending | Phase 5 |
| 7 | Autopilot & Polish | 6 (AUT-001→006) | Pending | — (depends on 5+6) |

**Total: 40 stories across 7 phases**

---

## Critical Path

```
Phase 1 (Style)    ─────┐
Phase 2 (Offering) ─────┼──▶ Phase 4 (Pipeline) ──▶ Phase 5 (UX) ───────┐
Phase 3 (Gotenberg) ────┘                          Phase 6 (Triggers) ──┼──▶ Phase 7 (Polish)
                                                                        └──▶ SHIP
```

---

### Phase 1: Style Fingerprint (5 stories) — PENDING

| Story | Title | Status |
|-------|-------|--------|
| STY-001 | Wire user_tone_settings into proposal-compose-v2 prompt | Pending |
| STY-002 | Extract style patterns from uploaded proposal examples | Pending |
| STY-003 | Build compound style fingerprint from multiple sources | Pending |
| STY-004 | Track edit distance on approved_edited proposals | Pending |
| STY-005 | Style learning loop: aggregate edit patterns into tone settings | Pending |

### Phase 2: Offering Profile (6 stories) — PENDING

| Story | Title | Status |
|-------|-------|--------|
| OFR-001 | Migration: create org_offering_profiles table with RLS | Pending |
| OFR-002 | Build OfferingUploader component for collateral upload | Pending |
| OFR-003 | Create offering-extract edge function for AI-powered collateral analysis | Pending |
| OFR-004 | Offering review UI: display and edit extracted data before saving | Pending |
| OFR-005 | Wire offering profile into context assembly queries | Pending |
| OFR-006 | Offering profile settings page: view, edit, delete, upload new | Pending |

### Phase 3: Gotenberg PDF (7 stories) — PENDING

| Story | Title | Status |
|-------|-------|--------|
| GOT-001 | Deploy Gotenberg Docker container on Railway | Pending |
| GOT-002 | Build HTML template engine with Handlebars-style substitution | Pending |
| GOT-003 | CSS print media queries for professional PDF output | Pending |
| GOT-004 | Build 'Sandler Standard' default HTML + CSS print template | Pending |
| GOT-005 | Create proposal-render-gotenberg edge function | Pending |
| GOT-006 | PDF first-page thumbnail for UI preview | Pending |
| GOT-007 | Deprecate proposal-generate-pdf (pdf-lib) with v1_legacy flag | Pending |

### Phase 4: 5-Stage Pipeline (6 stories) — PENDING

| Story | Title | Status |
|-------|-------|--------|
| PIP-001 | Build proposal-assemble-context edge function (Stage 1) | Pending |
| PIP-002 | Build proposal-compose-v2 edge function (Stage 2) | Pending |
| PIP-003 | Build proposal-deliver edge function (Stage 5) | Pending |
| PIP-004 | Pipeline orchestration: chain stages with realtime status updates | Pending |
| PIP-005 | Pipeline error handling and retry logic | Pending |
| PIP-006 | Pipeline monitoring: timing, credits, error rates per stage | Pending |

### Phase 5: One-Click UX (6 stories) — PENDING

| Story | Title | Status |
|-------|-------|--------|
| UX-001 | Build ProposalQuickGenerate button on meeting detail page | Pending |
| UX-002 | Build ProposalProgressOverlay with 5-stage progress bar | Pending |
| UX-003 | Build ProposalPanel copilot response type | Pending |
| UX-004 | Build Proposals list view with filters and actions | Pending |
| UX-005 | Wire ProposalWizard as 'Customise' secondary path | Pending |
| UX-006 | Post-generation edit flow: Done → edit sections → re-render PDF | Pending |

### Phase 6: All 4 Triggers (4 stories) — PENDING

| Story | Title | Status |
|-------|-------|--------|
| TRG-001 | Update detectProposalIntentAdapter (PROP-001) to use V2 pipeline | Pending |
| TRG-002 | Consolidate 3 copilot skills into generate-proposal-v2 | Pending |
| TRG-003 | Update Slack proposal_request handler to use V2 pipeline | Pending |
| TRG-004 | Manual button trigger wiring (ProposalQuickGenerate → pipeline) | Pending |

### Phase 7: Autopilot and Polish (6 stories) — PENDING

| Story | Title | Status |
|-------|-------|--------|
| AUT-001 | Register proposal.generate and proposal.send in RUBBER_STAMP_THRESHOLDS | Pending |
| AUT-002 | Wire edit distance tracking into autopilot signals for proposals | Pending |
| AUT-003 | Autonomy tier display in proposal settings | Pending |
| AUT-004 | QA: test all 4 triggers end-to-end with real meeting data | Pending |
| AUT-005 | Template refinement: iterate Sandler Standard based on real output | Pending |
| AUT-006 | Performance tuning: pipeline latency, Gotenberg warm-up, caching | Pending |

---

## Codebase Patterns (from V1)

- Edge functions pin `@supabase/supabase-js@2.43.4` on esm.sh
- New functions: `getCorsHeaders(req)` from `_shared/corsHelper.ts`
- Staging deploys: `--no-verify-jwt` (project ref: `caerqjzvuerejfrdtygb`)
- ProposalSection type: `cover | executive_summary | problem | solution | approach | timeline | pricing | terms | custom`
- proposals.user_id is the creator; deals use `owner_id`, meetings use `owner_user_id`
- Credit governance: `logAICostEvent` / `checkCreditBalance` in `_shared/costTracking.ts`
- Orchestrator adapters follow SkillAdapter interface from `_shared/orchestrator/types.ts`
- SIGNAL_WEIGHTS: approved(+1.0), approved_edited(+0.3), rejected(-1.0), expired(-0.2), undone(-2.0), auto_executed(+0.1), auto_undone(-3.0)

---

## Session Log

*No sessions yet. Run `60/run` to begin execution.*
