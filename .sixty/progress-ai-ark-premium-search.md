# Progress Log — AI Ark Premium Search Experience

## Feature Summary
Transform AI Ark from basic integration to premium data sourcing hub with rich autocomplete filters, credit-smart 5-preview pattern, Gemini-powered NL search, and dedicated /prospecting page.

## Key Decisions
- **NL Parser**: Gemini Flash 3.1 (matches Apollo parser pattern)
- **Entry Point**: Dedicated /prospecting page with tabs
- **Reference Data**: Top 5K technologies + 10K cities bundled, API fallback for full datasets
- **Preview UX**: Show 5 of N results with total count, user confirms before pulling more

## Dependency Graph
```
ARKP-001 (reference data) ──┬──→ ARKP-003 (industry picker) ──┐
                            ├──→ ARKP-004 (tech picker) ───────┤
                            ├──→ ARKP-005 (location picker) ───┤──→ ARKP-006 (wizard) ──→ ARKP-008 (NL wiring) ──→ ARKP-009 (hub page) ──→ ARKP-010 (similarity) ──→ ARKP-013 (deal buttons)
                            └──→ ARKP-007 (NL parser) ─────────┘
ARKP-002 (preview mode) ───────────────────────────────────────────→ ARKP-006, ARKP-011 (workflow node)
                                                                     ARKP-012 (skill updates)
                                                                     ARKP-014 (enrich cascade)
```

## Codebase Patterns
- Follow ApolloSearchWizard.tsx 3-step pattern for wizard
- Follow parse-apollo-query pattern for NL parser edge function
- Use Radix Popover + Command pattern for comboboxes
- Pin @supabase/supabase-js@2.43.4 in all edge functions
- Use getCorsHeaders(req) from _shared/corsHelper.ts

---

## Session Log

*(No sessions yet)*
