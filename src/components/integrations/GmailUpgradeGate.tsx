import { Lock, Calendar, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useIntegrationStore } from '@/lib/stores/integrationStore';
import { toast } from 'sonner';

interface GmailUpgradeGateProps {
  children: React.ReactNode;
  /** Optional message shown in the gate */
  message?: string;
  /** If true, shows a blurred preview of the children instead of hiding them */
  showBlurredPreview?: boolean;
}

/**
 * Wraps calendar-dependent UI with a Nylas connection prompt.
 * If the user has nylasCalendarConnected, children render normally.
 * Otherwise shows a connect CTA.
 */
export function GmailUpgradeGate({
  children,
  message = 'Connect your Google Calendar via Nylas to view and sync meetings.',
  showBlurredPreview = false,
}: GmailUpgradeGateProps) {
  const { google, connectNylas } = useIntegrationStore();

  // If user has Nylas calendar connected, show children
  if (google.nylasCalendarConnected) {
    return <>{children}</>;
  }

  // If Google isn't connected at all, don't show the gate
  if (!google.isConnected) {
    return <>{children}</>;
  }

  const handleConnect = async () => {
    try {
      const authUrl = await connectNylas();
      window.location.href = authUrl;
    } catch (error: any) {
      toast.error(error.message || 'Failed to start calendar connection');
    }
  };

  return (
    <div className="relative">
      {showBlurredPreview && (
        <div className="pointer-events-none select-none blur-sm opacity-50">
          {children}
        </div>
      )}
      <Card className={showBlurredPreview ? 'absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm border-0' : ''}>
        <CardContent className="flex flex-col items-center gap-3 py-6 px-4 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">Google Calendar Access</p>
            <p className="text-xs text-muted-foreground max-w-[280px]">
              {message}
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleConnect}
            disabled={google.isLoading}
            className="gap-2"
          >
            <Calendar className="h-4 w-4" />
            Connect Calendar
            <ArrowRight className="h-3 w-3" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
