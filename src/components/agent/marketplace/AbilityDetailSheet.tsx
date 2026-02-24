/**
 * AbilityDetailSheet Component
 *
 * Side panel detail view for abilities in the marketplace.
 * Shows full description, integration requirements, delivery channels,
 * and activity stats with enable/disable toggle.
 */

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { useAbilityPrerequisites } from '@/hooks/useAbilityPrerequisites';
import { useAgentAbilityPreferences } from '@/hooks/useAgentAbilityPreferences';
import { getSequenceTypeForEventType, USE_CASE_CATEGORIES, type AbilityDefinition } from '@/lib/agent/abilityRegistry';
import { cn } from '@/lib/utils';
import { Check, Lock, MessageSquare, Mail, Bell, Zap, Clock, TrendingUp, FlaskConical, ChevronDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { AbilityTestPanel } from '@/components/agent/marketplace/AbilityTestPanel';

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

// =============================================================================
// Helper Functions
// =============================================================================

function getTriggerTypeExplanation(triggerType: string): string {
  switch (triggerType) {
    case 'event':
      return 'Automatically when a specific event occurs';
    case 'cron':
      return 'On a scheduled basis';
    case 'chain':
      return 'When triggered by another ability';
    case 'manual':
      return 'When you manually activate it';
    default:
      return 'Based on configured triggers';
  }
}

function formatTimeAgo(timestamp: string): string {
  const now = new Date();
  const past = new Date(timestamp);
  const diffMs = now.getTime() - past.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMins > 0) return `${diffMins}m ago`;
  return 'Just now';
}

function getSuccessRateColor(rate: number): string {
  if (rate >= 80) return 'text-green-400';
  if (rate >= 50) return 'text-amber-400';
  return 'text-red-400';
}

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

  // Save delivery channels to localStorage
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

  // Calculate success rate
  const successRate = stats && stats.totalRuns > 0
    ? Math.round((stats.successCount / stats.totalRuns) * 100)
    : null;

  // Check if all integrations are connected
  const allIntegrationsReady = checks.every((c) => c.isConnected);

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

          {/* Trigger Info */}
          <div className="space-y-2 bg-white/5 rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="font-medium">Triggers {getTriggerTypeExplanation(ability.triggerType)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <TrendingUp className="w-4 h-4 text-gray-400" />
              <span>Runs {ability.stepCount} step{ability.stepCount !== 1 ? 's' : ''}</span>
            </div>
            {ability.hasApproval && (
              <div className="flex items-center gap-2 text-sm text-amber-400">
                <Bell className="w-4 h-4" />
                <span>Requires your approval before executing</span>
              </div>
            )}
          </div>

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

          {/* Delivery Channels Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
              Delivery Channels
            </h3>
            <div className="space-y-2">
              {/* Slack */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                <div className="flex items-center gap-3">
                  <MessageSquare className={cn(
                    'w-4 h-4',
                    deliveryChannels.slack ? 'text-purple-400' : 'text-gray-500'
                  )} />
                  <span className="text-sm text-gray-300">Slack</span>
                </div>
                <Button
                  size="sm"
                  variant={deliveryChannels.slack ? 'default' : 'outline'}
                  className={cn(
                    'h-7 px-3 text-xs',
                    deliveryChannels.slack
                      ? 'bg-purple-500 hover:bg-purple-600 text-white'
                      : 'border-gray-600 text-gray-400 hover:bg-white/5'
                  )}
                  onClick={() => handleChannelToggle('slack')}
                >
                  {deliveryChannels.slack ? 'Active' : 'Inactive'}
                </Button>
              </div>

              {/* Email */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                <div className="flex items-center gap-3">
                  <Mail className={cn(
                    'w-4 h-4',
                    deliveryChannels.email ? 'text-blue-400' : 'text-gray-500'
                  )} />
                  <span className="text-sm text-gray-300">Email</span>
                </div>
                <Button
                  size="sm"
                  variant={deliveryChannels.email ? 'default' : 'outline'}
                  className={cn(
                    'h-7 px-3 text-xs',
                    deliveryChannels.email
                      ? 'bg-blue-500 hover:bg-blue-600 text-white'
                      : 'border-gray-600 text-gray-400 hover:bg-white/5'
                  )}
                  onClick={() => handleChannelToggle('email')}
                >
                  {deliveryChannels.email ? 'Active' : 'Inactive'}
                </Button>
              </div>

              {/* In-App */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                <div className="flex items-center gap-3">
                  <Bell className={cn(
                    'w-4 h-4',
                    deliveryChannels['in-app'] ? 'text-green-400' : 'text-gray-500'
                  )} />
                  <span className="text-sm text-gray-300">In-App</span>
                </div>
                <Button
                  size="sm"
                  variant={deliveryChannels['in-app'] ? 'default' : 'outline'}
                  className={cn(
                    'h-7 px-3 text-xs',
                    deliveryChannels['in-app']
                      ? 'bg-green-500 hover:bg-green-600 text-white'
                      : 'border-gray-600 text-gray-400 hover:bg-white/5'
                  )}
                  onClick={() => handleChannelToggle('in-app')}
                >
                  {deliveryChannels['in-app'] ? 'Active' : 'Inactive'}
                </Button>
              </div>
            </div>
          </div>

          {/* Stats Section */}
          {stats && stats.totalRuns > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
                Activity
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {/* Last Run */}
                {stats.lastRunAt && (
                  <div className="bg-white/5 rounded-lg p-3 space-y-1">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">
                      Last Run
                    </p>
                    <p className="text-sm font-medium text-gray-300">
                      {formatTimeAgo(stats.lastRunAt)}
                    </p>
                  </div>
                )}

                {/* Total Runs */}
                <div className="bg-white/5 rounded-lg p-3 space-y-1">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">
                    Total Runs
                  </p>
                  <p className="text-sm font-medium text-gray-300">
                    {stats.totalRuns.toLocaleString()}
                  </p>
                </div>

                {/* Success Rate */}
                {successRate !== null && (
                  <div className="bg-white/5 rounded-lg p-3 space-y-1 col-span-2">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">
                      Success Rate
                    </p>
                    <p className={cn(
                      'text-lg font-semibold',
                      getSuccessRateColor(successRate)
                    )}>
                      {successRate}%
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

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
