# Consult Report: Autonomy Escalation Engine V2
Generated: 2026-03-03

## User Request
Build the Autonomy Escalation Engine — 60's most defensible moat. Scored 5/4/5 (UNIQUE, no competitor equivalent). The V2 architecture defines a 4-tier system (disabled → suggest → approve → auto), resolver chain with 5-minute cache, promotion/demotion engines, and preset configs. Every other V2 system depends on a working autonomy resolver.

## Selected Features (from Consult)

### Core Engine
- Trust signal taxonomy (positive/negative signal definitions with weights)
- Promotion thresholds per action type (configurable per org)
- Demotion triggers (severity-based with cooldowns)
- Audit trail (full explainability)

### Intelligence Layer
1. **Contextual Autonomy** — Tier resolves based on deal context (value, stage, contact seniority, warmth), not just action type
2. **Shadow Execution / A-B Testing** — Phantom higher-tier runs that measure what WOULD have happened
3. **Negative Signal Amplification** — Demotion weighted by impact (deal value × seniority × reversibility)

### Trust UX Layer
4. **Show Your Work** — Visible confidence breakdown at every action surface
5. **Trust Capital Metric** — Cumulative score showing switching cost / agent maturity

### Operations
6. **Role-Based Autonomy Presets** — SDR / AE / VP Sales / CS defaults replacing 3-preset system

## Deferred (not selected)
- Cross-Rep Org Learning (network effect — Phase 2 roadmap)
- Time-Based Autonomy Windows
- Delegation Chains / OOO handoff
- Emergency Circuit Breaker

---

## Codebase Analysis

### What Already Exists

**System A (Org-Policy)** — COMPLETE
- `autonomyResolver.ts` — 4-step chain: user → org → preset → system default, 5-min cache
- `promotionEngine.ts` — daily eval, promotion queue, Slack approve/reject/snooze
- `demotionHandler.ts` — drops policy one level, 30-day cooldown, audit log
- `autonomyAnalytics.ts` — 7d/30d/90d stats with RPCs
- `autonomyTracker.ts` — daily aggregation from HITL, Slack DM notifications
- `AutonomySettingsPage.tsx` — preset selector + toggle grid (admin)
- `ActionPolicyGrid.tsx` — radio-button grid component
- Vitest test suite (12 tests)

**System B (Per-User Autopilot)** — COMPLETE
- `signals.ts` — 7 signal types, asymmetric weights, rubber-stamp detection
- `confidence.ts` — time-decayed scoring (30-day half-life)
- `demotionEngine.ts` — 4 severity rules (emergency/demote/warn)
- `promotionSlack.ts` — Slack Block Kit DMs for promotion proposals
- `autonomy/promotionEngine.ts` — 5-step eligibility check with manager ceiling
- `AutopilotDashboard.tsx`, `TeamAutopilotView.tsx`, `AutonomyProgressionChart.tsx`, `AutonomySimulator.tsx`

**Command Centre Trust Scorer** — COMPLETE (but has a gap)
- `trustScorer.ts` — threshold drift, `classifyExecutionTier()` → autonomous / one_click / needs_input
- `confidenceScorer.ts` — 5-factor scoring (data_completeness, pattern_match, template_confidence, recency, trust_history)
- **GAP:** `trust_history` factor is hardcoded to 0.05 (TODO CC11)

### Key Gaps This Plan Fills

1. **`trust_history` placeholder** in confidenceScorer.ts (always 0.05, not wired to action_trust_scores)
2. **No deal-context awareness** — resolver only considers action type, not deal value/stage/contact
3. **No "explain why"** — users can't see reasoning behind tier decisions
4. **No shadow execution** — no way to show users what WOULD have happened at higher autonomy
5. **No impact-weighted demotion** — all mistakes treated equally regardless of deal value
6. **No Trust Capital** — no visible metric showing accumulated agent intelligence
7. **Preset system is generic** (conservative/balanced/autonomous) — not role-aware

### Signal Weights (Current — from signals.ts)
| Signal | Weight | Notes |
|--------|--------|-------|
| `approved` | +1.0 | Clean approval |
| `approved_edited` | +0.3 | Edited before approval |
| `rejected` | -1.0 | User rejected |
| `expired` | -0.2 | Timed out |
| `undone` | -2.0 | User undid after approval |
| `auto_executed` | +0.1 | Auto ran without issue |
| `auto_undone` | -3.0 | Auto ran and user undid — worst signal |

### Rubber Stamp Thresholds (Current)
| Action Type | Threshold (ms) |
|------------|---------------|
| `email.send` | 5000 |
| `email.follow_up_send` | 5000 |
| `crm.deal_stage_change` | 3000 |
| `crm.field_update` | 2000 |
| `task.create` | 2000 |
| (default) | 3000 |

---

## Dependency Map

```
AEV2-001 (Trust Signal Taxonomy)
  └─> AEV2-002 (Wire trust_history)
  └─> AEV2-004 (Impact Scoring)

AEV2-003 (Context Scoring Engine)
  └─> AEV2-005 (Context-Aware Resolver)
      └─> AEV2-006 (Context Thresholds UI)

AEV2-002 + AEV2-005
  └─> AEV2-007 (Confidence Breakdown API)
      └─> AEV2-008 (Show Your Work UI)

AEV2-004 (Impact Scoring)
  └─> AEV2-009 (Impact-Weighted Demotion)

AEV2-002 + AEV2-005
  └─> AEV2-010 (Shadow Execution Engine)
      └─> AEV2-011 (Shadow Results Storage)
          └─> AEV2-012 (Promotion Evidence UI)

AEV2-007 + AEV2-010
  └─> AEV2-013 (Trust Capital Metric)
      └─> AEV2-014 (Trust Capital Dashboard)

AEV2-015 (Role Preset Definitions)
  └─> AEV2-016 (Role Preset UI)
```

## Parallel Opportunities
- AEV2-001 + AEV2-003 (no overlap)
- AEV2-004 + AEV2-007 (after their deps)
- AEV2-008 + AEV2-009 (no file overlap)
- AEV2-015 + AEV2-013 (independent)
