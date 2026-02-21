# Consult Report: AI Ark Premium Search Experience
Generated: 2026-02-20

## User Request
"Build the best integration and data sourcing offering using AI Ark reference data from founder call. Credit-smart search with 5-preview pattern, rich autocomplete filters, AI natural language search, and dedicated prospecting hub."

## Clarifications
- Q: NL Parser model? → Gemini Flash 3.1
- Q: Entry point? → Dedicated /prospecting page with tabs
- Q: Reference data loading? → Top 5K bundled + API for full dataset
- Q: Preview UX? → Show total count + 5 results upfront

## Key Context
- AI Ark founder shared 5 reference datasets: industries (149), industry tags (800+), technologies (64K+), cities (244K+), countries+states (200+)
- AI Ark costs credits on every API call (unlike Apollo where search is free)
- Current v1 integration is complete (ARK-001 through ARK-010) but uses freetext filters with no autocomplete
- No dedicated search wizard exists — searches happen via FindMoreSheet or copilot

## Agent Findings

### Codebase Scout
- 5 edge functions exist: ai-ark-search, ai-ark-semantic, ai-ark-similarity, ai-ark-enrich, ai-ark-credits
- Frontend service: aiArkSearchService.ts with searchAndCreateTable() and standalone search
- ApolloSearchWizard.tsx (978 lines) is the gold standard — 3-step wizard with NL parsing, preview, import
- No AiArkSearchWizard equivalent exists
- Reference data not bundled anywhere in the app currently

### Patterns Analyst
- Apollo pattern: parse-apollo-query edge function converts NL → structured params via Gemini
- Filter components: Radix Combobox used elsewhere in the app
- OpsTable.tsx handles virtualized rendering (TanStack Virtual)
- Credit balance widget pattern exists in ApolloSearchWizard step 1

### Risk Scanner
- 64K technologies + 244K cities is ~3MB raw — must prune for bundle
- AI Ark API has 5 req/sec rate limit — pagination needs throttling
- Credit cost: 0.25/company search, 1.25/people search per the edge function code
- No way to get a "free preview" — every API call costs

### Scope Sizer
- 14 stories across 5 phases
- MVP (stories 1-8): ~3.5 hours with parallel execution
- Full scope (stories 1-14): ~5.5 hours
- Key parallel opportunities: filter components can be built in parallel, workflow + copilot updates are independent

## Architecture Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| NL Parser | Gemini Flash 3.1 | Matches Apollo parser pattern |
| Entry Point | /prospecting page | Central hub for all data sourcing |
| Reference Data | Top 5K bundled + API | Balance bundle size vs responsiveness |
| Preview | 5 of N with total | API returns totalElements for free |
| Credit Model | Show cost before every action | Users must consent to credit spend |
