import SettingsPageWrapper from '@/components/SettingsPageWrapper';
import { FathomSettings } from '@/components/integrations/FathomSettings';
import { FathomSelfMapping } from '@/components/settings/FathomSelfMapping';
import { FathomUserMapping } from '@/components/settings/FathomUserMapping';
import { useFathomIntegration } from '@/lib/hooks/useFathomIntegration';
import { useOrgStore } from '@/lib/stores/orgStore';
import { Users } from 'lucide-react';

export default function FathomIntegrationPage() {
  const { isConnected: isFathomConnected, loading } = useFathomIntegration();
  const activeOrgRole = useOrgStore((s) => s.activeOrgRole);
  const isAdmin = activeOrgRole === 'owner' || activeOrgRole === 'admin';

  if (loading) {
    return (
      <SettingsPageWrapper
        title="Fathom"
        description="Manage your Fathom integration settings"
      >
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#37bd7e]"></div>
        </div>
      </SettingsPageWrapper>
    );
  }

  return (
    <SettingsPageWrapper
      title="Fathom"
      description="Manage your Fathom integration settings and user mapping"
    >
      <div className="space-y-6">
        {/* Fathom Connection Section */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Connection
          </h2>
          <FathomSettings />
        </div>

        {/* User Mapping Section - Only show when connected */}
        {isFathomConnected && (
          <>
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
          </>
        )}
      </div>
    </SettingsPageWrapper>
  );
}
