/**
 * CRM Field Classifier
 *
 * Pure classification function — no database calls, no side effects.
 * Accepts extracted CRM field changes and routes each one to the correct
 * processing bucket based on agent config.
 *
 * Classification buckets:
 *   autoApply        — write immediately, no approval needed
 *   requireApproval  — queue for HITL approval (crm_approval_queue)
 *   skipLowConfidence — discard; confidence is below minimum threshold
 *
 * Confidence ordering (ascending): low < medium < high
 */

// =============================================================================
// Types
// =============================================================================

/**
 * A single proposed CRM field change, as produced by crmFieldExtractor.
 * The classifier normalises the extractor's old_value/new_value/reasoning
 * naming to current_value/proposed_value/reason for downstream consumers.
 */
export interface FieldChange {
  field_name: string;
  /** Value of the field before the meeting (may be null if field was empty) */
  current_value: unknown;
  /** AI-proposed new value after the meeting */
  proposed_value: unknown;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

/**
 * Input accepted from crmFieldExtractor (uses old_value / new_value / reasoning).
 * The classifier accepts this format and normalises it internally.
 */
export interface DealFieldChangeLike {
  field_name: string;
  old_value?: unknown;
  new_value?: unknown;
  /** Extractor uses reasoning; classifier re-exports as reason */
  reasoning?: string;
  confidence: 'high' | 'medium' | 'low';
  // Allow FieldChange shape too (current_value / proposed_value / reason)
  current_value?: unknown;
  proposed_value?: unknown;
  reason?: string;
}

export interface ClassifiedFields {
  /** Write immediately — high-confidence, explicitly approved field list */
  autoApply: FieldChange[];
  /** Queue for HITL approval — below confidence minimum OR on approval_required list */
  requireApproval: FieldChange[];
  /** Discard — confidence is below the configured minimum threshold */
  skipLowConfidence: FieldChange[];
}

/**
 * Agent config keys consumed by classifyFields.
 * Mirrors the values seeded in 20260222300002_crm_update_agent_config.sql.
 */
export interface CrmClassifierConfig {
  /** Field names that may be applied without approval, e.g. ["notes","next_steps"] */
  auto_approve_fields: string[];
  /** Field names that always require HITL approval, e.g. ["stage","close_date"] */
  approval_required_fields: string[];
  /**
   * Minimum confidence level for any action.
   * Fields below this go to skipLowConfidence.
   */
  confidence_minimum: 'low' | 'medium' | 'high';
}

// =============================================================================
// Constants
// =============================================================================

/** Numeric weights for confidence comparison (ascending) */
const CONFIDENCE_RANK: Record<'low' | 'medium' | 'high', number> = {
  low: 0,
  medium: 1,
  high: 2,
};

// =============================================================================
// Imports for SkillAdapter wrapper
// =============================================================================

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { getServiceClient } from './contextEnrichment.ts';
import { getAgentConfig } from '../../config/agentConfigEngine.ts';

// =============================================================================
// Public API
// =============================================================================

/**
 * Classify extracted CRM field changes into three routing buckets.
 *
 * @param extractedFields  Raw field changes from crmFieldExtractor (DealFieldChange[])
 *                         or already-normalised FieldChange[]. Both shapes are accepted.
 * @param agentConfig      Resolved agent config for this org (crm_update agent type).
 * @returns                Three classified buckets ready for downstream processing.
 */
export function classifyFields(
  extractedFields: DealFieldChangeLike[],
  agentConfig: CrmClassifierConfig,
): ClassifiedFields {
  const result: ClassifiedFields = {
    autoApply: [],
    requireApproval: [],
    skipLowConfidence: [],
  };

  const minimumRank = CONFIDENCE_RANK[agentConfig.confidence_minimum];

  for (const raw of extractedFields) {
    const change = normalise(raw);
    const fieldRank = CONFIDENCE_RANK[change.confidence];

    // 1. Drop anything below the configured minimum confidence
    if (fieldRank < minimumRank) {
      result.skipLowConfidence.push(change);
      continue;
    }

    // 2. Approval-required list always forces HITL regardless of confidence
    if (agentConfig.approval_required_fields.includes(change.field_name)) {
      result.requireApproval.push(change);
      continue;
    }

    // 3. Explicitly approved field — write immediately
    if (agentConfig.auto_approve_fields.includes(change.field_name)) {
      result.autoApply.push(change);
      continue;
    }

    // 4. Default: route to approval queue (safe default for unknown fields)
    result.requireApproval.push(change);
  }

  return result;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Normalise a DealFieldChangeLike into the canonical FieldChange shape.
 * Supports both the extractor format (old_value/new_value/reasoning)
 * and the already-normalised format (current_value/proposed_value/reason).
 */
function normalise(raw: DealFieldChangeLike): FieldChange {
  return {
    field_name: raw.field_name,
    current_value: raw.current_value !== undefined ? raw.current_value : raw.old_value,
    proposed_value: raw.proposed_value !== undefined ? raw.proposed_value : raw.new_value,
    confidence: raw.confidence,
    reason: raw.reason ?? raw.reasoning ?? '',
  };
}

// =============================================================================
// SkillAdapter wrapper — used by the fleet runner registry
// =============================================================================

/**
 * Fleet runner adapter for the 'classify-crm-fields' sequence step.
 *
 * Reads extracted fields from the upstream 'extract-crm-fields' step output,
 * loads agent config (auto_approve_fields, approval_required_fields,
 * confidence_minimum), and runs classifyFields().
 *
 * Output shape:
 *   { autoApply: FieldChange[], requireApproval: FieldChange[], skipLowConfidence: FieldChange[] }
 */
export const crmFieldClassifierAdapter: SkillAdapter = {
  name: 'classify-crm-fields',

  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();

    try {
      const extractionOutput = state.outputs['extract-crm-fields'] as
        | { fields_changed?: DealFieldChangeLike[] }
        | undefined;

      const fieldsChanged: DealFieldChangeLike[] = extractionOutput?.fields_changed ?? [];

      if (fieldsChanged.length === 0) {
        return {
          success: true,
          output: { autoApply: [], requireApproval: [], skipLowConfidence: [], skipped: true },
          duration_ms: Date.now() - start,
        };
      }

      // Load agent config for crm_update
      const supabase = getServiceClient();
      let config: CrmClassifierConfig = {
        auto_approve_fields: ['notes', 'next_steps', 'activity_log', 'stakeholders', 'blockers'],
        approval_required_fields: ['stage', 'close_date', 'deal_value'],
        confidence_minimum: 'medium',
      };

      try {
        const agentCfg = await getAgentConfig(
          supabase,
          state.event.org_id,
          state.event.user_id ?? null,
          'crm_update' as any,
        );
        const entries = agentCfg?.entries ?? {};

        const autoApproveEntry = entries['auto_approve_fields'];
        const approvalRequiredEntry = entries['approval_required_fields'];
        const confidenceEntry = entries['confidence_minimum'];

        if (Array.isArray(autoApproveEntry?.config_value)) {
          config.auto_approve_fields = autoApproveEntry.config_value as string[];
        }
        if (Array.isArray(approvalRequiredEntry?.config_value)) {
          config.approval_required_fields = approvalRequiredEntry.config_value as string[];
        }
        if (
          typeof confidenceEntry?.config_value === 'string' &&
          ['low', 'medium', 'high'].includes(confidenceEntry.config_value)
        ) {
          config.confidence_minimum = confidenceEntry.config_value as 'low' | 'medium' | 'high';
        }
      } catch (cfgErr) {
        console.warn('[classify-crm-fields] Config load failed, using defaults:', cfgErr);
      }

      const classified = classifyFields(fieldsChanged, config);

      console.log(
        `[classify-crm-fields] autoApply=${classified.autoApply.length}, ` +
        `requireApproval=${classified.requireApproval.length}, ` +
        `skip=${classified.skipLowConfidence.length}`,
      );

      return {
        success: true,
        output: classified,
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      console.error('[classify-crm-fields] Error:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - start,
      };
    }
  },
};
