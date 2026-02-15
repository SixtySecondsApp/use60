/**
 * SlackSettings Page
 *
 * Team admin page for configuring Slack integration settings.
 * Allows configuration of notification features, channel selection, and user mappings.
 */

import { useMemo, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Calendar,
  Users,
  Bell,
  RefreshCw,
  Building2,
  Info,
  Clock,
  Video,
  AlertTriangle,
  GraduationCap,
  Mail,
  Inbox,
  FileText,
  Zap,
} from 'lucide-react';

import { SlackChannelSelector } from '@/components/settings/SlackChannelSelector';
import { SlackUserMapping } from '@/components/settings/SlackUserMapping';
import { SlackSelfMapping } from '@/components/settings/SlackSelfMapping';
import { PageContainer } from '@/components/layout/PageContainer';
import {
  useSlackOrgSettings,
  useSlackNotificationSettings,
  useSlackUserMappings,
  useUpdateNotificationSettings,
  useSendTestNotification,
  type SlackFeature,
  type SlackNotificationSettings,
} from '@/lib/hooks/useSlackSettings';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useIsOrgAdmin } from '@/contexts/UserPermissionsContext';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { useOrgMoney } from '@/lib/hooks/useOrgMoney';

// Timezone options
const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
  { value: 'UTC', label: 'UTC' },
];

// Time options for schedule
const TIME_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const hour = i.toString().padStart(2, '0');
  return { value: `${hour}:00`, label: `${hour}:00` };
});

// Feature configurations
const FEATURES = [
  {
    key: 'meeting_debrief' as SlackFeature,
    title: 'AI Meeting Debriefs',
    description: 'Post AI-generated meeting summaries with action items and coaching insights.',
    icon: MessageSquare,
    supportsDM: true,
    dmDescription: 'Send to meeting owner',
    channelDescription: 'Post to team channel',
    supportsStakeholders: true,
  },
  {
    key: 'daily_digest' as SlackFeature,
    title: 'Daily Standup Digest',
    description: 'Morning digest with meetings, tasks, and AI insights.',
    icon: Calendar,
    supportsDM: true,
    dmDescription: 'Send personalized digest to each user',
    channelDescription: 'Post team-wide digest to channel',
    supportsBothDelivery: true,
    hasSchedule: true,
  },
  {
    key: 'meeting_prep' as SlackFeature,
    title: 'Pre-Meeting Prep Cards',
    description: 'Send prep cards with talking points 30 mins before meetings.',
    icon: Bell,
    supportsDM: true,
    dmDescription: 'Send to person with the meeting',
    channelDescription: 'Post to channel with @mention',
    defaultDM: true,
  },
  {
    key: 'deal_rooms' as SlackFeature,
    title: 'Deal Room Channels',
    description: 'Auto-create private channels for qualifying deals.',
    icon: Building2,
    supportsDM: false,
    hasThresholds: true,
  },
];

function FeatureSettingsCard({
  feature,
  settings,
  onUpdate,
  onTest,
  isUpdating,
  isTesting,
  stakeholderOptions,
}: {
  feature: (typeof FEATURES)[0];
  settings: SlackNotificationSettings | undefined;
  onUpdate: (updates: Partial<SlackNotificationSettings>) => void;
  onTest: () => void;
  isUpdating: boolean;
  isTesting: boolean;
  stakeholderOptions?: Array<{ slack_user_id: string; slack_username: string | null; slack_email: string | null }>;
}) {
  const Icon = feature.icon;
  const { symbol } = useOrgMoney();
  const isEnabled = settings?.is_enabled ?? false;
  const deliveryMethod = settings?.delivery_method || (feature.defaultDM ? 'dm' : 'channel');
  const sendToChannel = deliveryMethod === 'channel' || deliveryMethod === 'both';
  const sendToDm = deliveryMethod === 'dm' || deliveryMethod === 'both';
  const dmAudience = (settings?.dm_audience || 'owner') as 'owner' | 'stakeholders' | 'both';
  const sendDmToOwner = dmAudience === 'owner' || dmAudience === 'both';
  const sendDmToStakeholders = dmAudience === 'stakeholders' || dmAudience === 'both';
  const currentStakeholders = (settings?.stakeholder_slack_ids || []).filter(Boolean);
  const [stakeholdersCsv, setStakeholdersCsv] = useState(currentStakeholders.join(', '));
  const [localThreshold, setLocalThreshold] = useState<string>(String(settings?.deal_value_threshold || 25000));
  const dealRoomArchiveMode = settings?.deal_room_archive_mode || 'delayed';
  const dealRoomArchiveDelayHours = settings?.deal_room_archive_delay_hours ?? 24;

  useEffect(() => {
    setStakeholdersCsv(currentStakeholders.join(', '));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStakeholders.join(',')]);

  useEffect(() => {
    setLocalThreshold(String(settings?.deal_value_threshold || 25000));
  }, [settings?.deal_value_threshold]);

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">{feature.title}</CardTitle>
              <CardDescription className="text-sm">{feature.description}</CardDescription>
            </div>
          </div>
          <Switch
            checked={isEnabled}
            onCheckedChange={(checked) => onUpdate({ is_enabled: checked })}
            disabled={isUpdating}
          />
        </div>
      </CardHeader>

      {isEnabled && (
        <CardContent className="space-y-4">
          {feature.supportsDM && (
            <div className="space-y-3">
              <Label>{feature.key === 'daily_digest' ? 'Audience' : 'Delivery Method'}</Label>
              <RadioGroup
                value={deliveryMethod}
                onValueChange={(value) => onUpdate({ delivery_method: value as 'channel' | 'dm' | 'both' })}
                className={`grid gap-4 ${feature.supportsBothDelivery ? 'grid-cols-3' : 'grid-cols-2'}`}
              >
                <div>
                  <RadioGroupItem value="channel" id={`${feature.key}-channel`} className="peer sr-only" />
                  <Label
                    htmlFor={`${feature.key}-channel`}
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                  >
                    <Users className="mb-2 h-5 w-5" />
                    <span className="text-sm font-medium">Team Channel</span>
                    <span className="text-xs text-muted-foreground text-center mt-1">
                      {feature.channelDescription}
                    </span>
                  </Label>
                </div>
                <div>
                  <RadioGroupItem value="dm" id={`${feature.key}-dm`} className="peer sr-only" />
                  <Label
                    htmlFor={`${feature.key}-dm`}
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                  >
                    <MessageSquare className="mb-2 h-5 w-5" />
                    <span className="text-sm font-medium">Direct Message</span>
                    <span className="text-xs text-muted-foreground text-center mt-1">
                      {feature.dmDescription}
                    </span>
                  </Label>
                </div>
                {feature.supportsBothDelivery && (
                  <div>
                    <RadioGroupItem value="both" id={`${feature.key}-both`} className="peer sr-only" />
                    <Label
                      htmlFor={`${feature.key}-both`}
                      className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                    >
                      <Users className="mb-2 h-5 w-5" />
                      <span className="text-sm font-medium">Both</span>
                      <span className="text-xs text-muted-foreground text-center mt-1">
                        Post to channel + DM users
                      </span>
                    </Label>
                  </div>
                )}
              </RadioGroup>
              {feature.key === 'daily_digest' && sendToDm && (
                <p className="text-xs text-muted-foreground">
                  Individual digests are delivered via DM to users who have linked their Slack account in “Personal Slack”.
                </p>
              )}
              {feature.key === 'meeting_debrief' && sendToDm && (
                <p className="text-xs text-muted-foreground">
                  Meeting debrief DMs require users to link Slack under “Personal Slack”.
                </p>
              )}
            </div>
          )}

          {feature.key === 'meeting_debrief' && sendToDm && (
            <div className="space-y-3">
              <Label>DM recipients</Label>
              <RadioGroup
                value={dmAudience}
                onValueChange={(value) => onUpdate({ dm_audience: value as any })}
                className="grid grid-cols-3 gap-4"
              >
                <div>
                  <RadioGroupItem value="owner" id={`${feature.key}-dm-owner`} className="peer sr-only" />
                  <Label
                    htmlFor={`${feature.key}-dm-owner`}
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                  >
                    <MessageSquare className="mb-2 h-5 w-5" />
                    <span className="text-sm font-medium">Individual</span>
                    <span className="text-xs text-muted-foreground text-center mt-1">DM the meeting owner</span>
                  </Label>
                </div>
                <div>
                  <RadioGroupItem value="stakeholders" id={`${feature.key}-dm-stakeholders`} className="peer sr-only" />
                  <Label
                    htmlFor={`${feature.key}-dm-stakeholders`}
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                  >
                    <Users className="mb-2 h-5 w-5" />
                    <span className="text-sm font-medium">Stakeholder</span>
                    <span className="text-xs text-muted-foreground text-center mt-1">DM a manager/stakeholder</span>
                  </Label>
                </div>
                <div>
                  <RadioGroupItem value="both" id={`${feature.key}-dm-both`} className="peer sr-only" />
                  <Label
                    htmlFor={`${feature.key}-dm-both`}
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                  >
                    <Users className="mb-2 h-5 w-5" />
                    <span className="text-sm font-medium">Both</span>
                    <span className="text-xs text-muted-foreground text-center mt-1">Owner + stakeholder(s)</span>
                  </Label>
                </div>
              </RadioGroup>

              {(sendDmToStakeholders || dmAudience === 'stakeholders') && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>Stakeholders to notify (optional)</Label>
                    <p className="text-xs text-muted-foreground">
                      These Slack users will receive meeting debrief DMs (e.g. a manager).
                    </p>
                  </div>

                  {stakeholderOptions && stakeholderOptions.length > 0 ? (
                    <div className="space-y-2 rounded-md border p-3">
                      <div className="text-xs text-muted-foreground">
                        Select from known Slack users in this org:
                      </div>
                      <div className="grid gap-2">
                        {stakeholderOptions.slice(0, 20).map((u) => {
                          const checked = currentStakeholders.includes(u.slack_user_id);
                          const label = u.slack_username ? `@${u.slack_username}` : u.slack_user_id;
                          return (
                            <label key={u.slack_user_id} className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(next) => {
                                  const isChecked = next === true;
                                  const updated = isChecked
                                    ? Array.from(new Set([...currentStakeholders, u.slack_user_id]))
                                    : currentStakeholders.filter((id) => id !== u.slack_user_id);
                                  onUpdate({ stakeholder_slack_ids: updated });
                                }}
                              />
                              <span className="font-medium">{label}</span>
                              {u.slack_email && (
                                <span className="text-xs text-muted-foreground">{u.slack_email}</span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                      {stakeholderOptions.length > 20 && (
                        <div className="text-xs text-muted-foreground">
                          Showing first 20 users. You can paste additional Slack user IDs below.
                        </div>
                      )}
                    </div>
                  ) : (
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        No Slack users are available yet. Users appear after they interact with the bot, or after you refresh Slack users in the mapping table.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Stakeholder Slack user IDs (CSV)</Label>
                    <Input
                      value={stakeholdersCsv}
                      onChange={(e) => setStakeholdersCsv(e.target.value)}
                      onBlur={() => {
                        const parsed = stakeholdersCsv
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean);
                        const unique = Array.from(new Set(parsed));
                        onUpdate({ stakeholder_slack_ids: unique });
                      }}
                      placeholder="U0123ABC, U0456DEF"
                    />
                    <p className="text-xs text-muted-foreground">
                      Tip: Slack user IDs start with <code>U</code>.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {sendToChannel && (
            <div className="space-y-2">
              <Label>Channel</Label>
              <SlackChannelSelector
                value={settings?.channel_id || null}
                onChange={(channelId, channelName) =>
                  onUpdate({ channel_id: channelId, channel_name: channelName })
                }
              />
            </div>
          )}

          {feature.hasSchedule && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Send at</Label>
                <Select
                  value={settings?.schedule_time || '08:00'}
                  onValueChange={(value) => onUpdate({ schedule_time: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.map((time) => (
                      <SelectItem key={time.value} value={time.value}>
                        {time.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Select
                  value={settings?.schedule_timezone || 'UTC'}
                  onValueChange={(value) => onUpdate({ schedule_timezone: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {feature.hasThresholds && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Create deal room when:</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Deal value exceeds</span>
                  <div className="relative w-32">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {symbol}
                    </span>
                    <Input
                      type="number"
                      value={localThreshold}
                      onChange={(e) => setLocalThreshold(e.target.value)}
                      onBlur={() => {
                        const parsed = parseInt(localThreshold) || 25000;
                        onUpdate({ deal_value_threshold: parsed });
                      }}
                      className="pl-7"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">OR deal stage reaches</span>
                  <Select
                    value={settings?.deal_stage_threshold || 'opportunity'}
                    onValueChange={(value) => onUpdate({ deal_stage_threshold: value })}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sql">SQL</SelectItem>
                      <SelectItem value="opportunity">Opportunity</SelectItem>
                      <SelectItem value="verbal">Verbal</SelectItem>
                      <SelectItem value="signed">Signed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {feature.key === 'deal_rooms' && (
                <div className="space-y-3">
                  <div className="space-y-2 rounded-md border p-3">
                    <div className="space-y-1">
                      <Label>When a deal is signed/won or lost</Label>
                      <p className="text-xs text-muted-foreground">
                        Choose whether to archive the deal room channel instantly or after a delay (e.g. 24 hours).
                      </p>
                    </div>

                    <div className="grid gap-3">
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Archive behavior</Label>
                        <Select
                          value={dealRoomArchiveMode}
                          onValueChange={(value) => onUpdate({ deal_room_archive_mode: value as any })}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="immediate">Archive immediately</SelectItem>
                            <SelectItem value="delayed">Archive after a delay</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {dealRoomArchiveMode === 'delayed' && (
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Delay (hours)</Label>
                          <Input
                            type="number"
                            min={0}
                            max={168}
                            value={dealRoomArchiveDelayHours}
                            onChange={(e) => {
                              const n = parseInt(e.target.value);
                              const clamped = Number.isFinite(n) ? Math.min(168, Math.max(0, n)) : 24;
                              onUpdate({ deal_room_archive_delay_hours: clamped });
                            }}
                          />
                          <p className="text-xs text-muted-foreground">
                            0 = archive immediately. Max 168 hours (7 days).
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label>Stakeholders to invite (optional)</Label>
                    <p className="text-xs text-muted-foreground">
                      These Slack users will be invited to deal room channels (in addition to the deal owner).
                    </p>
                  </div>

                  {stakeholderOptions && stakeholderOptions.length > 0 ? (
                    <div className="space-y-2 rounded-md border p-3">
                      <div className="text-xs text-muted-foreground">
                        Select from known Slack users in this org:
                      </div>
                      <div className="grid gap-2">
                        {stakeholderOptions.slice(0, 20).map((u) => {
                          const checked = currentStakeholders.includes(u.slack_user_id);
                          const label = u.slack_username ? `@${u.slack_username}` : u.slack_user_id;
                          return (
                            <label key={u.slack_user_id} className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(next) => {
                                  const isChecked = next === true;
                                  const updated = isChecked
                                    ? Array.from(new Set([...currentStakeholders, u.slack_user_id]))
                                    : currentStakeholders.filter((id) => id !== u.slack_user_id);
                                  onUpdate({ stakeholder_slack_ids: updated });
                                }}
                              />
                              <span className="font-medium">{label}</span>
                              {u.slack_email && (
                                <span className="text-xs text-muted-foreground">{u.slack_email}</span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                      {stakeholderOptions.length > 20 && (
                        <div className="text-xs text-muted-foreground">
                          Showing first 20 users. You can paste additional Slack user IDs below.
                        </div>
                      )}
                    </div>
                  ) : (
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        No Slack users are available yet. Users appear after they interact with the bot, or after you refresh Slack users in the mapping table.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Stakeholder Slack user IDs (CSV)</Label>
                    <Input
                      value={stakeholdersCsv}
                      onChange={(e) => setStakeholdersCsv(e.target.value)}
                      onBlur={() => {
                        const parsed = stakeholdersCsv
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean);
                        const unique = Array.from(new Set(parsed));
                        onUpdate({ stakeholder_slack_ids: unique });
                      }}
                      placeholder="U0123ABC, U0456DEF"
                    />
                    <p className="text-xs text-muted-foreground">
                      Tip: Slack user IDs start with <code>U</code>.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="pt-2">
            <Button variant="outline" size="sm" onClick={onTest} disabled={isTesting}>
              {isTesting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Test Notification
                </>
              )}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

/**
 * SLACK-013: Morning Brief Time Preference
 * Lets each user set their preferred morning brief delivery time + timezone.
 */
function MorningBriefPreferences() {
  const { activeOrgId } = useOrg();
  const queryClient = useQueryClient();

  // Fetch current user's briefing preferences from slack_user_mappings
  const { data: prefs, isLoading } = useQuery({
    queryKey: ['slack', 'briefing-prefs', activeOrgId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data } = await supabase
        .from('slack_user_mappings')
        .select('preferred_briefing_time, preferred_timezone')
        .eq('org_id', activeOrgId!)
        .eq('sixty_user_id', user.id)
        .maybeSingle();

      return data;
    },
    enabled: !!activeOrgId,
  });

  const updatePrefs = useMutation({
    mutationFn: async (updates: { preferred_briefing_time?: string; preferred_timezone?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !activeOrgId) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('slack_user_mappings')
        .update(updates)
        .eq('org_id', activeOrgId)
        .eq('sixty_user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['slack', 'briefing-prefs'] });
      toast.success('Briefing preferences saved');
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to save preferences');
    },
  });

  const [time, setTime] = useState('08:00');
  const [tz, setTz] = useState('America/New_York');

  useEffect(() => {
    if (prefs) {
      if (prefs.preferred_briefing_time) setTime(prefs.preferred_briefing_time.slice(0, 5));
      if (prefs.preferred_timezone) setTz(prefs.preferred_timezone);
    }
  }, [prefs]);

  const handleSave = useCallback(() => {
    updatePrefs.mutate({ preferred_briefing_time: time, preferred_timezone: tz });
  }, [time, tz, updatePrefs]);

  if (isLoading) return null;

  // Only show if user has a linked Slack mapping
  if (!prefs) return null;

  return (
    <div className="space-y-3 pt-2">
      <Separator />
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <Label className="text-sm font-medium">Morning Brief</Label>
      </div>
      <p className="text-sm text-muted-foreground">
        Choose when you receive your daily morning brief DM.
      </p>
      <div className="flex items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Time</Label>
          <Select value={time} onValueChange={setTime}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Timezone</Label>
          <Select value={tz} onValueChange={setTz}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleSave}
          disabled={updatePrefs.isPending}
        >
          {updatePrefs.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            'Save'
          )}
        </Button>
      </div>
    </div>
  );
}

/**
 * SLACK-019: Per-user notification preferences
 * Lets each user toggle notification types on/off and set quiet hours.
 */
const NOTIFICATION_FEATURES = [
  { key: 'morning_brief', label: 'Morning Brief', description: 'Daily pipeline summary DM' },
  { key: 'post_meeting', label: 'Post-Meeting Debrief', description: 'Meeting summaries and follow-up drafts' },
  { key: 'deal_risk', label: 'Deal Risk Alerts', description: 'Alerts when deals go cold or at risk' },
  { key: 'campaign_alerts', label: 'Campaign Alerts', description: 'Instantly campaign reply and bounce alerts' },
  { key: 'task_reminders', label: 'Task Reminders', description: 'Overdue and due-today task notifications' },
  { key: 'deal_momentum', label: 'Deal Momentum', description: 'Momentum nudges for qualifying deals' },
] as const;

/**
 * CONF-007: Proactive Agent Sequence Preferences
 * 9 orchestrator event sequences with icons and display names
 */
const SEQUENCE_TYPES = [
  {
    key: 'meeting_ended' as const,
    label: 'Post-Meeting Debrief',
    description: 'AI-generated summary and follow-ups after meetings',
    icon: Video
  },
  {
    key: 'pre_meeting_90min' as const,
    label: 'Pre-Meeting Briefing',
    description: 'Context and talking points before meetings',
    icon: Clock
  },
  {
    key: 'deal_risk_scan' as const,
    label: 'Deal Risk Scanner',
    description: 'Daily scan for at-risk deals',
    icon: AlertTriangle
  },
  {
    key: 'stale_deal_revival' as const,
    label: 'Stale Deal Revival',
    description: 'Suggestions to re-engage cold deals',
    icon: RefreshCw
  },
  {
    key: 'coaching_weekly' as const,
    label: 'Weekly Coaching',
    description: 'Performance insights and coaching tips',
    icon: GraduationCap
  },
  {
    key: 'campaign_daily_check' as const,
    label: 'Campaign Monitor',
    description: 'Daily campaign health check',
    icon: Mail
  },
  {
    key: 'email_received' as const,
    label: 'Email Handler',
    description: 'Smart triage and response suggestions',
    icon: Inbox
  },
  {
    key: 'proposal_generation' as const,
    label: 'Proposal Generator',
    description: 'AI-assisted proposal creation',
    icon: FileText
  },
  {
    key: 'calendar_find_times' as const,
    label: 'Calendar Scheduler',
    description: 'Smart meeting scheduling assistant',
    icon: Calendar
  },
] as const;

function NotificationPreferences() {
  const { activeOrgId } = useOrg();
  const queryClient = useQueryClient();

  const { data: prefs, isLoading } = useQuery({
    queryKey: ['slack', 'notification-prefs', activeOrgId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data } = await supabase
        .from('slack_user_preferences')
        .select('feature, is_enabled, quiet_hours_start, quiet_hours_end, max_notifications_per_hour')
        .eq('user_id', user.id)
        .eq('org_id', activeOrgId!);

      return data || [];
    },
    enabled: !!activeOrgId,
  });

  const toggleFeature = useMutation({
    mutationFn: async ({ feature, enabled }: { feature: string; enabled: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !activeOrgId) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('slack_user_preferences')
        .upsert({
          user_id: user.id,
          org_id: activeOrgId,
          feature,
          is_enabled: enabled,
        }, { onConflict: 'user_id,org_id,feature' });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['slack', 'notification-prefs'] });
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to update preference');
    },
  });

  const updateQuietHours = useMutation({
    mutationFn: async ({ start, end }: { start: string; end: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !activeOrgId) throw new Error('Not authenticated');

      // Update all feature rows with the same quiet hours
      for (const f of NOTIFICATION_FEATURES) {
        await supabase
          .from('slack_user_preferences')
          .upsert({
            user_id: user.id,
            org_id: activeOrgId,
            feature: f.key,
            quiet_hours_start: start,
            quiet_hours_end: end,
          }, { onConflict: 'user_id,org_id,feature' });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['slack', 'notification-prefs'] });
      toast.success('Quiet hours saved');
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to update quiet hours');
    },
  });

  const [quietStart, setQuietStart] = useState('20:00');
  const [quietEnd, setQuietEnd] = useState('07:00');

  useEffect(() => {
    if (prefs && prefs.length > 0) {
      const first = prefs[0];
      if (first.quiet_hours_start) setQuietStart(first.quiet_hours_start.slice(0, 5));
      if (first.quiet_hours_end) setQuietEnd(first.quiet_hours_end.slice(0, 5));
    }
  }, [prefs]);

  if (isLoading) return null;

  const isFeatureEnabled = (feature: string) => {
    const pref = prefs?.find(p => p.feature === feature);
    return pref ? pref.is_enabled : true; // Default enabled
  };

  return (
    <div className="space-y-3 pt-2">
      <Separator />
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-muted-foreground" />
        <Label className="text-sm font-medium">Notification Preferences</Label>
      </div>
      <p className="text-sm text-muted-foreground">
        Control which Slack notifications you receive.
      </p>

      <div className="space-y-2">
        {NOTIFICATION_FEATURES.map(f => (
          <div key={f.key} className="flex items-center justify-between py-1">
            <div>
              <span className="text-sm font-medium">{f.label}</span>
              <p className="text-xs text-muted-foreground">{f.description}</p>
            </div>
            <Switch
              checked={isFeatureEnabled(f.key)}
              onCheckedChange={(checked) => toggleFeature.mutate({ feature: f.key, enabled: checked })}
              disabled={toggleFeature.isPending}
            />
          </div>
        ))}
      </div>

      <Separator />
      <div className="space-y-2">
        <Label className="text-sm font-medium">Quiet Hours</Label>
        <p className="text-xs text-muted-foreground">
          No notifications during these hours (in your timezone).
        </p>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Select value={quietStart} onValueChange={setQuietStart}>
              <SelectTrigger className="w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Select value={quietEnd} onValueChange={setQuietEnd}>
              <SelectTrigger className="w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => updateQuietHours.mutate({ start: quietStart, end: quietEnd })}
            disabled={updateQuietHours.isPending}
          >
            {updateQuietHours.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * CONF-007: Proactive Agent Preferences
 * User-level preferences for orchestrator event sequences
 */
function ProactiveAgentPreferences() {
  const { activeOrgId } = useOrg();
  const queryClient = useQueryClient();

  // Fetch org config to check if proactive agent is enabled
  const { data: orgConfig, isLoading: orgConfigLoading } = useQuery({
    queryKey: ['proactive-agent-config', activeOrgId],
    queryFn: async () => {
      if (!activeOrgId) return null;

      const { data, error } = await supabase.rpc('get_proactive_agent_config', {
        p_org_id: activeOrgId,
      });

      if (error) throw error;
      return data?.[0] ?? null;
    },
    enabled: !!activeOrgId,
  });

  // Fetch merged preferences (user overrides + org defaults)
  const { data: mergedPrefs, isLoading: prefsLoading } = useQuery({
    queryKey: ['merged-sequence-preferences', activeOrgId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !activeOrgId) return [];

      const { data, error } = await supabase.rpc('get_merged_sequence_preferences', {
        p_user_id: user.id,
        p_org_id: activeOrgId,
      });

      if (error) throw error;
      return data || [];
    },
    enabled: !!activeOrgId,
  });

  // Update user preference mutation
  const updatePref = useMutation({
    mutationFn: async ({
      sequenceType,
      isEnabled,
      deliveryChannel,
    }: {
      sequenceType: string;
      isEnabled: boolean;
      deliveryChannel: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !activeOrgId) throw new Error('Not authenticated');

      const { error } = await supabase.rpc('update_user_sequence_preference', {
        p_user_id: user.id,
        p_org_id: activeOrgId,
        p_sequence_type: sequenceType,
        p_is_enabled: isEnabled,
        p_delivery_channel: deliveryChannel,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merged-sequence-preferences'] });
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to update preference');
    },
  });

  if (orgConfigLoading || prefsLoading) return null;

  // Build a map of merged preferences for fast lookup
  const prefsBySequence = new Map(
    (mergedPrefs || []).map((p: any) => [p.sequence_type, p])
  );

  // Check if org has proactive agent enabled at all
  const isOrgEnabled = orgConfig?.is_enabled ?? false;

  // If org proactive agent is disabled, show a global message
  if (!isOrgEnabled) {
    return (
      <div className="space-y-3 pt-2">
        <Separator />
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">Proactive Agent Notifications</Label>
        </div>
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Proactive Agent is currently disabled for your organization. Contact your org admin to enable it.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Helper: check if a sequence is enabled at org level
  const isOrgSequenceEnabled = (sequenceType: string) => {
    if (!orgConfig?.enabled_sequences) return false;
    const seq = (orgConfig.enabled_sequences as any)[sequenceType];
    return seq?.enabled ?? false;
  };

  return (
    <div className="space-y-3 pt-2">
      <Separator />
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-muted-foreground" />
        <Label className="text-sm font-medium">Proactive Agent Notifications</Label>
      </div>
      <p className="text-sm text-muted-foreground">
        Control which AI agent sequences send you notifications.
      </p>

      <div className="space-y-3">
        {SEQUENCE_TYPES.map((seq) => {
          const pref = prefsBySequence.get(seq.key);
          const isEnabled = pref?.is_enabled ?? false;
          const deliveryChannel = pref?.delivery_channel ?? 'slack';
          const source = pref?.source ?? 'org';
          const isOrgDisabled = !isOrgSequenceEnabled(seq.key);

          const Icon = seq.icon;

          return (
            <div
              key={seq.key}
              className="flex items-start gap-3 p-3 border rounded-md bg-muted/20"
            >
              <div className="p-2 bg-primary/10 rounded-lg mt-0.5">
                <Icon className="h-4 w-4 text-primary" />
              </div>

              <div className="flex-1 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{seq.label}</span>
                      {source === 'org' && !isOrgDisabled && (
                        <Badge variant="outline" className="text-xs">
                          Using org default
                        </Badge>
                      )}
                      {isOrgDisabled && (
                        <Badge variant="secondary" className="text-xs">
                          Disabled by admin
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {seq.description}
                    </p>
                  </div>

                  <Switch
                    checked={isEnabled}
                    onCheckedChange={(checked) => {
                      updatePref.mutate({
                        sequenceType: seq.key,
                        isEnabled: checked,
                        deliveryChannel,
                      });
                    }}
                    disabled={isOrgDisabled || updatePref.isPending}
                  />
                </div>

                {/* Delivery channel selector - only show if enabled */}
                {isEnabled && !isOrgDisabled && (
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Deliver via:</Label>
                    <Select
                      value={deliveryChannel}
                      onValueChange={(value) => {
                        updatePref.mutate({
                          sequenceType: seq.key,
                          isEnabled,
                          deliveryChannel: value,
                        });
                      }}
                      disabled={updatePref.isPending}
                    >
                      <SelectTrigger className="w-[140px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="slack">Slack DM</SelectItem>
                        <SelectItem value="in_app">In-App</SelectItem>
                        <SelectItem value="both">Both</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SlackSettings() {
  const { activeOrgId, userRole } = useOrg();
  const isAdmin = useIsOrgAdmin();
  const { formatMoney: formatOrgMoney } = useOrgMoney();
  const navigate = useNavigate();
  const { data: orgSettings, isLoading: settingsLoading } = useSlackOrgSettings();
  const { data: notificationSettings, isLoading: notificationsLoading } = useSlackNotificationSettings();
  const { data: slackUserMappings } = useSlackUserMappings({ enabled: isAdmin });
  const updateSettings = useUpdateNotificationSettings();
  const sendTest = useSendTestNotification();
  const [testingFeature, setTestingFeature] = useState<SlackFeature | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);

  const isConnected = orgSettings?.is_connected ?? false;

  // Hooks MUST be called unconditionally. Keep memos above early returns.
  const notificationSettingsByFeature = useMemo(() => {
    const map = new Map<SlackFeature, SlackNotificationSettings>();
    (notificationSettings || []).forEach((s) => map.set(s.feature, s));
    return map;
  }, [notificationSettings]);

  const dailyDigestSettings = notificationSettingsByFeature.get('daily_digest');
  const dealRoomSettings = notificationSettingsByFeature.get('deal_rooms');

  const slackUserOptions = useMemo(() => {
    const rows = ((slackUserMappings as any[]) || [])
      .map((m) => ({
        slack_user_id: m.slack_user_id,
        slack_username: m.slack_username ?? null,
        slack_email: m.slack_email ?? null,
      }))
      .filter((m) => !!m.slack_user_id);

    const byId = new Map<string, { slack_user_id: string; slack_username: string | null; slack_email: string | null }>();
    rows.forEach((r) => byId.set(r.slack_user_id, r));
    return Array.from(byId.values());
  }, [slackUserMappings]);

  // Requirement: only show this page when Slack is already integrated.
  // If not connected, send the user back to Settings.
  // Note: This hook must be called before any early returns to follow React's rules of hooks.
  useEffect(() => {
    if (!settingsLoading && !isConnected) {
      navigate('/settings', { replace: true });
    }
  }, [isConnected, navigate, settingsLoading]);

  if (settingsLoading || notificationsLoading) {
    return (
      <PageContainer maxWidth="4xl" className="py-8">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PageContainer>
    );
  }

  if (!isConnected) {
    return null;
  }

  const getSettingsForFeature = (feature: SlackFeature) => {
    return notificationSettings?.find((s) => s.feature === feature);
  };

  const handleUpdateSettings = async (feature: SlackFeature, updates: Partial<SlackNotificationSettings>) => {
    try {
      await updateSettings.mutateAsync({ feature, settings: updates });
      toast.success('Settings saved');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save settings');
    }
  };

  const handleTestNotification = async (feature: SlackFeature) => {
    if (!activeOrgId) return;

    setTestingFeature(feature);
    try {
      const settings = getSettingsForFeature(feature);
      const deliveryMethod = settings?.delivery_method || 'channel';
      const sendToChannel = deliveryMethod === 'channel' || deliveryMethod === 'both';
      const sendToDm = deliveryMethod === 'dm' || deliveryMethod === 'both';
      const dmAudience = settings?.dm_audience || 'owner';
      const stakeholderSlackIds = settings?.stakeholder_slack_ids || [];

      await sendTest.mutateAsync({
        feature,
        orgId: activeOrgId,
        channelId: sendToChannel ? settings?.channel_id : undefined,
        dmAudience: sendToDm ? dmAudience : undefined,
        stakeholderSlackIds: sendToDm ? stakeholderSlackIds : undefined,
      });

      // Build success message based on delivery method and audience
      let successMessage = 'Test notification sent!';
      if (sendToDm && sendToChannel && settings?.channel_name) {
        // Both channel and DM
        if (dmAudience === 'both') {
          successMessage = `Test notification sent to #${settings.channel_name}, your DM, and stakeholder DMs!`;
        } else if (dmAudience === 'stakeholders') {
          successMessage = `Test notification sent to #${settings.channel_name} and stakeholder DMs!`;
        } else {
          successMessage = `Test notification sent to #${settings.channel_name} and your DM!`;
        }
      } else if (sendToDm) {
        // DM only
        if (dmAudience === 'both') {
          successMessage = 'Test notification sent to your DM and stakeholder DMs!';
        } else if (dmAudience === 'stakeholders') {
          successMessage = 'Test notification sent to stakeholder DMs!';
        } else {
          successMessage = 'Test notification sent to your DM!';
        }
      } else if (settings?.channel_name) {
        // Channel only
        successMessage = `Test notification sent to #${settings.channel_name}!`;
      }

      toast.success(successMessage);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to send test notification');
    } finally {
      setTestingFeature(null);
    }
  };

  const handleTestConnection = async () => {
    if (!activeOrgId) return;
    setTestingConnection(true);
    try {
      const { data, error } = await supabase.functions.invoke('slack-test-message', {
        body: { orgId: activeOrgId },
      });
      if (error) throw error;
      if (!(data as any)?.success) throw new Error((data as any)?.error || 'Failed to send test message');
      toast.success(
        (data as any)?.channelName ? `Test message sent to #${(data as any).channelName}` : 'Test message sent'
      );
    } catch (e: any) {
      toast.error(e?.message || 'Failed to send test message');
    } finally {
      setTestingConnection(false);
    }
  };

  return (
    <PageContainer maxWidth="4xl" className="py-8">
      <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Slack Integration</h1>
        <p className="text-muted-foreground mt-1">
          Configure how Sixty sends notifications to your Slack workspace.
        </p>
      </div>

      {/* Connection Status (read-only) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle className="text-lg">Slack Connection</CardTitle>
              {isConnected ? (
                <Badge variant="default" className="bg-green-600">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Connected
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <XCircle className="h-3 w-3 mr-1" />
                  Not Connected
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{orgSettings?.slack_team_name || 'Slack Workspace'}</p>
                {orgSettings?.connected_at && (
                  <p className="text-sm text-muted-foreground">
                    Connected on {new Date(orgSettings.connected_at).toLocaleDateString()}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handleTestConnection} disabled={testingConnection}>
                  {testingConnection ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Testing…
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Send test
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Personal Slack (all users) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Personal Slack
          </CardTitle>
          <CardDescription>
            Link your Slack account so you can receive DMs and be @mentioned in notifications.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SlackSelfMapping />

          {/* SLACK-013: Morning Brief Time Preference */}
          <MorningBriefPreferences />

          {/* SLACK-019: Notification Preferences */}
          <NotificationPreferences />

          {/* CONF-007: Proactive Agent Preferences */}
          <ProactiveAgentPreferences />

          {/* Read-only org summary for regular users */}
          {!isAdmin && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Org Slack settings are managed by your org owner/admin. Below is a read-only summary of the key settings.
                {userRole ? ` Your role: ${userRole}.` : ''}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-3">
            <div className="text-sm">
              <span className="font-medium">Org Daily Digest:</span>{' '}
              <span className="text-muted-foreground">
                {dailyDigestSettings?.is_enabled ? 'Enabled' : 'Disabled'}
                {dailyDigestSettings?.delivery_method === 'both'
                  ? ` • #${dailyDigestSettings?.channel_name || 'channel'} + DM`
                  : dailyDigestSettings?.delivery_method === 'channel' && dailyDigestSettings?.channel_name
                    ? ` • #${dailyDigestSettings.channel_name}`
                    : dailyDigestSettings?.delivery_method === 'dm'
                      ? ' • DM'
                      : ''}
              </span>
            </div>
            <div className="text-sm">
              <span className="font-medium">Deal Rooms:</span>{' '}
              <span className="text-muted-foreground">
                {dealRoomSettings?.is_enabled ? 'Enabled' : 'Disabled'}
                {dealRoomSettings?.deal_value_threshold
                  ? ` • ${formatOrgMoney(dealRoomSettings.deal_value_threshold, { maximumFractionDigits: 0 })}+`
                  : ''}
                {dealRoomSettings?.deal_stage_threshold ? ` • ${dealRoomSettings.deal_stage_threshold}` : ''}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Org settings (admins only) */}
      {isAdmin && (
        <>
          <Separator />

          {/* Notification Settings */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Org Slack Settings</h2>
            <div className="grid gap-4">
              {FEATURES.map((feature) => (
                <FeatureSettingsCard
                  key={feature.key}
                  feature={feature}
                  settings={getSettingsForFeature(feature.key)}
                  onUpdate={(updates) => handleUpdateSettings(feature.key, updates)}
                  onTest={() => handleTestNotification(feature.key)}
                  isUpdating={updateSettings.isPending}
                  isTesting={testingFeature === feature.key}
                  stakeholderOptions={
                    feature.key === 'deal_rooms' || feature.key === 'meeting_debrief'
                      ? slackUserOptions
                      : []
                  }
                />
              ))}
            </div>
          </div>

          <Separator />

          {/* User Mapping (admin) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                User Mapping (Org)
              </CardTitle>
              <CardDescription>
                Map Slack users to Sixty users for @mentions and direct messages.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SlackUserMapping />
            </CardContent>
          </Card>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Make sure to invite the Sixty bot to channels where you want to receive notifications.
              For private channels, you'll need to manually invite the bot using{' '}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">/invite @Sixty</code>
            </AlertDescription>
          </Alert>
        </>
      )}
      </div>
    </PageContainer>
  );
}
