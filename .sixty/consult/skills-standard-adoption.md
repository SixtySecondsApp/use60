# Consult Report: Skills Standard Adoption
Generated: 2026-02-04

## User Request
Improve our skills and sequences setup to match the industry standard (Agent Skills spec from agentskills.io), making skills easily buildable, composable with integrations/variables/other skills, and effective with the AI Copilot.

## Source Document
`SKILLS_STANDARD_ADOPTION.md` — findings from analyzing skills.sh (40K+ skills) and the Agent Skills specification.

## Clarifications
- **Scope**: Phase 1 (File Format) + Phase 2 (Progressive Disclosure) + Phase 3 (Embedding Discovery)
- **Sync mechanism**: Both npm build script AND GitHub-pull edge function
- **Migration scope**: ALL existing skills (27 total: 16 atomic + 12 sequences) — note: slightly different from the 15+12 in the adoption doc due to paired skills counted separately
- **Embeddings**: Supabase pgvector stored in platform_skills column
- **Edge function sync**: GitHub API pull triggered on deploy/webhook

## Codebase Analysis

### Current State
- **15-16 atomic skills** and **12 sequences** defined across ~20 SQL seed migration files
- Skills stored in `platform_skills` table: JSONB frontmatter + TEXT content_template
- Routing via `copilotRoutingService.ts`: trigger pattern → keyword → description overlap
- Skill→tool conversion in `autonomousExecutor.ts`: frontmatter → Claude tool definitions
- Variable resolution via `skillCompiler.ts` with org context compilation
- MCP integration via `skillsProvider.ts`
- `organization_skills` table links platform skills to individual orgs (requires compilation step)

### Key Files
| File | Purpose | Lines |
|------|---------|-------|
| `src/lib/types/skills.ts` | V1/V2 frontmatter types, folder structure | 640 |
| `src/lib/services/copilotRoutingService.ts` | Trigger/keyword/desc matching | 383 |
| `src/lib/copilot/agent/autonomousExecutor.ts` | skillToTool(), agentic loop | 547 |
| `src/lib/utils/skillCompiler.ts` | Variable interpolation, @references | 639 |
| `src/lib/services/skillFolderService.ts` | Folder/doc CRUD, skill links | 989 |
| `src/lib/mcp/skillsProvider.ts` | MCP tool definitions for skills | 596 |
| `src/lib/hooks/useAgentSequences.ts` | SequenceStep, HITLConfig types | 150+ |
| `scripts/compile-org-skills.ts` | Compile platform→org skills | ~100 |

### Patterns to Follow
- Scripts use `npx tsx scripts/...` runner (tsx ^4.20.4 dev dep)
- Supabase client pattern from `compile-org-skills.ts`: `VITE_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
- Skill compilation: `platform_skills` → `organization_skills` (cross-join all orgs)
- Edge functions use Deno, import from `esm.sh`

### Risks Identified
| Severity | Risk | Mitigation |
|----------|------|------------|
| Medium | Frontmatter format change could break existing routing | V3 type is additive; sync maps to existing DB format |
| Medium | organization_skills compilation must happen after platform_skills sync | Sync script handles this automatically |
| Low | Large skill content may exceed SKILL.md body token budget | Phase 2 moves verbose content to references/ |
| Low | pgvector not yet enabled on Supabase project | Migration enables it (pre-installed on Supabase) |

## Recommended Plan
See `.sixty/plan-skills-standard-adoption.json` — 18 stories across 3 phases, 11 execution batches.

### Phase Summary
| Phase | Stories | Key Deliverables |
|-------|---------|-----------------|
| 1: File Format | 9 | skills/ directory, 27 SKILL.md files, parser, sync scripts, V3 types |
| 2: Progressive Disclosure | 4 | Token budgets, references/ extraction, lazy loading, tier API |
| 3: Embedding Discovery | 5 | pgvector, embeddings, similarity routing fallback |
