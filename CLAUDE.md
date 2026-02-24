# use60 - Pre & Post Meeting Command Centre

Sales intelligence platform: meeting AI, pipeline tracking, smart task automation, relationship health scoring, and autonomous AI copilot with persistent memory.

| Environment | Main App | Landing Pages |
|-------------|----------|---------------|
| **Production** | app.use60.com | www.use60.com |
| **Development** | localhost:5175 | localhost:5173 |

## Tech Stack

**Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Framer Motion
**State**: Zustand (client) + React Query (server)
**Backend**: Supabase (PostgreSQL, Edge Functions, RLS, Realtime)
**Auth**: Dual support - Supabase Auth or Clerk
**Structure**: Monorepo with `/packages/landing` for marketing site

## Critical Rules

### Always Do
- Read files before editing - never modify blind
- Use absolute paths for all file operations
- Follow existing patterns in the codebase
- Use `maybeSingle()` when record might not exist (returns null gracefully)
- Explicit column selection in edge functions (not `select('*')`)
- Async/await over `.then()` chains
- Handle errors with toast feedback to users

### Never Do
- Expose service role key to frontend
- Use `single()` when record might not exist (throws PGRST116)
- Use `VITE_` prefix for API keys -- exposes secrets to the browser. AI keys are stored per-user in `user_settings` table.
- Auto-commit without explicit user request
- Skip TypeScript strict mode
- Use emoji icons in the UI -- always use Lucide React icons (`lucide-react`)
- Use legacy `corsHeaders` in new edge functions -- use `getCorsHeaders(req)` from `corsHelper.ts` for origin-validated CORS
- Create `<SheetContent>` or side panels without `!top-16 !h-[calc(100vh-4rem)]` -- they will render behind the fixed top bar

### Database Column Gotchas

**CRITICAL**: Different tables use different column names for user ownership!

| Table | User Column | Notes |
|-------|-------------|-------|
| `meetings` | `owner_user_id` | **NOT `user_id`** - common error! |
| `tasks` | `assigned_to` / `owner_id` / `created_by` | Has multiple user columns |
| `deals` | `owner_id` | **NOT `user_id`** - common error! |
| `contacts` | `owner_id` | **NOT `user_id`** |
| `activities` | `user_id` | Standard |
| `calendar_events` | `user_id` | Standard |
| `workflow_executions` | `user_id` | Standard |
| `copilot_memories` | `user_id` | Standard |
| `copilot_conversations` | `user_id` | Standard |

**Always verify column names before writing migrations or queries!**

Use `maybeSingle()` when a record might not exist (returns null). Use `single()` only when a record MUST exist (throws PGRST116 if missing).

## Key Architecture

**Service Locator**: Central DI container at `src/lib/services/ServiceLocator.tsx` -- access via `const { dealService, activityService } = useServices();`

**Data Flow**: User Action -> React Component -> useQuery/useMutation (React Query) -> Service Layer -> Supabase Client -> PostgreSQL (with RLS)

**State Management**: Zustand for UI state/preferences/active org. React Query for server data/caching/real-time sync. URL state for filters/pagination/search.

**Top-Level Structure**: `src/components/` (copilot, platform, ui), `src/lib/` (configuration, contexts, copilot/agent, hooks, sequences, services, stores, types, utils), `src/pages/`, `supabase/functions/` + `supabase/migrations/`, `packages/landing/`, `skills/atomic/` + `skills/sequences/`

## Common Commands

```bash
npm run dev              # Start main app (port 5175) -- uses .env.development
npm run dev:staging      # Start with staging Supabase -- uses .env.staging
npm run dev:production   # Start with production Supabase -- uses .env.production
npm run build            # Production build
npm run test             # Run tests
npm run playwright       # E2E tests

# Landing pages
cd packages/landing
npm run dev              # Start landing (port 5173)
```

## Supabase Environments

| Environment | Project Ref | Git Branch | npm Script |
|-------------|-------------|------------|------------|
| **Production** | `ygdpgliavpxeugaajgrb` | `main` | `npm run dev:production` |
| **Staging** | `caerqjzvuerejfrdtygb` | `staging` | `npm run dev:staging` |
| **Development** | `wbgmnyekgqklggilgqag` | `development` | `npm run dev` |

**Edge Function Gotchas**:
- Default to JWT-protected functions.
- For public/demo/webhook endpoints, disable JWT verification explicitly with `verify_jwt = false` (or deploy with `--no-verify-jwt`) and enforce your own validation/rate limits in function code.
- **Staging deploys MUST use `--no-verify-jwt`** — staging uses ES256 JWTs which the Supabase gateway rejects. Deploy command: `npx supabase functions deploy <name> --project-ref caerqjzvuerejfrdtygb --no-verify-jwt`. Functions that need auth should validate JWTs internally in their code.
- Use `esm.sh` with pinned versions for imports (pin `@supabase/supabase-js@2.43.4` — `@2` resolves to a broken version on esm.sh).
- Always use explicit column selection (not `select('*')`).
- New functions must import `getCorsHeaders(req)` from `_shared/corsHelper.ts` for origin-validated CORS.

## Copilot System (Transition In Progress)

**Routing** (`CopilotContext.tsx` `sendMessage()`): autonomous mode (checked first) -> agent mode -> regular mode fallthrough. Mode is hardcoded in state — no user-facing toggle.

| Mode | System | Model | Default | Status |
|------|--------|-------|---------|--------|
| **Autonomous** | `copilot-autonomous` | Claude Haiku 4.5 (native `tool_use`) | **ON** | Active default — labeled "new" in code |
| **Agent** | `api-copilot` via planner | Gemini (indirect) | OFF | Labeled "legacy" in code |
| **Regular** | `api-copilot` | Gemini 2.5 Flash (function calling) | Fallthrough | Most feature-complete |

**`copilot-autonomous` is the active default** — but the transition is incomplete:
- Returns **plain text only** (no structured response panels)
- `api-copilot` still has 48 rich response components, deterministic V1 router, and preview->confirm HITL
- Skill Test Console and Interactive Playground still call `api-copilot` directly
- `ApplicationConfig.ts` has a disconnected `autonomous_copilot` flag (`enabled: false`, different model) — not wired to mode selection

### Workflow AI Nodes (separate from copilot chat)
- **Multi-provider**: OpenAI, Anthropic, Gemini, OpenRouter -- configurable per user via `aiProvider.ts`

### 4-Tool Architecture (api-copilot)

| Tool | Purpose |
|------|---------|
| `list_skills` | Lists available skills for the organization |
| `get_skill` | Retrieves a compiled skill document |
| `execute_action` | Executes CRM actions and runs skills/sequences |
| `resolve_entity` | Resolves ambiguous person references (first-name-only) |

### Key Files

| File | Purpose |
|------|---------|
| `supabase/functions/api-copilot/index.ts` | Primary copilot edge function (Gemini) |
| `supabase/functions/copilot-autonomous/index.ts` | Autonomous copilot edge function (Claude) |
| `src/lib/copilot/agent/autonomousExecutor.ts` | Skill-to-tool conversion, agentic iteration |
| `src/lib/services/copilotRoutingService.ts` | 3-step routing: sequences -> triggers -> embeddings |
| `src/lib/services/copilotMemoryService.ts` | Memory store/recall/extract with relevance scoring |
| `src/lib/services/copilotSessionService.ts` | Persistent sessions, compaction at 80k tokens |
| `src/lib/hooks/useCopilotChat.ts` | React hook for streaming, tool tracking |
| `src/lib/contexts/CopilotContext.tsx` | Copilot state management |

### Skill-First Execution Pattern
Copilot behavior: **user intent -> skill/sequence selection -> tool execution -> structured response panel**. Backend emits `tool_executions` telemetry and (when applicable) a `structuredResponse` for rich UI cards. Frontend shows a "working story" stepper while tools run, then swaps in the structured panel.

### Confirmation Pattern (Preview -> Confirm)
When a sequence runs with `is_simulation: true`, the assistant stores `pending_action`. A user reply like "Confirm" re-executes with `is_simulation: false`. This is the standard HITL pattern for create task / post Slack / send email flows.

### UI Action Contract
Structured response components emit actions via `onActionClick`: `open_contact`, `open_deal`, `open_meeting`, `open_task`, `open_external_url`. Handler: `src/components/assistant/AssistantShell.tsx`. Legacy aliases exist but new work uses the standard names.

## Skills System

**Folder Structure** (strictly enforced -- 3 subdirectories only, no exceptions):
`skills/atomic/<skill-name>/` and `skills/sequences/seq-<name>/` each contain: `SKILL.md` (required), `references/`, `scripts/`, `assets/`. No other directories allowed.

**Routing Chain**: sequences by triggers (0.7+ confidence) -> skills by triggers (0.5+) -> embedding similarity on descriptions (cosine 0.6+). The `description` field is the most important field for discovery.

**CLI**: `npm run validate-skills` (validate all SKILL.md files), `npm run sync-skills` (parse -> validate -> upsert DB -> compile orgs -> generate embeddings), `npm run sync-skills:dry` (preview).

**Two tables**: `platform_skills` (master templates with `${variable}` placeholders) -> `organization_skills` (runtime, compiled per-org with variables resolved). Copilot reads from `organization_skills` at runtime via `get-agent-skills` RPC.

**All copilot paths** (`autonomousExecutor.ts`, `copilotRoutingService.ts`, `copilot-autonomous/index.ts`, and `get-agent-skills`) now read from `organization_skills` via the `get_organization_skills_for_agent` RPC, ensuring org-specific variable resolution. The `platform_skills` table is only read directly by admin/management UIs (skill builder, QA harness, platform pages).

See: `docs/copilot/SKILL_FRONTMATTER_GUIDE.md` for full spec.

## Key Integrations

- **Fathom**: Meeting transcripts, auto-indexed for AI search
- **60 Notetaker (MeetingBaaS)**: Bot-based meeting recording with permanent S3 storage
- **Google Calendar**: Manual sync, events stored locally
- **Slack**: Pipeline alerts, win/loss notifications, HITL approvals
- **Google Gemini**: Primary copilot AI (api-copilot, function calling)
- **Anthropic Claude**: Autonomous copilot AI (copilot-autonomous, native tool_use)

See: `docs/integrations/` (19 integration docs)

## Recording System (60 Notetaker / MeetingBaaS)

**4-Phase Pipeline**: (1) Bot Deployment -- `auto-join-scheduler` cron deploys bots via MeetingBaaS API. (2) S3 Upload -- `poll-s3-upload-queue` streams video/audio to S3 (5MB multipart chunks, exponential backoff retry). (3) Transcription -- Gladia async or MeetingBaaS webhook, both call `syncRecordingToMeeting()`. (4) Thumbnail -- presigned S3 URL sent to Lambda for generation.

**Key Files**: `supabase/functions/auto-join-scheduler/`, `supabase/functions/deploy-recording-bot/`, `supabase/functions/meetingbaas-webhook/`, `supabase/functions/upload-recording-to-s3/`, `supabase/functions/process-recording/`, `supabase/functions/_shared/recordingCompleteSync.ts`

See: `docs/CLAUDE_REFERENCE.md` for full recording guide.

## Security

**Defense-in-Depth (4 layers)**: Frontend JWT auth -> Edge Function user-scoped client (minimal permissions) -> Row Level Security (database enforcement) -> Security Monitoring (anomaly detection, audit logs)

**Copilot Conversation Privacy**: Strictly user-private, NEVER org-shared. Admins cannot read other users' conversations (enforced by CHECK constraint + RLS). Export rate limited to 10/hour. Access logged to `security_audit_log`.

**Service Role Minimization**: Use user-scoped Supabase client by default (respects RLS). Service role ONLY for justified cases (org-wide persona compilation, cross-user analytics) -- document and audit every use. Refactoring guide: `supabase/functions/api-copilot/SERVICE_ROLE_REFACTOR.md`

**NEVER use `VITE_` prefix for API keys** -- this exposes them to the browser bundle. AI keys are stored per-user in the `user_settings` table.

**New edge functions MUST use `corsHelper.ts`** -- import `getCorsHeaders(req)` for origin-validated CORS. Do NOT use the legacy `corsHeaders` export.

See: `docs/security/SECURITY_IMPLEMENTATION_SUMMARY.md` and `docs/security/SECURITY_HARDENING_GUIDE.md`

## Important Patterns

**Email Generation**: Always include current date context in email prompts -- `new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })` added as "TODAY'S DATE" in the prompt.

**Calendar Events**: Filter for real meetings with `attendees_count > 1` (excludes solo focus time/reminders). Always fetch more than needed when filtering.

**Template Variables**: `resolvePath(context, 'outputs.leads[0].contact.name')` for nested paths. `resolveExpression('${foo}', context)` for full/embedded variable substitution. `cleanUnresolvedVariables()` for UI fallback cleanup.

**Authorization**: `import { isUserAdmin, canEditDeal } from '@/lib/utils/adminUtils'` -- check admin status and deal permissions before actions.

**UI Components**: Radix UI primitives from `@/components/ui/` (Button, Dialog, etc.). Toast via `import { toast } from 'sonner'`. Always use Lucide React icons, never emoji.

**Sheets & Panels (top bar offset)**: The app has a fixed top bar (`h-16` / 4rem). All `<SheetContent>` and side panels MUST include `!top-16 !h-[calc(100vh-4rem)]` (or `!top-16 !h-auto`) so they render below the top bar, not behind it. Dialogs/modals are unaffected since they center in the viewport.

## Documentation Index

| Document | Purpose |
|----------|---------|
| `docs/DOCUMENTATION_INDEX.md` | Master index of all documentation |
| `docs/CLAUDE_REFERENCE.md` | Full detailed reference (expanded from this file) |
| `docs/copilot/SKILL_FRONTMATTER_GUIDE.md` | Complete skill frontmatter spec (V2/V3, triggers, schemas) |
| `docs/copilot/agent.md` | Copilot architecture deep dive |
| `docs/security/SECURITY_IMPLEMENTATION_SUMMARY.md` | Security architecture overview |
| `docs/security/SECURITY_HARDENING_GUIDE.md` | Security checklist and procedures |
| `docs/deployment/PRODUCTION_DEPLOYMENT_CHECKLIST.md` | Production deployment procedures |
| `docs/integrations/` | 19 integration-specific docs |
| `docs/PRD_PROACTIVE_AI_TEAMMATE.md` | Product vision and roadmap |
| `docs/SUBMODULES.md` | Git submodule setup and commands |

## Git Submodules

This repo uses git submodules. Always run `git submodule update --init --recursive` after pulling. See `docs/SUBMODULES.md` for full guide.

| Submodule | Path | Repo |
|-----------|------|------|
| meeting-translation | `meeting-translation/` | `SixtySecondsApp/meeting-translation` |

## Cursor Rules

See `.cursor/rules/` for detailed patterns:

| File | Purpose |
|------|---------|
| `index.mdc` | Project overview, critical rules (always applies) |
| `architecture.mdc` | System design, Service Locator pattern |
| `conventions.mdc` | Code style, naming conventions |
| `patterns.mdc` | React Query, Zustand, forms |
| `api.mdc` | Edge functions, error handling |
| `database.mdc` | Schema, RLS, migrations |
| `components.mdc` | UI patterns, modals, wizards |
| `integrations.mdc` | External services (Calendar, Fathom, Slack) |
| `slack-blocks.mdc` | Slack Block Kit reference |
