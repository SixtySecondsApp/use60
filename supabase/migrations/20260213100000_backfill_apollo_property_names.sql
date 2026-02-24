-- Backfill apollo_property_name on existing Apollo-sourced table columns.
-- Maps standard column keys to their Apollo enrichment property names so that
-- "Enrich All" works on tables created before the backend was updated to always
-- set apollo_property_name.

UPDATE dynamic_table_columns
SET apollo_property_name = CASE key
  WHEN 'email'         THEN 'email'
  WHEN 'phone'         THEN 'phone'
  WHEN 'linkedin_url'  THEN 'linkedin_url'
  WHEN 'city'          THEN 'city'
  WHEN 'website_url'   THEN 'company_website'
  WHEN 'funding_stage' THEN 'company_funding'
  WHEN 'employees'     THEN 'company_employees'
END
WHERE apollo_property_name IS NULL
  AND key IN ('email', 'phone', 'linkedin_url', 'city', 'website_url', 'funding_stage', 'employees')
  AND table_id IN (
    SELECT id FROM dynamic_tables WHERE source_type = 'apollo'
  );
