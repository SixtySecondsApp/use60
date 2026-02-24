/**
 * CRM Update Pipeline — SkillAdapter Wrappers (CRM-009)
 *
 * Wraps the utility functions from the CRM update pipeline into SkillAdapter
 * objects that can be registered in the adapter registry and executed by the
 * fleet runner.
 *
 * Pipeline steps (in order within the crm_update sequence):
 *   1. extract-crm-fields      (already registered — crmFieldExtractorAdapter)
 *   2. classify-crm-fields     → classifyFieldsAdapter
 *   3. auto-apply-crm-fields   → autoApplyCrmAdapter
 *   4. sync-crm-to-hubspot     → syncCrmToHubSpotAdapter
 *   5. notify-crm-slack        → notifyCrmSlackAdapter
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { classifyFields, type CrmClassifierConfig, type FieldChange } from './crmFieldClassifier.ts';
import { autoApplyFields, type AppliedChange } from './crmAutoApply.ts';
import { syncToHubSpot } from './crmHubSpotSync.ts';
import { notifySlackApproval } from './crmSlackNotify.ts';

// =============================================================================
// Helpers
// =============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Extract a typed value from the state's agentConfig map.
 * Falls back to `defaultValue` if the key is missing or null.
 */
function getConfigValue<T>(
  agentConfig: SequenceState['agentConfig'],
  key: string,
  defaultValue: T
): T {
  if (!agentConfig || !(key in agentConfig)) return defaultValue;
  const entry = agentConfig[key];
  if (entry?.config_value === null || entry?.config_value === undefined) return defaultValue;
  return entry.config_value as T;
}

/**
 * Build the CrmClassifierConfig from state.agentConfig.
 * Falls back to sensible defaults if config is unavailable.
 */
function buildClassifierConfig(agentConfig: SequenceState['agentConfig']): CrmClassifierConfig {
  return {
    auto_approve_fields: getConfigValue<string[]>(
      agentConfig,
      'auto_approve_fields',
      ['notes', 'next_steps']
    ),
    approval_required_fields: getConfigValue<string[]>(
      agentConfig,
      'approval_required_fields',
      ['stage', 'close_date', 'deal_value']
    ),
    confidence_minimum: getConfigValue<'low' | 'medium' | 'high'>(
      agentConfig,
      'confidence_minimum',
      'medium'
    ),
  };
}

// =============================================================================
// Step 2: classify-crm-fields
// =============================================================================

/**
 * Reads raw field changes from `extract-crm-fields` output, classifies them
 * into three buckets (autoApply / requireApproval / skipLowConfidence), and
 * stores the result in state.outputs['classify-crm-fields'] for downstream
 * steps.
 *
 * This step is pure (no I/O); it uses agentConfig from the runner.
 */
export const classifyFieldsAdapter: SkillAdapter = {
  name: 'classify-crm-fields',

  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();

    try {
      // Pull extraction output from upstream step
      const extractionOutput = state.outputs['extract-crm-fields'] as
        | { fields_changed?: unknown[] }
        | undefined;

      const rawFields = extractionOutput?.fields_changed || [];

      if (rawFields.length === 0) {
        console.log('[classify-crm-fields] No fields to classify');
        return {
          success: true,
          output: {
            autoApply: [],
            requireApproval: [],
            skipLowConfidence: [],
            skipped: true,
            reason: 'No extracted fields',
          },
          duration_ms: Date.now() - start,
        };
      }

      const classifierConfig = buildClassifierConfig(state.agentConfig);
      const classified = classifyFields(rawFields as any[], classifierConfig);

      console.log(
        `[classify-crm-fields] Classified ${rawFields.length} fields — ` +
        `autoApply=${classified.autoApply.length}, ` +
        `requireApproval=${classified.requireApproval.length}, ` +
        `skip=${classified.skipLowConfidence.length}`
      );

      return {
        success: true,
        output: classified,
        duration_ms: Date.now() - start,
      };
    } catch (error) {
      console.error('[classify-crm-fields] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: Date.now() - start,
      };
    }
  },
};

// =============================================================================
// Step 3: auto-apply-crm-fields
// =============================================================================

/**
 * Reads autoApply fields from classify-crm-fields output and writes them
 * directly to the deals table. Returns the list of applied changes for
 * downstream HubSpot sync and Slack notification.
 */
export const autoApplyCrmAdapter: SkillAdapter = {
  name: 'auto-apply-crm-fields',

  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();

    try {
      const classifiedOutput = state.outputs['classify-crm-fields'] as
        | { autoApply?: FieldChange[] }
        | undefined;

      const autoApplyFields_list = classifiedOutput?.autoApply || [];

      const dealId = (state.context.tier2 as any)?.deal?.id as string | undefined;
      const meetingId = state.event.payload?.meeting_id as string | undefined;

      if (!dealId) {
        console.log('[auto-apply-crm-fields] No deal in context, skipping');
        return {
          success: true,
          output: { applied: [], errors: [], skipped: true, reason: 'No deal in context' },
          duration_ms: Date.now() - start,
        };
      }

      if (autoApplyFields_list.length === 0) {
        console.log('[auto-apply-crm-fields] No auto-apply fields, skipping');
        return {
          success: true,
          output: { applied: [], errors: [], skipped: true, reason: 'No auto-apply fields' },
          duration_ms: Date.now() - start,
        };
      }

      const supabase = getServiceClient();
      const result = await autoApplyFields(
        supabase,
        {
          org_id: state.event.org_id,
          user_id: state.event.user_id,
          deal_id: dealId,
          meeting_id: meetingId || '',
        },
        autoApplyFields_list
      );

      console.log(
        `[auto-apply-crm-fields] Applied ${result.applied.length} field(s), ` +
        `${result.errors.length} error(s)`
      );

      return {
        success: true,
        output: result,
        duration_ms: Date.now() - start,
      };
    } catch (error) {
      console.error('[auto-apply-crm-fields] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: Date.now() - start,
      };
    }
  },
};

// =============================================================================
// Step 4: sync-crm-to-hubspot
// =============================================================================

/**
 * Syncs auto-applied CRM field changes to HubSpot if the integration is
 * enabled in agent config. Reads the applied changes from auto-apply-crm-fields
 * output.
 */
export const syncCrmToHubSpotAdapter: SkillAdapter = {
  name: 'sync-crm-to-hubspot',

  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();

    try {
      const autoApplyOutput = state.outputs['auto-apply-crm-fields'] as
        | { applied?: AppliedChange[] }
        | undefined;

      const applied = autoApplyOutput?.applied || [];

      const dealId = (state.context.tier2 as any)?.deal?.id as string | undefined;

      if (!dealId || applied.length === 0) {
        console.log('[sync-crm-to-hubspot] Nothing to sync');
        return {
          success: true,
          output: { synced: false, reason: !dealId ? 'No deal' : 'No applied changes' },
          duration_ms: Date.now() - start,
        };
      }

      const hubspotSyncEnabled = getConfigValue<boolean>(
        state.agentConfig,
        'hubspot_sync_enabled',
        false
      );

      const supabase = getServiceClient();
      const result = await syncToHubSpot(
        supabase,
        state.event.org_id,
        dealId,
        applied,
        { hubspot_sync_enabled: hubspotSyncEnabled }
      );

      console.log(
        `[sync-crm-to-hubspot] synced=${result.synced}` +
        (result.error ? `, error=${result.error}` : '')
      );

      return {
        success: true,
        output: result,
        duration_ms: Date.now() - start,
      };
    } catch (error) {
      console.error('[sync-crm-to-hubspot] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: Date.now() - start,
      };
    }
  },
};

// =============================================================================
// Step 5: notify-crm-slack
// =============================================================================

/**
 * Sends the HITL approval message to the rep via Slack DM.
 * Reads auto-applied and pending-approval fields from upstream outputs.
 */
export const notifyCrmSlackAdapter: SkillAdapter = {
  name: 'notify-crm-slack',

  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();

    try {
      // Gather upstream outputs
      const classifiedOutput = state.outputs['classify-crm-fields'] as
        | { autoApply?: any[]; requireApproval?: any[]; skipLowConfidence?: any[] }
        | undefined;

      const autoApplyOutput = state.outputs['auto-apply-crm-fields'] as
        | { applied?: AppliedChange[] }
        | undefined;

      const autoApplied = autoApplyOutput?.applied || [];
      const pendingApprovals = classifiedOutput?.requireApproval || [];
      const skippedFields = classifiedOutput?.skipLowConfidence || [];

      if (autoApplied.length === 0 && pendingApprovals.length === 0) {
        console.log('[notify-crm-slack] Nothing to notify about');
        return {
          success: true,
          output: { sent: false, reason: 'No changes to report' },
          duration_ms: Date.now() - start,
        };
      }

      const deal = (state.context.tier2 as any)?.deal;
      const meetingId = state.event.payload?.meeting_id as string | undefined;

      if (!deal?.id) {
        console.log('[notify-crm-slack] No deal in context, skipping notification');
        return {
          success: true,
          output: { sent: false, reason: 'No deal in context' },
          duration_ms: Date.now() - start,
        };
      }

      // Map autoApplied to the shape expected by buildCRMApprovalMessage
      const autoAppliedMapped = autoApplied.map((c: AppliedChange) => ({
        field_name: c.field_name,
        new_value: c.applied_value ?? (c as any).new_value,
        confidence: (c as any).confidence || 'high',
      }));

      // Map pending approvals to queue entries shape
      // Note: actual queue IDs are stored in crm_approval_queue; here we use
      // the field_name as placeholder since notifySlackApproval queries the queue
      // for the message_ts update. The pendingApprovals list may already have
      // queue IDs if crmAutoApply wrote them.
      const pendingMapped = pendingApprovals.map((p: any) => ({
        id: p.queue_id || p.id || crypto.randomUUID(),
        field_name: p.field_name,
        old_value: p.current_value ?? p.old_value ?? null,
        new_value: p.proposed_value ?? p.new_value,
        confidence: p.confidence || 'medium',
        reasoning: p.reason || p.reasoning || '',
      }));

      const skippedMapped = skippedFields.map((s: any) => ({
        field_name: s.field_name,
        reasoning: s.reason || s.reasoning || '',
      }));

      const supabase = getServiceClient();
      const result = await notifySlackApproval(
        supabase,
        {
          org_id: state.event.org_id,
          user_id: state.event.user_id,
          deal_id: deal.id,
          meeting_id: meetingId || '',
        },
        autoAppliedMapped,
        pendingMapped,
        skippedMapped
      );

      console.log(
        `[notify-crm-slack] sent=${result.sent}` +
        (result.message_ts ? `, ts=${result.message_ts}` : '') +
        (result.error ? `, error=${result.error}` : '')
      );

      return {
        success: true,
        output: result,
        duration_ms: Date.now() - start,
      };
    } catch (error) {
      console.error('[notify-crm-slack] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: Date.now() - start,
      };
    }
  },
};
