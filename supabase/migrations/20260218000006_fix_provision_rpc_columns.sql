-- Fix: Remove organization_id from dynamic_table_columns and dynamic_table_views inserts
-- Those tables don't have an organization_id column (org is resolved via table_id -> dynamic_tables.organization_id)

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

  -- =========================================================================
  -- Create Leads table
  -- =========================================================================
  INSERT INTO dynamic_tables (
    id, organization_id, created_by, name, source_type, is_standard, description
  ) VALUES (
    gen_random_uuid(), p_org_id, p_user_id, 'Leads', 'standard', true,
    'Track new leads and prospects with engagement levels and contact details'
  ) RETURNING id INTO v_leads_id;

  INSERT INTO dynamic_table_columns (
    id, table_id, key, label, column_type, position, width,
    hubspot_property_name, attio_property_name, app_source_table, app_source_column,
    dropdown_options, is_visible, is_system, is_locked
  ) VALUES
    (gen_random_uuid(), v_leads_id, 'first_name', 'First Name', 'text', 0, 160, 'firstname', 'first_name', 'contacts', 'first_name', NULL, true, true, true),
    (gen_random_uuid(), v_leads_id, 'last_name', 'Last Name', 'text', 1, 160, 'lastname', 'last_name', 'contacts', 'last_name', NULL, true, true, true),
    (gen_random_uuid(), v_leads_id, 'email', 'Email', 'email', 2, 220, 'email', 'email_addresses', 'contacts', 'email', NULL, true, true, true),
    (gen_random_uuid(), v_leads_id, 'company', 'Company', 'company', 3, 200, 'company', 'company_name', 'contacts', 'company_id', NULL, true, true, true),
    (gen_random_uuid(), v_leads_id, 'title', 'Title', 'text', 4, 180, 'jobtitle', 'job_title', 'contacts', 'title', NULL, true, true, true),
    (gen_random_uuid(), v_leads_id, 'phone', 'Phone', 'phone', 5, 160, 'phone', 'phone_numbers', 'contacts', 'phone', NULL, true, true, true),
    (gen_random_uuid(), v_leads_id, 'linkedin_url', 'LinkedIn', 'linkedin', 6, 160, 'hs_linkedinid', 'linkedin', 'contacts', 'linkedin_url', NULL, true, true, true),
    (gen_random_uuid(), v_leads_id, 'engagement_level', 'Engagement Level', 'status', 7, 160, 'lifecyclestage', 'lead_status', 'contacts', 'engagement_level', '[{"value":"cold","label":"Cold","color":"gray"},{"value":"warm","label":"Warm","color":"yellow"},{"value":"hot","label":"Hot","color":"orange"},{"value":"engaged","label":"Engaged","color":"green"},{"value":"customer","label":"Customer","color":"blue"}]'::jsonb, true, true, true),
    (gen_random_uuid(), v_leads_id, 'last_interaction', 'Last Interaction', 'date', 8, 160, 'notes_last_updated', NULL, NULL, NULL, NULL, true, true, true),
    (gen_random_uuid(), v_leads_id, 'created_at', 'Created', 'date', 9, 160, 'createdate', NULL, 'contacts', 'created_at', NULL, true, true, true);

  GET DIAGNOSTICS v_leads_columns_count = ROW_COUNT;

  INSERT INTO dynamic_table_views (
    id, table_id, created_by, name, is_system
  ) VALUES (
    gen_random_uuid(), v_leads_id, p_user_id, 'All Leads', true
  );

  -- =========================================================================
  -- Create Meetings table
  -- =========================================================================
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
    (gen_random_uuid(), v_meetings_id, 'contact_company', 'Company', 'company', 4, 180, 'hs_meeting_company', NULL, NULL, NULL, NULL, true, true, true),
    (gen_random_uuid(), v_meetings_id, 'sentiment', 'Sentiment', 'status', 5, 140, 'hs_call_sentiment', NULL, 'meetings', 'sentiment_score', '[{"value":"negative","label":"Negative","color":"red"},{"value":"neutral","label":"Neutral","color":"gray"},{"value":"positive","label":"Positive","color":"green"},{"value":"very_positive","label":"Very Positive","color":"blue"}]'::jsonb, true, true, true),
    (gen_random_uuid(), v_meetings_id, 'summary', 'Summary', 'text', 6, 300, 'hs_meeting_body', NULL, 'meetings', 'summary', NULL, true, true, true),
    (gen_random_uuid(), v_meetings_id, 'next_actions', 'Next Actions', 'tags', 7, 200, NULL, NULL, NULL, NULL, NULL, true, true, true),
    (gen_random_uuid(), v_meetings_id, 'owner', 'Owner', 'person', 8, 160, 'hubspot_owner_id', NULL, 'meetings', 'owner_user_id', NULL, true, true, true),
    (gen_random_uuid(), v_meetings_id, 'recording_url', 'Recording', 'url', 9, 120, NULL, NULL, 'meetings', 'share_url', NULL, true, true, true);

  GET DIAGNOSTICS v_meetings_columns_count = ROW_COUNT;

  INSERT INTO dynamic_table_views (
    id, table_id, created_by, name, is_system
  ) VALUES (
    gen_random_uuid(), v_meetings_id, p_user_id, 'All Meetings', true
  );

  -- =========================================================================
  -- Create All Contacts table
  -- =========================================================================
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
  ) VALUES (
    gen_random_uuid(), v_contacts_id, p_user_id, 'All Contacts', true
  );

  -- =========================================================================
  -- Create All Companies table
  -- =========================================================================
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
  ) VALUES (
    gen_random_uuid(), v_companies_id, p_user_id, 'All Companies', true
  );

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
