/**
 * Invite Signup Page
 *
 * Special signup flow for users invited to join an organization.
 * - Email is pre-filled and locked (verified from invitation)
 * - No access code required
 * - Simplified form (first name, last name, password only)
 * - Auto-accepts invitation after signup
 * - Redirects straight to organization dashboard (no onboarding)
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Building2, Lock, User, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/contexts/AuthContext';
import { getInvitationByToken, completeInviteSignup, type Invitation } from '@/lib/services/invitationService';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgStore } from '@/lib/stores/orgStore';
import { toast } from 'sonner';

type SignupStatus = 'loading' | 'ready' | 'signing-up' | 'complete' | 'verify-email' | 'error';

export default function InviteSignup() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { signUp } = useAuth();

  const [status, setStatus] = useState<SignupStatus>('loading');
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    password: '',
    confirmPassword: '',
  });

  // Load invitation details
  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('Invalid invitation link');
      return;
    }

    const loadInvitation = async () => {
      setStatus('loading');
      const { data, error: inviteError } = await getInvitationByToken(token);

      if (inviteError || !data) {
        setStatus('error');
        setError(inviteError || 'Invitation not found or has expired');
        return;
      }

      setInvitation(data);
      setStatus('ready');
    };

    loadInvitation();
  }, [token]);

  // Handle signup
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!invitation || !token) return;

    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      toast.error('First and last name are required');
      return;
    }

    setStatus('signing-up');

    try {
      const fullName = `${formData.firstName.trim()} ${formData.lastName.trim()}`.trim();

      // Step 1: Create account
      const { error: signupError } = await signUp(
        invitation.email,
        formData.password,
        {
          full_name: fullName,
          first_name: formData.firstName.trim(),
          last_name: formData.lastName.trim(),
        }
      );

      if (signupError) {
        setStatus('error');
        setError(signupError.message);
        toast.error(signupError.message);
        return;
      }

      // Step 2: Explicitly save first_name and last_name to profile
      // The DB trigger may not extract names from auth metadata, and this flow
      // skips AuthCallback which normally handles the profile upsert
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { error: profileError } = await supabase
            .from('profiles')
            .upsert({
              id: user.id,
              email: invitation.email,
              first_name: formData.firstName.trim(),
              last_name: formData.lastName.trim(),
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'id',
            });

          if (profileError) {
            console.warn('[InviteSignup] Failed to save profile names:', profileError);
          }
        }
      } catch (profileErr) {
        console.warn('[InviteSignup] Error saving profile names:', profileErr);
      }

      // Step 3: Complete the invite signup (create membership, mark onboarding complete)
      // This doesn't require a session since it's a SECURITY DEFINER RPC
      const result = await completeInviteSignup(token);

      if (!result.success) {
        setStatus('error');
        setError(result.error_message || 'Failed to set up organization membership');
        toast.error(result.error_message || 'Failed to set up organization');
        return;
      }

      // Step 4: Set the invited org as the active organization
      // This ensures the dashboard loads the correct org, not an auto-created one
      if (result.org_id) {
        useOrgStore.getState().setActiveOrg(result.org_id);
      }

      // Success! Redirect straight to dashboard
      setStatus('complete');
      toast.success(`Welcome to ${result.org_name}!`);

      // Redirect to dashboard after a short delay
      setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 1500);
    } catch (err: any) {
      console.error('Error during signup:', err);
      setStatus('error');
      setError(err.message || 'An error occurred during signup');
      toast.error('An error occurred during signup');
    }
  };

  // Loading state
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(74,74,117,0.25),transparent)] pointer-events-none" />
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-[#37bd7e] animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading invitation...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(74,74,117,0.25),transparent)] pointer-events-none" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="relative bg-gray-900/50 backdrop-blur-xl rounded-2xl border border-gray-800/50 p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-6">
              <Lock className="w-8 h-8 text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-4">Invalid Invitation</h1>
            <p className="text-gray-400 mb-6">{error}</p>
            <Button
              onClick={() => navigate('/auth/login')}
              className="bg-[#37bd7e] hover:bg-[#2da76c] text-white"
            >
              Go to Login
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Completion state - welcome screen
  if (status === 'complete') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(74,74,117,0.25),transparent)] pointer-events-none" />
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md"
        >
          <div className="relative bg-gray-900/50 backdrop-blur-xl rounded-2xl border border-green-500/30 p-8 text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.2 }}
              className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6"
            >
              <Building2 className="w-8 h-8 text-green-400" />
            </motion.div>
            <h1 className="text-2xl font-bold text-white mb-4">Welcome to the team!</h1>
            <p className="text-gray-400 mb-6">
              You're now a member of{' '}
              <span className="text-white font-medium">
                {invitation?.organization?.name || 'the organization'}
              </span>
            </p>
            <p className="text-sm text-gray-500">Redirecting to dashboard...</p>
          </div>
        </motion.div>
      </div>
    );
  }

  // Email verification state (kept as fallback, but should not be shown for invites)
  if (status === 'verify-email') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(74,74,117,0.25),transparent)] pointer-events-none" />
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md"
        >
          <div className="relative bg-gray-900/50 backdrop-blur-xl rounded-2xl border border-green-500/30 p-8 text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.2 }}
              className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6"
            >
              <Mail className="w-8 h-8 text-green-400" />
            </motion.div>
            <h1 className="text-2xl font-bold text-white mb-4">Check Your Email!</h1>
            <p className="text-gray-400 mb-2">
              Your account has been created and you've been added to{' '}
              <span className="text-white font-medium">
                {invitation?.organization?.name || 'the organization'}
              </span>
              .
            </p>
            <p className="text-gray-500 text-sm mb-8">
              Please verify your email address by clicking the link we sent to{' '}
              <span className="font-medium">{invitation?.email}</span>. After verification, you can log in to your organization.
            </p>
            <Button
              onClick={() => navigate('/auth/login')}
              className="bg-[#37bd7e] hover:bg-[#2da76c] text-white w-full"
            >
              Go to Login
            </Button>
            <p className="text-xs text-gray-500 mt-6">
              Invited as: <span className="font-medium text-gray-300 capitalize">{invitation?.role || 'member'}</span>
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  // Ready/form state
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(74,74,117,0.25),transparent)] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="relative bg-gray-900/50 backdrop-blur-xl rounded-2xl border border-gray-800/50 p-6 sm:p-8 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-gray-900/90 via-gray-900/70 to-gray-900/30 rounded-2xl -z-10" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(74,74,117,0.15),transparent)] rounded-2xl -z-10" />
          <div className="absolute -right-20 -top-20 w-40 h-40 bg-[#37bd7e]/10 blur-3xl rounded-full" />

          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full bg-[#37bd7e]/20 flex items-center justify-center mx-auto mb-6">
              <Building2 className="w-8 h-8 text-[#37bd7e]" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">
              Join{' '}
              <span className="text-[#37bd7e]">
                {invitation?.organization?.name || 'Organization'}
              </span>
            </h1>
            <p className="text-gray-400">
              You've been invited to join{' '}
              <span className="text-white font-medium">
                {invitation?.organization?.name || 'an organization'}
              </span>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email - locked and read-only */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={invitation?.email || ''}
                  disabled
                  className="w-full bg-gray-700/50 border border-gray-600 rounded-xl pl-10 pr-4 py-2.5 text-gray-400 placeholder-gray-500 cursor-not-allowed opacity-75"
                />
              </div>
              <p className="text-xs text-gray-500">Email verified from your invitation</p>
            </div>

            {/* First and Last Name */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400">First Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-400 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent transition-colors hover:bg-gray-600"
                    placeholder="Sarah"
                    disabled={status !== 'ready'}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400">Last Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-400 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent transition-colors hover:bg-gray-600"
                    placeholder="Johnson"
                    disabled={status !== 'ready'}
                  />
                </div>
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-400 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent transition-colors hover:bg-gray-600"
                  placeholder="••••••••"
                  disabled={status !== 'ready'}
                />
              </div>
              <p className="text-xs text-gray-500">Minimum 6 characters</p>
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-400 focus:ring-2 focus:ring-[#37bd7e] focus:border-transparent transition-colors hover:bg-gray-600"
                  placeholder="••••••••"
                  disabled={status !== 'ready'}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={status !== 'ready'}
              className="w-full bg-[#37bd7e] hover:bg-[#2da76c] text-white py-2.5 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-[#37bd7e] focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#37bd7e]/20"
            >
              {status === 'signing-up' && (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />
                  Creating account...
                </>
              )}
              {status === 'ready' && 'Create Account & Join'}
            </button>
          </form>

          <p className="text-xs text-gray-500 text-center mt-6">
            Invited as: <span className="font-medium text-gray-300 capitalize">{invitation?.role || 'member'}</span>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
