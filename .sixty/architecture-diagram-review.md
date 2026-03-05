# Architecture Diagram Review
**Date**: 2026-03-01
**File**: docs/architecture/architecture-diagram.html
**Reviewer**: Agent (automated cross-check against codebase)

---

## Diagram Sections Found

The diagram contains the following tabs/sections:

**V1 tabs (always visible):**
1. System Architecture (overview)
2. Copilot Lifecycle
3. Recording Pipeline
4. Skills System

**V2 tabs (shown with V2 toggle):**
5. Command Centre V2
6. Autonomy System V2
7. Proactive Fleet V2
8. Slack Copilot V2
9. Demo Script
10. Credit Governance V2
11. Autopilot System V2 (two sub-diagrams)
12. Orchestrator V2
13. Email Send Pipeline V2
14. Relationship Graph V2
15. Agent Memory V2
16. Agent Daily Logs V2
17. Control Room V2

Each section typically contains a Mermaid flow/sequence diagram plus a component table.

---

## Accuracy Assessment

### Section: System Architecture (Overview)

**Accurate:**
- Core components present: Frontend (React), Supabase backend, edge functions, AI providers, integrations
- Copilot routing 3-step flow (sequence 0.7+, skill trigger 0.5+, embedding 0.6+) matches `copilotRoutingService.ts`
- Google Calendar, Slack, HubSpot, Attio, Instantly, Fathom integrations all confirmed present
- `deal_stage_history` table is confirmed in baseline migration
- Recording pipeline (MeetingBaaS → S3 → transcription → AI processing) is structurally accurate
- Command Centre pipeline (8 source agents → inbox → enrich → prioritise → autonomy gate) matches actual `cc-*` functions
- Relationship graph (deal_contacts, contact_org_history) tables confirmed via migrations
- Agent memory (10 modules in `_shared/memory/`) confirmed — all 10 files exist
- Agent daily logs (`agent_daily_logs` table, `dailyLog.ts` module) confirmed via migration and file

**Outdated / Inaccurate:**
- **WRONG MODEL: copilot-autonomous uses Claude Sonnet 4.6, NOT Claude Haiku 4.5**
  - Diagram shows `CAI["Claude Haiku 4.5"]` in the Autonomous Mode subgraph
  - Actual: `const MODEL = 'claude-sonnet-4-6'` in `supabase/functions/copilot-autonomous/index.ts:66`
  - This is a significant misstatement — Sonnet is substantially more expensive than Haiku
- **WRONG MODEL: api-copilot uses Gemini 2.5 Flash (env-configured), not Gemini 2.5 Flash as a fixed default**
  - Some fallback paths use `gemini-2.0-flash` hardcoded (lines 1570, 1831)
  - Default: `GEMINI_MODEL = 'gemini-2.5-flash'` from env
- **Skills count wrong: "30 total" shown but actual count is 102 atomic + 25 sequences = 127 total**
  - Diagram also claims "18 atomic + 12 sequences" in the skills tab — both wrong
- **`creditLedger.ts` and `creditBudgetService.ts` are frontend-only files, not edge function modules**
  - Diagram implies they are backend infrastructure components within the edge function layer
  - `creditLedger.ts` exists at `src/lib/services/creditLedger.ts` (browser-side, fire-and-forget logging only)
  - `creditBudgetService.ts` exists at `src/lib/services/creditBudgetService.ts` (frontend only)
  - No equivalent `creditLedger.ts` or `creditBudgetService.ts` exists in `supabase/functions/_shared/`
  - The `credit_ledger` TABLE referenced in diagrams does not appear in any migration file
  - Actual cost tracking uses the `ai_cost_events` table (confirmed in `_shared/costTracking.ts:473`)
  - This means the entire "Credit Governance V2" diagram is showing components as deployed that are client-side stubs
- **`fleetThrottle.ts` does not exist anywhere in the codebase**
  - Diagram shows it as a deployed backend module
  - Not found in `_shared/`, edge functions, or frontend services

**Missing from diagram:**
- **487+ edge functions** — the diagram only shows a handful. The system has ~490 functions (excluding `_shared`)
- **Railway WhisperX** is the primary transcription provider (not AssemblyAI)
  - `poll-transcription-queue/index.ts` comments: "Tier 1: Railway WhisperX, Tier 2: Gladia/Deepgram"
  - AssemblyAI is NOT referenced in any edge function code
  - Gladia is the fallback, not a co-primary with AssemblyAI
- **86 `_shared` modules** not mentioned at all (diagram says "67 _shared modules")
- **Clerk auth still active** — diagram's frontend section shows `CL["Clerk - alternative provider"]` as a note, but Clerk is actively loaded in `main.tsx` and multiple files exist (`ClerkAuthContext.tsx`, `clerkClient.ts`) — not fully deprecated at the code level despite memory notes

---

### Section: Frontend Architecture

**Accurate:**
- Supabase Auth as primary, Clerk as conditional/legacy
- Zustand for UI state, React Query for server data, ServiceLocator DI container
- Core pages: Pipeline, Contacts, Meetings, Tasks, Deal Record, Settings
- AssistantShell + streaming message list architecture
- `useCopilotChat` hook for streaming
- Skill Builder in Settings

**Outdated / Inaccurate:**
- **"48 Response Panels"** — actual count is **62 response component files** in `src/components/copilot/responses/`
  - This makes the "48" claim significantly understated

---

### Section: Copilot Lifecycle

**Accurate:**
- 3-step routing (sequence → skill → semantic) matches implementation
- Autonomous mode (copilot-autonomous) is the default, api-copilot is fallback
- `copilotMemoryService` and `copilotSessionService` with 80k token compaction
- Lazy loading via `autonomousExecutor.ts` (metadata tier vs instructions tier)
- Claude tool definitions: `list_skills`, `get_skill`, `execute_action`, `resolve_entity`

**Outdated / Inaccurate:**
- **Model wrong**: Diagram shows "Claude Haiku 4.5" — actual is `claude-sonnet-4-6`
- **Fallback flow**: Diagram shows `CTX -.->|fallthrough| REGM` (implies api-copilot as fallback). The actual routing and fallback logic is more complex with autonomous mode handling most cases

---

### Section: Recording Pipeline

**Outdated / Inaccurate:**
- **AssemblyAI shown as primary transcription provider — this is WRONG**
  - Actual primary: Railway WhisperX
  - Actual fallback: Gladia (not a co-primary with AssemblyAI)
  - AssemblyAI not referenced anywhere in codebase
- Otherwise the phases (Bot Deploy → S3 Upload → Transcription → AI Processing → CRM Update → Slack → Thumbnail) are structurally correct

---

### Section: Skills System

**Accurate:**
- `platform_skills` (master templates) → `organization_skills` (compiled per org) flow is accurate
- `sync-skills.ts` CLI sync and `sync-skills-from-github` webhook paths exist
- OpenAI `text-embedding-3-small` for embeddings confirmed
- `autonomousExecutor.ts` lazy loading described correctly
- `match_skills_by_embedding` RPC for semantic fallback

**Outdated / Inaccurate:**
- **Skill count wrong**: "30 total - 18 atomic + 12 sequences" is outdated
  - Actual: 102 atomic skill directories + 25 sequence skill directories = 127 total

---

### Section: Backend / Database

**Accurate:**
- Table ownership columns correct: `meetings.owner_user_id`, `deals.owner_id`, `contacts.owner_id`, `tasks.assigned_to/owner_id`
- `user_settings` for AI keys (not VITE_ env vars)
- `copilot_conversations` user-private with RLS
- `deal_stage_history` table present
- `_shared/edgeAuth.ts` exists with `isServiceRoleAuth()` and `getAuthContext()`
- `corsHelper.ts` with `getCorsHeaders()` exists

**Outdated / Inaccurate:**
- `corsHeaders` legacy pattern still used in ~50 functions (P2 finding from audit) but diagram shows only the correct pattern
- No mention that `@supabase/supabase-js@2` (unpinned) is a widespread P2 issue in ~60 functions
- Diagram implies edge functions are correctly auth-gated — the audit found 38 P0 auth issues

---

### Section: AI Providers

**Accurate:**
- Anthropic Claude (copilot-autonomous), Google Gemini (api-copilot), OpenAI embeddings all confirmed
- `user_settings` for API keys confirmed
- OpenRouter for workflow AI nodes mentioned — exists in code

**Outdated / Inaccurate:**
- **Claude model wrong**: "Claude Haiku 4.5" shown for copilot-autonomous; actual is `claude-sonnet-4-6`
- **Gemini version**: Diagram shows "Gemini 2.5 Flash" — api-copilot defaults to `gemini-2.5-flash` but some fallback paths hardcode `gemini-2.0-flash`

---

### Section: Integrations

**Accurate:**
- Fathom (meeting transcripts), MeetingBaaS (bot recording), Google Calendar, HubSpot, Attio, Instantly, Slack all confirmed present
- Bidirectional HubSpot/Attio sync mentioned correctly
- Slack HITL approvals confirmed

**Missing:**
- Bullhorn CRM integration (has dedicated edge functions)
- Apollo enrichment (used in re-engagement)
- Apify (web scraping)
- AI Ark, Explorium (enrichment providers with skills)
- Instantly email outreach details understated (campaign creation, sequence management)

---

### Section: Command Centre V2

**Accurate:**
- `cc-enrich`, `cc-prioritise`, `cc-auto-execute`, `cc-undo`, `cc-action-sync` functions all exist
- 8 source agents described: Morning Brief, EOD Synthesis, Meeting Prep, Deal Risk, Re-Engagement, Coaching, Competitive Intel, Email Signals
- Autonomy gate (auto/approve/suggest) via `autonomyResolver.ts` confirmed
- 9 item types, multiple statuses structure consistent with what was audited

**Inaccurate (Security-Relevant):**
- Diagram implies the Command Centre pipeline runs securely. The audit found that `cc-*` functions are among the ~30 unauthenticated cron/worker functions (P1 finding). Any attacker can POST to these endpoints without credentials.

---

### Section: Credit Governance V2

**Largely Inaccurate — Most described components are aspirational, not deployed:**

- `creditLedger.ts` — EXISTS but is a **frontend-only** browser-side stub (`src/lib/services/`), not a backend module
- `creditBudgetService.ts` — EXISTS but is **frontend-only** (`src/lib/services/`), not edge function infrastructure
- `credit_ledger` TABLE — **does NOT exist** in any migration. Cost tracking uses `ai_cost_events`
- `fleetThrottle.ts` — **does NOT exist** anywhere in the codebase
- `modelRouter.ts` — EXISTS in `_shared/modelRouter.ts` (confirmed — this part is accurate)
- `credit-usage-rollup` edge function — needs verification (not confirmed in function list)
- Budget enforcement circuit breakers (80% throttle, 100% kill) — not found as deployed backend logic

The diagram presents the credit governance system as a fully deployed backend pipeline. The actual implementation is:
- Frontend-side logging only (fire-and-forget, no enforcement)
- `logAICostEvent()` in `_shared/costTracking.ts` writes to `ai_cost_events`
- The budget enforcement, throttling, and circuit breakers described are NOT implemented in edge functions

---

### Section: Autopilot System V2

**Accurate:**
- `autopilot-evaluate`, `autopilot-record-signal`, `autopilot-admin`, `autopilot-backfill` functions all exist
- `autopilot_confidence` table with migration confirmed
- `promotionEngine.ts` and `demotionHandler.ts` in `_shared/orchestrator/` confirmed
- `autonomyResolver.ts` confirmed
- Rubber-stamp guard concept present
- DB trigger for confidence recalculation confirmed in migration

**Minor inaccuracies:**
- Diagram shows `demotionEngine.ts` — actual file is `demotionHandler.ts`

---

### Section: Orchestrator V2

**Accurate:**
- `runner.ts`, `fleetRouter.ts`, `contextLoader.ts`, `deadLetter.ts` all exist in `_shared/orchestrator/`
- Self-invocation pattern (2s before timeout) confirmed in runner logic
- HITL pause via `hitl_pending_approvals` table
- `sequence_jobs` state management
- Dead letter queue via `agent-dead-letter-retry` function

**Inaccurate:**
- Diagram claims 45 adapters — actual count is **49 adapter files** in `_shared/orchestrator/adapters/`

---

### Section: Email Send Pipeline V2

**Accurate:**
- `draft-followup-email` (Wave 3), `slack-hitl-notification`, `hitl-send-followup-email` pipeline
- `ApprovalReviewDialog` in Control Room
- Gmail and Microsoft 365 send paths
- 30-second undo window
- Daily send cap
- Gmail signature auto-append
- Autonomy learning signals (approve +1.0, edit +0.3, reject -1.0, undo -2.0)

---

### Section: Relationship Graph V2

**Accurate:**
- `deal_contacts` junction table confirmed in migrations
- `contact_org_history` table confirmed in migrations
- `get_cross_deal_stakeholders` and `get_deal_stakeholder_map` RPCs confirmed in `20260227300003_stakeholder_rpcs.sql`
- `roleInference.ts` and `emailRoleInference.ts` adapters confirmed in `_shared/orchestrator/adapters/`
- Multi-threading score, job change detection, ghost detection logic present

---

### Section: Agent Memory V2

**Accurate:**
- All 10 modules confirmed present in `_shared/memory/`:
  `writer.ts`, `reader.ts`, `decay.ts`, `contacts.ts`, `reps.ts`, `commitments.ts`, `taxonomy.ts`, `types.ts`, `snapshot.ts`, `ragClient.ts`
- `dailyLog.ts` module confirmed
- `copilot_memories` table structure described correctly
- `agent_daily_logs` table confirmed via migration

---

### Section: Agent Daily Logs V2

**Accurate:**
- `agent_daily_logs` table confirmed in `20260226900001_agent_daily_logs.sql`
- `dailyLog.ts` module with `logAgentAction()` confirmed
- Integration hooks in runner.ts and email adapters align with code
- 90-day retention via pg_cron described

---

### Section: Control Room V2

**Accurate:**
- `/admin/control-room` route with `ControlRoom.tsx` confirmed
- `ApprovalReviewDialog` for deep-link from Slack HITL
- Fleet Pulse, Team Autonomy Matrix, Credit Health, Action Feed, ROI Summary widgets
- `hitl_pending_approvals` table
- `agent_daily_logs` as Action Feed primary source
- RLS gate for admin/owner access

---

## Summary of Critical Inaccuracies

| Issue | Severity | Diagram Claim | Reality |
|-------|----------|---------------|---------|
| copilot-autonomous model | High | Claude Haiku 4.5 | Claude Sonnet 4.6 |
| Transcription provider | High | AssemblyAI primary | Railway WhisperX primary, Gladia fallback |
| Credit governance backend | High | Deployed backend pipeline | Frontend-only stubs; `credit_ledger` table doesn't exist |
| `fleetThrottle.ts` | High | Backend module deployed | Does not exist |
| Skills count | Medium | "30 total (18 atomic + 12 seq)" | 127 total (102 atomic + 25 seq) |
| Response panels count | Medium | "48 panels" | 62 response components |
| Orchestrator adapter count | Low | "45 adapters" | 49 adapters |
| `demotionEngine.ts` name | Low | demotionEngine.ts | demotionHandler.ts |
| Auth status of cc-* functions | High (security) | Implied secure | All ~7 cc-* functions lack auth (P1 audit finding) |
| Auth status broadly | High (security) | Diagram implies auth everywhere | 38 P0 auth issues found in full audit |

---

## Recommendations

### Immediate Corrections Needed

1. **Fix model label**: Change "Claude Haiku 4.5" to "Claude Sonnet 4.6" in copilot-autonomous boxes (system overview, copilot lifecycle, AI providers tabs)

2. **Fix transcription pipeline**: Replace "AssemblyAI - primary" with "Railway WhisperX - primary" and "Gladia - fallback" in recording pipeline diagram

3. **Fix Credit Governance diagram**: Add clarification that `creditLedger.ts` / `creditBudgetService.ts` are frontend-only stubs. Mark `fleetThrottle.ts` as planned/not-yet-deployed. Rename `credit_ledger` table references to `ai_cost_events` (the actual table). The diagram currently implies a fully deployed backend governance system that does not exist.

4. **Update skill counts**: Change "30 total" to "127 total (102 atomic + 25 sequences)" in skills system and overview tabs

5. **Update response panels count**: Change "48 panels" to "62 response components"

6. **Fix orchestrator adapter count**: Change "45 adapters" to "49 adapters"

7. **Fix demotionEngine.ts name**: Should be `demotionHandler.ts`

### Security-Relevant Diagram Gaps

8. **Add auth warning overlay**: The diagram should note that `cc-*`, `process-*`, and other cron functions are HTTP-exposed without auth (38 P0 issues). The diagram as drawn implies the system is auth-gated which is misleading.

9. **Remove or annotate `debug-auth`**: A P0 function that leaks the service role key is deployed; the diagram shows no indication of this risk.

### Optional Improvements

10. **Add _shared module count**: Update from "67 shared modules" (in audit notes) to actual 86 files in `_shared/`

11. **Add missing integrations**: Bullhorn, Apollo, Apify, AI Ark, Explorium are absent from the Integrations tab

12. **Update header badge**: Currently shows "staging · Feb 2026 · PRD v4 · HITL v2" — should reflect March 2026

13. **Add Clerk deprecation note**: The frontend diagram shows Clerk as "alternative provider" but should note it is being phased out (currently conditional on feature flag in `main.tsx`)
