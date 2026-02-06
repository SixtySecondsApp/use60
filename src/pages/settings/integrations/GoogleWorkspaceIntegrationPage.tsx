/**
 * GoogleWorkspaceIntegrationPage
 *
 * Dedicated settings page for Google Workspace integration.
 * Accessible at /settings/integrations/google-workspace when connected.
 */

import SettingsPageWrapper from '@/components/SettingsPageWrapper';
import { GoogleWorkspaceSettings } from '@/components/integrations/GoogleWorkspaceSettings';

export default function GoogleWorkspaceIntegrationPage() {
  return (
    <SettingsPageWrapper
      title="Google Workspace"
      description="Manage your Google Workspace integration settings"
    >
      <GoogleWorkspaceSettings />
    </SettingsPageWrapper>
  );
}
