-- Migration: Sync Deals to Ops Table Function
-- Creates a function to sync deals + health scores + relationship health into the Deals standard ops table

CREATE OR REPLACE FUNCTION sync_deals_to_ops_table(
  p_org_id UUID,
  p_deal_ids UUID[] DEFAULT NULL  -- NULL = sync all deals for org
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table_id UUID;
  v_synced_count INT := 0;
  v_deleted_count INT := 0;
  v_column_map JSONB;
BEGIN
  -- Find the Deals dynamic_table for this org
  SELECT id INTO v_table_id
  FROM dynamic_tables
  WHERE organization_id = p_org_id
    AND name = 'Deals'
    AND is_standard = true;

  -- If Deals table hasn't been provisioned yet, return early
  IF v_table_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Deals ops table not provisioned for this organization',
      'synced_count', 0,
      'deleted_count', 0
    );
  END IF;

  -- Build a map of column keys to column IDs for efficient lookup
  SELECT jsonb_object_agg(key, id)
  INTO v_column_map
  FROM dynamic_table_columns
  WHERE table_id = v_table_id;

  -- Delete rows for closed_lost deals or deals not in the filter (if p_deal_ids provided)
  WITH deleted_rows AS (
    DELETE FROM dynamic_table_rows
    WHERE table_id = v_table_id
      AND source_type = 'app'
      AND (
        -- Deal is closed_lost
        source_id::uuid IN (
          SELECT id FROM deals
          WHERE clerk_org_id = p_org_id::text
            AND status = 'closed_lost'
        )
        -- Or deal doesn't exist anymore
        OR source_id::uuid NOT IN (
          SELECT id FROM deals WHERE clerk_org_id = p_org_id::text
        )
      )
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted_count FROM deleted_rows;

  -- Sync deal data using a CTE-based approach
  WITH deal_data AS (
    SELECT
      d.id AS deal_id,
      d.name AS deal_name,
      d.company AS company_name,
      d.value::text AS value,
      ds.name AS stage,
      d.expected_close_date::text AS close_date,
      COALESCE(p.first_name || ' ' || p.last_name, 'Unassigned') AS owner,
      dhs.overall_health_score::text AS deal_health_score,
      COALESCE(dhs.health_status, 'healthy') AS health_status,
      rhs_contact.overall_health_score::text AS relationship_health_score,
      COALESCE(rhs_contact.health_status, 'healthy') AS relationship_health_status,
      COALESCE(dhs.risk_level, 'low') AS risk_level,
      COALESCE(array_to_string(dhs.risk_factors, ', '), '') AS risk_factors,
      COALESCE(EXTRACT(DAY FROM NOW() - d.stage_changed_at)::text, '0') AS days_in_stage,
      rhs_contact.ghost_probability_percent::text AS ghost_probability,
      COALESCE(dhs.sentiment_trend, 'stable') AS sentiment_trend,
      (
        SELECT MAX(start_time)::text
        FROM meetings
        WHERE (
          primary_contact_id IN (SELECT id FROM contacts WHERE company_id = d.company_id)
          OR company_id = d.company_id
        )
        AND owner_user_id = d.owner_id
      ) AS last_meeting_date,
      d.updated_at::text AS last_activity_date,
      (
        SELECT title
        FROM next_action_suggestions
        WHERE deal_id = d.id
          AND status = 'pending'
        ORDER BY
          CASE urgency
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            WHEN 'low' THEN 4
            ELSE 5
          END,
          created_at DESC
        LIMIT 1
      ) AS next_action
    FROM deals d
    LEFT JOIN deal_stages ds ON d.stage_id = ds.id
    LEFT JOIN profiles p ON d.owner_id = p.id
    LEFT JOIN deal_health_scores dhs ON d.id = dhs.deal_id
    LEFT JOIN LATERAL (
      -- Get relationship health for primary contact or company
      SELECT
        overall_health_score,
        health_status,
        ghost_probability_percent
      FROM relationship_health_scores
      WHERE user_id = d.owner_id
        AND (
          (relationship_type = 'contact' AND contact_id IN (
            SELECT id FROM contacts WHERE company_id = d.company_id LIMIT 1
          ))
          OR (relationship_type = 'company' AND company_id = d.company_id)
        )
      ORDER BY
        CASE WHEN relationship_type = 'contact' THEN 1 ELSE 2 END,
        overall_health_score DESC
      LIMIT 1
    ) rhs_contact ON true
    WHERE d.clerk_org_id = p_org_id::text
      AND d.status != 'closed_lost'
      AND (p_deal_ids IS NULL OR d.id = ANY(p_deal_ids))
  ),
  upserted_rows AS (
    INSERT INTO dynamic_table_rows (table_id, source_id, source_type)
    SELECT v_table_id, deal_id::text, 'app'
    FROM deal_data
    ON CONFLICT (table_id, source_id, source_type)
    DO UPDATE SET updated_at = NOW()
    RETURNING id, source_id
  ),
  row_map AS (
    SELECT source_id::uuid AS deal_id, id AS row_id
    FROM upserted_rows
  )
  -- Upsert cells for all 18 columns
  INSERT INTO dynamic_table_cells (row_id, column_id, value, last_source, source_updated_at, status)
  SELECT
    rm.row_id,
    (v_column_map->>column_key)::uuid AS column_id,
    column_value AS value,
    'app' AS last_source,
    NOW() AS source_updated_at,
    'complete' AS status
  FROM row_map rm
  JOIN deal_data dd ON rm.deal_id = dd.deal_id
  CROSS JOIN LATERAL (
    VALUES
      ('deal_name', dd.deal_name),
      ('company_name', dd.company_name),
      ('value', dd.value),
      ('stage', dd.stage),
      ('close_date', dd.close_date),
      ('owner', dd.owner),
      ('deal_health_score', dd.deal_health_score),
      ('health_status', dd.health_status),
      ('relationship_health_score', dd.relationship_health_score),
      ('relationship_health_status', dd.relationship_health_status),
      ('risk_level', dd.risk_level),
      ('risk_factors', dd.risk_factors),
      ('days_in_stage', dd.days_in_stage),
      ('ghost_probability', dd.ghost_probability),
      ('sentiment_trend', dd.sentiment_trend),
      ('last_meeting_date', dd.last_meeting_date),
      ('last_activity_date', dd.last_activity_date),
      ('next_action', dd.next_action)
  ) AS cols(column_key, column_value)
  WHERE (v_column_map->>column_key) IS NOT NULL  -- Only insert if column exists
  ON CONFLICT (row_id, column_id)
  DO UPDATE SET
    value = EXCLUDED.value,
    last_source = 'app',
    source_updated_at = NOW(),
    updated_at = NOW()
  WHERE dynamic_table_cells.value IS DISTINCT FROM EXCLUDED.value;

  -- Count synced deals from the actual deal query (not from cell upserts,
  -- since the IS DISTINCT FROM filter makes ROW_COUNT unreliable)
  SELECT COUNT(*) INTO v_synced_count
  FROM deals
  WHERE clerk_org_id = p_org_id::text
    AND status != 'closed_lost'
    AND (p_deal_ids IS NULL OR id = ANY(p_deal_ids));

  RETURN jsonb_build_object(
    'success', true,
    'synced_count', v_synced_count,
    'deleted_count', v_deleted_count,
    'table_id', v_table_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to sync deals to ops table: %', SQLERRM;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION sync_deals_to_ops_table(UUID, UUID[]) TO authenticated;

COMMENT ON FUNCTION sync_deals_to_ops_table IS
  'Syncs deals with health scores and relationship intelligence into the Deals standard ops table. Can sync all deals for an org or specific deals by ID. Automatically removes closed_lost deals.';
