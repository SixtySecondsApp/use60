import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, authUtils, type Session, type User, type AuthError } from '../supabase/clientV2';
import { authLogger } from '../services/authLogger';
import { toast } from 'sonner';
import { getAuthRedirectUrl } from '@/lib/utils/siteUrl';
import logger from '@/lib/utils/logger';
import { setSentryUser, clearSentryUser } from '@/lib/sentry';
import { initAnalytics, identify, reset as resetAnalytics } from '@/lib/analytics';

// Check if Clerk auth is enabled via feature flag
const USE_CLERK_AUTH = import.meta.env.VITE_USE_CLERK_AUTH === 'true';

// Extended auth error type that includes verification status
interface ExtendedAuthError extends AuthError {
  requiresVerification?: boolean;
}

// Signup metadata interface - includes all fields sent during signup
export interface SignUpMetadata {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  company_domain?: string | null;
}

// Auth context types - shared between Supabase and Clerk implementations
export interface AuthContextType {
  // State
  user: User | null;
  session: Session | null;
  loading: boolean;

  // Actions
  signIn: (email: string, password: string) => Promise<{ error: ExtendedAuthError | null }>;
  signUp: (email: string, password: string, metadata?: SignUpMetadata) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<{ error: AuthError | null }>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
  updatePassword: (password: string) => Promise<{ error: AuthError | null }>;
  verifySecondFactor: (code: string) => Promise<{ error: AuthError | null }>;

  // Utilities
  isAuthenticated: boolean;
  userId: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Custom hook to use auth context
// This hook works with BOTH Supabase Auth and Clerk Auth based on feature flag
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Export the feature flag check for other components
export const isClerkAuthEnabled = () => USE_CLERK_AUTH;

// Auth provider component
interface AuthProviderProps {
  children: React.ReactNode;
}

// Import Clerk auth components when feature flag is enabled
// Note: ClerkProvider is already in main.tsx, so ClerkAuthProvider just uses hooks
import { ClerkAuthProvider, ClerkAuthContext } from './ClerkAuthContext';

/**
 * AuthProvider - Unified auth provider that delegates to either Supabase or Clerk
 *
 * When VITE_USE_CLERK_AUTH=true:
 * - Uses ClerkAuthProvider for authentication (ClerkProvider is already in main.tsx)
 * - Clerk handles user sessions, tokens, and auth state
 * - Bridges ClerkAuthContext to AuthContext so useAuth() works
 *
 * When VITE_USE_CLERK_AUTH=false (default):
 * - Uses SupabaseAuthProvider (existing behavior)
 * - Supabase Auth handles everything
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  // If Clerk auth is enabled, use the Clerk provider with bridge
  if (USE_CLERK_AUTH) {
    logger.log('🔐 AuthProvider: Using Clerk authentication');

    return (
      <ClerkAuthProviderWithBridge>{children}</ClerkAuthProviderWithBridge>
    );
  }

  // Default: Use Supabase auth provider
  logger.log('🔐 AuthProvider: Using Supabase authentication');
  return <SupabaseAuthProvider>{children}</SupabaseAuthProvider>;
};

/**
 * ClerkAuthProviderWithBridge - Uses ClerkAuthProvider and bridges context to AuthContext
 * Note: ClerkProvider is already wrapped in main.tsx, so we just use ClerkAuthProvider here
 * which uses Clerk hooks internally but doesn't add another ClerkProvider
 */
const ClerkAuthProviderWithBridge: React.FC<AuthProviderProps> = ({ children }) => {
  // ClerkBridge component bridges ClerkAuthContext to AuthContext
  const ClerkBridge: React.FC<{ children: React.ReactNode }> = ({ children: bridgeChildren }) => {
    const clerkValue = React.useContext(ClerkAuthContext);
    return (
      <AuthContext.Provider value={clerkValue as AuthContextType}>
        {bridgeChildren}
      </AuthContext.Provider>
    );
  };

  return (
    <ClerkAuthProvider>
      <ClerkBridge>{children}</ClerkBridge>
    </ClerkAuthProvider>
  );
};

/**
 * SupabaseAuthProvider - Original Supabase-based auth implementation
 * This is the existing implementation, now wrapped in its own component
 */
const SupabaseAuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  // Track if user explicitly signed in (vs session restoration)
  // This ref persists across renders and is used to determine if we should invalidate queries
  const justSignedInRef = React.useRef(false);

  // Initialize auth state
  useEffect(() => {
    let mounted = true;
    let isInitialLoad = true;

    const initializeAuth = async () => {
      try {
        logger.log('🔐 AuthContext: Initializing auth...');

        // Add timeout protection for session fetch
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<{ data: { session: Session | null }, error: AuthError | null }>((_, reject) =>
          setTimeout(() => reject(new Error('Session fetch timeout in AuthContext')), 30000)
        );

        const result = await Promise.race([sessionPromise, timeoutPromise]).catch(err => {
          logger.warn('⚠️ AuthContext: Session fetch timed out or failed:', err.message);
          return { data: { session: null }, error: err as AuthError };
        });

        const { data: { session }, error } = result;

        if (mounted) {
          if (error) {
            logger.error('Error getting session:', error);
            // Clear potentially corrupted session data
            authUtils.clearAuthStorage();
          } else {
            setSession(session);
            setUser(session?.user ?? null);

            // Log session restoration without showing toast
            if (session?.user && isInitialLoad) {
              logger.log('📱 Session restored for:', session.user.email);
              authLogger.logAuthEvent({
                event_type: 'SIGNED_IN',
                user_id: session.user.id,
                email: session.user.email,
              });

              // ORGREM-009: Check if user was removed from organization
              try {
                // Check redirect flag
                const { data: profile } = await supabase
                  .from('profiles')
                  .select('redirect_to_onboarding')
                  .eq('id', session.user.id)
                  .single();

                // Also check if user has any active memberships
                const { data: memberships } = await supabase
                  .from('organization_memberships')
                  .select('org_id, member_status')
                  .eq('user_id', session.user.id)
                  .eq('member_status', 'active');

                const hasActiveMemberships = memberships && memberships.length > 0;
                const shouldRedirect = profile?.redirect_to_onboarding || !hasActiveMemberships;

                if (shouldRedirect && !window.location.pathname.includes('/onboarding/removed-user')) {
                  logger.log('🔄 User removed from org, redirecting to onboarding');
                  // Redirect will be handled by App.tsx route guard
                  // Store flag in sessionStorage so App.tsx can detect it
                  sessionStorage.setItem('user_removed_redirect', 'true');
                }
              } catch (error) {
                logger.error('Error checking user removal status:', error);
                // Don't block login on error
              }
            }
          }
          setLoading(false);
          logger.log('✅ AuthContext: Auth initialization complete');
        }
      } catch (error) {
        logger.error('Failed to initialize auth:', error);
        if (mounted) {
          authUtils.clearAuthStorage();
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // Set up auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // DETAILED DEBUG: Track all auth events to diagnose tab-switch refetch issue
        const timestamp = new Date().toISOString();
        console.log(`🔐 [${timestamp}] AUTH EVENT: ${event}`, {
          hasSession: !!session,
          justSignedIn: justSignedInRef.current,
          userId: session?.user?.id?.slice(0, 8) + '...',
          documentVisible: document.visibilityState
        });
        logger.log('Auth state change:', event, !!session);
        
        if (mounted) {
          setSession(session);
          setUser(session?.user ?? null);
          
          // Handle specific auth events
          switch (event) {
            case 'SIGNED_IN':
              // Only invalidate queries if user EXPLICITLY signed in via signIn() function
              // This prevents refetching all data on session restoration, page load, or tab switch
              if (justSignedInRef.current) {
                logger.log('🔐 Explicit sign-in detected for:', session?.user?.email);
                console.log('⚠️ [INVALIDATE] Calling queryClient.invalidateQueries() - explicit sign-in');
                queryClient.invalidateQueries();
                justSignedInRef.current = false; // Reset the flag
              } else {
                console.log('✅ [SKIP] Skipped query invalidation - session restoration/tab switch');
              }
              
              // Log auth event and set Sentry user context
              if (session?.user) {
                authLogger.logAuthEvent({
                  event_type: 'SIGNED_IN',
                  user_id: session.user.id,
                  email: session.user.email,
                });
                
                // Set Sentry user context for error tracking
                setSentryUser({
                  id: session.user.id,
                  email: session.user.email || undefined,
                  name: session.user.user_metadata?.full_name,
                });
                
                // Initialize analytics with user context
                initAnalytics(session.user.id);
                identify(session.user.id, {
                  email: session.user.email,
                  name: session.user.user_metadata?.full_name,
                });
              }
              break;
              
            case 'SIGNED_OUT':
              // Check if this is a password recovery flow or invitation flow
              // Supabase clears the session when processing recovery/invite tokens
              // We should NOT show the "Successfully signed out!" toast in these cases
              const isPasswordRecovery =
                window.location.search.includes('token_hash') ||
                window.location.search.includes('type=recovery') ||
                window.location.hash.includes('type=recovery') ||
                window.location.pathname.startsWith('/auth/reset-password');

              // Also check for invite flow (waitlist/org invitations)
              const isInviteFlow =
                window.location.search.includes('type=invite') ||
                window.location.search.includes('waitlist_entry') ||
                window.location.hash.includes('type=invite') ||
                window.location.pathname.includes('/auth/set-password');

              if (!isPasswordRecovery && !isInviteFlow) {
                toast.success('Successfully signed out!');

                // Only clear data on genuine sign-out, not during recovery/invite token processing
                // During invite/recovery flows, Supabase may fire SIGNED_OUT before establishing new session
                queryClient.clear();
                authUtils.clearAuthStorage();
                // Clear Sentry user context and reset analytics
                clearSentryUser();
                resetAnalytics();
              }
              // Note: We don't log SIGNED_OUT since we won't have session data
              break;
              
            case 'TOKEN_REFRESHED':
              logger.log('Token refreshed successfully');
              // Log token refresh for security monitoring
              if (session?.user) {
                authLogger.logAuthEvent({
                  event_type: 'TOKEN_REFRESHED',
                  user_id: session.user.id,
                });
              }
              break;
              
            case 'PASSWORD_RECOVERY':
              logger.log('Password recovery initiated');
              if (session?.user) {
                authLogger.logAuthEvent({
                  event_type: 'PASSWORD_RECOVERY',
                  user_id: session.user.id,
                  email: session.user.email,
                });
              }
              break;
              
            default:
              break;
          }
          
          setLoading(false);
        }
        
        // Mark that initial load is complete
        isInitialLoad = false;
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  // Sign in function
  const signIn = useCallback(async (email: string, password: string) => {
    try {
      logger.log('🔐 Attempting sign in for:', email.toLowerCase().trim());

      // Mark that this is an explicit sign-in (not session restoration)
      // This flag is checked in the SIGNED_IN event handler to determine if we should invalidate queries
      justSignedInRef.current = true;

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password,
      });

      if (error) {
        // Reset the flag on error - this wasn't a successful sign-in
        justSignedInRef.current = false;
        // Log full error details including response body if available
        const errorDetails: any = {
          message: error.message,
          status: error.status,
          name: error.name,
        };
        
        // Try to extract more details from the error
        if ((error as any).response) {
          errorDetails.response = (error as any).response;
        }
        if ((error as any).error_description) {
          errorDetails.error_description = (error as any).error_description;
        }
        if ((error as any).code) {
          errorDetails.code = (error as any).code;
        }
        
        logger.error('❌ Sign in error:', errorDetails);
        console.error('Full Supabase auth error object:', error);
        
        // Log additional details for 500 errors
        if (error.status === 500) {
          logger.error('⚠️ Server error (500) - Possible causes:', {
            '1': 'Password may be incorrect - verify password in Supabase Dashboard',
            '2': 'User account may be locked or disabled',
            '3': 'Supabase project configuration issue - check Auth settings',
            '4': 'Temporary Supabase service issue - check Supabase status page',
            '5': 'Password hash mismatch - try resetting password in Supabase Dashboard'
          });
          
          // Suggest password reset for 500 errors
          console.warn('💡 Tip: If password is correct, try resetting it in Supabase Dashboard → Authentication → Users → Reset Password');
        }
        
        return { 
          error: { 
            message: authUtils.formatAuthError(error),
            status: error.status || (error as any).statusCode || 0
          } 
        };
      }

      if (data?.user) {
        logger.log('✅ Sign in successful for:', data.user.email);
      }

      return { error: null };
    } catch (error: any) {
      // Reset the flag on error - this wasn't a successful sign-in
      justSignedInRef.current = false;

      logger.error('❌ Sign in exception:', {
        message: error?.message,
        status: error?.status || error?.statusCode,
        stack: error?.stack,
        fullError: error
      });

      return {
        error: {
          message: authUtils.formatAuthError(error),
          status: error?.status || error?.statusCode || 500
        }
      };
    }
  }, []);

  // Sign up function
  const signUp = useCallback(async (email: string, password: string, metadata?: SignUpMetadata) => {
    try {
      // Use current origin for email redirect so it works in both local and production
      const redirectUrl = `${window.location.origin}/auth/callback`;

      const { error } = await supabase.auth.signUp({
        email: email.toLowerCase().trim(),
        password,
        options: {
          data: metadata || {},
          emailRedirectTo: redirectUrl,
        },
      });

      if (error) {
        return { error: { message: authUtils.formatAuthError(error) } };
      }

      return { error: null };
    } catch (error) {
      return { error: { message: authUtils.formatAuthError(error) } };
    }
  }, []);

  // Sign out function
  const signOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        return { error: { message: authUtils.formatAuthError(error) } };
      }

      return { error: null };
    } catch (error) {
      return { error: { message: authUtils.formatAuthError(error) } };
    }
  }, []);

  // Reset password function
  const resetPassword = useCallback(async (email: string) => {
    try {
      // Use helper function to get correct redirect URL
      const redirectUrl = getAuthRedirectUrl('/auth/reset-password');

      logger.log('=== PASSWORD RESET DEBUG ===');
      logger.log('Email:', email.toLowerCase().trim());
      logger.log('Redirect URL:', redirectUrl);
      logger.log('Current window origin:', window.location.origin);

      const { data, error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase().trim(), {
        redirectTo: redirectUrl,
      });

      if (error) {
        logger.error('❌ Password reset error:', error);
        logger.error('Error details:', {
          message: error.message,
          status: error.status,
          name: error.name
        });
        return { error: { message: authUtils.formatAuthError(error) } };
      }

      logger.log('✅ Password reset email sent successfully');
      logger.log('Response data:', data);
      return { error: null };
    } catch (error: any) {
      logger.error('❌ Password reset exception:', error);
      return { error: { message: authUtils.formatAuthError(error) } };
    }
  }, []);

  // Update password function
  const updatePassword = useCallback(async (password: string) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        return { error: { message: authUtils.formatAuthError(error) } };
      }

      return { error: null };
    } catch (error) {
      return { error: { message: authUtils.formatAuthError(error) } };
    }
  }, []);

  // Verify second factor - stub for Supabase (not used with Supabase Auth)
  const verifySecondFactor = useCallback(async (_code: string) => {
    // Supabase Auth doesn't use second factor verification like Clerk does
    // This is a stub to maintain interface compatibility
    return { error: { message: 'Second factor verification is not supported with Supabase Auth' } };
  }, []);

  // Computed values
  const isAuthenticated = authUtils.isAuthenticated(session);
  const userId = authUtils.getUserId(session);

  const value: AuthContextType = {
    // State
    user,
    session,
    loading,

    // Actions
    signIn,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
    verifySecondFactor,

    // Utilities
    isAuthenticated,
    userId,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 