# Progress Log — Skills Dynamic Context Injection

## Feature Summary
Thread org variables through all 25 user-facing skills via auto-generated Organization Context blocks, context profiles in frontmatter, and auto-recompile on context changes.

## Architecture
```
Org updates products in Settings
    ↓
organization_context table updated
    ↓
DB trigger → sets needs_recompile = true on all org skills
    ↓
pg_cron (every 5 min) → calls refresh-organization-skills
    ↓
compile-organization-skills reads ALL org context
    ↓
Generates context block per profile (sales/research/communication/full)
    ↓
Injects block into each skill's compiled_content
    ↓
organization_skills updated with fresh compiled content
    ↓
Next copilot call reads updated skills automatically
```

## Codebase Patterns
- Skill compilation: `supabase/functions/compile-organization-skills/index.ts`
- Skill refresh: `supabase/functions/refresh-organization-skills/index.ts`
- Skill parser: `scripts/lib/skillParser.ts`
- Skill sync: `scripts/sync-skills.ts`
- Variable interpolation supports: `${var}`, `${path.nested}`, `${arr | join(', ')}`, `${var | 'default'}`
- Integration skills (ai-ark-*, apify-*, output-format-selector) don't need org context

---

## Session Log

*(No sessions yet)*
