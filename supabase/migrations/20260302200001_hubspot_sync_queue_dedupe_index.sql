-- Add unique index on hubspot_sync_queue(org_id, dedupe_key) for ON CONFLICT support.
-- Clean duplicate non-null keys first to avoid index creation failure.

DELETE FROM public.hubspot_sync_queue q
USING public.hubspot_sync_queue d
WHERE q.id < d.id
  AND q.org_id = d.org_id
  AND q.dedupe_key = d.dedupe_key
  AND q.dedupe_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS hubspot_sync_queue_org_dedupe_unique
  ON public.hubspot_sync_queue (org_id, dedupe_key);
