-- Migration: Health Recalculation Event Triggers
-- Creates PostgreSQL triggers that queue health recalculations when health-affecting events occur

-- ============================================================================
-- Queue Table (for debouncing)
-- ============================================================================

CREATE TABLE IF NOT EXISTS health_recalc_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('stage_change', 'meeting', 'activity', 'communication', 'manual_crm_sync', 'manual')),
  trigger_source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  -- At least one of deal_id or contact_id must be present
  CONSTRAINT check_target_exists CHECK (deal_id IS NOT NULL OR contact_id IS NOT NULL)
);

-- Index for processing unprocessed items
CREATE INDEX IF NOT EXISTS idx_health_recalc_queue_unprocessed
  ON health_recalc_queue(created_at)
  WHERE processed_at IS NULL;

-- Index for deal lookups
CREATE INDEX IF NOT EXISTS idx_health_recalc_queue_deal_id
  ON health_recalc_queue(deal_id)
  WHERE processed_at IS NULL;

-- Index for contact lookups
CREATE INDEX IF NOT EXISTS idx_health_recalc_queue_contact_id
  ON health_recalc_queue(contact_id)
  WHERE processed_at IS NULL;

COMMENT ON TABLE health_recalc_queue IS
  'Queue for health score recalculation jobs. Debounced to max 1 per deal/contact per 5 minutes.';

-- ============================================================================
-- Helper Function: Queue Health Recalc (with debouncing)
-- ============================================================================

CREATE OR REPLACE FUNCTION queue_health_recalc(
  p_deal_id UUID DEFAULT NULL,
  p_contact_id UUID DEFAULT NULL,
  p_trigger_type TEXT DEFAULT NULL,
  p_trigger_source TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_already_queued BOOLEAN;
BEGIN
  -- Check if there's an unprocessed item for this deal/contact in the last 5 minutes
  IF p_deal_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM health_recalc_queue
      WHERE deal_id = p_deal_id
        AND processed_at IS NULL
        AND created_at > NOW() - INTERVAL '5 minutes'
    ) INTO v_already_queued;
  ELSIF p_contact_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM health_recalc_queue
      WHERE contact_id = p_contact_id
        AND processed_at IS NULL
        AND created_at > NOW() - INTERVAL '5 minutes'
    ) INTO v_already_queued;
  ELSE
    RETURN FALSE; -- Neither deal_id nor contact_id provided
  END IF;

  -- If already queued recently, skip
  IF v_already_queued THEN
    RETURN FALSE;
  END IF;

  -- Insert into queue
  INSERT INTO health_recalc_queue (deal_id, contact_id, trigger_type, trigger_source)
  VALUES (p_deal_id, p_contact_id, p_trigger_type, p_trigger_source);

  -- Send pg_notify for real-time processing (if there's a listener)
  PERFORM pg_notify(
    'health_recalc',
    json_build_object(
      'deal_id', p_deal_id,
      'contact_id', p_contact_id,
      'type', p_trigger_type,
      'source', p_trigger_source
    )::text
  );

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION queue_health_recalc IS
  'Queue a health recalculation with 5-minute debouncing. Returns TRUE if queued, FALSE if skipped (already queued recently).';

-- ============================================================================
-- Trigger 1: Deal Stage Change
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_deal_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only trigger if stage_id actually changed
  IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
    PERFORM queue_health_recalc(
      p_deal_id := NEW.id,
      p_trigger_type := 'stage_change',
      p_trigger_source := 'deals_trigger'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deal_stage_change ON deals;
CREATE TRIGGER trg_deal_stage_change
  AFTER UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION trigger_deal_stage_change();

COMMENT ON TRIGGER trg_deal_stage_change ON deals IS
  'Queues health recalculation when a deal stage changes';

-- ============================================================================
-- Trigger 2: Meeting Insert/Update
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_meeting_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Queue recalc for primary contact (relationship health)
  IF NEW.primary_contact_id IS NOT NULL THEN
    PERFORM queue_health_recalc(
      p_contact_id := NEW.primary_contact_id,
      p_trigger_type := 'meeting',
      p_trigger_source := 'meetings_trigger'
    );
  END IF;

  -- Queue recalc for associated deals (deal health)
  -- Note: meetings table has company_id and primary_contact_id
  -- We need to find related deals via the contact's company
  IF NEW.company_id IS NOT NULL OR NEW.primary_contact_id IS NOT NULL THEN
    -- Find deals associated with this meeting's company or contact
    PERFORM queue_health_recalc(
      p_deal_id := d.id,
      p_trigger_type := 'meeting',
      p_trigger_source := 'meetings_trigger'
    )
    FROM deals d
    WHERE (NEW.company_id IS NOT NULL AND d.company_id = NEW.company_id)
       OR (NEW.primary_contact_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM contacts c
         WHERE c.id = NEW.primary_contact_id AND c.company_id = d.company_id
       ));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meeting_insert ON meetings;
CREATE TRIGGER trg_meeting_insert
  AFTER INSERT ON meetings
  FOR EACH ROW
  EXECUTE FUNCTION trigger_meeting_event();

DROP TRIGGER IF EXISTS trg_meeting_update ON meetings;
CREATE TRIGGER trg_meeting_update
  AFTER UPDATE ON meetings
  FOR EACH ROW
  EXECUTE FUNCTION trigger_meeting_event();

COMMENT ON TRIGGER trg_meeting_insert ON meetings IS
  'Queues health recalculation when a meeting is created';
COMMENT ON TRIGGER trg_meeting_update ON meetings IS
  'Queues health recalculation when a meeting is updated';

-- ============================================================================
-- Trigger 3: Activity Insert
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_activity_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Queue recalc for the associated deal (if present)
  IF NEW.deal_id IS NOT NULL THEN
    PERFORM queue_health_recalc(
      p_deal_id := NEW.deal_id,
      p_trigger_type := 'activity',
      p_trigger_source := 'activities_trigger'
    );
  END IF;

  -- Queue recalc for the associated contact (if present)
  IF NEW.contact_id IS NOT NULL THEN
    PERFORM queue_health_recalc(
      p_contact_id := NEW.contact_id,
      p_trigger_type := 'activity',
      p_trigger_source := 'activities_trigger'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_insert ON activities;
CREATE TRIGGER trg_activity_insert
  AFTER INSERT ON activities
  FOR EACH ROW
  EXECUTE FUNCTION trigger_activity_event();

COMMENT ON TRIGGER trg_activity_insert ON activities IS
  'Queues health recalculation when an activity is created';

-- ============================================================================
-- Trigger 4: Communication Event Insert
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_communication_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Queue recalc for the associated contact (relationship health)
  IF NEW.contact_id IS NOT NULL THEN
    PERFORM queue_health_recalc(
      p_contact_id := NEW.contact_id,
      p_trigger_type := 'communication',
      p_trigger_source := 'communication_events_trigger'
    );

    -- Also queue recalc for any deals associated with this contact's company
    PERFORM queue_health_recalc(
      p_deal_id := d.id,
      p_trigger_type := 'communication',
      p_trigger_source := 'communication_events_trigger'
    )
    FROM deals d
    WHERE EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = NEW.contact_id AND c.company_id = d.company_id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_communication_insert ON communication_events;
CREATE TRIGGER trg_communication_insert
  AFTER INSERT ON communication_events
  FOR EACH ROW
  EXECUTE FUNCTION trigger_communication_event();

COMMENT ON TRIGGER trg_communication_insert ON communication_events IS
  'Queues health recalculation when a communication event is created';

-- ============================================================================
-- RLS Policies for health_recalc_queue
-- ============================================================================

ALTER TABLE health_recalc_queue ENABLE ROW LEVEL SECURITY;

-- Service role needs full access for processing
CREATE POLICY health_recalc_queue_service_role_all
  ON health_recalc_queue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can view their own org's queue items
-- (requires join to deals/contacts to check org membership, but for simplicity we'll allow service role only)
-- Users don't need direct access to this table — it's purely for backend processing

COMMENT ON POLICY health_recalc_queue_service_role_all ON health_recalc_queue IS
  'Service role has full access to health recalc queue for processing';

-- Authenticated users can INSERT queue items (e.g. manual CRM sync from UI)
CREATE POLICY health_recalc_queue_authenticated_insert
  ON health_recalc_queue
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

COMMENT ON POLICY health_recalc_queue_authenticated_insert ON health_recalc_queue IS
  'Authenticated users can queue health recalculations from the UI';

-- Grant permissions
GRANT ALL ON health_recalc_queue TO service_role;
GRANT INSERT ON health_recalc_queue TO authenticated;
GRANT EXECUTE ON FUNCTION queue_health_recalc TO service_role;
GRANT EXECUTE ON FUNCTION trigger_deal_stage_change TO service_role;
GRANT EXECUTE ON FUNCTION trigger_meeting_event TO service_role;
GRANT EXECUTE ON FUNCTION trigger_activity_event TO service_role;
GRANT EXECUTE ON FUNCTION trigger_communication_event TO service_role;
