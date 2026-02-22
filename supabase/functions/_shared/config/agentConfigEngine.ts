/**
 * Agent Configuration Engine
 *
 * Three-tier config resolution: platform defaults → org overrides → user overrides.
 * Calls `resolve_agent_config_all` / `resolve_agent_config` Postgres RPCs and caches
 * results for 5 minutes to minimise DB round-trips inside edge functions.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

import type {
  AgentConfigEntry,
  AgentConfigMap,
  AgentConfigResult,
  AgentType,
  ConfigSource,
} from './types.ts';

type SupabaseClient = ReturnType<typeof createClient>;

// =============================================================================
// Fallback Defaults
// =============================================================================

/** Hardcoded fallback values used when the RPC is unavailable. */
const FALLBACK_DEFAULTS: Record<string, unknown> = {
  mission: 'Assist the sales team effectively.',
  playbook: { steps: [], notes: 'Fallback — config engine unavailable' },
  boundaries: { max_actions_per_hour: 10, require_approval: true },
  voice: { tone: 'professional', formality: 'moderate' },
  heartbeat: { interval_minutes: 30, enabled: true },
  delivery: { channel: 'in_app', format: 'card' },
  thresholds: { confidence_min: 0.7, relevance_min: 0.5 },
};

// =============================================================================
// Cache
// =============================================================================

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  config: AgentConfigMap;
  cachedAt: number; // Date.now()
}

const configCache = new Map<string, CacheEntry>();

function cacheKey(orgId: string, userId: string | null, agentType: AgentType): string {
  return `${orgId}:${userId ?? 'null'}:${agentType}`;
}

function getCached(orgId: string, userId: string | null, agentType: AgentType): AgentConfigMap | null {
  const entry = configCache.get(cacheKey(orgId, userId, agentType));
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    configCache.delete(cacheKey(orgId, userId, agentType));
    return null;
  }
  return entry.config;
}

function setCached(config: AgentConfigMap): void {
  const key = cacheKey(config.orgId, config.userId, config.agentType);
  configCache.set(key, { config, cachedAt: Date.now() });
}

// =============================================================================
// Fallback Builder
// =============================================================================

function buildFallbackConfig(orgId: string, userId: string | null, agentType: AgentType): AgentConfigMap {
  const entries: Record<string, AgentConfigEntry> = {};
  for (const [k, v] of Object.entries(FALLBACK_DEFAULTS)) {
    entries[k] = { config_key: k, config_value: v, source: 'default' };
  }
  return {
    agentType,
    orgId,
    userId,
    entries,
    resolvedAt: new Date().toISOString(),
  };
}

// =============================================================================
// RPC Row Shape
// =============================================================================

interface RpcConfigRow {
  config_key: string;
  config_value: unknown;
  source: string;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Resolve all config keys for an agent type in one RPC call.
 * Results are cached for 5 minutes keyed by org + user + agentType.
 *
 * @param client   - Supabase client (user-scoped or service role)
 * @param orgId    - Organisation UUID
 * @param userId   - User UUID, or null for org-level resolution only
 * @param agentType - One of the 9 supported agent types
 */
export async function getAgentConfig(
  client: SupabaseClient,
  orgId: string,
  userId: string | null,
  agentType: AgentType,
): Promise<AgentConfigMap> {
  const cached = getCached(orgId, userId, agentType);
  if (cached) return cached;

  try {
    const { data, error } = await client.rpc('resolve_agent_config_all', {
      p_org_id: orgId,
      p_user_id: userId,
      p_agent_type: agentType,
    });

    if (error) {
      console.warn('[agentConfigEngine] resolve_agent_config_all RPC error:', error.message);
      const fallback = buildFallbackConfig(orgId, userId, agentType);
      setCached(fallback);
      return fallback;
    }

    const rows = (data ?? []) as RpcConfigRow[];
    const entries: Record<string, AgentConfigEntry> = {};
    for (const row of rows) {
      entries[row.config_key] = {
        config_key: row.config_key,
        config_value: row.config_value,
        source: row.source as ConfigSource,
      };
    }

    const config: AgentConfigMap = {
      agentType,
      orgId,
      userId,
      entries,
      resolvedAt: new Date().toISOString(),
    };

    setCached(config);
    return config;
  } catch (err) {
    console.warn('[agentConfigEngine] Unexpected error in getAgentConfig:', err);
    const fallback = buildFallbackConfig(orgId, userId, agentType);
    setCached(fallback);
    return fallback;
  }
}

/**
 * Resolve a single config key for an agent type.
 * Checks the full-config cache first; falls back to the single-key RPC if the
 * full config for this agent hasn't been loaded yet.
 *
 * @param client    - Supabase client
 * @param orgId     - Organisation UUID
 * @param userId    - User UUID, or null for org-level resolution only
 * @param agentType - One of the 9 supported agent types
 * @param configKey - The specific key to resolve
 */
export async function getAgentConfigKey(
  client: SupabaseClient,
  orgId: string,
  userId: string | null,
  agentType: AgentType,
  configKey: string,
): Promise<AgentConfigResult> {
  // Serve from full-config cache if available
  const cached = getCached(orgId, userId, agentType);
  if (cached) {
    const entry = cached.entries[configKey] ?? null;
    return {
      config_key: configKey,
      config_value: entry?.config_value ?? null,
      source: entry?.source ?? null,
      fromCache: true,
    };
  }

  // Single-key RPC fallback
  try {
    const { data, error } = await client.rpc('resolve_agent_config', {
      p_org_id: orgId,
      p_user_id: userId,
      p_agent_type: agentType,
      p_config_key: configKey,
    });

    if (error) {
      console.warn('[agentConfigEngine] resolve_agent_config RPC error:', error.message);
      return {
        config_key: configKey,
        config_value: FALLBACK_DEFAULTS[configKey] ?? null,
        source: 'default',
        fromCache: false,
      };
    }

    // resolve_agent_config returns the JSONB value directly (no source info).
    // Source is unknown from this RPC — report null to indicate it's not attributed.
    return {
      config_key: configKey,
      config_value: data ?? null,
      source: data !== null ? (null as ConfigSource | null) : null,
      fromCache: false,
    };
  } catch (err) {
    console.warn('[agentConfigEngine] Unexpected error in getAgentConfigKey:', err);
    return {
      config_key: configKey,
      config_value: FALLBACK_DEFAULTS[configKey] ?? null,
      source: 'default',
      fromCache: false,
    };
  }
}

/**
 * Selectively invalidate cached config entries.
 * Pass no arguments to clear everything (equivalent to `clearConfigCache`).
 *
 * @param orgId     - Limit invalidation to this org (optional)
 * @param userId    - Limit invalidation to this user within the org (optional)
 * @param agentType - Limit invalidation to this agent type (optional)
 */
export function invalidateConfigCache(
  orgId?: string,
  userId?: string | null,
  agentType?: AgentType,
): void {
  if (!orgId) {
    configCache.clear();
    return;
  }

  for (const key of configCache.keys()) {
    const [kOrg, kUser, kAgent] = key.split(':');
    const orgMatch = kOrg === orgId;
    const userMatch = userId === undefined || kUser === (userId ?? 'null');
    const agentMatch = agentType === undefined || kAgent === agentType;
    if (orgMatch && userMatch && agentMatch) {
      configCache.delete(key);
    }
  }
}

/**
 * Clear the entire config cache. Intended for use in tests.
 */
export function clearConfigCache(): void {
  configCache.clear();
}
