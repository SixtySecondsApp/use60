# Slack Integration Feasibility for /60/ship Pipeline

**Date**: 2026-03-07
**Status**: FEASIBLE — infrastructure already exists

---

## Finding: Use60 Has Massive Slack Infrastructure

The codebase already has **250+ files** with Slack integration, including:

### Direct Message Sending
- `supabase/functions/send-slack-message/index.ts` — General-purpose Slack message sender
- `supabase/functions/send-slack-notification/index.ts` — Notification-specific sender
- `supabase/functions/send-slack-task-notification/index.ts` — Task update notifications
- `supabase/functions/send-org-notification-slack/index.ts` — Org-level notifications

### Slack Block Kit
- `supabase/functions/_shared/slackBlocks.ts` — Rich Block Kit message builders with safety helpers (truncation, character limits)
- Already handles: headers (150 chars), sections (3000 chars), buttons (75 chars), context (2000 chars)

### Slack Bots & Interactive
- `supabase/functions/slack-interactive/` — Full interactive message handler with action buttons
- `supabase/functions/slack-slash-commands/` — Slash command handlers (today, standup, pipeline, risks, deals, etc.)
- `supabase/functions/slack-events/` — Event listener
- `supabase/functions/slack-copilot/` — Full conversational copilot in Slack
- `supabase/functions/slack-copilot-actions/` — Action execution from Slack

### Existing Notification Patterns
- `supabase/functions/slack-morning-brief/` — Morning briefing already exists
- `supabase/functions/slack-daily-digest/` — Daily digest already exists
- `supabase/functions/slack-deal-risk-alert/` — Risk alerting pattern
- `supabase/functions/slack-hitl-notification/` — Human-in-the-loop notifications
- `supabase/functions/slack-task-reminders/` — Task reminder system
- `supabase/functions/slack-campaign-alerts/` — Alert system

### Core Sending Function
- `supabase/functions/_shared/proactive/deliverySlack.ts` — `sendSlackDM()` — the main centralized function used by **26+ orchestrator adapters**
  - Opens DM channels via `conversations.open`
  - Posts via `chat.postMessage`
  - Block Kit support with truncation safety (max 50 blocks, 3000 char text)
  - Delivery policy checks (quiet hours, rate limiting, user prefs)

### Database Tables (already exist)
- `slack_integrations` — Per-user workspace connections (access_token, team_id, bot_user_id, scope)
- `slack_org_settings` — Org-level bot config (bot_access_token, slack_team_id, is_connected)
- `slack_user_mappings` — Maps Slack users to 60 users with timezone
- `slack_user_preferences` — Per-user notification settings per feature (quiet hours, rate limits)

### Auth & Infrastructure
- `supabase/functions/_shared/slackAuth.ts` — Slack OAuth and token management
- `supabase/functions/_shared/slackSearch.ts` — Search Slack messages
- `supabase/functions/_shared/slackEntityResolver.ts` — Resolve Slack users/channels
- `supabase/functions/_shared/slackIntentParser.ts` — Parse natural language from Slack
- `supabase/functions/_shared/slackBotStatus.ts` — Bot status management
- `supabase/functions/_shared/slackReactions.ts` — Emoji reactions

---

## How the Pipeline Can Use Slack

### Path 1: Via Edge Functions (Recommended — works now)

The pipeline can call `send-slack-message` edge function to post messages:

```typescript
// From Claude Code pipeline, call via Supabase client or fetch
const response = await fetch(`${SUPABASE_URL}/functions/v1/send-slack-message`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    channel: '#dev-pipeline',
    message: 'US-003 complete — Webhook receiver + 4 tests passing',
    blocks: [...slackBlockKit],
    team_id: SLACK_TEAM_ID,
    user_id: BOT_USER_ID
  })
});
```

This works TODAY — the edge function already supports service role auth for inter-function calls.

### Path 2: Via AI Dev Hub Comments (Simpler)

Use `create_comment` with @mentions. Dev Hub's existing Slack integration delivers notifications:

```
create_comment(taskId, "US-003 complete. 4 tests passing. @andrew for review")
  → Dev Hub webhook → Slack notification to andrew
```

Simpler but less control over formatting and channel routing.

### Path 3: Via Slack MCP (Future — richest control)

Add a Slack MCP server to Claude Code for direct Slack API access:
- Send messages to any channel/thread
- Create threads for pipeline war rooms
- Add reactions to messages
- Read messages for inbound commands
- Full Block Kit formatting

This gives the pipeline first-class Slack control but requires MCP server setup.

---

## Recommendation for /60/ship Implementation

### Phase 1 (Now — no new code needed)

Use **Path 2** (Dev Hub comments) for all pipeline notifications:
- Create a "Pipeline Updates" task per project in Dev Hub
- Pipeline posts comments as it progresses
- Dev Hub delivers to Slack via existing webhooks
- Team @mentioned when human input needed

### Phase 2 (Next sprint — leverage existing edge functions)

Use **Path 1** (edge functions) for rich Slack messages:
- Call `send-slack-message` for war room updates
- Use `slackBlocks.ts` patterns for Block Kit formatting
- Add new message templates for pipeline events:
  - `buildPipelineProgressMessage()`
  - `buildHeartbeatProposalMessage()`
  - `buildDevBotCompletionMessage()`
  - `buildMorningBriefMessage()`

### Phase 3: Spacebot as Inbound Control Plane

**Repo**: https://github.com/spacedriveapp/spacebot

The existing edge functions handle **outbound** (pipeline → Slack) well. The gap is **inbound** — persistent listening, natural language parsing, conversational context across sessions. Spacebot fills this gap.

#### What Spacebot Is

An autonomous AI agent framework (single Rust binary) designed for multi-user chat environments. Five concurrent process types:

| Process | Purpose | Pipeline Use |
|---------|---------|-------------|
| **Channels** | User-facing conversation — never blocked by work | Responds to team in Slack instantly while pipeline runs |
| **Branches** | Thinking forks that inherit context, run concurrently | Analyze incoming requests, check pipeline state |
| **Workers** | Task execution with shell, file, browser tools | Execute pipeline commands, call Dev Hub APIs |
| **Compactor** | Background context summarization at 80%+ capacity | Keep long pipeline conversations manageable |
| **Cortex** | Inner monologue + memory briefings + supervision | Maintain pipeline history, cross-project knowledge |

#### Why Spacebot for 60-Hub-Bot

**Problem**: Edge functions are request/response — they fire and forget. There's no persistent process listening in Slack for natural language commands, maintaining conversation context, or coalescing rapid-fire updates.

**Solution**: Spacebot runs as the **60-Hub-Bot runtime**:

```
ARCHITECTURE:

  OUTBOUND (pipeline → Slack):          INBOUND (Slack → pipeline):
  ─────────────────────────────         ─────────────────────────────
  Edge functions                        Spacebot (60-Hub-Bot)
  send-slack-message
  sendSlackDM()                         Channels: "What's the status?"
  slackBlocks.ts                        Branches: check pipeline.json
  Pipeline progress, heartbeat,         Workers: call Dev Hub API
  Dev Bot completions                   Cortex: remember past decisions

  ┌──────────────┐                      ┌──────────────┐
  │  Supabase    │───── Slack ─────────│  Spacebot    │
  │  Edge Fns    │     messages         │  (Rust bin)  │
  └──────────────┘                      └──────────────┘
         │                                     │
         └──── AI Dev Hub / pipeline.json ─────┘
```

#### What Spacebot Handles That Edge Functions Can't

1. **Persistent conversation context** — Remembers the full thread of pipeline discussion. Edge functions are stateless per request.

2. **Message coalescing** — When 5 stories complete in 30 seconds, Spacebot batches them into one coherent update. Edge functions would fire 5 separate messages.

3. **Natural language pipeline control** — "Pause acme-billing", "what's blocking?", "assign to devbot" — parsed with full conversation context, not just intent classification.

4. **Concurrent non-blocking** — Multiple team members ask questions simultaneously. Channels respond while workers execute commands in the background.

5. **Structured memory** — Maintains a knowledge graph of pipeline decisions, deployment history, team preferences. Survives restarts, cross-references across projects.

6. **Model routing** — Cheap models for simple status queries, premium models for complex analysis ("should we split US-007?"). Built into the framework.

#### Spacebot Integration Points

```
Spacebot Workers call:
  → AI Dev Hub MCP tools (create_task, update_job_status, etc.)
  → Supabase edge functions (send-slack-message for formatted outbound)
  → Pipeline state (.sixty/pipeline.json via git or API)
  → Dev Bot queue (get_next_pending_job, assign tickets)

Spacebot Channels respond to:
  → "status" → read pipeline.json, format response
  → "pause" → update pipeline state, notify workers
  → "assign devbot TSK-0620" → update_task assignee + create job
  → "what did devbot do overnight?" → query job history, format summary
  → "add a story for PDF export" → draft story, propose adding to plan
  → "ship it" → trigger /60/deliver phase
  → Natural conversation about any project
```

#### Deployment

Spacebot runs as a single binary — deploy on Railway alongside the app:

```bash
# Railway service: 60-hub-bot
# Uses spacebot.sh hosted or self-hosted Docker
docker run -d \
  -e SLACK_BOT_TOKEN=$SLACK_BOT_TOKEN \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  -e DEV_HUB_API_URL=$DEV_HUB_API_URL \
  spacebot/spacebot:latest
```

Or use spacebot.sh hosted platform to avoid managing the binary.

#### Phase 3 Implementation

1. Deploy Spacebot as 60-Hub-Bot on Railway
2. Configure Slack workspace connection
3. Add MCP tools for AI Dev Hub (Spacebot has native MCP support)
4. Create workers for pipeline control commands
5. Configure memory types for pipeline state (Decision, Event, Goal, Todo)
6. Point outbound messages through existing `send-slack-message` edge function
7. Test: team member says "status" in Slack → Spacebot responds with pipeline state

---

## Existing Patterns to Reuse

| What We Need | What Already Exists |
|-------------|-------------------|
| Pipeline progress messages | `slack-deal-room-update` (deal progress → pipeline progress) |
| Morning brief | `slack-morning-brief` (already built) |
| Daily digest | `slack-daily-digest` (already built) |
| Risk/blocker alerts | `slack-deal-risk-alert` (same pattern) |
| Human-in-the-loop approval | `slack-hitl-notification` + `slack-interactive/handlers/hitl.ts` |
| Action buttons (Assign/Dismiss) | `slack-interactive/` (full button handler infrastructure) |
| Natural language commands | `slack-copilot` + `slackIntentParser.ts` |
| Task reminders | `slack-task-reminders` (same pattern for pipeline reminders) |
| Block Kit builder | `slackBlocks.ts` (truncation, safety, templates) |

**Bottom line**: 90% of the Slack infrastructure is already built for the sales product. The pipeline just needs to create new message templates and call existing senders.

---

## Action Items

1. Create pipeline-specific Slack Block Kit templates in `slackBlocks.ts`
2. Add a `send-pipeline-notification` edge function (thin wrapper around `send-slack-message`)
3. Configure pipeline channel ID in `.sixty/config.json`
4. Add heartbeat proposal template with action buttons
5. Extend `slack-interactive` handler for pipeline action buttons (assign devbot, dismiss, etc.)
