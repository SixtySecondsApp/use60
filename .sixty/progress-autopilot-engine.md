# Progress Log — Autopilot Engine (PRD-AP-001)

## Foundation Audit (2026-02-25)
Already built in V2 autonomy system:
- `autonomy_policies`, `approval_statistics`, `autonomy_promotion_queue`, `autonomy_audit_log`, `autonomy_cooldowns`, `autonomy_policy_ceilings` tables (migrations exist)
- `_shared/orchestrator/autonomyAnalytics.ts` — basic approval/rejection counts, meetsPromotionCriteria, shouldDemote
- `_shared/orchestrator/promotionEngine.ts` — evaluatePromotions, applyPromotion, rejectPromotion, runDailyEvaluation
- `_shared/orchestrator/demotionHandler.ts` — handleDemotion (rejection rate >15%), isInCooldown, evaluateDemotions
- `_shared/orchestrator/adapters/autonomyTracker.ts` — aggregateApprovalStats, checkAndNotifyPromotionCandidates
- `supabase/functions/autonomy-promotion-notify/index.ts`
- `slack-interactive/handlers/autonomy.ts` + `autonomyPromotion.ts`
- `src/pages/settings/AutonomySettingsPage.tsx` + AutonomyActionCard, AutonomyProgressionDashboard, ManagerAutonomyControls
- `useAutonomyAnalytics.ts`, `useManagerAutonomy.ts`

Key gaps to fill:
- No per-signal table (only aggregate counts) → need `autopilot_signals`
- No time-decayed confidence scoring → need `autopilot_confidence`
- No per-action-type risk-based thresholds → need `autopilot_thresholds`
- Org-level only → PRD requires per-USER confidence tracking
- Basic demotion → need severity levels (warn/demote/emergency)
- No time saved calculation or rep_memory integration
- No demo simulator

---

## Session Log

<!-- Add entries here as stories complete -->

