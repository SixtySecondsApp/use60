-- Add email tracking fields to organization_invitations table
-- This enables tracking email delivery status and retry attempts

-- Add email_status column with enum constraint
ALTER TABLE organization_invitations
ADD COLUMN IF NOT EXISTS email_status text
CHECK (email_status IN ('pending', 'sent', 'failed', 'bounced'))
DEFAULT 'pending';

-- Add email_sent_at timestamp
ALTER TABLE organization_invitations
ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;

-- Add email_error for storing error messages
ALTER TABLE organization_invitations
ADD COLUMN IF NOT EXISTS email_error text;

-- Add resend_count to track retry attempts
ALTER TABLE organization_invitations
ADD COLUMN IF NOT EXISTS resend_count integer
DEFAULT 0;

-- Create index for filtering by email status
CREATE INDEX IF NOT EXISTS idx_invitations_email_status
ON organization_invitations(email_status)
WHERE email_status IN ('failed', 'pending');

-- Update existing invitations to 'sent' status (assume they were sent successfully)
UPDATE organization_invitations
SET email_status = 'sent',
    email_sent_at = created_at
WHERE email_status IS NULL
  OR email_status = 'pending';

-- Add comment for documentation
COMMENT ON COLUMN organization_invitations.email_status IS 'Tracks email delivery status: pending (not sent yet), sent (successfully delivered), failed (delivery error), bounced (recipient rejected)';
COMMENT ON COLUMN organization_invitations.resend_count IS 'Number of times email was resent (max 3 attempts recommended)';
