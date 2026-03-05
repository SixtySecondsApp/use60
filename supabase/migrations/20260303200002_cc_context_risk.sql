-- AE2-006: Add context_risk_score column to command_centre_items for audit
--
-- Records the context risk score (0.0–1.0) calculated by contextRiskScorer
-- at action-drafting time. Higher scores mean the deal/contact context was
-- riskier (large deal, senior buyer, cold relationship), which causes
-- classifyExecutionTier to raise the auto_threshold by 0.10 — making
-- autonomous execution harder to achieve.
--
-- Default 0.0 ensures existing items without context behave identically
-- to before this migration (no threshold adjustment).

ALTER TABLE command_centre_items
  ADD COLUMN IF NOT EXISTS context_risk_score REAL NOT NULL DEFAULT 0.0;

COMMENT ON COLUMN command_centre_items.context_risk_score IS
  'Context risk score (0.0–1.0) from contextRiskScorer. Values > 0.7 raise the auto_threshold by 0.10 in classifyExecutionTier. Default 0.0 = no risk adjustment.';
