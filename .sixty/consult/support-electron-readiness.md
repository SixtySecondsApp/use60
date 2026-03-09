# Consult Report: Support System — Electron App Readiness

**Date**: 2026-03-06
**Profile**: Thorough
**Auto-chained**: consult -> plan -> run

## User Request

Ensure the web dashboard's support system is ready for the Electron admin app integration. End-to-end notifications for support tickets (opened, replied, answered, closed) with Supabase Realtime, email, Slack, and native OS notifications.

## Discovery Q&A

1. **Flow**: Electron is an internal admin tool (not customer-facing)
2. **Notifications**: Realtime + email + Slack + native OS notifications
3. **Offline**: Email + Slack bot covers offline. No in-app queuing needed.
4. **Nice-to-haves**: Canned responses, priority/SLA, internal notes — all included
5. **Auth**: Same Supabase Auth (email/password login)

## Agent Findings

### Codebase Scout
- Full support schema exists: support_tickets + support_messages with RLS
- Email notifications via Resend (support-ticket-notification edge function)
- Slack notifications with Block Kit + interactive actions
- React hooks: useSupportTickets, useSupportMessages, useTicketsNeedingAttention
- UI: SupportCentrePage, SupportTicketsPage, SupportAgentDashboard

### Risk Scanner
- support_messages NOT in Supabase Realtime publication (blocks live chat)
- No auto-trigger for email/Slack on new messages (only manual on ticket create)
- No in-app notification creation on support events
- RLS policies use inline SELECT FROM profiles (recursion risk)
- No canned responses, internal notes, or SLA tables exist

### Scope Sizer
- 11 stories total (8 backend/schema + 3 frontend)
- P0: 3 stories (realtime, notification triggers, auto-email/Slack)
- P1: 7 stories (internal notes, canned responses, SLA, realtime hook)
- P2: 1 story (RLS fix)
- Estimated: ~3-4 hours total

## Recommended Plan

11 stories in .sixty/plan.json with prefix SUP-001 through SUP-008 (with sub-stories 004b, 005b, 006b).

## Next Step

Auto-chaining to 60/run for execution.
