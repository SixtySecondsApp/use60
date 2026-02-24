-- ============================================================================
-- Migration: Command Centre RPC Functions
-- Purpose: Helper RPCs for inserting, updating, and querying command_centre_items.
--          Used by proactive agents (morning brief, reengagement, pipeline
--          analysis) and the frontend Command Centre view.
-- Story: CC8-002
-- Date: 2026-02-22
-- DEPENDS ON: CC8-001 (command_centre_items table)
-- ============================================================================

-- ============================================================================
-- FUNCTION: insert_command_centre_item(p_params JSONB)
-- Insert a single command centre item from a JSONB params bag.
-- Required params: org_id, user_id, source_agent, item_type, title
-- Optional params: summary, context, priority_score, priority_factors, urgency,
--                  due_date, deal_id, contact_id, source_event_id, parent_item_id
-- Returns: UUID of the newly created item.
-- ============================================================================

CREATE OR REPLACE FUNCTION insert_command_centre_item(p_params JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id             UUID;
  v_org_id         UUID;
  v_user_id        UUID;
  v_source_agent   TEXT;
  v_item_type      TEXT;
  v_title          TEXT;
BEGIN
  -- -----------------------------------------------------------------------
  -- 1. Extract and validate required fields
  -- -----------------------------------------------------------------------
  v_org_id       := (p_params->>'org_id')::UUID;
  v_user_id      := (p_params->>'user_id')::UUID;
  v_source_agent := p_params->>'source_agent';
  v_item_type    := p_params->>'item_type';
  v_title        := p_params->>'title';

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'insert_command_centre_item: org_id is required';
  END IF;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'insert_command_centre_item: user_id is required';
  END IF;
  IF v_source_agent IS NULL OR v_source_agent = '' THEN
    RAISE EXCEPTION 'insert_command_centre_item: source_agent is required';
  END IF;
  IF v_item_type IS NULL OR v_item_type = '' THEN
    RAISE EXCEPTION 'insert_command_centre_item: item_type is required';
  END IF;
  IF v_title IS NULL OR v_title = '' THEN
    RAISE EXCEPTION 'insert_command_centre_item: title is required';
  END IF;

  -- -----------------------------------------------------------------------
  -- 2. Insert with defaults for optional fields
  -- -----------------------------------------------------------------------
  INSERT INTO command_centre_items (
    org_id,
    user_id,
    source_agent,
    item_type,
    title,
    summary,
    context,
    priority_score,
    priority_factors,
    urgency,
    due_date,
    deal_id,
    contact_id,
    source_event_id,
    parent_item_id,
    status,
    enrichment_status,
    created_at,
    updated_at
  ) VALUES (
    v_org_id,
    v_user_id,
    v_source_agent,
    v_item_type,
    v_title,
    p_params->>'summary',
    COALESCE((p_params->'context')::jsonb, '{}'::jsonb),
    (p_params->>'priority_score')::NUMERIC(5, 2),
    COALESCE((p_params->'priority_factors')::jsonb, '{}'::jsonb),
    COALESCE(p_params->>'urgency', 'normal'),
    (p_params->>'due_date')::TIMESTAMPTZ,
    (p_params->>'deal_id')::UUID,
    (p_params->>'contact_id')::UUID,
    (p_params->>'source_event_id')::UUID,
    (p_params->>'parent_item_id')::UUID,
    'open',
    'pending',
    now(),
    now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION insert_command_centre_item(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION insert_command_centre_item(JSONB) TO service_role;

COMMENT ON FUNCTION insert_command_centre_item IS
  'Insert a command centre item from a JSONB params bag. Required: org_id, user_id, source_agent, item_type, title. Optional: summary, context, priority_score, priority_factors, urgency, due_date, deal_id, contact_id, source_event_id, parent_item_id. Defaults: status=open, enrichment_status=pending. Returns the new item UUID.';

-- ============================================================================
-- FUNCTION: bulk_update_cc_status(p_item_ids UUID[], p_new_status TEXT, p_resolution_channel TEXT)
-- Bulk-update the status of multiple command_centre_items in one call.
-- Sets resolved_at when transitioning to a terminal state.
-- Returns: count of rows updated.
-- ============================================================================

CREATE OR REPLACE FUNCTION bulk_update_cc_status(
  p_item_ids          UUID[],
  p_new_status        TEXT,
  p_resolution_channel TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_updated_count  INTEGER;
  v_is_terminal    BOOLEAN;
  v_caller_id      UUID;
BEGIN
  -- -----------------------------------------------------------------------
  -- 1. Validate inputs
  -- -----------------------------------------------------------------------
  IF p_item_ids IS NULL OR array_length(p_item_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'bulk_update_cc_status: p_item_ids must be a non-empty array';
  END IF;

  IF p_new_status IS NULL OR p_new_status = '' THEN
    RAISE EXCEPTION 'bulk_update_cc_status: p_new_status is required';
  END IF;

  -- -----------------------------------------------------------------------
  -- 2. Determine terminal status (sets resolved_at)
  -- -----------------------------------------------------------------------
  v_is_terminal := p_new_status IN ('completed', 'dismissed', 'auto_resolved');

  -- -----------------------------------------------------------------------
  -- 3. Verify caller owns the items or is service_role
  -- auth.uid() returns NULL when called by service_role
  -- -----------------------------------------------------------------------
  v_caller_id := auth.uid();

  IF v_caller_id IS NOT NULL THEN
    -- Authenticated user: confirm they own all items being updated
    IF EXISTS (
      SELECT 1
      FROM command_centre_items
      WHERE id = ANY(p_item_ids)
        AND user_id <> v_caller_id
    ) THEN
      RAISE EXCEPTION 'bulk_update_cc_status: caller does not own one or more of the specified items';
    END IF;
  END IF;
  -- If v_caller_id IS NULL → service_role bypass (no ownership check needed)

  -- -----------------------------------------------------------------------
  -- 4. Perform update
  -- -----------------------------------------------------------------------
  UPDATE command_centre_items
  SET
    status             = p_new_status,
    resolution_channel = COALESCE(p_resolution_channel, resolution_channel),
    resolved_at        = CASE WHEN v_is_terminal THEN now() ELSE resolved_at END,
    enriched_at        = CASE WHEN p_new_status = 'enriched' THEN now() ELSE enriched_at END,
    updated_at         = now()
  WHERE id = ANY(p_item_ids);

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN v_updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION bulk_update_cc_status(UUID[], TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION bulk_update_cc_status(UUID[], TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION bulk_update_cc_status IS
  'Bulk-update the status of multiple command_centre_items. Terminal statuses (completed, dismissed, auto_resolved) set resolved_at=now(). Optionally sets resolution_channel. Ownership check enforced for authenticated callers; service_role bypasses it. Returns count of updated rows.';

-- ============================================================================
-- FUNCTION: get_command_centre_view(p_user_id UUID)
-- Returns a JSONB object with 5 pre-bucketed item lists for the CC inbox UI.
--
-- Buckets:
--   needs_input         — ready items that still require human input
--   ready_to_action     — ready items with no pending human decisions
--   auto_completed_today — autonomously resolved today
--   externally_resolved — resolved via external channel today
--   at_risk_deals       — open deal_risk items
--
-- Each bucket is a JSON array ordered by priority_score DESC.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_command_centre_view(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_needs_input          JSONB;
  v_ready_to_action      JSONB;
  v_auto_completed_today JSONB;
  v_externally_resolved  JSONB;
  v_at_risk_deals        JSONB;
BEGIN
  -- -----------------------------------------------------------------------
  -- Validate
  -- -----------------------------------------------------------------------
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'get_command_centre_view: p_user_id is required';
  END IF;

  -- -----------------------------------------------------------------------
  -- Bucket 1: needs_input
  -- status='ready' AND requires_human_input is non-empty
  -- -----------------------------------------------------------------------
  SELECT COALESCE(
    jsonb_agg(row_to_json(t)::jsonb ORDER BY t.priority_score DESC NULLS LAST),
    '[]'::jsonb
  )
  INTO v_needs_input
  FROM (
    SELECT
      id, org_id, user_id, source_agent, source_event_id, item_type,
      title, summary, context, priority_score, priority_factors, urgency,
      due_date, enrichment_status, enrichment_context, drafted_action,
      confidence_score, confidence_factors, requires_human_input,
      status, resolution_channel, created_at, updated_at, enriched_at,
      resolved_at, deal_id, contact_id, parent_item_id
    FROM command_centre_items
    WHERE user_id = p_user_id
      AND status  = 'ready'
      AND array_length(requires_human_input, 1) > 0
  ) t;

  -- -----------------------------------------------------------------------
  -- Bucket 2: ready_to_action
  -- status='ready' AND requires_human_input is NULL or empty
  -- -----------------------------------------------------------------------
  SELECT COALESCE(
    jsonb_agg(row_to_json(t)::jsonb ORDER BY t.priority_score DESC NULLS LAST),
    '[]'::jsonb
  )
  INTO v_ready_to_action
  FROM (
    SELECT
      id, org_id, user_id, source_agent, source_event_id, item_type,
      title, summary, context, priority_score, priority_factors, urgency,
      due_date, enrichment_status, enrichment_context, drafted_action,
      confidence_score, confidence_factors, requires_human_input,
      status, resolution_channel, created_at, updated_at, enriched_at,
      resolved_at, deal_id, contact_id, parent_item_id
    FROM command_centre_items
    WHERE user_id = p_user_id
      AND status  = 'ready'
      AND (
        requires_human_input IS NULL
        OR array_length(requires_human_input, 1) IS NULL
        OR array_length(requires_human_input, 1) = 0
      )
  ) t;

  -- -----------------------------------------------------------------------
  -- Bucket 3: auto_completed_today
  -- Resolved autonomously today
  -- -----------------------------------------------------------------------
  SELECT COALESCE(
    jsonb_agg(row_to_json(t)::jsonb ORDER BY t.priority_score DESC NULLS LAST),
    '[]'::jsonb
  )
  INTO v_auto_completed_today
  FROM (
    SELECT
      id, org_id, user_id, source_agent, source_event_id, item_type,
      title, summary, context, priority_score, priority_factors, urgency,
      due_date, enrichment_status, enrichment_context, drafted_action,
      confidence_score, confidence_factors, requires_human_input,
      status, resolution_channel, created_at, updated_at, enriched_at,
      resolved_at, deal_id, contact_id, parent_item_id
    FROM command_centre_items
    WHERE user_id           = p_user_id
      AND resolution_channel = 'auto_exec'
      AND resolved_at        >= CURRENT_DATE
  ) t;

  -- -----------------------------------------------------------------------
  -- Bucket 4: externally_resolved
  -- Resolved via an external channel today (resolution_channel LIKE 'external_%')
  -- -----------------------------------------------------------------------
  SELECT COALESCE(
    jsonb_agg(row_to_json(t)::jsonb ORDER BY t.priority_score DESC NULLS LAST),
    '[]'::jsonb
  )
  INTO v_externally_resolved
  FROM (
    SELECT
      id, org_id, user_id, source_agent, source_event_id, item_type,
      title, summary, context, priority_score, priority_factors, urgency,
      due_date, enrichment_status, enrichment_context, drafted_action,
      confidence_score, confidence_factors, requires_human_input,
      status, resolution_channel, created_at, updated_at, enriched_at,
      resolved_at, deal_id, contact_id, parent_item_id
    FROM command_centre_items
    WHERE user_id            = p_user_id
      AND resolution_channel LIKE 'external_%'
      AND resolved_at        >= CURRENT_DATE
  ) t;

  -- -----------------------------------------------------------------------
  -- Bucket 5: at_risk_deals
  -- Open items sourced from the deal_risk agent
  -- -----------------------------------------------------------------------
  SELECT COALESCE(
    jsonb_agg(row_to_json(t)::jsonb ORDER BY t.priority_score DESC NULLS LAST),
    '[]'::jsonb
  )
  INTO v_at_risk_deals
  FROM (
    SELECT
      id, org_id, user_id, source_agent, source_event_id, item_type,
      title, summary, context, priority_score, priority_factors, urgency,
      due_date, enrichment_status, enrichment_context, drafted_action,
      confidence_score, confidence_factors, requires_human_input,
      status, resolution_channel, created_at, updated_at, enriched_at,
      resolved_at, deal_id, contact_id, parent_item_id
    FROM command_centre_items
    WHERE user_id      = p_user_id
      AND source_agent = 'deal_risk'
      AND status       = 'ready'
  ) t;

  -- -----------------------------------------------------------------------
  -- Assemble and return
  -- -----------------------------------------------------------------------
  RETURN jsonb_build_object(
    'needs_input',          v_needs_input,
    'ready_to_action',      v_ready_to_action,
    'auto_completed_today', v_auto_completed_today,
    'externally_resolved',  v_externally_resolved,
    'at_risk_deals',        v_at_risk_deals
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_command_centre_view(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_command_centre_view(UUID) TO service_role;

COMMENT ON FUNCTION get_command_centre_view IS
  'Returns JSONB with 5 bucketed views of command_centre_items for the specified user: needs_input (ready + requires human input), ready_to_action (ready + no pending decisions), auto_completed_today (autonomous resolution today), externally_resolved (external channel resolution today), at_risk_deals (deal_risk agent open items). Each bucket is ordered by priority_score DESC. Only returns items belonging to p_user_id.';

-- ============================================================================
-- Migration Summary
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260222600002_command_centre_rpcs.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Story: CC8-002';
  RAISE NOTICE '';
  RAISE NOTICE 'Functions created:';
  RAISE NOTICE '';
  RAISE NOTICE '  insert_command_centre_item(p_params JSONB) → UUID';
  RAISE NOTICE '    Insert a CC item from a JSONB params bag.';
  RAISE NOTICE '    Required: org_id, user_id, source_agent, item_type, title.';
  RAISE NOTICE '    Optional: summary, context, priority_score, priority_factors,';
  RAISE NOTICE '              urgency, due_date, deal_id, contact_id,';
  RAISE NOTICE '              source_event_id, parent_item_id.';
  RAISE NOTICE '    Defaults: status=open, enrichment_status=pending.';
  RAISE NOTICE '';
  RAISE NOTICE '  bulk_update_cc_status(p_item_ids UUID[], p_new_status TEXT,';
  RAISE NOTICE '                        p_resolution_channel TEXT) → INTEGER';
  RAISE NOTICE '    Bulk-update status for a list of item IDs.';
  RAISE NOTICE '    Terminal statuses (completed, dismissed, auto_resolved) set resolved_at.';
  RAISE NOTICE '    Ownership enforced for authenticated callers; service_role bypasses.';
  RAISE NOTICE '    Returns count of updated rows.';
  RAISE NOTICE '';
  RAISE NOTICE '  get_command_centre_view(p_user_id UUID) → JSONB';
  RAISE NOTICE '    Returns 5 bucketed item lists for the CC inbox UI:';
  RAISE NOTICE '      needs_input, ready_to_action, auto_completed_today,';
  RAISE NOTICE '      externally_resolved, at_risk_deals.';
  RAISE NOTICE '    Each bucket ordered by priority_score DESC.';
  RAISE NOTICE '';
  RAISE NOTICE 'Grants: EXECUTE to authenticated + service_role (all 3 functions)';
  RAISE NOTICE '============================================================================';
END $$;
