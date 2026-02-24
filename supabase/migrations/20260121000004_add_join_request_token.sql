-- Add token columns to organization_join_requests table for magic link approval flow

ALTER TABLE public.organization_join_requests
ADD COLUMN IF NOT EXISTS join_request_token text UNIQUE,
ADD COLUMN IF NOT EXISTS join_request_expires_at timestamptz;

-- Create index for efficient token lookups
CREATE INDEX IF NOT EXISTS idx_join_requests_token ON public.organization_join_requests(join_request_token)
WHERE join_request_token IS NOT NULL;

-- Add comments
COMMENT ON COLUMN public.organization_join_requests.join_request_token IS 'Magic link token for admin-approved requests. 64-char hex string. User clicks link to accept membership.';
COMMENT ON COLUMN public.organization_join_requests.join_request_expires_at IS 'Expiration time for the magic link token. Tokens expire after 7 days.';
