# Consult: Natural Language Table Builder

**Date:** 2026-02-07
**Feature:** NL Table Builder — End-to-end prospecting via natural language
**Branch:** `feat/querybar-advanced`

---

## Codebase Analysis

### What Already Exists

| Capability | Status | Location |
|-----------|--------|----------|
| Apollo NL → params parser | Built | `parse-apollo-query/index.ts` (344L) — Claude parses NL to `ApolloSearchParams` |
| Apollo search + table creation | Built | `copilot-dynamic-table/index.ts` (565L) — search, create table+columns+rows+cells |
| Apollo people enrichment | Built | `apollo-enrich/index.ts` (642L) — "enrich once, column many" pattern |
| Apollo org enrichment | Built | `apollo-org-enrich/index.ts` (395L) |
| Apollo property columns | Built | `AddColumnModal.tsx` — picker for Apollo enrichment properties |
| Apollo search wizard (manual) | Built | `ApolloSearchWizard.tsx` (61KB) — multi-step form, ICP profile prefill |
| ICP profiles system | Built | `useICPProfiles.ts` + `ICPProfileSelector.tsx` + `generate-icp-profiles/` |
| Instantly campaign CRUD | Built | `instantly-admin/index.ts` (422L) — list/create campaigns |
| Instantly lead push | Built | `instantly-push/index.ts` (380L) — push rows to campaign |
| Instantly email step builder | Built | `EditInstantlySettingsModal.tsx` (517L) — formula/AI mode per step |
| Formula engine | Built | `evaluate-formula/index.ts` (495L) — @column_key, math, IF, CONCAT |
| AI enrichment (enrich-dynamic-table) | Built | Edge function for Gemini/Claude enrichment per cell |
| NL query hook | Built | `useParseApolloQuery()` in `useOpsTableSearch.ts` |
| Apollo credits check | Built | `useApolloCredits()` in `useOpsTableSearch.ts` |
| Business context loading | Partial | ICP profiles exist; tone/value prop stored in onboarding data; no unified context loader |
| Email sign-off per user | Not built | Needs new user preference field + settings UI |
| "Add to existing campaign" | Not built | Only "push leads" exists; no campaign awareness/reuse |
| Orchestrator (multi-skill chain) | Not built for Ops | `SequenceOrchestrator.ts` exists for copilot but not wired to Ops NL input |
| NL input on Ops table | Partial | `AiQueryBar.tsx` exists but limited; needs full workflow trigger capability |
| Campaign approval gate | Not built | No "review before send" flow; instant push today |
| Progress/status streaming | Not built | No real-time progress indicator for multi-step execution |

### Architecture Observations

1. **Column-centric model**: Everything in Ops is column-driven. Enrichment, formulas, Instantly steps — all manifest as columns with cells. The NL builder should follow this pattern.

2. **Edge function composition**: `copilot-dynamic-table` already calls `apollo-search` server-to-server. Extending this to call `apollo-enrich`, `enrich-dynamic-table`, and `instantly-admin` is a natural progression.

3. **Sequence framework**: `contextEngineering.ts` defines `SkillResult`, `SequenceState`, and orchestration primitives. The NL table builder can reuse these interfaces for step tracking and state management.

4. **ICP profiles**: Already stored per-org with fields matching Apollo params (titles, seniorities, departments, locations, company size, funding). Can be auto-loaded as default search criteria.

5. **Business AI training**: Org-level data (value_prop, tone_of_voice, pain_points, competitors) stored in onboarding/training tables. Needs a unified loader for email generation context.

---

## Technical Approach

### Core: New `ops-workflow-orchestrator` Edge Function

A new edge function that:
1. Receives NL prompt + optional config from frontend
2. Loads business context (ICP, tone, sign-off, credentials)
3. Decomposes prompt into skill chain using Claude
4. Executes skills sequentially, streaming progress via SSE
5. Returns completed table ID for review

This is preferred over extending `copilot-dynamic-table` because:
- The orchestrator manages multi-step execution with progress
- `copilot-dynamic-table` stays simple (search → table creation)
- Clean separation of concerns

### Frontend: Enhanced Query Bar

The existing `AiQueryBar.tsx` component becomes the entry point. Enhanced to:
- Detect workflow-level prompts (vs simple filter queries)
- Show execution progress stepper
- Surface clarifying questions inline
- Navigate to completed table with approval banner

### Email Generation: New Enrichment Skill

A new edge function `generate-email-sequence` that:
- Takes prospect data + business context + tone profile
- Generates personalised email steps (subject + body per step)
- Writes results as enrichment cells on step columns
- Receives intro lines from prior enrichment step for coherent emails

---

## Dependency Analysis

### Skills That Need Building

1. **Business context loader** — unified function to load ICP + tone + value prop + sign-off
2. **Email sign-off preference** — user profile field + settings UI
3. **Email sequence generator** — edge function for AI email generation with personalisation
4. **Workflow orchestrator** — edge function for multi-skill chaining with SSE progress
5. **"Add to existing campaign"** — extend instantly-push to support existing campaign detection
6. **Approval gate UI** — banner/modal for campaign review before launch
7. **Progress stepper UI** — real-time execution progress in Ops table

### Skills Already Built (reuse directly)

- `parse-apollo-query` — NL → Apollo search params
- `apollo-search` → `copilot-dynamic-table` — search + table creation
- `apollo-enrich` — email/phone/property enrichment
- `enrich-dynamic-table` — AI enrichment per cell
- `evaluate-formula` — formula column evaluation
- `instantly-admin` — campaign creation
- `instantly-push` — lead pushing
- `generate-icp-profiles` — ICP profile generation

---

## Risk Areas

1. **Rate limits**: Apollo (400/min), Instantly (10/sec). Orchestrator must pace requests.
2. **Timeout**: Edge functions have 60s limit. For 100+ prospects, enrichment + email gen may exceed. Need chunked/async pattern.
3. **Cost**: 100 Apollo enrichments + 100 Gemini calls + Instantly API. Should show estimate before executing.
4. **Coherence**: Personalised intros must match email body tone. Needs single-pass generation (intro + body together), not separate steps.
