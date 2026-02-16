-- Update proactive-meeting-prep cron from daily (7 AM UTC) to every 30 minutes.
-- This ensures meetings booked throughout the day get pre-meeting briefs,
-- not just those visible at the 7 AM sweep.

SELECT cron.unschedule('proactive-meeting-prep');

SELECT cron.schedule(
  'proactive-meeting-prep',
  '*/30 * * * *',
  $$SELECT public.cron_proactive_meeting_prep()$$
);
