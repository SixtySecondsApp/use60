/**
 * Agent Team Configuration Loader
 *
 * Loads org-specific multi-agent team config from agent_team_config table.
 * Returns null when no config exists, signaling single-agent fallback.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

type SupabaseClient = ReturnType<typeof createClient>;

// =============================================================================
// Types
// =============================================================================

export interface AgentTeamConfig {
  id: string;
  organization_id: string;
  orchestrator_model: string;
  worker_model: string;
  enabled_agents: string[];
  budget_limit_daily_usd: number;
  created_at: string;
  updated_at: string;
}

export type AgentName = 'pipeline' | 'outreach' | 'research' | 'crm_ops' | 'meetings' | 'prospecting';

export type DelegationStrategy = 'single' | 'parallel' | 'sequential';

export interface IntentClassification {
  agents: AgentName[];
  strategy: DelegationStrategy;
  reasoning: string;
  confidence: number;
}

export interface SpecialistResult {
  agentName: AgentName;
  responseText: string;
  toolsUsed: string[];
  inputTokens: number;
  outputTokens: number;
  iterations: number;
  durationMs: number;
}

// =============================================================================
// Config Loader
// =============================================================================

/**
 * Load agent team config for an organization.
 * Returns null if no config exists (single-agent fallback).
 * Caches the result for the lifetime of this request.
 */
const configCache = new Map<string, AgentTeamConfig | null>();

export async function loadAgentTeamConfig(
  client: SupabaseClient,
  orgId: string
): Promise<AgentTeamConfig | null> {
  // Return cached result if available
  if (configCache.has(orgId)) {
    return configCache.get(orgId) ?? null;
  }

  try {
    const { data, error } = await client
      .from('agent_team_config')
      .select('id, organization_id, orchestrator_model, worker_model, enabled_agents, budget_limit_daily_usd, created_at, updated_at')
      .eq('organization_id', orgId)
      .maybeSingle();

    if (error) {
      // Table may not exist yet — graceful degradation
      if (error.message.includes('relation') || error.message.includes('does not exist')) {
        configCache.set(orgId, null);
        return null;
      }
      console.error('[agentConfig] Error loading config:', error);
      configCache.set(orgId, null);
      return null;
    }

    const config = data as AgentTeamConfig | null;
    configCache.set(orgId, config);
    return config;
  } catch (err) {
    console.error('[agentConfig] Exception:', err);
    configCache.set(orgId, null);
    return null;
  }
}

/**
 * Check if a specific agent is enabled in the org config.
 */
export function isAgentEnabled(
  config: AgentTeamConfig,
  agentName: AgentName
): boolean {
  return config.enabled_agents.includes(agentName);
}
