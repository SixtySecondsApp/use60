import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

/**
 * RecoveryTokenDetector - Detects password recovery tokens in URL and redirects to reset page
 * 
 * This component should be mounted near the root to intercept password recovery links
 * from Supabase before routing happens.
 * 
 * When recovery tokens are detected, it:
 * 1. Prevents any child rendering
 * 2. Redirects to /auth/reset-password with all tokens preserved
 * 3. Shows a loading spinner during redirect
 * 
 * Supabase sends users to the base domain with recovery tokens in the URL:
 * - token_hash in search params
 * - type=recovery in hash or search
 * - access_token in hash (legacy flow)
 * - code parameter (PKCE flow)
 */
export function RecoveryTokenDetector() {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Only check once on mount
    if (checked) return;
    
    // Check for recovery tokens in URL
    const searchParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash.substring(1);
    const hashParams = new URLSearchParams(hash);

    // Detect recovery indicators
    // Supports both modern (token_hash in search) and legacy (access_token in hash) flows
    const hasTokenHash = searchParams.has('token_hash');
    const hasRecoveryType = searchParams.get('type') === 'recovery' || hashParams.get('type') === 'recovery';
    const hasCode = searchParams.has('code');
    const hasAccessToken = searchParams.has('access_token') || hashParams.has('access_token');
    const hasAccessTokenInHash = window.location.hash.includes('access_token'); // Legacy flow indicator

    setChecked(true);

    // Check if this is an invite type (for waitlist invitations) - don't redirect these
    const typeParam = searchParams.get('type') || hashParams.get('type');
    const isInvite = typeParam === 'invite';

    // Check if URL has waitlist_entry parameter - this is an invitation callback
    const hasWaitlistEntry = searchParams.has('waitlist_entry');

    // If user is on base domain/path without recovery route but has recovery tokens, redirect
    // But DON'T redirect if it's an invite or if already on callback/set-password pages
    // Also exclude OAuth callbacks (Google, SSO, Fathom, etc.) which use 'code' parameter for different purpose
    if (
      (hasTokenHash || hasRecoveryType || hasCode || hasAccessToken || hasAccessTokenInHash) &&
      !window.location.pathname.startsWith('/auth/reset-password') &&
      !window.location.pathname.startsWith('/auth/callback') &&
      !window.location.pathname.startsWith('/auth/google/callback') &&
      !window.location.pathname.startsWith('/auth/sso-callback') &&
      !window.location.pathname.startsWith('/auth/set-password') &&
      !window.location.pathname.startsWith('/oauth/') &&
      !isInvite &&
      !hasWaitlistEntry
    ) {
      console.log('[RecoveryTokenDetector] Found recovery token, redirecting to reset page', {
        hasTokenHash,
        hasRecoveryType,
        hasCode,
        hasAccessToken,
        hasAccessTokenInHash,
        hash: window.location.hash.substring(0, 50)
      });

      // Do a full page redirect to reset-password, preserving hash
      // This ensures React Router re-initializes with the correct path
      const targetPath = `/auth/reset-password${window.location.search}${window.location.hash}`;
      window.location.href = targetPath;
    }
  }, [checked]);

  // This component only handles redirects, doesn't render anything
  return null;
}
