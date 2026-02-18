import SettingsPageWrapper from '@/components/SettingsPageWrapper';
import Profile from '@/pages/Profile';

export default function AccountSettings() {
  return (
    <SettingsPageWrapper
      title="Account Settings"
      description="Manage your profile and account settings"
    >
      <Profile embedded={true} />
    </SettingsPageWrapper>
  );
}
