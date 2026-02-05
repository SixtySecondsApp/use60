# use60 - Pre & Post Meeting Command Centre

Sales intelligence platform that helps teams prepare for meetings and act on insights afterwards. Features meeting AI integration, pipeline tracking, smart task automation, relationship health scoring, and an autonomous AI copilot with persistent memory.

---

## Product Vision: Proactive AI Sales Teammate

> **See full PRD**: [`docs/PRD_PROACTIVE_AI_TEAMMATE.md`](docs/PRD_PROACTIVE_AI_TEAMMATE.md)

### The Goal

Transform the 60 Copilot from a reactive AI assistant into a **proactive AI sales teammate** — a dedicated team member who knows your company inside-out, acts autonomously to help senior sales reps be more successful, and communicates regularly via Slack.

### Core Principles

1. **Team Member, Not Chatbot** — Addresses users by name, references their deals, speaks like a colleague
2. **Company-Specific Knowledge** — Products, competitors, pain points, brand voice (from onboarding)
3. **Proactive, Not Just Reactive** — Daily pipeline analysis, pre-meeting prep, task reminders via Slack
4. **HITL for External Actions** — Preview → Confirm pattern for emails, tasks, Slack posts
5. **Superpowers via Skills & Sequences** — Meeting prep in 30s, deal rescue plans, follow-up drafts
6. **Clarifying Questions** — When ambiguous, ask for clarification before executing

### The Transformation

```
BEFORE (Generic AI):
  User: "Help me with my meeting"
  AI:   "I'd be happy to help! What meeting would you like assistance with?"

AFTER (Your Team Member):
  [Slack, 2 hours before meeting]
  🤖: "Hey Sarah! Your TechCorp meeting is in 2 hours.
       I've prepared a brief with talking points.
       They're evaluating us against WidgetCo — I have positioning ready.
       [View Brief] [Add Notes]
       Good luck! 🎯"
```

### Key Features

| Feature | Description |
|---------|-------------|
| **Specialized Persona** | After onboarding, copilot knows company inside-out |
| **Proactive Slack** | Daily pipeline summary, pre-meeting briefs, task reminders |
| **Clarifying Questions** | Detects ambiguity, offers options, then executes |
| **HITL Confirmation** | Preview external actions before executing |
| **Engagement Tracking** | Measure value delivered, optimize outreach |
| **Copilot Lab** | World-class testing platform for skills/sequences |

### Active Development

**Execution Plan**: `.sixty/plan-copilot-lab-specialized.json` (24 stories across 7 phases)

| Phase | Focus | Status |
|-------|-------|--------|
| 1 | Specialized Team Member Persona | Pending |
| 2 | Proactive Agent Workflows | Pending |
| 3 | Engagement Tracking | Pending |
| 4 | Enhanced Personalization | Pending |
| 5 | Periodic Re-Enrichment | Pending |
| 6-7 | Copilot Lab Improvements | Pending |

---

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
| `tasks` | `assigned_to` / `owner_id` / `created_by` | Has multiple user columns |
| `deals` | `owner_id` | **NOT `user_id`** - common error! |
| `contacts` | `owner_id` | **NOT `user_id`** |
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

## Skills System (Agent Skills Standard)

Skills follow the [Agent Skills specification](https://agentskills.io) — the open standard created by Anthropic and adopted by 25+ agent platforms. Full adoption plan: [`SKILLS_STANDARD_ADOPTION.md`](SKILLS_STANDARD_ADOPTION.md).

### Folder Structure (Strictly Enforced)

Every skill directory has **exactly the same structure** — 3 standard subdirectories, no more, no less:

```
skills/
├── atomic/                          # Self-contained skills (18 currently)
│   └── <skill-name>/               # kebab-case, must match skill_key
│       ├── SKILL.md                 # REQUIRED — YAML frontmatter + markdown body
│       ├── references/              # Detailed docs, linked skill content, frameworks
│       │   └── .gitkeep            # Empty folders tracked via .gitkeep
│       ├── scripts/                 # Executable code (Python, JS, Bash)
│       │   └── .gitkeep
│       └── assets/                  # Output schemas, templates, data files
│           └── .gitkeep
│
└── sequences/                       # Multi-skill orchestration chains (12 currently)
    └── seq-<name>/                  # Always prefixed with "seq-"
        ├── SKILL.md                 # REQUIRED — includes workflow + linked_skills
        ├── references/              # Linked skill content auto-populated here
        │   ├── meeting-prep-brief.md      # ← from linked_skills metadata
        │   └── meeting-command-center.md
        ├── scripts/
        │   └── .gitkeep
        └── assets/
            └── .gitkeep
```

**These 3 subdirectories are the ONLY directories allowed:**

| Directory | Purpose | Content |
|-----------|---------|---------|
| `references/` | Detailed docs loaded on-demand (tier 3) | Linked skill markdown, frameworks, scoring methodology, examples |
| `scripts/` | Executable code | Python, JS, Bash scripts (Phase 4 — not yet active) |
| `assets/` | Static resources | Output schemas, templates, data files |

**Do NOT create any other directories.** No `examples/`, no `tests/`, no `docs/`, no custom folders. This is enforced by the validation script.

### Linked Skills → References (How Sequences Reference Other Skills)

When a sequence declares `linked_skills` in its metadata, the linked skill's markdown body is placed in that sequence's `references/` folder:

```yaml
# seq-next-meeting-command-center/SKILL.md
metadata:
  linked_skills:
    - meeting-prep-brief            # → references/meeting-prep-brief.md
    - meeting-command-center-plan   # → references/meeting-command-center-plan.md
```

```
seq-next-meeting-command-center/
├── SKILL.md
├── references/
│   ├── meeting-prep-brief.md              ← body from atomic/meeting-prep-brief/SKILL.md
│   └── meeting-command-center-plan.md     ← body from atomic/meeting-command-center-plan/SKILL.md
├── scripts/.gitkeep
└── assets/.gitkeep
```

**Rules for reference files:**
- File is named `<skill-key>.md` (matches the linked skill's directory name)
- Contains the markdown body only (YAML frontmatter is stripped)
- Includes a header: `> This reference is auto-populated from skills/atomic/<key>/SKILL.md`
- **Do not edit reference files directly** — edit the source atomic skill, then re-sync
- Synced to `skill_documents` table by `sync-skills.ts` and `sync-skills-from-github` edge function
- Loaded on-demand at tier 3 (during skill execution, not at startup)

### Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Skill directory | `kebab-case`, max 64 chars | `meeting-prep-brief` |
| Sequence directory | `seq-` prefix + `kebab-case` | `seq-meeting-prep` |
| `skill_key` | **Auto-derived from directory name** — NOT from `frontmatter.name` | Dir `meeting-prep-brief/` → key `meeting-prep-brief` |
| SKILL.md | Always uppercase `SKILL.md` | Never `skill.md` or `Skill.md` |
| Reference files | `kebab-case.md` | `scoring-framework.md` |

### YAML Frontmatter Format

**Every SKILL.md starts with YAML frontmatter between `---` markers.** The frontmatter is the skill's identity — it determines how the copilot finds, matches, and executes the skill.

#### Required Fields (minimum viable skill)

```yaml
---
name: Meeting Prep Brief                    # Display name (shown in UI)
description: |                              # CRITICAL for discovery — this is what
  Prepare a comprehensive pre-meeting       # gets embedded for semantic search.
  brief with agenda and talking points.     # Write it like you're telling a colleague
  Use when a user has an upcoming meeting.  # WHAT the skill does and WHEN to use it.
metadata:
  category: sales-ai                        # One of the 7 categories below
  skill_type: atomic                        # atomic | sequence | composite
---
```

That's it. **4 fields.** Triggers are optional — the embedding system discovers skills from the description alone.

#### Categories (exactly 7)

| Category | Used For |
|----------|----------|
| `sales-ai` | AI-powered sales intelligence and automation |
| `writing` | Email drafting, reply composition |
| `enrichment` | Lead/company research, data enrichment |
| `workflows` | Automated process triggers |
| `data-access` | How Copilot fetches contacts, deals, meetings, emails |
| `output-format` | How Copilot formats responses for Slack, email, etc. |
| `agent-sequence` | Multi-step skill chains that orchestrate other skills |

#### Optional Fields (add as needed)

```yaml
metadata:
  # ── Identity ──
  author: sixty-ai
  version: "1"
  is_active: true                            # Default: true

  # ── Triggers (optional — for high-confidence routing) ──
  triggers:
    - pattern: meeting_scheduled             # Event or intent pattern
    - pattern: before_meeting
  keywords:                                  # Additional search terms
    - prep
    - brief

  # ── Context Requirements ──
  required_context:                          # Variables the skill NEEDS
    - meeting_id
    - event_id
  optional_context:                          # Variables it CAN USE if available
    - contact_name

  # ── Input/Output Schema (for tool definitions) ──
  inputs:
    - name: meeting_id
      type: string
      required: true
      description: The meeting to prepare for
  outputs:
    - name: brief
      type: object
      description: Structured meeting brief

  # ── Execution ──
  requires_capabilities:                     # System capabilities needed
    - calendar
    - crm
  priority: high                             # critical | high | medium | low
  execution_mode: sync                       # sync | async | streaming
  timeout_ms: 30000

  # ── Tags ──
  tags:
    - meetings
    - preparation
    - pre-meeting
```

#### Sequence-Only Fields

Sequences **must** include `linked_skills` and `workflow`:

```yaml
metadata:
  category: agent-sequence
  skill_type: sequence
  linked_skills:                             # Child skills this sequence invokes
    - meeting-prep-brief
    - meeting-command-center-plan
  workflow:
    - order: 1
      action: get_meetings                   # CRM action
      input_mapping:
        meeting_id: "${trigger.params.meeting_id}"
      output_key: meeting_data
      on_failure: stop
    - order: 2
      skill_key: meeting-prep-brief          # Reference to atomic skill
      input_mapping:
        meeting_data: "${outputs.meeting_data}"
      output_key: brief
      on_failure: stop
```

When a sequence references another skill via `linked_skills`, that skill's content is loaded from `skill_documents` or `platform_skills` at execution time. This enables cross-skill references without duplicating content.

### Markdown Body (After Frontmatter)

The body contains the actual instructions the copilot follows. Keep it under **5,000 tokens** — move detail into `references/`.

```markdown
---
name: Deal Rescue Plan
description: ...
metadata: ...
---
# Deal Rescue Plan

## Goal
Turn an at-risk deal into an executable rescue plan.

## Inputs
- `deal`: from execute_action(get_deal, include_health=true)
- `recent_activity` (optional)

## Steps
1. Diagnose why the deal is at risk
2. Identify missing information
3. Generate ranked rescue actions with ROI rationale
4. Create Mutual Action Plan tasks

## Organization Context
Company: ${company_name}
Competitors: ${competitors|join(', ')}
Key differentiators: ${value_propositions|join('; ')}

## Output Contract
Return a SkillResult with:
- `data.diagnosis`: { why_at_risk, missing_info, confidence }
- `data.rescue_plan`: ranked array of actions
- `data.map_tasks`: array of { title, description, due_date, priority }
```

#### Variable Syntax

| Syntax | Description | Example |
|--------|-------------|---------|
| `${variable}` | Simple substitution | `${company_name}` → "Acme Corp" |
| `${var\|join(', ')}` | Join array | `${competitors\|join(', ')}` → "WidgetCo, FooCorp" |
| `${var\|upper}` | Uppercase | `${brand_tone\|upper}` → "PROFESSIONAL" |
| `${var\|lower}` | Lowercase | `${domain\|lower}` → "acme.com" |
| `${var\|first}` | First element | `${products\|first}` → first product |
| `${var\|count}` | Array length | `${competitors\|count}` → 3 |
| `${var\|'fallback'}` | Default value | `${tagline\|'Sales intelligence'}` |

Variables are resolved per-org at compile time. Unresolved variables remain as `${...}` in the compiled output.

### Dual Authoring Paths

| Path | Who | How |
|------|-----|-----|
| **UI Editor** | Campaigns/Ops team | `/platform/skills/:category/new` — form fields, save button, no YAML knowledge needed |
| **SKILL.md files** | Developers | Edit files in `skills/` dir, run `npm run sync-skills` |

Both paths write to the same `platform_skills` table. Both trigger embedding generation and org compilation on save.

### On Save Pipeline (Both Paths)

```
Skill saved to platform_skills
  │
  ├─ 1. Embedding generated (OpenAI text-embedding-3-small, 1536-dim)
  │     → stored on platform_skills.description_embedding
  │     → enables semantic routing (cosine > 0.6 threshold)
  │
  ├─ 2. Org compilation (compile-organization-skills edge function)
  │     → resolves ${variables} using org context
  │     → saved to organization_skills table
  │     → this is what the copilot reads at runtime
  │
  └─ 3. Skill immediately discoverable by copilot
```

### CLI Scripts (Developer Path)

```bash
npm run validate-skills        # Validate all SKILL.md files (syntax, token budget, required fields)
npm run sync-skills            # Parse → validate → upsert DB → compile orgs → generate embeddings
npm run sync-skills:dry        # Preview without DB writes
# Single skill:
npm run sync-skills -- --skill meeting-prep-brief
```

### Routing Chain (How Copilot Finds Skills)

```
User message
  ├─ 1. Check sequences by triggers (confidence > 0.7) → match? → execute
  ├─ 2. Check skills by triggers (confidence > 0.5) → match? → execute
  └─ 3. Embedding similarity on descriptions (cosine > 0.6) → match? → execute
       (no triggers required — description-only skills work via this fallback)
```

**The description field is the most important field for discovery.** Write it like you're telling a colleague what the skill does and when they should use it. This text gets embedded and used for semantic matching.

### Production Skill Pipeline (How Skills Reach the Copilot)

**Two tables, two roles:**

| Table | Role | What's Stored |
|-------|------|---------------|
| `platform_skills` | Master templates | Raw frontmatter + `${variable}` templates + embeddings |
| `organization_skills` | Runtime (what copilot reads) | Compiled frontmatter + resolved content per org |

**Correct runtime path** (`get-agent-skills` edge function):
```sql
-- Uses get_organization_skills_for_agent RPC
SELECT COALESCE(os.compiled_frontmatter, ps.frontmatter) as frontmatter,
       COALESCE(os.compiled_content, ps.content_template) as content
FROM organization_skills os
JOIN platform_skills ps ON ps.skill_key = os.skill_id
WHERE os.organization_id = p_org_id AND os.is_active = true
```

**KNOWN ISSUE**: `autonomousExecutor.ts` and `copilotRoutingService.ts` currently read from `platform_skills` directly instead of `organization_skills`. This means org-specific variable resolution is bypassed in the frontend routing path. The edge function path (`get-agent-skills` RPC) works correctly. This needs to be fixed so both paths read from `organization_skills`.

### Progressive Disclosure (3-Tier Loading)

| Tier | What | Token Budget | When Loaded |
|------|------|-------------|-------------|
| 1. Metadata | `name` + `description` | ~50-100 tokens | Startup (all skills) |
| 2. Instructions | `SKILL.md` body | <5,000 tokens | On activation |
| 3. Resources | `references/` files | Unlimited | On demand during execution |

**Rule**: If SKILL.md body exceeds ~3,000 tokens, extract detail into `references/` files. The main body should be the core workflow; references hold deep context (frameworks, scoring methodology, examples).

### Database Tables

| Table | Purpose |
|-------|---------|
| `platform_skills` | Master templates — frontmatter (JSONB), content_template, description_embedding (vector) |
| `organization_skills` | **Runtime source** — compiled frontmatter + content with org variables resolved |
| `skill_documents` | `references/` files — loaded on demand per skill |
| `platform_skills_history` | Version history for rollback |

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/services/platformSkillService.ts` | CRUD + `syncSkillAfterSave()` (embedding + org compile) |
| `src/lib/hooks/usePlatformSkills.ts` | React Query hooks, auto-calls sync on create/update |
| `src/lib/services/embeddingService.ts` | `findSemanticMatches()` via `match_skills_by_embedding` RPC |
| `src/lib/services/copilotRoutingService.ts` | 3-step routing chain (sequences → triggers → embeddings) |
| `src/lib/copilot/agent/autonomousExecutor.ts` | Lazy tier-2 loading, skill→tool conversion |
| `scripts/lib/skillParser.ts` | YAML parser (gray-matter), SHA-256 hash, token estimation |
| `scripts/lib/generateEmbeddings.ts` | Batch embedding generation (OpenAI) |
| `scripts/sync-skills.ts` | CLI sync: parse → validate → upsert → compile → embed |
| `scripts/validate-skills.ts` | Validates all 30 SKILL.md files |
| `supabase/functions/compile-organization-skills/index.ts` | Resolves `${variables}` per org |
| `supabase/functions/get-agent-skills/index.ts` | Loads org-compiled skills for copilot (correct path) |
| `supabase/functions/generate-embedding/index.ts` | OpenAI embedding wrapper |
| `supabase/functions/sync-skills-from-github/index.ts` | Pull skills from GitHub repo |

### Adding a New Skill (Checklist)

1. **Create directory** with the standard 3 folders:
   ```bash
   mkdir -p skills/atomic/my-new-skill/{references,scripts,assets}
   touch skills/atomic/my-new-skill/{references,scripts,assets}/.gitkeep
   ```
2. **Create SKILL.md** with at minimum: `name`, `description`, `metadata.category`, `metadata.skill_type`
3. **Write a clear description** — this is the most important field for copilot discovery
4. **Add references** if body exceeds ~3,000 tokens (move detail to `references/`)
5. **For sequences**: Add `linked_skills` + `workflow` to metadata, then populate `references/` with linked skill content
6. **Validate**: `npm run validate-skills`
7. **Sync**: `npm run sync-skills` (generates embedding + compiles for all orgs)
8. **Or use the UI Editor**: `/platform/skills/:category/new` (embedding + compile happen on save)

## Key Integrations

- **Fathom**: Meeting transcripts → auto-indexed for AI search
- **60 Notetaker (MeetingBaaS)**: Bot-based meeting recording with S3 storage
- **Google Calendar**: Manual sync, events stored locally
- **Slack**: Pipeline alerts, win/loss notifications, HITL approvals
- **Google Gemini**: AI copilot powered by Gemini Flash (function calling)
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
| `SKILL_FRONTMATTER_GUIDE.md` | V2/V3 skill frontmatter spec (triggers, schemas, sequences) |
| `SKILLS_STANDARD_ADOPTION.md` | Agent Skills standard adoption plan (skills.sh, agentskills.io) |
| `OAUTH_RELAY_SETUP.md` | OAuth relay pattern for localhost development |
| `research_assistant_*.md` | Competitive research (OpenClaw/Moltbot, NanoClaw) |

## UI Components

use60 uses Radix UI primitives:

```tsx
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { toast } from 'sonner';
```

## Copilot System

> **Full PRD**: [`docs/PRD_PROACTIVE_AI_TEAMMATE.md`](docs/PRD_PROACTIVE_AI_TEAMMATE.md)

The AI Copilot is powered by **Google Gemini Flash** with function calling. The goal is to transform it into a **proactive AI sales teammate** that acts like a dedicated team member.

### Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│  PROACTIVE AI SALES TEAMMATE                                   │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  REACTIVE MODE (User Asks)                                     │
│  └── User message → Skill/Sequence → HITL → Response          │
│                                                                │
│  PROACTIVE MODE (Agent Initiates)                              │
│  └── Cron analysis → Opportunity → Execute → Slack notify     │
│                                                                │
│  CLARIFYING MODE (Ambiguous Request)                           │
│  └── Detect ambiguity → Offer options → Execute selection     │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### 4-Tool Architecture
The copilot exposes exactly 4 tools to the AI model:

| Tool | Purpose |
|------|---------|
| `list_skills` | Lists available skills for the organization |
| `get_skill` | Retrieves a compiled skill document |
| `execute_action` | Executes CRM actions and runs skills/sequences |
| `resolve_entity` | Resolves ambiguous person references (first-name-only) |

### Key Files
- `supabase/functions/api-copilot/index.ts` - Main edge function (~14,000 lines)
- `supabase/functions/_shared/salesCopilotPersona.ts` - Persona compilation (planned)
- `supabase/functions/proactive-pipeline-analysis/` - Daily analysis cron (planned)
- `src/lib/contexts/CopilotContext.tsx` - State management
- `src/components/copilot/CopilotRightPanel.tsx` - Right panel UI
- `src/components/copilot/responses/` - 48 structured response components

### Specialized Persona (from Onboarding)

After onboarding, a specialized persona is compiled from enrichment data:

```
You are {rep_name}'s dedicated sales analyst at {company_name}.
Think of yourself as their brilliant junior colleague who has superpowers.

COMPANY KNOWLEDGE:
- Products: {products}
- Competitors: {competitors}
- Pain points: {pain_points}
- Brand voice: {brand_tone}

HITL (always confirm external actions):
- Preview emails → wait for Confirm → then send
```

### Proactive Workflows (Slack-First)

| Workflow | Trigger | Action |
|----------|---------|--------|
| Pipeline Analysis | Daily 9am | Analyze → Slack summary |
| Pre-Meeting Prep | 2hrs before | Auto-prep → Slack brief |
| Task Reminders | Daily | Find overdue → Slack with actions |
| Deal Stall Alert | 7+ days inactive | Alert → Offer follow-up |

### Skill-first execution (not prompt-by-prompt)

Copilot should behave like: **user intent → skill/sequence selection → tool execution → structured response panel**.

- **Backend (edge function)**: emits `tool_executions` telemetry + (when applicable) a `structuredResponse` that the UI can render as a rich, clickable card.
- **Frontend**: shows a “working story” while tools run (stepper/progress), then swaps in the structured panel when the response arrives.

#### Deterministic (skill/sequence-driven) workflows

For high-frequency flows we want consistent behavior (and consistent UX), we treat them as deterministic workflows:

- **Search meetings (today/tomorrow)**: runs `execute_action(get_meetings_for_period)` and returns a `meeting_list` structured response.
- **Prep for next meeting**: runs `execute_action(run_sequence)` with `seq-next-meeting-command-center` in simulation mode first (preview), then renders `next_meeting_command_center`.
- **Create follow-ups**: runs `execute_action(run_sequence)` with `seq-post-meeting-followup-pack` in simulation mode first (preview), then renders `post_meeting_followup_pack`.

#### Confirmation pattern (preview → confirm)

When a sequence is run in `is_simulation: true`, the assistant message stores `pending_action` so a user reply like “Confirm” can execute the same sequence with `is_simulation: false`.

This is the standard pattern for “create task / post Slack / send email” flows: **preview first, then confirm**.

### Copilot UI contracts (critical)

#### 1) Clickable actions contract (do not ad-hoc window.location)

Structured response components should emit these actions via `onActionClick` (handled centrally):

- **In-app**: `open_contact`, `open_deal`, `open_meeting`, `open_task`
- **External**: `open_external_url` (always new tab)

Handler: `src/components/assistant/AssistantShell.tsx`

Backwards-compatible legacy aliases (`open_meeting_url`, `view_meeting`, `view_task`) exist but new work should use the standard names above.

#### 2) “Working story” stepper

While Copilot is processing, we show a stepper (and the right-panel progress) based on a `ToolCall.steps[]` list.

- Placeholder steps are created client-side using `detectToolType()` and `createToolCall()` (`src/lib/contexts/CopilotContext.tsx`)
- Real tool telemetry from the backend (`tool_executions`) replaces the placeholder once the response arrives

Tool UI components:
- `src/components/copilot/ToolCallIndicator.tsx`
- `src/components/copilot/ChatMessage.tsx`
- `src/components/copilot/CopilotRightPanel.tsx` (derives progress steps)

### Template Variables Pattern
```typescript
// Backend: Use resolvePath() for nested paths with array indices
resolvePath(context, 'outputs.leads[0].contact.name');

// Backend: resolveExpression() handles both full and embedded variables
resolveExpression('${foo}', context);           // Full replacement
resolveExpression('Hello ${foo}!', context);    // Embedded interpolation

// UI Fallback: Clean unresolved variables for legacy data
import { cleanUnresolvedVariables } from '@/lib/utils/templateUtils';
cleanUnresolvedVariables('Task for ${name}'); // → "Task for contact"
```

### Email Generation Pattern
Always include current date context in email prompts:
```typescript
const currentDateStr = new Date().toLocaleDateString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});
// Add to prompt: "TODAY'S DATE: ${currentDateStr}"
// Add instruction: "Use this date when making any date references"
```

### Calendar Events Pattern
Filter for real meetings (exclude solo blocks):
```typescript
// attendees_count > 1 means user + at least one other person
const { data } = await supabase
  .from('calendar_events')
  .select('*')
  .gt('attendees_count', 1)  // Excludes focus time, reminders
  .gte('start_time', new Date().toISOString())
  .order('start_time')
  .limit(5);  // Fetch more when filtering
```

## 60 Notetaker (MeetingBaaS) Integration

Bot-based meeting recording system that joins Zoom/Meet/Teams calls with permanent S3 storage.

### Key Files
- `supabase/functions/auto-join-scheduler/` - Cron job deploys bots (every 2 min)
- `supabase/functions/deploy-recording-bot/` - Bot deployment via MeetingBaaS API
- `supabase/functions/meetingbaas-webhook/` - Webhook handler for bot lifecycle events
- `supabase/functions/process-gladia-webhook/` - Gladia async transcription results
- `supabase/functions/process-recording/` - MeetingBaaS transcription + AI analysis
- `supabase/functions/upload-recording-to-s3/` - Background S3 upload (streaming multipart)
- `supabase/functions/poll-s3-upload-queue/` - Cron job polls upload queue (every 5 min)
- `supabase/functions/generate-s3-video-thumbnail/` - Thumbnail generation via Lambda
- `supabase/functions/_shared/recordingCompleteSync.ts` - Provider-agnostic S3 URL sync

### Recording Flow

**Phase 1: Bot Deployment & Recording**
1. `auto-join-scheduler` (cron every 2 min) finds upcoming meetings with `auto_join_enabled=true`
2. `deploy-recording-bot` sends bot to meeting via MeetingBaaS API
3. `meetingbaas-webhook` receives status updates:
   - `bot.joined` → Update status to 'joined'
   - `bot.completed` → Store MeetingBaaS URLs (4-hour expiry), set `s3_upload_status='pending'`

**Phase 2: S3 Upload (Background)**
4. `poll-s3-upload-queue` (cron every 5 min) finds recordings with `s3_upload_status='pending'`
   - Checks MeetingBaaS URL expiry (must be <4 hours old)
   - Implements exponential backoff retry: 2min, 5min, 10min (max 3 attempts)
5. `upload-recording-to-s3` streams video/audio to S3:
   - **Streaming multipart upload** (5MB chunks, no memory buffering)
   - S3 path: `meeting-recordings/{org_id}/{user_id}/{recording_id}/`
   - Updates: `s3_upload_status='complete'`, records file size, stores S3 URLs

**Phase 3: Transcription (Async)**
6. Two transcription paths:
   - **Gladia**: Async API → `process-gladia-webhook` receives results
   - **MeetingBaaS**: `transcript.ready` webhook → `process-recording`
7. Both paths call `syncRecordingToMeeting()` helper:
   - Checks if `s3_upload_status='complete'`
   - Syncs S3 URLs to meetings table (`video_url`, `audio_url`)
   - Triggers thumbnail generation if S3 video URL exists

**Phase 4: Thumbnail & Display**
8. `generate-s3-video-thumbnail` creates thumbnail:
   - Generates presigned S3 URL (15 min expiry) for private video
   - Calls Fathom Lambda with presigned URL
   - Stores thumbnail S3 URL in meetings table
9. Meetings page displays recording with permanent S3 URLs

### Architecture Highlights

**Unified Storage**: Both Fathom and 60 Notetaker recordings write to unified `meetings` table:
```typescript
// meetings.source_type differentiates sources
'fathom'        // Fathom integration (video_url from Fathom)
'60_notetaker'  // MeetingBaaS bot (video_url from S3, permanent)
'manual'        // Manual upload
```

**Provider-Agnostic Design**: The `syncRecordingToMeeting()` helper works with both transcription providers:
```typescript
// Called by process-gladia-webhook AND process-recording
await syncRecordingToMeeting({
  recording_id,
  bot_id,
  supabase,
});

// Automatically:
// 1. Syncs S3 URLs to meetings table (if upload complete)
// 2. Triggers thumbnail generation (if S3 video URL exists)
```

**Retry Strategy**: Exponential backoff for failed uploads:
- Attempt 1: 2 minutes after failure
- Attempt 2: 5 minutes after failure
- Attempt 3: 10 minutes after failure
- Max attempts: 3 (then mark as permanently failed)

### S3 Storage & Cost Tracking

**Admin Dashboard**: `/platform/s3-storage` shows:
- Total storage used (GB)
- Current month cost
- Next month projection
- Daily breakdown with charts

**Metrics Calculation** (daily cron at midnight UTC):
- Storage: $0.023/GB/month
- Download: $0.09/GB (estimated at 50% of storage × 1.7% daily download rate)
- Upload: Free

**Database Tracking**:
```sql
-- recordings table tracks upload status
s3_upload_status ENUM('pending', 'uploading', 'complete', 'failed')
s3_video_url TEXT
s3_audio_url TEXT
s3_file_size_bytes BIGINT
s3_upload_retry_count INT DEFAULT 0

-- s3_usage_metrics table tracks costs
metric_type ENUM('storage_gb', 'upload_gb', 'download_gb', 'api_requests')
value NUMERIC
cost_usd NUMERIC
```

### Thumbnail Generation Pattern
Uses existing Fathom Lambda with presigned S3 URLs:
```typescript
// Generate presigned URL for private S3 video
const signedUrl = await getSignedUrl(s3Client, new GetObjectCommand({
  Bucket: bucketName,
  Key: s3Key,
}), { expiresIn: 60 * 15 }); // 15 min

// Call Lambda with presigned URL (Lambda accepts any video URL)
const response = await fetch(lambdaUrl, {
  method: 'POST',
  body: JSON.stringify({ fathom_url: signedUrl }),
});
// Returns: { http_url, s3_location }
```

### Required Secrets (Edge Functions)
- `MEETINGBAAS_API_KEY` - API access
- `MEETINGBAAS_WEBHOOK_SECRET` - Signature verification
- `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- `GLADIA_API_KEY` - Async transcription (optional, MeetingBaaS fallback)

### Required Vault Secret (for cron)
- Name: `service_role_key`
- Value: Supabase service role key
- Used by: `call_auto_join_scheduler()`, `call_poll_s3_upload_queue()` SQL functions

## Security Architecture

> **Full Documentation**: [`docs/SECURITY_HARDENING_GUIDE.md`](docs/SECURITY_HARDENING_GUIDE.md)
> **Implementation Summary**: [`docs/SECURITY_IMPLEMENTATION_SUMMARY.md`](docs/SECURITY_IMPLEMENTATION_SUMMARY.md)

### Defense-in-Depth Security Model

use60 implements a comprehensive security architecture to protect user data, learned from Clawdbot vulnerability analysis where exposed AI control interfaces led to credential theft, conversation history exfiltration, and perception manipulation attacks.

**Key Achievement**: Multi-layered defense system that protects user data even if the edge function is compromised.

### Security Layers

```
┌────────────────────────────────────────────────────────────────┐
│  Frontend (React)                                              │
│  - User authentication via JWT                                 │
└────────────┬───────────────────────────────────────────────────┘
             │ JWT token
             ↓
┌────────────────────────────────────────────────────────────────┐
│  Edge Function (api-copilot)                                   │
│  - User-scoped client (default) ← Layer 1: Minimal Permissions│
│  - Service role (justified only, audited)                      │
└────────────┬───────────────────────────────────────────────────┘
             │ User JWT
             ↓
┌────────────────────────────────────────────────────────────────┐
│  Row Level Security (RLS) ← Layer 2: Database Enforcement      │
│  - User isolation enforced                                     │
│  - Org sharing configurable (admin-controlled)                 │
│  - Copilot conversations ALWAYS private                        │
└────────────┬───────────────────────────────────────────────────┘
             │ Filtered query
             ↓
┌────────────────────────────────────────────────────────────────┐
│  Database (Supabase) ← Layer 3: Data Isolation                 │
│  - Only user's data returned                                   │
│  - Audit logs preserved                                        │
└────────────┬───────────────────────────────────────────────────┘
             │
             ↓
┌────────────────────────────────────────────────────────────────┐
│  Security Monitoring ← Layer 4: Threat Detection               │
│  - Anomaly detection active (credential harvesting, exfiltration)│
│  - Real-time alerting                                          │
│  - Automated incident response                                 │
└────────────────────────────────────────────────────────────────┘
```

### Dynamic Data Sharing Model

**Org Settings Table**: Admin-configurable data sharing preferences

```sql
-- org_settings table
enable_crm_sharing: true       -- Contacts, deals (default: shared)
enable_meeting_sharing: true   -- Meetings (default: shared)
enable_task_sharing: false     -- Tasks (default: private)
enable_email_sharing: false    -- Emails (default: private)
enable_copilot_sharing: false  -- ALWAYS false (enforced by CHECK constraint)
```

**Dynamic RLS**: Policies check org settings at runtime

```typescript
// Example: Contacts policy
// User can see own contacts OR (if CRM sharing enabled) org members' contacts
SELECT * FROM contacts WHERE
  owner_id = auth.uid()
  OR (is_crm_sharing_enabled() AND user_in_same_org(owner_id))
```

### Copilot Conversation Privacy

**Strict Isolation**: Conversations are ALWAYS user-private, never shared

- ✅ User can read own conversations
- ❌ Org admins CANNOT read conversations (even with admin role)
- ❌ Service role CANNOT bypass (RLS enforced)
- ✅ Export rate limiting: Max 10 exports/hour (prevents bulk exfiltration)
- ✅ Access logging: Every read logged to security_audit_log
- ✅ Retention policies: Auto-archive after 365 days, GDPR right to erasure

**Why Strict**: Conversation history contains strategic intelligence:
- Months of context about deals, contacts, planning
- User's thinking patterns and decision-making
- Competitive intelligence and business strategy

### Service Role Minimization

**Current State** (needs refactoring):
```typescript
// ❌ DANGEROUS: Service role bypasses ALL security
const client = createClient(url, SERVICE_ROLE_KEY)
const { data } = await client.from('copilot_conversations').select('*')
// Returns ALL users' conversations! Compromised function = game over
```

**Target State**:
```typescript
// ✅ SAFE: User-scoped client respects RLS
const userClient = createClient(url, ANON_KEY, {
  global: { headers: { Authorization: authHeader } }
})
const { data } = await userClient.from('copilot_conversations').select('*')
// Returns ONLY current user's conversations (RLS enforced)

// Service role ONLY for justified cases (documented and audited)
const serviceClient = createClient(url, SERVICE_ROLE_KEY)
// Use ONLY for: org-wide persona compilation, cross-user analytics
```

**Refactoring Guide**: `supabase/functions/api-copilot/SERVICE_ROLE_REFACTOR.md`

### Security Monitoring

**Real-time Dashboard** (for org admins):
- **Health Score**: 0-100 based on incidents, suspicious activity, RLS coverage
- **Anomaly Detection**:
  - Credential harvesting: >50 accesses/hour = critical threat
  - Conversation exfiltration: >5 exports in 10min = critical threat
- **GDPR Compliance**: Automated checks for retention policies, access logging, right to erasure

**Key Functions**:
```sql
-- Daily monitoring
SELECT * FROM get_security_health_score(org_id);
SELECT * FROM detect_credential_harvesting();
SELECT * FROM detect_conversation_exfiltration();

-- Compliance reporting
SELECT * FROM generate_gdpr_compliance_report(org_id);
```

**Automated Incident Response**:
- Critical events trigger: System warnings, audit logs, Slack alerts (TODO)
- Rate limiting: Automatic enforcement on suspicious activity
- Access logs: Comprehensive audit trail for forensic analysis

### Key Migrations

| Migration | Purpose |
|-----------|---------|
| `20260126000000_comprehensive_security_hardening.sql` | RLS policies, org_settings, audit logging |
| `20260126000001_copilot_conversation_protection.sql` | Retention policies, export limits, GDPR compliance |
| `20260126000002_security_monitoring_dashboard.sql` | Health score, anomaly detection, compliance reporting |

### Security Best Practices

**Always Do**:
- Use user-scoped client by default (respects RLS)
- Log all privileged operations to security_audit_log
- Validate RLS policies before deployment: `SELECT * FROM check_missing_rls_policies()`
- Monitor security dashboard daily: `SELECT * FROM security_dashboard`

**Never Do**:
- Use service role without justification and documentation
- Share copilot conversations (enforced by CHECK constraint)
- Skip RLS validation before deploying migrations
- Ignore security alerts from anomaly detection

### Maintenance Schedule

| Frequency | Task |
|-----------|------|
| **Daily** | Review security dashboard, check critical events |
| **Weekly** | Review audit logs, verify automated maintenance |
| **Monthly** | GDPR compliance report, update org settings |
| **Quarterly** | Rotate API keys, test incident response |
| **Annually** | Rotate service role keys, penetration testing |

## Supabase Project References

| Environment | Project Ref | Git Branch | npm Script | Usage |
|-------------|-------------|------------|------------|-------|
| **Production** | `ygdpgliavpxeugaajgrb` | `main` | `npm run dev:production` | app.use60.com |
| **Staging** | `caerqjzvuerejfrdtygb` | `staging` | `npm run dev:staging` | Pre-production testing |
| **Development** | `wbgmnyekgqklggilgqag` | `development` | `npm run dev` | Local development |
