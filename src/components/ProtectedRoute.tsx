import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOnboardingProgress } from '@/lib/hooks/useOnboardingProgress';
import { Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';

interface ProtectedRouteProps {
  children: React.ReactNode;
  redirectTo?: string;
}

const publicRoutes = [
  '/auth/login',
  '/auth/signup',
  '/auth/invite-signup',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/callback',
  '/auth/sso-callback',
  '/auth/verify-email',
  '/auth/set-password', // Waitlist invite password setup - auth handled internally
  '/auth/pending-approval', // Join request pending approval - auth handled internally
  '/auth/accept-join-request', // Join request acceptance - handled in the page
  '/debug-auth',
  '/auth/google/callback',
  '/oauth/fathom/callback',
  '/waitlist',
  '/pricing',
  '/intro',
  '/introduction',
  '/learnmore'
];

// Check if a route is a public waitlist route (including sub-routes)
const isPublicWaitlistRoute = (pathname: string): boolean => {
  return pathname === '/waitlist' || 
         pathname.startsWith('/waitlist/status/') ||
         pathname === '/waitlist/leaderboard' ||
         pathname === '/leaderboard';
};

// Routes that require auth but should show loading instead of redirecting immediately
const authRequiredRoutes = [
  '/onboarding',
  '/meetings',
  '/dashboard',
  '/'
];

// Routes that should NOT trigger onboarding redirect (allow completing onboarding)
// Also includes /platform/* routes to preserve them on refresh
const onboardingExemptRoutes = [
  '/onboarding',
  '/auth',
  '/debug',
  '/oauth',
  '/invite', // Invitation acceptance - users should complete this before onboarding
  '/platform' // All platform routes are exempt from onboarding redirect
];

// Helper to check if a route is exempt (including sub-routes)
const isOnboardingExemptRoute = (pathname: string): boolean => {
  return onboardingExemptRoutes.some(route => pathname.startsWith(route));
};

export function ProtectedRoute({ children, redirectTo = '/auth/login' }: ProtectedRouteProps) {
  const { isAuthenticated, loading, user } = useAuth();
  const { needsOnboarding, loading: onboardingLoading } = useOnboardingProgress();
  const navigate = useNavigate();
  const location = useLocation();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);
  const [isCheckingEmail, setIsCheckingEmail] = useState(true);
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [isCheckingProfileStatus, setIsCheckingProfileStatus] = useState(true);
  const [hasOrgMembership, setHasOrgMembership] = useState<boolean | null>(null);
  const [isCheckingOrgMembership, setIsCheckingOrgMembership] = useState(true);
  const [hasPendingRequest, setHasPendingRequest] = useState<boolean | null>(null);
  const [isCheckingPendingRequest, setIsCheckingPendingRequest] = useState(true);
  const redirectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isPublicRoute = publicRoutes.includes(location.pathname) || isPublicWaitlistRoute(location.pathname);
  const isVerifyEmailRoute = location.pathname === '/auth/verify-email';

  // Check both hash AND search params for password recovery indicators
  // Supabase uses different formats:
  // - token_hash in search params (modern)
  // - type=recovery in hash (legacy)
  // - code parameter (PKCE OAuth flow)
  // - path-based OTP tokens (e.g., /auth/reset-password/oob-code-xxx)
  const searchParams = new URLSearchParams(location.search);
  const hashParams = new URLSearchParams(location.hash.slice(1));
  const isResetPasswordPath = location.pathname === '/auth/reset-password' || location.pathname.startsWith('/auth/reset-password/');
  
  // Detect if this is a password recovery flow (with or without being on reset-password route yet)
  // This allows recovery token detection even before RecoveryTokenDetector redirects
  // Supports both modern (token_hash in search) and legacy (access_token in hash) flows
  const hasRecoveryTokens = (
    location.hash.includes('type=recovery') ||
    location.hash.includes('access_token') || // Legacy recovery with access token in hash
    searchParams.get('type') === 'recovery' ||
    searchParams.has('token_hash') ||
    searchParams.has('code') ||
    hashParams.get('type') === 'recovery' ||
    hashParams.has('access_token') // Legacy recovery
  );
  
  const isPasswordRecovery = isResetPasswordPath && hasRecoveryTokens;
  const isOAuthCallback = location.pathname.includes('/oauth/') || location.pathname.includes('/callback');
  const isAuthRequiredRoute = authRequiredRoutes.some(route =>
    location.pathname === route || location.pathname.startsWith(`${route  }/`)
  );
  const isOnboardingExempt = isOnboardingExemptRoute(location.pathname);

  // TEMPORARY DEV: Allow roadmap access in development for ticket implementation
  const isDevModeBypass = process.env.NODE_ENV === 'development' &&
    location.pathname.startsWith('/roadmap');

  // Check email verification status
  // Use user object from AuthContext instead of calling getSession() to avoid
  // potential auth state cascades and reduce redundant session fetches
  useEffect(() => {
    // Skip check for public routes
    if (isPublicRoute) {
      setIsCheckingEmail(false);
      return;
    }

    // Wait for auth to complete loading
    if (loading) {
      return;
    }

    // Use user from AuthContext instead of calling getSession()
    if (user) {
      setEmailVerified(!!(user as any).email_confirmed_at);
    } else {
      setEmailVerified(null);
    }
    setIsCheckingEmail(false);
  }, [loading, isPublicRoute, user]);

  // Check profile status for join request approval flow
  useEffect(() => {
    // Skip check for public routes
    if (isPublicRoute || !isAuthenticated || !user) {
      setIsCheckingProfileStatus(false);
      return;
    }

    // Wait for auth to complete loading
    if (loading) {
      return;
    }

    const checkProfileStatus = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('profile_status')
          .eq('id', user.id)
          .maybeSingle();

        if (!error && data) {
          const status = data.profile_status || 'active';
          console.log('[ProtectedRoute] Profile status check:', { userId: user.id, status });
          setProfileStatus(status);
        }
      } catch (err) {
        console.error('[ProtectedRoute] Error checking profile status:', err);
      } finally {
        setIsCheckingProfileStatus(false);
      }
    };

    checkProfileStatus();
  }, [isAuthenticated, user, loading, isPublicRoute]);

  // Check if user has organization membership
  // Users with no org membership must complete onboarding to get assigned to an org
  useEffect(() => {
    // Skip check for public routes
    if (isPublicRoute || !isAuthenticated || !user) {
      setIsCheckingOrgMembership(false);
      return;
    }

    // Wait for auth to complete loading
    if (loading) {
      return;
    }

    const checkOrgMembership = async () => {
      try {
        // Try query with member_status first (ORGREM-016)
        // If migration hasn't been applied, fall back to basic query
        let hasActiveMembership = false;

        // Try with member_status column
        const { data: dataWithStatus, error: errorWithStatus } = await supabase
          .from('organization_memberships')
          .select('org_id', { count: 'exact' })
          .eq('user_id', user.id)
          .eq('member_status', 'active'); // Only check for active memberships

        if (!errorWithStatus && dataWithStatus) {
          hasActiveMembership = dataWithStatus.length > 0;
        } else if (errorWithStatus) {
          // Column doesn't exist (42703 or 400 Bad Request) - check all memberships (assume all are active)
          console.log('[ProtectedRoute] member_status column not available, falling back to basic query');
          const { data: basicData, error: basicError } = await supabase
            .from('organization_memberships')
            .select('org_id', { count: 'exact' })
            .eq('user_id', user.id);

          if (!basicError && basicData) {
            hasActiveMembership = basicData.length > 0;
          } else if (basicError) {
            console.error('[ProtectedRoute] Basic membership query also failed:', basicError);
          }
        }

        console.log('[ProtectedRoute] Organization membership check:', { userId: user.id, hasActiveMembership });
        setHasOrgMembership(hasActiveMembership);
      } catch (err) {
        console.error('Error checking organization membership:', err);
      } finally {
        setIsCheckingOrgMembership(false);
      }
    };

    checkOrgMembership();
  }, [isAuthenticated, user, loading, isPublicRoute]);

  // Check if user has a pending join or rejoin request
  // This is important for users waiting for approval after requesting to join or rejoin
  useEffect(() => {
    if (isPublicRoute || !isAuthenticated || !user) {
      setIsCheckingPendingRequest(false);
      return;
    }

    if (loading) {
      return;
    }

    const checkPendingRequest = async () => {
      try {
        // Check organization_join_requests
        const { data: joinRequest } = await supabase
          .from('organization_join_requests')
          .select('id')
          .eq('user_id', user.id)
          .eq('status', 'pending')
          .maybeSingle();

        if (joinRequest) {
          console.log('[ProtectedRoute] Found pending join request');
          setHasPendingRequest(true);
          setIsCheckingPendingRequest(false);
          return;
        }

        // Check rejoin_requests
        const { data: rejoinRequest } = await supabase
          .from('rejoin_requests')
          .select('id')
          .eq('user_id', user.id)
          .eq('status', 'pending')
          .maybeSingle();

        if (rejoinRequest) {
          console.log('[ProtectedRoute] Found pending rejoin request');
          setHasPendingRequest(true);
          setIsCheckingPendingRequest(false);
          return;
        }

        console.log('[ProtectedRoute] No pending join/rejoin requests found');
        setHasPendingRequest(false);
      } catch (err) {
        console.error('[ProtectedRoute] Error checking pending requests:', err);
        setHasPendingRequest(false);
      } finally {
        setIsCheckingPendingRequest(false);
      }
    };

    checkPendingRequest();
  }, [isAuthenticated, user, loading, isPublicRoute]);

  useEffect(() => {
    // Clean up timeout on unmount
    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Don't redirect while loading auth, onboarding status, email verification, profile status, org membership, or pending requests
    if (loading || onboardingLoading || isCheckingEmail || isCheckingProfileStatus || isCheckingOrgMembership || isCheckingPendingRequest) return;

    // Check profile status for join request approval flow
    // CRITICAL: Check memberships BEFORE checking profile_status
    // If user has ANY active membership, allow dashboard access even if profile_status is pending
    // Only redirect to pending approval if profile_status is pending AND no memberships exist
    if (isAuthenticated && profileStatus === 'pending_approval' && !isPublicRoute && !isPasswordRecovery && !isOAuthCallback && !isVerifyEmailRoute) {
      // If user has active membership, they were approved - allow access and don't redirect
      if (hasOrgMembership === true) {
        console.log('[ProtectedRoute] User has active membership despite pending status, allowing access', { userId: user?.id, currentPath: location.pathname });
        // Don't redirect - user was approved and membership was created
        // Profile status will be updated by the approval flow
      } else if (hasOrgMembership === false) {
        // User is truly pending approval with no memberships - redirect to pending page
        console.log('[ProtectedRoute] User pending approval with no membership, redirecting to pending approval page', { userId: user?.id, currentPath: location.pathname });
        navigate('/auth/pending-approval', { replace: true });
        return;
      }
      // If hasOrgMembership is null (still checking), don't redirect yet
      return;
    }

    // If user's request was rejected, show error screen
    if (isAuthenticated && profileStatus === 'rejected' && !isPublicRoute && !isPasswordRecovery && !isOAuthCallback && !isVerifyEmailRoute) {
      navigate('/auth/request-rejected', { replace: true });
      return;
    }

    // CRITICAL: If user is authenticated and on a protected route, NEVER redirect them away
    // This preserves the current page on refresh
    const isProtectedRoute = !isPublicRoute && !isPasswordRecovery && !isOAuthCallback && !isVerifyEmailRoute;
    if (isAuthenticated && emailVerified && isProtectedRoute) {
      // CRITICAL: If user has NO organization membership, check for pending requests first
      // This ensures users waiting for approval stay on the pending page instead of being sent to onboarding
      if (hasOrgMembership === false && !isOnboardingExempt) {
        // Check if user has a pending join or rejoin request
        if (hasPendingRequest === true) {
          console.log('[ProtectedRoute] User has no active org membership but has pending request, redirecting to pending approval');
          navigate('/auth/pending-approval', { replace: true });
          return;
        }

        // No pending request - send to onboarding
        console.log('[ProtectedRoute] User has no active org membership and no pending request, redirecting to onboarding');
        navigate('/onboarding', { replace: true });
        return;
      }

      // If org membership check is still in progress AND this is a dashboard access attempt,
      // show loading state instead of allowing access
      if (isCheckingOrgMembership && (location.pathname === '/dashboard' || location.pathname.startsWith('/dashboard/'))) {
        // Block access to dashboard while checking membership
        return;
      }

      // User is authenticated and on a protected route - allow them to stay
      // Only redirect if they need onboarding and this route is not exempt
      if (needsOnboarding && !isOnboardingExempt) {
        navigate('/onboarding', { replace: true });
      }
      // Otherwise, let them stay on their current route
      return;
    }

    // If user is authenticated but email is not verified, redirect to verify-email
    // Skip this for public routes and the verify-email page itself
    if (isAuthenticated && emailVerified === false && !isPublicRoute && !isVerifyEmailRoute) {
      const userEmail = user?.email || '';
      navigate(`/auth/verify-email?email=${encodeURIComponent(userEmail)}`, { replace: true });
      return;
    }

    // If user is authenticated (and email verified) and on a public route (except password recovery and OAuth callbacks), redirect to app
    // Exception: Don't redirect from /learnmore - let authenticated users view it if they want
    if (isAuthenticated && emailVerified && isPublicRoute && !isPasswordRecovery && !isOAuthCallback && !isVerifyEmailRoute && location.pathname !== '/learnmore') {
      // If user needs onboarding, redirect to onboarding instead of app
      if (needsOnboarding) {
        navigate('/onboarding', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
      return;
    }

    // If user is not authenticated and trying to access protected route, redirect to login
    // TEMPORARY DEV: Skip redirect for roadmap in development
    // ALSO: Allow password recovery flows even if not authenticated
    if (!isAuthenticated && !isPublicRoute && !isPasswordRecovery && !hasRecoveryTokens && !isDevModeBypass) {
      // For auth-required routes, add a small delay to allow for race conditions
      // This helps when navigating from onboarding where auth state might momentarily be stale
      if (isAuthRequiredRoute && !isRedirecting) {
        setIsRedirecting(true);
        redirectTimeoutRef.current = setTimeout(() => {
          // Re-check auth state after delay
          if (!isAuthenticated) {
            const intendedPath = location.pathname + location.search;
            navigate(redirectTo, {
              state: { from: intendedPath },
              replace: true
            });
          }
          setIsRedirecting(false);
        }, 500); // Small delay to allow auth state to settle
        return;
      }

      // Store the intended destination for after login
      const intendedPath = location.pathname + location.search;
      navigate(redirectTo, {
        state: { from: intendedPath },
        replace: true
      });
      return;
    }
  }, [isAuthenticated, loading, onboardingLoading, isCheckingEmail, isCheckingProfileStatus, isCheckingOrgMembership, isCheckingPendingRequest, profileStatus, hasOrgMembership, hasPendingRequest, emailVerified, needsOnboarding, isPublicRoute, isVerifyEmailRoute, isPasswordRecovery, hasRecoveryTokens, isDevModeBypass, isAuthRequiredRoute, isOnboardingExempt, navigate, redirectTo, location, isRedirecting, user?.email]);

  // Show loading spinner while checking authentication, onboarding status, email verification, profile status, org membership, pending requests, or during redirect delay
  if (loading || onboardingLoading || isCheckingEmail || isCheckingProfileStatus || isCheckingOrgMembership || isCheckingPendingRequest || isRedirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(74,74,117,0.25),transparent)] pointer-events-none" />
        <Loader2 className="w-8 h-8 text-[#37bd7e] animate-spin" />
      </div>
    );
  }

  // For password recovery, always show the content regardless of auth state
  // This includes both /auth/reset-password paths AND recovery tokens on other paths
  if (isPasswordRecovery || hasRecoveryTokens) {
    return <>{children}</>;
  }

  // For public routes, show content if not authenticated or if authenticated (AuthContext will handle redirect)
  if (isPublicRoute) {
    return <>{children}</>;
  }

  // For protected routes, only show content if authenticated
  // TEMPORARY DEV: Allow roadmap access in development
  if (isAuthenticated || isDevModeBypass) {
    return <>{children}</>;
  }

  // Show loading instead of null to prevent flash
  // The useEffect will handle the redirect
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(74,74,117,0.25),transparent)] pointer-events-none" />
      <Loader2 className="w-8 h-8 text-[#37bd7e] animate-spin" />
    </div>
  );
} 