# QA Report: Proposal Engine V2 — AUT-004 Trigger Verification

**Date:** 2026-03-02
**Scope:** All 4 trigger points for the V2 proposal pipeline + pipeline integrity
**Method:** Read-only code inspection (no code was modified)
**Reviewer:** Claude (AUT-004)

---

## Summary

| Area | Status |
|------|--------|
| Trigger 1: Post-meeting auto (PROP-001) | PASS |
| Trigger 2: Manual button | PASS with note |
| Trigger 3: Copilot skill | PASS |
| Trigger 4: Slack command | PASS |
| Pipeline orchestrator (stages + retry + monitoring) | PASS with note |
| Stage functions exist | PASS |
| Frontend components exist | PASS |

**Overall: 7/7 areas pass. 2 non-blocking notes documented below.**

---

## Trigger 1: Post-meeting auto (PROP-001)

**File:** `supabase/functions/_shared/orchestrator/adapters/proposalGenerator.ts`

- [x] `detectProposalIntentAdapter` is defined and exported
- [x] Calls `proposal-pipeline-v2` via `fetch(...supabaseUrl}/functions/v1/proposal-pipeline-v2`
- [x] `trigger_type: 'auto_post_meeting'` is set (line 157)
- [x] Skip condition: no intents output → returns `{ skipped: true, reason: 'no_intents_output' }` (line 52)
- [x] Skip condition: no `send_proposal` commitment → returns `{ skipped: true, reason: 'no_send_proposal_intent' }` (line 67)
- [x] Skip condition: no `deal_id` → returns `{ skipped: true, reason: 'no_deal_id' }` (line 82)
- [x] V1 fallback path exists (pipeline_version: 'v1' in step config falls back to `generate-proposal`)
- [x] Doc comment at top of adapter accurately describes all skip conditions

**Result: PASS**

---

## Trigger 2: Manual button

### Component — `src/components/proposals/ProposalQuickGenerate.tsx`

- [x] File exists at the expected path
- [x] `handleGenerate` calls `supabase.functions.invoke('proposal-pipeline-v2', ...)` (line 84)
- [x] `trigger_type: 'manual_button'` is set in the request body (line 89)
- [x] `meeting_id`, `deal_id`, `contact_id`, `user_id`, `org_id` are included in the body
- [x] `deal_id` is optional (`dealId ?? undefined`) — satisfies the pipeline requirement
- [x] `ProposalProgressOverlay` is imported and rendered when `activeProposalId` is set (lines 156 and 183)
- [x] Toast error feedback on failure (lines 97, 106, 111)
- [x] Realtime subscription tracks `generation_status` on the created proposal row

### Page — `src/pages/MeetingDetail.tsx`

- [x] `ProposalQuickGenerate` is imported (line 19)
- [x] `ProposalQuickGenerate` is rendered with `meetingId`, `contactId`, `hasRecording`, `hasNotes` (lines 1007–1012)

**NOTE (non-blocking):** `dealId` is NOT passed to `ProposalQuickGenerate` in `MeetingDetail.tsx`. The `Meeting` interface in that file has no `deal_id` field, so the component will always send `deal_id: undefined` to the pipeline. The pipeline accepts meeting-only proposals (`meeting_id` alone satisfies the `!meeting_id && !deal_id` validation check), so the pipeline will not error. However, the proposal will lack the deal CRM anchor — context assembly at Stage 1 will not load deal-specific data, and the context caching optimisation (AUT-006) will not apply. If meeting-to-deal linking is a future requirement, `MeetingDetail` would need to fetch and pass the associated deal ID.

**Result: PASS (with note)**

---

## Trigger 3: Copilot skill

### SKILL.md — `skills/atomic/generate-proposal-v2/SKILL.md`

- [x] File exists
- [x] `name: Generate Proposal V2` present in frontmatter
- [x] `metadata.category: sales-ai` present
- [x] `metadata.skill_type: atomic` present
- [x] `metadata.is_active: true` present
- [x] `trigger_type: "copilot"` declared in pipeline frontmatter and in inputs default
- [x] Trigger patterns cover all key phrases: `write a proposal`, `generate proposal`, `create proposal for`, `proposal for`, `/proposal`
- [x] `pipeline.entry_function: "proposal-assemble-context"` specified
- [x] All 4 stage functions listed under `pipeline.stages`
- [x] `linked_skills` array lists all 4 downstream functions
- [x] `output_format: ProposalPanel` matches the `ProposalPanel.tsx` component

**NOTE (cosmetic):** The SKILL.md description says "Fires the full 5-stage pipeline" but `pipeline.stages` lists only 4 stages, and the body section "Pipeline Overview" also documents 4 stages. The pipeline orchestrator (`proposal-pipeline-v2`) internally labels stages 3+4 as a combined render stage, then calls `proposal-deliver` as stage 5. The stage count is a labelling inconsistency between the description text and the frontmatter/body, not a functional issue.

### Routing service — `src/lib/services/copilotRoutingService.ts`

- [x] `STATIC_SKILL_OVERRIDES` array exists and is checked before DB routing (Step 0)
- [x] All core proposal phrases mapped to `generate-proposal-v2`:
  - `write a proposal` → confidence 0.92
  - `generate proposal` → confidence 0.92
  - `create proposal` → confidence 0.90
  - `draft a proposal` → confidence 0.90
  - `proposal for` → confidence 0.85
  - `make a proposal` → confidence 0.88
  - `build a proposal` → confidence 0.88
- [x] `checkStaticOverride()` is called at the top of `routeToSkill()` before any DB query
- [x] Returns early with static match, bypassing all DB lookups
- [x] JSDoc comment explicitly states intent: guarantees V2 pipeline wins regardless of DB contents

**Result: PASS**

---

## Trigger 4: Slack command

**File:** `supabase/functions/slack-copilot/index.ts`

- [x] `proposal_request` intent type is handled in `routeToHandler` switch (line 554)
- [x] Routes to `handleProposalRequest()` function (lines 608–655)
- [x] `handleProposalRequest` resolves `deal_id` and `contact_id` from entity resolution
- [x] Returns early with user-facing message if no deal found (lines 625–635)
- [x] Returns `pendingAction: { type: 'generate_proposal', data: { deal_id, contact_id, trigger_type: 'slack' } }`
- [x] Outer handler checks `result.pendingAction?.type === 'generate_proposal'` (line 199)
- [x] Fires `supabase.functions.invoke('proposal-pipeline-v2', ...)` with `trigger_type: 'slack'` (line 212)
- [x] `slack_thread` context (channel_id, thread_ts, bot_token) is passed to pipeline for deliver-stage callback
- [x] Progress message posted to thread: `_Stage 1/5: Assembling deal context..._`
- [x] Intent is also classified via `classifyWithRegex` fallback — proposal regex at line 481–486 correctly sets `type: 'proposal_request'`
- [x] `mapRouteToIntent` also maps `/proposal` route key to `proposal_request` (line 419)

**Result: PASS**

---

## Pipeline Orchestrator

**File:** `supabase/functions/proposal-pipeline-v2/index.ts`

### Stage chain

- [x] Stage 1: `proposal-assemble-context` invoked (line 634)
- [x] Stage 2: `proposal-compose-v2` invoked (line 681)
- [x] Stage 3+4: `proposal-render-gotenberg` invoked (line 781)
- [x] Stage 5: `proposal-deliver` invoked (line 830)
- [x] Status transitions: `assembling → context_assembled → composing → composed → rendering → rendered → delivering → ready`
- [x] All 4 trigger_type values validated: `['auto_post_meeting', 'manual_button', 'copilot', 'slack']` (line 457)

### Retry logic (PIP-005)

- [x] `retryWithBackoff()` function implemented with exponential backoff (1s/3s/9s delays)
- [x] `NonRetryableError` class defined for 4xx responses — skips retries immediately
- [x] Stage 1: 2 retries
- [x] Stage 2: 2 retries
- [x] Stage 3+4: 2 retries
- [x] Stage 5: 1 retry (deliver is best-effort — never aborts pipeline on failure)
- [x] Delivery failure path marks proposal `ready` anyway (PDF still available)

### Monitoring (PIP-006)

- [x] `StageTimer` class tracks per-stage start/finish times
- [x] `PipelineMonitor` class accumulates stage results and credit totals
- [x] `flushMetrics()` writes `_pipeline_metrics` to `proposals.style_config`
- [x] `X-Pipeline-Timing` header included in all success responses (line 976)
- [x] Credit usage logged via `logAICostEvent` after Stage 2 and at pipeline completion

### AUT-006 additions (context caching + Gotenberg warm-up)

- [x] Context cache check for same `deal_id` within 1 hour (lines 569–591)
- [x] Gotenberg warm-up ping before Stage 3+4 (lines 749–766)
- [x] 120-second hard timeout guard via `AbortController` (line 477)

**NOTE (cosmetic code issue):** The `pipelineTimeoutId` setTimeout closure references `proposalId` (line 480) before that variable is declared (line 541). JavaScript closures capture by reference, so when the timeout fires `proposalId` will be in scope. However, if the timeout fires before line 541 is reached (i.e., during the Step 0 deal/meeting title resolution), `proposalId` will be `undefined` — the `?? 'pending'` fallback in the log string prevents a crash. This is a non-functional code quality issue.

**Result: PASS (with note)**

---

## Stage Functions Exist

| Function | File | Status |
|----------|------|--------|
| `proposal-assemble-context` | `supabase/functions/proposal-assemble-context/index.ts` | PASS — file exists |
| `proposal-compose-v2` | `supabase/functions/proposal-compose-v2/index.ts` | PASS — file exists |
| `proposal-render-gotenberg` | `supabase/functions/proposal-render-gotenberg/index.ts` | PASS — file exists |
| `proposal-deliver` | `supabase/functions/proposal-deliver/index.ts` | PASS — file exists |

**Result: PASS**

---

## Frontend Components Exist

| Component | File | Status |
|-----------|------|--------|
| `ProposalQuickGenerate` | `src/components/proposals/ProposalQuickGenerate.tsx` | PASS — file exists |
| `ProposalProgressOverlay` | `src/components/proposals/ProposalProgressOverlay.tsx` | PASS — file exists |
| `ProposalPanel` | `src/components/copilot/responses/ProposalPanel.tsx` | PASS — file exists |
| `ProposalsList` | `src/pages/ProposalsList.tsx` | PASS — file exists |

**Result: PASS**

---

## Issues Found

### Issue 1 — Non-blocking: `dealId` not passed from MeetingDetail to ProposalQuickGenerate

**Severity:** Low (non-blocking)
**File:** `src/pages/MeetingDetail.tsx` lines 1007–1012
**Detail:** The `Meeting` interface in `MeetingDetail.tsx` does not include a `deal_id` field, and the `ProposalQuickGenerate` component is rendered without a `dealId` prop. The pipeline will receive only `meeting_id`, which satisfies the "at least one of meeting_id or deal_id" validation, so it will not error. However, deal-specific context enrichment (deal details, deal memory) will not be included in Stage 1 assembly, and the AUT-006 context caching optimisation will not apply.
**Recommendation:** Add `deal_id` to the `Meeting` interface and query, then pass it as `dealId` prop if the meeting has a linked deal.

### Issue 2 — Non-blocking: SKILL.md stage count inconsistency

**Severity:** Documentation only
**File:** `skills/atomic/generate-proposal-v2/SKILL.md` line 5
**Detail:** Description text says "5-stage pipeline" but `pipeline.stages` frontmatter lists 4 stages and the body section documents 4 stages. The orchestrator internally labels stages 3+4 as combined, plus stage 5 (deliver) — so 4 function calls are made. No functional impact.
**Recommendation:** Align the description text: either say "4-stage pipeline" or update the frontmatter to include all 5 stages explicitly.

### Issue 3 — Non-blocking: `proposalId` referenced before declaration in timeout closure

**Severity:** Code quality only (non-functional)
**File:** `supabase/functions/proposal-pipeline-v2/index.ts` line 480
**Detail:** The 120-second timeout closure logs `proposalId ?? 'pending'`. The variable `proposalId` is declared at line 541. JavaScript closures capture by reference so this is valid at runtime — if the timeout fires after line 541, it logs the correct ID; if before, it logs `'pending'`. No functional impact due to the `?? 'pending'` guard.
**Recommendation:** Declare `let proposalId: string | undefined` before the setTimeout, then assign it after creation.

---

## Checklist Summary

### Trigger 1 — Post-meeting auto
- [x] `detectProposalIntentAdapter` calls `proposal-pipeline-v2`
- [x] `trigger_type: 'auto_post_meeting'` set
- [x] Skip: no intents output
- [x] Skip: no send_proposal commitment
- [x] Skip: no deal_id

### Trigger 2 — Manual button
- [x] `ProposalQuickGenerate` calls `proposal-pipeline-v2`
- [x] `trigger_type: 'manual_button'` set
- [x] `ProposalQuickGenerate` imported in `MeetingDetail.tsx`
- [x] `ProposalQuickGenerate` rendered with meetingId and contactId
- [ ] `dealId` passed to `ProposalQuickGenerate` in MeetingDetail (not passed — see Issue 1)
- [x] `ProposalProgressOverlay` rendered on success

### Trigger 3 — Copilot skill
- [x] `skills/atomic/generate-proposal-v2/SKILL.md` exists with correct frontmatter
- [x] `trigger_type: 'copilot'` declared in SKILL.md
- [x] Static override routes proposal phrases to `generate-proposal-v2` in `copilotRoutingService.ts`
- [x] Static override checked before DB routing (Step 0)

### Trigger 4 — Slack command
- [x] `proposal_request` intent handled in `routeToHandler` switch
- [x] `handleProposalRequest` fires `proposal-pipeline-v2`
- [x] `trigger_type: 'slack'` set
- [x] `slack_thread` context passed for deliver-stage callback

### Pipeline orchestrator
- [x] All 4 stage functions called in sequence
- [x] Retry logic exists (PIP-005)
- [x] Monitoring/metrics exist (PIP-006)
- [x] All 4 trigger_type values validated at entry

### Stage functions
- [x] `proposal-assemble-context/index.ts` exists
- [x] `proposal-compose-v2/index.ts` exists
- [x] `proposal-render-gotenberg/index.ts` exists
- [x] `proposal-deliver/index.ts` exists

### Frontend components
- [x] `ProposalQuickGenerate.tsx` exists
- [x] `ProposalProgressOverlay.tsx` exists
- [x] `ProposalPanel.tsx` exists
- [x] `ProposalsList.tsx` exists
