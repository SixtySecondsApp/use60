/**
 * AgentMarketplacePage — App Store-style Abilities Marketplace
 *
 * Org-admin-accessible page showing abilities organized by use-case categories
 * with a hero banner, rich preview cards, and detail sheet.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useIntegrationStore } from '@/lib/stores/integrationStore';
import { useAgentAbilityPreferences } from '@/hooks/useAgentAbilityPreferences';
import {
  ABILITY_REGISTRY,
  USE_CASE_CATEGORIES,
  getAbilitiesByUseCase,
  getSequenceTypeForEventType,
} from '@/lib/agent/abilityRegistry';
import { MarketplaceHero } from '@/components/agent/marketplace/MarketplaceHero';
import { MarketplaceAbilityCard } from '@/components/agent/marketplace/MarketplaceAbilityCard';
import { AbilityDetailSheet } from '@/components/agent/marketplace/AbilityDetailSheet';

interface AbilityStats {
  lastRunAt: string | null;
  totalRuns: number;
  successCount: number;
}

export default function AgentMarketplacePage() {
  const { user } = useAuth();
  const [selectedAbilityId, setSelectedAbilityId] = useState<string | null>(null);
  const checkGoogleConnection = useIntegrationStore((s) => s.checkGoogleConnection);

  // Initialize integration state on mount so cards/hero can detect connected integrations
  useEffect(() => {
    void checkGoogleConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Backend preferences for orchestrator abilities
  const { isEnabled: isBackendEnabled, toggleEnabled: toggleBackendEnabled } =
    useAgentAbilityPreferences();

  // localStorage state for V1 abilities (trigger re-render on change)
  const [localToggleKey, setLocalToggleKey] = useState(0);

  // Fetch per-ability stats from sequence_jobs
  const { data: abilityStats } = useQuery({
    queryKey: ['ability-stats', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sequence_jobs')
        .select('id, initial_input, status, created_at')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      const statsMap: Record<string, AbilityStats> = {};
      for (const job of data || []) {
        const eventType = (job.initial_input as any)?.type;
        if (!eventType) continue;

        if (!statsMap[eventType]) {
          statsMap[eventType] = { lastRunAt: job.created_at, totalRuns: 0, successCount: 0 };
        }
        statsMap[eventType].totalRuns++;
        if (job.status === 'completed') statsMap[eventType].successCount++;
      }
      return statsMap;
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  // Check if an ability is enabled (backend or localStorage)
  const isAbilityEnabled = useCallback(
    (abilityId: string): boolean => {
      const ability = ABILITY_REGISTRY.find((a) => a.id === abilityId);
      if (!ability) return false;

      const sequenceType = getSequenceTypeForEventType(ability.eventType);
      if (sequenceType) {
        return isBackendEnabled(sequenceType);
      }

      // V1 abilities: localStorage
      // localToggleKey forces re-evaluation
      void localToggleKey;
      return localStorage.getItem(`agent-ability-enabled-${abilityId}`) !== 'false';
    },
    [isBackendEnabled, localToggleKey]
  );

  // Toggle ability enabled state
  const handleToggleEnabled = useCallback(
    async (abilityId: string, enabled: boolean) => {
      const ability = ABILITY_REGISTRY.find((a) => a.id === abilityId);
      if (!ability) return;

      const sequenceType = getSequenceTypeForEventType(ability.eventType);
      if (sequenceType) {
        await toggleBackendEnabled(sequenceType, enabled);
      } else {
        localStorage.setItem(`agent-ability-enabled-${abilityId}`, enabled.toString());
        setLocalToggleKey((k) => k + 1);
      }
    },
    [toggleBackendEnabled]
  );

  // Open detail sheet
  const handleViewDetails = useCallback((abilityId: string) => {
    setSelectedAbilityId(abilityId);
  }, []);

  // Close detail sheet
  const handleCloseSheet = useCallback(() => {
    setSelectedAbilityId(null);
  }, []);

  // Count enabled abilities
  const enabledCount = useMemo(() => {
    return ABILITY_REGISTRY.filter((a) => isAbilityEnabled(a.id)).length;
  }, [isAbilityEnabled]);

  // Get selected ability
  const selectedAbility = selectedAbilityId
    ? ABILITY_REGISTRY.find((a) => a.id === selectedAbilityId) ?? null
    : null;

  // Get stats for selected ability
  const selectedStats = selectedAbility && abilityStats
    ? abilityStats[selectedAbility.eventType]
    : undefined;

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-8">
      {/* Hero Banner */}
      <MarketplaceHero
        enabledCount={enabledCount}
        totalCount={ABILITY_REGISTRY.length}
        onAbilityClick={handleViewDetails}
      />

      {/* Category Sections */}
      {USE_CASE_CATEGORIES.map((category) => {
        const abilities = getAbilitiesByUseCase(category.id);
        const enabledInCategory = abilities.filter((a) => isAbilityEnabled(a.id)).length;
        const CategoryIcon = category.icon;

        return (
          <section key={category.id} id={`category-${category.id}`} className="space-y-4">
            {/* Category Header */}
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-lg bg-gradient-to-br ${category.gradient} flex items-center justify-center shrink-0`}
              >
                <CategoryIcon className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {category.name}
                  </h2>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {enabledInCategory}/{abilities.length}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{category.description}</p>
              </div>
            </div>

            {/* Ability Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {abilities.map((ability) => {
                const stats = abilityStats?.[ability.eventType];
                return (
                  <MarketplaceAbilityCard
                    key={ability.id}
                    ability={ability}
                    isEnabled={isAbilityEnabled(ability.id)}
                    onToggleEnabled={handleToggleEnabled}
                    onViewDetails={handleViewDetails}
                    stats={stats}
                  />
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Detail Sheet */}
      <AbilityDetailSheet
        ability={selectedAbility}
        isOpen={!!selectedAbilityId}
        onClose={handleCloseSheet}
        stats={selectedStats}
      />
    </div>
  );
}
