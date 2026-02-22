-- ============================================================================
-- Migration: Internal Meeting Columns
-- Purpose: Add meeting_type and is_internal columns to calendar_events to
--          support the Internal Meeting Prep (IMP) agent pipeline.
-- Story: IMP-001
-- Date: 2026-02-22
-- ============================================================================

-- =============================================================================
-- ALTER: calendar_events — add is_internal and meeting_type columns
-- Both columns are nullable (DEFAULT NULL) — no breaking changes to existing queries.
-- Added idempotently using DO $$ BEGIN ... END $$.
-- =============================================================================

DO $$
BEGIN
  -- is_internal: NULL = unclassified, TRUE = internal-only attendees, FALSE = has external attendees
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'calendar_events'
      AND column_name = 'is_internal'
  ) THEN
    ALTER TABLE calendar_events
      ADD COLUMN is_internal BOOLEAN DEFAULT NULL;
  END IF;

  -- meeting_type: one of the known IMP types, NULL = unclassified or external
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'calendar_events'
      AND column_name = 'meeting_type'
  ) THEN
    ALTER TABLE calendar_events
      ADD COLUMN meeting_type TEXT DEFAULT NULL
        CHECK (meeting_type IN (
          'one_on_one',
          'pipeline_review',
          'qbr',
          'standup',
          'external',
          'other'
        ));
  END IF;
END $$;

-- =============================================================================
-- Index: fast lookup of internal meetings per user
-- Partial index — only rows where is_internal = true (classifier output)
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_calendar_events_internal
  ON calendar_events (user_id, is_internal)
  WHERE is_internal = true;

-- =============================================================================
-- Index: meeting_type lookup for prep routing
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_calendar_events_meeting_type
  ON calendar_events (user_id, meeting_type)
  WHERE meeting_type IS NOT NULL;

-- =============================================================================
-- Function: classify_existing_meetings()
-- One-time backfill: applies basic domain-based heuristics to tag historical
-- calendar_events rows that are still unclassified (is_internal IS NULL).
--
-- Heuristic logic:
--   1. If attendees_count <= 1 → skip (solo / focus time, not a meeting)
--   2. If ALL attendees share the same email domain → is_internal = true
--   3. If ANY attendee uses an external domain → is_internal = false
--   4. Title heuristics classify meeting_type for internal events:
--      - "1:1" / "1-1" / "one on one"  → one_on_one
--      - "pipeline", "forecast"         → pipeline_review
--      - "qbr", "quarterly business"    → qbr
--      - "standup", "stand-up", "scrum" → standup
--      - anything else internal         → other
--      - is_internal = false            → external
--
-- Runs ONLY on unclassified rows (is_internal IS NULL).
-- Safe to re-run — will not overwrite already-classified rows.
-- Designed for one-time execution after the migration lands.
-- =============================================================================

CREATE OR REPLACE FUNCTION classify_existing_meetings()
RETURNS TABLE (
  classified   INT,
  skipped_solo INT,
  already_done INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_classified   INT := 0;
  v_skipped_solo INT := 0;
  v_already_done INT := 0;
  rec            RECORD;
  v_is_internal  BOOLEAN;
  v_meet_type    TEXT;
  v_title        TEXT;
  v_org_domain   TEXT;
  v_attendee_domains JSONB;
  v_all_internal BOOLEAN;
  v_any_external BOOLEAN;
  v_domain       TEXT;
BEGIN
  -- Count already-classified rows (skip these)
  SELECT COUNT(*) INTO v_already_done
  FROM calendar_events
  WHERE is_internal IS NOT NULL;

  FOR rec IN
    SELECT
      ce.id,
      ce.user_id,
      ce.title,
      ce.attendees_count,
      ce.attendees,       -- JSONB array of attendee objects or plain email strings
      u.email AS owner_email
    FROM calendar_events ce
    JOIN auth.users u ON u.id = ce.user_id
    WHERE ce.is_internal IS NULL
      AND ce.attendees_count > 1     -- skip solo / focus-time blocks
  LOOP
    -- Derive the owner's domain (part after @)
    v_org_domain := lower(split_part(rec.owner_email, '@', 2));

    -- Extract attendee emails from JSONB attendees array.
    -- Handles two common shapes:
    --   (a) array of strings:  ["a@foo.com", "b@foo.com"]
    --   (b) array of objects:  [{"email": "a@foo.com"}, ...]
    v_all_internal := true;
    v_any_external := false;

    IF rec.attendees IS NOT NULL AND jsonb_array_length(rec.attendees) > 0 THEN
      FOR v_domain IN
        SELECT CASE
          WHEN jsonb_typeof(elem) = 'string' THEN
            lower(split_part(elem #>> '{}', '@', 2))
          ELSE
            lower(split_part(elem ->> 'email', '@', 2))
        END AS domain
        FROM jsonb_array_elements(rec.attendees) AS elem
        WHERE (
          -- string element: non-empty
          (jsonb_typeof(elem) = 'string' AND elem #>> '{}' LIKE '%@%')
          OR
          -- object element: has non-empty email key
          (jsonb_typeof(elem) = 'object' AND elem ->> 'email' LIKE '%@%')
        )
      LOOP
        -- Empty domain after split means no '@' found — treat as unknown (skip)
        CONTINUE WHEN v_domain = '' OR v_domain IS NULL;

        IF v_domain <> v_org_domain THEN
          v_all_internal := false;
          v_any_external := true;
        END IF;
      END LOOP;
    END IF;

    v_is_internal := v_all_internal AND NOT v_any_external;

    -- Classify meeting_type from title
    v_title := lower(coalesce(rec.title, ''));

    IF NOT v_is_internal THEN
      v_meet_type := 'external';

    ELSIF v_title ~ '(^|\s)(1[:\-]1|one.on.one|1on1)(\s|$)' THEN
      v_meet_type := 'one_on_one';

    ELSIF v_title ~ '(pipeline|forecast review|forecast call)' THEN
      v_meet_type := 'pipeline_review';

    ELSIF v_title ~ '(qbr|quarterly business review)' THEN
      v_meet_type := 'qbr';

    ELSIF v_title ~ '(stand.?up|standup|scrum|daily sync)' THEN
      v_meet_type := 'standup';

    ELSE
      v_meet_type := 'other';
    END IF;

    -- Write classification
    UPDATE calendar_events
    SET
      is_internal  = v_is_internal,
      meeting_type = v_meet_type
    WHERE id = rec.id;

    v_classified := v_classified + 1;
  END LOOP;

  -- Count skipped solo events (attendees_count <= 1, still unclassified)
  SELECT COUNT(*) INTO v_skipped_solo
  FROM calendar_events
  WHERE is_internal IS NULL
    AND (attendees_count IS NULL OR attendees_count <= 1);

  RETURN QUERY SELECT v_classified, v_skipped_solo, v_already_done;
END;
$$;

COMMENT ON FUNCTION classify_existing_meetings IS
  'One-time backfill: classifies historical calendar_events with is_internal and meeting_type using domain-matching heuristics. Only processes rows where is_internal IS NULL. Safe to re-run.';

GRANT EXECUTE ON FUNCTION classify_existing_meetings TO service_role;

-- =============================================================================
-- Column comments
-- =============================================================================

COMMENT ON COLUMN calendar_events.is_internal IS
  'NULL = unclassified. TRUE = all attendees share the org email domain (internal meeting). FALSE = at least one external-domain attendee.';

COMMENT ON COLUMN calendar_events.meeting_type IS
  'Classification of the meeting purpose. Set by the IMP classifier. Values: one_on_one, pipeline_review, qbr, standup, external, other. NULL = unclassified.';

-- =============================================================================
-- Migration Summary
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260222700001_internal_meeting_columns.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Story: IMP-001';
  RAISE NOTICE '';
  RAISE NOTICE 'Altered table: calendar_events';
  RAISE NOTICE '  + is_internal  BOOLEAN DEFAULT NULL';
  RAISE NOTICE '  + meeting_type TEXT    DEFAULT NULL';
  RAISE NOTICE '    CHECK (meeting_type IN (one_on_one, pipeline_review, qbr, standup, external, other))';
  RAISE NOTICE '';
  RAISE NOTICE 'New indexes:';
  RAISE NOTICE '  idx_calendar_events_internal      — (user_id, is_internal) WHERE is_internal = true';
  RAISE NOTICE '  idx_calendar_events_meeting_type  — (user_id, meeting_type) WHERE meeting_type IS NOT NULL';
  RAISE NOTICE '';
  RAISE NOTICE 'New function:';
  RAISE NOTICE '  classify_existing_meetings()';
  RAISE NOTICE '  → one-time backfill: domain-heuristic is_internal + title-heuristic meeting_type';
  RAISE NOTICE '  → only processes rows where is_internal IS NULL';
  RAISE NOTICE '  → returns (classified, skipped_solo, already_done)';
  RAISE NOTICE '';
  RAISE NOTICE 'No breaking changes — both columns are nullable.';
  RAISE NOTICE 'Run classify_existing_meetings() once after migration to tag historical data.';
  RAISE NOTICE '============================================================================';
END $$;
