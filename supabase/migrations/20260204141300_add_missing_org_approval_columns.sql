-- Add missing approval columns to organizations table
-- These were supposed to be added in 20260130110400 but that migration wasn't applied

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS similar_to_org_id uuid REFERENCES organizations(id);

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS requires_admin_approval boolean DEFAULT false;

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS approval_status text
CHECK (approval_status IN ('pending', 'approved', 'rejected'));

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES profiles(id);

-- Create index for filtering pending approvals
CREATE INDEX IF NOT EXISTS idx_orgs_approval_status
ON organizations(approval_status)
WHERE requires_admin_approval = true;

-- Add comments
COMMENT ON COLUMN organizations.similar_to_org_id IS 'Reference to existing organization with similar name (for admin review)';
COMMENT ON COLUMN organizations.requires_admin_approval IS 'True if org creation needs admin review due to similar existing org';
COMMENT ON COLUMN organizations.approval_status IS 'Status of organization approval (pending, approved, or rejected)';
COMMENT ON COLUMN organizations.approved_by IS 'User who approved this organization';
