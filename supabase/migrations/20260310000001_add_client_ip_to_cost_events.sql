-- Add client_ip column to ai_cost_events for IP-based usage mapping in God's Eye
ALTER TABLE ai_cost_events ADD COLUMN IF NOT EXISTS client_ip inet;

-- Index for IP-based aggregation queries
CREATE INDEX IF NOT EXISTS idx_ai_cost_events_client_ip ON ai_cost_events (client_ip) WHERE client_ip IS NOT NULL;

COMMENT ON COLUMN ai_cost_events.client_ip IS 'Client IP address captured from x-forwarded-for header at request time';
