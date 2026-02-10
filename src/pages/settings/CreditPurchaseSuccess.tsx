import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCreditBalance } from '@/lib/hooks/useCreditBalance';
import { useQueryClient } from '@tanstack/react-query';
import { creditKeys } from '@/lib/hooks/useCreditBalance';
import { useOrgId } from '@/lib/contexts/OrgContext';

export default function CreditPurchaseSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const queryClient = useQueryClient();
  const orgId = useOrgId();
  const { data: balance } = useCreditBalance();

  // Refetch balance immediately on mount
  useEffect(() => {
    if (orgId) {
      queryClient.invalidateQueries({ queryKey: creditKeys.balance(orgId) });
    }
  }, [orgId, queryClient]);

  // Auto-redirect after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('/settings/credits', { replace: true });
    }, 5000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen">
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="max-w-lg mx-auto text-center space-y-6 pt-16">
          {/* Success icon */}
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>

          {/* Heading */}
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-[#1E293B] dark:text-white">
              Purchase Successful
            </h1>
            <p className="text-[#64748B] dark:text-gray-400">
              Your credits have been added to your account.
            </p>
          </div>

          {/* Balance display */}
          {balance && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 p-4">
              <p className="text-sm text-[#64748B] dark:text-gray-400">Current Balance</p>
              <p className="text-3xl font-bold text-[#1E293B] dark:text-white">
                ${balance.balance.toFixed(2)}
              </p>
            </div>
          )}

          {/* Session ID for reference */}
          {sessionId && (
            <p className="text-xs text-[#94A3B8]">
              Session: {sessionId}
            </p>
          )}

          {/* Auto-redirect notice */}
          <p className="text-sm text-[#64748B] dark:text-gray-400">
            Redirecting to credits page in 5 seconds...
          </p>

          {/* Return button */}
          <Button
            onClick={() => navigate('/settings/credits', { replace: true })}
            variant="outline"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Return to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
