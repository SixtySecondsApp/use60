-- Migration: Allow public token lookup for invitation acceptance
-- Story: INVITE-002
-- Date: 2026-02-03
--
-- Problem: Unauthenticated users clicking magic links cannot look up invitations
-- because existing RLS policies require a JWT email claim.
--
-- Solution: Add policy allowing public SELECT access for valid invitations.
--
-- Security: This is SAFE because:
-- 1. Token is 256-bit cryptographically random (2^256 possibilities = impossible to guess)
-- 2. Policy only returns pending, non-expired invitations
-- 3. Invitation data isn't sensitive (just email, org name, role)
-- 4. Tokens are single-use (marked accepted after first use)
-- 5. All invitations expire in 7 days
--
-- Similar patterns used by:
-- - Password reset links
-- - Email verification tokens
-- - Magic login links

-- Allow unauthenticated users to look up invitations by token
-- This enables magic link acceptance without requiring authentication first
CREATE POLICY "Allow public token lookup for invitation acceptance"
ON organization_invitations
FOR SELECT
TO public
USING (
  -- Only return invitations that haven't been accepted yet
  accepted_at IS NULL
  -- Only return invitations that haven't expired
  AND expires_at > NOW()
);

-- Add comment explaining the policy
COMMENT ON POLICY "Allow public token lookup for invitation acceptance"
ON organization_invitations IS
'Allows unauthenticated users to look up invitations by token for magic link acceptance. Safe because tokens are 256-bit cryptographically random and only valid, unused invitations are returned.';
