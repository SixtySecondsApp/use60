# Consult Report: Autonomy Escalation Engine V2
Generated: 2026-03-03

## User Request
Autonomy Escalation Engine — scored 5/4/5 UNIQUE with no competitor equivalent. Build the trust signal taxonomy, promotion thresholds per action type, demotion triggers, audit trail, plus 6 selected enhancements: Contextual Autonomy, Shadow Execution, Negative Signal Amplification, Show Your Work, Trust Capital, Role-Based Presets.

## What Already Exists (Two Parallel Systems)

### System A — Org-Policy Autonomy (AUT-001→008, COMPLETE)
- `autonomy_policies` table with 4-tier enum (disabled/suggest/approve/auto)
- `autonomyResolver.ts` — 4-step chain: user → org → preset → default, 5-min cache
- `promotionEngine.ts` — daily eval, Slack approve/reject/snooze
- `demotionHandler.ts` — severity-based, 30-day cooldown
- `autonomyAnalytics.ts`, `autonomyTracker.ts` — stats aggregation
- `AutonomySettingsPage.tsx`, `ActionPolicyGrid.tsx` — admin UI
- 12 Vitest tests for resolver

### System B — Per-User Autopilot (GRAD-001→006, COMPLETE)
- `autopilot_signals` — 7 signal types with asymmetric weights
- `autopilot_confidence` — time-decayed composite score (30-day half-life)
- `autopilot_thresholds` — per (action_type, from_tier, to_tier) criteria
- `demotionEngine.ts` — 4 severity rules (emergency/demote/warn)
- `promotionSlack.ts` — Slack DMs to individual reps
- `AutopilotDashboard.tsx`, `AutonomyProgressionChart.tsx`, `AutonomySimulator.tsx`

### Command Centre Trust Scorer (IMPLEMENTED)
- `trustScorer.ts` — `classifyExecutionTier()` → autonomous/one_click/needs_input
- `action_trust_scores` + `action_trust_score_defaults` tables
- Drift rules: -0.05 per 50 consecutive approvals, reset on rejection
- 6 action types with starting/floor thresholds

### Key Gaps Identified
1. Systems A and B not unified — no single resolver entry point
2. `trust_history` factor in confidenceScorer.ts is hardcoded 0.05 (TODO CC11)
3. Chat path (AutonomousExecutor) has no approval gate
4. No "explain why" — users can't see reasoning behind tier decisions
5. No context-awareness — a $500K deal and $10K deal get identical treatment
6. No shadow execution — no way to show users "what would have happened"
7. Presets are generic (conservative/balanced/autonomous), not role-aware

## Selected Enhancements

| Feature | Moat Value | Complexity |
|---------|-----------|------------|
| Contextual Autonomy | High — makes engine feel intelligent | Medium |
| Shadow Execution / A-B Testing | High — data-backed promotion confidence | Medium |
| Negative Signal Amplification | Medium — impact-weighted safety | Low |
| Show Your Work Layer | High — accelerates trust-building | Medium |
| Trust Capital Metric | High — visible switching cost | Low |
| Role-Based Presets | Medium — instant onboarding | Low |

## Deferred
- Cross-Rep Org Learning (network effect — future phase)
- Time-Based Autonomy Windows
- Delegation Chains / OOO
- System A+B unification (handle as impl detail in AE2-001)
- Chat path HITL (handle as impl detail in AE2-003)
