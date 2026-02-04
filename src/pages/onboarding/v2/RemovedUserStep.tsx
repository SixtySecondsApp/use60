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

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, ArrowRight, Building, MailCheck, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOnboardingV2Store } from '@/lib/stores/onboardingV2Store';
import { toast } from 'sonner';
import logger from '@/lib/utils/logger';

interface RemovedUserStepProps {
  orgName?: string;
  orgId?: string;
}

export function RemovedUserStep({ orgName: propOrgName, orgId: propOrgId }: RemovedUserStepProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { reset } = useOnboardingV2Store();
  const [isRequesting, setIsRequesting] = useState(false);
  const [requestSubmitted, setRequestSubmitted] = useState(false);
  const [orgName, setOrgName] = useState(propOrgName);
  const [orgId, setOrgId] = useState(propOrgId);
  const [isUserRemoved, setIsUserRemoved] = useState(true); // True = removed by admin, False = user left
  const [isLoading, setIsLoading] = useState(!propOrgId); // Load org info if not provided

  // Fetch organization info if not provided as props
  useEffect(() => {
    const fetchRemovedOrgInfo = async () => {
      if (!user?.id || orgId) return; // Skip if we already have orgId or no user

      try {
        const { data, error } = await supabase
          .from('organization_join_requests')
          .select('org_id, organizations(name)')
          .eq('user_id', user.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .maybeSingle();

        if (data?.org_id) {
          setOrgId(data.org_id);
          setOrgName(data.organizations?.name || 'the organization');
          logger.log('Loaded removed org info:', data.org_id);
        } else {
          // Also check for recent removed/left memberships
          const { data: recentRemoved } = await supabase
            .from('organization_memberships')
            .select('org_id, organizations(name), member_status, removed_by')
            .eq('user_id', user.id)
            .eq('member_status', 'removed')
            .order('removed_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (recentRemoved?.org_id) {
            setOrgId(recentRemoved.org_id);
            setOrgName(recentRemoved.organizations?.name || 'the organization');
            // Check if user left (removed_by = user_id) or was removed by admin (removed_by != user_id)
            setIsUserRemoved(recentRemoved.removed_by !== user.id);
            logger.log('Loaded recent membership:', recentRemoved.org_id, 'Removed by:', recentRemoved.removed_by, 'Current user:', user.id);
          }
        }
      } catch (error) {
        logger.error('Error fetching removed org info:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRemovedOrgInfo();
  }, [user?.id, orgId]);

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
    // Clear redirect flag and local state
    sessionStorage.removeItem('user_removed_redirect');

    try {
      console.log('[RemovedUserStep] User chose to select different organization');

      const { data: { user: authUser } } = await supabase.auth.getUser();

      if (authUser?.id) {
        // Clear local Zustand store to reset onboarding state
        reset();

        // Clear any localStorage onboarding state
        localStorage.removeItem(`sixty_onboarding_${authUser.id}`);

        // Reset onboarding progress to website_input so user can restart fresh
        const { error: progressError } = await supabase
          .from('user_onboarding_progress')
          .upsert({
            user_id: authUser.id,
            onboarding_step: 'website_input',
          }, {
            onConflict: 'user_id',
          });

        if (progressError) {
          console.warn('[RemovedUserStep] Error updating progress:', progressError);
        }

        // Also clear redirect flag
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ redirect_to_onboarding: false })
          .eq('id', authUser.id);

        if (profileError) {
          console.warn('[RemovedUserStep] Error updating profile:', profileError);
        }

        console.log('[RemovedUserStep] Cleared store, localStorage, and reset database');
      }

      // Small delay to ensure database writes complete before navigation
      await new Promise(resolve => setTimeout(resolve, 500));

      // Restart onboarding from the beginning, as if they're a new user
      // This lets them choose a different organization through the normal flow
      console.log('[RemovedUserStep] Redirecting to onboarding start');
      window.location.href = '/onboarding?step=website_input';
    } catch (error) {
      console.error('Error in handleChooseDifferentOrg:', error);
      toast.error('Failed to proceed. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="max-w-2xl w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
            </div>
            <CardTitle className="text-2xl">Loading...</CardTitle>
            <CardDescription>
              Preparing your options...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

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
          <CardTitle className="text-2xl">
            {isUserRemoved ? 'You Were Removed from ' : 'You Left '}{orgName || 'an Organization'}
          </CardTitle>
          <CardDescription className="mt-4">
            {isUserRemoved
              ? `An administrator has removed you from ${orgName || 'the organization'}. You can request to rejoin or choose another organization.`
              : `You left ${orgName || 'the organization'}. You can request to rejoin or choose another organization.`}
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
              {isUserRemoved ? (
                <li>Request to rejoin {orgName} if you'd like to continue working with this team</li>
              ) : (
                <li>Request to rejoin {orgName} if you change your mind</li>
              )}
              <li>Choose a different organization to continue working</li>
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
              title={!orgId ? 'Loading organization information...' : ''}
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
