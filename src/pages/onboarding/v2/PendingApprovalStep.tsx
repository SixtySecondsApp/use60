/**
 * PendingApprovalStep
 *
 * Displays a message when a user has submitted a join request for an existing organization.
 * They are waiting for the organization admin to approve their request.
 * This is an informational screen with no action buttons.
 */

import { motion } from 'framer-motion';
import { Clock, CheckCircle2, Loader2 } from 'lucide-react';
import { useOnboardingV2Store } from '@/lib/stores/onboardingV2Store';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { cancelJoinRequest } from '@/lib/services/joinRequestService';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useApprovalDetection } from '@/lib/hooks/useApprovalDetection';

export function PendingApprovalStep() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { pendingJoinRequest, userEmail } = useOnboardingV2Store();
  const [profileEmail, setProfileEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [joinRequestId, setJoinRequestId] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  // Use approval detection hook
  const { isApproved, membership, refetch } = useApprovalDetection(
    user?.id,
    pendingJoinRequest?.orgId,
    true
  );

  useEffect(() => {
    // Fetch the user's profile email and join request ID
    const fetchData = async () => {
      if (!userEmail) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.email) {
          setProfileEmail(session.user.email);
        }
      }

      // Fetch join request ID if we don't have it from store
      if (user?.id && !pendingJoinRequest?.requestId) {
        const { data } = await supabase
          .from('organization_join_requests')
          .select('id')
          .eq('user_id', user.id)
          .eq('status', 'pending')
          .maybeSingle();

        if (data?.id) {
          setJoinRequestId(data.id);
        }
      } else if (pendingJoinRequest?.requestId) {
        setJoinRequestId(pendingJoinRequest.requestId);
      }
    };

    fetchData();
  }, [userEmail, user?.id, pendingJoinRequest?.requestId]);

  // Automatic polling for approval detection
  useEffect(() => {
    if (!user?.id || !pendingJoinRequest?.orgId) {
      return;
    }

    const POLL_INTERVAL = 5000; // 5 seconds
    setIsPolling(true);

    // Polling function
    const pollForApproval = () => {
      console.log('[PendingApprovalStep] Polling for approval...');
      refetch();
    };

    // Set up interval
    const intervalId = setInterval(pollForApproval, POLL_INTERVAL);

    // Clean up interval on unmount
    return () => {
      console.log('[PendingApprovalStep] Clearing polling interval');
      clearInterval(intervalId);
      setIsPolling(false);
    };
  }, [user?.id, pendingJoinRequest?.orgId, refetch]);

  // Handle approval detection
  useEffect(() => {
    if (isApproved && membership) {
      console.log('[PendingApprovalStep] Approval detected!', membership);
      setIsPolling(false);
      toast.success('Approved! Redirecting to your dashboard...');
      setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 1000);
    }
  }, [isApproved, membership, navigate]);

  const checkApprovalStatus = async () => {
    if (!user) return;

    setChecking(true);
    try {
      // First check if there's any pending request at all
      const { data: pendingRequests } = await supabase
        .from('organization_join_requests')
        .select('status, org_id, organizations(name)')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .maybeSingle();

      if (!pendingRequests) {
        // Request not found - may have been deleted or org was deleted
        toast.warning('Join request not found. The organization may have been removed. Please restart onboarding.');
        // Auto-reset profile status to allow restart
        await supabase
          .from('profiles')
          .update({ profile_status: 'active' })
          .eq('id', user.id);
        return;
      }

      // Now check if join request was approved
      const { data: approvedRequests } = await supabase
        .from('organization_join_requests')
        .select('status, org_id')
        .eq('user_id', user.id)
        .eq('status', 'approved')
        .maybeSingle();

      if (approvedRequests) {
        toast.success('Approved! Redirecting to your dashboard...');
        setTimeout(() => {
          navigate('/dashboard', { replace: true });
        }, 1000);
      } else {
        toast.info('Still waiting for admin approval. We\'ll email you when approved!');
      }
    } catch (error) {
      console.error('[PendingApprovalStep] Error checking approval status:', error);
      toast.error('Failed to check status. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!user?.id || !joinRequestId) {
      console.error('[PendingApprovalStep] Missing required data:', { userId: user?.id, joinRequestId });
      toast.error('Unable to cancel request. Please refresh the page and try again.');
      return;
    }

    setCanceling(true);
    setShowCancelDialog(false);

    try {
      console.log('[PendingApprovalStep] Cancelling join request:', joinRequestId);
      const result = await cancelJoinRequest(joinRequestId, user.id);

      if (result.success) {
        toast.success('Join request cancelled. Restarting onboarding...');
        // Reset store state
        useOnboardingV2Store.getState().reset();
        // Redirect to website input
        setTimeout(() => {
          navigate('/onboarding?step=website_input', { replace: true });
        }, 1000);
      } else {
        console.error('[PendingApprovalStep] Cancel failed:', result.error);
        toast.error(result.error || 'Failed to cancel request');
      }
    } catch (error) {
      console.error('[PendingApprovalStep] Error cancelling request:', error);
      toast.error('Failed to cancel request. Please try again.');
    } finally {
      setCanceling(false);
    }
  };

  const displayEmail = userEmail || profileEmail;
  const orgName = pendingJoinRequest?.orgName || 'the organization';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full max-w-2xl mx-auto px-4"
    >
      <div className="rounded-2xl shadow-xl border border-gray-800 bg-gray-900 overflow-hidden">
        {/* Header */}
        <div className="bg-amber-600 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <Clock className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-white">
                Request Pending Approval
              </h2>
              <p className="text-amber-100 text-sm">Your admin will review your request shortly</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          <div className="mb-8">
            <p className="text-gray-300 text-center leading-relaxed mb-6">
              Your request to join <span className="font-semibold text-white">{orgName}</span> has been submitted.
              An organization administrator will review and approve your request, typically within 24 hours.
            </p>

            <div className="space-y-4 mb-8">
              <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                <p className="text-xs font-medium uppercase tracking-wide mb-1 text-gray-400">
                  Email Address
                </p>
                <p className="font-medium text-white">{displayEmail}</p>
              </div>

              <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                <p className="text-xs font-medium uppercase tracking-wide mb-1 text-gray-400">
                  Organization
                </p>
                <p className="font-medium text-white">{orgName}</p>
              </div>

              <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                <p className="text-xs font-medium uppercase tracking-wide mb-1 text-gray-400">
                  Status
                </p>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                  <p className="font-medium text-white">Awaiting Admin Review</p>
                </div>
                {isPolling && (
                  <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Checking status...</span>
                  </div>
                )}
              </div>
            </div>

            {/* What happens next */}
            <div className="bg-amber-900/20 border border-amber-800/50 rounded-xl p-4 mb-6">
              <div className="flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-100 mb-1">What Happens Next</p>
                  <p className="text-sm text-amber-200/80">
                    Once approved (usually within 24 hours), you'll receive an email with a link to activate
                    your account and access the dashboard. The admin can approve your request from their
                    Team Members settings page.
                  </p>
                </div>
              </div>
            </div>

            {/* Check status button */}
            <button
              onClick={checkApprovalStatus}
              disabled={checking}
              className="w-full bg-violet-600 hover:bg-violet-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 mb-4"
            >
              {checking ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Checking Status...
                </>
              ) : (
                'Check Approval Status'
              )}
            </button>

            {/* Cancel and restart onboarding button */}
            <button
              onClick={() => setShowCancelDialog(true)}
              disabled={canceling || !joinRequestId}
              className="w-full bg-gray-700 hover:bg-gray-600 text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200 mb-2 disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              {canceling ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 inline animate-spin" />
                  Cancelling...
                </>
              ) : (
                'Cancel Request & Restart Onboarding'
              )}
            </button>

            {/* Helper text */}
            <p className="text-xs text-gray-400 text-center mb-6">
              Wrong organization? Cancel this request and start over.
            </p>
          </div>

          {/* Support note */}
          <div className="text-center">
            <p className="text-sm text-gray-400">
              Questions? Please contact your organization administrator or <a href="mailto:support@use60.com" className="text-amber-400 hover:text-amber-300 transition-colors">reach out to support</a>.
            </p>
          </div>
        </div>
      </div>

      {/* Cancel Confirmation Dialog */}
      <ConfirmDialog
        open={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onConfirm={handleCancelRequest}
        title="Cancel Join Request?"
        description={`Are you sure you want to cancel your request to join ${orgName}? You'll be able to create a new organization or request to join a different one.`}
        confirmText="Yes, Cancel Request"
        cancelText="No, Keep Request"
        confirmVariant="warning"
        loading={canceling}
      />
    </motion.div>
  );
}
