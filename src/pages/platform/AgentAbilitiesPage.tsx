/**
 * AgentAbilitiesPage — Unified Agent Abilities showcase page
 *
 * Event-driven autonomous workflows organized by sales lifecycle stage.
 * Displays heartbeat status, lifecycle timeline, ability cards, run panel, and activity feed.
 */

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Zap, Play, Pause, MessageSquare, Mail, Bell, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import HeartbeatStatusBar from '@/components/agent/HeartbeatStatusBar';
import { LifecycleTimeline } from '@/components/agent/LifecycleTimeline';
import { AbilityCard } from '@/components/agent/AbilityCard';
import { AbilityRunPanel } from '@/components/agent/AbilityRunPanel';
import { ActivityFeed } from '@/components/agent/ActivityFeed';
import { ExecutionHistoryPanel } from '@/components/agent/ExecutionHistoryPanel';
import { WaveVisualizer } from '@/components/agent/WaveVisualizer';
import { ApprovalQueue } from '@/components/agent/ApprovalQueue';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  type LifecycleStage,
  type DeliveryChannel,
  getAbilitiesByStage,
  getSequenceTypeForEventType,
  ABILITY_REGISTRY,
} from '@/lib/agent/abilityRegistry';
import { useAgentAbilityPreferences } from '@/hooks/useAgentAbilityPreferences';

export interface AbilityStats {
  lastRunAt: string | null;
  totalRuns: number;
  successCount: number;
}

export default function AgentAbilitiesPage() {
  const { user } = useAuth();

  // Default to post-meeting stage with first ability selected
  const [activeStage, setActiveStage] = useState<LifecycleStage>('post-meeting');
  const [selectedAbilityId, setSelectedAbilityId] = useState<string>(
    getAbilitiesByStage('post-meeting')[0]?.id || ''
  );

  // Lifted state for ability channels and enabled status (localStorage-only abilities)
  const [abilityChannels, setAbilityChannels] = useState<Record<string, DeliveryChannel[]>>({});
  const [abilityEnabled, setAbilityEnabled] = useState<Record<string, boolean>>({});

  // Backend preferences for orchestrator abilities
  const { isEnabled: isBackendEnabled, toggleEnabled: toggleBackendEnabled } =
    useAgentAbilityPreferences();

  // Fetch per-ability stats from sequence_jobs (grouped by event_type)
  const { data: abilityStats } = useQuery({
    queryKey: ['ability-stats', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sequence_jobs')
        .select('id, initial_input, status, created_at')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      // Aggregate by event_type
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

  const handleChannelChange = useCallback((abilityId: string, channels: DeliveryChannel[]) => {
    setAbilityChannels(prev => ({ ...prev, [abilityId]: channels }));
  }, []);

  const handleEnabledChange = useCallback((abilityId: string, enabled: boolean) => {
    setAbilityEnabled(prev => ({ ...prev, [abilityId]: enabled }));
  }, []);

  const handleStageChange = (stage: LifecycleStage) => {
    setActiveStage(stage);
    const abilities = getAbilitiesByStage(stage);
    if (abilities.length > 0) setSelectedAbilityId(abilities[0].id);
  };

  const abilities = getAbilitiesByStage(activeStage);
  const selectedAbility = ABILITY_REGISTRY.find(a => a.id === selectedAbilityId);

  // Get channel and enabled state for selected ability
  const activeChannels = selectedAbility
    ? abilityChannels[selectedAbility.id] || selectedAbility.defaultChannels
    : [];

  // Use backend state for orchestrator abilities, localStorage for others
  const selectedSequenceType = selectedAbility
    ? getSequenceTypeForEventType(selectedAbility.eventType)
    : undefined;
  const isAbilityEnabled = selectedAbility
    ? selectedSequenceType
      ? isBackendEnabled(selectedSequenceType)
      : abilityEnabled[selectedAbility.id] ?? true
    : true;

  // Helper to get enabled state for any ability (for bulk operations)
  const getAbilityEnabled = (ability: typeof ABILITY_REGISTRY[0]): boolean => {
    const sequenceType = getSequenceTypeForEventType(ability.eventType);
    return sequenceType ? isBackendEnabled(sequenceType) : abilityEnabled[ability.id] ?? true;
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0">
          <Zap className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Agent Abilities</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Event-driven autonomous workflows organized by sales lifecycle
          </p>
        </div>
      </div>

      {/* Heartbeat Status Bar */}
      <HeartbeatStatusBar />

      {/* Lifecycle Timeline */}
      <LifecycleTimeline activeStage={activeStage} onStageChange={handleStageChange} />

      {/* Bulk Stage Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide mr-1">
          {activeStage} ({abilities.length})
        </span>
        <div className="h-4 w-px bg-border" />
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1"
          onClick={async () => {
            // Enable all abilities in this stage
            for (const ability of abilities) {
              const sequenceType = getSequenceTypeForEventType(ability.eventType);
              if (sequenceType) {
                // Use backend for orchestrator abilities
                await toggleBackendEnabled(sequenceType, true);
              } else {
                // Use localStorage for V1/manual abilities
                handleEnabledChange(ability.id, true);
                localStorage.setItem(`agent-ability-enabled-${ability.id}`, 'true');
              }
            }
            window.dispatchEvent(new Event('ability-bulk-update'));
          }}
        >
          <Play className="w-3 h-3" />
          Enable All
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1"
          onClick={async () => {
            // Pause all abilities in this stage
            for (const ability of abilities) {
              const sequenceType = getSequenceTypeForEventType(ability.eventType);
              if (sequenceType) {
                // Use backend for orchestrator abilities
                await toggleBackendEnabled(sequenceType, false);
              } else {
                // Use localStorage for V1/manual abilities
                handleEnabledChange(ability.id, false);
                localStorage.setItem(`agent-ability-enabled-${ability.id}`, 'false');
              }
            }
            window.dispatchEvent(new Event('ability-bulk-update'));
          }}
        >
          <Pause className="w-3 h-3" />
          Pause All
        </Button>
        <div className="h-4 w-px bg-border" />
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1 text-purple-600 dark:text-purple-400"
          onClick={() => {
            const ch: DeliveryChannel[] = ['slack', 'email', 'in-app'];
            abilities.forEach(a => {
              handleChannelChange(a.id, ch);
              localStorage.setItem(`agent-ability-channels-${a.id}`, JSON.stringify(ch));
            });
            window.dispatchEvent(new Event('ability-bulk-update'));
          }}
        >
          <Layers className="w-3 h-3" />
          All Channels
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1 text-purple-600 dark:text-purple-400"
          onClick={() => {
            const ch: DeliveryChannel[] = ['slack'];
            abilities.forEach(a => {
              handleChannelChange(a.id, ch);
              localStorage.setItem(`agent-ability-channels-${a.id}`, JSON.stringify(ch));
            });
            window.dispatchEvent(new Event('ability-bulk-update'));
          }}
        >
          <MessageSquare className="w-3 h-3" />
          Slack Only
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1 text-blue-600 dark:text-blue-400"
          onClick={() => {
            const ch: DeliveryChannel[] = ['email'];
            abilities.forEach(a => {
              handleChannelChange(a.id, ch);
              localStorage.setItem(`agent-ability-channels-${a.id}`, JSON.stringify(ch));
            });
            window.dispatchEvent(new Event('ability-bulk-update'));
          }}
        >
          <Mail className="w-3 h-3" />
          Email Only
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1 text-green-600 dark:text-green-400"
          onClick={() => {
            const ch: DeliveryChannel[] = ['in-app'];
            abilities.forEach(a => {
              handleChannelChange(a.id, ch);
              localStorage.setItem(`agent-ability-channels-${a.id}`, JSON.stringify(ch));
            });
            window.dispatchEvent(new Event('ability-bulk-update'));
          }}
        >
          <Bell className="w-3 h-3" />
          In-App Only
        </Button>
      </div>

      {/* Ability Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {abilities.map(ability => {
          const sequenceType = getSequenceTypeForEventType(ability.eventType);
          return (
            <AbilityCard
              key={ability.id}
              ability={ability}
              isSelected={ability.id === selectedAbilityId}
              onClick={() => setSelectedAbilityId(ability.id)}
              onChannelChange={handleChannelChange}
              onEnabledChange={handleEnabledChange}
              stats={abilityStats?.[ability.eventType]}
              backendEnabled={sequenceType ? isBackendEnabled(sequenceType) : undefined}
              onBackendEnabledToggle={toggleBackendEnabled}
            />
          );
        })}
      </div>

      {/* Ability Run Panel + Detail Tabs */}
      {selectedAbility && (
        <Tabs defaultValue="run" className="space-y-4">
          <TabsList>
            <TabsTrigger value="run">Run</TabsTrigger>
            <TabsTrigger value="waves">Waves</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="approvals">Approvals</TabsTrigger>
          </TabsList>

          <TabsContent value="run">
            <AbilityRunPanel
              ability={selectedAbility}
              activeChannels={activeChannels}
              isEnabled={isAbilityEnabled}
            />
          </TabsContent>

          <TabsContent value="waves">
            <WaveVisualizer
              eventType={selectedAbility.eventType || 'meeting_ended'}
            />
          </TabsContent>

          <TabsContent value="history">
            <ExecutionHistoryPanel />
          </TabsContent>

          <TabsContent value="approvals">
            <ApprovalQueue />
          </TabsContent>
        </Tabs>
      )}

      {/* Activity Feed */}
      <ActivityFeed />
    </div>
  );
}
