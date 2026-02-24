/**
 * ClerkAuthContext.tsx
 *
 * Compatibility wrapper that provides the same interface as AuthContext
 * but uses Clerk for authentication instead of Supabase Auth.
 *
 * This allows gradual migration - all 53+ files using useAuth() continue
 * working with the same interface while the backend switches to Clerk.
 */

import React, { createContext, useContext, useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { useUser, useAuth as useClerkAuth, useSignIn, useSignUp, useClerk } from '@clerk/clerk-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import logger from '@/lib/utils/logger';
import { supabase, setClerkTokenGetter } from '../supabase/clientV2';
import type { SignUpMetadata } from './AuthContext';

// Types that match the existing AuthContext interface
// We create simplified versions since Clerk user/session differ from Supabase
interface ClerkUserCompat {
  id: string;
  email?: string;
  user_metadata?: {
    full_name?: string;
    first_name?: string;
    last_name?: string;
  };
  created_at?: string;
}

interface ClerkSessionCompat {
  user: ClerkUserCompat | null;
  access_token?: string;
  expires_at?: number;
}

interface AuthError {
  message: string;
  status?: number;
  requiresVerification?: boolean;
}

// Extended error type for verification flow
export interface VerificationRequiredError extends AuthError {
  requiresVerification: true;
}

// Same interface as the original AuthContext - exported for type compatibility
export interface ClerkAuthContextType {
  // State
  user: ClerkUserCompat | null;
  session: ClerkSessionCompat | null;
  loading: boolean;

  // Actions
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string, metadata?: SignUpMetadata) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<{ error: AuthError | null }>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
  updatePassword: (password: string) => Promise<{ error: AuthError | null }>;
  verifySecondFactor: (code: string) => Promise<{ error: AuthError | null }>;

  // Utilities
  isAuthenticated: boolean;
  userId: string | null;
}

// Create a shared context that can be used by both providers
// This is exported so AuthContext.tsx can use the same context
export const ClerkAuthContext = createContext<ClerkAuthContextType | undefined>(undefined);

/**
 * Hook to use Clerk auth with the same interface as useAuth()
 * Note: Most components should use useAuth() from AuthContext instead
 */
export const useClerkAuthContext = (): ClerkAuthContextType => {
  const context = useContext(ClerkAuthContext);
  if (context === undefined) {
    throw new Error('useClerkAuthContext must be used within a ClerkAuthProvider');
  }
  return context;
};

interface ClerkAuthProviderProps {
  children: React.ReactNode;
}

/**
 * ClerkAuthProvider - Provides Clerk authentication with Supabase-compatible interface
 */
export const ClerkAuthProvider: React.FC<ClerkAuthProviderProps> = ({ children }) => {
  const { user: clerkUser, isLoaded: userLoaded, isSignedIn } = useUser();
  const { isLoaded: authLoaded, getToken } = useClerkAuth();
  const { signIn: clerkSignIn, setActive: setSignInActive, isLoaded: signInLoaded } = useSignIn();
  const { signUp: clerkSignUp, setActive: setSignUpActive, isLoaded: signUpLoaded } = useSignUp();
  const { signOut: clerkSignOut } = useClerk();
  const queryClient = useQueryClient();

  // Track the mapped Supabase user ID
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);
  const [mappingLoaded, setMappingLoaded] = useState(false);

  // Track if we've registered the token getter
  const tokenGetterRegistered = useRef(false);

  // Register the Clerk token getter with Supabase client
  // This enables Clerk JWT to be used for all Supabase requests
  useEffect(() => {
    if (authLoaded && getToken && !tokenGetterRegistered.current) {
      const clerkTokenGetter = async () => {
        try {
          // Get token using the 'supabase' JWT template configured in Clerk
          const token = await getToken({ template: 'supabase' });
          return token;
        } catch (err) {
          logger.error('❌ ClerkAuth: Failed to get Supabase JWT:', err);
          return null;
        }
      };

      setClerkTokenGetter(clerkTokenGetter);
      tokenGetterRegistered.current = true;
      logger.log('✅ ClerkAuth: Registered Clerk token getter with Supabase client');
    }
  }, [authLoaded, getToken]);

  // Fetch the Supabase user ID from the mapping table when Clerk user is loaded
  // Auto-provision if no mapping exists
  useEffect(() => {
    async function fetchOrProvisionSupabaseUserId() {
      if (!clerkUser?.id) {
        setSupabaseUserId(null);
        setMappingLoaded(true);
        return;
      }

      const email = clerkUser.primaryEmailAddress?.emailAddress;
      const fullName = clerkUser.fullName || undefined;

      try {
        logger.log('🔗 ClerkAuth: Looking up Supabase user ID for Clerk user:', clerkUser.id);

        // Step 1: Try to find existing mapping by Clerk ID
        const { data, error } = await supabase
          .from('clerk_user_mapping')
          .select('supabase_user_id')
          .eq('clerk_user_id', clerkUser.id)
          .single();

        if (data && !error) {
          logger.log('✅ ClerkAuth: Found Supabase user ID:', data.supabase_user_id);
          setSupabaseUserId(data.supabase_user_id);
          setMappingLoaded(true);
          return;
        }

        // Step 2: If no mapping by Clerk ID, try by email
        if (error?.code === 'PGRST116' && email) {
          logger.log('🔗 ClerkAuth: No mapping found by Clerk ID, trying email lookup');

          const { data: emailData, error: emailError } = await supabase
            .from('clerk_user_mapping')
            .select('supabase_user_id')
            .eq('email', email.toLowerCase())
            .single();

          if (emailData && !emailError) {
            logger.log('✅ ClerkAuth: Found Supabase user ID via email:', emailData.supabase_user_id);

            // Update the mapping with the Clerk user ID for future lookups
            await supabase
              .from('clerk_user_mapping')
              .update({ clerk_user_id: clerkUser.id, updated_at: new Date().toISOString() })
              .eq('supabase_user_id', emailData.supabase_user_id);

            setSupabaseUserId(emailData.supabase_user_id);
            setMappingLoaded(true);
            return;
          }
        }

        // Step 3: No mapping found anywhere - auto-provision new user
        if (email) {
          logger.log('🆕 ClerkAuth: No mapping found, auto-provisioning new user...');

          try {
            // Call the clerk-user-sync Edge Function to provision the user
            const response = await fetch(
              `${(import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL)}/functions/v1/clerk-user-sync`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${(import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY)}`,
                },
                body: JSON.stringify({
                  action: 'provision',
                  clerk_user_id: clerkUser.id,
                  email: email.toLowerCase(),
                  full_name: fullName,
                }),
              }
            );

            if (response.ok) {
              const result = await response.json();
              if (result.supabase_user_id) {
                logger.log('✅ ClerkAuth: User auto-provisioned:', result.supabase_user_id);
                setSupabaseUserId(result.supabase_user_id);
                setMappingLoaded(true);
                return;
              }
            } else {
              const errorText = await response.text();
              logger.warn('⚠️ ClerkAuth: Auto-provision failed:', errorText);
            }
          } catch (provisionError) {
            logger.warn('⚠️ ClerkAuth: Auto-provision request failed:', provisionError);
          }
        }

        // Final fallback: No mapping and couldn't provision
        logger.warn('⚠️ ClerkAuth: Could not find or create Supabase user mapping');
        setSupabaseUserId(null);
      } catch (err) {
        logger.error('❌ ClerkAuth: Error fetching Supabase user mapping:', err);
        setSupabaseUserId(null);
      }

      setMappingLoaded(true);
    }

    if (userLoaded) {
      fetchOrProvisionSupabaseUserId();
    }
  }, [clerkUser?.id, clerkUser?.primaryEmailAddress?.emailAddress, clerkUser?.fullName, userLoaded]);

  // Convert Clerk user to Supabase-compatible format
  // IMPORTANT: Use the mapped Supabase user ID for data queries
  const user: ClerkUserCompat | null = useMemo(() => {
    if (!clerkUser) return null;

    return {
      // Use Supabase user ID if available, otherwise fall back to Clerk ID
      id: supabaseUserId || clerkUser.id,
      email: clerkUser.primaryEmailAddress?.emailAddress,
      user_metadata: {
        full_name: clerkUser.fullName || undefined,
        first_name: clerkUser.firstName || undefined,
        last_name: clerkUser.lastName || undefined,
      },
      created_at: clerkUser.createdAt?.toISOString(),
    };
  }, [clerkUser, supabaseUserId]);

  // Create session-like object for compatibility
  const session: ClerkSessionCompat | null = useMemo(() => {
    if (!isSignedIn || !user) return null;

    return {
      user,
      // Token will be fetched when needed via getToken()
    };
  }, [isSignedIn, user]);

  // Loading state - true until all Clerk hooks are loaded AND mapping is resolved
  const loading = !userLoaded || !authLoaded || !signInLoaded || !signUpLoaded || !mappingLoaded;

  /**
   * Sign in with email and password
   */
  const signIn = useCallback(async (email: string, password: string): Promise<{ error: AuthError | null }> => {
    if (!clerkSignIn) {
      return { error: { message: 'Sign in not available', status: 500 } };
    }

    try {
      logger.log('🔐 ClerkAuth: Attempting sign in for:', email.toLowerCase().trim());

      const signInAttempt = await clerkSignIn.create({
        strategy: 'password',
        identifier: email.toLowerCase().trim(),
        password,
      });

      // Debug: Log what Clerk returns
      console.log('🔐 ClerkAuth DEBUG: signInAttempt status =', signInAttempt.status);
      console.log('🔐 ClerkAuth DEBUG: supportedSecondFactors =', signInAttempt.supportedSecondFactors);

      if (signInAttempt.status === 'complete') {
        await setSignInActive({ session: signInAttempt.createdSessionId });

        logger.log('✅ ClerkAuth: Sign in successful');

        // Invalidate all queries to refetch with new auth context
        queryClient.invalidateQueries();

        return { error: null };
      } else if (signInAttempt.status === 'needs_second_factor') {
        // Clerk requires email verification as second factor
        // Check if email_code is supported and prepare for it
        const emailFactor = signInAttempt.supportedSecondFactors?.find(
          (factor: any) => factor.strategy === 'email_code'
        );

        if (emailFactor) {
          // Prepare the second factor verification - this sends the code
          await signInAttempt.prepareSecondFactor({
            strategy: 'email_code',
          });

          logger.log('📧 ClerkAuth: Email verification code sent for second factor');
          return {
            error: {
              message: 'Please check your email for a verification code',
              status: 403,
              requiresVerification: true,
              signInAttempt: signInAttempt,
            } as any
          };
        }

        // No supported second factor
        logger.warn('⚠️ ClerkAuth: Sign in requires second factor but none supported');
        return {
          error: {
            message: 'Sign in requires additional verification',
            status: 403
          }
        };
      } else {
        // Handle other incomplete sign-in states
        logger.warn('⚠️ ClerkAuth: Sign in incomplete, status:', signInAttempt.status);
        return {
          error: {
            message: `Sign in requires additional verification: ${signInAttempt.status}`,
            status: 403
          }
        };
      }
    } catch (err: any) {
      logger.error('❌ ClerkAuth: Sign in error:', err);

      // Extract error message from Clerk error format
      const errorMessage = err?.errors?.[0]?.longMessage
        || err?.errors?.[0]?.message
        || err?.message
        || 'Sign in failed';

      return {
        error: {
          message: errorMessage,
          status: err?.status || 401
        }
      };
    }
  }, [clerkSignIn, setSignInActive, queryClient]);

  /**
   * Sign up with email and password
   */
  const signUp = useCallback(async (
    email: string,
    password: string,
    metadata?: SignUpMetadata
  ): Promise<{ error: AuthError | null }> => {
    if (!clerkSignUp) {
      return { error: { message: 'Sign up not available', status: 500 } };
    }

    try {
      logger.log('🔐 ClerkAuth: Attempting sign up for:', email.toLowerCase().trim());

      // Use first_name and last_name if provided directly, otherwise parse full_name
      let firstName: string | undefined;
      let lastName: string | undefined;

      if (metadata?.first_name || metadata?.last_name) {
        firstName = metadata.first_name || undefined;
        lastName = metadata.last_name || undefined;
      } else if (metadata?.full_name) {
        const nameParts = metadata.full_name.trim().split(' ');
        firstName = nameParts[0];
        lastName = nameParts.slice(1).join(' ') || undefined;
      }

      // Create the sign up
      await clerkSignUp.create({
        emailAddress: email.toLowerCase().trim(),
        password,
        firstName,
        lastName,
      });

      // Send email verification code
      await clerkSignUp.prepareEmailAddressVerification({
        strategy: 'email_code',
      });

      logger.log('✅ ClerkAuth: Sign up initiated, verification email sent');

      // Note: User needs to verify email before sign up is complete
      // The verification flow will be handled in the sign up page
      return { error: null };
    } catch (err: any) {
      logger.error('❌ ClerkAuth: Sign up error:', err);

      const errorMessage = err?.errors?.[0]?.longMessage
        || err?.errors?.[0]?.message
        || err?.message
        || 'Sign up failed';

      return {
        error: {
          message: errorMessage,
          status: err?.status || 400
        }
      };
    }
  }, [clerkSignUp]);

  /**
   * Sign out the current user
   */
  const signOut = useCallback(async (): Promise<{ error: AuthError | null }> => {
    try {
      logger.log('🔐 ClerkAuth: Signing out...');

      await clerkSignOut();

      // Clear all cached data
      queryClient.clear();

      toast.success('Successfully signed out!');
      logger.log('✅ ClerkAuth: Sign out successful');

      return { error: null };
    } catch (err: any) {
      logger.error('❌ ClerkAuth: Sign out error:', err);

      return {
        error: {
          message: err?.message || 'Sign out failed',
          status: err?.status || 500
        }
      };
    }
  }, [clerkSignOut, queryClient]);

  /**
   * Request password reset email
   */
  const resetPassword = useCallback(async (email: string): Promise<{ error: AuthError | null }> => {
    if (!clerkSignIn) {
      return { error: { message: 'Password reset not available', status: 500 } };
    }

    try {
      logger.log('🔐 ClerkAuth: Requesting password reset for:', email.toLowerCase().trim());

      // Use Clerk's forgot password flow
      await clerkSignIn.create({
        strategy: 'reset_password_email_code',
        identifier: email.toLowerCase().trim(),
      });

      logger.log('✅ ClerkAuth: Password reset email sent');

      return { error: null };
    } catch (err: any) {
      logger.error('❌ ClerkAuth: Password reset error:', err);

      const errorMessage = err?.errors?.[0]?.longMessage
        || err?.errors?.[0]?.message
        || err?.message
        || 'Password reset failed';

      return {
        error: {
          message: errorMessage,
          status: err?.status || 400
        }
      };
    }
  }, [clerkSignIn]);

  /**
   * Update password (after receiving reset code)
   * Note: This is different from Supabase - Clerk requires the reset code
   * The actual implementation will be in the reset-password page
   */
  const updatePassword = useCallback(async (password: string): Promise<{ error: AuthError | null }> => {
    // Note: In Clerk, updating password requires the reset code from email
    // This method signature exists for compatibility but the full flow
    // happens in the forgot-password page using signIn.attemptFirstFactor

    logger.warn('⚠️ ClerkAuth: updatePassword called directly - use forgot password flow instead');

    return {
      error: {
        message: 'Use the forgot password flow to update your password',
        status: 400
      }
    };
  }, []);

  /**
   * Verify second factor with email code
   * Called after signIn returns requiresVerification: true
   */
  const verifySecondFactor = useCallback(async (code: string): Promise<{ error: AuthError | null }> => {
    if (!clerkSignIn) {
      return { error: { message: 'Sign in not available', status: 500 } };
    }

    try {
      logger.log('🔐 ClerkAuth: Verifying second factor with code');

      const result = await clerkSignIn.attemptSecondFactor({
        strategy: 'email_code',
        code,
      });

      if (result.status === 'complete') {
        await setSignInActive({ session: result.createdSessionId });

        logger.log('✅ ClerkAuth: Second factor verification successful');

        // Invalidate all queries to refetch with new auth context
        queryClient.invalidateQueries();

        return { error: null };
      } else {
        logger.warn('⚠️ ClerkAuth: Second factor verification incomplete, status:', result.status);
        return {
          error: {
            message: `Verification incomplete: ${result.status}`,
            status: 403
          }
        };
      }
    } catch (err: any) {
      logger.error('❌ ClerkAuth: Second factor verification error:', err);

      const errorMessage = err?.errors?.[0]?.longMessage
        || err?.errors?.[0]?.message
        || err?.message
        || 'Verification failed';

      return {
        error: {
          message: errorMessage,
          status: err?.status || 401
        }
      };
    }
  }, [clerkSignIn, setSignInActive, queryClient]);

  // Computed values
  const isAuthenticated = isSignedIn ?? false;
  // Use mapped Supabase user ID for data queries, fall back to Clerk ID
  const userId = supabaseUserId || clerkUser?.id || null;

  const value: ClerkAuthContextType = useMemo(() => ({
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
  }), [
    user,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
    verifySecondFactor,
    isAuthenticated,
    userId,
  ]);

  // Note: We use ClerkAuthContext here, but AuthContext.tsx wraps this
  // and re-exports the value through the main AuthContext
  return (
    <ClerkAuthContext.Provider value={value}>
      {children}
    </ClerkAuthContext.Provider>
  );
};

/**
 * Hook to get Clerk token for Supabase requests
 * Use this when making Supabase API calls with Clerk auth
 */
export const useClerkSupabaseToken = () => {
  const { getToken } = useClerkAuth();

  return useCallback(async () => {
    // Get token from the 'supabase' JWT template configured in Clerk
    const token = await getToken({ template: 'supabase' });
    return token;
  }, [getToken]);
};

export default ClerkAuthProvider;
