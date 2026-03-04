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

### Phase 1: Style Fingerprint (5 stories) — COMPLETE

| Story | Title | Status | Commit |
|-------|-------|--------|--------|
| STY-001 | Wire user_tone_settings into proposal-compose-v2 prompt | Complete | 9c4ed72d |
| STY-002 | Extract style patterns from uploaded proposal examples | Complete | 9c4ed72d |
| STY-003 | Build compound style fingerprint from multiple sources | Complete | pre-built |
| STY-004 | Track edit distance on approved_edited proposals | Complete | 0a74cc53 |
| STY-005 | Style learning loop: aggregate edit patterns into tone settings | Complete | pre-built |

### Phase 2: Offering Profile (6 stories) — COMPLETE

| Story | Title | Status | Commit |
|-------|-------|--------|--------|
| OFR-001 | Migration: create org_offering_profiles table with RLS | Complete | pre-built |
| OFR-002 | Build OfferingUploader component for collateral upload | Complete | 7f49adfa |
| OFR-003 | Create offering-extract edge function | Complete | 7f49adfa |
| OFR-004 | Offering review UI: display and edit extracted data | Complete | bca32a32 |
| OFR-005 | Wire offering profile into context assembly queries | Complete | 1ce7cc20 |
| OFR-006 | Offering profile settings page | Complete | 484bd1b7 |

### Phase 3: Gotenberg PDF (7 stories) — COMPLETE

| Story | Title | Status | Commit |
|-------|-------|--------|--------|
| GOT-001 | Deploy Gotenberg Docker container on Railway | Complete | 19583550 |
| GOT-002 | Build HTML template engine | Complete | 19583550 |
| GOT-003 | CSS print media queries (1087 lines) | Complete | cac27130 |
| GOT-004 | Sandler Standard template (884-line HTML) | Complete | 5c3a4871 |
| GOT-005 | Gotenberg render edge function | Complete | dc4c482d |
| GOT-006 | PDF first-page thumbnail | Complete | 536c8fd0 |
| GOT-007 | Deprecate pdf-lib with v1_legacy flag | Complete | 536c8fd0 |

### Phase 4: 5-Stage Pipeline (6 stories) — COMPLETE

| Story | Title | Status | Commit |
|-------|-------|--------|--------|
| PIP-001 | Context assembly edge function (Stage 1) | Complete | a979cddb |
| PIP-002 | AI composition edge function (Stage 2) | Complete | pre-built |
| PIP-003 | Delivery edge function (Stage 5) | Complete | 1ce7cc20 |
| PIP-004 | Pipeline orchestrator with 5-stage chaining | Complete | 9a0c06a2 |
| PIP-005 | Error handling and retry logic | Complete | 9a0c06a2 |
| PIP-006 | Monitoring: timing, credits, error rates | Complete | 9a0c06a2 |

### Phase 5: One-Click UX (6 stories) — COMPLETE

| Story | Title | Status | Commit |
|-------|-------|--------|--------|
| UX-001 | ProposalQuickGenerate button | Complete | 51d0b2ea |
| UX-002 | ProposalProgressOverlay (5-stage) | Complete | c7b663f0 |
| UX-003 | ProposalPanel copilot response | Complete | 4de515bd |
| UX-004 | Proposals list view | Complete | 51d0b2ea |
| UX-005 | Customise wizard secondary path | Complete | 6f24a5ca |
| UX-006 | Post-generation edit + re-render PDF | Complete | a769f208 |

### Phase 6: All 4 Triggers (4 stories) — COMPLETE

| Story | Title | Status | Commit |
|-------|-------|--------|--------|
| TRG-001 | detectProposalIntentAdapter → V2 pipeline | Complete | pre-built |
| TRG-002 | Consolidate 3 copilot skills into generate-proposal-v2 | Complete | be98f486 |
| TRG-003 | Slack proposal_request handler → V2 | Complete | 7f742ed2 |
| TRG-004 | Manual button trigger wiring | Complete | 6f24a5ca |

### Phase 7: Autopilot and Polish (6 stories) — COMPLETE

| Story | Title | Status | Commit |
|-------|-------|--------|--------|
| AUT-001 | Rubber stamp thresholds for proposals | Complete | 06b4ec29 |
| AUT-002 | Edit distance → autopilot signals | Complete | 06b4ec29 |
| AUT-003 | Autonomy tier display in settings | Complete | 9d5f8677 |
| AUT-004 | QA: all 4 triggers verified | Complete | 18fc3a60 |
| AUT-005 | Sandler Standard template polish | Complete | c7b663f0 |
| AUT-006 | Pipeline performance tuning | Complete | 4de515bd |

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
