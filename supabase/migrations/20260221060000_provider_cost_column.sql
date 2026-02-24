-- Add provider cost tracking columns to ai_cost_events
-- provider_cost_usd: actual API cost in USD (computed from tokens × rate)
-- credits_charged: credits deducted from user (separate from estimated_cost for clarity)

ALTER TABLE ai_cost_events ADD COLUMN IF NOT EXISTS provider_cost_usd DECIMAL(12,6) DEFAULT NULL;
ALTER TABLE ai_cost_events ADD COLUMN IF NOT EXISTS credits_charged DECIMAL(12,4) DEFAULT NULL;

COMMENT ON COLUMN ai_cost_events.provider_cost_usd IS 'Actual provider API cost in USD, computed from tokens × cost_rates at event time';
COMMENT ON COLUMN ai_cost_events.credits_charged IS 'Credits deducted from user balance for this event';
