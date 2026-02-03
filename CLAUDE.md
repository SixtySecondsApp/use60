# use60 - Pre & Post Meeting Command Centre

Sales intelligence platform that helps teams prepare for meetings and act on insights afterwards. Features meeting AI integration, pipeline tracking, smart task automation, relationship health scoring, and an autonomous AI copilot with persistent memory.

## URLs & Ports

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
- Use `maybeSingle()` when record might not exist
- Explicit column selection in edge functions (not `select('*')`)
- Async/await over `.then()` chains
- Handle errors with toast feedback to users

### Never Do
- Expose service role key to frontend
- Use `single()` when record might not exist (throws PGRST116)
- Auto-commit without explicit user request
- Skip TypeScript strict mode

## Database Column Gotchas

**CRITICAL**: Different tables use different column names for user ownership!

| Table | User Column | Notes |
|-------|-------------|-------|
| `meetings` | `owner_user_id` | **NOT `user_id`** - common error! |
| `deals` | `owner_id` | **NOT `user_id`** |
| `contacts` | `owner_id` | **NOT `user_id`** |
| `tasks` | `assigned_to` / `owner_id` / `created_by` | Has multiple user columns |
| `activities` | `user_id` | Standard |
| `calendar_events` | `user_id` | Standard |
| `workflow_executions` | `user_id` | Standard |
| `copilot_memories` | `user_id` | Standard |
| `copilot_conversations` | `user_id` | Standard |

**Always verify column names before writing migrations or queries!**

## Query Patterns

```typescript
// When record might not exist - use maybeSingle()
const { data } = await supabase
  .from('calendar_events')
  .select('id')
  .eq('external_id', eventId)
  .maybeSingle();  // Returns null gracefully

// When record MUST exist - use single()
const { data } = await supabase
  .from('profiles')
  .select('*')
  .eq('id', userId)
  .single();  // Throws PGRST116 if not found
```

## Key Architecture

### Service Locator Pattern
Central DI container at `/src/lib/services/ServiceLocator.tsx`:
```typescript
const { dealService, activityService } = useServices();
```

### Data Flow
```
User Action → React Component
    → useQuery/useMutation (React Query)
    → Service Layer
    → Supabase Client
    → PostgreSQL (with RLS)
```

### State Management
- **Zustand**: UI state, user preferences, active org
- **React Query**: Server data, caching, real-time sync
- **URL State**: Filters, pagination, search

## File Structure

```
src/
├── components/
│   ├── copilot/       # Copilot UI (ChatMessage, ToolCallCard, ActionButtons)
│   ├── platform/      # Platform features (SequenceBuilder, SequenceStep)
│   └── ui/            # Radix UI primitives
├── lib/
│   ├── configuration/ # ApplicationConfig (feature flags)
│   ├── contexts/      # React contexts (CopilotContext)
│   ├── copilot/
│   │   └── agent/     # Autonomous executor, agent orchestration
│   ├── hooks/         # Custom React hooks (useCopilotChat, useAgentSequences)
│   ├── sequences/     # SequenceOrchestrator
│   ├── services/      # API services + copilotMemoryService, copilotSessionService
│   ├── stores/        # Zustand stores
│   ├── types/         # TypeScript types (copilot.ts)
│   └── utils/         # Utility functions
├── pages/             # Route components
supabase/
├── functions/
│   └── copilot-autonomous/  # Autonomous copilot edge function
└── migrations/        # SQL migrations
packages/
└── landing/           # Marketing site (Vite)
```

## Common Commands

```bash
npm run dev           # Start main app (port 5175)
npm run build         # Production build
npm run test          # Run tests
npm run playwright    # E2E tests

# Landing pages
cd packages/landing
npm run dev           # Start landing (port 5173)
```

## Autonomous Copilot System

The copilot uses Claude's native tool_use API to autonomously select and execute skills.

### Architecture

```
User Message → copilot-autonomous (Edge Function)
    → buildContextWithMemories() (inject relevant memories)
    → buildSystemPrompt() (skills as tool definitions)
    → Claude agentic loop (tool_use → execute → result → repeat)
    → SSE stream back to frontend (token, tool_start, tool_result, done)
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Edge Function | `supabase/functions/copilot-autonomous/` | Loads skills, runs agentic loop, streams SSE |
| Autonomous Executor | `src/lib/copilot/agent/autonomousExecutor.ts` | Skill→tool conversion, iteration management |
| Memory Service | `src/lib/services/copilotMemoryService.ts` | Store/recall/extract memories with relevance scoring |
| Session Service | `src/lib/services/copilotSessionService.ts` | Persistent sessions, compaction at 80k tokens |
| Routing Service | `src/lib/services/copilotRoutingService.ts` | Sequence-first routing (0.7+ threshold), skill fallback (0.5+) |
| Chat Hook | `src/lib/hooks/useCopilotChat.ts` | React hook for streaming, tool tracking, session management |

### Memory System

Memories are automatically extracted during session compaction and on business events:

- **Categories**: `deal`, `relationship`, `preference`, `commitment`, `fact`
- **Entity linking**: Memories linked to `deal_id`, `contact_id`, `company_id`
- **Relevance scoring**: Keyword match + confidence + recency + access frequency
- **Event hooks**: Database triggers auto-create memories on deal stage changes, value changes, task completion, activity logging, etc.
- **Tables**: `copilot_memories`, `copilot_conversations`, `copilot_messages`, `copilot_session_summaries`, `copilot_executions`, `copilot_tool_calls`

### Sequences (Multi-Skill Orchestration)

```
SequenceOrchestrator → Level 1 abstract tools (research, draft, crm_action, etc.)
    → Level 2 specific skills (Apollo lookup, email draft, etc.)
    → Parallel execution (Promise.allSettled)
    → HITL approval gates (Slack / in-app)
```

- **Orchestrator**: `src/lib/sequences/SequenceOrchestrator.ts`
- **Hook**: `src/lib/hooks/useAgentSequences.ts`
- **Execution modes**: `sequential` | `parallel` (with `parallel_group`)
- **HITL**: `hitl_before` / `hitl_after` per step, configurable timeout actions
- **State**: Context passes between steps via input mapping and `SequenceStateManager`

### Copilot Rules

- Skills are loaded from `platform_skills` table and converted to Claude tool definitions
- Skill YAML frontmatter defines `input_schema` for tool parameters (see `docs/SKILL_FRONTMATTER_GUIDE.md`)
- Sequences are checked first (0.7+ confidence) before individual skills (0.5+)
- Session compaction triggers at 80k tokens, targets 20k after, keeps last 10 messages
- Memory extraction happens automatically during compaction via Claude
- Event-driven memories created by PostgreSQL triggers on entity changes

## Key Integrations

- **Fathom**: Meeting transcripts → auto-indexed for AI search
- **Google Calendar**: Manual sync, events stored locally
- **Slack**: Pipeline alerts, win/loss notifications, HITL approvals
- **Anthropic Claude**: Autonomous copilot via Messages API with tool_use

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

## Authorization

```typescript
import { isUserAdmin, canEditDeal } from '@/lib/utils/adminUtils';

// Check admin status
if (isUserAdmin(userData)) { /* admin actions */ }

// Check deal permissions
if (canEditDeal(deal, userData)) { /* edit allowed */ }
```

## Documentation

See `docs/` for detailed guides:

| File | Purpose |
|------|---------|
| `SKILL_FRONTMATTER_GUIDE.md` | V2 skill frontmatter spec (triggers, schemas, sequences) |
| `OAUTH_RELAY_SETUP.md` | OAuth relay pattern for localhost development |
| `research_assistant_*.md` | Competitive research (OpenClaw/Moltbot, NanoClaw) |

## UI Components

use60 uses Radix UI primitives:

```tsx
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { toast } from 'sonner';
```
