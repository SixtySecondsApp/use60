# Agent Abilities V3 — Codebase Analysis

## Date: 2026-02-14
## Scope: Auto CRM Update, Deal Risk Scorer, Re-engagement Trigger

---

## Existing Infrastructure (What We're Building On)

### Orchestrator Engine (production-ready)
- **Wave-based parallel execution** with `depends_on` declarations
- **HITL approval flow**: step returns `pending_approval` → Slack button → `resumeSequence()`
- **Self-invocation**: persists state + re-invokes to avoid 150s edge function timeout
- **Retry**: 3 attempts with exponential backoff for transient errors
- **Context tiers**: lazy-loading tier1/tier2/tier3 per step requirements
- **Cost budget gate**: blocks sequences if org budget exceeded

### Adapter Registry (32 registered, 9 stubs)
Key stubs to replace:
- `update-crm-from-meeting` — in meeting_ended Wave 3, depends on `extract-action-items`
- `research-trigger-events` — in stale_deal_revival, needs tier2 + tier3:news + tier3:linkedin
- `analyse-stall-reason` — in stale_deal_revival, needs tier2
- `draft-reengagement` — in stale_deal_revival, has `requires_approval: true`

### Slack Block Kit (10 builders in slackBlocks.ts)
Existing patterns to extend:
- `buildMeetingDebriefMessage` — most complex, 200+ lines with sections/buttons
- `buildActionConfirmation` — unified undo/confirm pattern (reuse for CRM undo)
- `buildWinProbabilityChangeMessage` — closest pattern to deal risk alerts

### Ability Registry (24 abilities)
- 13 orchestrator abilities, 11 v1-simulate abilities
- Need to add: `auto-crm-update` (post-meeting), `deal-risk-scorer` (pipeline), update `stale-deal-revival` status

### Event Types (8 defined)
- `meeting_ended` already contains `update-crm-from-meeting` step
- `stale_deal_revival` already contains re-engagement steps
- Need new: `deal_risk_scan` event type

---

## Feature 1: Auto CRM Update — Analysis

### Current State
- `update-crm-from-meeting` stub exists in meeting_ended sequence (Wave 3)
- Depends on `extract-action-items` output (has action items, meeting summary)
- Also has access to `detect-intents` output (buying signals, commitments)
- tier2 context gives current deal record (stage, value, close date, probability)
- No HubSpot write integration exists — V1 writes to local `deals` table

### V1 Approach (Local CRM First)
Write to use60's own deals/contacts tables first. HubSpot bidirectional sync is a separate feature (plan-hubspot-bidirectional-sync.json exists). This is the right call because:
1. Faster to ship — no external API dependency
2. Same data model reps already see
3. HubSpot sync layer can be added later transparently
4. Avoids rate limit / auth complexity in V1

### AI Field Extraction Design
- Claude Haiku analyzes: transcript excerpts + action items + detected intents + current deal record
- Outputs: `{ fields_changed: [...], confidence: 'high'|'medium'|'low', reasoning: string }`
- Fields: stage, next_steps, close_date, deal_value, stakeholders_mentioned, blockers, summary
- Only updates fields with medium+ confidence
- "No change" case: returns empty changeset, no Slack spam

### Change Tracking
Need `crm_field_updates` table:
- Records every AI-initiated field change with before/after values
- Enables undo via Slack button (revert to before value)
- Audit trail for trust building

### Slack Notification
Shows: what changed, why (reasoning from AI), confidence level, undo button
Pattern: extends `buildActionConfirmation` with field diff

---

## Feature 2: Deal Risk Scorer — Analysis

### Current State
- No existing event type or adapters
- `deals` table has: stage, value, probability, expected_close_date, last_activity_at, owner_id
- `activities` table has: type, description, created_at, contact_id, deal_id
- `meetings` table has: owner_user_id, scheduled_at, transcript
- Email history available via tier2 context
- `buildWinProbabilityChangeMessage` already shows risk alerts (direction badge, risk factors)

### New Event Type: `deal_risk_scan`
- Trigger: cron:morning (daily at 7am user timezone, or configurable)
- 4-step sequence with parallel Wave 2

### Risk Signal Design (V1 — Rule-Based)
Score 0-100 per deal, composed from weighted signals:
1. **Engagement drop** (25pts): No activity in 7+ days, declining email frequency
2. **Champion gone quiet** (20pts): Primary contact no response to 2+ emails
3. **Timeline slipping** (15pts): Close date pushed 2+ times
4. **Single-threaded** (15pts): Only 1 contact on multi-stakeholder deal
5. **Competitor mentioned** (10pts): From transcript/email analysis
6. **Budget objection** (10pts): From detected intents
7. **Ghost pattern** (5pts): Meeting cancelled + no reschedule

V2 (future): ML model trained on closed-lost outcomes

### Alert Threshold
- Score >= 60: High risk — immediate Slack alert with suggested action
- Score 40-59: Medium risk — included in daily digest
- Score < 40: Healthy — no alert

---

## Feature 3: Re-engagement Trigger — Analysis

### Current State
- `stale_deal_revival` event exists with 3 stub adapters
- Steps are sequential (no `depends_on` declarations — should add parallelism)
- tier3:news and tier3:linkedin requested but no loaders exist yet

### Signal Research Design
- Uses `gemini-research` edge function (already built) for grounded web search
- 3 parallel queries per closed-lost deal:
  1. Company news + funding (via Gemini grounded search)
  2. Champion job changes (via Gemini grounded search for LinkedIn)
  3. Competitor sentiment / churn signals
- Also checks: trigger dates from CRM notes ("come back in Q2")

### Stall Reason Analysis
- Reads closed-lost reason from deal record
- Classifies: budget, timing, champion left, competitor won, bad fit, went dark
- Assesses: time since close, relationship health of remaining contacts, new entry points

### Re-engagement Draft (HITL)
- Personalized email draft using org tone_of_voice
- Includes: signal context, relationship history, specific hook
- Slack HITL: [Send] [Edit] [Snooze 2 weeks] [Remove from watchlist]
- Uses existing draft-followup-email HITL pattern

### Watchlist Management
Need `reengagement_watchlist` table:
- Auto-populated from closed-lost deals (last 12 months)
- Tracks: deal_id, contact_ids, loss_reason, close_date, next_check_date, status
- Status: active, snoozed, removed, converted
- Snooze from Slack button sets next_check_date forward

---

## Dependencies Between Features

```
Feature 1 (CRM Update)          Feature 2 (Risk Scorer)          Feature 3 (Re-engagement)
├── CRM-001: Schema              ├── DRS-001: Schema              ├── RET-001: Schema + Watchlist
├── CRM-002: AI Extraction       ├── DRS-002: Event Type          ├── RET-002: Signal Research
├── CRM-003: Adapter             ├── DRS-003: Scan Adapter        ├── RET-003: Stall Analysis
├── CRM-004: Slack Builder       ├── DRS-004: Score Adapter       ├── RET-004: Draft + HITL
├── CRM-005: Undo Handler        ├── DRS-005: Alert Adapter       ├── RET-005: Slack Builder
└── CRM-006: Debrief Integration ├── DRS-006: Slack Adapter       ├── RET-006: Parallel Steps
                                 ├── DRS-007: Slack Builder       └── RET-007: Registry + Demo
                                 ├── DRS-008: Registry
                                 └── DRS-009: Demo
```

Feature 2 builds on Feature 1 (CRM data accuracy).
Feature 3 is independent but benefits from Feature 2 risk history.

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| AI field extraction accuracy | Confidence scoring + "needs review" flag + undo button |
| Risk scorer false positives | Conservative thresholds (60+), under-alert not over-alert |
| Gemini grounded search rate limits | Cache results in company.enrichment_data, 24h TTL |
| Signal freshness for re-engagement | next_check_date scheduling, stale signal filtering |
| Edge function timeout on large deal scans | Batch processing (max 50 deals per invocation) + self-invoke |
