-- Expand generation_status check constraint to include V2 pipeline statuses.
-- V1 statuses: pending, processing, complete, failed
-- V2 statuses: assembling, context_assembled, composing, composed, rendering, rendered, delivering, ready

-- Drop old constraint and replace with expanded set
ALTER TABLE proposals DROP CONSTRAINT IF EXISTS proposals_generation_status_check;

ALTER TABLE proposals
  ADD CONSTRAINT proposals_generation_status_check
  CHECK (generation_status IN (
    -- V1
    'pending', 'processing', 'complete', 'failed',
    -- V2 pipeline stages
    'assembling', 'context_assembled',
    'composing', 'composed',
    'rendering', 'rendered',
    'delivering', 'ready'
  ));

NOTIFY pgrst, 'reload schema';
