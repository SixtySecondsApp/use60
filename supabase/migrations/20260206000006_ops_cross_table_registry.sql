-- OI-020: Cross-Table Data Source Registry
CREATE OR REPLACE FUNCTION get_available_data_sources(p_table_id UUID)
RETURNS TABLE (source_name TEXT, source_type TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dt.name AS source_name,
    'ops_table'::TEXT AS source_type
  FROM dynamic_tables dt
  WHERE dt.org_id = (SELECT org_id FROM dynamic_tables WHERE id = p_table_id)
    AND dt.id != p_table_id
  UNION ALL
  SELECT 'contacts'::TEXT, 'crm'::TEXT
  UNION ALL
  SELECT 'deals'::TEXT, 'crm'::TEXT
  UNION ALL
  SELECT 'companies'::TEXT, 'crm'::TEXT
  UNION ALL
  SELECT 'activities'::TEXT, 'crm'::TEXT
  UNION ALL
  SELECT 'meetings'::TEXT, 'meetings'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
