/**
 * Agent Team Service
 *
 * Manages agent team configuration, schedules, and triggers
 * for the multi-agent sales team feature.
 */

import { supabase } from '@/lib/supabase/clientV2';

// =============================================================================
// Types
// =============================================================================

export interface AgentTeamConfig {
  id: string;
  organization_id: string;
  model_tier: 'economy' | 'balanced' | 'premium';
  enabled_agents: string[];
  max_concurrent_agents: number;
  monthly_budget_cents: number | null;
  created_at: string;
  updated_at: string;
}

export interface AgentSchedule {
  id: string;
  organization_id: string;
  agent_name: string;
  cron_expression: string;
  action: string;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentTrigger {
  id: string;
  organization_id: string;
  agent_name: string;
  event_type: string;
  conditions: Record<string, unknown>;
  action: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Configuration
// =============================================================================

export async function getAgentTeamConfig(orgId: string): Promise<AgentTeamConfig | null> {
  const { data, error } = await supabase
    .from('agent_team_config')
    .select('id, organization_id, model_tier, enabled_agents, max_concurrent_agents, monthly_budget_cents, created_at, updated_at')
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateAgentTeamConfig(
  orgId: string,
  updates: Partial<Pick<AgentTeamConfig, 'model_tier' | 'enabled_agents' | 'max_concurrent_agents' | 'monthly_budget_cents'>>
): Promise<AgentTeamConfig> {
  const { data, error } = await supabase
    .from('agent_team_config')
    .upsert(
      { organization_id: orgId, ...updates, updated_at: new Date().toISOString() },
      { onConflict: 'organization_id' }
    )
    .select('id, organization_id, model_tier, enabled_agents, max_concurrent_agents, monthly_budget_cents, created_at, updated_at')
    .single();

  if (error) throw error;
  return data;
}

// =============================================================================
// Schedules
// =============================================================================

export async function getSchedules(orgId: string): Promise<AgentSchedule[]> {
  const { data, error } = await supabase
    .from('agent_schedules')
    .select('id, organization_id, agent_name, cron_expression, action, is_active, last_run_at, next_run_at, created_at, updated_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createSchedule(
  data: Pick<AgentSchedule, 'organization_id' | 'agent_name' | 'cron_expression' | 'action'>
): Promise<AgentSchedule> {
  const { data: result, error } = await supabase
    .from('agent_schedules')
    .insert(data)
    .select('id, organization_id, agent_name, cron_expression, action, is_active, last_run_at, next_run_at, created_at, updated_at')
    .single();

  if (error) throw error;
  return result;
}

export async function updateSchedule(
  id: string,
  updates: Partial<Pick<AgentSchedule, 'agent_name' | 'cron_expression' | 'action' | 'is_active'>>
): Promise<AgentSchedule> {
  const { data, error } = await supabase
    .from('agent_schedules')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, organization_id, agent_name, cron_expression, action, is_active, last_run_at, next_run_at, created_at, updated_at')
    .single();

  if (error) throw error;
  return data;
}

export async function deleteSchedule(id: string): Promise<void> {
  const { error } = await supabase
    .from('agent_schedules')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// =============================================================================
// Triggers
// =============================================================================

export async function getTriggers(orgId: string): Promise<AgentTrigger[]> {
  const { data, error } = await supabase
    .from('agent_triggers')
    .select('id, organization_id, agent_name, event_type, conditions, action, is_active, created_at, updated_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createTrigger(
  data: Pick<AgentTrigger, 'organization_id' | 'agent_name' | 'event_type' | 'action'>
): Promise<AgentTrigger> {
  const { data: result, error } = await supabase
    .from('agent_triggers')
    .insert({ ...data, conditions: {} })
    .select('id, organization_id, agent_name, event_type, conditions, action, is_active, created_at, updated_at')
    .single();

  if (error) throw error;
  return result;
}

export async function updateTrigger(
  id: string,
  updates: Partial<Pick<AgentTrigger, 'agent_name' | 'event_type' | 'conditions' | 'action' | 'is_active'>>
): Promise<AgentTrigger> {
  const { data, error } = await supabase
    .from('agent_triggers')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, organization_id, agent_name, event_type, conditions, action, is_active, created_at, updated_at')
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTrigger(id: string): Promise<void> {
  const { error } = await supabase
    .from('agent_triggers')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
