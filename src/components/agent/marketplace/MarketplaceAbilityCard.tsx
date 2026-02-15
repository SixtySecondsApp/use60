/**
 * MarketplaceAbilityCard Component
 *
 * Rich preview card for the org marketplace — larger, more visual, and focused on showcasing abilities.
 * Different from the admin AbilityCard.tsx — this version is designed for discovery and selection.
 */

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { Lock, Clock, CheckCircle2 } from 'lucide-react';
import type { AbilityDefinition } from '@/lib/agent/abilityRegistry';
import { useAbilityPrerequisites } from '@/hooks/useAbilityPrerequisites';
import { useIntegrationStore } from '@/lib/stores/integrationStore';
import { useSlackIntegration } from '@/lib/hooks/useSlackIntegration';
import { useFathomIntegration } from '@/lib/hooks/useFathomIntegration';
import { useInstantlyIntegration } from '@/lib/hooks/useInstantlyIntegration';

// =============================================================================
// Types
// =============================================================================

interface MarketplaceAbilityCardProps {
  ability: AbilityDefinition;
  isEnabled: boolean;
  onToggleEnabled: (abilityId: string, enabled: boolean) => void;
  onViewDetails: (abilityId: string) => void;
  stats?: { lastRunAt: string | null; totalRuns: number; successCount: number };
}

// =============================================================================
// Helpers
// =============================================================================

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

// =============================================================================
// Component
// =============================================================================

export function MarketplaceAbilityCard({
  ability,
  isEnabled,
  onToggleEnabled,
  onViewDetails,
  stats,
}: MarketplaceAbilityCardProps) {
  const Icon = ability.icon;

  // Check prerequisites (locked state)
  const { isReady, missingIntegrations } = useAbilityPrerequisites(ability.id);
  const isLocked = !isReady;

  // Integration connection status (for badges) — select PRIMITIVE values only
  const googleConnected = useIntegrationStore((state) => state.google.isConnected);
  const slackConnected = useSlackIntegration().isConnected;
  const fathomConnected = useFathomIntegration().isConnected;
  const instantlyConnected = useInstantlyIntegration().isConnected;

  // Map integration IDs to connection status
  const integrationStatus: Record<string, boolean> = {
    'google-workspace': googleConnected,
    'slack': slackConnected,
    'fathom': fathomConnected,
    'instantly': instantlyConnected,
  };

  // Handle card click (open details)
  const handleCardClick = () => {
    onViewDetails(ability.id);
  };

  // Handle toggle click (prevent card click)
  const handleToggleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleToggleChange = (checked: boolean) => {
    onToggleEnabled(ability.id, checked);
  };

  // Determine status badge variant
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
      onClick={handleCardClick}
      className={cn(
        'relative p-5 space-y-3 cursor-pointer transition-all rounded-xl',
        isLocked && 'opacity-60',
        !isEnabled && !isLocked && 'opacity-60',
        'border hover:shadow-md'
      )}
    >
      {/* Top row: Icon + Name + Toggle */}
      <div className="flex items-start gap-3">
        {/* Icon with gradient background (larger than admin card) */}
        <div className="relative flex-shrink-0">
          <div
            className={cn(
              'w-12 h-12 rounded-lg flex items-center justify-center bg-gradient-to-br',
              ability.gradient
            )}
          >
            <Icon className="w-6 h-6 text-white" />
          </div>
          {isLocked && (
            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
              <Lock className="w-3 h-3 text-white" />
            </div>
          )}
        </div>

        {/* Name and status badge */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{ability.name}</div>
          <div className="flex items-center gap-1.5 mt-1">
            <Badge {...statusBadge}>{ability.status}</Badge>
            {ability.hasApproval && (
              <Badge
                variant="outline"
                className="text-[10px] border-blue-500 text-blue-600 dark:text-blue-400"
              >
                HITL
              </Badge>
            )}
          </div>
        </div>

        {/* Toggle in top-right */}
        <div onClick={handleToggleClick}>
          <Switch
            checked={isEnabled}
            onCheckedChange={handleToggleChange}
            className="data-[state=checked]:bg-green-500"
            disabled={isLocked}
          />
        </div>
      </div>

      {/* Description (3 lines) */}
      <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-3">
        {ability.description}
      </p>

      {/* Integration requirement badges (always visible) */}
      {ability.requiredIntegrations && ability.requiredIntegrations.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {ability.requiredIntegrations.map((integration) => {
            const isConnected = integrationStatus[integration.integrationId] ?? false;

            return (
              <div
                key={integration.integrationId}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors',
                  isConnected
                    ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-500/30'
                    : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30'
                )}
              >
                {isConnected ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : (
                  <Lock className="w-3 h-3" />
                )}
                {integration.name}
              </div>
            );
          })}
        </div>
      )}

      {/* Stats row (if stats available) */}
      {stats && stats.totalRuns > 0 && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground pt-1 border-t border-gray-100 dark:border-gray-800">
          <Clock className="w-3 h-3" />
          <span className="font-medium">Last run:</span>
          <span>{formatTimeAgo(stats.lastRunAt!)}</span>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <span className="font-medium">{stats.totalRuns} run{stats.totalRuns !== 1 ? 's' : ''}</span>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <span
            className={cn(
              'font-semibold',
              stats.successCount === stats.totalRuns
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-amber-600 dark:text-amber-400'
            )}
          >
            {Math.round((stats.successCount / stats.totalRuns) * 100)}% success
          </span>
        </div>
      )}

      {/* Locked state CTA (when locked and missing integrations) */}
      {isLocked && missingIntegrations.length > 0 && (
        <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-1.5 text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
            <Lock className="w-3 h-3" />
            <span>
              Connect {missingIntegrations.map((i) => i.name).join(', ')} to unlock
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}
