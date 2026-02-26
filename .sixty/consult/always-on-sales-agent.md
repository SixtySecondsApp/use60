# Consult Report: Always-On Sales Agent ("Closed-Source OpenClaw for Sales")
Generated: 2026-02-23

## User Request
"Create the closed-source version of OpenClaw, specifically for sales. Always-on agent that feels really smart. Research what we're missing vs open-source projects, then build it."

## Context
- OpenClaw: 160K+ GitHub stars, always-on AI agent with heartbeat/fleet/persona systems
- Sixty already has: 18 specialist agents, 300+ crons, fleet orchestrator, autonomy policies, credit system
- Gap is UX, not infrastructure: agents work silently, users don't feel the agent working

## Research Findings

### OpenClaw's 3 Core Patterns
1. **Heartbeat** -- 2-tier check (deterministic probe -> LLM only if needed). `HEARTBEAT_OK` silently suppresses empty checks. User only hears when something matters.
2. **SOUL.md** -- Free-form markdown persona injected into system prompt. 3-layer separation: Soul (philosophy) / Identity (presentation) / Config (capabilities). Under 3KB.
3. **Proactive delivery** -- Agent DMs you on WhatsApp/Slack/Telegram. First morning briefing = "iPhone moment." Plain text, not rich cards.

### Where Sixty is AHEAD
- Credit/billing system (immutable ledger, auto top-up)
- Autonomy policies (3-tier resolver with auto-promotion/demotion + circuit breakers)
- HITL approval gates (preview -> confirm)
- Enterprise security (RLS, org isolation, audit logging)
- Domain depth (MEDDICC, deal risk, pipeline intelligence, relationship graphs)
- Structured UI (48 rich response components)

### The Real Gap
Agents fire into database tables and Slack channels silently. No unified "your agent did something" experience. No suppression logic (HEARTBEAT_OK equivalent). No user-editable persona. No "first-run wow moment."

## Decisions
- **Build first**: Full triage layer + suppression logic (architectural foundation)
- **Delivery**: Slack DM + in-app activity feed together
- **Timeline**: 2-week sprint
- **Monetization**: Billing exists; missing the wow factor that drives conversion

## Architecture: The Triage Layer

### Current Flow (today)
```
cron/webhook -> agent function -> adapter -> Slack channel/DM (fire-and-forget)
                                          -> sequence_jobs table
                                          -> agent_activity table (sometimes)
```

### Target Flow (after sprint)
```
cron/webhook -> agent function -> adapter -> TRIAGE QUEUE (new)
                                               |
                                               v
                                          TRIAGE ENGINE (new)
                                               |
                                     +---------+---------+
                                     |         |         |
                                  suppress   batch    deliver
                                  (silent)  (digest)    |
                                               +--------+--------+
                                               |        |        |
                                           Slack DM  In-app   Email
                                                     feed    (future)
```

### New Database Tables

**`notification_queue`** -- All agent outputs land here first
- id, job_id (FK sequence_jobs), step_name
- notification_type ('meeting_debrief' | 'deal_risk' | 'pre_meeting' | etc.)
- payload (JSONB -- adapter output)
- recipient_user_id, recipient_org_id
- priority ('low' | 'medium' | 'high' | 'urgent')
- triage_status ('pending' | 'suppressed' | 'batched' | 'queued' | 'delivered' | 'failed')
- delivery_channel ('slack_dm' | 'in_app' | 'email' | 'batch')
- batch_id (nullable FK -- groups related notifications)
- delivery_result (JSONB -- ts, channel_id, error)
- entity_type, entity_id (for deduplication + threading)
- created_at, triaged_at, delivered_at

**`notification_batches`** -- Groups related notifications into digests
- id, user_id, org_id
- batch_type ('morning_briefing' | 'meeting_digest' | 'risk_roundup' | 'daily_digest')
- item_count, items (JSONB array of notification_queue ids)
- scheduled_for (when to deliver)
- status ('collecting' | 'ready' | 'delivered')
- delivery_result

**`agent_persona`** -- User-editable agent identity (SOUL.md equivalent)
- user_id (PK), org_id
- agent_name (default: 'Sixty')
- tone ('concise' | 'conversational' | 'direct' | 'custom')
- custom_instructions (text -- free-form persona, <3KB)
- proactive_frequency ('aggressive' | 'balanced' | 'quiet')
- focus_areas (JSONB array: ['pipeline', 'meetings', 'outreach', 'admin'])
- quiet_hours_start, quiet_hours_end, timezone
- morning_briefing_time (default '08:00')
- morning_briefing_enabled (default true)
- created_at, updated_at

### Triage Rules (Priority x Action Matrix)

| Agent Output Type | Default Priority | Triage Action |
|-------------------|-----------------|---------------|
| Pre-meeting briefing | HIGH | Deliver immediately via Slack DM |
| Deal risk alert (score > 7) | HIGH | Deliver immediately |
| Meeting debrief + email draft | MEDIUM | Deliver after meeting end |
| Deal temperature change | MEDIUM | Batch into daily digest |
| Action item extraction | MEDIUM | Deliver with meeting debrief |
| CRM field suggestions | LOW | Batch into daily digest |
| Email signal classification | LOW | Batch unless urgent reply needed |
| Pipeline pattern detected | LOW | Batch into weekly digest |
| Competitive intel mention | LOW | Batch into daily digest |
| Reengagement opportunity | MEDIUM | Deliver if within business hours |
| Coaching feedback | LOW | Batch into weekly coaching digest |

### Suppression Rules (HEARTBEAT_OK Equivalent)

1. **Deduplication**: Same entity + notification_type within 4 hours -> suppress
2. **Cool-down**: Same user, same notification_type -> max 3 per hour
3. **Quiet hours**: Outside user's configured hours -> queue for morning briefing
4. **Empty check**: Agent found nothing actionable -> suppress (never tell user "all clear")
5. **Low-value batch**: If daily digest has <2 items -> suppress, carry forward

### Morning Briefing Assembly

Runs at user's configured time (default 08:00 in their timezone):

1. Query `notification_queue` for suppressed/batched items from last 24h
2. Query `deals` for pipeline changes since yesterday
3. Query `calendar_events` for today's meetings (with attendees_count > 1)
4. Query `tasks` for overdue/due-today items
5. Run cheap triage LLM (Haiku): "Given these items, write a 2-minute morning briefing in {user.tone} tone"
6. Deliver via Slack DM + write to agent_activity for in-app feed

## Execution Plan (2-Week Sprint)

### Phase 1: Foundation (Days 1-3)

**STORY-001: Create notification_queue + notification_batches tables**
- Type: schema
- Migration with RLS policies (user can only see own notifications)
- Indexes on (user_id, triage_status), (created_at), (entity_type, entity_id)
- Insert triggers for real-time subscriptions

**STORY-002: Create agent_persona table**
- Type: schema
- Migration with RLS, defaults, check constraints
- RPC: get_agent_persona(user_id), upsert_agent_persona(user_id, settings)

**STORY-003: Build triage engine edge function**
- Type: backend
- `supabase/functions/notification-triage/index.ts`
- Receives notification_queue entries, applies rules matrix
- Deduplication, cool-down, quiet hours, priority assignment
- Outputs: suppress / batch / deliver decision
- Uses existing `deliverToSlack()` for immediate deliveries
- Writes to agent_activity for in-app items

**STORY-004: Wire runner.ts to notification_queue**
- Type: backend
- Modify orchestrator runner: after each adapter returns StepResult, insert to notification_queue instead of calling Slack adapter directly
- Preserve backward compatibility: if triage is disabled for org, fall through to existing Slack adapters
- Add `proactive_agent_config.triage_enabled` flag

### Phase 2: Delivery (Days 4-7)

**STORY-005: Build morning briefing assembler**
- Type: backend
- New edge function: `agent-morning-briefing/index.ts`
- Cron: runs at user's configured time (or 08:00 default)
- Queries notification_queue + deals + calendar + tasks
- Haiku call for natural-language briefing in user's persona tone
- Delivers via Slack DM + in-app activity
- Block Kit formatting: sections for deals, meetings, tasks, overnight alerts

**STORY-006: Build Slack DM delivery with persona voice**
- Type: backend
- Extend `deliverToSlack()` with persona injection
- Load agent_persona for recipient -> apply tone to message header
- Agent name in message prefix (e.g., "[Sixty] Your morning briefing")
- Interactive buttons: "Show details" / "Dismiss" / "Snooze"

**STORY-007: Build in-app agent activity feed**
- Type: frontend
- New component: `AgentActivityFeed.tsx`
- Real-time subscription to notification_queue + agent_activity
- Timeline view: "2h ago -- Analyzed call with Acme Corp" / "4h ago -- Found 2 deals at risk"
- Filter by type: meetings, deals, outreach, admin
- Mark as read, expand for details
- Empty state: "Your agent is monitoring X deals, Y meetings. You'll see activity here."

**STORY-008: Agent status indicator (top bar)**
- Type: frontend
- Subtle indicator in the app header showing agent state
- States: "Active -- monitoring 12 deals" / "Working -- analyzing meeting" / "Quiet hours"
- Clicking opens the activity feed panel

### Phase 3: Persona & First-Run (Days 8-11)

**STORY-009: Agent persona settings UI**
- Type: frontend
- Settings page section: "Your AI Agent"
- Fields: name, tone selector, proactive frequency, focus areas, quiet hours, morning briefing time
- Preview: "Here's how your agent will sound:" with sample message in selected tone
- Save via upsert_agent_persona RPC

**STORY-010: First-run activation flow**
- Type: frontend + backend
- Trigger: new user or user with no agent_persona record
- Step 1: "Meet your AI agent" intro card
- Step 2: Quick connect -- verify Slack is connected (or prompt OAuth)
- Step 3: Choose persona (name + tone, 3 presets + custom)
- Step 4: Agent immediately processes last 7 days -> delivers "here's what I found" briefing
- Step 5: "You'll hear from me tomorrow at [time] with your morning briefing"

**STORY-011: Backfill "here's what I found" edge function**
- Type: backend
- New edge function: `agent-initial-scan/index.ts`
- Scans last 7 days of deals, meetings, contacts, tasks
- Identifies: stale deals, upcoming meetings, overdue tasks, contacts going cold
- Generates "first impressions" briefing
- Delivers via Slack DM + in-app

### Phase 4: Polish & Metrics (Days 12-14)

**STORY-012: Triage analytics dashboard**
- Type: frontend
- Agent effectiveness metrics: notifications sent, suppressed, batched
- Delivery stats: open rate (Slack DM reaction tracking), action taken
- Cost tracking: credits consumed by agent per day/week
- Chart: "Your agent saved you X hours this week"

**STORY-013: Notification preferences UI**
- Type: frontend
- Per-notification-type controls: enable/disable, delivery channel, frequency
- Quiet hours configuration with timezone
- "Notification volume" slider: aggressive / balanced / quiet
- Preview of what each setting changes

**STORY-014: End-to-end testing + hardening**
- Type: test
- Test: morning briefing assembly + delivery
- Test: triage suppression rules (dedup, cooldown, quiet hours)
- Test: first-run flow end-to-end
- Test: persona injection into Slack messages
- Load test: 100 concurrent notifications through triage

## Dependencies

```
STORY-001 ─┬─> STORY-003 ─> STORY-004 ─> STORY-005
            │                              STORY-006
STORY-002 ──┼─> STORY-009 ─> STORY-010
            │                 STORY-011
            └─> STORY-007 ─> STORY-008

STORY-005..011 ─> STORY-012
                  STORY-013
                  STORY-014
```

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Triage adds latency to notifications | Medium | Triage runs async; urgent items bypass queue |
| Morning briefing costs (Haiku per user/day) | Low | ~$0.002/briefing; 1000 users = $2/day |
| Slack rate limits (Tier 2: 1 msg/sec per channel) | Medium | Queue + rate limiter in deliverToSlack |
| Users overwhelmed by agent activity | Medium | Aggressive defaults: balanced frequency, smart batching |
| Migration breaks existing Slack adapters | High | Feature flag: triage_enabled per org; gradual rollout |
| First-run scan overloads for large accounts | Low | Limit scan to 50 most recent entities per category |

## Success Metrics (2 weeks post-launch)

1. **Morning briefing delivery rate**: >90% of active users with Slack receive daily briefing
2. **Suppression ratio**: >60% of raw agent outputs suppressed (proves triage works)
3. **First-run completion**: >70% of new users complete activation flow
4. **Time-to-wow**: <1 hour from signup to first proactive Slack DM
5. **Agent activity feed engagement**: >3 views/week per active user
