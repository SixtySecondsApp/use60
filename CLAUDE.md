# 60 — The AI Command Center for Sales

60 automates everything either side of the sales call. Find leads, engage them, prep for meetings, follow up, keep deals warm. The rep focuses on conversations that close revenue. 60 handles the rest.

Born from 10 years of running Sixty Seconds — go-to-market and sales for hundreds of clients. The name is the philosophy: everything takes 60 seconds or less. Speed wins.

**Who we build for:** Solo founders and small sales teams leaving money on the table. Too busy with "founder stuff" to do sales admin. They live in their calendar and neglect everything else — the follow-ups, the pipeline, the prep.

**What makes 60 different:** The market is fragmented. CRM here, notetaker there, task list somewhere else, proposal system, data list, email outreach — all disconnected. 60 is the command center that pulls scattered context into one place where AI can see everything and act on it.

**The wow moment:** Your first follow-up email. Written in your tone, with perfect awareness of the deal and the buyer, ready before you even think about it.

**What 60 must never become:** A stale task list. An endless notification system. If it's "too many messages and no action," we've failed. 60 gets shit done.

## Engineering Principles

1. **Protect the loop, not the feature.** Trust cycles: agents act, users approve, confidence grows, autonomy increases. Never break observability or approval flows.
2. **Extend, don't rebuild.** Compose what exists. A well-wired integration that ships tomorrow beats perfect architecture in three weeks.
3. **Default to action, gate with confidence.** Ship things that do something by default. Always include the gate — threshold, fallback, human-in-the-loop.
4. **Make it visible before you make it clever.** A dumb agent you can watch is more valuable than a smart agent you can't.

## Product Philosophy

- The AI acts, not just advises. Teammate, not tool.
- Gather all context. Learn from the user over time. Get smarter.
- Be where they work — Slack, email. In-app notifications don't cut it.
- Never make the user configure what the AI can figure out.
- If it takes more than 2 clicks, we've failed.
- Speed over perfection. Ship it rough, iterate fast.

## Critical Rules

### Always
- Read files before editing. Never modify blind.
- Use `maybeSingle()` when a record might not exist. `single()` only when it MUST exist (throws PGRST116).
- Explicit column selection in edge functions — never `select('*')`.
- Async/await over `.then()` chains.
- Errors get toast feedback to users.
- Lucide React icons only. Never emoji.

### Never
- Expose service role key to frontend.
- `VITE_` prefix for API keys — exposes secrets to the browser. AI keys live in `user_settings` table.
- Auto-commit without explicit user request.
- Legacy `corsHeaders` — use `getCorsHeaders(req)` from `_shared/corsHelper.ts`.
- `<SheetContent>` without `!top-16 !h-[calc(100vh-4rem)]` — renders behind fixed top bar.

### Database Column Ownership (different tables, different column names)

| Table | User Column | Watch Out |
|-------|-------------|-----------|
| `meetings` | `owner_user_id` | NOT `user_id` |
| `deals` | `owner_id` | NOT `user_id` |
| `contacts` | `owner_id` | NOT `user_id` |
| `tasks` | `assigned_to` / `owner_id` / `created_by` | Multiple columns |
| `activities` | `user_id` | Standard |
| `calendar_events` | `user_id` | Standard |

### Edge Functions
- Pin `@supabase/supabase-js@2.43.4` on esm.sh — `@2` resolves to a broken version.
- New functions: `getCorsHeaders(req)` from `_shared/corsHelper.ts`.
- Staging deploys: always `--no-verify-jwt` (ES256 JWT issue). Project ref: `caerqjzvuerejfrdtygb`.
- Default JWT-protected. Public endpoints need explicit `verify_jwt = false`.

## Environments

| Env | Ref | Command | URL |
|-----|-----|---------|-----|
| Production | `ygdpgliavpxeugaajgrb` | `npm run dev:production` | app.use60.com |
| Staging | `caerqjzvuerejfrdtygb` | `npm run dev:staging` | — |
| Development | `wbgmnyekgqklggilgqag` | `npm run dev` | localhost:5175 |

Landing pages: `packages/landing/` — localhost:5173 (dev), www.use60.com (prod).

## Deep Docs (read on demand)

| Topic | Location |
|-------|----------|
| Full reference | `docs/CLAUDE_REFERENCE.md` |
| Architecture | `docs/CLAUDE_REFERENCE.md` (Service Locator, data flow, state management) |
| Copilot system | `docs/copilot/agent.md` |
| Skills spec | `docs/copilot/SKILL_FRONTMATTER_GUIDE.md` |
| Security | `docs/security/SECURITY_IMPLEMENTATION_SUMMARY.md` |
| Integrations | `docs/integrations/` (19 docs) |
| Deployment | `docs/deployment/PRODUCTION_DEPLOYMENT_CHECKLIST.md` |
| All docs | `docs/DOCUMENTATION_INDEX.md` |
