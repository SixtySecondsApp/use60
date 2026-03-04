-- ============================================================================
-- Migration: meeting_prep_briefs table + get_meeting_prep RPC
-- Story: IMP-UI-006
-- Purpose: Cache generated prep briefs keyed by calendar_event_id.
--          get_meeting_prep() returns type-specific prep data for display.
-- ============================================================================

-- =============================================================================
-- Table: meeting_prep_briefs
-- Caches generated prep briefs to avoid re-generation on every page load.
-- =============================================================================

CREATE TABLE IF NOT EXISTS meeting_prep_briefs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_event_id  UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meeting_type       TEXT NOT NULL,
  brief_content      JSONB NOT NULL DEFAULT '{}',
  generated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at         TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  CONSTRAINT uq_prep_brief_per_event_user UNIQUE (calendar_event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_prep_briefs_calendar_event
  ON meeting_prep_briefs (calendar_event_id, user_id);

CREATE INDEX IF NOT EXISTS idx_prep_briefs_user_id
  ON meeting_prep_briefs (user_id, generated_at DESC);

-- RLS
ALTER TABLE meeting_prep_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own prep briefs"
  ON meeting_prep_briefs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own prep briefs"
  ON meeting_prep_briefs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own prep briefs"
  ON meeting_prep_briefs FOR UPDATE
  USING (auth.uid() = user_id);

-- =============================================================================
-- Function: get_meeting_prep(p_calendar_event_id)
--
-- Returns type-specific prep data for a calendar event.
-- Reads from calendar_events (meeting_type, is_internal, meeting_prep) and
-- any cached brief from meeting_prep_briefs.
--
-- Returns: JSON with fields:
--   calendar_event_id, meeting_type, is_internal, title, start_time,
--   meeting_prep (raw stored prep text from proactive-meeting-prep),
--   cached_brief (JSONB from meeting_prep_briefs, or null),
--   pipeline_data (for pipeline_review type),
--   context_data (deal, contact etc)
-- =============================================================================

CREATE OR REPLACE FUNCTION get_meeting_prep(
  p_calendar_event_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id     UUID := auth.uid();
  v_event       RECORD;
  v_brief       RECORD;
  v_deal        RECORD;
  v_result      JSONB;
BEGIN
  -- Fetch the calendar event
  SELECT
    ce.id,
    ce.title,
    ce.start_time,
    ce.end_time,
    ce.meeting_type,
    ce.is_internal,
    ce.meeting_prep,
    ce.deal_id,
    ce.contact_id,
    ce.company_id,
    ce.attendees_count,
    co.name  AS company_name,
    c.full_name AS contact_name
  INTO v_event
  FROM calendar_events ce
  LEFT JOIN companies co ON co.id = ce.company_id
  LEFT JOIN contacts c   ON c.id  = ce.contact_id
  WHERE ce.id = p_calendar_event_id
    AND ce.user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Fetch cached brief (if exists and not expired)
  SELECT brief_content, generated_at
  INTO v_brief
  FROM meeting_prep_briefs
  WHERE calendar_event_id = p_calendar_event_id
    AND user_id = v_user_id
    AND expires_at > now()
  ORDER BY generated_at DESC
  LIMIT 1;

  -- Build base result
  v_result := jsonb_build_object(
    'calendar_event_id', v_event.id,
    'title',             v_event.title,
    'start_time',        v_event.start_time,
    'end_time',          v_event.end_time,
    'meeting_type',      v_event.meeting_type,
    'is_internal',       v_event.is_internal,
    'meeting_prep',      v_event.meeting_prep,
    'cached_brief',      CASE WHEN v_brief IS NOT NULL THEN v_brief.brief_content ELSE NULL END,
    'generated_at',      CASE WHEN v_brief IS NOT NULL THEN v_brief.generated_at ELSE NULL END,
    'context', jsonb_build_object(
      'deal_id',       v_event.deal_id,
      'contact_id',    v_event.contact_id,
      'company_id',    v_event.company_id,
      'company_name',  v_event.company_name,
      'contact_name',  v_event.contact_name,
      'attendees_count', v_event.attendees_count
    )
  );

  -- For pipeline_review: attach top deals at risk
  IF v_event.meeting_type = 'pipeline_review' THEN
    v_result := v_result || jsonb_build_object(
      'pipeline_snapshot', (
        SELECT jsonb_build_object(
          'weighted_value', ps.weighted_pipeline_value,
          'total_value',    ps.total_pipeline_value,
          'at_risk',        ps.deals_at_risk,
          'target',         ps.target,
          'snapshot_date',  ps.snapshot_date
        )
        FROM pipeline_snapshots ps
        WHERE ps.org_id = (
          SELECT clerk_org_id FROM calendar_events WHERE id = p_calendar_event_id
        )
        ORDER BY ps.snapshot_date DESC
        LIMIT 1
      )
    );
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_meeting_prep(UUID) TO authenticated;

COMMENT ON FUNCTION get_meeting_prep IS
  'Returns type-specific prep data for a calendar event. Reads cached brief from meeting_prep_briefs, falls back to calendar_events.meeting_prep. Returns NULL if event not found or not owned by caller.';

COMMENT ON TABLE meeting_prep_briefs IS
  'Caches AI-generated meeting prep briefs keyed by (calendar_event_id, user_id). Expires after 24 hours.';
