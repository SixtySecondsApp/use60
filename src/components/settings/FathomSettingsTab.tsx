import { useNavigate } from 'react-router-dom';
import { ExternalLink, Video, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FathomSettings } from '@/components/integrations/FathomSettings';
import { FathomSelfMapping } from '@/components/settings/FathomSelfMapping';
import { FathomUserMapping } from '@/components/settings/FathomUserMapping';
import { useFathomIntegration } from '@/lib/hooks/useFathomIntegration';
import { useOrgStore } from '@/lib/stores/orgStore';

export function FathomSettingsTab() {
  const navigate = useNavigate();
  const { isConnected: isFathomConnected, loading } = useFathomIntegration();
  const activeOrgRole = useOrgStore((s) => s.activeOrgRole);
  const isAdmin = activeOrgRole === 'owner' || activeOrgRole === 'admin';

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
        {/* User mapping section */}
        <div className="border-t border-gray-200 dark:border-gray-800 pt-6 space-y-3">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-3 w-64" />
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!isFathomConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-blue-500/10 dark:bg-blue-500/20 border border-blue-500/20 flex items-center justify-center mb-4">
          <Video className="h-8 w-8 text-blue-500 dark:text-blue-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Connect Fathom</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-6">
          Connect your Fathom account to sync AI meeting notes and transcriptions.
        </p>
        <Button onClick={() => navigate('/settings/integrations')} className="gap-2">
          <ExternalLink className="h-4 w-4" />
          Go to Integrations
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Fathom Connection Section */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Connection
        </h2>
        <FathomSettings />
      </div>

      {/* User Mapping Section */}
      <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Users className="h-5 w-5" />
          User Mapping
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Link Fathom users to Sixty accounts so meetings are correctly attributed to the right person.
        </p>
      </div>

      {/* Personal Fathom Mapping - For all users */}
      <FathomSelfMapping />

      {/* Org-wide User Mapping - Admin only */}
      {isAdmin && (
        <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4">
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white mb-1">
              Team User Mapping
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              As an admin, you can map any Fathom user to a Sixty team member. This ensures all synced meetings are attributed to the correct owners.
            </p>
          </div>
          <FathomUserMapping />
        </div>
      )}
    </div>
  );
}
