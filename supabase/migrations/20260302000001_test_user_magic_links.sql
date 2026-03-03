-- Create test_user_magic_links table for admin-generated magic links
-- Admins generate links that pre-create an organization and allow test users
-- to sign up with minimal onboarding and optional pre-loaded credits.
-- Tokens expire after 7 days and can only be used once.

CREATE TABLE public.test_user_magic_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  is_test_user BOOLEAN NOT NULL DEFAULT false,
  credit_amount DECIMAL(12,4) NOT NULL DEFAULT 500,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  used_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  activated_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  org_name TEXT NOT NULL,

  CONSTRAINT token_not_empty CHECK (token != ''),
  CONSTRAINT valid_credit_amount CHECK (credit_amount >= 0)
);

-- Indexes for fast lookups
CREATE INDEX idx_test_magic_links_token ON public.test_user_magic_links(token);
CREATE INDEX idx_test_magic_links_email ON public.test_user_magic_links(email);
CREATE INDEX idx_test_magic_links_expires ON public.test_user_magic_links(expires_at);
CREATE INDEX idx_test_magic_links_created_by ON public.test_user_magic_links(created_by);

-- RLS
ALTER TABLE public.test_user_magic_links ENABLE ROW LEVEL SECURITY;

-- Service role can manage all tokens (create, update used_at, etc.)
CREATE POLICY "Service role can manage test links"
  ON public.test_user_magic_links
  AS PERMISSIVE FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Public can read unexpired, unused tokens (for validation during signup)
CREATE POLICY "Public can validate unexpired test links"
  ON public.test_user_magic_links
  AS PERMISSIVE FOR SELECT
  USING (expires_at > now() AND used_at IS NULL);

-- Platform admins can view all tokens (for management UI)
CREATE POLICY "Platform admins can view all test links"
  ON public.test_user_magic_links
  AS PERMISSIVE FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

COMMENT ON TABLE public.test_user_magic_links IS 'Admin-generated magic links for test user onboarding. Links pre-create an organization and optionally grant credits. Expire after 7 days, single use.';
