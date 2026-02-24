import React, { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Loader2, CheckCircle, XCircle, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useMaNotificationSettings,
  useMaCreateNotificationSetting,
  useMaDeleteNotificationSetting,
  useMaUpdateNotificationSetting,
  useMaTestSlackWebhook,
} from '@/lib/hooks/useMeetingAnalytics';
import type { MaNotificationSetting, MaSettingType, MaScheduleType } from '@/lib/types/meetingAnalytics';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function NotificationSettingsDialog({ open, onOpenChange }: Props) {
  const { data: settings, isLoading } = useMaNotificationSettings();
  const createMutation = useMaCreateNotificationSetting();
  const deleteMutation = useMaDeleteNotificationSetting();
  const updateMutation = useMaUpdateNotificationSetting();
  const testSlackMutation = useMaTestSlackWebhook();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    settingType: 'slack' as MaSettingType,
    channel: '',
    scheduleType: 'daily' as MaScheduleType,
    scheduleTime: '09:00',
    scheduleDay: 1,
  });

  const handleCreate = async () => {
    if (!form.channel.trim()) {
      toast.error('Channel is required');
      return;
    }
    try {
      await createMutation.mutateAsync({
        settingType: form.settingType,
        channel: form.channel.trim(),
        scheduleType: form.scheduleType,
        scheduleTime: form.scheduleTime,
        scheduleDay: form.scheduleType === 'weekly' ? form.scheduleDay : undefined,
        enabled: true,
      });
      toast.success('Notification setting created');
      setShowForm(false);
      setForm({ settingType: 'slack', channel: '', scheduleType: 'daily', scheduleTime: '09:00', scheduleDay: 1 });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create setting');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success('Setting deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleToggle = async (setting: MaNotificationSetting) => {
    try {
      await updateMutation.mutateAsync({
        id: setting.id,
        data: { enabled: !setting.enabled },
      });
      toast.success(setting.enabled ? 'Disabled' : 'Enabled');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const handleTestSlack = async (webhookUrl: string) => {
    try {
      const result = await testSlackMutation.mutateAsync(webhookUrl);
      if (result.success) {
        toast.success('Test message sent to Slack');
      } else {
        toast.error(`Test failed: ${result.error}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/30">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <div className="p-1.5 bg-violet-600/10 dark:bg-violet-500/20 rounded-lg border border-violet-600/20">
              <Bell className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            </div>
            Notification Settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-1">
          {/* Existing settings */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading...
            </div>
          ) : settings && settings.length > 0 ? (
            <div className="space-y-2">
              {settings.map((setting: MaNotificationSetting) => (
                <div
                  key={setting.id}
                  className="bg-white/80 dark:bg-gray-800/40 rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/30 flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium capitalize text-gray-800 dark:text-gray-200">{setting.settingType}</span>
                      {setting.enabled ? (
                        <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-gray-400" />
                      )}
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-md ${
                        setting.enabled
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-700/50 dark:text-gray-400'
                      }`}>
                        {setting.enabled ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{setting.channel}</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {setting.scheduleType === 'weekly'
                        ? `Weekly on ${DAYS_OF_WEEK[setting.scheduleDay ?? 1]} at ${setting.scheduleTime ?? '09:00'}`
                        : `Daily at ${setting.scheduleTime ?? '09:00'}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {setting.settingType === 'slack' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs h-7 px-2 rounded-lg hover:bg-gray-100/80 dark:hover:bg-gray-700/50"
                        onClick={() => handleTestSlack(setting.channel)}
                        disabled={testSlackMutation.isPending}
                      >
                        Test
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-7 px-2 rounded-lg hover:bg-gray-100/80 dark:hover:bg-gray-700/50"
                      onClick={() => handleToggle(setting)}
                    >
                      {setting.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 rounded-lg text-red-500 hover:text-red-600 hover:bg-red-50/80 dark:hover:bg-red-500/10"
                      onClick={() => handleDelete(setting.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white/80 dark:bg-gray-800/40 rounded-xl p-6 border border-gray-200/50 dark:border-gray-700/30 text-center">
              <div className="p-3 bg-gray-100/80 dark:bg-gray-700/50 rounded-xl inline-flex mb-3">
                <Bell className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">No notification channels configured</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Add a Slack webhook or email address to receive reports</p>
            </div>
          )}

          {/* Add new */}
          {showForm ? (
            <div className="bg-white/80 dark:bg-gray-800/40 rounded-xl border border-gray-200/50 dark:border-gray-700/30 p-4 space-y-3">
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">New Notification Channel</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Channel Type</Label>
                  <Select value={form.settingType} onValueChange={(v) => setForm({ ...form, settingType: v as MaSettingType })}>
                    <SelectTrigger className="rounded-xl bg-white/60 dark:bg-gray-800/40 border-gray-200/50 dark:border-gray-700/30 h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="slack">Slack</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Schedule</Label>
                  <Select value={form.scheduleType} onValueChange={(v) => setForm({ ...form, scheduleType: v as MaScheduleType })}>
                    <SelectTrigger className="rounded-xl bg-white/60 dark:bg-gray-800/40 border-gray-200/50 dark:border-gray-700/30 h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {form.settingType === 'slack' ? 'Slack Webhook URL' : 'Email Address'}
                </Label>
                <Input
                  className="rounded-xl bg-white/60 dark:bg-gray-800/40 border-gray-200/50 dark:border-gray-700/30 h-9 text-sm"
                  placeholder={form.settingType === 'slack' ? 'https://hooks.slack.com/services/...' : 'team@company.com'}
                  value={form.channel}
                  onChange={(e) => setForm({ ...form, channel: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Time (UTC)</Label>
                  <Input
                    className="rounded-xl bg-white/60 dark:bg-gray-800/40 border-gray-200/50 dark:border-gray-700/30 h-9 text-sm"
                    type="time"
                    value={form.scheduleTime}
                    onChange={(e) => setForm({ ...form, scheduleTime: e.target.value })}
                  />
                </div>
                {form.scheduleType === 'weekly' && (
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Day of Week</Label>
                    <Select value={String(form.scheduleDay)} onValueChange={(v) => setForm({ ...form, scheduleDay: parseInt(v) })}>
                      <SelectTrigger className="rounded-xl bg-white/60 dark:bg-gray-800/40 border-gray-200/50 dark:border-gray-700/30 h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAYS_OF_WEEK.map((day, i) => (
                          <SelectItem key={i} value={String(i)}>{day}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowForm(false)}
                  className="rounded-xl h-8 px-3 text-gray-600 dark:text-gray-400 hover:bg-gray-100/80 dark:hover:bg-gray-700/50"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreate}
                  disabled={createMutation.isPending}
                  className="rounded-xl h-8 px-4 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white"
                >
                  {createMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5 rounded-xl border-gray-200/50 dark:border-gray-700/30 bg-white/60 dark:bg-gray-800/40 hover:bg-white/80 dark:hover:bg-gray-800/60 text-gray-700 dark:text-gray-300"
              onClick={() => setShowForm(true)}
            >
              <Plus className="w-3.5 h-3.5" />
              Add Notification Channel
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
