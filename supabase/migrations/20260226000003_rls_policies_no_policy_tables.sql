-- =============================================================================
-- Add RLS policies for tables with RLS enabled but no policies
-- (Supabase lint 0008: rls_enabled_no_policy)
-- Ported from 20260225000002 (timestamp conflict with production)
-- =============================================================================
-- All CREATE POLICY wrapped in DO blocks with duplicate_object exception
-- so this migration is idempotent and safe to re-run.
-- =============================================================================

-- ─── Reference / lookup tables ───────────────────────────────────────────────

DO $$ BEGIN
  CREATE POLICY "authenticated users can read booking_sources"
    ON public.booking_sources FOR SELECT
    TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "authenticated users can read lead_sources"
    ON public.lead_sources FOR SELECT
    TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "authenticated users can read internal_email_domains"
    ON public.internal_email_domains FOR SELECT
    TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── User-owned tables ────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE POLICY "users can manage their own google_tasks_sync_conflicts"
    ON public.google_tasks_sync_conflicts FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "users can manage their own fathom_oauth_states"
    ON public.fathom_oauth_states FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "users can read and update their own user_profile"
    ON public.user_profiles FOR ALL
    TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "users can read their own automation_executions"
    ON public.automation_executions FOR SELECT
    TO authenticated
    USING (executed_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── google_task_lists ────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE POLICY "no direct access to google_task_lists"
    ON public.google_task_lists FOR ALL
    TO authenticated, anon
    USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Workflow engine internal tables (deny all) ───────────────────────────────

DO $$ BEGIN
  CREATE POLICY "service only: variable_storage"
    ON public.variable_storage FOR ALL TO authenticated, anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service only: execution_checkpoints"
    ON public.execution_checkpoints FOR ALL TO authenticated, anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service only: execution_snapshots"
    ON public.execution_snapshots FOR ALL TO authenticated, anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service only: node_executions"
    ON public.node_executions FOR ALL TO authenticated, anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service only: node_fixtures"
    ON public.node_fixtures FOR ALL TO authenticated, anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service only: scenario_fixtures"
    ON public.scenario_fixtures FOR ALL TO authenticated, anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service only: workflow_batch_windows"
    ON public.workflow_batch_windows FOR ALL TO authenticated, anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service only: workflow_circuit_breakers"
    ON public.workflow_circuit_breakers FOR ALL TO authenticated, anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service only: workflow_contracts"
    ON public.workflow_contracts FOR ALL TO authenticated, anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service only: workflow_dead_letter_queue"
    ON public.workflow_dead_letter_queue FOR ALL TO authenticated, anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service only: workflow_environment_promotions"
    ON public.workflow_environment_promotions FOR ALL TO authenticated, anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service only: workflow_environments"
    ON public.workflow_environments FOR ALL TO authenticated, anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service only: workflow_idempotency_keys"
    ON public.workflow_idempotency_keys FOR ALL TO authenticated, anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service only: workflow_rate_limits"
    ON public.workflow_rate_limits FOR ALL TO authenticated, anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service only: http_request_recordings"
    ON public.http_request_recordings FOR ALL TO authenticated, anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
