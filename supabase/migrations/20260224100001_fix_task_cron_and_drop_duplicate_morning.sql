-- SLKPRO-003: Change proactive-task-analysis from every 4 hours to once daily (9 AM UTC, weekdays)
-- SLKPRO-004: Drop duplicate enhanced-morning-briefing cron (slack-morning-brief handles this via polling)

-- ============================================================================
-- Fix task analysis cron: 0 */4 * * * → 0 9 * * 1-5
-- ============================================================================

-- Unschedule the old every-4-hours job
SELECT cron.unschedule('proactive-task-analysis');

-- Re-register with daily weekday schedule (9 AM UTC)
SELECT cron.schedule(
  'proactive-task-analysis',
  '0 9 * * 1-5',
  $$SELECT public.call_proactive_edge_function('proactive-task-analysis')$$
);

-- ============================================================================
-- Drop duplicate morning briefing cron
-- ============================================================================
-- The enhanced-morning-briefing cron (08:00 UTC Mon-Fri) duplicates
-- slack-morning-brief which uses 15-minute polling with per-user preferred times.
-- This causes duplicate morning briefings at 8 AM.

SELECT cron.unschedule('enhanced-morning-briefing');
