# Consult Report: Skill Gold Standard Upgrade
Generated: 2026-02-26

## User Request
"Upgrade existing skills to match the meeting-prep-brief gold standard, leveraging RAG system and external tools for research and data enrichment."

## Gold Standard Analysis (meeting-prep-brief)

### What Makes It Best-in-Class
1. **5-Layer Data Model**: Company → People → Deal → History → Strategy
2. **10+ Data Sources**: CRM, calendar, AI summaries, ML risk signals, activity logs, config, Claude AI
3. **RAG Integration**: Semantic search on meeting transcripts via pgvector for historical context
4. **Web Search**: Brave API for company news, competitive intel, market signals
5. **AI Enrichment**: Claude Haiku generates talking points from enriched context
6. **References/ Docs**: 40KB+ of frameworks, stakeholder guides, decision trees
7. **Structured Output**: Every field defined with format, validation, examples
8. **Quality Checklist**: 10-point validation before returning results
9. **Graceful Degradation**: 10+ failure paths handled without breaking
10. **Time-Adaptive**: 5/15/30 minute prep modes

### Infrastructure Available But Underused
| Capability | How to Access | Skills Using It |
|-----------|--------------|-----------------|
| Meeting transcript RAG | `createRAGClient()` — pgvector semantic search | ~3 of 95 |
| AI Ark enrichment | `ai-ark-enrich` edge function (37+ fields) | Enrichment skills only |
| Apollo enrichment | `apollo-enrich` edge function (35+ fields) | Enrichment skills only |
| Web search (Brave) | `executeWebSearch()` in agentSkillExecutor | ~5 of 95 |
| Web search (Gemini) | `gemini-2.0-flash` with google_search_retrieval | Skills with web_search capability |
| Skill references/ | Loaded as tier-2 docs on execution | ~13 of 95 |

## Audit Summary
- **95 total skills** in .claude/skills/
- **55% are thin** — prompt templates without external data enrichment
- **87% have no references/** documentation
- **Only 19%** leverage web search, RAG, or enrichment APIs

## Top 10 Skills Selected for Upgrade

### Priority 1 — No references/, high user-facing impact
1. **copilot-proposal** (209 lines, ~1,350 tokens) — Pulls deal data only, no competitive pricing or ROI
2. **copilot-followup** (197 lines, ~1,250 tokens) — Basic email draft, no RAG transcript context
3. **copilot-battlecard** (216 lines, ~1,400 tokens) — CRM mentions only, no web competitor research
4. **copilot-objection** (250 lines, ~1,600 tokens) — No objection playbooks or pattern tracking
5. **copilot-chase** (220 lines, ~1,400 tokens) — No re-engagement templates by silence duration

### Priority 2 — Has some references/, needs enrichment layer
6. **sales-sequence** (359 lines, ~2,100 tokens) — Strong playbook but no CRM history or adaptive timing
7. **deal-next-best-actions** (352 lines, ~2,050 tokens) — Good structure, needs worked examples
8. **lead-qualification** (425 lines, ~2,450 tokens) — Scoring works, needs web research + behavioral signals
9. **daily-focus-planner** (430 lines, ~2,500 tokens) — CVHS scoring solid, needs historical pattern analysis
10. **post-meeting-followup-pack-builder** (570 lines, ~3,200 tokens) — Already strong, polish pass

## Upgrade Pattern (Applied to Each Skill)

### A. Multi-Layer Data Model
Every skill gets layered context, not just CRM data:
- **Layer 1**: Entity data (deal, contact, company from CRM)
- **Layer 2**: Enrichment data (AI Ark/Apollo for contact depth, web search for company context)
- **Layer 3**: Historical context (RAG transcript search for past conversations, activity timeline)
- **Layer 4**: Intelligence signals (deal health, risk factors, competitive mentions, sentiment trends)
- **Layer 5**: Strategy synthesis (AI-generated recommendations from all layers)

### B. RAG Integration Instructions
Add to each skill's instructions:
```
## Historical Context (via RAG)
Before generating output, search meeting transcripts for:
- [skill-specific queries — e.g., "objections raised by {contact}", "pricing discussions with {company}"]
- Use results to ground recommendations in real conversation history
- Flag when RAG returns no results (first interaction vs. data gap)
```

### C. Web Search Integration
Add `requires_capabilities: ['web_search']` to frontmatter where applicable:
- Battlecard: competitor news, pricing, reviews
- Proposal: similar companies, industry benchmarks
- Lead qualification: company research, tech stack detection
- Chase: contact's recent LinkedIn/company activity

### D. References/ Documentation
Each skill gets 2-3 reference files:
- `templates.md` — Output templates by variation (e.g., by deal stage, by meeting type)
- `frameworks.md` — Decision frameworks, scoring models, quality rubrics
- `examples.md` — Annotated good vs. bad examples

### E. Quality Checklist
5-10 measurable validation points per skill, e.g.:
```
- [ ] Every data claim has a source (CRM, web, RAG transcript)
- [ ] Output word count within specified range
- [ ] No generic phrases (flag "just checking in", "I wanted to follow up")
- [ ] Personalization signals ≥ 3
- [ ] CTA is specific and time-bound
```

### F. Graceful Degradation
Each skill handles 5+ failure modes:
- Missing CRM data → proceed with available context, flag gaps
- RAG returns nothing → flag "first interaction" or suggest data collection
- Web search fails → proceed without, note in output
- Contact not enriched → suggest enrichment before next use
- Conflicting signals → surface both, let user decide
