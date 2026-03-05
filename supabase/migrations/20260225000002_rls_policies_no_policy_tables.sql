-- =============================================================================
-- Add RLS policies for tables with RLS enabled but no policies
-- (Supabase lint 0008: rls_enabled_no_policy)
-- =============================================================================
-- Strategy per table:
--   Reference/lookup tables     → SELECT for authenticated (read-only, no user data)
--   User-owned tables           → full CRUD scoped to auth.uid()
--   Service/workflow-internal   → USING (false) deny-all for anon+authenticated
--                                 (service_role bypasses RLS so edge functions work)
-- =============================================================================


-- ─── Reference / lookup tables ───────────────────────────────────────────────
-- No user-specific data. All authenticated users can read.

CREATE POLICY "authenticated users can read booking_sources"
  ON public.booking_sources FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated users can read lead_sources"
  ON public.lead_sources FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated users can read internal_email_domains"
  ON public.internal_email_domains FOR SELECT
  TO authenticated
  USING (true);


-- ─── User-owned tables ────────────────────────────────────────────────────────

-- google_tasks_sync_conflicts: user_id column
CREATE POLICY "users can manage their own google_tasks_sync_conflicts"
  ON public.google_tasks_sync_conflicts FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- fathom_oauth_states: user_id column (ephemeral OAuth state, own records only)
CREATE POLICY "users can manage their own fathom_oauth_states"
  ON public.fathom_oauth_states FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- user_profiles: id IS the user's uuid
CREATE POLICY "users can read and update their own user_profile"
  ON public.user_profiles FOR ALL
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- automation_executions: executed_by column (users can read their own runs)
CREATE POLICY "users can read their own automation_executions"
  ON public.automation_executions FOR SELECT
  TO authenticated
  USING (executed_by = auth.uid());


-- ─── google_task_lists ────────────────────────────────────────────────────────
-- No direct user_id column (linked via integration_id). Managed entirely by
-- edge functions via service_role. Deny direct access from PostgREST.

CREATE POLICY "no direct access to google_task_lists"
  ON public.google_task_lists FOR ALL
  TO authenticated, anon
  USING (false);


-- ─── Workflow engine internal tables (deny all) ───────────────────────────────
-- All workflow tables are written and read exclusively by edge functions using
-- service_role, which bypasses RLS. These policies block direct PostgREST access.

CREATE POLICY "service only: variable_storage"
  ON public.variable_storage FOR ALL TO authenticated, anon USING (false);

CREATE POLICY "service only: execution_checkpoints"
  ON public.execution_checkpoints FOR ALL TO authenticated, anon USING (false);

CREATE POLICY "service only: execution_snapshots"
  ON public.execution_snapshots FOR ALL TO authenticated, anon USING (false);

CREATE POLICY "service only: node_executions"
  ON public.node_executions FOR ALL TO authenticated, anon USING (false);

CREATE POLICY "service only: node_fixtures"
  ON public.node_fixtures FOR ALL TO authenticated, anon USING (false);

CREATE POLICY "service only: scenario_fixtures"
  ON public.scenario_fixtures FOR ALL TO authenticated, anon USING (false);

CREATE POLICY "service only: workflow_batch_windows"
  ON public.workflow_batch_windows FOR ALL TO authenticated, anon USING (false);

CREATE POLICY "service only: workflow_circuit_breakers"
  ON public.workflow_circuit_breakers FOR ALL TO authenticated, anon USING (false);

CREATE POLICY "service only: workflow_contracts"
  ON public.workflow_contracts FOR ALL TO authenticated, anon USING (false);

CREATE POLICY "service only: workflow_dead_letter_queue"
  ON public.workflow_dead_letter_queue FOR ALL TO authenticated, anon USING (false);

CREATE POLICY "service only: workflow_environment_promotions"
  ON public.workflow_environment_promotions FOR ALL TO authenticated, anon USING (false);

CREATE POLICY "service only: workflow_environments"
  ON public.workflow_environments FOR ALL TO authenticated, anon USING (false);

CREATE POLICY "service only: workflow_idempotency_keys"
  ON public.workflow_idempotency_keys FOR ALL TO authenticated, anon USING (false);

CREATE POLICY "service only: workflow_rate_limits"
  ON public.workflow_rate_limits FOR ALL TO authenticated, anon USING (false);

CREATE POLICY "service only: http_request_recordings"
  ON public.http_request_recordings FOR ALL TO authenticated, anon USING (false);
