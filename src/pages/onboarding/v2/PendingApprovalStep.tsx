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
import { useOrg } from '@/lib/contexts/OrgContext';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { cancelJoinRequest } from '@/lib/services/joinRequestService';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useApprovalDetection } from '@/lib/hooks/useApprovalDetection';

export function PendingApprovalStep() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refreshOrgs, switchOrg } = useOrg();
  const { pendingJoinRequest, userEmail } = useOnboardingV2Store();
  const [profileEmail, setProfileEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [joinRequestId, setJoinRequestId] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);
  const [showApprovalSuccess, setShowApprovalSuccess] = useState(false);

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

  // Handler for when approval is detected
  const handleApprovalDetected = async (membership: { org_id: string }) => {
    try {
      // Show success state briefly before loading dashboard
      setShowApprovalSuccess(true);
      setIsPolling(false);

      // Wait for success animation to be visible
      await new Promise(resolve => setTimeout(resolve, 800));

      setIsLoadingDashboard(true);
      setShowApprovalSuccess(false);

      console.log('[PendingApprovalStep] Starting approval flow for org:', membership.org_id);

      // 1. Update profile status to active
      if (user?.id) {
        console.log('[PendingApprovalStep] Updating profile status to active');
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ profile_status: 'active' })
          .eq('id', user.id);

        if (profileError) {
          console.error('[PendingApprovalStep] Error updating profile status:', profileError);
          // Don't fail the flow if profile update fails - continue anyway
        }
      }

      // 2. Reload organizations to get the newly added membership
      console.log('[PendingApprovalStep] Refreshing organizations');
      await refreshOrgs();

      // 3. Switch to the newly joined organization
      console.log('[PendingApprovalStep] Switching to organization:', membership.org_id);
      switchOrg(membership.org_id);

      // 4. Mark onboarding as complete
      console.log('[PendingApprovalStep] Marking onboarding as complete');
      try {
        await supabase
          .from('user_onboarding_progress')
          .upsert({
            user_id: user.id,
            onboarding_step: 'complete',
            onboarding_completed_at: new Date().toISOString()
          }, { onConflict: 'user_id' });
      } catch (error) {
        console.error('[PendingApprovalStep] Error marking onboarding complete:', error);
        // Don't block navigation if onboarding update fails
      }

      // 5. Show success message and navigate to dashboard
      toast.success('Welcome! Redirecting to your dashboard...');
      setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 1000);
    } catch (error) {
      console.error('[PendingApprovalStep] Error handling approval:', error);
      toast.error('Failed to load dashboard. Please try refreshing the page.');
      setIsLoadingDashboard(false);
    }
  };

  // Handle approval detection
  useEffect(() => {
    if (isApproved && membership && !isLoadingDashboard) {
      console.log('[PendingApprovalStep] Approval detected!', membership);
      handleApprovalDetected(membership);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isApproved, membership, isLoadingDashboard]);

  const checkApprovalStatus = async () => {
    if (!user) return;

    setChecking(true);
    try {
      // Step 1: Check organization_memberships FIRST (source of truth)
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('org_id, role, id')
        .eq('user_id', user.id)
        .maybeSingle();

      // If membership exists, user was approved - trigger dashboard flow
      if (membership) {
        console.log('[PendingApprovalStep] User has been approved, triggering approval flow');
        await handleApprovalDetected(membership);
        return;
      }

      // Step 2: Check if there's still a pending request
      const { data: pendingRequest } = await supabase
        .from('organization_join_requests')
        .select('status, org_id, organizations(name)')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .maybeSingle();

      if (pendingRequest) {
        // Request is still pending
        toast.info('Still waiting for admin approval. We\'ll notify you when approved!');
        return;
      }

      // Step 3: No membership and no pending request - request was cancelled/rejected
      toast.warning('Your request was cancelled or the organization was removed. Restarting onboarding...');

      // Auto-reset profile status to allow restart
      await supabase
        .from('profiles')
        .update({ profile_status: 'active' })
        .eq('id', user.id);

      // Reset store and redirect to start
      useOnboardingV2Store.getState().reset();
      setTimeout(() => {
        navigate('/onboarding?step=website_input', { replace: true });
      }, 1500);

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

                {/* Success state - approval detected */}
                {showApprovalSuccess && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <p className="font-medium text-green-400">
                      Approved! Setting up your account...
                    </p>
                  </motion.div>
                )}

                {/* Loading dashboard state */}
                {isLoadingDashboard && !showApprovalSuccess && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
                      <p className="font-medium text-white">
                        Loading your dashboard...
                      </p>
                    </div>
                    <p className="text-xs text-gray-400 pl-7">
                      Preparing your workspace and loading data
                    </p>
                  </div>
                )}

                {/* Waiting state with polling indicator */}
                {!showApprovalSuccess && !isLoadingDashboard && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                      <p className="font-medium text-white">
                        Awaiting Admin Review
                      </p>
                    </div>
                    {isPolling && (
                      <div className="flex items-center gap-2 text-xs text-gray-400 pl-4">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Checking approval status...</span>
                      </div>
                    )}
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
                    Once approved (usually within 24 hours), you&apos;ll receive an email with a link to activate
                    your account and access the dashboard. The admin can approve your request from their
                    Team Members settings page.
                  </p>
                </div>
              </div>
            </div>

            {/* Check status button */}
            <button
              onClick={checkApprovalStatus}
              disabled={checking || isLoadingDashboard || showApprovalSuccess}
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
              disabled={canceling || !joinRequestId || isLoadingDashboard || showApprovalSuccess}
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
