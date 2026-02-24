# Consult Report: Commitment Detection & Actioning Engine
Generated: 2026-02-20

## User Request
Detect commitments from meeting transcripts and automatically action them — create proposals, ping Slack channels, create tasks in Command Centre. Plus 5 additional proactive intent-based listeners.

## Decision
**Option A: Extend Existing Orchestrator** with Intent Action Registry pattern, structured for future migration to database-driven rules (Option C).

## Current State Analysis

### Already Built
| Layer | Component | Status |
|-------|-----------|--------|
| Transcript ingestion | `meetingbaas-webhook` + `fathom-webhook` → `process-recording` | ✅ |
| Intent detection | `detect-intents` edge function (Claude Haiku, MEDDICC-aware) | ✅ |
| Commitment extraction | Returns `commitments[]` with intent type, confidence, deadline | ✅ |
| Event queuing | Adapter queues `proposal_generation`, `calendar_find_times` | ✅ (2 of 12) |
| Task creation | `task-signal-processor` handles `verbal_commitment_detected` | ✅ |
| AI content generation | `unified-task-ai-worker` generates proposals, emails, prep | ✅ |
| Slack notification | `slack-post-meeting` + `deliverySlack.ts` with HITL | ✅ |
| Orchestrator | `agent-orchestrator` runs Wave 1-5 sequence | ✅ |

### Gaps Identified
1. Only 2 of ~12 intent types wired (`send_proposal`, `schedule_meeting`)
2. No Slack channel routing from commitment context
3. Extracted deadlines not passed through as `due_date` (hardcoded expiry)
4. No intent→action registry pattern (each mapping is ad-hoc in adapter)
5. Missing 5 high-value intent types (pricing, stakeholder, competitive, timeline, objection)

## Architecture: Intent Action Registry

### New Intent Types (5 additions to existing 4)

| Intent | Trigger Phrases | Primary Action | Secondary Action |
|--------|----------------|----------------|------------------|
| `pricing_request` | "send pricing", "what would this cost" | Create `proposal` task with pricing context | Flag deal as "Pricing Requested" |
| `stakeholder_introduction` | "loop in our CTO", "get Sarah from legal" | Create contact + intro email task | Update deal stakeholder map |
| `competitive_mention` | "looking at Gong", "competitor offered X" | Fire `competitor-intel` skill | Update MEDDICC Competition, alert manager |
| `timeline_signal` | "need this by Q2", "budget expires March" | Update deal close date + milestone tasks | Escalate if aggressive timeline |
| `objection_blocker` | "security concern", "need SOC 2" | Fire `objection-to-playbook` skill | Create task with battlecard, flag risk |

### Registry Structure

```typescript
// _shared/orchestrator/intentActionRegistry.ts
interface IntentActionConfig {
  task_type: string;
  deliverable_type: string;
  slack_action: 'dm_owner' | 'ping_channel' | 'alert_manager' | 'none';
  channel_resolver?: 'from_context' | 'fixed';
  channel_keywords?: Record<string, string>; // keyword → channel name
  auto_generate: boolean;
  deadline_source: 'extracted' | 'fixed';
  fallback_expiry_hours: number;
  linked_skill?: string;         // skill to fire (e.g., 'competitor-intel')
  crm_updates?: CrmUpdateConfig; // fields to update on deal/contact
  confidence_threshold: number;  // minimum confidence to action (0.0-1.0)
}
```

### Slack Channel Routing

```typescript
const CHANNEL_KEYWORD_MAP: Record<string, string> = {
  'technical': '#engineering',
  'engineering': '#engineering',
  'integration': '#engineering',
  'legal': '#legal',
  'security': '#security',
  'compliance': '#legal',
  'finance': '#finance',
  'pricing': '#sales-ops',
  'contract': '#legal',
  'product': '#product',
};
```

Resolved by scanning the commitment `phrase` and `context` for keywords, falling back to `#general` or DM to rep.

### Deadline Passthrough

Currently `detect-intents` extracts `deadline` as free text ("by end of day Friday"). Changes needed:
1. Add `deadline_parsed: ISO8601 | null` to detect-intents output (let Claude parse relative dates)
2. Pass `deadline_parsed` through adapter → orchestrator event → `task-signal-processor`
3. `task-signal-processor` uses `deadline_parsed` as `due_date` when available, falls back to `fallback_expiry_hours`

## Execution Plan

### Story 1: Expand detect-intents prompt with 5 new intent types
- **File**: `supabase/functions/detect-intents/index.ts`
- Add `pricing_request`, `stakeholder_introduction`, `competitive_mention`, `timeline_signal`, `objection_blocker` to the intent enum in the system prompt
- Add trigger phrase examples for each
- Add `deadline_parsed` (ISO 8601) to commitment output schema
- Update TypeScript types

### Story 2: Create Intent Action Registry
- **New file**: `supabase/functions/_shared/orchestrator/intentActionRegistry.ts`
- Define `IntentActionConfig` interface
- Define registry mapping all 9 intent types to their actions
- Define `CHANNEL_KEYWORD_MAP` for Slack routing
- Export `resolveIntentAction(commitment)` function
- Export `resolveSlackChannel(commitment)` function

### Story 3: Wire registry into detect-intents adapter
- **File**: `supabase/functions/_shared/orchestrator/adapters/detectIntents.ts`
- Replace hardcoded `send_proposal` / `schedule_meeting` event queuing
- Use `resolveIntentAction()` to determine follow-up events for ALL intent types
- Pass `deadline_parsed` into queued events
- Apply `confidence_threshold` gating from registry

### Story 4: Update task-signal-processor for deadline passthrough
- **File**: `supabase/functions/task-signal-processor/index.ts`
- Accept `due_date` from signal metadata (when provided by detect-intents)
- Use extracted deadline as `due_date` and `expires_at` when available
- Fall back to existing hardcoded expiry when no deadline extracted

### Story 5: Add Slack channel ping action
- **File**: `supabase/functions/_shared/orchestrator/adapters/` (new adapter or extend existing)
- New orchestrator step type: `ping_slack_channel`
- Resolves channel from commitment context using `CHANNEL_KEYWORD_MAP`
- Sends Block Kit message: "[Rep] committed to checking with [team] re: [topic] — from meeting with [Contact]"
- Uses existing `deliverySlack.ts` infrastructure

### Story 6: Wire skill-based actions (competitor-intel, objection-to-playbook)
- **File**: `supabase/functions/_shared/orchestrator/adapters/detectIntents.ts`
- When intent is `competitive_mention`: queue `skill_execution` event with `skill_key: 'competitor-intel'`
- When intent is `objection_blocker`: queue `skill_execution` event with `skill_key: 'objection-to-playbook'`
- When intent is `stakeholder_introduction`: queue `detect_new_stakeholder` event (already exists in Wave 2b)
- When intent is `timeline_signal`: queue `update_deal_timeline` event

### Story 7: Add CRM auto-update actions
- **File**: new adapter or extend `update-crm-from-meeting` adapter
- `timeline_signal` → update deal `close_date` if extracted date is earlier
- `pricing_request` → update deal stage tag / custom field
- `competitive_mention` → update MEDDICC Competition field
- All CRM updates go through existing `update-crm-from-meeting` pattern with HITL approval

### Story 8: Deploy and test end-to-end
- Deploy updated `detect-intents` to staging
- Deploy `task-signal-processor` to staging
- Deploy new/updated orchestrator adapters
- Test with sample transcript containing all 9 intent types
- Verify: tasks created with correct deliverable types, Slack pings sent to right channels, deadlines respected

## Files Affected

| File | Change Type |
|------|------------|
| `supabase/functions/detect-intents/index.ts` | Modify (prompt + types) |
| `supabase/functions/_shared/orchestrator/intentActionRegistry.ts` | **New** |
| `supabase/functions/_shared/orchestrator/adapters/detectIntents.ts` | Modify (registry integration) |
| `supabase/functions/task-signal-processor/index.ts` | Modify (deadline passthrough) |
| `supabase/functions/_shared/orchestrator/adapters/pingSlackChannel.ts` | **New** |
| `supabase/functions/_shared/orchestrator/adapters/updateDealTimeline.ts` | **New** |
| `skills/atomic/detect-intents/SKILL.md` | Modify (document new intents) |

## Risk Assessment

| Severity | Risk | Mitigation |
|----------|------|------------|
| 🟡 Medium | Claude may misclassify intents at boundaries | Confidence threshold gating (0.7+ for auto-action, 0.5-0.7 for suggestion-only) |
| 🟡 Medium | Slack channel may not exist in org | Graceful fallback to DM rep + log warning |
| 🟢 Low | Date parsing from natural language | Claude is good at this; fallback to hardcoded expiry |
| 🟢 Low | Over-notification from multiple intents per meeting | Rate limiting already exists in `deliverySlack.ts` |
