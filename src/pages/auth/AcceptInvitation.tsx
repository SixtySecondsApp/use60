/**
 * Accept Invitation Page
 *
 * Handles organization invitation acceptance flow.
 * Accessible via /invite/:token
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Building2, Check, X, Loader2, LogIn, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrg } from '@/lib/contexts/OrgContext';
import { getInvitationByToken, acceptInvitation, type Invitation } from '@/lib/services/invitationService';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

type InviteStatus = 'loading' | 'valid' | 'invalid' | 'accepting' | 'accepted' | 'error';

export default function AcceptInvitation() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { refreshOrgs, switchOrg } = useOrg();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<InviteStatus>('loading');
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load invitation details
  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      setError('Invalid invitation link');
      return;
    }

    const loadInvitation = async () => {
      setStatus('loading');
      const { data, error } = await getInvitationByToken(token);

      if (error || !data) {
        setStatus('invalid');
        setError(error || 'Invitation not found');
        return;
      }

      setInvitation(data);
      setStatus('valid');
    };

    loadInvitation();
  }, [token]);

  // Handle invitation acceptance
  const handleAccept = async () => {
    if (!token || !invitation) return;

    // Must be logged in with matching email
    if (!isAuthenticated) {
      // Redirect to invite-specific signup page (not regular signup)
      navigate(`/auth/invite-signup/${token}`);
      return;
    }

    // Refresh session to ensure JWT is valid before calling RPC
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      // Session expired/invalid — redirect to signup/signin flow
      toast.error('Your session has expired. Please sign in to accept the invitation.');
      navigate(`/auth/invite-signup/${token}`);
      return;
    }

    // Check if email matches
    if (user?.email?.toLowerCase() !== invitation.email.toLowerCase()) {
      setStatus('error');
      setError(
        `This invitation was sent to ${invitation.email}. Please log in with that email address to accept it.`
      );
      return;
    }

    setStatus('accepting');

    const result = await acceptInvitation(token);

    if (!result.success) {
      // If auth-related failure, redirect to re-authenticate
      if (result.error_message?.includes('Not authenticated') || result.error_message?.includes('user_not_found')) {
        toast.error('Please sign in again to accept the invitation.');
        navigate(`/auth/invite-signup/${token}`);
        return;
      }
      setStatus('error');
      setError(result.error_message || 'Failed to accept invitation');
      toast.error(result.error_message || 'Failed to accept invitation');
      return;
    }

    try {
      // Refresh organizations to get the newly added membership
      await refreshOrgs();

      if (result.org_id) {
        // Switch to the invited organization
        switchOrg(result.org_id);

        // Mark onboarding as complete for invited users (they don't need to go through onboarding)
        // This prevents ProtectedRoute from redirecting them to /onboarding
        await supabase
          .from('user_onboarding_progress')
          .upsert({
            user_id: user?.id,
            onboarding_step: 'complete',
            onboarding_completed_at: new Date().toISOString(),
            skipped_onboarding: false,
          }, {
            onConflict: 'user_id',
          });
      }

      setStatus('accepted');
      toast.success(`Welcome to ${result.org_name}!`);

      // Invalidate auth user cache so dashboard queries have a valid userId on mount
      await queryClient.invalidateQueries({ queryKey: ['auth', 'user'] });
      await queryClient.invalidateQueries({ queryKey: ['auth'] });

      // Redirect to dashboard after a short delay
      setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 2000);
    } catch (err) {
      console.error('Error completing invitation acceptance:', err);
      setStatus('error');
      setError('An error occurred while setting up your organization');
      toast.error('Failed to set up organization');
    }
  };

  // Render loading state
  if (status === 'loading' || authLoading) {
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

  // Render invalid/error state
  if (status === 'invalid' || status === 'error') {
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
              <X className="w-8 h-8 text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-4">
              {status === 'invalid' ? 'Invalid Invitation' : 'Error'}
            </h1>
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

  // Render accepted state
  if (status === 'accepted') {
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
              <Check className="w-8 h-8 text-green-400" />
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

  // Render valid invitation (ready to accept)
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(74,74,117,0.25),transparent)] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="relative bg-gray-900/50 backdrop-blur-xl rounded-2xl border border-gray-800/50 p-8">
          <div className="absolute inset-0 bg-gradient-to-br from-gray-900/90 via-gray-900/70 to-gray-900/30 rounded-2xl -z-10" />
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

          <div className="bg-gray-800/50 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">Invited as</span>
              <span className="text-sm text-white font-medium capitalize">
                {invitation?.role || 'Member'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Email</span>
              <span className="text-sm text-white">{invitation?.email}</span>
            </div>
          </div>

          {isAuthenticated ? (
            <>
              {user?.email?.toLowerCase() === invitation?.email.toLowerCase() ? (
                <Button
                  onClick={handleAccept}
                  disabled={status === 'accepting'}
                  className="w-full bg-[#37bd7e] hover:bg-[#2da76c] text-white py-3"
                >
                  {status === 'accepting' ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Joining...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Accept Invitation
                    </>
                  )}
                </Button>
              ) : (
                <div className="text-center">
                  <p className="text-amber-400 text-sm mb-4">
                    You're logged in as {user?.email}, but this invitation was sent to{' '}
                    {invitation?.email}
                  </p>
                  <Button
                    onClick={() => navigate(`/auth/invite-signup/${token}`)}
                    variant="outline"
                    className="w-full border-gray-600"
                  >
                    <LogIn className="w-4 h-4 mr-2" />
                    Switch Account
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <Button
                onClick={() => navigate(`/auth/invite-signup/${token}`)}
                className="w-full bg-[#37bd7e] hover:bg-[#2da76c] text-white py-3"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Create Account & Join
              </Button>
              <Button
                onClick={() => navigate('/auth/login?redirect=/invite/' + token)}
                variant="outline"
                className="w-full border-gray-600"
              >
                <LogIn className="w-4 h-4 mr-2" />
                Already have an account?
              </Button>
            </div>
          )}

          <p className="text-xs text-gray-500 text-center mt-6">
            This invitation expires{' '}
            {invitation?.expires_at
              ? new Date(invitation.expires_at).toLocaleDateString()
              : 'soon'}
          </p>
        </div>
      </motion.div>
    </div>
  );
}
