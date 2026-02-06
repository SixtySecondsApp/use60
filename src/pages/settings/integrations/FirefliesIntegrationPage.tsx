import SettingsPageWrapper from '@/components/SettingsPageWrapper';
import { FirefliesSettings } from '@/components/integrations/FirefliesSettings';
import { useFirefliesIntegration } from '@/lib/hooks/useFirefliesIntegration';

export default function FirefliesIntegrationPage() {
  const { loading } = useFirefliesIntegration();

  if (loading) {
    return (
      <SettingsPageWrapper
        title="Fireflies"
        description="Manage your Fireflies.ai integration settings"
      >
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#37bd7e]"></div>
        </div>
      </SettingsPageWrapper>
    );
  }

  return (
    <SettingsPageWrapper
      title="Fireflies"
      description="Manage your Fireflies.ai integration settings"
    >
      <div className="space-y-6">
        {/* Fireflies Connection Section */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Connection
          </h2>
          <FirefliesSettings />
        </div>
      </div>
    </SettingsPageWrapper>
  );
}
