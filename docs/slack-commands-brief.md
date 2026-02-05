# Slack Commands Implementation Plan

> Slack-native "Sixty" with CRM-aware contact search + smarter AI

## Status Legend

| Status | Meaning |
|--------|---------|
| ✅ | Completed |
| 🔄 | In Progress |
| ⏳ | Not Started |
| 🚫 | Blocked |

---

## Phase 1: MVP Core Commands ✅

**Goal**: Deliver the tightest command set that feels magical

| Feature | Status | Notes |
|---------|--------|-------|
| **Command Registration** | | |
| Register `/sixty` as primary command | ✅ | `slack-slash-commands/index.ts` |
| Register `/60` as alias | ✅ | Same handler, power user shortcut |
| **Core Commands** | | |
| `/sixty today` - Day-at-a-glance | ✅ | Meetings, priorities, tasks, deals closing |
| `/sixty meeting-brief` - Next meeting prep | ✅ | Prep card + task buttons + HITL follow-up |
| `/sixty contact <query>` - Contact lookup | ✅ | Sixty search + HubSpot CRM fallback |
| `/sixty deal <query>` - Deal snapshot | ✅ | Snapshot + log activity modal + CRM fallback |
| `/sixty follow-up <person/company>` - Draft follow-up | ✅ | HITL approve/edit/reject flow |
| **Message Shortcuts** | | |
| "Create task from message" shortcut | ✅ | Thread → task with backlink + context |
| **Infrastructure** | | |
| Extend `slack-interactive/index.ts` for new commands | ✅ | Message shortcut + modal handlers |
| Shared auth utilities (`_shared/slackAuth.ts`) | ✅ | Signature verification, user context |
| Hybrid search service (`_shared/slackSearch.ts`) | ✅ | Local DB + HubSpot CRM fallback |
| Block builders (`_shared/slackBlocks.ts`) | ✅ | Today digest, contact/deal cards, meeting brief |

### Phase 1 Dependencies (Already Built)

| Component | Status | Location |
|-----------|--------|----------|
| Interactive buttons + modals | ✅ | `supabase/functions/slack-interactive/index.ts` |
| HITL approve/edit/reject blocks | ✅ | `supabase/functions/_shared/slackBlocks.ts` |
| Task creation infrastructure | ✅ | Existing task service |
| Deal activity logging | ✅ | Existing activity service |

---

## Phase 2: Contact & Deal Workflows 🔄

**Goal**: Full contact/deal lifecycle management in Slack

| Feature | Status | Notes |
|---------|--------|-------|
| **Contact Commands** | | |
| `/sixty contact` - Full contact card | ✅ | Role, company, deals, last touch, next step, risk signals |
| → "Create task" button | ✅ | Opens modal with deal linking |
| → "Draft follow-up" button (HITL) | ✅ | Triggers /sixty follow-up flow |
| → "Log activity" button | ✅ | Reuses existing log activity modal |
| → "Link to deal room" button | ⏳ | |
| → Ambiguous match picker modal | ✅ | Shows when multiple results found |
| → "Search CRM" fallback button | ✅ | HubSpot fallback in slackSearch.ts |
| `/sixty enrich <email/domain/company>` | ⏳ | Enrich + propose merges/links |
| → "Save" / "Create contact" buttons | ⏳ | |
| → "Generate opener" button | ⏳ | |
| → "Generate 3 questions" button | ⏳ | |
| **Deal Commands** | | |
| `/sixty deal` - Full deal snapshot | ✅ | Stage, value, close date, risks |
| → Update stage modal | ✅ | Fetches pipeline stages dynamically |
| → Log activity modal | ✅ | Reuses existing log activity flow |
| → Create tasks button | ✅ | Opens modal with deal pre-linked |
| → Draft check-in (HITL) | ✅ | Triggers /sixty follow-up flow |
| `/sixty deal-room create <deal>` | ⏳ | |
| `/sixty deal-room invite @user` | ⏳ | |
| `/sixty risks` / `/sixty stale` | ✅ | At-risk/stale deals with filter buttons + overflow actions |
| **Search Infrastructure** | | |
| Unified entity search service | ✅ | Local index + CRM connector in slackSearch.ts |
| "Active contacts" ranking signals | ✅ | Open deals, recent meetings, activities |
| CRM connector interface (HubSpot/SF) | ✅ | HubSpot implemented in slackSearch.ts |
| Entity resolution + de-dupe | ⏳ | |
| CRM call caching + rate limiting | ⏳ | |

### Hybrid Search Logic

```
Step 1 (fast): Query Sixty DB (active contacts index)
Step 2 (fallback): If no confident match → call CRM API
Step 3: Merge + de-dupe + show best matches with confidence + source badges
```

**When to call CRM**:
- No Sixty match above confidence threshold
- Query looks like email/domain
- User explicitly asks ("in CRM", "search hubspot")
- User clicks "Search CRM" button

---

## Phase 3: Meeting Workflows ✅

**Goal**: Complete pre/post meeting automation

| Feature | Status | Notes |
|---------|--------|-------|
| **Pre-Meeting** | | |
| `/sixty meeting-prep <next/today/name>` | ✅ | Alias: meeting, prep - already in Phase 1 |
| **Post-Meeting** | | |
| `/sixty debrief <last/today/name>` | ✅ | Post-meeting summary with picker |
| → Sentiment analysis & talk time | ✅ | Auto-calculated from meeting data |
| → Action items display | ✅ | Shows extracted or default action items |
| → Deal linking | ✅ | Auto-links to related deal if found |
| → Coaching insights | ✅ | AI-generated or contextual defaults |
| → "Add task" individual buttons | ✅ | Creates task from single action item |
| → "Add All Tasks" bulk button | ✅ | Creates all action items as tasks |
| → "Draft follow-up" button | ✅ | Triggers /sixty follow-up command |
| → "Update deal" button | ✅ | Opens update deal stage modal |
| → "Share to deal room" button | ⏳ | Needs deal room implementation |
| **Message Shortcuts** | | |
| "Summarize thread" shortcut | ✅ | AI summary with key points + action items |
| "Log activity" shortcut | ✅ | Link to contact/deal with backlink |
| "Draft reply" shortcut | ✅ | AI-drafted reply with HITL edit flow |

---

## Phase 4: Tasks & Personal Productivity ✅

**Goal**: Task execution without leaving Slack

| Feature | Status | Notes |
|---------|--------|-------|
| **Task Commands** | | |
| `/sixty task add <text>` | ✅ | Parse "tomorrow", "next week", "in X days", "re: deal" |
| `/sixty task list` | ✅ | Today/overdue with action buttons and filters |
| → Complete button | ✅ | Marks task completed, updates message |
| → Snooze button | ✅ | 1 day / 1 week options via overflow menu |
| → Log activity button | ✅ | Opens activity logging via overflow |
| → Convert to follow-up button | ✅ | Triggers follow-up flow via overflow |
| → Edit button | ✅ | Opens modal for task editing |
| → Overflow menu | ✅ | Complete, snooze, log, convert, view actions |
| → Filter buttons | ✅ | Overdue, Today, This Week filters |
| **Personal Commands** | | |
| `/sixty focus` | ✅ | Focus mode with top 3 priority tasks + next meeting |
| → Done button | ✅ | Completes task, refreshes focus view |
| → Snooze buttons | ✅ | 1 day / 1 week snooze options |
| → Meeting prep button | ✅ | Links to /sixty meeting-brief command |
| → View all tasks button | ✅ | Expands to full task list |
| → Refresh button | ✅ | Refreshes focus view with latest data |
| **Task Modals** | | |
| Add task modal | ✅ | Title, due date picker, deal selector |
| Edit task modal | ✅ | Update title, due date, deal link |

---

## Phase 5: Team & Manager Operating Cadence ✅

**Goal**: Team visibility and pipeline management

| Feature | Status | Notes |
|---------|--------|-------|
| **Team Commands** | | |
| `/sixty standup` | ✅ | Channel digest: pipeline, risks, meetings, overdue |
| `/sixty pipeline` | ✅ | Summary with filters |
| → "Show at-risk" filter | ✅ | Filter buttons in response |
| → "Show closing this week" filter | ✅ | Filter buttons in response |
| → "Show stale" filter | ✅ | Filter buttons in response |
| `/sixty approvals` | ✅ | Pending HITL approvals with actions |
| → Approve/Edit/Reject overflow | ✅ | Per-item actions |
| → Approve All button | ✅ | Bulk approve pending |
| → Refresh button | ✅ | Refresh approvals list |
| **Interactive Handlers** | | |
| Pipeline filter handlers | ✅ | `handlers/phase5.ts` |
| Standup view pipeline/risks | ✅ | Drill-down buttons |
| Approval action handlers | ✅ | Approve/edit/reject flow |
| **Deal Room Automation** | | |
| Proactive deal room updates | ⏳ | Future enhancement |
| Auto-share meeting summaries to rooms | ⏳ | Future enhancement |

---

## Phase 6: Smart AI & Engagement ✅

**Goal**: AI that recommends actions with confidence routing

| Feature | Status | Notes |
|---------|--------|-------|
| **Retrieval-First Context** | | |
| Build context dossier before generation | ✅ | `_shared/ai/contextBuilder.ts` |
| Contact context retrieval | ✅ | Last activities, open deals, recent meetings |
| Deal context retrieval | ✅ | Stage, contacts, risks, momentum signals |
| Meeting context retrieval | ✅ | Transcript analysis, action items, sentiment |
| Email context retrieval | ✅ | Threading, response patterns, categories |
| Context quality scoring | ✅ | 0-100 score for generation confidence |
| **AI Action Recommendations** | | |
| Structured AI output | ✅ | `_shared/ai/types.ts` - full type system |
| Confidence-based routing | ✅ | `_shared/ai/confidenceRouter.ts` |
| High confidence → auto-execute | ✅ | >80% with user approval history |
| Medium confidence → HITL approve | ✅ | 50-80% or high-risk actions |
| Low confidence → clarify | ✅ | <50% shows clarifying modal |
| Dynamic CTA generation | ✅ | Primary + secondary CTAs by confidence |
| **AI Learning Loop** | | |
| Track approve/edit/reject rates | ✅ | `_shared/ai/learningLoop.ts` |
| Extract edit deltas | ✅ | Tone shift, length change, CTA preferences |
| Store per-user preferences | ✅ | `user_ai_preferences` table |
| Store per-org preferences | ✅ | `org_ai_preferences` table |
| Outcome tracking | ✅ | `ai_feedback.outcome_*` columns |
| Feedback analytics | ✅ | `getFeedbackAnalytics()` function |
| **Database Schema** | | |
| `user_ai_preferences` table | ✅ | Learned preferences + stats |
| `ai_feedback` table | ✅ | Action tracking + edit deltas |
| `org_ai_preferences` table | ✅ | Brand voice, compliance, thresholds |
| RLS policies | ✅ | User/admin access controls |
| **Smart Engagement (existing infrastructure)** | | |
| Timing + frequency rules | ✅ | Leveraged `_shared/engagement/timing.ts` |
| "Send when most likely to act" logic | ✅ | `calculateOptimalSendTime()` |
| Fatigue score + delivery cooldowns | ✅ | `calculateFatigueScore()` |
| User segment-based delivery | ✅ | Power user, champion, casual, dormant |
| Engagement config thresholds | ✅ | `_shared/engagement/config.ts` |

---

## Technical Architecture

### Slack Surfaces

| Surface | Status | Notes |
|---------|--------|-------|
| Slash commands (`/sixty`, `/60`) | ✅ | `slack-slash-commands` (Phase 1) |
| Interactive actions + modals | ✅ | `slack-interactive` |
| Message shortcuts | ✅ | "Create task from message" (Phase 1) |
| Proactive notifications | ✅ | Meeting prep, digests, stale deals |

### HITL Safety Rail

**Rule**: Anything that sends external communication defaults to:
```
Generate → Approve/Edit/Reject in Slack → Execute
```

---

## Success Metrics

| Metric | Target | Status |
|--------|--------|--------|
| Time-to-action (Slack → task/activity) | < 30s | ⏳ |
| % interactions avoiding app navigation | > 70% | ⏳ |
| HITL approval rate | > 80% | ⏳ |
| Notification click rate | > 25% | ⏳ |
| Fatigue/opt-down rate | < 5% | ⏳ |
| Search first-result success rate | > 85% | ⏳ |
| CRM fallback usefulness rate | Track | ⏳ |

---

## Implementation Order Summary

1. **Phase 1 (MVP)**: `/today`, `/meeting-brief`, `/contact`, `/deal`, `/follow-up`, message shortcuts
2. **Phase 2**: Full contact/deal workflows, hybrid search, CRM integration
3. **Phase 3**: Complete meeting pre/post automation
4. **Phase 4**: Tasks & personal productivity
5. **Phase 5**: Team/manager cadence, deal room automation
6. **Phase 6**: Smart AI recommendations, engagement throttling, learning loop
