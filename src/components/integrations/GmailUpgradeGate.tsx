import { Lock, Mail, ArrowRight } from 'lucide-react';
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
 * Wraps Gmail-read-dependent UI with an upgrade prompt.
 * If the user has canReadGmail (paid scope_tier or Nylas connected),
 * children render normally. Otherwise shows an upgrade CTA.
 */
export function GmailUpgradeGate({
  children,
  message = 'Upgrade to access your Gmail inbox, read emails, and create drafts.',
  showBlurredPreview = false,
}: GmailUpgradeGateProps) {
  const { google, connectNylas } = useIntegrationStore();

  // If user can read Gmail (paid tier or Nylas connected), show children
  if (google.canReadGmail) {
    return <>{children}</>;
  }

  // If Google isn't connected at all, don't show the gate — they need to connect first
  if (!google.isConnected) {
    return <>{children}</>;
  }

  const handleUpgrade = async () => {
    try {
      const authUrl = await connectNylas();
      window.location.href = authUrl;
    } catch (error: any) {
      toast.error(error.message || 'Failed to start Gmail upgrade');
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
            <p className="text-sm font-medium">Gmail Read Access</p>
            <p className="text-xs text-muted-foreground max-w-[280px]">
              {message}
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleUpgrade}
            disabled={google.isLoading}
            className="gap-2"
          >
            <Mail className="h-4 w-4" />
            Connect Gmail Fully
            <ArrowRight className="h-3 w-3" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
