-- Migration: Update deal_health_alerts alert types for Pipeline Intelligence
-- Adds new alert types: health_drop, ghost_risk, close_date_risk

-- Drop the existing check constraint
ALTER TABLE public.deal_health_alerts
DROP CONSTRAINT IF EXISTS deal_health_alerts_alert_type_check;

-- Add updated constraint with new alert types
ALTER TABLE public.deal_health_alerts
ADD CONSTRAINT deal_health_alerts_alert_type_check
CHECK (alert_type = ANY (ARRAY[
  'stage_stall'::text,
  'sentiment_drop'::text,
  'engagement_decline'::text,
  'no_activity'::text,
  'missed_follow_up'::text,
  'close_date_approaching'::text,
  'high_risk'::text,
  'health_drop'::text,        -- NEW: >20 point health score drop
  'ghost_risk'::text,          -- NEW: >60% ghost probability
  'close_date_risk'::text,     -- NEW: close date approaching with low health
  'sentiment_decline'::text    -- NEW: declining sentiment trend
]));

COMMENT ON CONSTRAINT deal_health_alerts_alert_type_check ON public.deal_health_alerts IS
  'Pipeline Intelligence alert types: health_drop, ghost_risk, no_activity, stage_stall, sentiment_decline, close_date_risk';
