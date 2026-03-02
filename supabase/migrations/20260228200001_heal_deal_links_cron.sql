-- HEAL-003: Schedule nightly heal-deal-links cron job
-- Runs daily at 03:00 UTC to resolve missing contact/company links on active deals

SELECT cron.schedule(
  'heal-deal-links-nightly',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := get_system_config('supabase_url') || '/functions/v1/heal-deal-links',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || get_system_config('service_role_key')
    ),
    body := '{}'::jsonb
  )
  $$
);
