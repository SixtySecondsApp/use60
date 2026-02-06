# Consult Report: Proactive AI Sales Teammate Assessment

**Generated**: 2026-01-24 15:53 GMT
**Request**: Rate application against PRD vision, identify strengths/weaknesses, plan improvements

---

## User Request

> "Based on our PRD_PROACTIVE_AI_TEAMMATE.md, rate our application on strengths and weaknesses as a user and see where we can improve"

---

## Analysis Methodology

### Sub-Agents Deployed

| Agent | Focus | Duration |
|-------|-------|----------|
| Codebase Scout | Map copilot implementation, identify gaps | ~45s |
| UX Patterns Analyst | Analyze UI/UX, interaction patterns | ~40s |
| Risk Scanner | Find blockers, technical debt, security issues | ~50s |

### Files Analyzed

**Backend (Edge Functions)**:
- `supabase/functions/api-copilot/index.ts` (~14,200 lines)
- `supabase/functions/_shared/salesCopilotPersona.ts` (590 lines)
- `supabase/functions/proactive-pipeline-analysis/index.ts` (566 lines)
- `supabase/functions/slack-interactive/index.ts`
- `supabase/functions/slack-copilot-actions/index.ts`

**Frontend (Components)**:
- `src/components/copilot/responses/` (48 components)
- `src/components/assistant/AssistantShell.tsx`
- `src/components/copilot/CopilotRightPanel.tsx`
- `src/components/copilot/ToolCallIndicator.tsx`
- `src/lib/contexts/CopilotContext.tsx`

**Database (Migrations)**:
- `supabase/migrations/20260124100001_create_engagement_tracking.sql`
- `supabase/migrations/20260124100004_setup_proactive_cron_jobs.sql`

---

## Assessment Summary

### Overall Score: 55% toward PRD Vision

| Dimension | Score | Assessment |
|-----------|-------|------------|
| Specialized Persona | 8/10 | ✅ Excellent — persona compilation working |
| Skill-First Execution | 8/10 | ✅ Excellent — V1 router + 8 sequences |
| Proactive Workflows | 4/10 | ❌ Critical gap — code exists, not scheduled |
| HITL Confirmation | 6/10 | 🟡 Partial — reactive works, proactive broken |
| Engagement Tracking | 3/10 | ❌ Weak — dead data, no feedback loop |
| Slack Integration | 5/10 | 🟡 Partial — messages sent, buttons broken |
| Copilot Lab | 4/10 | ⚠️ Incomplete — basic features only |

---

## Strengths (What's Working)

### 1. Specialized Persona System (8/10)

**Evidence**: `salesCopilotPersona.ts:1-590`

- ✅ Persona compiled from enrichment data (products, competitors, pain points)
- ✅ Brand voice injection for email drafting
- ✅ HITL instructions embedded in persona
- ✅ 24-hour caching with version-aware invalidation
- ✅ "We" vs "they" language positioning

**User Experience**: "The copilot actually sounds like it knows my company after onboarding."

### 2. Skill-First Deterministic Execution (8/10)

**Evidence**: `api-copilot/index.ts:8335-8386` (V1 router)

- ✅ 4-tool API surface (simple, predictable)
- ✅ 8 confirmable sequences with preview → confirm pattern
- ✅ V1 deterministic router for high-confidence intents
- ✅ Template variable resolution with nested paths
- ✅ 48 structured response components

**User Experience**: "Meeting prep and follow-up flows are consistent and reliable."

### 3. Centralized Action Contract (9/10)

**Evidence**: `AssistantShell.tsx:36-191`

- ✅ All actions route through `handleActionClick()`
- ✅ Standard vocabulary: `open_contact`, `open_deal`, `open_meeting`, `open_task`
- ✅ Backwards-compatible legacy aliases
- ✅ No rogue `window.location` calls

**User Experience**: "Clicking buttons feels consistent everywhere."

### 4. Rich Progress Visualization (8/10)

**Evidence**: `ToolCallIndicator.tsx`, `CopilotRightPanel.tsx`

- ✅ Multi-layer "working story" stepper
- ✅ Staggered animations (feels alive)
- ✅ Estimated time remaining
- ✅ Tool-by-tool telemetry

**User Experience**: "I can see the AI is working and what it's doing."

---

## Weaknesses (Pain Points)

### 1. Proactive Workflows Are Vapor (4/10)

**PRD Promise**:
> "Daily pipeline summary at 9am... Pre-meeting briefs 2 hours before"

**Reality**:

| Feature | Code Exists | Scheduled | Working |
|---------|-------------|-----------|---------|
| Daily pipeline analysis | ✅ | ❌ | ❌ |
| Pre-meeting auto-prep | ❌ | — | ❌ |
| Task analysis | ⚠️ Partial | ❌ | ❌ |
| Slack user mapping | ⚠️ Table | ❌ OAuth | ❌ |

**User Impact**: "The app is purely reactive. I always have to ask first."

### 2. HITL Incomplete for Proactive Flows (6/10)

**Reactive (working)**:
```
Ask to send email → Preview shown → Click Confirm → Sent ✅
```

**Proactive (broken)**:
```
Slack: "Deal stale. Send follow-up? [Confirm]"
User clicks Confirm
→ ❌ No preview of email content
→ ❌ Would execute immediately (dangerous!)
```

### 3. Engagement Tracking is Dead Data (3/10)

**What exists**:
- ✅ `copilot_engagement_events` table
- ✅ Events logged (message_sent, action_taken)

**What's missing**:
- ❌ No aggregation queries
- ❌ No dashboard
- ❌ No feedback loop to optimize timing
- ❌ Can't measure "time saved"

**User Impact**: "Can't answer: Is the copilot helping me?"

### 4. Action Approval UX Has Friction (5/10)

**Current flow**: 3-4 clicks per approval
1. See Action Item in right panel
2. Click card to open modal
3. Scroll through content
4. Click Approve

**Recommended**: Inline quick-approve for simple items

### 5. Email Refinement Limited (4/10)

**What works**: Email preview displayed

**What's frustrating**:
- ❌ No inline tone selector
- ❌ No A/B variants comparison
- ❌ No "Regenerate" button

---

## Missing Features (vs. PRD)

| PRD Feature | Status | Phase |
|-------------|--------|-------|
| Pre-meeting proactive briefs | Not implemented | Phase 1 |
| Clarifying questions flow | Marked complete, not found | Phase 6 |
| Re-enrichment pipeline | Not scheduled | Phase 3 |
| User preferences table | Doesn't exist | Future |
| Smart engagement algorithm | Events logged, not used | Phase 4 |
| Engagement dashboard | Not built | Phase 4 |

---

## Critical Gaps for Production

| Gap | Severity | Impact | Fix Effort |
|-----|----------|--------|------------|
| No proactive cron scheduling | CRITICAL | Core feature doesn't work | 2-3 days |
| No meeting prep function | CRITICAL | Missing key value prop | 1-2 days |
| Persona not refreshed on enrichment | HIGH | Stale company knowledge | 1 day |
| Slack user mappings empty | HIGH | Proactive DMs fail silently | 1 day |
| HITL missing for Slack buttons | HIGH | Dangerous auto-execution | 2-3 days |
| Engagement feedback loop missing | MEDIUM | Can't optimize outreach | 2 days |

---

## Recommended Plan

### Phase 1: Proactive Infrastructure (Critical)
**Duration**: 3-4 days

| Story | Description | Hours |
|-------|-------------|-------|
| CRON-001 | Setup Supabase Cron Infrastructure | 2h |
| CRON-002 | Schedule Daily Pipeline Analysis | 1h |
| CRON-003 | Implement Pre-Meeting Prep Function | 4h |
| CRON-004 | Populate Slack User Mappings on OAuth | 1.5h |

### Phase 2: HITL for Proactive Flows (Critical)
**Duration**: 2-3 days

| Story | Description | Hours |
|-------|-------------|-------|
| HITL-001 | Add HITL Handler to slack-copilot-actions | 3h |
| HITL-002 | Preserve Context Through Proactive→Action Flow | 2h |
| HITL-003 | Add Confirmation UI in Slack Thread | 2h |

### Phase 3: Persona & Enrichment Loop (High)
**Duration**: 2 days

| Story | Description | Hours |
|-------|-------------|-------|
| PERS-001 | Wire Persona Invalidation to Enrichment | 1h |
| PERS-002 | Inject Enrichment Context into Skills | 2h |
| PERS-003 | Schedule Weekly Re-Enrichment Cron | 2h |

### Phase 4: Engagement Feedback Loop (High)
**Duration**: 3 days

| Story | Description | Hours |
|-------|-------------|-------|
| ENG-001 | Create Engagement Aggregation Views | 2h |
| ENG-002 | Load Engagement Metrics in Persona | 2h |
| ENG-003 | Build Engagement Dashboard | 4h |
| ENG-004 | Wire Telemetry to Proactive Functions | 1.5h |

### Phase 5: UX Polish (Medium)
**Duration**: 2-3 days

| Story | Description | Hours |
|-------|-------------|-------|
| UX-001 | Inline Quick-Approve for Simple Actions | 2h |
| UX-002 | Email Refinement Inline Controls | 3h |
| UX-003 | Interactive Context Cards | 3h |
| UX-004 | Smoother Loading State Transitions | 1h |

### Phase 6: Clarifying Questions (Medium)
**Duration**: 1-2 days

| Story | Description | Hours |
|-------|-------------|-------|
| CLAR-001 | Implement Ambiguity Detection | 3h |
| CLAR-002 | Clarifying Questions UI Flow | 2h |

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Proactive message delivery | 0% | >95% |
| HITL confirmation rate | ~50% | >98% |
| User action rate | Unknown | >40% |
| Time to action | Unknown | <5 min |
| Persona freshness | 24h delay | <1h |

---

## Total Estimate

| Metric | Value |
|--------|-------|
| Total stories | 20 |
| Total hours | 42-48h |
| Sprints | 2-3 |
| Critical path | Phase 1 + Phase 2 (1 week) |

---

## Files Created

- `.sixty/plan-proactive-teammate.json` — Execution plan
- `.sixty/progress-proactive-teammate.md` — Progress tracking
- `.sixty/consult/proactive-teammate-assessment.md` — This report

---

## Next Steps

```bash
# Start execution
60/run

# Execute specific story
60/run CRON-001

# Check status
60/status --detail
```

---

## Conclusion

The copilot has **strong foundational architecture** but **lacks automation orchestration**.

**Current state**: Excellent reactive copilot with partial proactive foundation.

**To achieve vision**: Need cron infrastructure (critical blocker), meeting prep workflows, HITL for Slack, and engagement feedback loop. These are 2-3 weeks of focused work.

**Bottom Line**: The reactive experience is 8/10. The proactive experience is 3/10. This plan bridges the gap.
