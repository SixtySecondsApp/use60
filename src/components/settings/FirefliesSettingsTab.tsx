import { useNavigate } from 'react-router-dom';
import { ExternalLink, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FirefliesSettings } from '@/components/integrations/FirefliesSettings';
import { useFirefliesIntegration } from '@/lib/hooks/useFirefliesIntegration';
import { useIntegrationLogo } from '@/lib/hooks/useIntegrationLogo';

export function FirefliesSettingsTab() {
  const { isConnected, loading } = useFirefliesIntegration();

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Connection section header + card */}
        <div className="space-y-3">
          <Skeleton className="h-6 w-28" />
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return <FirefliesNotConnected />;
  }

  return (
    <div className="space-y-6">
      {/* Fireflies Connection Section */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Connection
        </h2>
        <FirefliesSettings />
      </div>
    </div>
  );
}

function FirefliesNotConnected() {
  const navigate = useNavigate();
  const { logoUrl } = useIntegrationLogo('fireflies');

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl mb-4 overflow-hidden">
        {logoUrl ? (
          <img src={logoUrl} alt="Fireflies.ai" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 flex items-center justify-center">
            <Video className="h-8 w-8 text-red-500 dark:text-red-400" />
          </div>
        )}
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Connect Fireflies</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-6">
        Connect your Fireflies.ai account to sync AI meeting notes and transcriptions.
      </p>
      <Button onClick={() => navigate('/integrations')} className="gap-2">
        <ExternalLink className="h-4 w-4" />
        Go to Integrations
      </Button>
    </div>
  );
}
