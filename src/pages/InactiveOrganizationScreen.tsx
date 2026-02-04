import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, RefreshCw, LogOut, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useOrganizationContext } from '@/lib/hooks/useOrganizationContext';
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
  const [isRequesting, setIsRequesting] = useState(false);
  const [existingRequest, setExistingRequest] = useState<OrganizationReactivationRequest | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);

  useEffect(() => {
    // Check if there's already a pending request
    if (activeOrg?.id) {
      checkExistingRequest();
    }
  }, [activeOrg?.id]);

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
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <h3 className="font-semibold text-red-900 dark:text-red-100 mb-2 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Organization Deactivated
            </h3>
            <p className="text-sm text-red-800 dark:text-red-200">
              This organization has been temporarily deactivated. Access to all features is currently restricted.
            </p>
            {activeOrg?.deactivation_reason && (
              <p className="text-sm text-red-800 dark:text-red-200 mt-2">
                <span className="font-medium">Reason:</span> {activeOrg.deactivation_reason}
              </p>
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
          ) : (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-4">
              <div>
                <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                  Request Reactivation
                </h3>
                <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">
                  Submit a request to reactivate this organization. An administrator will review and approve your request.
                </p>
                {/* TODO: BILLING - Add billing-specific requirements */}
                {/* Example:
                <p className="text-sm text-blue-800 dark:text-blue-200 mt-2">
                  <strong>Note:</strong> You will need to update your payment method and resolve any outstanding invoices before reactivation.
                </p>
                */}
              </div>

              <Button
                onClick={handleRequestReactivation}
                disabled={isRequesting}
                className="w-full justify-between"
                size="lg"
              >
                <span>Request Reactivation Now</span>
                {isRequesting && <RefreshCw className="w-4 h-4 animate-spin" />}
              </Button>
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
