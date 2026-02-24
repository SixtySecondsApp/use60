/**
 * Agent Team Configuration Loader
 *
 * Loads org-specific multi-agent team config from agent_team_config table.
 * Returns default config when no row exists — multi-agent is always-on.
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
// Default Config (always-on for all orgs)
// =============================================================================

const ALL_AGENTS: AgentName[] = ['pipeline', 'outreach', 'research', 'crm_ops', 'meetings', 'prospecting'];

/**
 * Returns the default agent team config used when no DB row exists.
 * Economy tier: all 6 agents enabled, Haiku model, $50/day budget.
 */
export function getDefaultConfig(orgId: string): AgentTeamConfig {
  const now = new Date().toISOString();
  return {
    id: 'default',
    organization_id: orgId,
    orchestrator_model: 'claude-sonnet-4-6-20250514',
    worker_model: 'claude-sonnet-4-6-20250514',
    enabled_agents: [...ALL_AGENTS],
    budget_limit_daily_usd: 50,
    created_at: now,
    updated_at: now,
  };
}

// =============================================================================
// Config Loader
// =============================================================================

/**
 * Load agent team config for an organization.
 * Returns default config when no DB row exists — multi-agent is always-on.
 * Caches the result for the lifetime of this request.
 */
const configCache = new Map<string, AgentTeamConfig>();

export async function loadAgentTeamConfig(
  client: SupabaseClient,
  orgId: string
): Promise<AgentTeamConfig> {
  // Return cached result if available
  if (configCache.has(orgId)) {
    return configCache.get(orgId)!;
  }

  try {
    const { data, error } = await client
      .from('agent_team_config')
      .select('id, organization_id, orchestrator_model, worker_model, enabled_agents, budget_limit_daily_usd, created_at, updated_at')
      .eq('organization_id', orgId)
      .maybeSingle();

    if (error) {
      // Table may not exist yet — use defaults
      if (error.message.includes('relation') || error.message.includes('does not exist')) {
        const defaultConfig = getDefaultConfig(orgId);
        configCache.set(orgId, defaultConfig);
        return defaultConfig;
      }
      console.error('[agentConfig] Error loading config:', error);
      const defaultConfig = getDefaultConfig(orgId);
      configCache.set(orgId, defaultConfig);
      return defaultConfig;
    }

    // Use DB config if found, otherwise default
    const config = (data as AgentTeamConfig | null) ?? getDefaultConfig(orgId);
    configCache.set(orgId, config);
    return config;
  } catch (err) {
    console.error('[agentConfig] Exception:', err);
    const defaultConfig = getDefaultConfig(orgId);
    configCache.set(orgId, defaultConfig);
    return defaultConfig;
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
