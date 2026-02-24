-- Fix pg_cron jobs to include x-cron-secret header
-- Run this in your Supabase SQL Editor (production project: ygdpgliavpxeugaajgrb)

-- First, let's see what cron jobs exist:
SELECT jobid, jobname, schedule, command
FROM cron.job
WHERE command LIKE '%sync-savvycal-events%' OR command LIKE '%scheduled-encharge-emails%';

-- Update sync-savvycal-events cron job to include x-cron-secret header
-- Find the jobid from the query above, then run:
/*
SELECT cron.unschedule(<jobid>);

SELECT cron.schedule(
  'sync-savvycal-events',
  '*/15 * * * *',  -- Every 15 minutes
  $$
  SELECT
    net.http_post(
      url := 'https://ygdpgliavpxeugaajgrb.supabase.co/functions/v1/sync-savvycal-events?since_hours=5',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', current_setting('app.settings.cron_secret', true)
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);
*/

-- Update scheduled-encharge-emails cron job to include x-cron-secret header
/*
SELECT cron.unschedule(<jobid>);

SELECT cron.schedule(
  'scheduled-encharge-emails',
  '0 * * * *',  -- Every hour
  $$
  SELECT
    net.http_post(
      url := 'https://ygdpgliavpxeugaajgrb.supabase.co/functions/v1/scheduled-encharge-emails',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', current_setting('app.settings.cron_secret', true)
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);
*/

-- IMPORTANT: You need to set the cron_secret in your database settings:
-- ALTER DATABASE postgres SET app.settings.cron_secret = '5e57be144fe95263a09312206e60b467db91a2297f01528ee72d60b400e258f8';
-- SELECT pg_reload_conf();
