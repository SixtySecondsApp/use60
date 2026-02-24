-- Migration: Waitlist Signups Ops Table
-- Creates a standalone function to provision the Waitlist Signups ops table with 19 system columns
-- including referral tracking, tool preferences, and conversion status.
-- Also creates live sync triggers on meetings_waitlist for real-time updates.

-- ============================================================================
-- 1. Provisioning RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION provision_waitlist_ops_table(
  p_org_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table_id UUID;
  v_existing UUID;
  v_columns_count INT;
BEGIN
  -- Check if Waitlist Signups table already exists for this org (idempotent)
  SELECT id INTO v_existing
  FROM dynamic_tables
  WHERE organization_id = p_org_id
    AND name = 'Waitlist Signups'
    AND is_standard = true;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'table', 'Waitlist Signups',
      'id', v_existing,
      'status', 'already_exists'
    );
  END IF;

  -- Create Waitlist Signups table
  INSERT INTO dynamic_tables (
    id,
    organization_id,
    created_by,
    name,
    source_type,
    is_standard,
    description
  ) VALUES (
    gen_random_uuid(),
    p_org_id,
    p_user_id,
    'Waitlist Signups',
    'standard',
    true,
    'Live-syncing waitlist signups with referral tracking, tool preferences, and conversion status'
  ) RETURNING id INTO v_table_id;

  -- Create 19 system columns
  INSERT INTO dynamic_table_columns (
    id, table_id, organization_id, key, label, column_type, position, width,
    app_source_table, app_source_column,
    dropdown_options, is_visible, is_system, is_locked
  ) VALUES
    -- 0. Full Name
    (gen_random_uuid(), v_table_id, p_org_id, 'full_name', 'Full Name', 'text', 0, 200,
     'meetings_waitlist', 'full_name',
     NULL, true, true, true),

    -- 1. Email
    (gen_random_uuid(), v_table_id, p_org_id, 'email', 'Email', 'email', 1, 220,
     'meetings_waitlist', 'email',
     NULL, true, true, true),

    -- 2. Company
    (gen_random_uuid(), v_table_id, p_org_id, 'company_name', 'Company', 'company', 2, 200,
     'meetings_waitlist', 'company_name',
     NULL, true, true, true),

    -- 3. Status
    (gen_random_uuid(), v_table_id, p_org_id, 'status', 'Status', 'status', 3, 140,
     'meetings_waitlist', 'status',
     '[{"value":"pending","label":"Pending","color":"#eab308"},{"value":"released","label":"Released","color":"#3b82f6"},{"value":"converted","label":"Converted","color":"#22c55e"},{"value":"rejected","label":"Rejected","color":"#ef4444"}]'::jsonb,
     true, true, true),

    -- 4. Signup Position
    (gen_random_uuid(), v_table_id, p_org_id, 'signup_position', 'Position', 'number', 4, 100,
     'meetings_waitlist', 'signup_position',
     NULL, true, true, true),

    -- 5. Total Points
    (gen_random_uuid(), v_table_id, p_org_id, 'total_points', 'Points', 'number', 5, 100,
     'meetings_waitlist', 'total_points',
     NULL, true, true, true),

    -- 6. Referral Code
    (gen_random_uuid(), v_table_id, p_org_id, 'referral_code', 'Referral Code', 'text', 6, 140,
     'meetings_waitlist', 'referral_code',
     NULL, true, true, true),

    -- 7. Referral Count
    (gen_random_uuid(), v_table_id, p_org_id, 'referral_count', 'Referrals', 'number', 7, 100,
     'meetings_waitlist', 'referral_count',
     NULL, true, true, true),

    -- 8. Referred By
    (gen_random_uuid(), v_table_id, p_org_id, 'referred_by', 'Referred By', 'text', 8, 140,
     'meetings_waitlist', 'referred_by_code',
     NULL, true, true, true),

    -- 9. CRM Tool
    (gen_random_uuid(), v_table_id, p_org_id, 'crm_tool', 'CRM Tool', 'text', 9, 140,
     'meetings_waitlist', 'crm_tool',
     NULL, true, true, true),

    -- 10. Meeting Recorder Tool
    (gen_random_uuid(), v_table_id, p_org_id, 'meeting_recorder_tool', 'Meeting Recorder', 'text', 10, 160,
     'meetings_waitlist', 'meeting_recorder_tool',
     NULL, true, true, true),

    -- 11. Task Manager Tool
    (gen_random_uuid(), v_table_id, p_org_id, 'task_manager_tool', 'Task Manager', 'text', 11, 140,
     'meetings_waitlist', 'task_manager_tool',
     NULL, true, true, true),

    -- 12. Signup Source
    (gen_random_uuid(), v_table_id, p_org_id, 'signup_source', 'Signup Source', 'text', 12, 140,
     'meetings_waitlist', 'signup_source',
     NULL, true, true, true),

    -- 13. UTM Source
    (gen_random_uuid(), v_table_id, p_org_id, 'utm_source', 'UTM Source', 'text', 13, 140,
     'meetings_waitlist', 'utm_source',
     NULL, true, true, true),

    -- 14. UTM Campaign
    (gen_random_uuid(), v_table_id, p_org_id, 'utm_campaign', 'UTM Campaign', 'text', 14, 140,
     'meetings_waitlist', 'utm_campaign',
     NULL, true, true, true),

    -- 15. Registration URL
    (gen_random_uuid(), v_table_id, p_org_id, 'registration_url', 'Registration URL', 'url', 15, 200,
     'meetings_waitlist', 'registration_url',
     NULL, true, true, true),

    -- 16. Access Granted At
    (gen_random_uuid(), v_table_id, p_org_id, 'granted_access_at', 'Access Granted', 'date', 16, 160,
     'meetings_waitlist', 'granted_access_at',
     NULL, true, true, true),

    -- 17. Converted At
    (gen_random_uuid(), v_table_id, p_org_id, 'converted_at', 'Converted At', 'date', 17, 160,
     'meetings_waitlist', 'converted_at',
     NULL, true, true, true),

    -- 18. Created At (signup date)
    (gen_random_uuid(), v_table_id, p_org_id, 'created_at', 'Signed Up', 'date', 18, 160,
     'meetings_waitlist', 'created_at',
     NULL, true, true, true);

  GET DIAGNOSTICS v_columns_count = ROW_COUNT;

  -- Create default view: All Signups
  INSERT INTO dynamic_table_views (
    id, table_id, created_by, name, is_system, is_default, position,
    column_config, sort_config
  ) VALUES (
    gen_random_uuid(), v_table_id, p_user_id, 'All Signups', true, true, 0,
    '["full_name","email","company_name","status","signup_position","total_points","referral_count","crm_tool","signup_source","created_at"]'::jsonb,
    '{"column":"created_at","direction":"desc"}'::jsonb
  );

  -- Create view: Pending Review
  INSERT INTO dynamic_table_views (
    id, table_id, created_by, name, is_system, is_default, position,
    column_config, sort_config, filter_config
  ) VALUES (
    gen_random_uuid(), v_table_id, p_user_id, 'Pending Review', true, false, 1,
    '["full_name","email","company_name","signup_position","total_points","referral_count","crm_tool","meeting_recorder_tool","created_at"]'::jsonb,
    '{"column":"signup_position","direction":"asc"}'::jsonb,
    '[{"column":"status","operator":"equals","value":"pending"}]'::jsonb
  );

  -- Create view: Converted
  INSERT INTO dynamic_table_views (
    id, table_id, created_by, name, is_system, is_default, position,
    column_config, sort_config, filter_config
  ) VALUES (
    gen_random_uuid(), v_table_id, p_user_id, 'Converted', true, false, 2,
    '["full_name","email","company_name","referral_count","total_points","granted_access_at","converted_at"]'::jsonb,
    '{"column":"converted_at","direction":"desc"}'::jsonb,
    '[{"column":"status","operator":"equals","value":"converted"}]'::jsonb
  );

  -- Create view: Top Referrers
  INSERT INTO dynamic_table_views (
    id, table_id, created_by, name, is_system, is_default, position,
    column_config, sort_config, filter_config
  ) VALUES (
    gen_random_uuid(), v_table_id, p_user_id, 'Top Referrers', true, false, 3,
    '["full_name","email","company_name","referral_code","referral_count","total_points","status"]'::jsonb,
    '{"column":"referral_count","direction":"desc"}'::jsonb,
    '[{"column":"referral_count","operator":"greater_than_or_equal","value":1}]'::jsonb
  );

  RETURN jsonb_build_object(
    'table', 'Waitlist Signups',
    'id', v_table_id,
    'status', 'created',
    'columns_count', v_columns_count
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to provision Waitlist Signups ops table: %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION provision_waitlist_ops_table(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION provision_waitlist_ops_table IS
  'Provisions the Waitlist Signups standard ops table with 19 system columns including referral tracking, tool preferences, and conversion status. Idempotent - returns early if already provisioned.';

-- ============================================================================
-- 2. Live Sync: AFTER INSERT on meetings_waitlist
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_waitlist_signup_to_ops()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table_id UUID;
  v_row_id UUID;
  v_column_map JSONB;
BEGIN
  -- Find any Waitlist Signups ops table (there should be at most one across all orgs)
  SELECT id INTO v_table_id
  FROM dynamic_tables
  WHERE name = 'Waitlist Signups'
    AND is_standard = true
  LIMIT 1;

  -- No-op if no waitlist ops table exists
  IF v_table_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Build column key -> id map
  SELECT jsonb_object_agg(key, id)
  INTO v_column_map
  FROM dynamic_table_columns
  WHERE table_id = v_table_id;

  -- Insert the row
  INSERT INTO dynamic_table_rows (table_id, source_id, source_type)
  VALUES (v_table_id, NEW.id::text, 'app')
  ON CONFLICT (table_id, source_id, source_type) DO NOTHING
  RETURNING id INTO v_row_id;

  -- If row already existed, skip cell inserts
  IF v_row_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Insert cells for all mapped columns
  INSERT INTO dynamic_table_cells (row_id, column_id, value)
  SELECT v_row_id, (v_column_map->>col_key)::uuid, col_value
  FROM (
    VALUES
      ('full_name', NEW.full_name),
      ('email', NEW.email),
      ('company_name', NEW.company_name),
      ('status', NEW.status::text),
      ('signup_position', NEW.signup_position::text),
      ('total_points', NEW.total_points::text),
      ('referral_code', NEW.referral_code),
      ('referral_count', NEW.referral_count::text),
      ('referred_by', NEW.referred_by_code),
      ('crm_tool', NEW.crm_tool),
      ('meeting_recorder_tool', NEW.meeting_recorder_tool),
      ('task_manager_tool', NEW.task_manager_tool),
      ('signup_source', NEW.signup_source),
      ('utm_source', NEW.utm_source),
      ('utm_campaign', NEW.utm_campaign),
      ('registration_url', NEW.registration_url),
      ('granted_access_at', NEW.granted_access_at::text),
      ('converted_at', NEW.converted_at::text),
      ('created_at', NEW.created_at::text)
  ) AS cols(col_key, col_value)
  WHERE (v_column_map->>col_key) IS NOT NULL
    AND col_value IS NOT NULL;

  RETURN NEW;
END;
$$;

-- Create trigger (drop first for idempotency)
DROP TRIGGER IF EXISTS trg_sync_waitlist_signup_to_ops ON meetings_waitlist;
CREATE TRIGGER trg_sync_waitlist_signup_to_ops
  AFTER INSERT ON meetings_waitlist
  FOR EACH ROW
  EXECUTE FUNCTION sync_waitlist_signup_to_ops();

-- ============================================================================
-- 3. Live Sync: AFTER UPDATE on meetings_waitlist
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_waitlist_update_to_ops()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table_id UUID;
  v_row_id UUID;
  v_column_map JSONB;
BEGIN
  -- Find any Waitlist Signups ops table
  SELECT id INTO v_table_id
  FROM dynamic_tables
  WHERE name = 'Waitlist Signups'
    AND is_standard = true
  LIMIT 1;

  IF v_table_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Find the existing row for this waitlist entry
  SELECT id INTO v_row_id
  FROM dynamic_table_rows
  WHERE table_id = v_table_id
    AND source_id = NEW.id::text
    AND source_type = 'app';

  -- If no row exists, skip (will be created on next backfill)
  IF v_row_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Build column key -> id map
  SELECT jsonb_object_agg(key, id)
  INTO v_column_map
  FROM dynamic_table_columns
  WHERE table_id = v_table_id;

  -- Upsert changed cells (status, position, points, referral_count, granted_access_at, converted_at)
  INSERT INTO dynamic_table_cells (row_id, column_id, value)
  SELECT v_row_id, (v_column_map->>col_key)::uuid, col_value
  FROM (
    VALUES
      ('status', NEW.status::text),
      ('signup_position', NEW.signup_position::text),
      ('total_points', NEW.total_points::text),
      ('referral_count', NEW.referral_count::text),
      ('granted_access_at', NEW.granted_access_at::text),
      ('converted_at', NEW.converted_at::text)
  ) AS cols(col_key, col_value)
  WHERE (v_column_map->>col_key) IS NOT NULL
    AND col_value IS NOT NULL
  ON CONFLICT (row_id, column_id)
  DO UPDATE SET
    value = EXCLUDED.value,
    updated_at = NOW()
  WHERE dynamic_table_cells.value IS DISTINCT FROM EXCLUDED.value;

  RETURN NEW;
END;
$$;

-- Create trigger (drop first for idempotency)
DROP TRIGGER IF EXISTS trg_sync_waitlist_update_to_ops ON meetings_waitlist;
CREATE TRIGGER trg_sync_waitlist_update_to_ops
  AFTER UPDATE ON meetings_waitlist
  FOR EACH ROW
  EXECUTE FUNCTION sync_waitlist_update_to_ops();
