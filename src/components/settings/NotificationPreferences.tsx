/**
 * Notification Preferences Component
 * Story: ORG-NOTIF-013
 * Description: UI for managing organization notification preferences
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrgContext } from '@/lib/contexts/OrgContext';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Bell, Users, DollarSign, Settings as SettingsIcon, MessageSquare } from 'lucide-react';

interface NotificationSettings {
  team_changes: boolean;
  deal_alerts: boolean;
  critical_alerts: boolean;
  weekly_digest: boolean;
  slack_enabled: boolean;
  slack_webhook_url?: string;
}

export function NotificationPreferences() {
  const { activeOrgId, isAdmin } = useOrgContext();
  const queryClient = useQueryClient();
  const [webhookUrl, setWebhookUrl] = useState('');

  // Only admins can manage org notification settings
  if (!isAdmin) {
    return null;
  }

  // Fetch current notification settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ['org-notification-settings', activeOrgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('notification_settings')
        .eq('id', activeOrgId)
        .single();

      if (error) throw error;

      const notifSettings = data.notification_settings || {};
      return {
        team_changes: notifSettings.team_changes ?? true,
        deal_alerts: notifSettings.deal_alerts ?? true,
        critical_alerts: notifSettings.critical_alerts ?? true,
        weekly_digest: notifSettings.weekly_digest ?? false,
        slack_enabled: notifSettings.slack?.enabled ?? false,
        slack_webhook_url: notifSettings.slack?.webhook_url ?? '',
      } as NotificationSettings;
    },
    enabled: !!activeOrgId && isAdmin,
  });

  // Update settings mutation
  const updateSettings = useMutation({
    mutationFn: async (newSettings: Partial<NotificationSettings>) => {
      const currentSettings = settings || {};
      const updatedSettings = {
        ...currentSettings,
        ...newSettings,
        slack: {
          enabled: newSettings.slack_enabled ?? currentSettings.slack_enabled,
          webhook_url: newSettings.slack_webhook_url ?? currentSettings.slack_webhook_url,
        },
      };

      const { error } = await supabase
        .from('organizations')
        .update({ notification_settings: updatedSettings })
        .eq('id', activeOrgId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-notification-settings', activeOrgId] });
      toast.success('Notification preferences updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update preferences: ${error.message}`);
    },
  });

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center justify-between animate-pulse">
              <div className="h-4 bg-muted rounded w-1/2" />
              <div className="h-6 bg-muted rounded w-12" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Organization Notifications
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Configure notifications for organization owners and admins
          </p>
        </div>

        <div className="space-y-4">
          {/* Team Changes */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="w-4 h-4 text-muted-foreground" />
              <div>
                <Label htmlFor="team-changes">Team Changes</Label>
                <p className="text-xs text-muted-foreground">
                  Notify when members join, leave, or change roles
                </p>
              </div>
            </div>
            <Switch
              id="team-changes"
              checked={settings?.team_changes}
              onCheckedChange={(checked) =>
                updateSettings.mutate({ team_changes: checked })
              }
            />
          </div>

          {/* Deal Alerts */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <div>
                <Label htmlFor="deal-alerts">Deal Alerts</Label>
                <p className="text-xs text-muted-foreground">
                  Notify on high-value deals and closures
                </p>
              </div>
            </div>
            <Switch
              id="deal-alerts"
              checked={settings?.deal_alerts}
              onCheckedChange={(checked) =>
                updateSettings.mutate({ deal_alerts: checked })
              }
            />
          </div>

          {/* Critical Alerts */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <SettingsIcon className="w-4 h-4 text-muted-foreground" />
              <div>
                <Label htmlFor="critical-alerts">Critical Alerts</Label>
                <p className="text-xs text-muted-foreground">
                  Notify on critical deal health issues and system events
                </p>
              </div>
            </div>
            <Switch
              id="critical-alerts"
              checked={settings?.critical_alerts}
              onCheckedChange={(checked) =>
                updateSettings.mutate({ critical_alerts: checked })
              }
            />
          </div>

          {/* Weekly Digest */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="w-4 h-4 text-muted-foreground" />
              <div>
                <Label htmlFor="weekly-digest">Weekly Digest</Label>
                <p className="text-xs text-muted-foreground">
                  Send weekly summary of organization activity (owners only)
                </p>
              </div>
            </div>
            <Switch
              id="weekly-digest"
              checked={settings?.weekly_digest}
              onCheckedChange={(checked) =>
                updateSettings.mutate({ weekly_digest: checked })
              }
            />
          </div>
        </div>

        {/* Slack Integration */}
        <div className="border-t pt-6">
          <h4 className="text-md font-semibold flex items-center gap-2 mb-4">
            <MessageSquare className="w-4 h-4" />
            Slack Integration
          </h4>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="slack-enabled">Enable Slack Notifications</Label>
                <p className="text-xs text-muted-foreground">
                  Send org-wide notifications to Slack channel
                </p>
              </div>
              <Switch
                id="slack-enabled"
                checked={settings?.slack_enabled}
                onCheckedChange={(checked) =>
                  updateSettings.mutate({ slack_enabled: checked })
                }
              />
            </div>

            {settings?.slack_enabled && (
              <div className="space-y-2">
                <Label htmlFor="webhook-url">Webhook URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="webhook-url"
                    type="url"
                    placeholder="https://hooks.slack.com/services/..."
                    value={webhookUrl || settings?.slack_webhook_url || ''}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      updateSettings.mutate({ slack_webhook_url: webhookUrl });
                      setWebhookUrl('');
                    }}
                    disabled={!webhookUrl}
                  >
                    Save
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Get your webhook URL from Slack's{' '}
                  <a
                    href="https://api.slack.com/messaging/webhooks"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Incoming Webhooks
                  </a>{' '}
                  page
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
