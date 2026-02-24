-- ENRICH-001: Add last_enriched_at column for re-enrichment tracking

-- Add column to organizations table
ALTER TABLE organizations 
  ADD COLUMN IF NOT EXISTS last_enriched_at TIMESTAMPTZ;

-- Add column to organization_enrichment table
ALTER TABLE organization_enrichment
  ADD COLUMN IF NOT EXISTS enrichment_version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS previous_hash TEXT,
  ADD COLUMN IF NOT EXISTS change_summary JSONB;

-- Create index for finding orgs that need re-enrichment
CREATE INDEX IF NOT EXISTS idx_org_last_enriched 
  ON organizations(last_enriched_at) 
  WHERE company_website IS NOT NULL;

-- Update last_enriched_at when enrichment completes
CREATE OR REPLACE FUNCTION update_org_last_enriched()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    UPDATE organizations 
    SET last_enriched_at = NOW()
    WHERE id = NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_org_last_enriched ON organization_enrichment;
CREATE TRIGGER trigger_update_org_last_enriched
  AFTER INSERT OR UPDATE ON organization_enrichment
  FOR EACH ROW
  EXECUTE FUNCTION update_org_last_enriched();

-- Add comment
COMMENT ON COLUMN organizations.last_enriched_at IS 
  'Timestamp of last successful enrichment, used for periodic re-enrichment';
