-- ============================================================
-- Migration: system_logs
-- Purpose:   Structured observability log table for tracing
--            requests across edge functions and agents.
--            Supports distributed tracing (trace_id/span_id),
--            per-service/action filtering, and platform-admin
--            visibility into all org logs.
-- Story:     OBS-001
-- Date:      2026-02-22
-- ============================================================

-- ============================================================
-- 1. TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS system_logs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id       UUID        NOT NULL,
  span_id        UUID        NOT NULL,
  parent_span_id UUID,
  timestamp      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  service        TEXT        NOT NULL,
  action         TEXT        NOT NULL,
  level          TEXT        NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  user_id        UUID        REFERENCES auth.users (id) ON DELETE SET NULL,
  org_id         UUID        REFERENCES organizations (id) ON DELETE SET NULL,
  agent_name     TEXT,
  duration_ms    INTEGER,
  metadata       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  error_message  TEXT
);

-- ============================================================
-- 2. INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS system_logs_trace_id_idx
  ON system_logs (trace_id);

CREATE INDEX IF NOT EXISTS system_logs_timestamp_idx
  ON system_logs (timestamp);

CREATE INDEX IF NOT EXISTS system_logs_service_idx
  ON system_logs (service);

CREATE INDEX IF NOT EXISTS system_logs_action_idx
  ON system_logs (action);

CREATE INDEX IF NOT EXISTS system_logs_level_idx
  ON system_logs (level);

CREATE INDEX IF NOT EXISTS system_logs_user_id_idx
  ON system_logs (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS system_logs_org_id_idx
  ON system_logs (org_id)
  WHERE org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS system_logs_agent_name_idx
  ON system_logs (agent_name)
  WHERE agent_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS system_logs_metadata_gin_idx
  ON system_logs USING GIN (metadata);

-- ============================================================
-- 3. RLS
-- ============================================================

ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;

-- Service role can insert logs (edge functions write observability data)
DROP POLICY IF EXISTS "service_role_insert_system_logs" ON system_logs;
CREATE POLICY "service_role_insert_system_logs"
  ON system_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Org members can select logs belonging to their organisation
DROP POLICY IF EXISTS "org_members_select_system_logs" ON system_logs;
CREATE POLICY "org_members_select_system_logs"
  ON system_logs
  FOR SELECT
  TO authenticated
  USING (
    org_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM organization_memberships
      WHERE org_id = system_logs.org_id
        AND user_id = auth.uid()
    )
  );

-- Platform admins can select all logs
DROP POLICY IF EXISTS "platform_admins_select_all_system_logs" ON system_logs;
CREATE POLICY "platform_admins_select_all_system_logs"
  ON system_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE id = auth.uid()
        AND is_admin = true
    )
  );

-- ============================================================
-- 4. COMMENTS
-- ============================================================

COMMENT ON TABLE system_logs IS
  'Structured observability log for distributed tracing across edge functions and agents. '
  'Each row is a single log event within a trace (identified by trace_id) and span (span_id). '
  'Supports OpenTelemetry-style parent/child span relationships via parent_span_id.';

COMMENT ON COLUMN system_logs.trace_id IS
  'Groups all log events belonging to a single end-to-end request (e.g. one copilot message).';

COMMENT ON COLUMN system_logs.span_id IS
  'Unique identifier for this individual unit of work within the trace.';

COMMENT ON COLUMN system_logs.parent_span_id IS
  'Span that spawned this one, enabling tree-shaped trace visualisation. NULL for root spans.';

COMMENT ON COLUMN system_logs.service IS
  'Edge function or service that emitted this log, e.g. ''copilot-autonomous'', ''route-message'', ''fleet-health''.';

COMMENT ON COLUMN system_logs.action IS
  'Specific operation being logged, e.g. ''resolve_model'', ''route_message'', ''execute_skill''.';

COMMENT ON COLUMN system_logs.level IS
  'Severity level: debug | info | warn | error.';

COMMENT ON COLUMN system_logs.agent_name IS
  'When logged by an autonomous agent, the agent identifier (e.g. ''copilot'', ''workflow-runner'').';

COMMENT ON COLUMN system_logs.duration_ms IS
  'Wall-clock time in milliseconds for the operation represented by this span. NULL if not measured.';

COMMENT ON COLUMN system_logs.metadata IS
  'Arbitrary structured data attached to the log event (request params, response summaries, token counts, etc.).';

COMMENT ON COLUMN system_logs.error_message IS
  'Human-readable error description when level = ''error''. NULL for non-error events.';
