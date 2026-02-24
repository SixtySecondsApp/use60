-- =============================================================================
-- Security RLS Audit Fixes
-- Addresses: tables without RLS, tables with RLS but no policies
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PART 1: Enable RLS on tables that lack it (4 tables)
-- -----------------------------------------------------------------------------

ALTER TABLE public.action_trust_score_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reengagement_log ENABLE ROW LEVEL SECURITY;

-- action_trust_score_defaults: read-only config, authenticated can read
CREATE POLICY "action_trust_score_defaults_read"
  ON public.action_trust_score_defaults FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "action_trust_score_defaults_service_all"
  ON public.action_trust_score_defaults FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- api_usage_alerts, api_usage_snapshots: platform admin / service only
CREATE POLICY "api_usage_alerts_service_all"
  ON public.api_usage_alerts FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "api_usage_alerts_admin_read"
  ON public.api_usage_alerts FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "api_usage_snapshots_service_all"
  ON public.api_usage_snapshots FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "api_usage_snapshots_admin_read"
  ON public.api_usage_snapshots FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- reengagement_log: user/org scoped
CREATE POLICY "reengagement_log_select"
  ON public.reengagement_log FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.org_id = reengagement_log.org_id AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "reengagement_log_insert"
  ON public.reengagement_log FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.org_id = reengagement_log.org_id AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "reengagement_log_service_all"
  ON public.reengagement_log FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- PART 2: Add policies to tables with RLS but no policies (25 tables)
-- -----------------------------------------------------------------------------

-- automation_executions: workflow internal, service only
CREATE POLICY "automation_executions_service"
  ON public.automation_executions FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- booking_sources: SavvyCal, service only (app uses service role for sync)
CREATE POLICY "booking_sources_service"
  ON public.booking_sources FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- cron_job_logs: service + admin read
CREATE POLICY "cron_job_logs_service_all"
  ON public.cron_job_logs FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "cron_job_logs_admin_read"
  ON public.cron_job_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- execution_checkpoints, execution_snapshots: workflow internal, service only
CREATE POLICY "execution_checkpoints_service"
  ON public.execution_checkpoints FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "execution_snapshots_service"
  ON public.execution_snapshots FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- fathom_oauth_states: user/org scoped, short-lived
CREATE POLICY "fathom_oauth_states_select"
  ON public.fathom_oauth_states FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR can_access_org_data(org_id));

CREATE POLICY "fathom_oauth_states_insert"
  ON public.fathom_oauth_states FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "fathom_oauth_states_delete"
  ON public.fathom_oauth_states FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "fathom_oauth_states_service"
  ON public.fathom_oauth_states FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- google_task_lists: service only (sync via edge functions)
CREATE POLICY "google_task_lists_service"
  ON public.google_task_lists FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- google_tasks_sync_conflicts: user scoped
CREATE POLICY "google_tasks_sync_conflicts_service"
  ON public.google_tasks_sync_conflicts FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "google_tasks_sync_conflicts_user"
  ON public.google_tasks_sync_conflicts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- http_request_recordings: internal/debug, service + admin only
CREATE POLICY "http_request_recordings_service"
  ON public.http_request_recordings FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "http_request_recordings_admin_read"
  ON public.http_request_recordings FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- internal_email_domains: read for authenticated (config)
CREATE POLICY "internal_email_domains_read"
  ON public.internal_email_domains FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "internal_email_domains_service"
  ON public.internal_email_domains FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- lead_sources: service only
CREATE POLICY "lead_sources_service"
  ON public.lead_sources FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- node_executions, node_fixtures, scenario_fixtures: workflow/test, service only
CREATE POLICY "node_executions_service"
  ON public.node_executions FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "node_fixtures_service"
  ON public.node_fixtures FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "scenario_fixtures_service"
  ON public.scenario_fixtures FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- user_profiles: user can read/update own
CREATE POLICY "user_profiles_select"
  ON public.user_profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "user_profiles_update"
  ON public.user_profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "user_profiles_service"
  ON public.user_profiles FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- variable_storage: workflow, service only
CREATE POLICY "variable_storage_service"
  ON public.variable_storage FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- workflow_* tables: service only
CREATE POLICY "workflow_batch_windows_service"
  ON public.workflow_batch_windows FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "workflow_circuit_breakers_service"
  ON public.workflow_circuit_breakers FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "workflow_contracts_service"
  ON public.workflow_contracts FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "workflow_dead_letter_queue_service"
  ON public.workflow_dead_letter_queue FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "workflow_environment_promotions_service"
  ON public.workflow_environment_promotions FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "workflow_environments_service"
  ON public.workflow_environments FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "workflow_idempotency_keys_service"
  ON public.workflow_idempotency_keys FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "workflow_rate_limits_service"
  ON public.workflow_rate_limits FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
