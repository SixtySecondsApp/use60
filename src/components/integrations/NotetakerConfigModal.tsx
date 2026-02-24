/**
 * NotetakerConfigModal
 *
 * Configuration modal for 60 Notetaker integration.
 * Allows users to enable/disable the notetaker and manage per-user settings.
 * Org admins can enable/disable the feature for the entire organization.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Calendar,
  Settings,
  Video,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Building2,
  Save,
  Loader2,
} from 'lucide-react';
import { useCalendarList } from '@/lib/hooks/useGoogleIntegration';
import { useNotetakerIntegration } from '@/lib/hooks/useNotetakerIntegration';
import { useOrg } from '@/lib/contexts/OrgContext';
import { cn } from '@/lib/utils';
import { DEFAULT_SIXTY_ICON_URL } from '@/lib/utils/sixtyBranding';

interface NotetakerConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotetakerConfigModal({ open, onOpenChange }: NotetakerConfigModalProps) {
  const navigate = useNavigate();
  const { permissions } = useOrg();
  const {
    isLoading,
    isConnected,
    isOrgEnabled,
    isUserEnabled,
    needsCalendar,
    googleConnected,
    userSettings,
    enable,
    disable,
    updateSettings,
    enableOrg,
    disableOrg,
    isEnabling,
    isDisabling,
    isUpdating,
    isEnablingOrg,
    isDisablingOrg,
  } = useNotetakerIntegration();

  // Calendar selection
  const { data: calendarsData, isLoading: calendarsLoading } = useCalendarList(googleConnected);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>('primary');
  const [isSavingCalendar, setIsSavingCalendar] = useState(false);

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

  const handleSaveCalendarSelection = async () => {
    setIsSavingCalendar(true);
    try {
      await updateSettings({ selected_calendar_id: selectedCalendarId });
    } finally {
      setIsSavingCalendar(false);
    }
  };

  const isAdmin = permissions.isAdmin;

  const handleToggleEnabled = async () => {
    if (isUserEnabled) {
      await disable();
    } else {
      await enable();
    }
  };

  const handleToggleAutoExternal = async () => {
    if (!userSettings) return;
    await updateSettings({
      auto_record_external: !userSettings.auto_record_external,
    });
  };

  const handleToggleAutoInternal = async () => {
    if (!userSettings) return;
    await updateSettings({
      auto_record_internal: !userSettings.auto_record_internal,
    });
  };

  const handleOpenSettings = () => {
    onOpenChange(false);
    navigate('/meetings/recordings/settings');
  };

  const handleConnectCalendar = () => {
    onOpenChange(false);
    navigate('/integrations');
  };

  const handleEnableForOrg = async () => {
    await enableOrg();
  };

  const handleDisableForOrg = async () => {
    await disableOrg();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
              <img src={DEFAULT_SIXTY_ICON_URL} alt="60" className="h-6 w-6 rounded" />
            </div>
            <div>
              <DialogTitle className="text-xl">60 Notetaker</DialogTitle>
              <DialogDescription>
                Automatically record and transcribe your meetings
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Status Section */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-center gap-3">
              {isConnected ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-amber-500" />
              )}
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  {isConnected ? 'Active' : needsCalendar ? 'Calendar Required' : 'Not Active'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {isConnected
                    ? 'Your meetings are being recorded automatically'
                    : needsCalendar
                      ? 'Connect Google Calendar to enable'
                      : 'Enable to start recording meetings'}
                </p>
              </div>
            </div>
            <Badge
              variant={isConnected ? 'default' : 'secondary'}
              className={cn(
                isConnected && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
              )}
            >
              {isConnected ? 'Connected' : 'Disconnected'}
            </Badge>
          </div>

          {/* Calendar Requirement Notice */}
          {needsCalendar && (
            <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/30">
              <Calendar className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-amber-900 dark:text-amber-200">
                  Google Calendar Required
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  60 Notetaker needs access to your calendar to automatically join your meetings.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={handleConnectCalendar}
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  Connect Google Calendar
                </Button>
              </div>
            </div>
          )}

          {/* Org not enabled notice - Admin can enable, non-admin sees info */}
          {!isOrgEnabled && (
            <div className="flex items-start gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <Building2 className="h-5 w-5 text-gray-500 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-gray-900 dark:text-white">
                  {isAdmin ? 'Enable for Your Organization' : 'Feature Not Enabled'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {isAdmin
                    ? '60 Notetaker is not yet enabled for your organization. Enable it to allow team members to automatically record and transcribe meetings.'
                    : '60 Notetaker has not been enabled for your organization. Contact your administrator to enable this feature.'}
                </p>
                {isAdmin && (
                  <Button
                    variant="default"
                    size="sm"
                    className="mt-3 bg-emerald-600 hover:bg-emerald-700"
                    onClick={handleEnableForOrg}
                    disabled={isEnablingOrg}
                  >
                    {isEnablingOrg ? (
                      <>
                        <span className="animate-spin mr-2">⏳</span>
                        Enabling...
                      </>
                    ) : (
                      <>
                        <Building2 className="h-4 w-4 mr-2" />
                        Enable for Organization
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Settings Section - Only show if org is enabled and calendar is connected */}
          {isOrgEnabled && googleConnected && (
            <>
              <Separator />

              {/* Enable/Disable Toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Enable 60 Notetaker</Label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Automatically record your meetings
                  </p>
                </div>
                <Switch
                  checked={isUserEnabled}
                  onCheckedChange={handleToggleEnabled}
                  disabled={isLoading || isEnabling || isDisabling}
                />
              </div>

              {/* Recording Preferences - Only show if enabled */}
              {isUserEnabled && userSettings && (
                <>
                  <Separator />

                  <div className="space-y-4">
                    <h4 className="font-medium text-gray-900 dark:text-white">
                      Recording Preferences
                    </h4>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>External Meetings</Label>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Record meetings with external participants
                        </p>
                      </div>
                      <Switch
                        checked={userSettings.auto_record_external}
                        onCheckedChange={handleToggleAutoExternal}
                        disabled={isUpdating}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Internal Meetings</Label>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Record meetings with only team members
                        </p>
                      </div>
                      <Switch
                        checked={userSettings.auto_record_internal}
                        onCheckedChange={handleToggleAutoInternal}
                        disabled={isUpdating}
                      />
                    </div>

                    {/* Calendar Selection */}
                    <Separator className="my-4" />
                    <div className="space-y-3">
                      <div className="space-y-0.5">
                        <Label className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-emerald-600" />
                          Calendar to Watch
                        </Label>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Only meetings from this calendar will be recorded
                        </p>
                      </div>
                      {calendarsLoading ? (
                        <Skeleton className="h-10 w-full" />
                      ) : calendarsData?.calendars && calendarsData.calendars.length > 0 ? (
                        <Select
                          value={selectedCalendarId}
                          onValueChange={setSelectedCalendarId}
                        >
                          <SelectTrigger>
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
                        <Select
                          value={selectedCalendarId}
                          onValueChange={setSelectedCalendarId}
                        >
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
                      {selectedCalendarId !== userSettings.selected_calendar_id && (
                        <Button
                          size="sm"
                          onClick={handleSaveCalendarSelection}
                          disabled={isSavingCalendar}
                          className="w-full bg-emerald-600 hover:bg-emerald-700"
                        >
                          {isSavingCalendar ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="mr-2 h-4 w-4" />
                          )}
                          Save Calendar Selection
                        </Button>
                      )}
                    </div>
                  </div>
                </>
              )}

              <Separator />

              {/* Advanced Settings Link */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Advanced Settings</Label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Recording rules, bot customization, and more
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={handleOpenSettings}>
                  <Settings className="h-4 w-4 mr-2" />
                  Open Settings
                  <ExternalLink className="h-3 w-3 ml-2" />
                </Button>
              </div>
            </>
          )}

          {/* View Recordings Link */}
          {isConnected && (
            <>
              <Separator />
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  onOpenChange(false);
                  navigate('/meetings/recordings');
                }}
              >
                <Video className="h-4 w-4 mr-2" />
                View Recordings
              </Button>
            </>
          )}

          {/* Admin Section - Manage org-level settings */}
          {isAdmin && isOrgEnabled && (
            <>
              <Separator />
              <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-gray-500" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Enabled for your organization
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                  onClick={handleDisableForOrg}
                  disabled={isDisablingOrg}
                >
                  {isDisablingOrg ? 'Disabling...' : 'Disable'}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
