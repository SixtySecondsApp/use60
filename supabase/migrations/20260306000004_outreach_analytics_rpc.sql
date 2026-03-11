-- ============================================================
-- Outreach Analytics Aggregation — OUT-007
-- ============================================================
-- RPC: get_outreach_rep_activity + get_outreach_sync_summary
-- These functions depend on agent_daily_logs.metrics and
-- instantly_sync_history columns that may not exist on all envs.
-- Wrapped in exception handlers to avoid blocking other migrations.
-- ============================================================

DO $$
BEGIN
  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION get_outreach_rep_activity(
      p_org_id   UUID,
      p_period   TEXT DEFAULT '30d'
    )
    RETURNS TABLE (
      user_id        UUID,
      display_name   TEXT,
      emails_sent    BIGINT,
      meetings_booked BIGINT,
      tasks_completed BIGINT,
      log_date       DATE
    )
    LANGUAGE sql
    STABLE
    AS $body$
      SELECT
        adl.user_id,
        COALESCE(u.raw_user_meta_data->>'full_name', u.email, 'Unknown') AS display_name,
        COALESCE(SUM((adl.metrics->>'emails_sent')::int), 0)            AS emails_sent,
        COALESCE(SUM((adl.metrics->>'meetings_booked')::int), 0)        AS meetings_booked,
        COALESCE(SUM((adl.metrics->>'tasks_completed')::int), 0)        AS tasks_completed,
        adl.log_date
      FROM agent_daily_logs adl
      JOIN auth.users u ON u.id = adl.user_id
      WHERE adl.org_id = p_org_id
        AND adl.log_date >= CURRENT_DATE - (
          CASE p_period
            WHEN '7d'  THEN INTERVAL '7 days'
            WHEN '90d' THEN INTERVAL '90 days'
            ELSE            INTERVAL '30 days'
          END
        )
      GROUP BY adl.user_id, u.raw_user_meta_data, u.email, adl.log_date
      ORDER BY adl.log_date DESC, emails_sent DESC;
    $body$;
  $fn$;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'get_outreach_rep_activity skipped: %', SQLERRM;
END;
$$;

DO $$
BEGIN
  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION get_outreach_sync_summary(
      p_org_id   UUID,
      p_period   TEXT DEFAULT '30d'
    )
    RETURNS TABLE (
      campaign_id          TEXT,
      total_pushed         BIGINT,
      total_matched        BIGINT,
      sync_count           BIGINT,
      last_sync_at         TIMESTAMPTZ
    )
    LANGUAGE sql
    STABLE
    AS $body$
      SELECT
        ish.campaign_id,
        COALESCE(SUM(ish.pushed_leads_count), 0)   AS total_pushed,
        COALESCE(SUM(ish.updated_leads_count), 0)  AS total_matched,
        COUNT(*)                                    AS sync_count,
        MAX(ish.synced_at)                          AS last_sync_at
      FROM instantly_sync_history ish
      JOIN instantly_campaign_links icl ON icl.campaign_id = ish.campaign_id
      WHERE icl.org_id = p_org_id
        AND ish.synced_at >= NOW() - (
          CASE p_period
            WHEN '7d'  THEN INTERVAL '7 days'
            WHEN '90d' THEN INTERVAL '90 days'
            ELSE            INTERVAL '30 days'
          END
        )
      GROUP BY ish.campaign_id
      ORDER BY last_sync_at DESC;
    $body$;
  $fn$;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'get_outreach_sync_summary skipped: %', SQLERRM;
END;
$$;
