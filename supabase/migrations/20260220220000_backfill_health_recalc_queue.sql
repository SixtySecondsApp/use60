-- Backfill: Queue all active deals + their contacts for health recalculation

-- 1. Queue all active deals for deal health recalculation
INSERT INTO health_recalc_queue (deal_id, contact_id, trigger_type, trigger_source)
SELECT
  d.id,
  NULL::uuid,
  'manual',
  'backfill_20260220'
FROM deals d
INNER JOIN deal_stages ds ON d.stage_id = ds.id
WHERE d.status = 'active'
  AND ds.name NOT IN ('Signed', 'Lost');

-- 2. Queue all contacts linked to active deals for relationship health
INSERT INTO health_recalc_queue (deal_id, contact_id, trigger_type, trigger_source)
SELECT DISTINCT
  NULL::uuid,
  d.primary_contact_id,
  'manual',
  'backfill_20260220'
FROM deals d
INNER JOIN deal_stages ds ON d.stage_id = ds.id
WHERE d.status = 'active'
  AND ds.name NOT IN ('Signed', 'Lost')
  AND d.primary_contact_id IS NOT NULL;

DO $$
DECLARE
  v_deal_count INTEGER;
  v_contact_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_deal_count
  FROM health_recalc_queue
  WHERE trigger_source = 'backfill_20260220' AND deal_id IS NOT NULL;

  SELECT COUNT(*) INTO v_contact_count
  FROM health_recalc_queue
  WHERE trigger_source = 'backfill_20260220' AND contact_id IS NOT NULL;

  RAISE NOTICE 'Health recalc queue populated: % deals, % contacts', v_deal_count, v_contact_count;
END $$;
