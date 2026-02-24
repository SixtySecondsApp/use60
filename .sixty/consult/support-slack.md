# Consult Report: Support Centre Slack + Admin Queue
Generated: 2026-02-19

## User Request
Improve the Support Centre to work with Slack notifications and management for the internal team to respond to tickets quickly, track tickets in platform admin, add a navigation item for internal users with notification bubbles.

## Clarifications
- Q: Should Slack notifications go to a channel, DM agents, or both?
- A: **Dedicated #support channel** — simpler setup, better visibility

- Q: Who should see the ticket management nav + badge?
- A: **Platform admins only** — customers use the existing Support Centre page

## Codebase Scout Findings

### Existing Assets
| Asset | Path | Relevance |
|-------|------|-----------|
| Support ticket CRUD | `src/components/support/` (6 components) | Full ticket lifecycle already built |
| Admin dashboard | `SupportAgentDashboard.tsx` | Table view with bulk status, filtering — enhance for platform page |
| Ticket detail sheet | `TicketDetail.tsx` | Conversation thread + reply — reuse as-is |
| Email notification | `support-ticket-notification/index.ts` | Extend to also post to Slack |
| Slack Block Kit | `_shared/slackBlocks.ts` | Add SupportTicketData builder |
| Slack interactive | `slack-interactive/index.ts` | Add support action handlers |
| Slack auth utils | `_shared/slackAuth.ts` | postToChannel(), user resolution |
| Route config | `routeConfig.ts` | 3-tier access system with badge support |
| Notification badge pattern | `NotificationBell.tsx`, `HITLIndicator.tsx` | Count badge with pulse animation |
| Realtime pattern | `useHITLRequests.ts`, `useTaskNotifications.ts` | postgres_changes subscription |

### Gaps
- No Slack posting in support-ticket-notification
- No support-specific handlers in slack-interactive
- No platform admin page for cross-org ticket view
- No realtime subscription for ticket changes
- No nav item or badge for support tickets
- No `needs_attention` tracking for efficient unread counts

### Schema (Existing)
- `support_tickets`: id, org_id, user_id, subject, description, category, priority, status, assigned_to, timestamps
- `support_messages`: id, ticket_id, sender_id, sender_type (user/agent/system), content, attachments
- RLS: users see own tickets, org admins see all org tickets

## Patterns Analyst Findings

### Must Follow
- React Query for server state, Zustand for UI state only
- Supabase Realtime via `.channel().on('postgres_changes').subscribe()` with cleanup
- Notification badges: red circle with count, `animate-ping` for pulse
- Edge functions: `getCorsHeaders(req)` from corsHelper.ts
- Slack messages: Block Kit via builders in slackBlocks.ts
- Interactive actions: `action_id` pattern matching with `::` delimiter
- Platform pages: `platformAdmin` access in routeConfig, lazy-loaded
- Toast notifications via sonner: `toast.success()`, `toast.error()`

### Slack Action ID Convention
```
support_assign::{ticketId}
support_view::{ticketId}
support_priority::{ticketId}::{priority}
```

## Risk Scanner Findings

| Severity | Risk | Mitigation |
|----------|------|------------|
| Medium | Cross-org ticket count query bypasses user RLS | Use security definer RPC function with platform admin check |
| Medium | Slack channel config | Use env var `SUPPORT_SLACK_CHANNEL_ID` — consistent with `SUPPORT_TEAM_EMAIL` pattern |
| Low | Bot token access for platform channel | Query `slack_org_settings` or use `SLACK_BOT_TOKEN` env var as fallback |
| Low | Realtime subscription overhead | Only subscribe when user is platform admin |
| Low | Badge stale after context switch | Invalidate on postgres_changes event |

## Scope Sizer Findings

### Story Breakdown (7 stories)
| Phase | Stories | Parallel | Time |
|-------|---------|----------|------|
| Foundation | SUP-001, SUP-002 | Yes | 20m |
| Backend | SUP-003, SUP-004 | Yes | 25m |
| Frontend | SUP-005, SUP-006 | Yes | 25m |
| Nav + Badge | SUP-007 | No | 20m |

**Total: ~1.5h with parallel execution, ~2.5h sequential**

## Synthesis

### Agreements
- Extend existing `support-ticket-notification` rather than new function
- Use existing Slack Block Kit builders pattern
- Follow `useHITLRequests.ts` realtime pattern exactly
- `needs_attention` boolean + triggers is more efficient than counting messages at query time

### Key Technical Decisions
1. **needs_attention flag** — DB trigger maintains a boolean on support_tickets. This avoids expensive joins to support_messages on every badge refresh.
2. **Security definer RPC** — Platform admin count query needs cross-org access. A security definer RPC with explicit `is_admin` check is the established pattern.
3. **Env var for channel** — `SUPPORT_SLACK_CHANNEL_ID` matches existing patterns (`SUPPORT_TEAM_EMAIL`). Avoids new UI for channel config.
4. **Separate handler file** — `slack-interactive/handlers/support.ts` keeps the main index.ts clean (matches existing handler structure: hitl.ts, momentum.ts, etc.)
