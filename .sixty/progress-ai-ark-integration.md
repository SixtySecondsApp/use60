# Progress Log — AI Ark Integration

## Codebase Patterns (from Apollo reference implementation)

- **Auth flow**: JWT → `userClient.auth.getUser()` → org_id from `organization_memberships` → API key from `integration_credentials(provider='ai_ark')`
- **Credential column**: `organization_id` (NOT `org_id`) on `integration_credentials`
- **CORS**: New functions use `getCorsHeaders(req)` from `_shared/corsHelper.ts`
- **esm.sh**: Pin `@supabase/supabase-js@2.43.4` to avoid CDN 500 errors
- **Browser extension workaround**: Accept `_auth_token` in request body as auth fallback
- **Enrichment**: "Enrich once, column many" — cache full response in `source_data.ai_ark`
- **Deployment**: `npx supabase functions deploy <name> --project-ref caerqjzvuerejfrdtygb --no-verify-jwt`
- **Frontend service**: Raw `fetch()` with `redirect: 'error'` for standalone search; `supabase.functions.invoke()` for table creation
- **Skills**: YAML frontmatter + markdown body in `skills/atomic/<name>/SKILL.md`, category: `enrichment`

---

## Session Log

*No sessions yet — run `60/dev-run` to begin execution.*

---
