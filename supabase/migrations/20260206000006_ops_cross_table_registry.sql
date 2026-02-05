-- OI-020: Create cross-table data source registry helpers
-- Helper functions for discovering available data sources for cross-table queries

-- Function to get all available data sources for an org
CREATE OR REPLACE FUNCTION get_available_data_sources(p_org_id UUID)
RETURNS TABLE (
  source_type TEXT,
  source_name TEXT,
  source_id UUID,
  fields JSONB,
  joinable_keys TEXT[]
) AS $$
BEGIN
  -- Return ops tables
  RETURN QUERY
  SELECT
    'ops_table'::TEXT AS source_type,
    dt.name AS source_name,
    dt.id AS source_id,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'key', col.key,
          'name', col.name,
          'column_type', col.column_type
        )
      )
      FROM dynamic_table_columns col
      WHERE col.table_id = dt.id
    ) AS fields,
    ARRAY['email', 'company', 'domain', 'linkedin_url']::TEXT[] AS joinable_keys
  FROM dynamic_tables dt
  WHERE dt.org_id = p_org_id;

  -- Return CRM sources (contacts, deals, companies, activities)
  RETURN QUERY
  SELECT
    'crm_contacts'::TEXT,
    'Contacts'::TEXT,
    NULL::UUID,
    '[
      {"key": "email", "name": "Email", "column_type": "email"},
      {"key": "first_name", "name": "First Name", "column_type": "text"},
      {"key": "last_name", "name": "Last Name", "column_type": "text"},
      {"key": "company", "name": "Company", "column_type": "text"},
      {"key": "linkedin_url", "name": "LinkedIn URL", "column_type": "url"}
    ]'::JSONB,
    ARRAY['email', 'linkedin_url', 'company']::TEXT[];

  RETURN QUERY
  SELECT
    'crm_deals'::TEXT,
    'Deals'::TEXT,
    NULL::UUID,
    '[
      {"key": "name", "name": "Deal Name", "column_type": "text"},
      {"key": "value", "name": "Value", "column_type": "number"},
      {"key": "stage", "name": "Stage", "column_type": "text"},
      {"key": "owner_id", "name": "Owner ID", "column_type": "uuid"},
      {"key": "company_id", "name": "Company ID", "column_type": "uuid"}
    ]'::JSONB,
    ARRAY['company_id']::TEXT[];

  RETURN QUERY
  SELECT
    'crm_companies'::TEXT,
    'Companies'::TEXT,
    NULL::UUID,
    '[
      {"key": "name", "name": "Company Name", "column_type": "text"},
      {"key": "domain", "name": "Domain", "column_type": "text"},
      {"key": "industry", "name": "Industry", "column_type": "text"},
      {"key": "employee_count", "name": "Employee Count", "column_type": "number"}
    ]'::JSONB,
    ARRAY['domain', 'name']::TEXT[];

  RETURN QUERY
  SELECT
    'crm_activities'::TEXT,
    'Activities'::TEXT,
    NULL::UUID,
    '[
      {"key": "contact_id", "name": "Contact ID", "column_type": "uuid"},
      {"key": "deal_id", "name": "Deal ID", "column_type": "uuid"},
      {"key": "activity_type", "name": "Activity Type", "column_type": "text"},
      {"key": "created_at", "name": "Created At", "column_type": "timestamp"}
    ]'::JSONB,
    ARRAY['contact_id', 'deal_id']::TEXT[];

  -- Check if org has meeting integrations
  IF EXISTS (
    SELECT 1 FROM organization_members om
    JOIN profiles p ON p.id = om.user_id
    WHERE om.organization_id = p_org_id
      AND (p.fathom_connected = true OR p.notetaker_enabled = true)
  ) THEN
    RETURN QUERY
    SELECT
      'meetings'::TEXT,
      'Meetings'::TEXT,
      NULL::UUID,
      '[
        {"key": "title", "name": "Title", "column_type": "text"},
        {"key": "start_time", "name": "Start Time", "column_type": "timestamp"},
        {"key": "transcript", "name": "Transcript", "column_type": "text"},
        {"key": "attendee_emails", "name": "Attendees", "column_type": "array"}
      ]'::JSONB,
      ARRAY['attendee_emails']::TEXT[];
  END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to resolve a data source reference
CREATE OR REPLACE FUNCTION resolve_data_source(
  p_org_id UUID,
  p_source_ref TEXT
)
RETURNS TABLE (
  source_type TEXT,
  source_name TEXT,
  source_id UUID,
  fields JSONB,
  joinable_keys TEXT[]
) AS $$
BEGIN
  -- Try to match by table name or ID
  RETURN QUERY
  SELECT * FROM get_available_data_sources(p_org_id)
  WHERE source_name ILIKE p_source_ref
    OR source_id::TEXT = p_source_ref
    OR source_type = p_source_ref;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON FUNCTION get_available_data_sources IS 'Returns all queryable data sources for an org (ops tables, CRM, meetings)';
COMMENT ON FUNCTION resolve_data_source IS 'Resolves a data source reference to its full metadata';
