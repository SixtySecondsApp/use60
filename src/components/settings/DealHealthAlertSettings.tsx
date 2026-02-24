/**
 * DealHealthAlertSettings Component
 * Story: PIPE-021 - User-configurable alert thresholds in settings
 *
 * Allows users to configure deal health alert preferences
 */

import React from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAlertPreferences, type AlertType, type AlertChannel, type AlertSeverity } from '@/lib/hooks/useAlertPreferences';
import {
  TrendingDown,
  Ghost,
  Clock,
  Pause,
  MessageCircle,
  AlertTriangle,
  Settings as SettingsIcon,
  Bell,
} from 'lucide-react';

// =============================================================================
// Alert Type Configuration
// =============================================================================

interface AlertTypeConfig {
  type: AlertType;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
}

const ALERT_TYPES: AlertTypeConfig[] = [
  {
    type: 'health_drop',
    icon: TrendingDown,
    label: 'Health Score Drop',
    description: 'Alert when deal health drops by 20+ points',
  },
  {
    type: 'ghost_risk',
    icon: Ghost,
    label: 'Ghost Risk',
    description: 'Contact has not responded in 21+ days',
  },
  {
    type: 'no_activity',
    icon: Clock,
    label: 'No Activity',
    description: 'No recorded activity for 14+ days',
  },
  {
    type: 'stage_stall',
    icon: Pause,
    label: 'Stage Stall',
    description: 'Deal stuck in current stage for 42+ days',
  },
  {
    type: 'sentiment_decline',
    icon: MessageCircle,
    label: 'Sentiment Decline',
    description: 'Negative sentiment trend in recent meetings',
  },
  {
    type: 'close_date_risk',
    icon: AlertTriangle,
    label: 'Close Date Risk',
    description: 'Close date approaching but health is low',
  },
];

const CHANNEL_OPTIONS: { value: AlertChannel; label: string }[] = [
  { value: 'none', label: 'Disabled' },
  { value: 'in_app', label: 'In-App Only' },
  { value: 'slack_and_in_app', label: 'In-App + Slack' },
];

const SEVERITY_OPTIONS: { value: AlertSeverity; label: string; description: string }[] = [
  { value: 'info', label: 'All Alerts', description: 'Receive all alerts including informational' },
  { value: 'warning', label: 'Warning & Critical', description: 'Only warning and critical alerts' },
  { value: 'critical', label: 'Critical Only', description: 'Only critical alerts' },
];

// =============================================================================
// Component
// =============================================================================

export function DealHealthAlertSettings() {
  const { preferences, updateAlertType, updateSeverityThreshold, isLoading, isUpdating } = useAlertPreferences();

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-6">
            <Bell className="w-5 h-5" />
            <h3 className="text-lg font-semibold">Deal Health Alerts</h3>
          </div>
          {[...Array(6)].map((_, i) => (
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
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Bell className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold">Deal Health Alerts</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Configure how and when you want to be notified about deal health changes
          </p>
        </div>

        {/* Global Severity Threshold */}
        <div className="p-4 bg-muted/50 rounded-lg border">
          <div className="flex items-center gap-2 mb-3">
            <SettingsIcon className="w-4 h-4 text-muted-foreground" />
            <Label className="font-semibold">Global Severity Threshold</Label>
          </div>
          <Select
            value={preferences.severity_threshold}
            onValueChange={(value) => updateSeverityThreshold(value as AlertSeverity)}
            disabled={isUpdating}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEVERITY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <div className="flex flex-col">
                    <span className="font-medium">{option.label}</span>
                    <span className="text-xs text-muted-foreground">{option.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-2">
            Only alerts meeting or exceeding this severity will be delivered
          </p>
        </div>

        {/* Alert Type Preferences */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Alert Types
          </h4>

          {ALERT_TYPES.map((config) => {
            const pref = preferences[config.type];
            const Icon = config.icon;

            return (
              <div
                key={config.type}
                className="flex items-start gap-4 p-4 border rounded-lg hover:bg-muted/30 transition-colors"
              >
                {/* Icon */}
                <div className="p-2 bg-primary/10 rounded-lg flex-shrink-0">
                  <Icon className="w-5 h-5 text-primary" />
                </div>

                {/* Label & Description */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Label className="font-medium">{config.label}</Label>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{config.description}</p>

                  {/* Channel Selector */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground min-w-[60px]">Notify via:</span>
                    <Select
                      value={pref?.channel || 'in_app'}
                      onValueChange={(value) =>
                        updateAlertType(config.type, {
                          enabled: value !== 'none',
                          channel: value as AlertChannel,
                        })
                      }
                      disabled={isUpdating}
                    >
                      <SelectTrigger className="w-[180px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CHANNEL_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value} className="text-xs">
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Enabled Toggle */}
                <div className="flex items-center">
                  <Switch
                    checked={pref?.enabled ?? true}
                    onCheckedChange={(checked) =>
                      updateAlertType(config.type, {
                        enabled: checked,
                        channel: pref?.channel || 'in_app',
                      })
                    }
                    disabled={isUpdating}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Help Text */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900">
              <p className="font-medium mb-1">About Slack Notifications</p>
              <p className="text-xs opacity-90">
                Slack alerts are sent as direct messages and are rate-limited to 10 per day to avoid notification
                fatigue. Critical alerts will always be delivered in-app.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
