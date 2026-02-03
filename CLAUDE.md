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
