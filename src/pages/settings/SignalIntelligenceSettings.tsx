/**
 * SignalIntelligenceSettings
 *
 * Org admin page for configuring email signal intelligence:
 * - Master toggle: Email Signal Monitoring on/off
 * - Signal type toggles: 12 individual signal types
 * - Alert preferences: Slack threshold, batch window
 * - Engagement patterns: show in briefings, recalc frequency
 * - Deal temperature thresholds: hot/cold sliders, cooldown hours
 *
 * Reads/writes via agent_config_org_overrides (agent_type = 'email_signals')
 */

import { useState, useEffect } from 'react';
import SettingsPageWrapper from '@/components/SettingsPageWrapper';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import {
  Loader2,
  Save,
  AlertCircle,
  Signal,
  Bell,
  BarChart3,
  Thermometer,
  Mail,
  MessageSquare,
  UserPlus,
  Clock,
  Timer,
  ArrowRightLeft,
  Eye,
  Minus,
  Reply,
  Zap,
} from 'lucide-react';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

type SlackThreshold = 'all' | 'high_confidence_only';
type BatchWindow = 'immediate' | '15min' | '30min';
type RecalcFrequency = 'daily' | 'weekly';

interface SignalTypeConfig {
  key: string;
  label: string;
  description: string;
  icon: React.ElementType;
}

interface SignalSettings {
  // Master toggle
  enabled: boolean;
  // Signal type toggles
  signal_types: Record<string, boolean>;
  // Alert preferences
  slack_threshold: SlackThreshold;
  batch_window: BatchWindow;
  // Engagement patterns
  show_in_briefings: boolean;
  recalc_frequency: RecalcFrequency;
  // Deal temperature
  hot_threshold: number;
  cold_threshold: number;
  cooldown_hours: number;
}

// ============================================================================
// Signal type catalog
// ============================================================================

const SIGNAL_TYPES: SignalTypeConfig[] = [
  {
    key: 'meeting_request',
    label: 'Meeting Request',
    description: 'Prospect asks to schedule a call or demo',
    icon: Mail,
  },
  {
    key: 'pricing_question',
    label: 'Pricing Question',
    description: 'Questions about pricing, cost, or budget',
    icon: MessageSquare,
  },
  {
    key: 'positive_buying_signal',
    label: 'Positive Buying Signal',
    description: 'Strong interest or intent to purchase',
    icon: Zap,
  },
  {
    key: 'objection',
    label: 'Objection',
    description: 'Concern, hesitation, or pushback expressed',
    icon: AlertCircle,
  },
  {
    key: 'competitor_mention',
    label: 'Competitor Mention',
    description: 'Reference to a competing product or vendor',
    icon: ArrowRightLeft,
  },
  {
    key: 'introduction_offer',
    label: 'Introduction Offer',
    description: 'Prospect offers to introduce other stakeholders',
    icon: UserPlus,
  },
  {
    key: 'forward_detected',
    label: 'Forward Detected',
    description: 'Email was forwarded to additional recipients',
    icon: Reply,
  },
  {
    key: 'silence_detected',
    label: 'Silence Detected',
    description: 'No response after expected follow-up window',
    icon: Minus,
  },
  {
    key: 'fast_reply',
    label: 'Fast Reply',
    description: 'Response received unusually quickly',
    icon: Zap,
  },
  {
    key: 'slow_reply',
    label: 'Slow Reply',
    description: 'Response took longer than typical',
    icon: Timer,
  },
  {
    key: 'out_of_office',
    label: 'Out of Office',
    description: 'Auto-reply or out-of-office message detected',
    icon: Clock,
  },
  {
    key: 'new_cc_contact',
    label: 'New CC Contact',
    description: 'New stakeholder added to the email thread',
    icon: Eye,
  },
];

// ============================================================================
// Default settings
// ============================================================================

const DEFAULT_SETTINGS: SignalSettings = {
  enabled: false,
  signal_types: Object.fromEntries(SIGNAL_TYPES.map((s) => [s.key, true])),
  slack_threshold: 'all',
  batch_window: 'immediate',
  show_in_briefings: true,
  recalc_frequency: 'daily',
  hot_threshold: 60,
  cold_threshold: 30,
  cooldown_hours: 48,
};

const AGENT_TYPE = 'email_signals';

// ============================================================================
// Component
// ============================================================================

export default function SignalIntelligenceSettings() {
  const orgId = useActiveOrgId();
  const { permissions } = useOrg();
  const { isPlatformAdmin } = useUserPermissions();
  const isAdmin = permissions.canManageSettings || permissions.canManageTeam || isPlatformAdmin;

  const [settings, setSettings] = useState<SignalSettings>({ ...DEFAULT_SETTINGS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load existing org-level config from agent_config_org_overrides
  useEffect(() => {
    if (!orgId) return;

    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('agent_config_org_overrides')
          .select('config_key, config_value')
          .eq('org_id', orgId)
          .eq('agent_type', AGENT_TYPE);

        if (error) throw error;

        if (data && data.length > 0) {
          const loaded: Partial<SignalSettings> = {};
          for (const row of data) {
            (loaded as Record<string, unknown>)[row.config_key] = row.config_value;
          }
          setSettings((prev) => ({ ...prev, ...loaded }));
        }
      } catch (err) {
        console.error('[SignalIntelligenceSettings] load error:', err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [orgId]);

  const handleSave = async () => {
    if (!orgId || !isAdmin) return;
    setSaving(true);
    try {
      // Build upsert rows — one row per config key
      const rows = (Object.keys(settings) as (keyof SignalSettings)[]).map((key) => ({
        org_id: orgId,
        agent_type: AGENT_TYPE,
        config_key: key,
        config_value: settings[key] as unknown,
      }));

      const { error } = await supabase
        .from('agent_config_org_overrides')
        .upsert(rows, { onConflict: 'org_id,agent_type,config_key', ignoreDuplicates: false });

      if (error) throw error;
      toast.success('Signal Intelligence settings saved');
    } catch (err) {
      console.error('[SignalIntelligenceSettings] save error:', err);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = <K extends keyof SignalSettings>(key: K, value: SignalSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const toggleSignalType = (key: string, enabled: boolean) => {
    setSettings((prev) => ({
      ...prev,
      signal_types: { ...prev.signal_types, [key]: enabled },
    }));
  };

  if (!isAdmin) {
    return (
      <SettingsPageWrapper
        title="Signal Intelligence"
        description="Configure email signal monitoring and deal temperature thresholds."
      >
        <div className="flex items-center gap-3 p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm">You need org admin permissions to manage Signal Intelligence settings.</p>
        </div>
      </SettingsPageWrapper>
    );
  }

  return (
    <SettingsPageWrapper
      title="Signal Intelligence"
      description="Configure email signal monitoring, deal temperature scoring, and alert preferences."
    >
      <div className="space-y-8">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            {/* Master Toggle */}
            <section>
              <Card className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl border border-gray-200/60 dark:border-gray-700/40">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'h-10 w-10 rounded-xl flex items-center justify-center',
                        settings.enabled
                          ? 'bg-blue-600 dark:bg-blue-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                      )}>
                        <Signal className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base">Email Signal Monitoring</CardTitle>
                        <CardDescription>
                          Detect buying signals, objections, and engagement patterns from email activity
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {settings.enabled && (
                        <Badge className="text-xs px-2 py-0.5 h-5 bg-blue-600 text-white dark:bg-blue-500">
                          Active
                        </Badge>
                      )}
                      <Switch
                        checked={settings.enabled}
                        onCheckedChange={(checked) => updateSetting('enabled', checked)}
                      />
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </section>

            {/* Signal Type Toggles */}
            <section>
              <div className="mb-4 flex items-center gap-2">
                <Signal className="h-4 w-4 text-gray-500" />
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Signal Types</h2>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Enable or disable individual signal types to control what gets detected and alerted.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SIGNAL_TYPES.map((signal) => {
                  const Icon = signal.icon;
                  const isEnabled = settings.signal_types[signal.key] ?? true;
                  return (
                    <div
                      key={signal.key}
                      className={cn(
                        'flex items-start gap-3 p-4 rounded-xl border transition-all',
                        isEnabled
                          ? 'border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-900/20'
                          : 'border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/10 opacity-60'
                      )}
                    >
                      <div className={cn(
                        'h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
                        isEnabled
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                      )}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {signal.label}
                          </span>
                          <Switch
                            checked={isEnabled}
                            onCheckedChange={(checked) => toggleSignalType(signal.key, checked)}
                          />
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
                          {signal.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Alert Preferences */}
            <section>
              <div className="mb-4 flex items-center gap-2">
                <Bell className="h-4 w-4 text-gray-500" />
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Alert Preferences</h2>
              </div>
              <Card className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl border border-gray-200/60 dark:border-gray-700/40">
                <CardContent className="pt-6 space-y-6">
                  {/* Slack Threshold */}
                  <div className="flex items-center justify-between gap-6">
                    <div className="flex-1">
                      <Label className="text-sm font-medium text-gray-900 dark:text-white">
                        Slack Alert Threshold
                      </Label>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Control which signals trigger Slack notifications
                      </p>
                    </div>
                    <Select
                      value={settings.slack_threshold}
                      onValueChange={(v) => updateSetting('slack_threshold', v as SlackThreshold)}
                    >
                      <SelectTrigger className="h-9 w-[200px] text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All signals</SelectItem>
                        <SelectItem value="high_confidence_only">High confidence only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="border-t border-gray-100 dark:border-gray-800" />

                  {/* Batch Window */}
                  <div className="flex items-center justify-between gap-6">
                    <div className="flex-1">
                      <Label className="text-sm font-medium text-gray-900 dark:text-white">
                        Alert Batch Window
                      </Label>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Group signals together before sending Slack alerts
                      </p>
                    </div>
                    <Select
                      value={settings.batch_window}
                      onValueChange={(v) => updateSetting('batch_window', v as BatchWindow)}
                    >
                      <SelectTrigger className="h-9 w-[200px] text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="immediate">Immediate</SelectItem>
                        <SelectItem value="15min">Every 15 minutes</SelectItem>
                        <SelectItem value="30min">Every 30 minutes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Engagement Patterns */}
            <section>
              <div className="mb-4 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-gray-500" />
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Engagement Patterns</h2>
              </div>
              <Card className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl border border-gray-200/60 dark:border-gray-700/40">
                <CardContent className="pt-6 space-y-6">
                  {/* Show in Briefings */}
                  <div className="flex items-center justify-between gap-6">
                    <div className="flex-1">
                      <Label className="text-sm font-medium text-gray-900 dark:text-white">
                        Show in Morning Briefings
                      </Label>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Include engagement pattern insights in daily briefing summaries
                      </p>
                    </div>
                    <Switch
                      checked={settings.show_in_briefings}
                      onCheckedChange={(checked) => updateSetting('show_in_briefings', checked)}
                    />
                  </div>

                  <div className="border-t border-gray-100 dark:border-gray-800" />

                  {/* Recalc Frequency */}
                  <div className="flex items-center justify-between gap-6">
                    <div className="flex-1">
                      <Label className="text-sm font-medium text-gray-900 dark:text-white">
                        Pattern Recalculation Frequency
                      </Label>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        How often to recalculate contact engagement baselines
                      </p>
                    </div>
                    <Select
                      value={settings.recalc_frequency}
                      onValueChange={(v) => updateSetting('recalc_frequency', v as RecalcFrequency)}
                    >
                      <SelectTrigger className="h-9 w-[160px] text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Deal Temperature */}
            <section>
              <div className="mb-4 flex items-center gap-2">
                <Thermometer className="h-4 w-4 text-gray-500" />
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Deal Temperature</h2>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Configure scoring thresholds that determine when deals are classified as hot or cold.
              </p>
              <Card className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl border border-gray-200/60 dark:border-gray-700/40">
                <CardContent className="pt-6 space-y-8">
                  {/* Hot Threshold */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium text-gray-900 dark:text-white">
                          Hot Threshold
                        </Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Deals scoring above this are classified as hot
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-red-500 dark:text-red-400 tabular-nums min-w-[3rem] text-right">
                          {settings.hot_threshold}
                        </span>
                        <Badge className="text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0">
                          Hot
                        </Badge>
                      </div>
                    </div>
                    <Slider
                      value={[settings.hot_threshold]}
                      onValueChange={([v]) => updateSetting('hot_threshold', Math.max(v, settings.cold_threshold + 5))}
                      min={0}
                      max={100}
                      step={5}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>0</span>
                      <span>50</span>
                      <span>100</span>
                    </div>
                  </div>

                  <div className="border-t border-gray-100 dark:border-gray-800" />

                  {/* Cold Threshold */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium text-gray-900 dark:text-white">
                          Cold Threshold
                        </Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Deals scoring below this are classified as cold
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-blue-500 dark:text-blue-400 tabular-nums min-w-[3rem] text-right">
                          {settings.cold_threshold}
                        </span>
                        <Badge className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0">
                          Cold
                        </Badge>
                      </div>
                    </div>
                    <Slider
                      value={[settings.cold_threshold]}
                      onValueChange={([v]) => updateSetting('cold_threshold', Math.min(v, settings.hot_threshold - 5))}
                      min={0}
                      max={100}
                      step={5}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>0</span>
                      <span>50</span>
                      <span>100</span>
                    </div>
                  </div>

                  <div className="border-t border-gray-100 dark:border-gray-800" />

                  {/* Cooldown Hours */}
                  <div className="flex items-center justify-between gap-6">
                    <div className="flex-1">
                      <Label className="text-sm font-medium text-gray-900 dark:text-white">
                        Alert Cooldown Period
                      </Label>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Minimum hours between repeated temperature alerts for the same deal
                      </p>
                    </div>
                    <Select
                      value={String(settings.cooldown_hours)}
                      onValueChange={(v) => updateSetting('cooldown_hours', Number(v))}
                    >
                      <SelectTrigger className="h-9 w-[140px] text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="12">12 hours</SelectItem>
                        <SelectItem value="24">24 hours</SelectItem>
                        <SelectItem value="48">48 hours</SelectItem>
                        <SelectItem value="72">72 hours</SelectItem>
                        <SelectItem value="168">1 week</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Temperature Band Summary */}
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-900/30 text-xs text-gray-600 dark:text-gray-400">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-blue-400" />
                      <span>Cold: 0–{settings.cold_threshold}</span>
                    </div>
                    <span className="text-gray-300 dark:text-gray-600">|</span>
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-gray-400" />
                      <span>Warm: {settings.cold_threshold + 1}–{settings.hot_threshold - 1}</span>
                    </div>
                    <span className="text-gray-300 dark:text-gray-600">|</span>
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-red-400" />
                      <span>Hot: {settings.hot_threshold}–100</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Save Button */}
            <div className="flex justify-end pt-2 border-t border-gray-100 dark:border-gray-800">
              <Button onClick={handleSave} disabled={saving || !isAdmin}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Settings
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </SettingsPageWrapper>
  );
}
