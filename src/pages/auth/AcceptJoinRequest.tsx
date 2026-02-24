/**
 * Accept Join Request Page
 *
 * Handles organization join request acceptance flow.
 * User clicks magic link from approval email and is automatically logged in.
 * Accessible via /auth/accept-join-request?token=xxx&request_id=yyy
 */

import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Building2, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrg } from '@/lib/contexts/OrgContext';
import { acceptJoinRequest, validateJoinRequestToken, type ValidateTokenResult } from '@/lib/services/joinRequestService';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

type AcceptStatus = 'loading' | 'valid' | 'invalid' | 'accepting' | 'accepted' | 'error';

export default function AcceptJoinRequest() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { refreshOrgs, switchOrg } = useOrg();

  const token = searchParams.get('token');
  const requestId = searchParams.get('request_id');

  const [status, setStatus] = useState<AcceptStatus>('loading');
  const [tokenData, setTokenData] = useState<ValidateTokenResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load and validate token
  useEffect(() => {
    if (!token || !requestId) {
      setStatus('invalid');
      setError('Invalid or missing link parameters');
      return;
    }

    const loadAndValidateToken = async () => {
      setStatus('loading');
      const result = await validateJoinRequestToken(token, requestId);

      if (!result.success || !result.joinRequest || !result.organization) {
        setStatus('invalid');
        setError(result.error || 'Invalid or expired token');
        return;
      }

      setTokenData(result);
      setStatus('valid');
    };

    loadAndValidateToken();
  }, [token, requestId]);

  // Handle join request acceptance
  const handleAccept = async () => {
    if (!token || !requestId) return;

    // Must be logged in
    if (!isAuthenticated) {
      // User should already be logged in for join requests
      toast.error('Please log in to continue');
      navigate('/auth/login', { state: { from: window.location.pathname } });
      return;
    }

    setStatus('accepting');

    const result = await acceptJoinRequest(token, requestId);

    if (!result.success) {
      setStatus('error');
      setError(result.error || 'Failed to accept join request');
      toast.error(result.error || 'Failed to accept join request');
      return;
    }

    try {
      // Refresh organizations to get the newly added membership
      await refreshOrgs();

      if (result.organizationId) {
        // Switch to the organization
        switchOrg(result.organizationId);

        // Mark onboarding as complete
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
      toast.success(`Welcome to ${tokenData?.organization?.name}!`);

      // Redirect to dashboard after a short delay
      setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 2000);
    } catch (err) {
      console.error('Error completing join request acceptance:', err);
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
          <Loader2 className="w-10 h-10 text-green-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Processing your request...</p>
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
              {status === 'invalid' ? 'Invalid Link' : 'Error'}
            </h1>
            <p className="text-gray-400 mb-6">{error}</p>
            <Button
              onClick={() => navigate('/dashboard')}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              Go to Dashboard
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
                {tokenData?.organization?.name || 'the organization'}
              </span>
            </p>
            <p className="text-sm text-gray-500">Redirecting to dashboard...</p>
          </div>
        </motion.div>
      </div>
    );
  }

  // Render valid request (ready to accept)
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
          <div className="absolute -right-20 -top-20 w-40 h-40 bg-green-500/10 blur-3xl rounded-full" />

          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
              <Building2 className="w-8 h-8 text-green-500" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">
              Join{' '}
              <span className="text-green-500">
                {tokenData?.organization?.name || 'Organization'}
              </span>
            </h1>
            <p className="text-gray-400">
              Your request to join{' '}
              <span className="text-white font-medium">
                {tokenData?.organization?.name || 'the organization'}
              </span>{' '}
              has been approved!
            </p>
          </div>

          <div className="bg-gray-800/50 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Status</span>
              <span className="text-sm text-green-400 font-medium flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                Approved
              </span>
            </div>
          </div>

          {isAuthenticated ? (
            <Button
              onClick={handleAccept}
              disabled={status === 'accepting'}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-3"
            >
              {status === 'accepting' ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Joining...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Complete Setup
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={() => navigate('/auth/login')}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-3"
            >
              Log In to Continue
            </Button>
          )}

          <p className="text-xs text-gray-500 text-center mt-6">
            This link expires in 7 days. If it expires, please contact your organization admin for a new one.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
