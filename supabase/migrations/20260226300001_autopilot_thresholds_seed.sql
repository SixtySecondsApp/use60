-- ============================================================================
-- AP-006: Platform Default Autopilot Thresholds Seed
-- Seeds the autopilot_thresholds table with platform-wide defaults
-- (org_id = NULL) for every trackable action type.
--
-- Rows are grouped by risk tier:
--   LOW RISK     — 15-20 signals, 7 days active
--   MEDIUM RISK  — 25-30 signals, 14-21 days active
--   HIGH RISK    — 40-50 signals, 30 days active
--   NEVER AUTO-PROMOTE — policy records blocking automatic promotion forever
--
-- All rows:  from_tier = 'approve', to_tier = 'auto', enabled = TRUE
-- Safe to re-run: ON CONFLICT ON CONSTRAINT uq_autopilot_thresholds DO NOTHING
-- Org-level overrides in autopilot_thresholds are not touched by this migration.
--
-- Companion to: AP-003 (20260226200001_autopilot_events_thresholds.sql)
-- ============================================================================

INSERT INTO public.autopilot_thresholds (
  org_id,
  action_type,
  from_tier,
  to_tier,
  min_signals,
  min_clean_approval_rate,
  max_rejection_rate,
  max_undo_rate,
  min_days_active,
  min_confidence_score,
  last_n_clean,
  enabled,
  never_promote
) VALUES

-- ---------------------------------------------------------------------------
-- LOW RISK  (15-20 signals, 7 days active)
-- Read-only annotations, notifications, and lightweight analysis actions.
-- These have minimal blast radius if the AI acts incorrectly.
-- ---------------------------------------------------------------------------

-- Internal CRM note — append-only, easy to spot and delete
( NULL, 'crm.note_add',             'approve', 'auto',  15, 0.900, 0.050, 0.020,  7, 0.850, 10, TRUE, FALSE ),

-- Activity log entry — audit record, no external side-effects
( NULL, 'crm.activity_log',         'approve', 'auto',  15, 0.900, 0.050, 0.020,  7, 0.850, 10, TRUE, FALSE ),

-- Task creation — creates work items, reversible via delete
( NULL, 'task.create',              'approve', 'auto',  20, 0.850, 0.100, 0.030,  7, 0.800, 10, TRUE, FALSE ),

-- Slack notification send — one-way push, low stakes
( NULL, 'slack.notification_send',  'approve', 'auto',  15, 0.880, 0.080, 0.020,  7, 0.820, 10, TRUE, FALSE ),

-- Slack briefing send — structured digest message, low stakes
( NULL, 'slack.briefing_send',      'approve', 'auto',  15, 0.900, 0.050, 0.020,  7, 0.850, 10, TRUE, FALSE ),

-- Deal risk assessment — analysis output only, no CRM mutation
( NULL, 'analysis.risk_assessment', 'approve', 'auto',  20, 0.850, 0.100, 0.030,  7, 0.800, 10, TRUE, FALSE ),

-- Rep coaching feedback — analysis output only, no CRM mutation
( NULL, 'analysis.coaching_feedback','approve','auto',  20, 0.850, 0.100, 0.030,  7, 0.800, 10, TRUE, FALSE ),

-- ---------------------------------------------------------------------------
-- MEDIUM RISK  (25-30 signals, 14-21 days active)
-- CRM field mutations, contact enrichment, email drafts, and task assignment.
-- Errors are correctable but may confuse reps or create duplicate effort.
-- ---------------------------------------------------------------------------

-- Next steps text update — affects what reps see on their deal card
( NULL, 'crm.next_steps_update',      'approve', 'auto',  25, 0.880, 0.050, 0.020, 14, 0.850, 12, TRUE, FALSE ),

-- Generic deal field write — could affect reporting and forecasting
( NULL, 'crm.deal_field_update',      'approve', 'auto',  30, 0.900, 0.050, 0.020, 14, 0.880, 15, TRUE, FALSE ),

-- Contact data enrichment — overwrites existing contact attributes
( NULL, 'crm.contact_enrich',         'approve', 'auto',  25, 0.880, 0.060, 0.020, 14, 0.840, 12, TRUE, FALSE ),

-- Deal close date change — directly impacts forecast accuracy
( NULL, 'crm.deal_close_date_change', 'approve', 'auto',  30, 0.900, 0.050, 0.020, 14, 0.880, 12, TRUE, FALSE ),

-- Email draft save (not yet sent) — low external impact but touches comms
( NULL, 'email.draft_save',           'approve', 'auto',  20, 0.850, 0.080, 0.030,  7, 0.820, 10, TRUE, FALSE ),

-- Follow-up email send — external action; higher bar and longer window
( NULL, 'email.follow_up_send',       'approve', 'auto',  30, 0.920, 0.030, 0.020, 21, 0.900, 15, TRUE, FALSE ),

-- Check-in email send — external action; same high bar as follow-up
( NULL, 'email.check_in_send',        'approve', 'auto',  30, 0.920, 0.030, 0.020, 21, 0.900, 15, TRUE, FALSE ),

-- Task assignment to another rep — affects their workload and prioritisation
( NULL, 'task.assign',                'approve', 'auto',  25, 0.880, 0.060, 0.020, 14, 0.850, 12, TRUE, FALSE ),

-- ---------------------------------------------------------------------------
-- HIGH RISK  (40-50 signals, 30 days active)
-- Deal stage/amount changes, general email send, and calendar reschedule.
-- Errors have material pipeline, revenue, or relationship consequences.
-- ---------------------------------------------------------------------------

-- Deal stage advancement / regression — core pipeline mutation
( NULL, 'crm.deal_stage_change',  'approve', 'auto',  50, 0.950, 0.020, 0.010, 30, 0.930, 20, TRUE, FALSE ),

-- Deal amount edit — directly affects ARR and forecast numbers
( NULL, 'crm.deal_amount_change', 'approve', 'auto',  40, 0.950, 0.020, 0.010, 30, 0.930, 20, TRUE, FALSE ),

-- Arbitrary outbound email — highest external-communication risk
( NULL, 'email.send',             'approve', 'auto',  40, 0.950, 0.020, 0.010, 30, 0.920, 20, TRUE, FALSE ),

-- Calendar reschedule — disrupts both internal and external attendees
( NULL, 'calendar.reschedule',    'approve', 'auto',  40, 0.940, 0.030, 0.010, 30, 0.920, 18, TRUE, FALSE ),

-- ---------------------------------------------------------------------------
-- NEVER AUTO-PROMOTE
-- These action types must always remain in human-approval tier.
-- Rows are inserted as permanent policy records; the never_promote flag
-- prevents the promotion-queue job from ever proposing a tier change.
-- min_signals = 999 makes the numeric threshold unreachable as a secondary
-- safety net even if the flag were somehow bypassed.
-- ---------------------------------------------------------------------------

-- Sequence start — triggers a multi-step automated outreach campaign;
-- irreversible at the sequence level once contacts are enrolled
( NULL, 'sequence.start',        'approve', 'auto', 999, 0.999, 0.001, 0.001, 365, 0.999, 100, TRUE, TRUE ),

-- Calendar event creation — creates external calendar invites and
-- notifies attendees; cannot be silently undone
( NULL, 'calendar.create_event', 'approve', 'auto', 999, 0.999, 0.001, 0.001, 365, 0.999, 100, TRUE, TRUE )

ON CONFLICT ON CONSTRAINT uq_autopilot_thresholds DO NOTHING;

-- ---------------------------------------------------------------------------
-- Migration summary
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_total   INTEGER;
  v_low     INTEGER;
  v_medium  INTEGER;
  v_high    INTEGER;
  v_never   INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total
    FROM public.autopilot_thresholds
   WHERE org_id IS NULL;

  SELECT COUNT(*) INTO v_low
    FROM public.autopilot_thresholds
   WHERE org_id IS NULL
     AND action_type IN (
       'crm.note_add', 'crm.activity_log', 'task.create',
       'slack.notification_send', 'slack.briefing_send',
       'analysis.risk_assessment', 'analysis.coaching_feedback'
     );

  SELECT COUNT(*) INTO v_medium
    FROM public.autopilot_thresholds
   WHERE org_id IS NULL
     AND action_type IN (
       'crm.next_steps_update', 'crm.deal_field_update', 'crm.contact_enrich',
       'crm.deal_close_date_change', 'email.draft_save',
       'email.follow_up_send', 'email.check_in_send', 'task.assign'
     );

  SELECT COUNT(*) INTO v_high
    FROM public.autopilot_thresholds
   WHERE org_id IS NULL
     AND action_type IN (
       'crm.deal_stage_change', 'crm.deal_amount_change',
       'email.send', 'calendar.reschedule'
     );

  SELECT COUNT(*) INTO v_never
    FROM public.autopilot_thresholds
   WHERE org_id IS NULL
     AND never_promote = TRUE;

  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260226300001_autopilot_thresholds_seed.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'AP-006: Platform default autopilot_thresholds seeded';
  RAISE NOTICE '';
  RAISE NOTICE 'Platform defaults in table (org_id IS NULL): %', v_total;
  RAISE NOTICE '  LOW RISK   (7 rows):  %', v_low;
  RAISE NOTICE '  MEDIUM RISK (8 rows): %', v_medium;
  RAISE NOTICE '  HIGH RISK  (4 rows):  %', v_high;
  RAISE NOTICE '  NEVER PROMOTE (2 rows, never_promote=TRUE): %', v_never;
  RAISE NOTICE '';
  RAISE NOTICE 'All rows: from_tier=approve, to_tier=auto, enabled=TRUE';
  RAISE NOTICE 'Idempotent: existing rows skipped via ON CONFLICT DO NOTHING';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
