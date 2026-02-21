# Consult Report: Command Centre Audit & Enhancement
Generated: 2026-02-20

## User Request
"Audit /command-centre — needs to work with call recordings & transcripts for max context, query over multiple meetings, handle action items and task list items, create proposals and follow-ups. What's missing? How can we get this to be a helpful feature?"

## Clarifications
- Q: Primary user persona?
- A: Sales rep (own tasks) — personal productivity tool

---

## Agent Findings Summary

### What's Working (Solid Foundation)
- Task CRUD + realtime Supabase subscriptions
- Sidebar filtering/sorting/search with urgency scoring + keyboard nav
- AI canvas drafting + refinement (Claude Haiku, slash commands, version history)
- Email compose + send (Gmail via `email-send-as-rep`)
- Slack message compose + send (`slack-post`)
- CRM update preview + confirm
- Task chains (parent/child, auto-trigger next on approve)
- Meeting action items extraction (`extract-action-items` + Claude)
- WritingCanvas with undo, conversation persistence, debounced save

### Critical Gaps Found

1. **No meeting transcript access from Command Centre** — `meeting-intelligence-search` edge function exists but no UI
2. **No recording playback** — ContextPanel links out but doesn't embed player or timestamps
3. **Proposal generation declared but not wired** — skill + edge function exist separately, no CC handler
4. **Follow-up email AI missing** — auto-creates follow-up task but no AI handler to draft it
5. **Context panel depends on pre-enriched metadata** — manual tasks have empty context
6. **"Coming soon" stubs** — edit title, change priority, change type all show toast
7. **Deleted components not replaced** — ActivityTimeline, CommentThread gone; no replacement UI
8. **No cross-meeting intelligence** — can't aggregate signals across meetings per contact/deal

### Infrastructure That Exists But Isn't Connected
- `meeting-intelligence-search` edge function — hybrid semantic search, ready to use
- `proposal-generator` skill — full proposal gen, not registered for CC
- `post-meeting-followup-drafter` skill — drafts follow-ups, not wired to task worker
- `post-meeting-followup-pack-builder` sequence — email + slack + tasks, not connected
- Fathom recording URLs stored — just need embedded player
- `proxy-fathom-video` and `get-recording-url` edge functions — exist
- Task metadata JSONB — flexible enough to store meeting_context, contact_context etc.

---

## Synthesis

### Agreements (all agents aligned)
- Context panel lazy-loading is the #1 quick win (makes everything else work)
- Meeting transcript search is the single most impactful feature
- Proposal + follow-up handlers are low-effort, high-value (skills exist)
- Recording playback with timestamps creates differentiation
- Task property editing removes embarrassing "Coming soon" stubs

### Risk Assessment
- No schema migrations needed — all tables and columns exist
- No new edge functions required for MVP — existing ones just need wiring
- Main risk is ContextPanel complexity — already 22KB, needs careful additions
- `unified-task-ai-worker` needs new handlers but pattern is established

---

## Recommended Plan

### Phase 1: Context Foundation (Day 1)
Wire context panel to fetch data on-demand instead of relying on pre-enriched metadata. This unlocks value for ALL subsequent stories.

### Phase 2: Core AI Handlers (Day 2)
Add proposal and follow-up email handlers to unified-task-ai-worker. Register skills for Command Centre slash commands.

### Phase 3: Meeting Intelligence (Days 3-4)
Connect meeting-intelligence-search to context panel. Add transcript search, meeting snippets, and cross-meeting query.

### Phase 4: Recording & Action Items (Days 5-6)
Embed recording player with transcript timestamps. Add action items management tab.

### Phase 5: Polish (Day 7)
Task property editing, activity history, bulk actions.
