# Deal Truth + Close Plan Implementation

> Transform deal health from reactive detection to proactive clarity + execution tracking

## Current State Summary

**Existing Systems:**
- **Deal Health Scoring** - Behavioral signals (stage velocity, sentiment, engagement, activity, response time) → `deal_health_scores`
- **Deal Health Alerts** - Rules → in-app notifications via `notificationService.create`
- **Risk Signals** - AI-detected "why it's stuck" + recommendations → `deal_risk_signals`, `deal_risk_aggregates`
- **Slack Stale Deals** - Proactive notifications with suggested actions

**Gap Analysis:**
| Strength | Weakness |
|----------|----------|
| Detecting friction (risk signals) | Clarity: "Who is EB? What's the next dated step?" |
| Scoring behavior (health score) | Execution tracking: "Is checklist progressing?" |
| Suggesting actions | Accountability: "Who owns what by when?" |

---

## Phase 1: Deal Truth Data Layer
**Status:** `NOT STARTED`

Build the clarity scoring foundation - 6 fields that answer "do we actually know this deal?"

### Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1.1 | Create `deal_truth_fields` table | `NOT STARTED` | One row per deal per field |
| 1.2 | Define 6 core fields schema | `NOT STARTED` | pain, success_metric, champion, economic_buyer, next_step, top_risks |
| 1.3 | Add value/confidence/source/last_updated_at columns | `NOT STARTED` | Each field needs provenance |
| 1.4 | Create `dealTruthService.ts` | `NOT STARTED` | CRUD + extraction logic |
| 1.5 | Implement `clarity_score` calculation | `NOT STARTED` | 0-100 based on field completeness |
| 1.6 | Wire into momentum score | `NOT STARTED` | `momentum = 0.55*health + 0.25*(100-risk) + 0.20*clarity` |

### Schema Design
```sql
CREATE TABLE deal_truth_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL, -- pain, success_metric, champion, economic_buyer, next_step, top_risks
  value TEXT,
  confidence DECIMAL(3,2) DEFAULT 0.5, -- 0.00-1.00
  source TEXT, -- meeting_transcript, email, crm_sync, manual
  source_id UUID, -- reference to meeting/email/etc
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(deal_id, field_key)
);
```

### Clarity Score Formula
```typescript
clarity_score = (
  (next_step_present && next_step_dated ? 30 : 0) +
  (economic_buyer_known ? 25 : 0) +
  (champion_known ? 20 : (champion_strength ? 10 : 0)) +
  (success_metric_present ? 15 : 0) +
  (risks_documented ? 10 : 0)
);
```

---

## Phase 2: Close Plan Milestones
**Status:** `NOT STARTED`

Lightweight internal execution tracker - 6 milestones that show deal progression.

### Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.1 | Create `deal_close_plan_items` table | `NOT STARTED` | 6 milestones per deal |
| 2.2 | Define milestone template | `NOT STARTED` | success_criteria, stakeholders_mapped, solution_fit, commercials_aligned, legal_procurement, signature_kickoff |
| 2.3 | Add owner_id, due_date, status, blocker_note | `NOT STARTED` | Execution tracking fields |
| 2.4 | Create `closePlanService.ts` | `NOT STARTED` | CRUD + progress calculations |
| 2.5 | Implement task creation on-demand | `NOT STARTED` | Only create task when milestone is next/blocked |
| 2.6 | Add close plan progress to momentum | `NOT STARTED` | Overdue milestones drag score |

### Schema Design
```sql
CREATE TABLE deal_close_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  milestone_key TEXT NOT NULL, -- success_criteria, stakeholders_mapped, etc
  title TEXT NOT NULL,
  owner_id UUID REFERENCES profiles(id),
  due_date DATE,
  status TEXT DEFAULT 'pending', -- pending, in_progress, completed, blocked
  blocker_note TEXT,
  linked_task_id UUID REFERENCES tasks(id), -- only created when needed
  sort_order INT DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(deal_id, milestone_key)
);
```

### Milestone Template
| Key | Title | Typical Owner |
|-----|-------|---------------|
| `success_criteria` | Success criteria confirmed | AE |
| `stakeholders_mapped` | Stakeholders mapped | AE |
| `solution_fit` | Solution fit confirmed | SE/AE |
| `commercials_aligned` | Commercials aligned | AE |
| `legal_procurement` | Legal/procurement progressing | AE |
| `signature_kickoff` | Signature + kickoff scheduled | AE |

---

## Phase 3: Risk-Triggered Clarification
**Status:** `NOT STARTED`

Ask targeted questions only when confidence is low - no forms, just 1-click answers.

### Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 3.1 | Define confidence thresholds | `NOT STARTED` | < 0.6 triggers question |
| 3.2 | Create question templates | `NOT STARTED` | "Is Dana the economic buyer?" Yes/No/Unknown |
| 3.3 | Add to `slack-interactive` handler | `NOT STARTED` | Process button responses |
| 3.4 | Update deal_truth_fields on response | `NOT STARTED` | source=manual, confidence=1.0 |
| 3.5 | Implement cooldown logic | `NOT STARTED` | Don't ask same question repeatedly |

### Question Flow
```
IF economic_buyer.confidence < 0.6:
  → Slack DM: "Is {contact_name} the economic buyer for {deal_name}?"
  → Buttons: [Yes] [No] [Unknown]
  → On click: Update deal_truth_fields SET confidence=1.0, source='manual'

IF champion.confidence < 0.6:
  → Slack DM: "Who is the champion for {deal_name}?"
  → Buttons: [{contact_1}] [{contact_2}] [Unknown]

IF next_step missing OR undated:
  → Slack DM: "What's the next step for {deal_name}?"
  → Button: [Set Next Step] → Opens modal
```

---

## Phase 4: Deal Momentum Slack Notifications
**Status:** `NOT STARTED`

Proactive nudge when deals need attention - unified card showing truth + plan + actions.

### Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 4.1 | Create `deal_momentum_nudge` notification type | `NOT STARTED` | In proactive notification system |
| 4.2 | Define trigger conditions | `NOT STARTED` | health warning/critical OR high risk OR low clarity |
| 4.3 | Build Slack Block Kit card | `NOT STARTED` | Truth fields + milestones + actions |
| 4.4 | Add action buttons | `NOT STARTED` | Set next step, Mark done, Log activity, Create task |
| 4.5 | Wire into `deliverToSlack` | `NOT STARTED` | Use existing delivery pipeline |
| 4.6 | Add to SlackDemo for testing | `NOT STARTED` | Manual trigger button |

### Trigger Conditions
```typescript
const shouldNudge = (
  deal_health_scores.health_status IN ('warning', 'critical', 'stalled') ||
  deal_risk_aggregates.overall_risk_level IN ('high', 'critical') ||
  clarity_score < 50 ||
  (economic_buyer.confidence < 0.6 && !next_step.dated)
);
```

### Slack Card Structure
```
[Deal Name] - [Stage] - [Value]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Deal Truth (Clarity: 45%)
• Pain: "Reduce manual reporting time" (High confidence)
• Economic Buyer: Unknown (Low confidence) ⚠️
• Champion: Sarah Chen (Medium strength)
• Next Step: "Demo to team" - No date set ⚠️
• Success Metric: Not defined ⚠️

Close Plan Progress (2/6)
☑ Success criteria confirmed
☑ Stakeholders mapped
◻ Solution fit confirmed - Due: Jan 15 @Mike
◻ Commercials aligned
◻ Legal/procurement
◻ Signature + kickoff

Recommended Actions:
• Identify and confirm economic buyer
• Set a dated next step

[Set Next Step] [Mark Milestone Done] [Log Activity] [Create Task]
```

---

## Phase 5: Slash Command `/sixty deal`
**Status:** `NOT STARTED`

On-demand deal lookup from Slack - same card as proactive notifications.

### Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 5.1 | Create `slack-slash-commands` edge function | `NOT STARTED` | Router for /sixty commands |
| 5.2 | Implement `/sixty deal <query>` handler | `NOT STARTED` | Search deals, return card |
| 5.3 | Add `/60` alias support | `NOT STARTED` | Shorthand command |
| 5.4 | Resolve org + user mapping | `NOT STARTED` | From Slack user ID |
| 5.5 | Handle multiple matches | `NOT STARTED` | Show selection list |
| 5.6 | Register commands in Slack app | `NOT STARTED` | App manifest update |

### Command Flow
```
/sixty deal acme
  ↓
Parse command → Resolve user/org → Search deals
  ↓
IF single match: Return Deal Momentum Card
IF multiple matches: Return selection buttons
IF no match: "No deals found matching 'acme'"
```

---

## Phase 6: Process Map Integration
**Status:** `NOT STARTED`

Visual documentation of the complete workflow.

### Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 6.1 | Add `deal_health_momentum` to ProcessName | `NOT STARTED` | In ProcessMapButton.tsx |
| 6.2 | Add to AVAILABLE_PROCESSES | `NOT STARTED` | In ProcessMaps.tsx |
| 6.3 | Create process description | `NOT STARTED` | In generate-process-map/index.ts |

### Process Description
```
**Deal Health Momentum Workflow** unifies Deal Health Score + Risk Signals + Deal Truth + Close Plan to keep deals moving.

**Triggers**
- Nightly cron refresh (health + risk aggregates)
- After meeting processing completes
- After email activity classification
- After CRM sync updates
- Manual Slack command: /sixty deal <name>

**Core Steps**
1. Load Deal Context (deal, stage, owner, close date, value)
2. Load Behavioral Signals (health_scores, alerts)
3. Load Risk Signals (risk_signals, risk_aggregates)
4. Build Deal Truth Snapshot (6 fields with confidence)
5. Build Close Plan (6 milestones with status)
6. Compute Momentum Score
7. Decide Outreach (high risk OR low clarity → Slack)
8. Slack Actions → Update Truth/Plan → Create Tasks

**Outputs**
- Updated deal_truth + close_plan
- Updated momentum_score
- Slack DM + in-app notification (deduped)
```

---

## Phase 7: Meeting/Email Extraction
**Status:** `NOT STARTED`

Auto-populate Deal Truth from meeting transcripts and emails.

### Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 7.1 | Add Deal Truth extraction to meeting processing | `NOT STARTED` | Post-transcript analysis |
| 7.2 | Extract from structured meeting summary | `NOT STARTED` | Pain points, next steps, stakeholders |
| 7.3 | Add email classification for Deal Truth | `NOT STARTED` | Champion engagement, EB mentions |
| 7.4 | Implement confidence scoring | `NOT STARTED` | Based on source reliability |
| 7.5 | Upsert only when confidence improves | `NOT STARTED` | Don't overwrite high-confidence manual data |

---

## Implementation Order

```
Phase 1 (Foundation)     → Deal Truth data layer
        ↓
Phase 2 (Execution)      → Close Plan milestones
        ↓
Phase 4 (Visibility)     → Slack notifications (can test with mock data)
        ↓
Phase 3 (Refinement)     → Risk-triggered questions
        ↓
Phase 5 (Access)         → Slash command
        ↓
Phase 7 (Automation)     → Meeting/email extraction
        ↓
Phase 6 (Documentation)  → Process map
```

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Deal Truth completion rate | >70% of fields populated | Weekly query |
| Clarity score improvement | +20 points avg after 30 days | Before/after comparison |
| Close plan adoption | >50% of deals with milestones | Active deals with plan |
| Slack engagement rate | >30% button clicks | Action tracking |
| Time to close (qualified deals) | -15% | Pipeline analytics |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         TRIGGERS                                 │
├─────────────────────────────────────────────────────────────────┤
│  Cron  │  Meeting  │  Email  │  CRM Sync  │  /sixty deal       │
└────┬───┴─────┬─────┴────┬────┴─────┬──────┴────────┬───────────┘
     │         │          │          │               │
     └─────────┴──────────┴──────────┴───────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │   Load Deal Context   │
              └───────────┬───────────┘
                          │
     ┌────────────────────┼────────────────────┐
     │                    │                    │
     ▼                    ▼                    ▼
┌─────────┐        ┌─────────────┐      ┌───────────┐
│ Health  │        │    Risk     │      │Deal Truth │
│ Score   │        │  Signals    │      │ 6 fields  │
└────┬────┘        └──────┬──────┘      └─────┬─────┘
     │                    │                   │
     └────────────────────┴───────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  Compute Momentum     │
              │  health + risk +      │
              │  clarity + plan       │
              └───────────┬───────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │   Need Slack Nudge?   │
              └───────────┬───────────┘
                          │
              ┌───────────┴───────────┐
              │                       │
              ▼                       ▼
         ┌────────┐            ┌──────────────┐
         │   No   │            │     Yes      │
         │  End   │            │ Send Card    │
         └────────┘            └──────┬───────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
             ┌───────────┐    ┌─────────────┐   ┌──────────────┐
             │ Low Conf? │    │   Actions   │   │ Mirror to    │
             │ Ask Q     │    │   Buttons   │   │ In-App       │
             └───────────┘    └─────────────┘   └──────────────┘
```
