/**
 * Request Rejected Page
 *
 * Shown when a user's join request was rejected.
 * Their account remains but they cannot access the organization.
 * Accessible via /auth/request-rejected
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { XCircle, LogOut, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

export default function RequestRejectedPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [rejectionDetails, setRejectionDetails] = useState<{
    orgName: string;
    reason?: string;
  } | null>(null);

  useEffect(() => {
    // Fetch rejection details
    const fetchRejectionDetails = async () => {
      if (!user?.id) return;

      try {
        const { data } = await supabase
          .from('organization_join_requests')
          .select('org_id, rejection_reason, organizations(name)')
          .eq('user_id', user.id)
          .eq('status', 'rejected')
          .order('actioned_at', { ascending: false })
          .maybeSingle();

        if (data) {
          setRejectionDetails({
            orgName: data.organizations?.name || 'the organization',
            reason: data.rejection_reason,
          });
        }
      } catch (err) {
        console.error('Error fetching rejection details:', err);
      }
    };

    fetchRejectionDetails();
  }, [user?.id]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/auth/login', { replace: true });
    } catch (err) {
      toast.error('Failed to log out');
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
          <div className="absolute -right-20 -top-20 w-40 h-40 bg-red-500/10 blur-3xl rounded-full" />

          <div className="text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.2 }}
              className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/20 mx-auto mb-6"
            >
              <XCircle className="w-8 h-8 text-red-400" />
            </motion.div>

            <h1 className="text-2xl font-bold text-white mb-2">
              Request Not Approved
            </h1>
            <p className="text-gray-400 mb-6">
              Your request to join{' '}
              <span className="text-white font-medium">
                {rejectionDetails?.orgName || 'the organization'}
              </span>{' '}
              was not approved.
            </p>
          </div>

          <div className="space-y-4 mb-6">
            {rejectionDetails?.reason && (
              <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-4">
                <p className="text-sm font-medium text-red-100 mb-1">Reason</p>
                <p className="text-sm text-red-200/80">{rejectionDetails.reason}</p>
              </div>
            )}

            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wide mb-1 text-gray-400">
                Email Address
              </p>
              <p className="font-medium text-white">{user?.email}</p>
            </div>

            <div className="bg-blue-900/20 border border-blue-800/50 rounded-xl p-4">
              <div className="flex gap-3">
                <Mail className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-100 mb-1">Next Steps</p>
                  <p className="text-sm text-blue-200/80">
                    If you believe this is in error, please contact the organization administrator or our support team at support@use60.com
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Button
              onClick={async () => {
                try {
                  // Reset profile status to active
                  await supabase
                    .from('profiles')
                    .update({ profile_status: 'active' })
                    .eq('id', user?.id);

                  // Reset onboarding progress to start over
                  await supabase
                    .from('user_onboarding_progress')
                    .update({
                      onboarding_step: 'website_input',
                      onboarding_completed_at: null,
                    })
                    .eq('user_id', user?.id);

                  toast.success('You can now request to join a different organization');
                  window.location.href = '/onboarding?step=website_input';
                } catch (error) {
                  console.error('Error resetting onboarding:', error);
                  toast.error('Failed to restart onboarding');
                }
              }}
              className="w-full bg-violet-600 hover:bg-violet-700 text-white"
            >
              Start Over & Request Different Organization
            </Button>
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
            Your account is still active but you cannot access this organization.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
