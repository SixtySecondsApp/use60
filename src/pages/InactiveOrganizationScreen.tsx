import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, RefreshCw, LogOut, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
      <Card className="max-w-2xl w-full shadow-2xl border-red-200 dark:border-red-900/30">
        <CardHeader className="text-center space-y-4 pb-4">
          <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>

          <div>
            <CardTitle className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Organization Inactive
            </CardTitle>
            <CardDescription className="text-base mt-2">
              {activeOrg?.name} has been deactivated and is currently unavailable.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Deactivation Info */}
          <Alert className="border-red-200 bg-red-50 dark:border-red-900/30 dark:bg-red-900/10">
            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            <AlertDescription className="text-red-800 dark:text-red-200">
              This organization has been temporarily deactivated. Access to all features is currently restricted.
              {activeOrg?.deactivation_reason && (
                <>
                  <br />
                  <span className="font-medium mt-2 block">Reason:</span> {activeOrg.deactivation_reason}
                </>
              )}
            </AlertDescription>
          </Alert>

          {/* TODO: BILLING - Show billing-specific messages */}
          {/* Example:
          <Alert className="border-amber-200 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              <span className="font-medium">Billing Issue:</span> Your subscription has been cancelled or payment has failed.
              <br />
              <a href="/settings/billing" className="underline font-medium">Update payment method</a> to reactivate your organization.
            </AlertDescription>
          </Alert>
          */}

          {/* Request Status */}
          {isCheckingStatus ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-600 dark:text-gray-400">Checking request status...</span>
            </div>
          ) : existingRequest ? (
            <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900/30 dark:bg-amber-900/10">
              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertDescription className="text-amber-800 dark:text-amber-200">
                <span className="font-medium">Reactivation Request Pending</span>
                <br />
                Your request to reactivate this organization is being reviewed by an administrator.
                <br />
                <span className="text-sm text-amber-700 dark:text-amber-300 mt-2 block">
                  Submitted: {new Date(existingRequest.requested_at).toLocaleString()}
                </span>
              </AlertDescription>
            </Alert>
          ) : (
            <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-900/30 rounded-xl p-6 space-y-4">
              <div className="flex items-start gap-3">
                <RefreshCw className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                    Request Reactivation
                  </h3>
                  <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">
                    Submit a request to reactivate this organization. An administrator will review and approve your request.
                  </p>
                  {/* TODO: BILLING - Add billing-specific requirements */}
                  {/* Example:
                  <p className="text-sm text-blue-800 mt-2">
                    <strong>Note:</strong> You will need to update your payment method and resolve any outstanding invoices before reactivation.
                  </p>
                  */}
                </div>
              </div>

              <Button
                onClick={handleRequestReactivation}
                disabled={isRequesting}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isRequesting ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Submitting Request...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Request Reactivation Now
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-gray-700" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white dark:bg-gray-900 text-gray-500">or</span>
            </div>
          </div>

          {/* Alternative Actions */}
          <div className="space-y-3">
            <Button
              onClick={handleChooseDifferentOrg}
              variant="outline"
              className="w-full"
            >
              Choose Different Organization
            </Button>

            <Button
              onClick={handleSignOut}
              variant="outline"
              className="w-full text-gray-600 hover:text-gray-900"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>

          {/* Help Text */}
          <p className="text-sm text-center text-gray-600 dark:text-gray-400">
            Need help? Contact{' '}
            <a href="mailto:support@use60.com" className="text-blue-600 hover:underline">
              support@use60.com
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
