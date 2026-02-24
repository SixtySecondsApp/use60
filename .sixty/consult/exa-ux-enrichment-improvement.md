# Consult Report: Exa UX Enrichment Improvement
Generated: 2026-02-12

## User Request
"How can we make Exa enrichment better and easier for users? The UI was not helpful and I had to think about my own intent prompts and ways to use it."

## Clarifications
- Q: What was the specific friction?
- A: (1) Writing prompts from scratch — no templates, (2) Unclear provider selection — Exa felt like just a dropdown

## Agent Findings

### Codebase Scout
- **55+ Exa-related files** mapped across edge functions, frontend, services, types
- Backend is solid: `enrich-dynamic-table` correctly routes to Exa Answer API, derives intent signals, stores citations
- Frontend treats Exa as afterthought: raw `<select>` dropdown, no conditional UI
- Websets exist only in demo, no Ops integration
- ExaAbilitiesDemo is admin-only, no bridge to production Ops

### Patterns Analyst
- `ENRICHMENT_TEMPLATES` (line 175-196): Only 4 generic LLM-style templates, zero Exa-specific
- Provider selection (line 1240-1248): Plain dropdown `openrouter | anthropic | exa` with zero context
- `EditEnrichmentModal`: 309 lines, minimal — text area + dropdown + save button
- `OpsTableCell`: Intent signals render beautifully in expanded view but are invisible in default view
- No cost estimation, no preview, no provider-specific help text anywhere

### Demo/Prospecting Analyst
- ExaAbilitiesDemo: 4-step guided walkthrough with Ops table blueprints — excellent education
- ProspectingPage: Supports Apollo + AI Ark, NOT Exa
- ImportToOpsDialog: Only handles Apollo/AI Ark
- Critical gap: Demo shows "Build this in Ops" blueprints but no button to actually do it

## Synthesis

### All Agents Agree
1. Provider selection needs contextual UI — different experience per provider
2. Exa needs curated template library (not generic LLM prompts)
3. Model picker should hide when Exa selected (meaningless for Exa)
4. Intent signals should be inline, not buried in expand view
5. "Test on 1 row" preview would eliminate prompt guessing

### Key UX Gaps (Priority Order)
1. **No Exa templates** — users write prompts from scratch
2. **Raw provider dropdown** — no explanation of what Exa does differently
3. **Model picker shown for Exa** — confusing, meaningless field
4. **No preview capability** — users commit to enriching all rows blind
5. **Intent signals hidden** — Exa's unique value invisible at table level
6. **No cost guidance** — users don't know Exa pricing

### Risks
| Severity | Risk | Mitigation |
|---|---|---|
| Medium | AddColumnModal is ~1400 lines | Keep changes in existing file, follow existing patterns |
| Medium | Template changes affect all providers | Use provider-conditional template lists |
| Low | Exa API key may not be configured | Show inline guidance when provider selected |

## Final Recommendation
7-story plan across 3 phases. Phase 1 (stories 1-4) directly solves both friction points.
Estimated total: ~3 hours. MVP (Phase 1 only): ~1.5 hours.
