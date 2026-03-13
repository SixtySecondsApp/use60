/**
 * AbilityDetailSheet Component
 *
 * Side panel detail view for abilities in the marketplace.
 * Shows full description, trigger flow diagram, integration requirements,
 * delivery channel toggles with Switch components, timing threshold editing,
 * live stats panel, and test panel.
 *
 * US-018: AbilityTriggerFlow integration
 * US-019: AbilityStatsPanel integration
 * US-020: Inline threshold editing + channel toggles
 */

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';
import { useAbilityPrerequisites } from '@/hooks/useAbilityPrerequisites';
import { useAgentAbilityPreferences } from '@/hooks/useAgentAbilityPreferences';
import { getSequenceTypeForEventType, USE_CASE_CATEGORIES, type AbilityDefinition } from '@/lib/agent/abilityRegistry';
import { cn } from '@/lib/utils';
import { Check, Lock, MessageSquare, Mail, Bell, Zap, FlaskConical, ChevronDown, Clock } from 'lucide-react';
import { useEffect, useState, useRef, useCallback } from 'react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { AbilityTestPanel } from '@/components/agent/marketplace/AbilityTestPanel';
import { AbilityTriggerFlow } from '@/components/agent/marketplace/AbilityTriggerFlow';
import { AbilityStatsPanel } from '@/components/agent/marketplace/AbilityStatsPanel';

// =============================================================================
// Types
// =============================================================================

interface AbilityDetailSheetProps {
  ability: AbilityDefinition | null;
  isOpen: boolean;
  onClose: () => void;
  stats?: {
    lastRunAt: string | null;
    totalRuns: number;
    successCount: number;
  };
}

type DeliveryChannel = 'slack' | 'email' | 'in-app';
type ThresholdUnit = 'minutes' | 'hours';

interface ThresholdConfig {
  value: number;
  unit: ThresholdUnit;
}

// Channel configuration with integration requirements
const CHANNEL_CONFIG: Record<DeliveryChannel, {
  icon: typeof MessageSquare;
  label: string;
  activeColor: string;
  integrationId?: string;
}> = {
  slack: {
    icon: MessageSquare,
    label: 'Slack',
    activeColor: 'data-[state=checked]:bg-purple-600',
    integrationId: 'slack',
  },
  email: {
    icon: Mail,
    label: 'Email',
    activeColor: 'data-[state=checked]:bg-blue-600',
    integrationId: 'google-workspace',
  },
  'in-app': {
    icon: Bell,
    label: 'In-App',
    activeColor: 'data-[state=checked]:bg-green-600',
  },
};

// Abilities that support timing threshold configuration (cron-based)
const THRESHOLD_ABLE_TRIGGER_TYPES = new Set(['cron', 'event']);

// =============================================================================
// Component
// =============================================================================

export function AbilityDetailSheet({
  ability,
  isOpen,
  onClose,
  stats,
}: AbilityDetailSheetProps) {
  const navigate = useNavigate();
  const { checks, isLoading: integrationsLoading } = useAbilityPrerequisites(ability?.id ?? '');
  const { isEnabled: isBackendEnabled, toggleEnabled: toggleBackendEnabled, isToggling } = useAgentAbilityPreferences();

  // Delivery channels state (localStorage)
  const [deliveryChannels, setDeliveryChannels] = useState<Record<DeliveryChannel, boolean>>({
    slack: true,
    email: true,
    'in-app': true,
  });

  // Timing threshold state (US-020)
  const [threshold, setThreshold] = useState<ThresholdConfig>({ value: 90, unit: 'minutes' });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [testOpen, setTestOpen] = useState(false);

  // Load delivery channels from localStorage
  useEffect(() => {
    if (!ability) return;

    const key = `agent-ability-channels-${ability.id}`;
    const stored = localStorage.getItem(key);

    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setDeliveryChannels(parsed);
      } catch (e) {
        console.error('[AbilityDetailSheet] Failed to parse delivery channels from localStorage:', e);
      }
    } else {
      // Set defaults from ability definition
      const defaults = {
        slack: ability.defaultChannels.includes('slack'),
        email: ability.defaultChannels.includes('email'),
        'in-app': ability.defaultChannels.includes('in-app'),
      };
      setDeliveryChannels(defaults);
    }
  }, [ability]);

  // Load threshold from localStorage
  useEffect(() => {
    if (!ability) return;

    const key = `agent-ability-threshold-${ability.id}`;
    const stored = localStorage.getItem(key);

    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setThreshold(parsed);
      } catch (e) {
        console.error('[AbilityDetailSheet] Failed to parse threshold from localStorage:', e);
      }
    } else {
      // Set a sensible default based on the ability
      setThreshold(getDefaultThreshold(ability.eventType));
    }
  }, [ability]);

  // Debounced save for threshold changes
  const saveThreshold = useCallback((config: ThresholdConfig) => {
    if (!ability) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      const key = `agent-ability-threshold-${ability.id}`;
      localStorage.setItem(key, JSON.stringify(config));
    }, 500);
  }, [ability]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Save delivery channels to localStorage (US-020: uses Switch toggles)
  const handleChannelToggle = (channel: DeliveryChannel) => {
    if (!ability) return;

    const updated = {
      ...deliveryChannels,
      [channel]: !deliveryChannels[channel],
    };
    setDeliveryChannels(updated);

    const key = `agent-ability-channels-${ability.id}`;
    localStorage.setItem(key, JSON.stringify(updated));
  };

  // Handle threshold value change
  const handleThresholdValueChange = (value: string) => {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue) || numValue < 0) return;

    const updated = { ...threshold, value: numValue };
    setThreshold(updated);
    saveThreshold(updated);
  };

  // Handle threshold unit change
  const handleThresholdUnitChange = (unit: string) => {
    const updated = { ...threshold, unit: unit as ThresholdUnit };
    setThreshold(updated);
    saveThreshold(updated);
  };

  // Determine enable/disable state
  const sequenceType = ability ? getSequenceTypeForEventType(ability.eventType) : undefined;
  const hasBackendState = !!sequenceType;

  const isAbilityEnabled = hasBackendState
    ? isBackendEnabled(sequenceType)
    : (typeof window !== 'undefined' && localStorage.getItem(`agent-ability-enabled-${ability?.id}`) !== 'false');

  const handleToggleEnabled = async () => {
    if (!ability) return;

    if (hasBackendState && sequenceType) {
      // Use backend toggle for orchestrator abilities
      await toggleBackendEnabled(sequenceType, !isAbilityEnabled);
    } else {
      // Use localStorage for V1 abilities
      const key = `agent-ability-enabled-${ability.id}`;
      localStorage.setItem(key, (!isAbilityEnabled).toString());
      // Force re-render
      window.dispatchEvent(new Event('storage'));
    }
  };

  if (!ability) {
    return null;
  }

  // Find use case category for badge
  const useCase = USE_CASE_CATEGORIES.find((c) => c.id === ability.useCase);

  // Check if all integrations are connected
  const allIntegrationsReady = checks.every((c) => c.isConnected);

  // Build a set of connected integration IDs for channel disabled state
  const connectedIntegrations = new Set(
    checks.filter((c) => c.isConnected).map((c) => c.integration.integrationId)
  );

  // Determine if timing threshold is relevant for this ability
  const showThreshold = THRESHOLD_ABLE_TRIGGER_TYPES.has(ability.triggerType);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="!top-16 !h-[calc(100vh-4rem)] w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="space-y-4 pb-4 border-b border-white/5">
          {/* Icon and Title */}
          <div className="flex items-start gap-4">
            <div className={cn(
              'flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br',
              ability.gradient
            )}>
              <ability.icon className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 space-y-2">
              <SheetTitle className="text-xl font-bold text-gray-100">
                {ability.name}
              </SheetTitle>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Use Case Badge */}
                {useCase && (
                  <Badge variant="secondary" className="bg-white/5 text-gray-300 border-white/10">
                    {useCase.name}
                  </Badge>
                )}
                {/* Status Badge */}
                <Badge
                  variant={ability.status === 'active' ? 'default' : 'secondary'}
                  className={cn(
                    ability.status === 'active' && 'bg-green-500/10 text-green-400 border-green-500/20',
                    ability.status === 'beta' && 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                    ability.status === 'planned' && 'bg-gray-500/10 text-gray-400 border-gray-500/20'
                  )}
                >
                  {ability.status === 'active' ? 'Active' : ability.status === 'beta' ? 'Beta' : 'Planned'}
                </Badge>
              </div>
            </div>
          </div>

          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between bg-white/5 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-300">
                {isAbilityEnabled ? 'Enabled' : 'Paused'}
              </span>
            </div>
            <Switch
              checked={isAbilityEnabled}
              onCheckedChange={handleToggleEnabled}
              disabled={isToggling || integrationsLoading}
            />
          </div>
        </SheetHeader>

        {/* Description Section */}
        <div className="space-y-6 pt-6">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
              Description
            </h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              {ability.description}
            </p>
          </div>

          {/* US-018: Trigger Flow Diagram */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
              How It Works
            </h3>
            <AbilityTriggerFlow ability={ability} />
          </div>

          {/* US-020: Timing Threshold (for time-based abilities) */}
          {showThreshold && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
                Timing
              </h3>
              <div className="flex items-center gap-3 bg-white/5 rounded-lg p-3">
                <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="text-sm text-gray-300 shrink-0">Run</span>
                <Input
                  type="number"
                  min={1}
                  max={999}
                  value={threshold.value}
                  onChange={(e) => handleThresholdValueChange(e.target.value)}
                  className="w-20 h-8 text-sm bg-white/5 border-white/10 text-gray-200"
                />
                <Select value={threshold.unit} onValueChange={handleThresholdUnitChange}>
                  <SelectTrigger className="w-28 h-8 text-sm bg-white/5 border-white/10 text-gray-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">minutes</SelectItem>
                    <SelectItem value="hours">hours</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-sm text-gray-400 shrink-0">before</span>
              </div>
            </div>
          )}

          {/* Required Integrations Section */}
          {ability.requiredIntegrations && ability.requiredIntegrations.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
                Required Integrations
              </h3>
              {allIntegrationsReady ? (
                <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                  <Check className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-green-400 font-medium">
                    All integrations ready
                  </span>
                </div>
              ) : (
                <div className="space-y-2">
                  {checks.map((check) => (
                    <div
                      key={check.integration.integrationId}
                      className={cn(
                        'flex items-center justify-between p-3 rounded-lg border',
                        check.isConnected
                          ? 'bg-green-500/5 border-green-500/20'
                          : 'bg-amber-500/5 border-amber-500/20'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {check.isConnected ? (
                          <Check className="w-4 h-4 text-green-400" />
                        ) : (
                          <Lock className="w-4 h-4 text-amber-400" />
                        )}
                        <div className="space-y-0.5">
                          <p className={cn(
                            'text-sm font-medium',
                            check.isConnected ? 'text-green-400' : 'text-gray-300'
                          )}>
                            {check.integration.name}
                          </p>
                          {!check.isConnected && (
                            <p className="text-xs text-gray-500">
                              {check.integration.reason}
                            </p>
                          )}
                        </div>
                      </div>
                      {check.isConnected ? (
                        <span className="text-xs text-green-400">Connected</span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                          onClick={() => navigate(check.integration.connectUrl)}
                        >
                          Connect
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* US-020: Delivery Channel Toggles (Switch-based) */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
              Delivery Channels
            </h3>
            <div className="space-y-2">
              {(Object.keys(CHANNEL_CONFIG) as DeliveryChannel[]).map((channel) => {
                const config = CHANNEL_CONFIG[channel];
                const ChannelIcon = config.icon;
                const isActive = deliveryChannels[channel];

                // Check if the required integration for this channel is connected
                const requiresIntegration = config.integrationId;
                const isIntegrationConnected = !requiresIntegration || connectedIntegrations.has(requiresIntegration);
                const isDisabled = !isIntegrationConnected;

                return (
                  <div
                    key={channel}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-lg bg-white/5',
                      isDisabled && 'opacity-50'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <ChannelIcon className={cn(
                        'w-4 h-4',
                        isActive && !isDisabled ? getChannelIconColor(channel) : 'text-gray-500'
                      )} />
                      <div className="flex flex-col">
                        <span className="text-sm text-gray-300">{config.label}</span>
                        {isDisabled && (
                          <span className="text-[10px] text-gray-500">
                            Requires {config.integrationId === 'google-workspace' ? 'Gmail' : 'Slack'} connection
                          </span>
                        )}
                      </div>
                    </div>
                    <Switch
                      checked={isActive}
                      onCheckedChange={() => handleChannelToggle(channel)}
                      disabled={isDisabled}
                      className={cn(config.activeColor)}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* US-019: Live Stats Panel */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
              Activity
            </h3>
            <AbilityStatsPanel ability={ability} />
          </div>

          {/* Test This Ability Section */}
          <Collapsible open={testOpen} onOpenChange={setTestOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full py-3 group">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-300 uppercase tracking-wide">
                <FlaskConical className="w-4 h-4 text-gray-400" />
                Test This Ability
              </div>
              <ChevronDown className={cn(
                'w-4 h-4 text-gray-400 transition-transform duration-200',
                testOpen && 'rotate-180'
              )} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              {ability.status === 'planned' ? (
                <div className="py-4 text-sm text-gray-500 text-center">
                  Coming soon
                </div>
              ) : (
                <div className="max-h-[400px] overflow-y-auto">
                  <AbilityTestPanel ability={ability} />
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function getChannelIconColor(channel: DeliveryChannel): string {
  switch (channel) {
    case 'slack':
      return 'text-purple-400';
    case 'email':
      return 'text-blue-400';
    case 'in-app':
      return 'text-green-400';
  }
}

function getDefaultThreshold(eventType: string): ThresholdConfig {
  switch (eventType) {
    case 'pre_meeting_90min':
      return { value: 90, unit: 'minutes' };
    case 'pre_meeting_nudge':
      return { value: 30, unit: 'minutes' };
    case 'morning_brief':
    case 'sales_assistant_digest':
      return { value: 1, unit: 'hours' };
    case 'deal_risk_scan':
    case 'overdue_deal_scan':
    case 'ghost_deal_scan':
    case 'stale_deal_alert':
      return { value: 24, unit: 'hours' };
    case 'campaign_daily_check':
      return { value: 24, unit: 'hours' };
    case 'coaching_weekly':
      return { value: 168, unit: 'hours' };
    default:
      return { value: 60, unit: 'minutes' };
  }
}
