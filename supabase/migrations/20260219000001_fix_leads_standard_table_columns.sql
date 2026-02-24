-- Migration: Fix Standard Leads Table Columns
-- The Leads standard table was incorrectly sourcing from contacts table.
-- It should source from the `leads` table (booking-sourced leads with meeting context).
-- Also updates the provision RPC with corrected Leads columns.

-- =============================================================================
-- 1. Clean up existing Leads standard table data (columns, rows, cells)
-- =============================================================================

-- Delete cells for all Leads standard table rows
DELETE FROM dynamic_table_cells
WHERE row_id IN (
  SELECT r.id FROM dynamic_table_rows r
  JOIN dynamic_tables t ON r.table_id = t.id
  WHERE t.is_standard = true AND t.name = 'Leads'
);

-- Delete rows for all Leads standard tables
DELETE FROM dynamic_table_rows
WHERE table_id IN (
  SELECT id FROM dynamic_tables
  WHERE is_standard = true AND name = 'Leads'
);

-- Delete columns for all Leads standard tables
DELETE FROM dynamic_table_columns
WHERE table_id IN (
  SELECT id FROM dynamic_tables
  WHERE is_standard = true AND name = 'Leads'
);

-- =============================================================================
-- 2. Re-insert correct columns for all existing Leads tables
-- =============================================================================

INSERT INTO dynamic_table_columns (
  id, table_id, key, label, column_type, position, width,
  hubspot_property_name, attio_property_name, app_source_table, app_source_column,
  dropdown_options, is_visible, is_system, is_locked
)
SELECT
  gen_random_uuid(), t.id,
  col.key, col.label, col.column_type, col.position, col.width,
  col.hubspot_property_name, col.attio_property_name,
  col.app_source_table, col.app_source_column,
  col.dropdown_options, true, true, true
FROM dynamic_tables t
CROSS JOIN (
  VALUES
    ('contact_name', 'Contact Name', 'text', 0, 200, NULL::text, NULL::text, 'leads', 'contact_name', NULL::jsonb),
    ('contact_email', 'Email', 'email', 1, 220, NULL, NULL, 'leads', 'contact_email', NULL),
    ('domain', 'Domain', 'url', 2, 180, NULL, NULL, 'leads', 'domain', NULL),
    ('meeting_title', 'Meeting', 'text', 3, 220, NULL, NULL, 'leads', 'meeting_title', NULL),
    ('meeting_start', 'Meeting Date', 'date', 4, 160, NULL, NULL, 'leads', 'meeting_start', NULL),
    ('source', 'Source', 'text', 5, 140, NULL, NULL, 'leads', 'external_source', NULL),
    ('status', 'Status', 'status', 6, 140, NULL, NULL, 'leads', 'status',
      '[{"value":"new","label":"New","color":"blue"},{"value":"prepping","label":"Prepping","color":"yellow"},{"value":"ready","label":"Ready","color":"green"},{"value":"converted","label":"Converted","color":"purple"},{"value":"archived","label":"Archived","color":"gray"},{"value":"cancelled","label":"Cancelled","color":"red"}]'::jsonb),
    ('priority', 'Priority', 'status', 7, 120, NULL, NULL, 'leads', 'priority',
      '[{"value":"low","label":"Low","color":"gray"},{"value":"normal","label":"Normal","color":"blue"},{"value":"high","label":"High","color":"orange"},{"value":"urgent","label":"Urgent","color":"red"}]'::jsonb),
    ('owner', 'Owner', 'person', 8, 160, NULL, NULL, 'leads', 'owner_id', NULL),
    ('created_at', 'Created', 'date', 9, 160, NULL, NULL, 'leads', 'created_at', NULL)
) AS col(key, label, column_type, position, width, hubspot_property_name, attio_property_name, app_source_table, app_source_column, dropdown_options)
WHERE t.is_standard = true AND t.name = 'Leads';

-- =============================================================================
-- 3. Update Meetings contact_company column to include app_source_table
-- =============================================================================

UPDATE dynamic_table_columns
SET app_source_table = 'meetings', app_source_column = 'company_id'
WHERE key = 'contact_company'
  AND table_id IN (
    SELECT id FROM dynamic_tables
    WHERE is_standard = true AND name = 'Meetings'
  );

-- =============================================================================
-- 4. Replace provision RPC with corrected Leads columns
--    (no organization_id in dynamic_table_columns or dynamic_table_views)
-- =============================================================================

CREATE OR REPLACE FUNCTION provision_standard_ops_tables(
  p_org_id UUID,
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_leads_id UUID;
  v_meetings_id UUID;
  v_contacts_id UUID;
  v_companies_id UUID;
  v_result JSON;
  v_leads_columns_count INT;
  v_meetings_columns_count INT;
  v_contacts_columns_count INT;
  v_companies_columns_count INT;
BEGIN
  -- Check idempotency: if already provisioned, return early
  IF EXISTS (
    SELECT 1 FROM organizations
    WHERE id = p_org_id AND ops_tables_provisioned = true
  ) THEN
    RETURN json_build_object(
      'success', true,
      'message', 'Standard ops tables already provisioned for this organization',
      'already_provisioned', true
    );
  END IF;

  -- Create Leads table
  INSERT INTO dynamic_tables (
    id, organization_id, created_by, name, source_type, is_standard, description
  ) VALUES (
    gen_random_uuid(), p_org_id, p_user_id, 'Leads', 'standard', true,
    'Booking-sourced leads from scheduling links, with meeting context and status tracking'
  ) RETURNING id INTO v_leads_id;

  -- Create Leads columns (10 columns) — sourced from `leads` table
  INSERT INTO dynamic_table_columns (
    id, table_id, key, label, column_type, position, width,
    app_source_table, app_source_column,
    dropdown_options, is_visible, is_system, is_locked
  ) VALUES
    (gen_random_uuid(), v_leads_id, 'contact_name', 'Contact Name', 'text', 0, 200, 'leads', 'contact_name', NULL, true, true, true),
    (gen_random_uuid(), v_leads_id, 'contact_email', 'Email', 'email', 1, 220, 'leads', 'contact_email', NULL, true, true, true),
    (gen_random_uuid(), v_leads_id, 'domain', 'Domain', 'url', 2, 180, 'leads', 'domain', NULL, true, true, true),
    (gen_random_uuid(), v_leads_id, 'meeting_title', 'Meeting', 'text', 3, 220, 'leads', 'meeting_title', NULL, true, true, true),
    (gen_random_uuid(), v_leads_id, 'meeting_start', 'Meeting Date', 'date', 4, 160, 'leads', 'meeting_start', NULL, true, true, true),
    (gen_random_uuid(), v_leads_id, 'source', 'Source', 'text', 5, 140, 'leads', 'external_source', NULL, true, true, true),
    (gen_random_uuid(), v_leads_id, 'status', 'Status', 'status', 6, 140, 'leads', 'status', '[{"value":"new","label":"New","color":"blue"},{"value":"prepping","label":"Prepping","color":"yellow"},{"value":"ready","label":"Ready","color":"green"},{"value":"converted","label":"Converted","color":"purple"},{"value":"archived","label":"Archived","color":"gray"},{"value":"cancelled","label":"Cancelled","color":"red"}]'::jsonb, true, true, true),
    (gen_random_uuid(), v_leads_id, 'priority', 'Priority', 'status', 7, 120, 'leads', 'priority', '[{"value":"low","label":"Low","color":"gray"},{"value":"normal","label":"Normal","color":"blue"},{"value":"high","label":"High","color":"orange"},{"value":"urgent","label":"Urgent","color":"red"}]'::jsonb, true, true, true),
    (gen_random_uuid(), v_leads_id, 'owner', 'Owner', 'person', 8, 160, 'leads', 'owner_id', NULL, true, true, true),
    (gen_random_uuid(), v_leads_id, 'created_at', 'Created', 'date', 9, 160, 'leads', 'created_at', NULL, true, true, true);

  GET DIAGNOSTICS v_leads_columns_count = ROW_COUNT;

  INSERT INTO dynamic_table_views (
    id, table_id, created_by, name, is_system
  ) VALUES (gen_random_uuid(), v_leads_id, p_user_id, 'All Leads', true);

  -- Create Meetings table
  INSERT INTO dynamic_tables (
    id, organization_id, created_by, name, source_type, is_standard, description
  ) VALUES (
    gen_random_uuid(), p_org_id, p_user_id, 'Meetings', 'standard', true,
    'Track all meetings with contacts, including recordings, summaries, and sentiment analysis'
  ) RETURNING id INTO v_meetings_id;

  INSERT INTO dynamic_table_columns (
    id, table_id, key, label, column_type, position, width,
    hubspot_property_name, attio_property_name, app_source_table, app_source_column,
    dropdown_options, is_visible, is_system, is_locked
  ) VALUES
    (gen_random_uuid(), v_meetings_id, 'title', 'Title', 'text', 0, 250, 'hs_meeting_title', NULL, 'meetings', 'title', NULL, true, true, true),
    (gen_random_uuid(), v_meetings_id, 'meeting_date', 'Meeting Date', 'date', 1, 160, 'hs_timestamp', NULL, 'meetings', 'start_time', NULL, true, true, true),
    (gen_random_uuid(), v_meetings_id, 'duration_minutes', 'Duration (min)', 'number', 2, 140, 'hs_meeting_duration', NULL, 'meetings', 'duration_minutes', NULL, true, true, true),
    (gen_random_uuid(), v_meetings_id, 'primary_contact', 'Primary Contact', 'person', 3, 180, 'hs_meeting_contact', NULL, 'meetings', 'primary_contact_id', NULL, true, true, true),
    (gen_random_uuid(), v_meetings_id, 'contact_company', 'Company', 'company', 4, 180, 'hs_meeting_company', NULL, 'meetings', 'company_id', NULL, true, true, true),
    (gen_random_uuid(), v_meetings_id, 'sentiment', 'Sentiment', 'status', 5, 140, 'hs_call_sentiment', NULL, 'meetings', 'sentiment_score', '[{"value":"negative","label":"Negative","color":"red"},{"value":"neutral","label":"Neutral","color":"gray"},{"value":"positive","label":"Positive","color":"green"},{"value":"very_positive","label":"Very Positive","color":"blue"}]'::jsonb, true, true, true),
    (gen_random_uuid(), v_meetings_id, 'summary', 'Summary', 'text', 6, 300, 'hs_meeting_body', NULL, 'meetings', 'summary', NULL, true, true, true),
    (gen_random_uuid(), v_meetings_id, 'next_actions', 'Next Actions', 'tags', 7, 200, NULL, NULL, NULL, NULL, NULL, true, true, true),
    (gen_random_uuid(), v_meetings_id, 'owner', 'Owner', 'person', 8, 160, 'hubspot_owner_id', NULL, 'meetings', 'owner_user_id', NULL, true, true, true),
    (gen_random_uuid(), v_meetings_id, 'recording_url', 'Recording', 'url', 9, 120, NULL, NULL, 'meetings', 'share_url', NULL, true, true, true);

  GET DIAGNOSTICS v_meetings_columns_count = ROW_COUNT;

  INSERT INTO dynamic_table_views (
    id, table_id, created_by, name, is_system
  ) VALUES (gen_random_uuid(), v_meetings_id, p_user_id, 'All Meetings', true);

  -- Create All Contacts table
  INSERT INTO dynamic_tables (
    id, organization_id, created_by, name, source_type, is_standard, description
  ) VALUES (
    gen_random_uuid(), p_org_id, p_user_id, 'All Contacts', 'standard', true,
    'Comprehensive view of all contacts synced from CRM and internal database'
  ) RETURNING id INTO v_contacts_id;

  INSERT INTO dynamic_table_columns (
    id, table_id, key, label, column_type, position, width,
    hubspot_property_name, attio_property_name, app_source_table, app_source_column,
    dropdown_options, is_visible, is_system, is_locked
  ) VALUES
    (gen_random_uuid(), v_contacts_id, 'crm_id', 'CRM ID', 'text', 0, 140, 'vid', 'id', NULL, NULL, NULL, true, true, true),
    (gen_random_uuid(), v_contacts_id, 'first_name', 'First Name', 'text', 1, 160, 'firstname', 'first_name', 'contacts', 'first_name', NULL, true, true, true),
    (gen_random_uuid(), v_contacts_id, 'last_name', 'Last Name', 'text', 2, 160, 'lastname', 'last_name', 'contacts', 'last_name', NULL, true, true, true),
    (gen_random_uuid(), v_contacts_id, 'email', 'Email', 'email', 3, 220, 'email', 'email_addresses', 'contacts', 'email', NULL, true, true, true),
    (gen_random_uuid(), v_contacts_id, 'company_name', 'Company', 'company', 4, 200, 'company', 'company_name', 'companies', 'name', NULL, true, true, true),
    (gen_random_uuid(), v_contacts_id, 'title', 'Title', 'text', 5, 180, 'jobtitle', 'job_title', 'contacts', 'title', NULL, true, true, true),
    (gen_random_uuid(), v_contacts_id, 'phone', 'Phone', 'phone', 6, 160, 'phone', 'phone_numbers', 'contacts', 'phone', NULL, true, true, true),
    (gen_random_uuid(), v_contacts_id, 'linkedin_url', 'LinkedIn', 'linkedin', 7, 160, 'hs_linkedinid', 'linkedin', 'contacts', 'linkedin_url', NULL, true, true, true),
    (gen_random_uuid(), v_contacts_id, 'last_engagement', 'Last Engagement', 'date', 8, 160, 'notes_last_updated', NULL, NULL, NULL, NULL, true, true, true),
    (gen_random_uuid(), v_contacts_id, 'lifecycle_stage', 'Lifecycle Stage', 'status', 9, 160, 'lifecyclestage', 'status', NULL, NULL, '[{"value":"subscriber","label":"Subscriber","color":"gray"},{"value":"lead","label":"Lead","color":"blue"},{"value":"mql","label":"MQL","color":"yellow"},{"value":"sql","label":"SQL","color":"orange"},{"value":"opportunity","label":"Opportunity","color":"purple"},{"value":"customer","label":"Customer","color":"green"},{"value":"evangelist","label":"Evangelist","color":"teal"}]'::jsonb, true, true, true),
    (gen_random_uuid(), v_contacts_id, 'recent_signals', 'Recent Signals', 'tags', 10, 200, NULL, NULL, NULL, NULL, NULL, true, true, true),
    (gen_random_uuid(), v_contacts_id, 'sync_status', 'Sync Status', 'status', 11, 140, NULL, NULL, NULL, NULL, '[{"value":"synced","label":"Synced","color":"green"},{"value":"pending","label":"Pending","color":"yellow"},{"value":"error","label":"Error","color":"red"},{"value":"not_connected","label":"Not Connected","color":"gray"}]'::jsonb, true, true, true);

  GET DIAGNOSTICS v_contacts_columns_count = ROW_COUNT;

  INSERT INTO dynamic_table_views (
    id, table_id, created_by, name, is_system
  ) VALUES (gen_random_uuid(), v_contacts_id, p_user_id, 'All Contacts', true);

  -- Create All Companies table
  INSERT INTO dynamic_tables (
    id, organization_id, created_by, name, source_type, is_standard, description
  ) VALUES (
    gen_random_uuid(), p_org_id, p_user_id, 'All Companies', 'standard', true,
    'Comprehensive view of all companies synced from CRM and internal database'
  ) RETURNING id INTO v_companies_id;

  INSERT INTO dynamic_table_columns (
    id, table_id, key, label, column_type, position, width,
    hubspot_property_name, attio_property_name, app_source_table, app_source_column,
    dropdown_options, is_visible, is_system, is_locked
  ) VALUES
    (gen_random_uuid(), v_companies_id, 'crm_id', 'CRM ID', 'text', 0, 140, 'companyId', 'id', NULL, NULL, NULL, true, true, true),
    (gen_random_uuid(), v_companies_id, 'name', 'Name', 'text', 1, 220, 'name', 'name', 'companies', 'name', NULL, true, true, true),
    (gen_random_uuid(), v_companies_id, 'domain', 'Domain', 'url', 2, 200, 'domain', 'domains', 'companies', 'domain', NULL, true, true, true),
    (gen_random_uuid(), v_companies_id, 'website', 'Website', 'url', 3, 200, 'website', 'website', 'companies', 'website', NULL, true, true, true),
    (gen_random_uuid(), v_companies_id, 'industry', 'Industry', 'text', 4, 180, 'industry', 'industry', 'companies', 'industry', NULL, true, true, true),
    (gen_random_uuid(), v_companies_id, 'company_size', 'Company Size', 'status', 5, 160, 'numberofemployees', 'employee_count', 'companies', 'size', '[{"value":"startup","label":"Startup 1-10","color":"gray"},{"value":"small","label":"Small 11-50","color":"blue"},{"value":"medium","label":"Medium 51-200","color":"yellow"},{"value":"large","label":"Large 201-1000","color":"orange"},{"value":"enterprise","label":"Enterprise 1000+","color":"purple"}]'::jsonb, true, true, true),
    (gen_random_uuid(), v_companies_id, 'phone', 'Phone', 'phone', 6, 160, 'phone', 'phone_numbers', 'companies', 'phone', NULL, true, true, true),
    (gen_random_uuid(), v_companies_id, 'linkedin_url', 'LinkedIn', 'linkedin', 7, 160, 'linkedin_company_page', 'linkedin', NULL, NULL, NULL, true, true, true),
    (gen_random_uuid(), v_companies_id, 'description', 'Description', 'text', 8, 300, 'description', 'description', 'companies', 'description', NULL, true, true, true),
    (gen_random_uuid(), v_companies_id, 'revenue', 'Revenue', 'number', 9, 140, 'annualrevenue', 'estimated_arr', NULL, NULL, NULL, true, true, true),
    (gen_random_uuid(), v_companies_id, 'active_contacts_count', 'Active Contacts', 'number', 10, 140, NULL, NULL, NULL, NULL, NULL, true, true, true),
    (gen_random_uuid(), v_companies_id, 'last_contact_date', 'Last Contact', 'date', 11, 160, 'notes_last_updated', NULL, NULL, NULL, NULL, true, true, true);

  GET DIAGNOSTICS v_companies_columns_count = ROW_COUNT;

  INSERT INTO dynamic_table_views (
    id, table_id, created_by, name, is_system
  ) VALUES (gen_random_uuid(), v_companies_id, p_user_id, 'All Companies', true);

  -- Mark organization as provisioned
  UPDATE organizations
  SET ops_tables_provisioned = true
  WHERE id = p_org_id;

  -- Build result JSON
  v_result := json_build_object(
    'success', true,
    'message', 'Standard ops tables provisioned successfully',
    'tables', json_build_object(
      'leads', json_build_object('id', v_leads_id, 'columns_count', v_leads_columns_count),
      'meetings', json_build_object('id', v_meetings_id, 'columns_count', v_meetings_columns_count),
      'contacts', json_build_object('id', v_contacts_id, 'columns_count', v_contacts_columns_count),
      'companies', json_build_object('id', v_companies_id, 'columns_count', v_companies_columns_count)
    )
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to provision standard ops tables: %', SQLERRM;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION provision_standard_ops_tables(UUID, UUID) TO authenticated;
