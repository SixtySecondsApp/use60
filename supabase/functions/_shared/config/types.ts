/**
 * Agent Configuration Engine — Shared Types
 *
 * Types for the three-tier config resolution system:
 * platform defaults → org overrides → user overrides
 */

// =============================================================================
// Agent & Config Key Literals
// =============================================================================

/** All supported agent types in the config system. */
export type AgentType =
  | 'global'
  | 'crm_update'
  | 'deal_risk'
  | 'reengagement'
  | 'morning_briefing'
  | 'eod_synthesis'
  | 'internal_meeting_prep'
  | 'email_signals'
  | 'coaching_digest';

/** Standard per-agent config keys plus global-only keys. */
export type ConfigKey =
  | 'mission'
  | 'playbook'
  | 'boundaries'
  | 'voice'
  | 'heartbeat'
  | 'delivery'
  | 'thresholds'
  | 'active_methodology'
  | 'temporal.quarter_phases'
  | 'pipeline.targets';

/** Which layer of the three-tier hierarchy provided the resolved value. */
export type ConfigSource = 'user' | 'org' | 'default';

// =============================================================================
// Resolved Config Shapes
// =============================================================================

/** A single resolved config entry returned by `resolve_agent_config_all`. */
export interface AgentConfigEntry {
  config_key: string;
  /** JSONB value — shape varies by key and agent type. */
  config_value: unknown;
  source: ConfigSource;
}

/** Full resolved config for one agent type, keyed by config_key. */
export interface AgentConfigMap {
  agentType: AgentType;
  orgId: string;
  userId: string | null;
  /** Map of config_key → resolved entry including source. */
  entries: Record<string, AgentConfigEntry>;
  /** ISO timestamp of when this config was resolved. */
  resolvedAt: string;
}

/** Result of a single-key config resolution. */
export interface AgentConfigResult {
  config_key: string;
  config_value: unknown;
  /** null if the key was not found in any tier. */
  source: ConfigSource | null;
  /** true if the value was served from the in-memory cache. */
  fromCache: boolean;
}
