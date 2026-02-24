# Progress Log — Declarative Skills

## Feature Summary
Eliminate hardcoded model routing in skillsRuntime.ts. Make the skill system fully declarative: Zod schema as source of truth, DB trigger for enforcement, UI validation, runtime reads from frontmatter.

## Codebase Patterns
- Zod ^4.1.5 already in package.json
- Existing `validate_skill_frontmatter` Postgres function in migration `20260130000002`
- SkillDocumentEditor uses basic form state, no schema validation
- skillsRuntime.ts has two hardcoded arrays: `WEB_SEARCH_SKILLS` (5 keys), `IMAGE_GENERATION_SKILLS` (2 keys)
- promptLoader.ts loads from `ai_prompt_templates` table, not `platform_skills` frontmatter

---

## Session Log

_(No sessions yet)_
