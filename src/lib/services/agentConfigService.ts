import { supabase } from '@/lib/supabase/clientV2';

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

export type ConfigSource = 'user' | 'org' | 'default';

export interface AgentConfigEntry {
  config_key: string;
  config_value: unknown;
  source: ConfigSource;
}

export interface AgentConfigMap {
  agentType: AgentType;
  orgId: string;
  userId: string | null;
  entries: Record<string, AgentConfigEntry>;
  resolvedAt: string;
}

export interface OverridableKey {
  agent_type: string;
  config_key: string;
  is_overridable: boolean;
}

export interface MethodologyTemplate {
  id: string;
  methodology_key: string;
  name: string;
  description: string;
  qualification_criteria: Record<string, unknown>;
  stage_rules: Record<string, unknown>;
  coaching_focus: Record<string, unknown>;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('agent-config-admin', { body });
  if (error) throw error;
  return data as T;
}

export async function getAgentConfig(
  orgId: string,
  agentType: AgentType,
  userId?: string
): Promise<AgentConfigMap> {
  const result = await invoke<{ config: AgentConfigMap }>({
    action: 'get_config',
    org_id: orgId,
    agent_type: agentType,
    user_id: userId,
  });
  return result.config;
}

export async function listAgentTypes(): Promise<string[]> {
  const result = await invoke<{ agent_types: string[] }>({ action: 'list_agent_types' });
  return result.agent_types;
}

export async function setOrgOverride(
  orgId: string,
  agentType: AgentType,
  configKey: string,
  configValue: unknown
): Promise<{ success: boolean; config_key: string; agent_type: string }> {
  return invoke({
    action: 'set_org_override',
    org_id: orgId,
    agent_type: agentType,
    config_key: configKey,
    config_value: configValue,
  });
}

export async function removeOrgOverride(
  orgId: string,
  agentType: AgentType,
  configKey: string
): Promise<{ success: boolean; removed: boolean }> {
  return invoke({
    action: 'remove_org_override',
    org_id: orgId,
    agent_type: agentType,
    config_key: configKey,
  });
}

export async function setUserOverride(
  orgId: string,
  agentType: AgentType,
  configKey: string,
  configValue: unknown
): Promise<{ success: boolean; config_key: string; agent_type: string }> {
  return invoke({
    action: 'set_user_override',
    org_id: orgId,
    agent_type: agentType,
    config_key: configKey,
    config_value: configValue,
  });
}

export async function removeUserOverride(
  orgId: string,
  agentType: AgentType,
  configKey: string
): Promise<{ success: boolean; removed: boolean }> {
  return invoke({
    action: 'remove_user_override',
    org_id: orgId,
    agent_type: agentType,
    config_key: configKey,
  });
}

export async function setOverridable(
  orgId: string,
  agentType: AgentType,
  configKey: string,
  isOverridable: boolean
): Promise<{ success: boolean; config_key: string; is_overridable: boolean }> {
  return invoke({
    action: 'set_overridable',
    org_id: orgId,
    agent_type: agentType,
    config_key: configKey,
    is_overridable: isOverridable,
  });
}

export async function getOverridableKeys(
  orgId: string,
  agentType?: AgentType
): Promise<OverridableKey[]> {
  const result = await invoke<{ keys: OverridableKey[] }>({
    action: 'get_overridable_keys',
    org_id: orgId,
    agent_type: agentType,
  });
  return result.keys;
}

export async function getMethodologies(): Promise<MethodologyTemplate[]> {
  const result = await invoke<{ methodologies: MethodologyTemplate[] }>({
    action: 'get_methodologies',
  });
  return result.methodologies;
}

export async function applyMethodology(
  orgId: string,
  methodologyKey: string
): Promise<{ success: boolean; methodology_key: string; keys_written: number }> {
  return invoke({
    action: 'apply_methodology',
    org_id: orgId,
    methodology_key: methodologyKey,
  });
}
