# Consult Report: Demo Seed Data for Magic Link Test Users
Generated: 2026-03-02

## User Request
"For test accounts created by magic links, pre-fill with seeded data — fake meetings with transcripts, intelligence, deals, contacts. Fully simulated demo with real functionality that still consumes credits."

## User Selection
Full sandbox: 15-20 meetings, 30+ contacts, 10+ deals, realistic 3-month account.

## Agent Findings

### Schema Scout
- Mapped 12 core tables with exact column schemas
- Key gotchas: `meetings.owner_user_id` (not user_id), `contacts.owner_id`, no `status` column on meetings (uses `transcript_status`/`summary_status`/`thumbnail_status`)
- `meeting_classifications` powers aggregate analytics — must be seeded
- `stages` table has no `org_id` — stages appear shared or RLS-scoped
- `contacts` has no `org_id` — scoped via `owner_id` + `clerk_org_id`

### Patterns Scout
- Existing demo patterns: tourDemoData.ts (client-side only), instant-replay (hardcoded SSE), demo-convert-account (9-step org setup)
- Credit system: `add_credits` RPC with `p_type: 'bonus'`, costs defined in `creditPacks.ts`
- Convention: use `.upsert()` with `onConflict` everywhere, service role client, `getCorsHeaders(req)`
- Pin `@supabase/supabase-js@2.43.4` on esm.sh

## Architecture Decision
New edge function `seed-demo-data` called async from `complete-test-user-signup` after step 7 (token marked used). Fire-and-forget so user lands on dashboard immediately.

## Risk Assessment
- **Medium**: Transcript templates must be realistic enough for AI to extract good insights
- **Medium**: ~200+ inserts could timeout — use batch operations
- **Low**: Date distribution needs realistic 3-month spread
- **Low**: `stages` and `contacts` table scoping (no org_id) — use owner_id linkage
