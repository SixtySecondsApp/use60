-- =====================================================================
-- CRM Write-Back Queue
-- =====================================================================
-- Queues CRM write operations (create, update, associate) for async
-- processing with retry logic and deduplication.
--
-- Used by: copilot, enrichment, automations to write data back to
-- HubSpot, Attio, Salesforce without blocking the main flow.
-- =====================================================================

CREATE TABLE crm_writeback_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  crm_source TEXT NOT NULL,

  -- What to write
  entity_type TEXT NOT NULL CHECK (entity_type IN ('contact', 'company', 'deal', 'activity')),
  crm_record_id TEXT,                        -- NULL for creates
  local_record_id UUID,                      -- Reference to local contacts/companies/deals record
  operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'associate', 'delete')),
  payload JSONB NOT NULL DEFAULT '{}',       -- Fields to write

  -- Source tracking
  triggered_by TEXT NOT NULL,                -- 'copilot', 'enrichment', 'automation', 'user'
  triggered_by_user_id UUID,

  -- Queue management
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead_letter')),
  priority INTEGER NOT NULL DEFAULT 5,       -- 1=highest, 10=lowest
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5,
  last_error TEXT,
  next_retry_at TIMESTAMPTZ DEFAULT NOW(),

  -- Deduplication: prevent duplicate operations
  dedupe_key TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  CONSTRAINT unique_writeback_dedupe UNIQUE(org_id, dedupe_key)
);

-- Index for queue workers: find pending/failed items ready to retry
CREATE INDEX idx_writeback_pending ON crm_writeback_queue(status, next_retry_at)
  WHERE status IN ('pending', 'failed');

-- Index for org-scoped queries and monitoring
CREATE INDEX idx_writeback_org ON crm_writeback_queue(org_id, status);

-- Index for dedup lookups (find existing operations for the same record)
CREATE INDEX idx_writeback_dedup_lookup ON crm_writeback_queue(org_id, crm_source, entity_type, crm_record_id)
  WHERE status IN ('pending', 'processing');

-- =====================================================================
-- Row Level Security
-- =====================================================================
-- Users can read queue items for their organization (monitoring)
-- Service role has full access for queue operations and processing
-- Edge functions use service role to enqueue and process items
-- =====================================================================

ALTER TABLE crm_writeback_queue ENABLE ROW LEVEL SECURITY;

-- Users can read their organization's queue items (for monitoring/debugging)
CREATE POLICY "Users can read org queue items"
  ON crm_writeback_queue
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id
      FROM organization_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Service role has full access for queue operations
CREATE POLICY "Service role full access"
  ON crm_writeback_queue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
