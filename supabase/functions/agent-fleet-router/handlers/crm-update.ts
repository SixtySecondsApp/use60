/**
 * Handler: crm_update
 * Extracted from supabase/functions/agent-crm-update/index.ts
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  handleCorsPreflightRequest,
  getCorsHeaders,
  errorResponse,
  jsonResponse,
} from '../../_shared/corsHelper.ts';
import { verifyCronSecret, isServiceRoleAuth } from '../../_shared/edgeAuth.ts';
import { classifyFields, type CrmClassifierConfig, type FieldChange } from '../../_shared/orchestrator/adapters/crmFieldClassifier.ts';
import { autoApplyFields, type ApplyContext, type AppliedChange } from '../../_shared/orchestrator/adapters/crmAutoApply.ts';
import { syncToHubSpot } from '../../_shared/orchestrator/adapters/crmHubSpotSync.ts';
import { notifySlackApproval } from '../../_shared/orchestrator/adapters/crmSlackNotify.ts';
import { crmFieldExtractorAdapter } from '../../_shared/orchestrator/adapters/crmFieldExtractor.ts';
import { writeToCommandCentre } from '../../_shared/commandCentre/writeAdapter.ts';
import type { SequenceState, SequenceStep } from '../../_shared/orchestrator/types.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface CrmUpdateRequest {
  meeting_id: string;
  deal_id: string;
  org_id: string;
  user_id: string;
  extracted_fields?: Array<{
    field_name: string;
    old_value: unknown;
    new_value: unknown;
    confidence: 'high' | 'medium' | 'low';
    reasoning: string;
  }>;
  config_override?: Partial<CrmClassifierConfig>;
}

interface PipelineResult {
  success: boolean;
  meeting_id: string;
  deal_id: string;
  extraction: { fields_count: number; no_change_reason?: string };
  classification: { auto_apply: number; require_approval: number; skipped: number };
  auto_apply: { applied: number; errors: string[] };
  hubspot_sync: { synced: boolean; error?: string };
  slack_notify: { sent: boolean; error?: string };
  duration_ms: number;
}

function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function loadAgentConfig(supabase: ReturnType<typeof createClient>, orgId: string): Promise<CrmClassifierConfig> {
  const defaults: CrmClassifierConfig = {
    auto_approve_fields: ['notes', 'next_steps', 'activity_log', 'stakeholders', 'blockers'],
    approval_required_fields: ['stage', 'close_date', 'deal_value'],
    confidence_minimum: 'medium',
  };
  try {
    const { data: configRows } = await supabase.from('agent_config_defaults').select('config_key, config_value').eq('agent_type', 'crm_update');
    if (configRows?.length) {
      for (const row of configRows) {
        if (row.config_key === 'auto_approve_fields' && Array.isArray(row.config_value)) defaults.auto_approve_fields = row.config_value;
        else if (row.config_key === 'approval_required_fields' && Array.isArray(row.config_value)) defaults.approval_required_fields = row.config_value;
        else if (row.config_key === 'confidence_minimum' && typeof row.config_value === 'string') defaults.confidence_minimum = row.config_value as 'low' | 'medium' | 'high';
      }
    }
    const { data: orgOverrides } = await supabase.from('agent_config_overrides').select('config_key, config_value').eq('agent_type', 'crm_update').eq('org_id', orgId);
    if (orgOverrides?.length) {
      for (const row of orgOverrides) {
        if (row.config_key === 'auto_approve_fields' && Array.isArray(row.config_value)) defaults.auto_approve_fields = row.config_value;
        else if (row.config_key === 'approval_required_fields' && Array.isArray(row.config_value)) defaults.approval_required_fields = row.config_value;
        else if (row.config_key === 'confidence_minimum' && typeof row.config_value === 'string') defaults.confidence_minimum = row.config_value as 'low' | 'medium' | 'high';
      }
    }
  } catch (err) { console.warn('[agent-crm-update] Failed to load agent config, using defaults:', err); }
  return defaults;
}

async function loadHubSpotConfig(supabase: ReturnType<typeof createClient>, orgId: string): Promise<{ hubspot_sync_enabled: boolean }> {
  try {
    const { data } = await supabase.from('agent_config_defaults').select('config_value').eq('agent_type', 'crm_update').eq('config_key', 'hubspot_sync_enabled').maybeSingle();
    const enabled = data?.config_value === true || data?.config_value === 'true';
    const { data: override } = await supabase.from('agent_config_overrides').select('config_value').eq('agent_type', 'crm_update').eq('config_key', 'hubspot_sync_enabled').eq('org_id', orgId).maybeSingle();
    if (override) return { hubspot_sync_enabled: override.config_value === true || override.config_value === 'true' };
    return { hubspot_sync_enabled: enabled };
  } catch { return { hubspot_sync_enabled: false }; }
}

function buildExtractorState(supabase: ReturnType<typeof createClient>, request: CrmUpdateRequest, deal: Record<string, unknown>, transcript: string): SequenceState {
  return {
    event: { type: 'meeting_ended', source: 'manual', org_id: request.org_id, user_id: request.user_id, payload: { meeting_id: request.meeting_id } },
    context: {
      tier1: { org: { id: request.org_id, name: '' }, user: { id: request.user_id, email: '', name: '' }, features: {}, costBudget: { allowed: true } },
      tier2: {
        deal: { id: request.deal_id, name: (deal.title as string) || (deal.name as string) || 'Unknown Deal', stage: deal.stage_name as string | undefined, value: deal.value as number | undefined, expected_close_date: deal.expected_close_date as string | undefined },
        meetingHistory: transcript ? [{ id: request.meeting_id, title: '', scheduled_at: '', transcript }] : [],
      },
    },
    steps_completed: [], outputs: {}, pending_approvals: [], queued_followups: [], started_at: new Date().toISOString(), updated_at: new Date().toISOString(), agentConfig: null,
  };
}

async function queueApprovalItems(supabase: ReturnType<typeof createClient>, request: CrmUpdateRequest, fields: FieldChange[]) {
  if (fields.length === 0) return [];
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const items = fields.map((f) => ({
    org_id: request.org_id, user_id: request.user_id, deal_id: request.deal_id, meeting_id: request.meeting_id,
    field_name: f.field_name, current_value: f.current_value !== null && f.current_value !== undefined ? JSON.parse(JSON.stringify(f.current_value)) : null,
    proposed_value: JSON.parse(JSON.stringify(f.proposed_value)), confidence: f.confidence, reason: f.reason, status: 'pending', expires_at: expiresAt, created_at: new Date().toISOString(),
  }));
  const { data, error } = await supabase.from('crm_approval_queue').insert(items).select('id, field_name, current_value, proposed_value, confidence, reason');
  if (error) { console.error('[agent-crm-update] Failed to insert approval queue entries:', error.message); return []; }
  return data ?? [];
}

async function runCrmUpdatePipeline(request: CrmUpdateRequest): Promise<PipelineResult> {
  const start = Date.now();
  const supabase = getServiceClient();
  const result: PipelineResult = { success: false, meeting_id: request.meeting_id, deal_id: request.deal_id, extraction: { fields_count: 0 }, classification: { auto_apply: 0, require_approval: 0, skipped: 0 }, auto_apply: { applied: 0, errors: [] }, hubspot_sync: { synced: false }, slack_notify: { sent: false }, duration_ms: 0 };
  try {
    const { data: deal, error: dealError } = await supabase.from('deals').select('id, title, name, value, expected_close_date, stage_id, org_id, owner_id').eq('id', request.deal_id).maybeSingle();
    if (dealError || !deal) { result.auto_apply.errors.push(`Deal not found: ${request.deal_id}`); result.duration_ms = Date.now() - start; return result; }
    let extractedFields = request.extracted_fields;
    if (!extractedFields) {
      const { data: meeting } = await supabase.from('meetings').select('transcript_text, title').eq('id', request.meeting_id).maybeSingle();
      const transcript = meeting?.transcript_text || '';
      if (!transcript) { result.extraction.no_change_reason = 'No transcript available'; result.success = true; result.duration_ms = Date.now() - start; return result; }
      const extractorState = buildExtractorState(supabase, request, deal, transcript);
      const dummyStep: SequenceStep = { skill: 'extract-crm-fields', requires_context: ['tier1', 'tier2'], requires_approval: false, criticality: 'best-effort', available: true };
      const extractionResult = await crmFieldExtractorAdapter.execute(extractorState, dummyStep);
      if (!extractionResult.success) { result.extraction.no_change_reason = extractionResult.error; result.duration_ms = Date.now() - start; return result; }
      const output = extractionResult.output as { fields_changed?: unknown[]; no_change_reason?: string };
      extractedFields = (output?.fields_changed ?? []) as CrmUpdateRequest['extracted_fields'];
      result.extraction.no_change_reason = output?.no_change_reason;
    }
    result.extraction.fields_count = extractedFields?.length ?? 0;
    if (!extractedFields?.length) { result.success = true; result.duration_ms = Date.now() - start; return result; }
    const agentConfig = request.config_override ? { ...await loadAgentConfig(supabase, request.org_id), ...request.config_override } : await loadAgentConfig(supabase, request.org_id);
    const classified = classifyFields(extractedFields as any[], agentConfig);
    result.classification = { auto_apply: classified.autoApply.length, require_approval: classified.requireApproval.length, skipped: classified.skipLowConfidence.length };
    const applyContext: ApplyContext = { org_id: request.org_id, user_id: request.user_id, deal_id: request.deal_id, meeting_id: request.meeting_id };
    const applyResult = await autoApplyFields(supabase, applyContext, classified.autoApply);
    result.auto_apply = { applied: applyResult.applied.length, errors: applyResult.errors };
    const queuedItems = await queueApprovalItems(supabase, request, classified.requireApproval);
    const hubspotConfig = await loadHubSpotConfig(supabase, request.org_id);
    const syncResult = await syncToHubSpot(supabase, request.org_id, request.deal_id, applyResult.applied, hubspotConfig);
    result.hubspot_sync = { synced: syncResult.synced, error: syncResult.error };
    if (applyResult.applied.length > 0 || queuedItems.length > 0) {
      const autoAppliedForSlack = applyResult.applied.map((a: AppliedChange) => ({ field_name: a.field_name, new_value: a.applied_value, confidence: a.confidence }));
      const pendingForSlack = queuedItems.map((q) => ({ id: q.id, field_name: q.field_name, old_value: q.current_value, new_value: q.proposed_value, confidence: q.confidence, reasoning: q.reason || '' }));
      const skippedForSlack = classified.skipLowConfidence.map((s) => ({ field_name: s.field_name, reasoning: s.reason || '' }));
      const slackResult = await notifySlackApproval(supabase, applyContext, autoAppliedForSlack, pendingForSlack, skippedForSlack);
      result.slack_notify = { sent: slackResult.sent, error: slackResult.error };
    }
    try {
      const parts: string[] = [];
      if (applyResult.applied.length > 0) parts.push(`Auto-applied: ${applyResult.applied.map((a) => a.field_name).join(', ')}`);
      if (queuedItems.length > 0) parts.push(`Awaiting approval: ${queuedItems.map((q) => q.field_name).join(', ')}`);
      await writeToCommandCentre({ org_id: request.org_id, user_id: request.user_id, source_agent: 'crm_update', item_type: 'crm_update', title: `CRM updated after meeting — ${applyResult.applied.length} applied, ${queuedItems.length} pending`, summary: parts.join('. ') || 'No changes applied', context: { meeting_id: request.meeting_id, deal_id: request.deal_id, auto_applied: applyResult.applied.map((a) => a.field_name), pending_approval: queuedItems.map((q) => q.field_name), skipped: classified.skipLowConfidence.map((s) => s.field_name) }, deal_id: request.deal_id, urgency: queuedItems.length > 0 ? 'normal' : 'low' });
    } catch (ccErr) { console.error('[agent-crm-update] CC write failed:', ccErr); }
    result.success = true; result.duration_ms = Date.now() - start; return result;
  } catch (err) { result.auto_apply.errors.push(err instanceof Error ? err.message : String(err)); result.duration_ms = Date.now() - start; return result; }
}

export async function handleCrmUpdate(req: Request): Promise<Response> {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;
  const corsHeaders = getCorsHeaders(req);
  if (req.method !== 'POST') return errorResponse('Method not allowed', req, 405);
  try {
    const cronSecret = Deno.env.get('CRON_SECRET');
    const authHeader = req.headers.get('Authorization');
    if (!verifyCronSecret(req, cronSecret) && !isServiceRoleAuth(authHeader, SUPABASE_SERVICE_ROLE_KEY)) return errorResponse('Unauthorized', req, 401);
    const body = await req.json();
    const { meeting_id, deal_id, org_id, user_id } = body;
    if (!meeting_id || !deal_id || !org_id || !user_id) return new Response(JSON.stringify({ error: 'Missing required fields: meeting_id, deal_id, org_id, user_id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const request: CrmUpdateRequest = { meeting_id, deal_id, org_id, user_id, extracted_fields: body.extracted_fields, config_override: body.config_override };
    const result = await runCrmUpdatePipeline(request);
    return new Response(JSON.stringify(result), { status: result.success ? 200 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) { return errorResponse(error instanceof Error ? error.message : 'Internal server error', req, 500); }
}
