/**
 * Pending Approval Page
 *
 * Shown when a user tries to access protected routes but their request
 * is pending approval. They can't access any features until approved.
 * Accessible via /auth/pending-approval
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, LogOut, Mail, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrg } from '@/lib/contexts/OrgContext';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { cancelJoinRequest } from '@/lib/services/joinRequestService';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useApprovalDetection } from '@/lib/hooks/useApprovalDetection';

export default function PendingApprovalPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { refreshOrgs, switchOrg } = useOrg();
  const [joinRequest, setJoinRequest] = useState<{
    orgName: string;
    email: string;
    requestId: string;
    orgId: string;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);

  // Use approval detection hook
  const { isApproved, membership, refetch } = useApprovalDetection(
    user?.id,
    joinRequest?.orgId,
    true
  );

  useEffect(() => {
    // Fetch join request details
    const fetchJoinRequest = async () => {
      if (!user?.id) return;

      try {
        const { data } = await supabase
          .from('organization_join_requests')
          .select('id, org_id, email, organizations(name)')
          .eq('user_id', user.id)
          .eq('status', 'pending')
          .maybeSingle();

        if (data) {
          console.log('[PendingApprovalPage] Join request data:', data);
          setJoinRequest({
            requestId: data.id,
            orgId: data.org_id,
            orgName: data.organizations?.name || 'the organization',
            email: data.email,
          });
        } else {
          // No pending join request found - user may have been removed or request was deleted
          console.log('[PendingApprovalPage] No pending join request found, auto-restarting onboarding');

          // Reset profile status to active
          await supabase
            .from('profiles')
            .update({ profile_status: 'active' })
            .eq('id', user.id);

          // Show toast and redirect
          toast.info('Your join request was removed. Restarting onboarding...');
          setTimeout(() => {
            navigate('/onboarding?step=website_input', { replace: true });
          }, 1500);
        }
      } catch (err) {
        console.error('Error fetching join request:', err);
      }
    };

    fetchJoinRequest();
  }, [user?.id, navigate]);

  // Automatic polling for approval detection (5 seconds)
  useEffect(() => {
    if (!user?.id || !joinRequest?.orgId) {
      return;
    }

    const POLL_INTERVAL = 5000; // 5 seconds
    setIsPolling(true);

    // Polling function
    const pollForApproval = () => {
      console.log('[PendingApprovalPage] Polling for approval...');
      refetch();
    };

    // Set up interval
    const intervalId = setInterval(pollForApproval, POLL_INTERVAL);

    // Clean up interval on unmount
    return () => {
      console.log('[PendingApprovalPage] Clearing polling interval');
      clearInterval(intervalId);
      setIsPolling(false);
    };
  }, [user?.id, joinRequest?.orgId, refetch]);

  // Handler for when approval is detected
  const handleApprovalDetected = async (membership: { org_id: string }) => {
    try {
      setIsLoadingDashboard(true);
      setIsPolling(false);

      console.log('[PendingApprovalPage] Starting approval flow for org:', membership.org_id);

      // 1. Update profile status to active
      if (user?.id) {
        console.log('[PendingApprovalPage] Updating profile status to active');
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ profile_status: 'active' })
          .eq('id', user.id);

        if (profileError) {
          console.error('[PendingApprovalPage] Error updating profile status:', profileError);
          // Don't fail the flow if profile update fails - continue anyway
        }
      }

      // 2. Reload organizations to get the newly added membership
      console.log('[PendingApprovalPage] Refreshing organizations');
      await refreshOrgs();

      // 3. Switch to the newly joined organization
      console.log('[PendingApprovalPage] Switching to organization:', membership.org_id);
      switchOrg(membership.org_id);

      // 4. Show success message and navigate to dashboard
      // Note: We skip marking onboarding as complete because the user already completed onboarding
      // This page is for users who completed onboarding but are waiting for approval
      toast.success('Welcome! Redirecting to your dashboard...');
      setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 1000);
    } catch (error) {
      console.error('[PendingApprovalPage] Error handling approval:', error);
      toast.error('Failed to load dashboard. Please try refreshing the page.');
      setIsLoadingDashboard(false);
    }
  };

  // Handle approval detection
  useEffect(() => {
    if (isApproved && membership && !isLoadingDashboard) {
      console.log('[PendingApprovalPage] Approval detected!', membership);
      handleApprovalDetected(membership);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isApproved, membership, isLoadingDashboard]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/auth/login', { replace: true });
    } catch (err) {
      toast.error('Failed to log out');
    }
  };

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
        setTimeout(() => {
          navigate('/onboarding?step=website_input', { replace: true });
        }, 2000);
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
      console.error('[PendingApprovalPage] Error checking approval status:', error);
      toast.error('Failed to check status. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!user?.id || !joinRequest?.requestId) {
      console.error('[PendingApprovalPage] Missing required data:', { userId: user?.id, requestId: joinRequest?.requestId });
      toast.error('Unable to cancel request. Please refresh the page and try again.');
      return;
    }

    setCanceling(true);
    setShowCancelDialog(false);

    try {
      console.log('[PendingApprovalPage] Cancelling join request:', joinRequest.requestId);
      const result = await cancelJoinRequest(joinRequest.requestId, user.id);

      if (result.success) {
        toast.success('Join request cancelled. Redirecting to onboarding...');
        setTimeout(() => {
          navigate('/onboarding?step=website_input', { replace: true });
        }, 1000);
      } else {
        console.error('[PendingApprovalPage] Cancel failed:', result.error);
        toast.error(result.error || 'Failed to cancel request');
      }
    } catch (error) {
      console.error('[PendingApprovalPage] Error cancelling request:', error);
      toast.error('Failed to cancel request. Please try again.');
    } finally {
      setCanceling(false);
    }
  };

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
          <div className="absolute -right-20 -top-20 w-40 h-40 bg-amber-500/10 blur-3xl rounded-full" />

          <div className="text-center">
            <motion.div
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ repeat: Infinity, duration: 3 }}
              className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/20 mx-auto mb-6"
            >
              <Clock className="w-8 h-8 text-amber-500" />
            </motion.div>

            <h1 className="text-2xl font-bold text-white mb-2">
              Request Pending Approval
            </h1>
            <p className="text-gray-400 mb-6">
              Your request to join{' '}
              <span className="text-white font-medium">
                {joinRequest?.orgName || 'the organization'}
              </span>{' '}
              is awaiting admin review.
            </p>
          </div>

          <div className="space-y-4 mb-6">
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wide mb-1 text-gray-400">
                Email Address
              </p>
              <p className="font-medium text-white">{joinRequest?.email || user?.email}</p>
            </div>

            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wide mb-1 text-gray-400">
                Status
              </p>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                <p className="font-medium text-white">
                  {isLoadingDashboard ? 'Loading your dashboard...' : 'Awaiting Admin Review'}
                </p>
              </div>
              {isPolling && !isLoadingDashboard && (
                <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Checking status...</span>
                </div>
              )}
              {isLoadingDashboard && (
                <div className="flex items-center gap-2 mt-2 text-xs text-green-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Preparing your workspace...</span>
                </div>
              )}
            </div>

            <div className="bg-amber-900/20 border border-amber-800/50 rounded-xl p-4">
              <div className="flex gap-3">
                <Clock className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-100 mb-1">What to Expect</p>
                  <p className="text-sm text-amber-200/80">
                    Once approved, you'll receive an email with a link to access your organization dashboard. This usually happens within 24 hours.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 flex items-center gap-3">
              <Mail className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-300">Check your email regularly</p>
                <p className="text-xs text-gray-500 truncate">
                  Look for approval notification from {joinRequest?.email}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Button
              onClick={checkApprovalStatus}
              disabled={checking || isLoadingDashboard}
              className="w-full bg-violet-600 hover:bg-violet-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white flex items-center justify-center gap-2"
            >
              {checking ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Checking Status...
                </>
              ) : (
                'Check Approval Status'
              )}
            </Button>
            {joinRequest?.requestId ? (
              <>
                <Button
                  onClick={() => setShowCancelDialog(true)}
                  disabled={canceling || isLoadingDashboard}
                  className="w-full bg-gray-700 hover:bg-gray-600 text-white disabled:bg-gray-600 disabled:cursor-not-allowed"
                >
                  {canceling ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Cancelling...
                    </>
                  ) : (
                    'Cancel Request & Restart Onboarding'
                  )}
                </Button>
                <p className="text-xs text-gray-400 text-center -mt-1">
                  Wrong organization? Cancel and start over
                </p>
              </>
            ) : (
              <>
                <Button
                  onClick={async () => {
                    // Reset profile status and redirect
                    if (user?.id) {
                      await supabase
                        .from('profiles')
                        .update({ profile_status: 'active' })
                        .eq('id', user.id);
                    }
                    navigate('/onboarding?step=website_input', { replace: true });
                  }}
                  className="w-full bg-violet-600 hover:bg-violet-700 text-white"
                >
                  Restart Onboarding
                </Button>
                <p className="text-xs text-gray-400 text-center -mt-1">
                  Your join request was removed. Click to start over.
                </p>
              </>
            )}
            <Button
              onClick={handleLogout}
              variant="outline"
              className="w-full border-gray-600 text-gray-300 hover:bg-gray-800"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Log Out
            </Button>
          </div>

          <p className="text-xs text-gray-500 text-center mt-6">
            Questions? Contact your organization administrator or email support@use60.com
          </p>
        </div>
      </motion.div>

      {/* Cancel Confirmation Dialog */}
      <ConfirmDialog
        open={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onConfirm={handleCancelRequest}
        title="Cancel Join Request?"
        description={`Are you sure you want to cancel your request to join ${joinRequest?.orgName || 'this organization'}? You'll be able to create a new organization or request to join a different one.`}
        confirmText="Yes, Cancel Request"
        cancelText="No, Keep Request"
        confirmVariant="warning"
        loading={canceling}
      />
    </div>
  );
}
