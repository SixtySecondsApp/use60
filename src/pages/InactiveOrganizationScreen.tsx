import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, RefreshCw, LogOut, Clock, Calendar, Mail } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useOrganizationContext } from '@/lib/hooks/useOrganizationContext';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  requestOrganizationReactivation,
  getReactivationRequestStatus,
  type OrganizationReactivationRequest
} from '@/lib/services/organizationReactivationService';
import { toast } from 'sonner';
import { logger } from '@/lib/utils/logger';

export default function InactiveOrganizationScreen() {
  const navigate = useNavigate();
  const { activeOrg } = useOrganizationContext();
  const { user } = useAuth();
  const [isRequesting, setIsRequesting] = useState(false);
  const [existingRequest, setExistingRequest] = useState<OrganizationReactivationRequest | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [isOverdue, setIsOverdue] = useState(false);

  useEffect(() => {
    // Check if there's already a pending request
    if (activeOrg?.id) {
      checkExistingRequest();
      calculateDaysRemaining();
      checkOwnerStatus();
    }
  }, [activeOrg?.id, user?.id]);

  const calculateDaysRemaining = () => {
    if (!activeOrg?.deletion_scheduled_at) {
      setDaysRemaining(null);
      return;
    }

    const now = new Date();
    const deletionDate = new Date(activeOrg.deletion_scheduled_at);
    const diffMs = deletionDate.getTime() - now.getTime();
    const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    setDaysRemaining(Math.max(0, daysLeft));
    setIsOverdue(daysLeft <= 0);
  };

  const checkOwnerStatus = async () => {
    if (!activeOrg?.id || !user?.id) return;

    try {
      // Note: This would need to check org_memberships table
      // For now, we'll assume if deactivation_reason exists, we can show owner messaging
      setIsOwner(!!activeOrg?.deactivation_reason);
    } catch (error) {
      logger.error('[InactiveOrganizationScreen] Error checking owner status:', error);
    }
  };

  const checkExistingRequest = async () => {
    if (!activeOrg?.id) return;

    try {
      setIsCheckingStatus(true);
      const request = await getReactivationRequestStatus(activeOrg.id);
      setExistingRequest(request);
    } catch (error) {
      logger.error('[InactiveOrganizationScreen] Error checking request status:', error);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleRequestReactivation = async () => {
    if (!activeOrg?.id) return;

    try {
      setIsRequesting(true);
      const result = await requestOrganizationReactivation(activeOrg.id);

      if (result.success) {
        toast.success('Reactivation request submitted', {
          description: 'An administrator will review your request shortly.'
        });
        // Refresh to show pending status
        await checkExistingRequest();
      } else {
        toast.error('Request failed', {
          description: result.message
        });
      }
    } catch (error) {
      logger.error('[InactiveOrganizationScreen] Error requesting reactivation:', error);
      toast.error('Failed to submit request', {
        description: 'Please try again or contact support.'
      });
    } finally {
      setIsRequesting(false);
    }
  };

  const handleChooseDifferentOrg = () => {
    // TODO: Implement org switcher or redirect to onboarding
    navigate('/onboarding');
  };

  const handleSignOut = () => {
    // Will trigger auth context sign out
    navigate('/auth/logout');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>

          <div>
            <CardTitle className="text-2xl">
              Organization Inactive
            </CardTitle>
            <CardDescription className="mt-2">
              {activeOrg?.name} has been deactivated and is currently unavailable.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Deactivation Info */}
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 space-y-3">
            <div>
              <h3 className="font-semibold text-red-900 dark:text-red-100 mb-2 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Organization Deactivated
              </h3>
              <p className="text-sm text-red-800 dark:text-red-200">
                {activeOrg?.name} has been deactivated. All members have lost access to this organization.
              </p>
            </div>

            {/* Deactivation Details */}
            {activeOrg?.deactivated_at && (
              <div className="text-xs text-red-700 dark:text-red-300 space-y-1">
                <p>
                  <span className="font-medium">Deactivated:</span>{' '}
                  {new Date(activeOrg.deactivated_at).toLocaleDateString()}
                </p>
                {activeOrg.deactivation_reason && (
                  <p>
                    <span className="font-medium">Reason:</span> {activeOrg.deactivation_reason}
                  </p>
                )}
              </div>
            )}

            {/* Countdown Timer */}
            {!isOverdue && daysRemaining !== null && activeOrg?.deletion_scheduled_at && (
              <div className="bg-red-100 dark:bg-red-800/30 rounded p-3 border border-red-300 dark:border-red-700/50">
                <div className="flex items-center gap-2 text-red-900 dark:text-red-100">
                  <Calendar className="h-4 w-4" />
                  <div>
                    <p className="font-semibold text-sm">
                      {daysRemaining === 0 ? 'Deleting today' : `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining`}
                    </p>
                    <p className="text-xs opacity-75">
                      Data will be permanently deleted on {new Date(activeOrg.deletion_scheduled_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {isOverdue && (
              <div className="bg-red-100 dark:bg-red-800/30 rounded p-3 border border-red-300 dark:border-red-700/50">
                <p className="text-xs font-medium text-red-900 dark:text-red-100">
                  ⚠️ Deletion is overdue. This organization data may be permanently deleted soon.
                </p>
              </div>
            )}
          </div>

          {/* TODO: BILLING - Show billing-specific messages */}
          {/* Example:
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-2">Billing Issue</h3>
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Your subscription has been cancelled or payment has failed.
            </p>
            <a href="/settings/billing" className="text-amber-600 dark:text-amber-400 hover:underline font-medium text-sm mt-2 block">
              Update payment method to reactivate
            </a>
          </div>
          */}

          {/* Request Status */}
          {isCheckingStatus ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-600 dark:text-gray-400">Checking request status...</span>
            </div>
          ) : existingRequest ? (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-2 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Reactivation Request Pending
              </h3>
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Your request to reactivate this organization is being reviewed by an administrator.
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
                Submitted: {new Date(existingRequest.requested_at).toLocaleString()}
              </p>
            </div>
          ) : isOwner ? (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-4">
              <div>
                <h3 className="font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Check Your Email
                </h3>
                <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">
                  A confirmation email has been sent with a direct link to reactivate this organization within the 30-day window.
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-2">
                  Can't find the email? Check your spam folder or use the button below to submit a reactivation request for admin review.
                </p>
              </div>

              <Button
                onClick={handleRequestReactivation}
                disabled={isRequesting}
                className="w-full justify-between"
                size="lg"
              >
                <span>Submit Reactivation Request</span>
                {isRequesting && <RefreshCw className="w-4 h-4 animate-spin" />}
              </Button>
            </div>
          ) : (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-4">
              <div>
                <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                  Organization Deactivated
                </h3>
                <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">
                  This organization has been deactivated by its owner. Contact the organization owner or administrator to request reactivation.
                </p>
              </div>

              <div className="bg-blue-100 dark:bg-blue-800/20 rounded p-3 text-sm text-blue-900 dark:text-blue-100">
                <p className="font-medium mb-1">What happens next?</p>
                <ul className="space-y-1 text-xs list-disc list-inside">
                  <li>The organization owner has 30 days to reactivate</li>
                  <li>After 30 days, all data will be permanently deleted</li>
                  <li>You can request to rejoin once it's reactivated</li>
                </ul>
              </div>
            </div>
          )}

          {/* Alternative Actions */}
          <div className="space-y-3">
            <Button
              onClick={handleChooseDifferentOrg}
              variant="outline"
              className="w-full justify-between"
              size="lg"
            >
              <span>Choose Different Organization</span>
              <span>→</span>
            </Button>

            <Button
              onClick={handleSignOut}
              variant="outline"
              className="w-full justify-between"
              size="lg"
            >
              <span className="flex items-center gap-2">
                <LogOut className="w-4 h-4" />
                Sign Out
              </span>
              <span>→</span>
            </Button>
          </div>

          {/* Help Text */}
          <div className="text-center text-sm text-muted-foreground pt-4 border-t">
            <p>
              Need help? Contact support at{' '}
              <a href="mailto:support@use60.com" className="text-primary hover:underline">
                support@use60.com
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
