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
    orchestrator_model: 'claude-sonnet-4-6',
    worker_model: 'claude-sonnet-4-6',
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

// =============================================================================
// Daily Budget Enforcement
// =============================================================================

export interface DailyBudgetCheck {
  /** Whether the org is allowed to start a new agent run. */
  allowed: boolean;
  /** Total USD spent today by this org's agents. */
  spentTodayUsd: number;
  /** The daily budget limit in USD. */
  limitUsd: number;
  /** Human-readable reason when not allowed. */
  reason?: string;
}

/**
 * Check whether the org has exceeded its daily agent budget.
 *
 * Queries the `credit_transactions` table for today's agent usage
 * (type='usage') and compares against the org's `budget_limit_daily_usd`.
 *
 * Fails CLOSED: if the DB query errors, the run is rejected to prevent
 * runaway spending.
 */
export async function checkDailyBudget(
  client: SupabaseClient,
  orgId: string,
): Promise<DailyBudgetCheck> {
  const config = await loadAgentTeamConfig(client, orgId);
  const limitUsd = config.budget_limit_daily_usd;

  // Compute start of today (UTC)
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const todayStartIso = todayStart.toISOString();

  try {
    const { data: txRows, error } = await client
      .from('credit_transactions')
      .select('amount')
      .eq('org_id', orgId)
      .eq('type', 'usage')
      .gte('created_at', todayStartIso);

    if (error) {
      // Fail CLOSED: reject the request when we cannot verify the budget
      console.error('[agentConfig] Daily budget check DB error:', error.message);
      return {
        allowed: false,
        spentTodayUsd: 0,
        limitUsd,
        reason: `Budget check failed (DB error): ${error.message}. Rejecting to prevent overspend.`,
      };
    }

    // credit_transactions.amount is negative for usage; sum the absolute values
    const spentTodayUsd = (txRows ?? []).reduce(
      (sum: number, row: { amount: number | null }) => sum + Math.abs(Number(row.amount) || 0),
      0,
    );

    if (spentTodayUsd >= limitUsd) {
      return {
        allowed: false,
        spentTodayUsd,
        limitUsd,
        reason: `Daily budget exceeded: $${spentTodayUsd.toFixed(2)} spent of $${limitUsd.toFixed(2)} limit.`,
      };
    }

    return { allowed: true, spentTodayUsd, limitUsd };
  } catch (err) {
    // Fail CLOSED on unexpected errors
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[agentConfig] Daily budget check exception:', msg);
    return {
      allowed: false,
      spentTodayUsd: 0,
      limitUsd,
      reason: `Budget check failed (exception): ${msg}. Rejecting to prevent overspend.`,
    };
  }
}
