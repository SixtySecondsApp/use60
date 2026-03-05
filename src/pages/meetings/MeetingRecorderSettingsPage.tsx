import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { Video } from 'lucide-react';
import SettingsPageWrapper from '@/components/SettingsPageWrapper';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FathomSettingsTab } from '@/components/settings/FathomSettingsTab';
import { FirefliesSettingsTab } from '@/components/settings/FirefliesSettingsTab';
import { NotetakerSettingsTab } from '@/components/settings/NotetakerSettingsTab';

const VALID_RECORDERS = ['notetaker', 'fathom', 'fireflies'] as const;
type RecorderValue = (typeof VALID_RECORDERS)[number];

function isValidRecorder(value: string | undefined): value is RecorderValue {
  return VALID_RECORDERS.includes(value as RecorderValue);
}

export default function MeetingRecorderSettingsPage() {
  const { recorder } = useParams<{ recorder: string }>();
  const navigate = useNavigate();

  if (!isValidRecorder(recorder)) {
    return <Navigate to="/meetings/settings" replace />;
  }

  const handleTabChange = (value: string) => {
    navigate(`/meetings/settings/${value}`, { replace: true });
  };

  return (
    <SettingsPageWrapper
      title="Meeting Settings"
      description="Configure meeting recording, transcription, and notetaker integrations"
      icon={Video}
      iconClassName="h-7 w-7 text-emerald-600 dark:text-emerald-400"
      iconContainerClassName="bg-emerald-600/10 dark:bg-emerald-500/20 border-emerald-600/20 dark:border-emerald-500/30"
      dotClassName="bg-emerald-500"
      accentGradient="from-emerald-600 via-teal-500 to-cyan-500"
    >
      <Tabs value={recorder} onValueChange={handleTabChange}>
        <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:flex mb-6">
          <TabsTrigger value="notetaker">60 Notetaker</TabsTrigger>
          <TabsTrigger value="fathom">Fathom</TabsTrigger>
          <TabsTrigger value="fireflies">Fireflies</TabsTrigger>
        </TabsList>

        <TabsContent value="notetaker">
          <NotetakerSettingsTab />
        </TabsContent>

        <TabsContent value="fathom">
          <FathomSettingsTab />
        </TabsContent>

        <TabsContent value="fireflies">
          <FirefliesSettingsTab />
        </TabsContent>
      </Tabs>
    </SettingsPageWrapper>
  );
}
