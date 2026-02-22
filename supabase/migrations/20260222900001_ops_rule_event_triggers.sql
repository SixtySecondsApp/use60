-- Migration: AQF-003 — DB triggers to invoke evaluate-ops-rule on cell/row events
-- Date: 2026-02-22
--
-- Purpose:
--   Install AFTER INSERT/UPDATE triggers on dynamic_table_cells (cell_updated)
--   and AFTER INSERT on dynamic_table_rows (row_created) that asynchronously
--   call the evaluate-ops-rule edge function via pg_net for every enabled rule
--   on the affected table.
--
-- Design decisions:
--   - One pg_net.http_post call per matching rule (fan-out in the trigger).
--   - Lightweight DB-level debounce: a small tracking table stores
--     (rule_id, row_id, last_fired_at) and skips the HTTP call if
--     last_fired_at is within 5 seconds. The edge function also has its
--     own 60-second debounce for safety.
--   - Service role key read from Vault (name = 'service_role_key'),
--     consistent with other pg_net trigger functions in this codebase.
--   - Supabase project URL read from Vault (name = 'supabase_url').
--     Fallback: derived from current_database() using the project-ref pattern.
--   - Trigger functions are SECURITY DEFINER so they can query ops_rules and
--     the debounce table without RLS interference.
--   - pg_net calls are non-blocking (fire-and-forget); exceptions are caught
--     and logged as WARNINGs so they never block the originating DML.
--
-- Prerequisites:
--   - pg_net extension enabled (already present in this project)
--   - Vault secret 'service_role_key' set
--   - Vault secret 'supabase_url' set (optional but recommended)

-- =============================================================================
-- 1. Debounce tracking table
--    Tracks the last time a (rule_id, row_id) pair triggered an HTTP call.
--    Rows are upserted on each trigger fire; old rows can be vacuumed freely.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ops_rule_trigger_debounce (
  rule_id      UUID NOT NULL REFERENCES public.ops_rules(id) ON DELETE CASCADE,
  row_id       UUID NOT NULL REFERENCES public.dynamic_table_rows(id) ON DELETE CASCADE,
  last_fired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (rule_id, row_id)
);

COMMENT ON TABLE public.ops_rule_trigger_debounce IS
'Lightweight debounce tracker for ops rule DB triggers. Stores the last time
each (rule_id, row_id) pair fired an HTTP call to evaluate-ops-rule. Rows older
than the debounce window are effectively stale and will be overwritten on the
next trigger fire.';

CREATE INDEX IF NOT EXISTS idx_ops_rule_trigger_debounce_fired
  ON public.ops_rule_trigger_debounce(last_fired_at);

-- Service role can read/write this table (trigger runs as SECURITY DEFINER)
ALTER TABLE public.ops_rule_trigger_debounce ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_manage_debounce"
  ON public.ops_rule_trigger_debounce
  FOR ALL
  USING (auth.role() = 'service_role');

-- =============================================================================
-- 2. Shared helper: read credentials from Vault
--    Returns (supabase_url, service_role_key) or NULLs if not found.
--    Defined separately so both trigger functions share the same logic.
-- =============================================================================

CREATE OR REPLACE FUNCTION public._ops_trigger_get_credentials(
  OUT p_url  text,
  OUT p_key  text
)
RETURNS record
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault', 'extensions'
AS $$
BEGIN
  -- Try Vault for the project URL first
  BEGIN
    SELECT decrypted_secret INTO p_url
    FROM vault.decrypted_secrets
    WHERE name = 'supabase_url'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    p_url := NULL;
  END;

  -- Fall back: derive URL from database name (works for hosted Supabase projects)
  IF p_url IS NULL OR p_url = '' THEN
    p_url := 'https://' || current_database() || '.supabase.co';
  END IF;

  -- Service role key from Vault
  BEGIN
    SELECT decrypted_secret INTO p_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    p_key := NULL;
  END;
END;
$$;

COMMENT ON FUNCTION public._ops_trigger_get_credentials() IS
'Internal helper used by ops rule trigger functions. Reads supabase_url and
service_role_key from Vault. Falls back to deriving the URL from current_database().';

-- =============================================================================
-- 3. Trigger function: cell_updated rules
--    Fires AFTER INSERT OR UPDATE on dynamic_table_cells.
--
--    Logic:
--      a) Resolve the parent table_id from the row.
--      b) Find all enabled ops_rules with trigger_type = 'cell_updated' for
--         that table.
--      c) For each rule: check debounce (5-second window).
--      d) If not debounced: upsert debounce row + fire pg_net HTTP POST.
--
--    The changed_column_key is resolved by joining dynamic_table_columns so the
--    edge function can apply column-specific condition checks immediately.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trigger_ops_rules_cell_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'net', 'vault', 'extensions'
AS $$
DECLARE
  v_table_id      UUID;
  v_column_key    TEXT;
  v_url           TEXT;
  v_key           TEXT;
  v_creds         record;
  v_rule          record;
  v_debounce_secs CONSTANT int := 5;
  v_cutoff        TIMESTAMPTZ;
  v_last_fired    TIMESTAMPTZ;
  v_request_id    bigint;
BEGIN
  -- Resolve table_id from the parent row (cells don't store table_id directly)
  SELECT table_id INTO v_table_id
  FROM public.dynamic_table_rows
  WHERE id = NEW.row_id;

  IF v_table_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve column key for changed_column_key payload field
  SELECT key INTO v_column_key
  FROM public.dynamic_table_columns
  WHERE id = NEW.column_id;

  -- Skip if column is not found (should not happen, but be safe)
  IF v_column_key IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check for any enabled cell_updated rules on this table before fetching creds
  IF NOT EXISTS (
    SELECT 1 FROM public.ops_rules
    WHERE table_id = v_table_id
      AND trigger_type = 'cell_updated'
      AND is_enabled = true
  ) THEN
    RETURN NEW;
  END IF;

  -- Fetch credentials (only if we have rules to fire)
  SELECT * INTO v_creds FROM public._ops_trigger_get_credentials();
  v_url := v_creds.p_url;
  v_key := v_creds.p_key;

  IF v_key IS NULL THEN
    RAISE WARNING '[ops-rule-trigger] service_role_key not found in Vault; skipping cell_updated trigger for row %', NEW.row_id;
    RETURN NEW;
  END IF;

  v_cutoff := now() - (v_debounce_secs || ' seconds')::interval;

  -- Iterate enabled cell_updated rules for this table
  FOR v_rule IN
    SELECT id
    FROM public.ops_rules
    WHERE table_id = v_table_id
      AND trigger_type = 'cell_updated'
      AND is_enabled = true
  LOOP
    BEGIN
      -- Debounce check: did this (rule, row) fire within the last 5 seconds?
      SELECT last_fired_at INTO v_last_fired
      FROM public.ops_rule_trigger_debounce
      WHERE rule_id = v_rule.id AND row_id = NEW.row_id;

      IF v_last_fired IS NOT NULL AND v_last_fired > v_cutoff THEN
        -- Within debounce window — skip
        CONTINUE;
      END IF;

      -- Update debounce timestamp (upsert)
      INSERT INTO public.ops_rule_trigger_debounce(rule_id, row_id, last_fired_at)
      VALUES (v_rule.id, NEW.row_id, now())
      ON CONFLICT (rule_id, row_id) DO UPDATE
        SET last_fired_at = EXCLUDED.last_fired_at;

      -- Fire async HTTP POST to evaluate-ops-rule edge function
      SELECT net.http_post(
        url     := v_url || '/functions/v1/evaluate-ops-rule',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || v_key
        ),
        body    := jsonb_build_object(
          'rule_id',            v_rule.id,
          'row_id',             NEW.row_id,
          'trigger_type',       'cell_updated',
          'changed_column_key', v_column_key
        ),
        timeout_milliseconds := 5000
      ) INTO v_request_id;

      RAISE LOG '[ops-rule-trigger] cell_updated: queued rule % for row %, request_id %',
        v_rule.id, NEW.row_id, v_request_id;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[ops-rule-trigger] cell_updated: failed to queue rule % for row %: %',
        v_rule.id, NEW.row_id, SQLERRM;
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trigger_ops_rules_cell_updated() IS
'Trigger function: fires after INSERT/UPDATE on dynamic_table_cells.
For each enabled ops_rule with trigger_type = ''cell_updated'' on the affected
table, applies a 5-second debounce and then calls evaluate-ops-rule via
pg_net (non-blocking). Uses service_role_key from Vault for auth.';

-- =============================================================================
-- 4. Trigger function: row_created rules
--    Fires AFTER INSERT on dynamic_table_rows.
--
--    Logic:
--      a) Find all enabled ops_rules with trigger_type = 'row_created' for
--         the table.
--      b) For each rule: check debounce (5-second window).
--      c) If not debounced: upsert debounce row + fire pg_net HTTP POST.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trigger_ops_rules_row_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'net', 'vault', 'extensions'
AS $$
DECLARE
  v_url           TEXT;
  v_key           TEXT;
  v_creds         record;
  v_rule          record;
  v_debounce_secs CONSTANT int := 5;
  v_cutoff        TIMESTAMPTZ;
  v_last_fired    TIMESTAMPTZ;
  v_request_id    bigint;
BEGIN
  -- Check for any enabled row_created rules on this table before fetching creds
  IF NOT EXISTS (
    SELECT 1 FROM public.ops_rules
    WHERE table_id = NEW.table_id
      AND trigger_type = 'row_created'
      AND is_enabled = true
  ) THEN
    RETURN NEW;
  END IF;

  -- Fetch credentials
  SELECT * INTO v_creds FROM public._ops_trigger_get_credentials();
  v_url := v_creds.p_url;
  v_key := v_creds.p_key;

  IF v_key IS NULL THEN
    RAISE WARNING '[ops-rule-trigger] service_role_key not found in Vault; skipping row_created trigger for row %', NEW.id;
    RETURN NEW;
  END IF;

  v_cutoff := now() - (v_debounce_secs || ' seconds')::interval;

  -- Iterate enabled row_created rules for this table
  FOR v_rule IN
    SELECT id
    FROM public.ops_rules
    WHERE table_id = NEW.table_id
      AND trigger_type = 'row_created'
      AND is_enabled = true
  LOOP
    BEGIN
      -- Debounce check
      SELECT last_fired_at INTO v_last_fired
      FROM public.ops_rule_trigger_debounce
      WHERE rule_id = v_rule.id AND row_id = NEW.id;

      IF v_last_fired IS NOT NULL AND v_last_fired > v_cutoff THEN
        CONTINUE;
      END IF;

      -- Update debounce timestamp (upsert)
      INSERT INTO public.ops_rule_trigger_debounce(rule_id, row_id, last_fired_at)
      VALUES (v_rule.id, NEW.id, now())
      ON CONFLICT (rule_id, row_id) DO UPDATE
        SET last_fired_at = EXCLUDED.last_fired_at;

      -- Fire async HTTP POST to evaluate-ops-rule edge function
      SELECT net.http_post(
        url     := v_url || '/functions/v1/evaluate-ops-rule',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || v_key
        ),
        body    := jsonb_build_object(
          'rule_id',      v_rule.id,
          'row_id',       NEW.id,
          'trigger_type', 'row_created'
        ),
        timeout_milliseconds := 5000
      ) INTO v_request_id;

      RAISE LOG '[ops-rule-trigger] row_created: queued rule % for row %, request_id %',
        v_rule.id, NEW.id, v_request_id;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[ops-rule-trigger] row_created: failed to queue rule % for row %: %',
        v_rule.id, NEW.id, SQLERRM;
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trigger_ops_rules_row_created() IS
'Trigger function: fires after INSERT on dynamic_table_rows.
For each enabled ops_rule with trigger_type = ''row_created'' on the new row''s
table, applies a 5-second debounce and then calls evaluate-ops-rule via
pg_net (non-blocking). Uses service_role_key from Vault for auth.';

-- =============================================================================
-- 5. Install triggers
-- =============================================================================

-- cell_updated: fires on INSERT and UPDATE of dynamic_table_cells
DROP TRIGGER IF EXISTS trigger_ops_rules_on_cell_change ON public.dynamic_table_cells;

CREATE TRIGGER trigger_ops_rules_on_cell_change
  AFTER INSERT OR UPDATE
  ON public.dynamic_table_cells
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_ops_rules_cell_updated();

COMMENT ON TRIGGER trigger_ops_rules_on_cell_change ON public.dynamic_table_cells IS
'Fires trigger_ops_rules_cell_updated() after each cell INSERT or UPDATE.
Fans out to evaluate-ops-rule via pg_net for each enabled cell_updated rule
on the affected table.';

-- row_created: fires on INSERT of dynamic_table_rows
DROP TRIGGER IF EXISTS trigger_ops_rules_on_row_insert ON public.dynamic_table_rows;

CREATE TRIGGER trigger_ops_rules_on_row_insert
  AFTER INSERT
  ON public.dynamic_table_rows
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_ops_rules_row_created();

COMMENT ON TRIGGER trigger_ops_rules_on_row_insert ON public.dynamic_table_rows IS
'Fires trigger_ops_rules_row_created() after each row INSERT.
Fans out to evaluate-ops-rule via pg_net for each enabled row_created rule
on the affected table.';

-- =============================================================================
-- 6. Grant execute permissions
-- =============================================================================

GRANT EXECUTE ON FUNCTION public._ops_trigger_get_credentials() TO service_role;
GRANT EXECUTE ON FUNCTION public.trigger_ops_rules_cell_updated() TO service_role;
GRANT EXECUTE ON FUNCTION public.trigger_ops_rules_row_created() TO service_role;

-- =============================================================================
NOTIFY pgrst, 'reload schema';
