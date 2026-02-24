/**
 * EmailSendPermission - Settings component for Gmail send scope
 * Shows current Gmail permissions and allows upgrading to include send scope.
 */

import { useState, useEffect } from 'react';
import { Mail, Shield, AlertTriangle, Check, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useGoogleIntegration } from '@/lib/stores/integrationStore';
import { googleApi } from '@/lib/api/googleIntegration';
import { toast } from 'sonner';

const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

export default function EmailSendPermission() {
  const { integration, isConnected, isLoading } = useGoogleIntegration();
  const [hasSendScope, setHasSendScope] = useState<boolean>(false);
  const [isUpgrading, setIsUpgrading] = useState<boolean>(false);
  const [checkingScopes, setCheckingScopes] = useState<boolean>(true);

  // Check if send scope is already granted
  useEffect(() => {
    if (integration?.scopes) {
      const scopes = integration.scopes.split(' ');
      setHasSendScope(scopes.includes(GMAIL_SEND_SCOPE));
    } else {
      setHasSendScope(false);
    }
    setCheckingScopes(false);
  }, [integration]);

  const handleEnableGmailSend = async () => {
    setIsUpgrading(true);

    try {
      // Request new OAuth URL with expanded scopes
      const { authUrl } = await googleApi.initiateOAuth();

      // Add a marker to the URL to indicate this is a scope upgrade
      const upgradeUrl = `${authUrl}&prompt=consent`;

      // Redirect to Google consent screen
      // The callback will handle the updated tokens
      window.location.href = upgradeUrl;
    } catch (error: any) {
      console.error('[EmailSendPermission] Failed to initiate scope upgrade:', error);
      toast.error('Failed to upgrade Gmail permissions', {
        description: error.message || 'Please try again later.',
      });
      setIsUpgrading(false);
    }
  };

  // Loading state
  if (isLoading || checkingScopes) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-500/10 rounded-lg">
              <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle>Gmail Send Permission</CardTitle>
              <CardDescription>Checking current permissions...</CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  }

  // Not connected to Google
  if (!isConnected || !integration) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <Mail className="w-5 h-5 text-gray-400" />
            </div>
            <div>
              <CardTitle>Gmail Send Permission</CardTitle>
              <CardDescription>Connect Google Workspace to enable email sending</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Google Workspace Not Connected</AlertTitle>
            <AlertDescription>
              Please connect your Google Workspace account first to manage Gmail send permissions.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Already has send scope
  if (hasSendScope) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg">
              <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle>Gmail Send Permission</CardTitle>
                <Badge variant="success">Active</Badge>
              </div>
              <CardDescription>AI can send emails on your behalf</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertTitle>Send Permission Granted</AlertTitle>
            <AlertDescription>
              Your AI assistant can now send follow-up emails, meeting confirmations, and proposals directly through Gmail.
            </AlertDescription>
          </Alert>

          <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
            <p className="font-medium">What this enables:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Automated follow-up emails after meetings</li>
              <li>Meeting confirmations and calendar invitations</li>
              <li>Proposal and document delivery</li>
              <li>AI-drafted responses (with your approval)</li>
            </ul>
            <p className="text-xs mt-4 text-gray-500 dark:text-gray-500">
              All emails are sent from your Gmail account and require your approval before sending.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Needs send scope
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-yellow-50 dark:bg-yellow-500/10 rounded-lg">
            <Mail className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CardTitle>Gmail Send Permission</CardTitle>
              <Badge variant="warning">Limited</Badge>
            </div>
            <CardDescription>Enable AI to send emails on your behalf</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Send Permission Not Granted</AlertTitle>
          <AlertDescription>
            Your AI assistant can read emails but cannot send them. Grant send permission to enable automated follow-ups and proposals.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
            <p className="font-medium">What this enables:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Automated follow-up emails after meetings</li>
              <li>Meeting confirmations and calendar invitations</li>
              <li>Proposal and document delivery</li>
              <li>AI-drafted responses (with your approval)</li>
            </ul>
          </div>

          <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg p-4 space-y-2">
            <div className="flex items-start gap-2">
              <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5" />
              <div className="text-sm text-blue-900 dark:text-blue-200 space-y-1">
                <p className="font-medium">Privacy & Control</p>
                <p className="text-xs">
                  All emails require your approval before sending. You&apos;ll review the content, recipients, and subject line via Slack notifications.
                  Your AI assistant never sends emails without explicit confirmation.
                </p>
              </div>
            </div>
          </div>

          <Button
            onClick={handleEnableGmailSend}
            disabled={isUpgrading}
            className="w-full"
            size="lg"
          >
            {isUpgrading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Redirecting to Google...
              </>
            ) : (
              <>
                <ExternalLink className="w-4 h-4 mr-2" />
                Enable Gmail Send
              </>
            )}
          </Button>

          <p className="text-xs text-gray-500 dark:text-gray-500 text-center">
            You&apos;ll be redirected to Google to grant additional permissions. Your existing permissions will remain unchanged.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
