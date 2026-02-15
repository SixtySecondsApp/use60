/**
 * MarketplaceHero Component
 *
 * Full-width gradient banner for the Agent Abilities marketplace.
 * Shows enabled/total count and 3 personalized recommendations based on connected integrations.
 */

import { useMemo } from 'react';
import { Zap } from 'lucide-react';
import { useSlackIntegration } from '@/lib/hooks/useSlackIntegration';
import { useIntegrationStore } from '@/lib/stores/integrationStore';
import { useFathomIntegration } from '@/lib/hooks/useFathomIntegration';
import { ABILITY_REGISTRY, type AbilityDefinition } from '@/lib/agent/abilityRegistry';
import { useAgentAbilityPreferences } from '@/hooks/useAgentAbilityPreferences';
import { getSequenceTypeForEventType } from '@/lib/agent/abilityRegistry';

interface MarketplaceHeroProps {
  enabledCount: number;
  totalCount: number;
  onAbilityClick: (abilityId: string) => void;
}

export function MarketplaceHero({ enabledCount, totalCount, onAbilityClick }: MarketplaceHeroProps) {
  // Call all hooks at the top level (required for React hooks)
  const { isConnected: slackConnected } = useSlackIntegration();
  const googleConnected = useIntegrationStore((state) => state.google.isConnected);
  const { isConnected: fathomConnected } = useFathomIntegration();
  const { isEnabled } = useAgentAbilityPreferences();

  // Get recommended abilities based on connected integrations
  const recommendedAbilities = useMemo(() => {
    // Integration status map
    const integrations: Record<string, boolean> = {
      'slack': slackConnected,
      'google-workspace': googleConnected,
      'fathom': fathomConnected,
      // Add other integrations as needed
      'instantly': false, // Not yet implemented in this component
    };

    // Filter abilities where all required integrations are connected
    const readyAbilities = ABILITY_REGISTRY.filter(ability => {
      // If ability has no required integrations, it's always ready
      if (!ability.requiredIntegrations || ability.requiredIntegrations.length === 0) {
        return true;
      }

      // Check if all required integrations are connected
      const allIntegrationsConnected = ability.requiredIntegrations.every(req => {
        return integrations[req.integrationId] === true;
      });

      return allIntegrationsConnected;
    });

    // Prefer abilities that are not yet enabled
    const sortedAbilities = readyAbilities.sort((a, b) => {
      // Get enabled status for orchestrator-backed abilities
      const aSequenceType = getSequenceTypeForEventType(a.eventType);
      const bSequenceType = getSequenceTypeForEventType(b.eventType);

      const aEnabled = aSequenceType ? isEnabled(aSequenceType) : false;
      const bEnabled = bSequenceType ? isEnabled(bSequenceType) : false;

      // Disabled abilities first
      if (!aEnabled && bEnabled) return -1;
      if (aEnabled && !bEnabled) return 1;

      // If equal, keep original order
      return 0;
    });

    // Fallback: If no abilities are ready, show top 3 by default
    if (sortedAbilities.length === 0) {
      const fallbackAbilities = [
        'pre-meeting-briefing',
        'post-meeting-followup',
        'deal-risk-scorer',
      ].map(id => ABILITY_REGISTRY.find(a => a.id === id)).filter(Boolean) as AbilityDefinition[];

      return fallbackAbilities.slice(0, 3);
    }

    // Return top 3
    return sortedAbilities.slice(0, 3);
  }, [slackConnected, googleConnected, fathomConnected, isEnabled]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 p-8">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
        {/* Left side: Title and stats */}
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <Zap className="w-6 h-6 text-white" />
          </div>

          {/* Text */}
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
              Agent Abilities
            </h2>
            <p className="text-sm text-muted-foreground">
              {enabledCount} of {totalCount} abilities active
            </p>
          </div>
        </div>

        {/* Right side: Recommendations */}
        <div className="w-full lg:w-auto">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Recommended for you
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {recommendedAbilities.map(ability => {
              const Icon = ability.icon;
              return (
                <button
                  key={ability.id}
                  onClick={() => onAbilityClick(ability.id)}
                  className="group relative flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-sm transition-all text-left"
                >
                  {/* Icon with gradient background */}
                  <div className={`flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br ${ability.gradient} flex items-center justify-center`}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm mb-0.5 line-clamp-1">
                      {ability.name}
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-2">
                      {ability.description.split('.')[0]}.
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
