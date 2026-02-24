-- Migration: Replace primary_contact with contact_name + contact_email columns on Meetings
-- Also update provision RPC with corrected columns
-- This sources contact info from meeting_attendees instead of primary_contact_id FK

-- ============================================================================
-- 1. Update existing standard Meetings tables
-- ============================================================================

DO $$
DECLARE
  tbl RECORD;
  old_col_id UUID;
BEGIN
  -- Find all standard Meetings tables
  FOR tbl IN
    SELECT id FROM public.dynamic_tables WHERE name = 'Meetings' AND is_standard = true
  LOOP
    -- Delete old primary_contact column and its cells
    SELECT id INTO old_col_id
      FROM public.dynamic_table_columns
      WHERE table_id = tbl.id AND key = 'primary_contact';

    IF old_col_id IS NOT NULL THEN
      DELETE FROM public.dynamic_table_cells WHERE column_id = old_col_id;
      DELETE FROM public.dynamic_table_columns WHERE id = old_col_id;
    END IF;

    -- Insert contact_name column (position 3)
    INSERT INTO public.dynamic_table_columns (table_id, key, label, column_type, is_system, is_locked, position, width, is_visible, app_source_table, app_source_column)
    VALUES (tbl.id, 'contact_name', 'Contact', 'text', true, true, 3, 200, true, 'meeting_attendees', 'name')
    ON CONFLICT DO NOTHING;

    -- Insert contact_email column (position 4)
    INSERT INTO public.dynamic_table_columns (table_id, key, label, column_type, is_system, is_locked, position, width, is_visible, app_source_table, app_source_column)
    VALUES (tbl.id, 'contact_email', 'Email', 'email', true, true, 4, 220, true, 'meeting_attendees', 'email')
    ON CONFLICT DO NOTHING;

    -- Shift existing columns: contact_company 4→5, sentiment 5→6, summary 6→7,
    -- next_actions 7→8, owner 8→9, recording_url 9→10, transcript 10→11
    UPDATE public.dynamic_table_columns SET position = 5 WHERE table_id = tbl.id AND key = 'contact_company';
    UPDATE public.dynamic_table_columns SET position = 6 WHERE table_id = tbl.id AND key = 'sentiment';
    UPDATE public.dynamic_table_columns SET position = 7 WHERE table_id = tbl.id AND key = 'summary';
    UPDATE public.dynamic_table_columns SET position = 8 WHERE table_id = tbl.id AND key = 'next_actions';
    UPDATE public.dynamic_table_columns SET position = 9 WHERE table_id = tbl.id AND key = 'owner';
    UPDATE public.dynamic_table_columns SET position = 10 WHERE table_id = tbl.id AND key = 'recording_url';
    UPDATE public.dynamic_table_columns SET position = 11 WHERE table_id = tbl.id AND key = 'transcript';
  END LOOP;
END $$;

-- ============================================================================
-- 2. Replace provision RPC with updated Meetings columns
-- ============================================================================

DROP FUNCTION IF EXISTS provision_standard_ops_tables(UUID, UUID);

CREATE OR REPLACE FUNCTION provision_standard_ops_tables(
  p_org_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_table_id UUID;
  v_result JSONB := '[]'::JSONB;
  v_table_entry JSONB;
BEGIN
  -- ========== LEADS TABLE ==========
  SELECT id INTO v_table_id FROM public.dynamic_tables
    WHERE organization_id = p_org_id AND name = 'Leads' AND is_standard = true;

  IF v_table_id IS NULL THEN
    INSERT INTO public.dynamic_tables (organization_id, name, description, source_type, is_standard, created_by)
    VALUES (p_org_id, 'Leads', 'Booking-sourced leads from scheduling links, with meeting context and status tracking', 'standard', true, p_user_id)
    RETURNING id INTO v_table_id;

    INSERT INTO public.dynamic_table_columns (table_id, key, label, column_type, is_system, is_locked, position, width, is_visible, app_source_table, app_source_column) VALUES
      (v_table_id, 'contact_name', 'Contact Name', 'text', true, true, 0, 200, true, 'leads', 'contact_name'),
      (v_table_id, 'contact_email', 'Email', 'email', true, true, 1, 220, true, 'leads', 'contact_email'),
      (v_table_id, 'domain', 'Domain', 'url', true, true, 2, 180, true, 'leads', 'domain'),
      (v_table_id, 'meeting_title', 'Meeting', 'text', true, true, 3, 220, true, 'leads', 'meeting_title'),
      (v_table_id, 'meeting_start', 'Meeting Date', 'date', true, true, 4, 160, true, 'leads', 'meeting_start'),
      (v_table_id, 'source', 'Source', 'text', true, true, 5, 140, true, 'leads', 'external_source'),
      (v_table_id, 'status', 'Status', 'status', true, true, 6, 140, true, 'leads', 'status'),
      (v_table_id, 'priority', 'Priority', 'status', true, true, 7, 120, true, 'leads', 'priority'),
      (v_table_id, 'owner', 'Owner', 'person', true, true, 8, 160, true, 'leads', 'owner_id'),
      (v_table_id, 'meeting_outcome', 'Meeting Outcome', 'status', true, true, 9, 160, true, 'leads', 'meeting_outcome'),
      (v_table_id, 'created_at', 'Created', 'date', true, true, 10, 160, true, 'leads', 'created_at');

    INSERT INTO public.dynamic_table_views (table_id, name, is_default, sort_config, column_config) VALUES
      (v_table_id, 'All Leads', true, '{"column":"created_at","direction":"desc"}', '["contact_name","contact_email","domain","meeting_title","meeting_start","source","status","meeting_outcome","priority","owner","created_at"]'),
      (v_table_id, 'Upcoming Meetings', false, '{"column":"meeting_start","direction":"asc"}', '["contact_name","contact_email","domain","meeting_title","meeting_start","meeting_outcome","status","priority"]'),
      (v_table_id, 'No Shows & Reschedules', false, '{"column":"meeting_start","direction":"desc"}', '["contact_name","contact_email","meeting_title","meeting_start","meeting_outcome","status","owner"]'),
      (v_table_id, 'High Priority', false, '{"column":"created_at","direction":"desc"}', '["contact_name","contact_email","meeting_title","meeting_start","status","meeting_outcome","priority"]');
  END IF;

  v_table_entry := jsonb_build_object('table', 'Leads', 'id', v_table_id);
  v_result := v_result || v_table_entry;

  -- ========== MEETINGS TABLE ==========
  v_table_id := NULL;
  SELECT id INTO v_table_id FROM public.dynamic_tables
    WHERE organization_id = p_org_id AND name = 'Meetings' AND is_standard = true;

  IF v_table_id IS NULL THEN
    INSERT INTO public.dynamic_tables (organization_id, name, description, source_type, is_standard, created_by)
    VALUES (p_org_id, 'Meetings', 'Unified meeting history with recording metadata and next actions', 'standard', true, p_user_id)
    RETURNING id INTO v_table_id;

    INSERT INTO public.dynamic_table_columns (table_id, key, label, column_type, is_system, is_locked, position, width, is_visible, app_source_table, app_source_column) VALUES
      (v_table_id, 'title', 'Title', 'text', true, true, 0, 250, true, 'meetings', 'title'),
      (v_table_id, 'meeting_date', 'Meeting Date', 'date', true, true, 1, 160, true, 'meetings', 'start_time'),
      (v_table_id, 'duration_minutes', 'Duration (min)', 'number', true, true, 2, 140, true, 'meetings', 'duration_minutes'),
      (v_table_id, 'contact_name', 'Contact', 'text', true, true, 3, 200, true, 'meeting_attendees', 'name'),
      (v_table_id, 'contact_email', 'Email', 'email', true, true, 4, 220, true, 'meeting_attendees', 'email'),
      (v_table_id, 'contact_company', 'Company', 'company', true, true, 5, 180, true, 'meetings', 'company_id'),
      (v_table_id, 'sentiment', 'Sentiment', 'status', true, true, 6, 140, true, 'meetings', 'sentiment_score'),
      (v_table_id, 'summary', 'Summary', 'text', true, true, 7, 300, true, 'meetings', 'summary'),
      (v_table_id, 'next_actions', 'Next Actions', 'tags', true, true, 8, 200, true, NULL, NULL),
      (v_table_id, 'owner', 'Owner', 'person', true, true, 9, 160, true, 'meetings', 'owner_user_id'),
      (v_table_id, 'recording_url', 'Recording', 'url', true, true, 10, 120, true, 'meetings', 'share_url'),
      (v_table_id, 'transcript', 'Transcript', 'text', true, true, 11, 300, true, 'meetings', 'transcript_text');

    INSERT INTO public.dynamic_table_views (table_id, name, is_default, sort_config, column_config) VALUES
      (v_table_id, 'All Meetings', true, '{"column":"meeting_date","direction":"desc"}', '["title","meeting_date","duration_minutes","contact_name","contact_email","contact_company","sentiment","owner","recording_url"]'),
      (v_table_id, 'This Week', false, '{"column":"meeting_date","direction":"desc"}', '["title","meeting_date","contact_name","contact_email","sentiment","next_actions"]'),
      (v_table_id, 'Needs Follow-up', false, '{"column":"meeting_date","direction":"desc"}', '["title","meeting_date","contact_name","contact_email","next_actions","owner"]');
  END IF;

  v_table_entry := jsonb_build_object('table', 'Meetings', 'id', v_table_id);
  v_result := v_result || v_table_entry;

  -- ========== ALL CONTACTS TABLE ==========
  v_table_id := NULL;
  SELECT id INTO v_table_id FROM public.dynamic_tables
    WHERE organization_id = p_org_id AND name = 'All Contacts' AND is_standard = true;

  IF v_table_id IS NULL THEN
    INSERT INTO public.dynamic_tables (organization_id, name, description, source_type, is_standard, created_by)
    VALUES (p_org_id, 'All Contacts', 'Universal CRM contacts mirror with app contacts and aggregated signals', 'standard', true, p_user_id)
    RETURNING id INTO v_table_id;

    INSERT INTO public.dynamic_table_columns (table_id, key, label, column_type, is_system, is_locked, position, width, is_visible, app_source_table, app_source_column, hubspot_property_name, attio_property_name) VALUES
      (v_table_id, 'crm_id', 'CRM ID', 'text', true, true, 0, 140, true, NULL, NULL, 'vid', 'id'),
      (v_table_id, 'first_name', 'First Name', 'text', true, true, 1, 160, true, 'contacts', 'first_name', 'firstname', 'first_name'),
      (v_table_id, 'last_name', 'Last Name', 'text', true, true, 2, 160, true, 'contacts', 'last_name', 'lastname', 'last_name'),
      (v_table_id, 'email', 'Email', 'email', true, true, 3, 220, true, 'contacts', 'email', 'email', 'email_addresses'),
      (v_table_id, 'company_name', 'Company', 'company', true, true, 4, 200, true, 'companies', 'name', 'company', 'company_name'),
      (v_table_id, 'title', 'Title', 'text', true, true, 5, 180, true, 'contacts', 'title', 'jobtitle', 'job_title'),
      (v_table_id, 'phone', 'Phone', 'phone', true, true, 6, 160, true, 'contacts', 'phone', 'phone', 'phone_numbers'),
      (v_table_id, 'linkedin_url', 'LinkedIn', 'linkedin', true, true, 7, 160, true, 'contacts', 'linkedin_url', 'hs_linkedinid', 'linkedin'),
      (v_table_id, 'last_engagement', 'Last Engagement', 'date', true, true, 8, 160, true, NULL, NULL, 'notes_last_updated', NULL),
      (v_table_id, 'lifecycle_stage', 'Lifecycle Stage', 'status', true, true, 9, 160, true, NULL, NULL, 'lifecyclestage', 'status'),
      (v_table_id, 'recent_signals', 'Recent Signals', 'tags', true, true, 10, 200, true, NULL, NULL, NULL, NULL),
      (v_table_id, 'sync_status', 'Sync Status', 'status', true, true, 11, 140, true, NULL, NULL, NULL, NULL);

    INSERT INTO public.dynamic_table_views (table_id, name, is_default, sort_config, column_config) VALUES
      (v_table_id, 'All Contacts', true, '{"column":"last_engagement","direction":"desc"}', '["first_name","last_name","email","company_name","title","lifecycle_stage","last_engagement","sync_status"]'),
      (v_table_id, 'Recently Active', false, '{"column":"last_engagement","direction":"desc"}', '["first_name","last_name","email","company_name","last_engagement","recent_signals"]'),
      (v_table_id, 'Sync Issues', false, '{"column":"last_engagement","direction":"desc"}', '["first_name","last_name","email","company_name","sync_status","crm_id"]');
  END IF;

  v_table_entry := jsonb_build_object('table', 'All Contacts', 'id', v_table_id);
  v_result := v_result || v_table_entry;

  -- ========== ALL COMPANIES TABLE ==========
  v_table_id := NULL;
  SELECT id INTO v_table_id FROM public.dynamic_tables
    WHERE organization_id = p_org_id AND name = 'All Companies' AND is_standard = true;

  IF v_table_id IS NULL THEN
    INSERT INTO public.dynamic_tables (organization_id, name, description, source_type, is_standard, created_by)
    VALUES (p_org_id, 'All Companies', 'Unified company data from app, CRM accounts, and enrichment', 'standard', true, p_user_id)
    RETURNING id INTO v_table_id;

    INSERT INTO public.dynamic_table_columns (table_id, key, label, column_type, is_system, is_locked, position, width, is_visible, app_source_table, app_source_column, hubspot_property_name, attio_property_name) VALUES
      (v_table_id, 'crm_id', 'CRM ID', 'text', true, true, 0, 140, true, NULL, NULL, 'companyId', 'id'),
      (v_table_id, 'name', 'Name', 'text', true, true, 1, 220, true, 'companies', 'name', 'name', 'name'),
      (v_table_id, 'domain', 'Domain', 'url', true, true, 2, 200, true, 'companies', 'domain', 'domain', 'domains'),
      (v_table_id, 'website', 'Website', 'url', true, true, 3, 200, true, 'companies', 'website', 'website', 'website'),
      (v_table_id, 'industry', 'Industry', 'text', true, true, 4, 180, true, 'companies', 'industry', 'industry', 'industry'),
      (v_table_id, 'company_size', 'Company Size', 'status', true, true, 5, 160, true, 'companies', 'size', 'numberofemployees', 'employee_count'),
      (v_table_id, 'phone', 'Phone', 'phone', true, true, 6, 160, true, 'companies', 'phone', 'phone', 'phone_numbers'),
      (v_table_id, 'linkedin_url', 'LinkedIn', 'linkedin', true, true, 7, 160, true, NULL, NULL, 'linkedin_company_page', 'linkedin'),
      (v_table_id, 'description', 'Description', 'text', true, true, 8, 300, true, 'companies', 'description', 'description', 'description'),
      (v_table_id, 'revenue', 'Revenue', 'number', true, true, 9, 140, true, NULL, NULL, 'annualrevenue', 'estimated_arr'),
      (v_table_id, 'active_contacts_count', 'Active Contacts', 'number', true, true, 10, 140, true, NULL, NULL, NULL, NULL),
      (v_table_id, 'last_contact_date', 'Last Contact', 'date', true, true, 11, 160, true, NULL, NULL, 'notes_last_updated', NULL);

    INSERT INTO public.dynamic_table_views (table_id, name, is_default, sort_config, column_config) VALUES
      (v_table_id, 'All Companies', true, '{"column":"name","direction":"asc"}', '["name","domain","industry","company_size","active_contacts_count","last_contact_date"]'),
      (v_table_id, 'Key Accounts', false, '{"column":"active_contacts_count","direction":"desc"}', '["name","domain","industry","active_contacts_count","revenue","last_contact_date"]'),
      (v_table_id, 'Needs Enrichment', false, '{"column":"name","direction":"asc"}', '["name","domain","industry","revenue","company_size"]');
  END IF;

  v_table_entry := jsonb_build_object('table', 'All Companies', 'id', v_table_id);
  v_result := v_result || v_table_entry;

  RETURN v_result;
END;
$$;
