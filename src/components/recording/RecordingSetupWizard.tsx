/**
 * RecordingSetupWizard Component
 *
 * Step-by-step wizard for first-time recording setup.
 * Guides users through:
 * 1. Connecting Google Calendar
 * 2. Selecting which calendar to watch
 * 3. Enabling auto-recording (optional)
 * 4. Customizing bot appearance (optional)
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import {
  Calendar,
  Bot,
  CheckCircle2,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Link2,
} from 'lucide-react';
import { useNotetakerIntegration } from '@/lib/hooks/useNotetakerIntegration';
import { useCalendarList } from '@/lib/hooks/useGoogleIntegration';
import { useMeetingBaaSCalendar } from '@/lib/hooks/useMeetingBaaSCalendar';
import { useRecordingSettings } from '@/lib/hooks/useRecordings';
import { useRecordingSetupStatus } from '@/lib/hooks/useRecordingSetupStatus';
import { useOrg } from '@/lib/contexts/OrgContext';
import { recordingService } from '@/lib/services/recordingService';
import { toast } from 'sonner';
import { DEFAULT_SIXTY_ICON_URL } from '@/lib/utils/sixtyBranding';
import { cn } from '@/lib/utils';

// =============================================================================
// Types
// =============================================================================

type WizardStep = 'connect-google' | 'select-calendar' | 'enable-auto-recording' | 'bot-appearance';

interface RecordingSetupWizardProps {
  onComplete: () => void;
}

// =============================================================================
// Component
// =============================================================================

export const RecordingSetupWizard: React.FC<RecordingSetupWizardProps> = ({ onComplete }) => {
  const navigate = useNavigate();
  const { activeOrgId } = useOrg();

  // Hooks
  const { googleConnected, userSettings, updateSettings, isUpdating } = useNotetakerIntegration();
  const { data: calendarsData, isLoading: calendarsLoading } = useCalendarList(googleConnected);
  const { connect: connectMeetingBaaSCalendar, isConnecting: meetingBaaSConnecting } = useMeetingBaaSCalendar();
  const { settings, refetch: refetchSettings } = useRecordingSettings();
  const { markSetupComplete, isMarkingComplete } = useRecordingSetupStatus();

  // State
  const [currentStep, setCurrentStep] = useState<WizardStep>('connect-google');
  const [selectedCalendarId, setSelectedCalendarId] = useState('primary');
  const [autoRecordEnabled, setAutoRecordEnabled] = useState(false);
  const [botName, setBotName] = useState('60 Notetaker');
  const [saving, setSaving] = useState(false);

  // Auto-advance to calendar selection when Google is connected
  useEffect(() => {
    if (googleConnected && currentStep === 'connect-google') {
      setCurrentStep('select-calendar');
    }
  }, [googleConnected, currentStep]);

  // Initialize selected calendar from user settings
  useEffect(() => {
    if (userSettings?.selected_calendar_id) {
      setSelectedCalendarId(userSettings.selected_calendar_id);
    } else if (calendarsData?.calendars?.length) {
      const primaryCalendar = calendarsData.calendars.find((c: { primary?: boolean }) => c.primary);
      if (primaryCalendar) {
        setSelectedCalendarId(primaryCalendar.id);
      }
    }
  }, [userSettings, calendarsData]);

  // Initialize bot name from settings
  useEffect(() => {
    if (settings?.bot_name) {
      setBotName(settings.bot_name);
    }
  }, [settings]);

  // Handlers
  const handleConnectGoogle = () => {
    navigate('/integrations');
  };

  const handleSelectCalendar = async () => {
    try {
      await updateSettings({ selected_calendar_id: selectedCalendarId });
      setCurrentStep('enable-auto-recording');
    } catch (error) {
      console.error('Failed to save calendar selection:', error);
      toast.error('Failed to save calendar selection');
    }
  };

  const handleEnableAutoRecording = async () => {
    if (autoRecordEnabled) {
      try {
        await connectMeetingBaaSCalendar(selectedCalendarId);
        setCurrentStep('bot-appearance');
      } catch (error) {
        console.error('Failed to enable auto-recording:', error);
        // Error is already shown by the hook
      }
    } else {
      setCurrentStep('bot-appearance');
    }
  };

  const handleComplete = async () => {
    if (!activeOrgId) {
      toast.error('No organization selected');
      return;
    }

    setSaving(true);
    try {
      // Save bot appearance settings
      await recordingService.updateRecordingSettings(activeOrgId, {
        bot_name: botName || undefined,
      });

      // Mark setup as complete
      await markSetupComplete();

      // Refetch settings
      await refetchSettings();

      toast.success('Setup complete!', {
        description: 'Your 60 Notetaker is ready to use.',
      });

      onComplete();
    } catch (error) {
      console.error('Failed to complete setup:', error);
      toast.error('Failed to complete setup');
    } finally {
      setSaving(false);
    }
  };

  const handleSkipToEnd = async () => {
    try {
      await markSetupComplete();
      onComplete();
    } catch (error) {
      console.error('Failed to skip setup:', error);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) handleSkipToEnd(); }}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
        {/* Progress Steps */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-between">
            <StepIndicator
              step={1}
              label="Connect Calendar"
              active={currentStep === 'connect-google'}
              completed={googleConnected}
            />
            <StepIndicator
              step={2}
              label="Select Calendar"
              active={currentStep === 'select-calendar'}
              completed={currentStep !== 'connect-google' && currentStep !== 'select-calendar'}
            />
            <StepIndicator
              step={3}
              label="Auto-Recording"
              active={currentStep === 'enable-auto-recording'}
              completed={currentStep === 'bot-appearance'}
            />
            <StepIndicator
              step={4}
              label="Bot Appearance"
              active={currentStep === 'bot-appearance'}
              completed={false}
            />
          </div>
        </div>

        {/* Wizard Steps */}
        <AnimatePresence mode="wait">
          {currentStep === 'connect-google' && (
            <WizardCard
              key="connect-google"
              icon={Calendar}
              title="Connect Your Google Calendar"
              description="Allow 60 Notetaker to access your calendar to join meetings automatically"
            >
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50/50 dark:bg-blue-900/20 border border-blue-200/50 dark:border-blue-700/30">
                  <Sparkles className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
                  <div className="text-sm text-blue-700 dark:text-blue-300">
                    <p className="font-medium mb-1">Why we need calendar access</p>
                    <p className="text-blue-600/80 dark:text-blue-400/80">
                      The 60 Notetaker bot watches your calendar for upcoming meetings and automatically joins them to record and transcribe conversations.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={handleConnectGoogle}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    Connect Google Calendar
                  </Button>
                  <Button variant="outline" onClick={handleSkipToEnd}>
                    Skip Setup
                  </Button>
                </div>
              </div>
            </WizardCard>
          )}

          {currentStep === 'select-calendar' && (
            <WizardCard
              key="select-calendar"
              icon={Calendar}
              title="Select Calendar"
              description="Choose which calendar the bot should watch for meetings"
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="calendarSelect">Active Calendar</Label>
                  {calendarsLoading ? (
                    <div className="h-10 w-full bg-gray-100 dark:bg-gray-800 rounded-md animate-pulse" />
                  ) : calendarsData?.calendars && calendarsData.calendars.length > 0 ? (
                    <Select
                      value={selectedCalendarId}
                      onValueChange={setSelectedCalendarId}
                    >
                      <SelectTrigger id="calendarSelect">
                        <SelectValue placeholder="Select a calendar" />
                      </SelectTrigger>
                      <SelectContent>
                        {calendarsData.calendars.map((calendar: { id: string; summary: string; backgroundColor?: string; primary?: boolean }) => (
                          <SelectItem key={calendar.id} value={calendar.id}>
                            <div className="flex items-center gap-2">
                              <div
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: calendar.backgroundColor || '#4285f4' }}
                              />
                              {calendar.summary}
                              {calendar.primary && (
                                <span className="text-xs text-gray-500 ml-1">(Primary)</span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select value="primary" onValueChange={setSelectedCalendarId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a calendar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="primary">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-blue-500" />
                            Primary Calendar
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Only meetings from the selected calendar will be recorded
                  </p>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setCurrentStep('connect-google')}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    onClick={handleSelectCalendar}
                    disabled={isUpdating}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  >
                    {isUpdating ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRight className="mr-2 h-4 w-4" />
                    )}
                    Continue
                  </Button>
                </div>
              </div>
            </WizardCard>
          )}

          {currentStep === 'enable-auto-recording' && (
            <WizardCard
              key="enable-auto-recording"
              icon={Link2}
              title="Enable Auto-Recording"
              description="Would you like the bot to automatically join your scheduled meetings?"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg bg-emerald-50/50 dark:bg-emerald-900/20 border border-emerald-200/50 dark:border-emerald-700/30">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Bot className="h-4 w-4 text-emerald-600" />
                      <Label htmlFor="autoRecord" className="font-medium">
                        Automatic Meeting Recording
                      </Label>
                    </div>
                    <p className="text-sm text-emerald-600/80 dark:text-emerald-400/80">
                      The bot will automatically join meetings with video conferencing links
                    </p>
                  </div>
                  <Switch
                    id="autoRecord"
                    checked={autoRecordEnabled}
                    onCheckedChange={setAutoRecordEnabled}
                  />
                </div>

                {autoRecordEnabled && (
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50/50 dark:bg-blue-900/20 border border-blue-200/50 dark:border-blue-700/30">
                    <Sparkles className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
                    <div className="text-sm text-blue-700 dark:text-blue-300">
                      <p className="font-medium mb-1">What happens next</p>
                      <p className="text-blue-600/80 dark:text-blue-400/80">
                        The bot will monitor your calendar and automatically join scheduled meetings. You can customize recording rules later in settings.
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setCurrentStep('select-calendar')}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    onClick={handleEnableAutoRecording}
                    disabled={meetingBaaSConnecting}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  >
                    {meetingBaaSConnecting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRight className="mr-2 h-4 w-4" />
                    )}
                    {autoRecordEnabled ? 'Enable & Continue' : 'Skip for Now'}
                  </Button>
                </div>
              </div>
            </WizardCard>
          )}

          {currentStep === 'bot-appearance' && (
            <WizardCard
              key="bot-appearance"
              icon={Bot}
              title="Customize Bot Appearance"
              description="How your recording bot will appear in meetings (optional)"
            >
              <div className="space-y-4">
                {/* Bot Preview */}
                <div className="flex items-center gap-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/30">
                  <img
                    src={DEFAULT_SIXTY_ICON_URL}
                    alt="Bot Avatar"
                    className="h-12 w-12 rounded-lg shadow-sm"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {botName || '60 Notetaker'}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      This is how your bot will appear in meetings
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="botName">Bot Name</Label>
                  <Input
                    id="botName"
                    placeholder="60 Notetaker"
                    value={botName}
                    onChange={(e) => setBotName(e.target.value)}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    This name will appear in the meeting participant list
                  </p>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setCurrentStep('enable-auto-recording')}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    onClick={handleComplete}
                    disabled={saving || isMarkingComplete}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  >
                    {saving || isMarkingComplete ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    )}
                    Complete Setup
                  </Button>
                </div>
              </div>
            </WizardCard>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
};

// =============================================================================
// WizardCard Component
// =============================================================================

interface WizardCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}

const WizardCard: React.FC<WizardCardProps> = ({ icon: Icon, title, description, children }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    transition={{ duration: 0.2 }}
    className="px-6 pb-6"
  >
    <div className="flex flex-col items-center mb-4">
      <div className="mb-3 h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
        <Icon className="h-6 w-6 text-emerald-600" />
      </div>
      <h3 className="text-lg font-semibold text-center text-gray-900 dark:text-white">{title}</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 text-center mt-1">{description}</p>
    </div>
    {children}
  </motion.div>
);

// =============================================================================
// StepIndicator Component
// =============================================================================

interface StepIndicatorProps {
  step: number;
  label: string;
  active: boolean;
  completed: boolean;
}

const StepIndicator: React.FC<StepIndicatorProps> = ({ step, label, active, completed }) => (
  <div className="flex flex-col items-center gap-2 flex-1">
    <div
      className={cn(
        'h-10 w-10 rounded-full flex items-center justify-center font-semibold transition-all',
        active && 'bg-emerald-600 text-white ring-4 ring-emerald-100 dark:ring-emerald-900/40',
        !active && completed && 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600',
        !active && !completed && 'bg-gray-200 dark:bg-gray-700 text-gray-500'
      )}
    >
      {completed ? <CheckCircle2 className="h-5 w-5" /> : step}
    </div>
    <p
      className={cn(
        'text-xs font-medium text-center',
        active && 'text-emerald-600',
        !active && 'text-gray-500'
      )}
    >
      {label}
    </p>
  </div>
);

export default RecordingSetupWizard;
