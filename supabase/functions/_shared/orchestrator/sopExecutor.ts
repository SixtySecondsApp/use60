/**
 * SOP Executor
 * PRD-12: SOP-007
 *
 * Evaluates custom_sops triggers against incoming events and converts
 * matching SOPs into SequenceStep arrays for fleet execution.
 *
 * Key responsibilities:
 * - Load active SOPs for the org (with 5-min cache)
 * - Evaluate trigger conditions for a given event
 * - Convert sop_steps to SequenceStep format
 * - Respect requires_approval flag (map to HITL approval step)
 * - Log execution to workflow_executions with sop_id reference
 * - Track credit usage per execution
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import type { SequenceStep } from './types.ts';

// =============================================================================
// Types
// =============================================================================

export type TriggerType =
  | 'transcript_phrase'
  | 'crm_field_change'
  | 'email_pattern'
  | 'time_based'
  | 'manual';

export type StepActionType =
  | 'crm_action'
  | 'draft_email'
  | 'alert_rep'
  | 'alert_manager'
  | 'enrich_contact'
  | 'create_task'
  | 'custom';

export interface SOPRecord {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  trigger_type: TriggerType;
  trigger_config: Record<string, unknown>;
  is_active: boolean;
  is_platform_default: boolean;
  credit_cost_estimate: number;
}

export interface SOPStepRecord {
  id: string;
  sop_id: string;
  step_order: number;
  action_type: StepActionType;
  action_config: Record<string, unknown>;
  requires_approval: boolean;
}

export interface EventPayload {
  event_type: 'meeting_ended' | 'crm_field_changed' | 'email_received' | 'time_trigger' | string;
  org_id: string;
  user_id?: string;
  // meeting_ended
  meeting_id?: string;
  transcript_text?: string;
  // crm_field_changed
  object_type?: string;
  field_name?: string;
  old_value?: unknown;
  new_value?: unknown;
  // email_received
  email_subject?: string;
  email_body?: string;
  sender?: string;
  recipient?: string;
  // time_trigger
  trigger_key?: string;
  [key: string]: unknown;
}

export interface SOPMatchResult {
  sop: SOPRecord;
  steps: SequenceStep[];
  credit_estimate: number;
}

// =============================================================================
// Cache
// =============================================================================

interface CacheEntry<T> {
  data: T;
  expires: number;
}

const SOP_CACHE_TTL = 5 * 60 * 1000;
const sopCache = new Map<string, CacheEntry<SOPRecord[]>>();
const stepCache = new Map<string, CacheEntry<SOPStepRecord[]>>();

async function loadActiveSOPs(
  supabase: SupabaseClient,
  orgId: string,
): Promise<SOPRecord[]> {
  const now = Date.now();
  const cacheKey = `sops:${orgId}`;
  const cached = sopCache.get(cacheKey);
  if (cached && cached.expires > now) return cached.data;

  const { data, error } = await supabase
    .from('custom_sops')
    .select('id, org_id, name, description, trigger_type, trigger_config, is_active, is_platform_default, credit_cost_estimate')
    .eq('is_active', true)
    .or(`org_id.eq.${orgId},is_platform_default.eq.true`);

  if (error) {
    console.warn('[sopExecutor] Failed to load SOPs:', error.message);
    return [];
  }

  const sops = (data ?? []) as SOPRecord[];
  sopCache.set(cacheKey, { data: sops, expires: now + SOP_CACHE_TTL });
  return sops;
}

async function loadStepsForSOP(
  supabase: SupabaseClient,
  sopId: string,
): Promise<SOPStepRecord[]> {
  const now = Date.now();
  const cacheKey = `steps:${sopId}`;
  const cached = stepCache.get(cacheKey);
  if (cached && cached.expires > now) return cached.data;

  const { data, error } = await supabase
    .from('sop_steps')
    .select('id, sop_id, step_order, action_type, action_config, requires_approval')
    .eq('sop_id', sopId)
    .order('step_order');

  if (error) {
    console.warn(`[sopExecutor] Failed to load steps for SOP ${sopId}:`, error.message);
    return [];
  }

  const steps = (data ?? []) as SOPStepRecord[];
  stepCache.set(cacheKey, { data: steps, expires: now + SOP_CACHE_TTL });
  return steps;
}

export function invalidateSOPCache(orgId?: string): void {
  if (orgId) {
    sopCache.delete(`sops:${orgId}`);
  } else {
    sopCache.clear();
    stepCache.clear();
  }
}

// =============================================================================
// Trigger evaluation
// =============================================================================

function evaluateTranscriptPhrase(
  config: Record<string, unknown>,
  event: EventPayload,
): boolean {
  const transcript = event.transcript_text;
  if (!transcript) return false;

  const phrases = (config.phrases as string[]) ?? [];
  if (phrases.length === 0) return false;

  const caseSensitive = (config.case_sensitive as boolean) ?? false;
  const matchMode = (config.match_mode as string) ?? 'any';
  const useRegex = (config.use_regex as boolean) ?? false;
  const text = caseSensitive ? transcript : transcript.toLowerCase();

  const matched = phrases.filter((phrase) => {
    if (useRegex) {
      try {
        const re = new RegExp(phrase, caseSensitive ? '' : 'i');
        return re.test(transcript);
      } catch {
        return false;
      }
    }
    const p = caseSensitive ? phrase : phrase.toLowerCase();
    return text.includes(p);
  });

  if (matchMode === 'all') return matched.length === phrases.length;
  return matched.length > 0;
}

function evaluateCRMFieldChange(
  config: Record<string, unknown>,
  event: EventPayload,
): boolean {
  if (event.event_type !== 'crm_field_changed') return false;

  const configObj = config.crm_object as string | undefined;
  const configField = config.field_name as string | undefined;
  const condition = (config.condition as string) ?? 'any_change';

  // Check object and field match
  if (configObj && event.object_type !== configObj) return false;
  if (configField && event.field_name !== configField) return false;

  if (condition === 'any_change') return true;

  const conditionValue = config.condition_value as string | undefined;
  if (condition === 'changed_to') {
    return String(event.new_value) === conditionValue;
  }
  if (condition === 'changed_from') {
    return String(event.old_value) === conditionValue;
  }
  return false;
}

function evaluateEmailPattern(
  config: Record<string, unknown>,
  event: EventPayload,
): boolean {
  if (event.event_type !== 'email_received') return false;

  const keywords = ((config.keywords as string) ?? '')
    .split(',')
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
  if (keywords.length === 0) return true; // no keywords = always match

  const matchField = (config.match_field as string) ?? 'both';
  const texts: string[] = [];
  if (matchField !== 'body' && event.email_subject) texts.push(event.email_subject.toLowerCase());
  if (matchField !== 'subject' && event.email_body) texts.push(event.email_body.toLowerCase());
  const combined = texts.join(' ');

  const matched = keywords.some((kw) => combined.includes(kw));
  if (!matched) return false;

  // Optional sender/recipient filters
  const senderFilter = config.sender_filter as string | undefined;
  const recipientFilter = config.recipient_filter as string | undefined;

  if (senderFilter && event.sender) {
    if (!event.sender.toLowerCase().includes(senderFilter.toLowerCase())) return false;
  }
  if (recipientFilter && event.recipient) {
    if (!event.recipient.toLowerCase().includes(recipientFilter.toLowerCase())) return false;
  }

  return true;
}

function evaluateTimeBased(
  _config: Record<string, unknown>,
  event: EventPayload,
): boolean {
  // Time-based triggers are dispatched by the scheduler, not evaluated here.
  // When the scheduler fires a time_trigger event, we accept any matching SOP.
  return event.event_type === 'time_trigger';
}

export function evaluateTrigger(
  sop: SOPRecord,
  event: EventPayload,
): boolean {
  // Disabled check
  if (!sop.is_active) return false;

  const config = sop.trigger_config;

  switch (sop.trigger_type) {
    case 'transcript_phrase':
      return event.event_type === 'meeting_ended' && evaluateTranscriptPhrase(config, event);
    case 'crm_field_change':
      return evaluateCRMFieldChange(config, event);
    case 'email_pattern':
      return evaluateEmailPattern(config, event);
    case 'time_based':
      return evaluateTimeBased(config, event);
    case 'manual':
      return false; // manual SOPs are never auto-triggered
    default:
      return false;
  }
}

// =============================================================================
// Step conversion to SequenceStep
// =============================================================================

const STEP_CREDIT_COSTS: Record<StepActionType, number> = {
  crm_action: 0.5,
  draft_email: 1.0,
  alert_rep: 0.2,
  alert_manager: 0.2,
  enrich_contact: 2.0,
  create_task: 0.3,
  custom: 1.0,
};

/**
 * Map a sop_steps action_type to a fleet skill name.
 * The fleet runner will look up these skills from organization_skills.
 */
function actionTypeToSkillName(type: StepActionType): string {
  const MAP: Record<StepActionType, string> = {
    crm_action: 'update-crm-from-meeting',
    draft_email: 'draft-followup-email',
    alert_rep: 'notify-slack-summary',
    alert_manager: 'notify-slack-summary',
    enrich_contact: 'enrich-attendees',
    create_task: 'create-tasks-from-actions',
    custom: 'suggest-next-actions',
  };
  return MAP[type] ?? 'suggest-next-actions';
}

/**
 * Convert a SOPStepRecord into a SequenceStep that the fleet runner understands.
 * If requires_approval is true, requires_approval is set on the step so the
 * fleet runner creates a HITL approval gate before executing.
 */
function sopStepToSequenceStep(sopStep: SOPStepRecord, _sopId: string): SequenceStep {
  const skillName = actionTypeToSkillName(sopStep.action_type);

  return {
    skill: skillName,
    requires_context: ['tier1'],
    requires_approval: sopStep.requires_approval,
    criticality: 'best-effort',
    available: true,
  };
}

// =============================================================================
// Main entry point
// =============================================================================

/**
 * Evaluate all active SOPs for an org against an incoming event.
 * Returns array of matching SOPs with their converted SequenceSteps.
 */
export async function evaluateSOPsForEvent(
  supabase: SupabaseClient,
  orgId: string,
  event: EventPayload,
): Promise<SOPMatchResult[]> {
  const sops = await loadActiveSOPs(supabase, orgId);
  if (sops.length === 0) return [];

  const results: SOPMatchResult[] = [];

  for (const sop of sops) {
    if (!evaluateTrigger(sop, event)) continue;

    const rawSteps = await loadStepsForSOP(supabase, sop.id);
    if (rawSteps.length === 0) continue;

    const sequenceSteps = rawSteps.map((s) => sopStepToSequenceStep(s, sop.id));
    const creditEstimate = rawSteps.reduce(
      (sum, s) => sum + (STEP_CREDIT_COSTS[s.action_type] ?? 0),
      0,
    );

    results.push({ sop, steps: sequenceSteps, credit_estimate: creditEstimate });
  }

  return results;
}

/**
 * Log a SOP execution attempt to workflow_executions.
 * Returns the execution record ID.
 */
export async function logSOPExecution(
  supabase: SupabaseClient,
  params: {
    org_id: string;
    user_id: string | null;
    sop_id: string;
    sop_name: string;
    event_type: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    credit_estimate: number;
    context?: Record<string, unknown>;
  },
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('workflow_executions')
      .insert({
        org_id: params.org_id,
        user_id: params.user_id,
        workflow_name: params.sop_name,
        trigger_type: params.event_type,
        status: params.status,
        metadata: {
          sop_id: params.sop_id,
          credit_estimate: params.credit_estimate,
          ...params.context,
        },
      })
      .select('id')
      .single();

    if (error) {
      console.warn('[sopExecutor] Failed to log execution:', error.message);
      return null;
    }

    return data.id as string;
  } catch (err) {
    console.warn('[sopExecutor] Exception logging execution:', err);
    return null;
  }
}

/**
 * Update an existing workflow_executions record.
 */
export async function updateSOPExecution(
  supabase: SupabaseClient,
  executionId: string,
  updates: {
    status?: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    credits_used?: number;
    error_message?: string;
    completed_at?: string;
  },
): Promise<void> {
  try {
    const payload: Record<string, unknown> = {};
    if (updates.status) payload.status = updates.status;
    if (updates.error_message) payload.error_message = updates.error_message;
    if (updates.completed_at) payload.completed_at = updates.completed_at;
    if (updates.credits_used !== undefined) {
      payload.metadata = { credits_used: updates.credits_used };
    }

    await supabase
      .from('workflow_executions')
      .update(payload)
      .eq('id', executionId);
  } catch (err) {
    console.warn('[sopExecutor] Exception updating execution:', err);
  }
}
