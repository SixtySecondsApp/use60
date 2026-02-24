import { type ReactNode } from 'react';
import { useRequireCredits } from '@/lib/hooks/useRequireCredits';
import { CreditCard, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isUserAdmin } from '@/lib/utils/adminUtils';
import { useUser } from '@/lib/hooks/useUser';

interface CreditGateProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function CreditGate({ children, fallback }: CreditGateProps) {
  const { hasCredits, isLoading, showTopUpPrompt } = useRequireCredits();
  const { userData } = useUser();
  const isAdmin = userData ? isUserAdmin(userData) : false;

  if (isLoading) return <>{children}</>;
  if (hasCredits) return <>{children}</>;

  if (fallback) return <>{fallback}</>;

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 px-6 text-center">
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10">
        <AlertTriangle className="w-6 h-6 text-destructive" />
      </div>
      <div>
        <h3 className="text-lg font-semibold">No AI Credits Remaining</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {isAdmin
            ? 'Top up your organization credits to continue using AI features.'
            : 'Contact your organization admin to top up AI credits.'}
        </p>
      </div>
      {isAdmin && (
        <Button onClick={showTopUpPrompt} className="gap-2">
          <CreditCard className="w-4 h-4" />
          Top Up Credits
        </Button>
      )}
    </div>
  );
}
