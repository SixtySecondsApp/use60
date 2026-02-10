/**
 * Agent Team Service
 *
 * Manages agent team configuration, schedules, and triggers
 * for the multi-agent sales team feature.
 *
 * DB columns (agent_schedules): cron_expression, agent_name, prompt_template,
 *   delivery_channel, is_active, last_run_at
 * DB columns (agent_triggers): trigger_event, agent_name, prompt_template,
 *   is_active
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
  prompt_template: string;
  delivery_channel: string;
  is_active: boolean;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentTrigger {
  id: string;
  organization_id: string;
  agent_name: string;
  trigger_event: string;
  prompt_template: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScheduleRunResult {
  scheduleId: string;
  agentName: string;
  success: boolean;
  delivered: boolean;
  responseText?: string;
  error?: string;
  durationMs?: number;
}

export interface TriggerTestResult {
  triggerId: string;
  agentName: string;
  success: boolean;
  delivered: boolean;
  responseText?: string;
  error?: string;
  durationMs?: number;
}

// Column lists for explicit selection (per CLAUDE.md: never select('*'))
const SCHEDULE_COLS = 'id, organization_id, agent_name, cron_expression, prompt_template, delivery_channel, is_active, last_run_at, created_at, updated_at';
const TRIGGER_COLS = 'id, organization_id, agent_name, trigger_event, prompt_template, is_active, created_at, updated_at';
const CONFIG_COLS = 'id, organization_id, model_tier, enabled_agents, max_concurrent_agents, monthly_budget_cents, created_at, updated_at';

// =============================================================================
// Configuration
// =============================================================================

export async function getAgentTeamConfig(orgId: string): Promise<AgentTeamConfig | null> {
  const { data, error } = await supabase
    .from('agent_team_config')
    .select(CONFIG_COLS)
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
    .select(CONFIG_COLS)
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
    .select(SCHEDULE_COLS)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createSchedule(
  data: Pick<AgentSchedule, 'organization_id' | 'agent_name' | 'cron_expression' | 'prompt_template'> & { delivery_channel?: string }
): Promise<AgentSchedule> {
  const { data: result, error } = await supabase
    .from('agent_schedules')
    .insert({
      organization_id: data.organization_id,
      agent_name: data.agent_name,
      cron_expression: data.cron_expression,
      prompt_template: data.prompt_template,
      delivery_channel: data.delivery_channel || 'in_app',
    })
    .select(SCHEDULE_COLS)
    .single();

  if (error) throw error;
  return result;
}

export async function updateSchedule(
  id: string,
  updates: Partial<Pick<AgentSchedule, 'agent_name' | 'cron_expression' | 'prompt_template' | 'delivery_channel' | 'is_active'>>
): Promise<AgentSchedule> {
  const { data, error } = await supabase
    .from('agent_schedules')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(SCHEDULE_COLS)
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

/**
 * Manually run a schedule immediately via the agent-scheduler edge function.
 * Uses JWT auth (auto-injected by supabase.functions.invoke).
 */
export async function runScheduleNow(scheduleId: string): Promise<{
  success: boolean;
  results: ScheduleRunResult[];
  error?: string;
}> {
  const { data, error } = await supabase.functions.invoke('agent-scheduler', {
    body: { schedule_id: scheduleId },
  });

  if (error) throw error;
  return data;
}

// =============================================================================
// Triggers
// =============================================================================

export async function getTriggers(orgId: string): Promise<AgentTrigger[]> {
  const { data, error } = await supabase
    .from('agent_triggers')
    .select(TRIGGER_COLS)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createTrigger(
  data: Pick<AgentTrigger, 'organization_id' | 'agent_name' | 'trigger_event' | 'prompt_template'>
): Promise<AgentTrigger> {
  const { data: result, error } = await supabase
    .from('agent_triggers')
    .insert({
      organization_id: data.organization_id,
      agent_name: data.agent_name,
      trigger_event: data.trigger_event,
      prompt_template: data.prompt_template,
    })
    .select(TRIGGER_COLS)
    .single();

  if (error) throw error;
  return result;
}

export async function updateTrigger(
  id: string,
  updates: Partial<Pick<AgentTrigger, 'agent_name' | 'trigger_event' | 'prompt_template' | 'is_active'>>
): Promise<AgentTrigger> {
  const { data, error } = await supabase
    .from('agent_triggers')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(TRIGGER_COLS)
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

/**
 * Manually test a trigger by running it via the agent-trigger edge function.
 * Uses JWT auth (auto-injected by supabase.functions.invoke).
 */
export async function testTrigger(
  triggerId: string,
  orgId: string,
  userId: string,
  testPayload?: Record<string, unknown>
): Promise<{
  success: boolean;
  results: TriggerTestResult[];
  error?: string;
}> {
  const { data, error } = await supabase.functions.invoke('agent-trigger', {
    body: {
      trigger_id: triggerId,
      organization_id: orgId,
      user_id: userId,
      payload: testPayload || { _test: true, triggered_at: new Date().toISOString() },
    },
  });

  if (error) throw error;
  return data;
}
