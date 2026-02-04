/**
 * RemovedUserStep - Shown when user is removed from an organization
 *
 * Story: ORGREM-014
 *
 * Displays:
 * - Message that they were removed
 * - Option to request to rejoin (requires admin approval)
 * - Option to choose a different organization
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, ArrowRight, Building, MailCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import logger from '@/lib/utils/logger';

interface RemovedUserStepProps {
  orgName?: string;
  orgId?: string;
}

export function RemovedUserStep({ orgName, orgId }: RemovedUserStepProps) {
  const navigate = useNavigate();
  const [isRequesting, setIsRequesting] = useState(false);
  const [requestSubmitted, setRequestSubmitted] = useState(false);

  const handleRequestRejoin = async () => {
    if (!orgId) {
      toast.error('Organization information not available');
      return;
    }

    setIsRequesting(true);

    try {
      // Call request_rejoin RPC
      const { data, error } = await supabase.rpc('request_rejoin', {
        p_org_id: orgId,
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Failed to create rejoin request');
      }

      logger.log('✅ Rejoin request created:', data.requestId);

      setRequestSubmitted(true);
      toast.success('Rejoin request submitted! An admin will review your request.');

      // Redirect to pending approval page
      setTimeout(() => {
        navigate('/auth/pending-approval');
      }, 2000);

    } catch (error: any) {
      logger.error('Error requesting rejoin:', error);
      toast.error(error.message || 'Failed to submit rejoin request');
    } finally {
      setIsRequesting(false);
    }
  };

  const handleChooseDifferentOrg = async () => {
    // Clear redirect flag and go to org selection
    sessionStorage.removeItem('user_removed_redirect');

    try {
      // Get current user ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) {
        throw new Error('User not found');
      }

      // Update profile to clear redirect flag
      const { error } = await supabase
        .from('profiles')
        .update({ redirect_to_onboarding: false })
        .eq('id', user.id);

      if (error) {
        console.error('Error clearing redirect flag:', error);
        // Continue anyway - user can still proceed to onboarding
      }

      // Navigate to organization selection
      navigate('/onboarding?step=organization_selection');
    } catch (error) {
      console.error('Error in handleChooseDifferentOrg:', error);
      toast.error('Failed to proceed. Please try again.');
    }
  };

  if (requestSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="max-w-2xl w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center">
              <MailCheck className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-2xl">Request Submitted</CardTitle>
            <CardDescription>
              Your request to rejoin {orgName || 'the organization'} has been submitted.
              An administrator will review your request and notify you via email.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Redirecting to pending approval page...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 bg-orange-100 dark:bg-orange-900/20 rounded-full flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-orange-600 dark:text-orange-400" />
          </div>
          <CardTitle className="text-2xl">You Were Removed from {orgName || 'an Organization'}</CardTitle>
          <CardDescription className="mt-4">
            An administrator has removed you from {orgName || 'the organization'}.
            Your account remains active, and you have several options to continue.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* What Happened */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">What This Means</h3>
            <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
              <li>Your account and profile are still active</li>
              <li>All data you created has been preserved</li>
              <li>You can view your past work, but cannot edit it</li>
              <li>You can request to rejoin or choose a different organization</li>
            </ul>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <h3 className="font-semibold">What Would You Like to Do?</h3>

            <Button
              onClick={handleRequestRejoin}
              disabled={isRequesting || !orgId}
              className="w-full justify-between"
              size="lg"
            >
              <span>Request to Rejoin {orgName || 'Organization'}</span>
              <ArrowRight className="w-4 h-4" />
            </Button>

            <Button
              onClick={handleChooseDifferentOrg}
              disabled={isRequesting}
              variant="outline"
              className="w-full justify-between"
              size="lg"
            >
              <span className="flex items-center gap-2">
                <Building className="w-4 h-4" />
                Choose Different Organization
              </span>
              <ArrowRight className="w-4 h-4" />
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

export default RemovedUserStep;
