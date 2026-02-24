/**
 * SetPassword Page - Complete Account Creation
 *
 * This page allows waitlist users to complete their account setup by:
 * 1. Validating their custom invitation token
 * 2. Setting a password
 * 3. Creating their account in Supabase Auth
 * 4. Creating their profile
 * 5. Updating their waitlist status to 'converted'
 *
 * The user account is NOT created until they set their password,
 * ensuring they have control over when their account is activated.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Lock, CheckCircle, Loader2, Mail, AlertCircle } from 'lucide-react';

interface TokenValidationResult {
  valid: boolean;
  email?: string;
  waitlist_entry_id?: string;
  error?: string;
}

interface NameValidationResult {
  valid: boolean;
  error?: string;
}

function validateName(name: string): NameValidationResult {
  // Allow: letters (any language), spaces, hyphens, apostrophes
  const validNameRegex = /^[\p{L}\s'-]+$/u;

  if (!name || !name.trim()) {
    return { valid: false, error: 'Name is required' };
  }

  if (name.trim().length < 2) {
    return { valid: false, error: 'Name must be at least 2 characters' };
  }

  if (!validNameRegex.test(name.trim())) {
    return { valid: false, error: 'Name can only contain letters, spaces, hyphens, and apostrophes' };
  }

  return { valid: true };
}

export default function SetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isValidatingToken, setIsValidatingToken] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [waitlistEntryId, setWaitlistEntryId] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [firstNameError, setFirstNameError] = useState<string | null>(null);
  const [lastNameError, setLastNameError] = useState<string | null>(null);

  useEffect(() => {
    validateToken();
  }, []);

  const validateToken = async () => {
    try {
      const token = searchParams.get('token');
      const entryId = searchParams.get('waitlist_entry');

      console.log('[SetPassword] Validating token:', { hasToken: !!token, entryId });

      if (!token) {
        setTokenError('No invitation token provided. Please click the link in your email.');
        setIsValidatingToken(false);
        return;
      }

      if (!entryId) {
        setTokenError('Missing waitlist entry information. Please click the link in your email.');
        setIsValidatingToken(false);
        return;
      }

      // Call the validate-waitlist-token edge function
      const { data: validationResult, error: validationError } = await supabase.functions.invoke(
        'validate-waitlist-token',
        {
          body: { token },
        }
      );

      console.log('[SetPassword] Token validation result:', validationResult);

      if (validationError) {
        console.error('[SetPassword] Token validation error:', validationError);
        setTokenError('Failed to validate your invitation. Please try again or contact support.');
        setIsValidatingToken(false);
        return;
      }

      if (!validationResult?.success) {
        console.error('[SetPassword] Validation failed:', validationResult?.error);
        setTokenError(validationResult?.error || 'Failed to validate your invitation.');
        setIsValidatingToken(false);
        return;
      }

      if (!validationResult.valid) {
        console.error('[SetPassword] Invalid token:', validationResult?.error);
        setTokenError(validationResult?.error || 'Your invitation link is invalid or has expired.');
        setIsValidatingToken(false);
        return;
      }

      // Token is valid!
      const email = validationResult.email;
      const waitlistEntryIdFromToken = validationResult.waitlist_entry_id;

      console.log('[SetPassword] Token validated successfully:', { email, waitlistEntryIdFromToken });

      setUserEmail(email || null);
      setWaitlistEntryId(waitlistEntryIdFromToken || null);
      setTokenError(null);
      setIsValidatingToken(false);
    } catch (error: any) {
      console.error('[SetPassword] Error validating token:', error);
      setTokenError('An error occurred while validating your invitation. Please try again.');
      setIsValidatingToken(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate first name
    const firstNameValidation = validateName(firstName);
    if (!firstNameValidation.valid) {
      setFirstNameError(firstNameValidation.error || 'Invalid first name');
      toast.error(firstNameValidation.error || 'Invalid first name');
      return;
    }
    setFirstNameError(null);

    // Validate last name
    const lastNameValidation = validateName(lastName);
    if (!lastNameValidation.valid) {
      setLastNameError(lastNameValidation.error || 'Invalid last name');
      toast.error(lastNameValidation.error || 'Invalid last name');
      return;
    }
    setLastNameError(null);

    if (!password || password.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (!userEmail) {
      toast.error('Email not found. Please try again.');
      return;
    }

    setIsLoading(true);

    try {
      const token = searchParams.get('token');

      // Clear any stale organization data from localStorage
      // This prevents old org IDs from interfering with new signup
      try {
        localStorage.removeItem('org-store');
        console.log('[SetPassword] Cleared stale org-store from localStorage');
      } catch (err) {
        console.error('[SetPassword] Failed to clear localStorage:', err);
      }

      console.log('[SetPassword] Creating account for:', userEmail);

      // 1. Create Supabase Auth user
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: userEmail,
        password: password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (signUpError) {
        console.error('[SetPassword] Sign up error:', signUpError);
        // Provide a clearer message for "already registered" errors
        if (signUpError.message?.toLowerCase().includes('already registered') ||
            signUpError.message?.toLowerCase().includes('already exists')) {
          toast.error('This email already has an account. If you were recently deleted and re-invited, please contact support or ask the admin to re-delete your account.');
        } else {
          toast.error(signUpError.message || 'Failed to create account');
        }
        setIsLoading(false);
        return;
      }

      if (!signUpData.user) {
        console.error('[SetPassword] No user returned from signup');
        toast.error('Failed to create account');
        setIsLoading(false);
        return;
      }

      // Supabase anti-enumeration: signUp with an existing email returns a "fake" user
      // with an empty identities array instead of an error. Detect this case.
      if (signUpData.user.identities && signUpData.user.identities.length === 0) {
        console.error('[SetPassword] User already exists (empty identities returned)');
        toast.error('This email already has an account. Please contact support if you were recently re-invited.');
        setIsLoading(false);
        return;
      }

      const userId = signUpData.user.id;
      console.log('[SetPassword] User created in Supabase Auth:', userId);

      // 2. Store first_name/last_name in auth metadata
      // The profile was auto-created by database trigger with id and email
      try {
        const { error: metadataError } = await supabase.auth.updateUser({
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
          },
        });
        if (metadataError) {
          console.warn('[SetPassword] Error storing auth metadata:', metadataError);
        } else {
          console.log('[SetPassword] ✓ Stored first/last name in auth metadata');
        }
      } catch (metadataError) {
        console.warn('[SetPassword] Exception storing auth metadata:', metadataError);
      }

      // 3. Update waitlist entry to 'converted' and link user
      if (waitlistEntryId) {
        const { error: waitlistError } = await supabase
          .from('meetings_waitlist')
          .update({
            user_id: userId,
            status: 'converted',
            converted_at: new Date().toISOString(),
            invitation_accepted_at: new Date().toISOString(),
          })
          .eq('id', waitlistEntryId);

        if (waitlistError) {
          console.error('[SetPassword] Error updating waitlist:', waitlistError);
        } else {
          console.log('[SetPassword] Waitlist entry updated to converted');
        }
      }

      // 4. Mark token as used
      if (token) {
        try {
          await supabase
            .from('waitlist_magic_tokens')
            .update({ used_at: new Date().toISOString() })
            .eq('token', token);

          console.log('[SetPassword] Token marked as used');
        } catch (error) {
          console.error('[SetPassword] Error marking token as used:', error);
        }
      }

      // 5. Sign in the user
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: password,
      });

      if (signInError) {
        console.error('[SetPassword] Sign in error:', signInError);
        toast.success('Account created successfully! Please log in.');
        navigate('/auth/login', { replace: true });
        return;
      }

      console.log('[SetPassword] User signed in successfully');

      // Sync profile with first/last name NOW while we're authenticated
      // This ensures profile is complete before redirect
      // Retry logic in case of transient failures
      let profileSyncSuccess = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`[SetPassword] Syncing profile (attempt ${attempt}/3)...`);
          const { data, error: updateError } = await supabase
            .from('profiles')
            .update({
              first_name: firstName.trim(),
              last_name: lastName.trim(),
            })
            .eq('id', userId)
            .select();

          if (updateError) {
            console.warn(`[SetPassword] Profile sync attempt ${attempt} failed:`, updateError);
            if (attempt < 3) {
              // Wait before retry
              await new Promise(r => setTimeout(r, 500 * attempt));
              continue;
            }
          } else {
            console.log('[SetPassword] ✓ Profile synced successfully', {
              updated: data,
              first_name: firstName,
              last_name: lastName,
            });
            profileSyncSuccess = true;
            break;
          }
        } catch (syncErr) {
          console.warn(`[SetPassword] Profile sync exception attempt ${attempt}:`, syncErr);
          if (attempt < 3) {
            await new Promise(r => setTimeout(r, 500 * attempt));
          }
        }
      }

      if (!profileSyncSuccess) {
        console.error('[SetPassword] ⚠ Failed to sync profile after 3 client attempts');

        // Try edge function as last resort (uses service role to bypass RLS)
        try {
          console.log('[SetPassword] Attempting profile sync via edge function...');
          const { data: edgeResponse, error: edgeFunctionError } = await supabase.functions.invoke(
            'sync-profile-names',
            {
              body: {
                userId,
                firstName: firstName.trim(),
                lastName: lastName.trim(),
              },
            }
          );

          if (edgeFunctionError) {
            console.error('[SetPassword] Edge function error:', edgeFunctionError);
          } else if (edgeResponse?.success) {
            console.log('[SetPassword] ✓ Profile synced via edge function');
            profileSyncSuccess = true;
            toast.success('Account created successfully! Welcome to Early Access.');
          } else {
            console.error('[SetPassword] Edge function returned failure:', edgeResponse);
          }
        } catch (edgeErr) {
          console.error('[SetPassword] Exception calling edge function:', edgeErr);
        }
      } else {
        toast.success('Account created successfully! Welcome to Early Access.');
      }

      if (!profileSyncSuccess) {
        console.warn('[SetPassword] Profile names may sync on first login');
        toast.warning('Account created. Profile setup will complete on first login.');
      }

      setTimeout(() => {
        navigate('/onboarding', { replace: true });
      }, 1000);
    } catch (error: any) {
      console.error('[SetPassword] Error during account creation:', error);
      toast.error('An unexpected error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  if (isValidatingToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-[#37bd7e] animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Verifying your invitation...</p>
        </div>
      </div>
    );
  }

  if (tokenError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md relative z-10"
        >
          <div className="bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-2xl p-8 shadow-2xl">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-red-900/20 rounded-full mb-4">
                <AlertCircle className="w-8 h-8 text-red-400" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Invitation Invalid</h1>
              <p className="text-gray-400 mb-6">{tokenError}</p>
              <button
                onClick={() => navigate('/auth/login', { replace: true })}
                className="w-full bg-[#37bd7e] hover:bg-[#2da76c] text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200"
              >
                Go to Login
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(74,74,117,0.25),transparent)] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-[#37bd7e]/20 rounded-full mb-4">
              <CheckCircle className="w-8 h-8 text-[#37bd7e]" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Complete Your Account</h1>
            <p className="text-gray-400">
              {userEmail ? `Signing up as ${userEmail}` : 'Set your password to get started'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-gray-300 mb-2">
                First Name
              </label>
              <input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(e) => {
                  setFirstName(e.target.value);
                  if (e.target.value.trim()) {
                    const validation = validateName(e.target.value);
                    setFirstNameError(validation.valid ? null : validation.error || null);
                  } else {
                    setFirstNameError(null);
                  }
                }}
                placeholder="Enter your first name"
                className={`w-full px-4 py-3 bg-gray-800/50 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:border-transparent ${
                  firstNameError
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-gray-700 focus:ring-[#37bd7e]'
                }`}
                required
                disabled={isLoading}
              />
              {firstNameError && (
                <p className="text-red-400 text-sm mt-1">{firstNameError}</p>
              )}
            </div>

            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-gray-300 mb-2">
                Last Name
              </label>
              <input
                id="lastName"
                type="text"
                value={lastName}
                onChange={(e) => {
                  setLastName(e.target.value);
                  if (e.target.value.trim()) {
                    const validation = validateName(e.target.value);
                    setLastNameError(validation.valid ? null : validation.error || null);
                  } else {
                    setLastNameError(null);
                  }
                }}
                placeholder="Enter your last name"
                className={`w-full px-4 py-3 bg-gray-800/50 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:border-transparent ${
                  lastNameError
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-gray-700 focus:ring-[#37bd7e]'
                }`}
                required
                disabled={isLoading}
              />
              {lastNameError && (
                <p className="text-red-400 text-sm mt-1">{lastNameError}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                Set Your Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password (min 6 characters)"
                  className="w-full pl-10 pr-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent"
                  required
                  minLength={6}
                  disabled={isLoading}
                />
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  className="w-full pl-10 pr-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent"
                  required
                  minLength={6}
                  disabled={isLoading}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !firstName || !lastName || !password || !confirmPassword}
              className="w-full bg-[#37bd7e] hover:bg-[#2da76c] disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creating your account...
                </>
              ) : (
                'Complete Setup & Go to Dashboard'
              )}
            </button>
          </form>

          <div className="mt-6 p-4 bg-blue-900/20 border border-blue-800/50 rounded-lg">
            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-gray-400">
                <p className="font-medium text-gray-300 mb-1">Your account will be created</p>
                <p>Once you set your password, your account will be fully activated and you'll have access to the dashboard.</p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
