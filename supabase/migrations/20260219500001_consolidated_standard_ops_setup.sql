-- Consolidated Standard Ops Tables Setup
-- Ensures full schema exists (idempotent) and creates provision RPC
-- Combines all prior standard ops + dynamic tables migrations into one

-- ============================================================================
-- 0. Create base dynamic tables schema if missing
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.dynamic_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_query JSONB,
  row_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_table_name_per_org UNIQUE(organization_id, name)
);

CREATE TABLE IF NOT EXISTS public.dynamic_table_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES public.dynamic_tables(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  column_type TEXT NOT NULL DEFAULT 'text',
  is_enrichment BOOLEAN NOT NULL DEFAULT FALSE,
  enrichment_prompt TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  width INTEGER NOT NULL DEFAULT 160,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_column_key_per_table UNIQUE(table_id, key)
);

CREATE TABLE IF NOT EXISTS public.dynamic_table_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES public.dynamic_tables(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL DEFAULT 0,
  source_id TEXT,
  source_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.dynamic_table_cells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  row_id UUID NOT NULL REFERENCES public.dynamic_table_rows(id) ON DELETE CASCADE,
  column_id UUID NOT NULL REFERENCES public.dynamic_table_columns(id) ON DELETE CASCADE,
  value TEXT,
  confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  source TEXT,
  status TEXT NOT NULL DEFAULT 'none' CHECK (status IN ('none', 'pending', 'complete', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_cell_per_row_column UNIQUE(row_id, column_id)
);

CREATE TABLE IF NOT EXISTS public.dynamic_table_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES public.dynamic_tables(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  filter_config JSONB DEFAULT '[]'::jsonb,
  sort_config JSONB,
  column_config JSONB,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_dynamic_tables_org_id ON public.dynamic_tables(organization_id);
CREATE INDEX IF NOT EXISTS idx_dynamic_table_columns_table_id ON public.dynamic_table_columns(table_id, position);
CREATE INDEX IF NOT EXISTS idx_dynamic_table_rows_table_id ON public.dynamic_table_rows(table_id, row_index);
CREATE INDEX IF NOT EXISTS idx_dynamic_table_rows_source_id ON public.dynamic_table_rows(source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dynamic_table_cells_row_id ON public.dynamic_table_cells(row_id);
CREATE INDEX IF NOT EXISTS idx_dynamic_table_cells_column_id ON public.dynamic_table_cells(column_id);
CREATE INDEX IF NOT EXISTS idx_dynamic_table_views_table_id ON public.dynamic_table_views(table_id, position);

-- RLS
ALTER TABLE public.dynamic_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dynamic_table_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dynamic_table_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dynamic_table_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dynamic_table_views ENABLE ROW LEVEL SECURITY;

-- Service role policies (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='dynamic_tables' AND policyname='Service role full access to dynamic_tables') THEN
    CREATE POLICY "Service role full access to dynamic_tables" ON public.dynamic_tables FOR ALL USING (auth.role()='service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='dynamic_table_columns' AND policyname='Service role full access to dynamic_table_columns') THEN
    CREATE POLICY "Service role full access to dynamic_table_columns" ON public.dynamic_table_columns FOR ALL USING (auth.role()='service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='dynamic_table_rows' AND policyname='Service role full access to dynamic_table_rows') THEN
    CREATE POLICY "Service role full access to dynamic_table_rows" ON public.dynamic_table_rows FOR ALL USING (auth.role()='service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='dynamic_table_cells' AND policyname='Service role full access to dynamic_table_cells') THEN
    CREATE POLICY "Service role full access to dynamic_table_cells" ON public.dynamic_table_cells FOR ALL USING (auth.role()='service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='dynamic_table_views' AND policyname='Service role full access to views') THEN
    CREATE POLICY "Service role full access to views" ON public.dynamic_table_views FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
  END IF;
END $$;

-- Row count trigger
CREATE OR REPLACE FUNCTION update_dynamic_table_row_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.dynamic_tables SET row_count = row_count + 1 WHERE id = NEW.table_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.dynamic_tables SET row_count = GREATEST(row_count - 1, 0) WHERE id = OLD.table_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_dynamic_table_row_count ON public.dynamic_table_rows;
CREATE TRIGGER trigger_update_dynamic_table_row_count
  AFTER INSERT OR DELETE ON public.dynamic_table_rows
  FOR EACH ROW
  EXECUTE FUNCTION update_dynamic_table_row_count();

-- ============================================================================
-- 1. Extend dynamic_tables schema for standard ops
-- ============================================================================

-- Add is_standard flag
ALTER TABLE public.dynamic_tables
  ADD COLUMN IF NOT EXISTS is_standard BOOLEAN NOT NULL DEFAULT false;

-- Add source_type values
ALTER TABLE public.dynamic_tables
  DROP CONSTRAINT IF EXISTS dynamic_tables_source_type_check;

ALTER TABLE public.dynamic_tables
  ADD CONSTRAINT dynamic_tables_source_type_check
  CHECK (source_type IN (
    'manual', 'apollo', 'csv', 'copilot',
    'hubspot', 'attio', 'ops_table', 'standard'
  ));

-- Add system/locked/source columns to dynamic_table_columns
ALTER TABLE public.dynamic_table_columns
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.dynamic_table_columns
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.dynamic_table_columns
  ADD COLUMN IF NOT EXISTS hubspot_property_name TEXT;

ALTER TABLE public.dynamic_table_columns
  ADD COLUMN IF NOT EXISTS attio_property_name TEXT;

ALTER TABLE public.dynamic_table_columns
  ADD COLUMN IF NOT EXISTS app_source_table TEXT;

ALTER TABLE public.dynamic_table_columns
  ADD COLUMN IF NOT EXISTS app_source_column TEXT;

-- Add source tracking to dynamic_table_rows
ALTER TABLE public.dynamic_table_rows
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE public.dynamic_table_rows
  ADD COLUMN IF NOT EXISTS source_id TEXT;

-- Add meeting_id and meeting_outcome to leads table
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS meeting_id UUID REFERENCES public.meetings(id) ON DELETE SET NULL;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS meeting_outcome TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_meeting_id ON public.leads(meeting_id);
CREATE INDEX IF NOT EXISTS idx_leads_meeting_outcome ON public.leads(meeting_outcome);

-- ============================================================================
-- 2. Prevent deletion of standard tables (RLS)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'dynamic_tables' AND policyname = 'Prevent deletion of standard tables'
  ) THEN
    CREATE POLICY "Prevent deletion of standard tables"
      ON public.dynamic_tables
      FOR DELETE
      USING (is_standard = false);
  END IF;
END $$;

-- ============================================================================
-- 3. Create provision RPC (latest version with contact_name + contact_email)
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
