# Consult Report: Agent Abilities Page Upgrade
Generated: 2026-02-14

## User Request
"Make all abilities have all channel options (Slack, email, in-app) so we can see them working on each channel. Add enable/pause toggles. Plus 3 more things the page needs."

## Scope (5 features)

1. **Unified Channel Options** — Every ability gets Slack, Email, In-App delivery toggles
2. **Enable/Pause Toggles** — Per-ability on/off switch with visual state
3. **Execution History & Run Logs** — Filterable table of past orchestrator runs
4. **Dependency Wave Visualizer** — Visual DAG showing parallel execution waves
5. **HITL Approval Queue** — Centralized inbox for pending human approvals

## Codebase Findings

### Existing Assets (Reusable)

| Path | Relevance |
|------|-----------|
| `src/pages/platform/AgentAbilitiesPage.tsx` | Main page (~1100 lines), 24 abilities across 5 lifecycle stages |
| `src/lib/agent/abilityRegistry.ts` | Ability definitions with `backend`, `steps`, `trigger`, `hitl` fields |
| `src/components/agent/AbilityCard.tsx` | Card component — needs channel toggles + enable/pause |
| `src/components/agent/AbilityRunPanel.tsx` | Run panel — orchestrator/v1-simulate/cron backends |
| `src/components/agent/HeartbeatStatusBar.tsx` | Live orchestrator health monitor |
| `src/components/agent/LifecycleTimeline.tsx` | 5-stage horizontal nav |
| `supabase/functions/_shared/orchestrator/eventSequences.ts` | 8 event sequences with dependency chains |
| `supabase/functions/_shared/orchestrator/types.ts` | StepDefinition with `depends_on`, `criticality`, `sales_only` |

### Orchestrator Capabilities (43 adapters, 8 event types)

**Event sequences with waves:**
- `meeting_ended`: 9 steps, 4 waves (classify → extract+detect+coach parallel → suggest+draft+crm+tasks → notify)
- `pre_meeting_90min`: 5 steps (enrich → history+research parallel → briefing → deliver)
- `campaign_daily_check`: 4 steps (metrics → classify → report → deliver)
- `coaching_weekly`: 4 steps (aggregate → correlate → digest → deliver)
- `email_received`: 2 steps (classify → match)
- `proposal_generation`: 4 steps (template → populate → generate → review HITL)
- `calendar_find_times`: 3 steps (parse → find → present HITL)
- `stale_deal_revival`: 3 steps (research → analyse → draft HITL)

**HITL abilities (5):**
- calendar_find_times.present-time-options
- stale_deal_revival.draft-reengagement
- email send-as-rep
- proposal_generation.present-for-review
- HITL follow-up email (v1-simulate)

### Delivery Channels Available
- **Slack**: Block Kit via send-slack-message (33+ builders in slackBlocks.ts)
- **Email**: Gmail send-as-rep via email-send-as-rep edge function
- **In-App**: Notification system + copilot structured responses
- **CRM**: Task creation, deal updates

### Patterns to Follow
- AbilityCard uses gradient icon badges, status/trigger/hitl badges
- AbilityRunPanel switches on `backend` field: 'orchestrator' | 'v1-simulate' | 'cron-job'
- Orchestrator panel has meeting picker + step visualizer + output
- V1-simulate panel has live/demo toggles + channel selectors
- HeartbeatStatusBar auto-refreshes every 30s

### Risks
- **Medium**: Channel toggles need backend support — currently delivery is hardcoded per adapter
- **Low**: Execution history query on sequence_jobs could be slow without index
- **Low**: Wave visualizer needs careful layout for complex sequences (9-step meeting_ended)

## Recommended Architecture

### Feature 1: Unified Channel Options
Add to AbilityCard and AbilityRunPanel:
- 3 toggle chips: Slack | Email | In-App
- Default: match current hardcoded channels per ability
- For demo: clicking a channel triggers delivery to that channel
- Store channel preferences in localStorage (or user_settings for persistence)

### Feature 2: Enable/Pause Toggles
Add to AbilityCard:
- Switch component (top-right of card)
- Green = enabled, amber = paused with "Paused" badge
- Store in localStorage initially (per-user ability preferences)
- Paused abilities show dimmed card with strikethrough description

### Feature 3: Execution History
New component: `ExecutionHistoryPanel`
- Query `sequence_jobs` table (already has: event_type, status, step_results, created_at, duration)
- Filterable by: event type, status (success/failed/running), date range
- Expandable rows showing step-by-step results with timing
- Auto-refresh for running jobs

### Feature 4: Wave Visualizer
New component: `WaveVisualizer`
- Parse `eventSequences.ts` dependency chains client-side
- Horizontal swim-lane layout: each wave is a column, steps within are vertical
- Color-coded: running (blue pulse), complete (green), failed (red), skipped (gray strikethrough)
- Connecting lines show dependencies
- Call-type gating shown as conditional branch

### Feature 5: HITL Approval Queue
New component: `ApprovalQueue`
- Query sequence_jobs where status = 'awaiting_approval'
- Show pending items with: ability name, trigger context, timestamp, preview
- Approve/Reject buttons that call orchestrator resume endpoint
- History of past approvals with who approved and when
