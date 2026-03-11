# PRD: Proactive Sales Teammate

**Run slug:** `proactive-sales-teammate`
**Branch:** `feature/proactive-sales-teammate`
**Tier:** 3 (Sonnet x3, Opus reviewer + architect)
**Date:** 2026-03-10

---

## Problem Statement

60's proactive infrastructure is 80% built. The orchestrator has 48 real adapters, a runner with retry/HITL/idempotency, triage rules with severity routing, trust capital scoring, outcome learning, and 28 active cron jobs. The morning brief sends Slack DMs daily.

**But the agent is reactive.** It waits for the rep to ask. The infrastructure is assembled but event sources aren't wired — "the orchestra is assembled but nobody is opening the doors."

The rep's experience should be: open Slack in the morning and find follow-ups drafted, meetings prepped, pipeline scanned, and stale deals flagged with re-engagement templates. One-tap approve. Focus on conversations that close revenue. 60 handles the rest.

---

## Success Criteria

1. Rep receives actionable morning Slack brief with approve/edit/dismiss buttons
2. Follow-up emails auto-draft within 2 hours of meeting end
3. Deal heartbeat fires on stage changes and flags risks within 5 minutes
4. Agent accuracy improves measurably week-over-week via learning loop
5. Pipeline hygiene runs weekly with one-tap fix actions

---

## What Exists (Do NOT Rebuild)

| Capability | Status | Location |
|---|---|---|
| Orchestrator runner | Operational | `_shared/orchestrator/runner.ts` |
| 48 adapters | Operational | `_shared/orchestrator/adapters/` |
| 9 event sequences | Defined | `_shared/orchestrator/eventSequences.ts` |
| Triage rules (HIGH/MEDIUM/LOW) | Operational | `_shared/proactive/triageRules.ts` |
| Notification dedup + batching | Operational | `_shared/proactive/dedupe.ts` |
| Outcome learning | Operational | `_shared/orchestrator/outcomeLearning.ts` |
| Trust capital scoring | Operational | `_shared/orchestrator/trustCapital.ts` |
| Autonomy resolver | Operational | `_shared/orchestrator/autonomyResolver.ts` |
| Promotion/demotion engine | Operational | `_shared/orchestrator/promotionEngine.ts` |
| Morning brief edge function | Partially operational | `slack-morning-brief/index.ts` |
| Daily digest | Partially operational | `slack-daily-digest/` |
| HITL approval flow | Operational | `slack-interactive/handlers/hitl.ts` |
| Slack Block Kit builder | Operational | `_shared/slackBlocks.ts` |
| Proactive delivery (Slack + in-app) | Operational | `_shared/proactive/deliverySlack.ts` + `deliveryInApp.ts` |
| Quiet hours + timezone | Operational | `triageRules.ts` + `slack_user_preferences` |
| CRM heartbeat (approval queue) | Operational | `agent-crm-heartbeat/index.ts` |
| Pre-meeting prep | Operational | `proactive-meeting-prep/` edge function |
| Proactive pipeline analysis | Operational | `proactive-pipeline-analysis/` edge function |
| Agent scheduler | Operational | `agent-scheduler/index.ts` |
| pg_cron jobs | 28 active | Various migrations |
| Command Centre inbox | Operational | `_shared/commandCentre/writeAdapter.ts` |
| Health recalculation queue | Operational | Queue-based event pattern |
| Circuit breaker | Operational | `_shared/orchestrator/circuitBreaker.ts` |
| Dead letter queue | Operational | `_shared/orchestrator/deadLetter.ts` |

---

## Pattern 1: Single Human Gate

### Current Behavior
Agent asks "Should I draft a follow-up?" → rep says yes → agent drafts → rep reviews → rep sends.
**3 interactions, 2 unnecessary.**

### Target Behavior
Meeting ends → agent drafts follow-up → presents in Slack with Send/Edit/Dismiss buttons.
**1 interaction. Rep approves the output, not the intent.**

### Implementation
- Wire `meeting_ended` event sequence to auto-trigger follow-up draft adapter
- Draft stored in `crm_approval_queue` with `action_type = 'email_draft'`
- Slack DM with Block Kit: preview + Send/Edit/Dismiss buttons
- On Send → execute via email adapter
- On Edit → open modal with pre-filled draft
- On Dismiss → log as rejected in `outcomeLearning`
- Autonomy tier determines behavior: `suggest` (Slack DM) | `confirm` (send with 30min delay + cancel) | `auto` (send immediately, log in Command Centre)

### Acceptance Criteria
- [ ] Follow-up draft appears in Slack within 2 hours of meeting end
- [ ] Send button executes email send via existing email adapter
- [ ] Edit opens Slack modal with editable draft
- [ ] Dismiss logs rejection for learning calibration
- [ ] Autonomy tier respected (suggest/confirm/auto)

---

## Pattern 2: Deal Heartbeat

### Current Behavior
`proactive-pipeline-analysis` runs daily at 8am UTC. It scans all deals but doesn't fire event-driven observations on individual deal changes.

### Target Behavior
After every deal event (stage change, meeting ended, email received, task completed), fire a heartbeat that scans for risks and routes by severity.

### Observations to Detect

| Category | Trigger | Severity | Action |
|---|---|---|---|
| Stale deal | No activity in 7+ days | HIGH | Slack DM + re-engagement draft |
| Missing next step | No scheduled meeting or pending task | HIGH | Auto-create task suggestion |
| Follow-up gap | Meeting 24h+ ago, no follow-up sent | HIGH | Draft follow-up + present |
| Single-threaded | Only one contact at account | MEDIUM | Daily digest suggestion |
| Proposal delay | "Send proposal" detected, none sent | HIGH | Slack DM reminder |
| Engagement drop | Open rate declining, reply latency up | MEDIUM | Daily digest flag |
| Competitor mention | Competitor name in transcript/email | MEDIUM | Daily digest alert |
| Stage regression | Deal moved backwards | HIGH | Immediate Slack DM |

### Implementation
- Create `proactive-deal-heartbeat` edge function
- Triggered by: database webhooks on `deals` table changes OR called by orchestrator after meeting/email events
- Queries deal state: last activity, next steps, contact count, email metrics, transcript keywords
- Classifies observations using existing `triageRules.ts`
- Routes via existing delivery infrastructure (Slack DM / daily digest / Command Centre)
- Stores observations in `deal_observations` table for trend tracking

### Schema: `deal_observations`
```sql
CREATE TABLE deal_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  category TEXT NOT NULL, -- stale_deal, missing_next_step, follow_up_gap, etc.
  severity TEXT NOT NULL CHECK (severity IN ('high', 'medium', 'low')),
  title TEXT NOT NULL,
  description TEXT,
  affected_contacts UUID[],
  proposed_action JSONB, -- { type: 'draft_email', template: '...', deal_context: {...} }
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acted_on', 'dismissed', 'auto_resolved')),
  first_observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolution_type TEXT, -- 'user_action', 'auto_resolved', 'dismissed'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_deal_obs_dedup ON deal_observations (org_id, deal_id, category)
  WHERE status = 'open';
```

### Acceptance Criteria
- [ ] Heartbeat fires on deal stage changes via database trigger
- [ ] Heartbeat fires after meeting_ended events via orchestrator
- [ ] 8 observation categories detected with correct severity
- [ ] Observations deduplicated (unique on org_id + deal_id + category where open)
- [ ] Auto-resolves when underlying condition clears (e.g., next step added)
- [ ] Routes through existing triageRules.ts

---

## Pattern 3: Overnight Work + Morning Triage

### Current Behavior
`slack-morning-brief` sends daily DM with pipeline summary, meetings, and tasks. It's informational — shows what's happening but doesn't present work the agent did overnight.

### Target Behavior
Morning brief includes actionable items the agent prepared overnight:
- Follow-up drafts ready to send
- Meeting briefs for today's calls
- Deal risk alerts with suggested actions
- Pipeline hygiene recommendations

Each item has approve/edit/dismiss buttons.

### Implementation
- Extend `slack-morning-brief/index.ts` `buildMorningBriefData()` to query:
  - `deal_observations` where severity = 'high' and status = 'open'
  - `crm_approval_queue` where status = 'pending' (drafts waiting for approval)
  - Pre-computed meeting briefs for today's meetings
- Extend `buildMorningBriefMessage()` to render actionable Block Kit sections:
  - "Ready to Send" section with follow-up previews + Send/Edit buttons
  - "Prep Complete" section with meeting brief summaries
  - "Attention Needed" section with deal observations + action buttons
- Add new action handlers in `slack-interactive/handlers/` for morning brief actions
- Nightly cron (2am) runs deal heartbeat scan across all active deals

### Acceptance Criteria
- [ ] Morning brief includes "Ready to Send" section with pending drafts
- [ ] Morning brief includes "Attention Needed" section with HIGH observations
- [ ] Each item has Send/Edit/Dismiss buttons that work
- [ ] Nightly scan runs at 2am via pg_cron → `proactive-deal-heartbeat`
- [ ] Items approved via morning brief update `crm_approval_queue` and `deal_observations`

---

## Pattern 4: Sales Learning Loop

### Current Behavior
`outcomeLearning.ts` tracks outcomes (accepted/rejected/edited/ignored/expired) per action category and adjusts confidence scores. `trustCapital.ts` computes a composite trust score. `promotionEngine.ts` promotes/demotes autonomy tiers.

### What's Missing
- Outcome tracking isn't wired to Slack button actions
- Learning data doesn't feed back into draft quality (same template regardless of history)
- No visibility for the rep ("your agent is getting smarter")

### Implementation
- Wire Slack button actions (Send/Edit/Dismiss from morning brief and deal heartbeat) to `outcomeLearning.recordOutcome()`
- Track edit diffs: when rep edits a draft, capture what changed (tone? length? content?)
- Feed learning data into draft generation prompts: "User prefers shorter emails", "User always removes the PS line", "User changed formal greeting to casual 3/5 times"
- Add "Agent Learning" section to Command Centre showing:
  - Acceptance rate by category (last 7d / 30d)
  - Trust Capital score with milestone progress
  - Recent calibration events ("Learned: shorter subject lines preferred")
- Surface in morning brief periodically: "Your agent accepted 85% of follow-ups this week (up from 72%)"

### Acceptance Criteria
- [ ] Send/Edit/Dismiss actions record outcome via `outcomeLearning.recordOutcome()`
- [ ] Edit diffs captured and stored for pattern extraction
- [ ] Agent prompt includes top 3 learned preferences per rep
- [ ] Command Centre shows acceptance rate + trust capital
- [ ] Weekly brief includes learning progress summary

---

## Pattern 5: Deal Improvement Suggestions

### Current Behavior
No proactive deal improvement suggestions. Rep must ask the copilot for advice.

### Target Behavior
When a rep opens a deal (or deal heartbeat runs), surface 2-3 actionable improvements:

```
Strengthen this deal:
1. [MULTI-THREAD] Only talking to Sarah (Champion). I found Alex Kim (VP) on LinkedIn.
2. [URGENCY] No compelling event. Their contract renews in 45 days.
3. [PROOF] They asked about enterprise. Send the Rakuten case study.
```

### Implementation
- New `deal-improvement-suggestions` skill in copilot skill system
- Triggered by: deal heartbeat (as a MEDIUM observation) OR deal page load (via Command Centre)
- Analysis inputs: deal stage, contact count, conversation history, competitor mentions, proposal status, similar won/lost deals
- Categories: MULTI-THREAD, URGENCY, PROOF, OBJECTION, TIMING, CHAMPION, PRICING
- Store suggestions in `deal_observations` with category = 'improvement_suggestion'
- Deliver via Command Centre inbox (in-app) and daily digest (Slack)
- Track which suggestions get acted on → feed into learning loop

### Acceptance Criteria
- [ ] 2-3 suggestions generated per deal with active status
- [ ] Each tagged with category (MULTI-THREAD, URGENCY, etc.)
- [ ] Suggestions appear in Command Centre when viewing a deal
- [ ] Suggestions included in daily digest for deals with activity
- [ ] Acting on a suggestion records a positive outcome

---

## Pattern 6: Cross-Deal Awareness

### Current Behavior
No detection of conflicts between parallel sales activities.

### Target Behavior
Detect and alert on:
- Same contact being emailed by two reps
- Competing proposals to the same company
- Meeting with someone who churned from another deal
- Inconsistent messaging across deals at the same account

### Implementation
- Add cross-deal checks to `proactive-deal-heartbeat`:
  - Query contacts appearing in multiple active deals
  - Query companies with multiple active deals from different reps
  - Check recent email/meeting activity for contact overlap
- Create `cross_deal_conflicts` view (not a table — computed on demand):
  ```sql
  SELECT c.id, c.full_name, array_agg(DISTINCT d.id) as deal_ids,
         array_agg(DISTINCT d.owner_id) as rep_ids
  FROM contacts c
  JOIN deal_contacts dc ON dc.contact_id = c.id
  JOIN deals d ON d.id = dc.deal_id
  WHERE d.stage_id NOT IN (SELECT id FROM deal_stages WHERE name IN ('Closed Won', 'Closed Lost'))
    AND d.org_id = $1
  GROUP BY c.id, c.full_name
  HAVING count(DISTINCT d.id) > 1
  ```
- Flag in deal heartbeat as MEDIUM severity → daily digest
- Include in morning brief if HIGH severity (e.g., two reps about to email same contact today)

### Acceptance Criteria
- [ ] Contacts appearing in 2+ active deals detected
- [ ] Alert includes which deals and which reps
- [ ] MEDIUM severity → daily digest; HIGH (same-day conflict) → morning brief
- [ ] Reps can dismiss with "this is intentional"

---

## Pattern 7: Pipeline Hygiene

### Current Behavior
`pipeline-hygiene-digest` and `slack-stale-deals` cron jobs exist but produce informational digests. `deal-pipeline-hygiene` feature exists with freshness timers.

### What's Missing
One-tap fix actions. The digest tells you what's wrong but doesn't offer to fix it.

### Implementation
- Extend existing pipeline hygiene digest with actionable buttons:
  - "Archive deal" → moves to Closed Lost with reason "Stale — no activity"
  - "Snooze 7 days" → sets next check-in reminder
  - "Re-engage" → drafts re-engagement email using deal context
  - "Update stage" → dropdown to move deal to correct stage
- Add hygiene categories:
  - Stale deals (no activity 14+ days) — existing
  - Duplicate contacts (same email across contacts) — new
  - Completed tasks never marked done — new
  - Deals stuck at same stage 2x average — existing
  - Contacts with bounced emails — new
- Weekly Slack hygiene report (Monday 9am) with grouped actions
- Track which fixes get applied → feed into learning loop

### Acceptance Criteria
- [ ] Weekly hygiene report sent Monday 9am with actionable buttons
- [ ] Archive/Snooze/Re-engage/Update actions work from Slack
- [ ] At least 5 hygiene categories covered
- [ ] Actions feed into outcome learning
- [ ] Hygiene improvements tracked week-over-week

---

## Technical Architecture

### Event Flow
```
Deal event (stage change, meeting end, email)
  → Database webhook / orchestrator event
  → proactive-deal-heartbeat edge function
  → Classify observations (triageRules.ts)
  → Route: HIGH → Slack DM | MEDIUM → batch for digest | LOW → Command Centre
  → Store in deal_observations table
  → Nightly: aggregate → morning brief → actionable Slack DM

User action (Send/Edit/Dismiss)
  → slack-interactive handler
  → Execute action (send email, update deal, create task)
  → Record outcome (outcomeLearning.ts)
  → Update trust capital → possibly promote autonomy tier
```

### New Database Objects
1. `deal_observations` table — observation storage with dedup
2. `deal_improvement_suggestions` RPC — AI-powered analysis
3. `cross_deal_conflicts` view — computed conflict detection
4. `learning_preferences` table — extracted user preferences for draft calibration

### New Edge Functions
1. `proactive-deal-heartbeat` — event-driven deal scanning
2. Extend `slack-morning-brief` — actionable sections
3. Extend `slack-interactive` handlers — morning brief actions

### Modified Edge Functions
1. `proactive-pipeline-analysis` — add cross-deal awareness
2. `slack-daily-digest` — add observation summaries
3. `agent-scheduler` — add nightly heartbeat cron

---

## Out of Scope (Future)
- Email send-as-rep (requires Gmail/O365 write access)
- Calendar availability finder
- Coaching from transcript analysis
- Campaign monitoring automation
- Multi-org cross-deal awareness
