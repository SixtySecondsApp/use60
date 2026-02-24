import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { MessageSquare, Mail, Bell, Clock, Lock, ExternalLink } from 'lucide-react';
import type { AbilityDefinition, DeliveryChannel } from '@/lib/agent/abilityRegistry';
import { getSequenceTypeForEventType } from '@/lib/agent/abilityRegistry';
import type { AbilityStats } from '@/components/agent/AbilityMarketplace';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAbilityPrerequisites } from '@/hooks/useAbilityPrerequisites';

interface AbilityCardProps {
  ability: AbilityDefinition;
  isSelected: boolean;
  onClick: () => void;
  onChannelChange?: (abilityId: string, channels: DeliveryChannel[]) => void;
  onEnabledChange?: (abilityId: string, enabled: boolean) => void;
  stats?: AbilityStats;
  backendEnabled?: boolean; // Controlled enabled state from backend (for orchestrator abilities)
  onBackendEnabledToggle?: (sequenceType: string, enabled: boolean) => void;
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function AbilityCard({
  ability,
  isSelected,
  onClick,
  onChannelChange,
  onEnabledChange,
  stats,
  backendEnabled,
  onBackendEnabledToggle,
}: AbilityCardProps) {
  const Icon = ability.icon;
  const navigate = useNavigate();

  // Check if ability has required integrations (locked state)
  const { isReady, missingIntegrations, isLoading } = useAbilityPrerequisites(ability.id);
  const isLocked = !isReady && !isLoading;

  // Determine if this ability has an orchestrator backend mapping
  const sequenceType = getSequenceTypeForEventType(ability.eventType);
  const hasBackendState = !!sequenceType;

  // Load channels from localStorage or use defaults
  const [selectedChannels, setSelectedChannels] = useState<DeliveryChannel[]>(() => {
    const stored = localStorage.getItem(`agent-ability-channels-${ability.id}`);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return ability.defaultChannels;
      }
    }
    return ability.defaultChannels;
  });

  // Load enabled state from localStorage (default: true) - only used for non-orchestrator abilities
  const [localEnabled, setLocalEnabled] = useState<boolean>(() => {
    const stored = localStorage.getItem(`agent-ability-enabled-${ability.id}`);
    if (stored !== null) {
      return stored === 'true';
    }
    return true; // Default to enabled
  });

  // Use backend state if available, otherwise fall back to localStorage
  const isEnabled = hasBackendState && backendEnabled !== undefined ? backendEnabled : localEnabled;

  // Save to localStorage and notify parent when channels change
  useEffect(() => {
    localStorage.setItem(`agent-ability-channels-${ability.id}`, JSON.stringify(selectedChannels));
    onChannelChange?.(ability.id, selectedChannels);
  }, [selectedChannels, ability.id, onChannelChange]);

  // Save to localStorage and notify parent when enabled state changes (localStorage-only abilities)
  useEffect(() => {
    if (!hasBackendState) {
      localStorage.setItem(`agent-ability-enabled-${ability.id}`, String(localEnabled));
      onEnabledChange?.(ability.id, localEnabled);
    }
  }, [localEnabled, ability.id, onEnabledChange, hasBackendState]);

  // Listen for bulk updates from parent (stage-level enable/disable/channel presets)
  useEffect(() => {
    const handleBulkUpdate = () => {
      const storedChannels = localStorage.getItem(`agent-ability-channels-${ability.id}`);
      if (storedChannels) {
        try { setSelectedChannels(JSON.parse(storedChannels)); } catch { /* ignore */ }
      }
      // Only update local state for bulk updates if not using backend state
      if (!hasBackendState) {
        const storedEnabled = localStorage.getItem(`agent-ability-enabled-${ability.id}`);
        if (storedEnabled !== null) {
          setLocalEnabled(storedEnabled === 'true');
        }
      }
    };
    window.addEventListener('ability-bulk-update', handleBulkUpdate);
    return () => window.removeEventListener('ability-bulk-update', handleBulkUpdate);
  }, [ability.id, hasBackendState]);

  // Toggle enabled state
  const handleEnabledToggle = (checked: boolean) => {
    if (hasBackendState && sequenceType && onBackendEnabledToggle) {
      // Use backend toggle for orchestrator abilities
      onBackendEnabledToggle(sequenceType, checked);
    } else {
      // Use localStorage for V1/manual abilities
      setLocalEnabled(checked);
    }
  };

  // Toggle a channel on/off
  const toggleChannel = (channel: DeliveryChannel, e: React.MouseEvent) => {
    e.stopPropagation(); // Don't trigger card click
    setSelectedChannels(prev =>
      prev.includes(channel)
        ? prev.filter(c => c !== channel)
        : [...prev, channel]
    );
  };

  // Determine status badge variant and color
  const getStatusBadgeProps = (status: string) => {
    switch (status) {
      case 'active':
        return {
          variant: 'outline' as const,
          className: 'text-[10px] border-emerald-500 text-emerald-600 dark:text-emerald-400',
        };
      case 'beta':
        return {
          variant: 'outline' as const,
          className: 'text-[10px] border-amber-500 text-amber-600 dark:text-amber-400',
        };
      case 'planned':
        return {
          variant: 'outline' as const,
          className: 'text-[10px] border-gray-400 text-gray-600 dark:text-gray-400',
        };
      default:
        return {
          variant: 'outline' as const,
          className: 'text-[10px]',
        };
    }
  };

  const statusBadge = getStatusBadgeProps(ability.status);

  return (
    <Card
      onClick={onClick}
      className={cn(
        'relative p-4 space-y-2 cursor-pointer transition-all',
        isLocked && 'opacity-60',
        !isEnabled && !isLocked && 'opacity-60',
        isSelected
          ? 'border-indigo-500 dark:border-indigo-400 bg-indigo-50/50 dark:bg-indigo-500/10 shadow-md'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50'
      )}
    >
      {/* Enable/Pause Switch in top-right corner */}
      <div className="absolute top-2 right-2 flex items-center gap-2">
        <Switch
          checked={isEnabled}
          onCheckedChange={handleEnabledToggle}
          onClick={(e) => e.stopPropagation()}
          className="data-[state=checked]:bg-green-500"
          disabled={isLocked}
        />
        {ability.hasApproval && (
          <Badge
            variant="outline"
            className="text-[10px] border-blue-500 text-blue-600 dark:text-blue-400"
          >
            HITL
          </Badge>
        )}
        {!hasBackendState && ability.backendType === 'v1-simulate' && (
          <Badge
            variant="outline"
            className="text-[10px] border-amber-500 text-amber-600 dark:text-amber-400"
          >
            V1
          </Badge>
        )}
      </div>

      {/* Icon with gradient background */}
      <div className="relative">
        <div
          className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center bg-gradient-to-br',
            ability.gradient
          )}
        >
          <Icon className="w-5 h-5 text-white" />
        </div>
        {isLocked && (
          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
            <Lock className="w-3 h-3 text-white" />
          </div>
        )}
      </div>

      {/* Name */}
      <div className="text-sm font-medium">{ability.name}</div>

      {/* Description */}
      <p className={cn(
        "text-xs text-gray-500 dark:text-gray-400 line-clamp-2",
        !isEnabled && "line-through"
      )}>
        {ability.description}
      </p>

      {/* Locked state message - show missing integrations */}
      {isLocked && missingIntegrations.length > 0 && (
        <div className="flex flex-col gap-1 pt-1">
          {missingIntegrations.map((integration) => (
            <button
              key={integration.integrationId}
              onClick={(e) => {
                e.stopPropagation(); // Don't trigger card click
                navigate(integration.connectUrl);
              }}
              className="flex items-center gap-1.5 text-[11px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:underline transition-colors text-left"
            >
              <Lock className="w-3 h-3 flex-shrink-0" />
              <span>Connect {integration.name} to unlock</span>
              <ExternalLink className="w-3 h-3 flex-shrink-0 ml-auto" />
            </button>
          ))}
        </div>
      )}

      {/* Channel toggles - hide when locked */}
      {!isLocked && (
        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={(e) => toggleChannel('slack', e)}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all',
              selectedChannels.includes('slack')
                ? 'bg-purple-500 text-white dark:bg-purple-600'
                : 'border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-purple-400'
            )}
          >
            <MessageSquare className="w-3 h-3" />
            Slack
          </button>
          <button
            onClick={(e) => toggleChannel('email', e)}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all',
              selectedChannels.includes('email')
                ? 'bg-blue-500 text-white dark:bg-blue-600'
                : 'border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-400'
            )}
          >
            <Mail className="w-3 h-3" />
            Email
          </button>
          <button
            onClick={(e) => toggleChannel('in-app', e)}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all',
              selectedChannels.includes('in-app')
                ? 'bg-green-500 text-white dark:bg-green-600'
                : 'border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-green-400'
            )}
          >
            <Bell className="w-3 h-3" />
            In-App
          </button>
        </div>
      )}

      {/* Quick stats */}
      {stats && stats.totalRuns > 0 && (
        <div className="flex items-center gap-2 pt-1 text-[10px] text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>{formatTimeAgo(stats.lastRunAt!)}</span>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <span>{stats.totalRuns} run{stats.totalRuns !== 1 ? 's' : ''}</span>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <span className={stats.successCount === stats.totalRuns ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
            {stats.totalRuns > 0 ? Math.round((stats.successCount / stats.totalRuns) * 100) : 0}%
          </span>
        </div>
      )}

      {/* Bottom row: Trigger type and Status badges */}
      <div className="flex items-center gap-2 pt-1">
        <Badge variant="outline" className="text-[10px] capitalize">
          {ability.triggerType}
        </Badge>
        <Badge {...statusBadge}>{ability.status}</Badge>
        {isLocked && (
          <Badge
            variant="outline"
            className="text-[10px] border-amber-500 text-amber-600 dark:text-amber-400"
          >
            Locked
          </Badge>
        )}
        {!isEnabled && !isLocked && (
          <Badge
            variant="outline"
            className="text-[10px] border-amber-500 text-amber-600 dark:text-amber-400"
          >
            Paused
          </Badge>
        )}
      </div>
    </Card>
  );
}
