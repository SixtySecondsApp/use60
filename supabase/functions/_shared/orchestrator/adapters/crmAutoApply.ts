/**
 * CRM Auto-Apply Engine
 *
 * Takes pre-classified `autoApply` field changes and writes them directly
 * to the deals table without human approval.
 *
 * This is called after crmFieldClassifier routes fields into buckets.
 * High-confidence fields on the auto_approve_fields list skip the
 * crm_approval_queue entirely and land here.
 *
 * Responsibilities:
 * 1. Fetch current deal record (using maybeSingle — deal may not exist)
 * 2. For each autoApply field: apply field-specific write logic
 *    - notes / stakeholders / blockers: APPEND to existing notes (no overwrite)
 *    - next_steps: APPEND new steps to existing
 *    - stage: resolve stage name → stage_id via deal_stages lookup
 *    - close_date / deal_value: direct column update with validation
 * 3. Write the deals table update in a single call
 * 4. Record each change in crm_field_updates with change_source='auto_apply'
 * 5. Insert one activity record summarising the batch
 * 6. Return applied changes for downstream notification
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import type { FieldChange, ClassifiedFields } from './crmFieldClassifier.ts';
import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { getServiceClient } from './contextEnrichment.ts';

// =============================================================================
// Types
// =============================================================================

export interface ApplyContext {
  org_id: string;
  user_id: string;
  deal_id: string;
  meeting_id: string;
}

export interface AppliedChange {
  field_name: string;
  previous_value: unknown;
  applied_value: unknown;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

export interface AutoApplyResult {
  applied: AppliedChange[];
  errors: string[];
}

// =============================================================================
// Field mapping
// =============================================================================

/** Maps logical field names to actual deals table columns */
const FIELD_TO_COLUMN: Record<string, string> = {
  stage: 'stage_id',       // resolved via deal_stages lookup
  next_steps: 'next_steps',
  close_date: 'expected_close_date',
  deal_value: 'value',
  notes: 'notes',
  stakeholders: 'notes',   // appended with section header
  blockers: 'notes',       // appended with section header
  activity_log: 'notes',   // appended with section header
  summary: 'notes',        // appended with section header
  meddic_score: 'notes',   // appended with section header
  budget_confirmed: 'notes',
};

/** Fields that should be appended inside notes rather than used as a direct column */
const APPEND_TO_NOTES: Set<string> = new Set([
  'notes',
  'stakeholders',
  'blockers',
  'activity_log',
  'summary',
  'meddic_score',
  'budget_confirmed',
]);

// =============================================================================
// Public API
// =============================================================================

/**
 * Auto-apply a list of pre-classified field changes to the deals table.
 *
 * @param supabase        Supabase client (service role for writes)
 * @param context         Org/user/deal/meeting identifiers
 * @param fieldsToApply   Fields classified as autoApply by crmFieldClassifier
 * @returns               Applied changes and any per-field errors
 */
export async function autoApplyFields(
  supabase: ReturnType<typeof createClient>,
  context: ApplyContext,
  fieldsToApply: FieldChange[],
): Promise<AutoApplyResult> {
  const applied: AppliedChange[] = [];
  const errors: string[] = [];

  if (fieldsToApply.length === 0) {
    return { applied, errors };
  }

  // -------------------------------------------------------------------------
  // 1. Fetch current deal record
  // -------------------------------------------------------------------------
  const { data: deal, error: dealFetchError } = await supabase
    .from('deals')
    .select('id, notes, next_steps, value, expected_close_date, stage_id, org_id')
    .eq('id', context.deal_id)
    .maybeSingle();

  if (dealFetchError) {
    errors.push(`Failed to fetch deal ${context.deal_id}: ${dealFetchError.message}`);
    return { applied, errors };
  }

  if (!deal) {
    errors.push(`Deal not found: ${context.deal_id}`);
    return { applied, errors };
  }

  // -------------------------------------------------------------------------
  // 2. Build the update payload field by field
  // -------------------------------------------------------------------------
  const updates: Record<string, unknown> = {};
  // Accumulate notes additions so we can collapse into a single append
  const notesAdditions: string[] = [];
  // Track what was computed so audit records match final applied values
  const pendingAudit: Array<{ field: FieldChange; appliedValue: unknown; previousValue: unknown }> = [];

  for (const field of fieldsToApply) {
    const { field_name, proposed_value, confidence, reason } = field;

    if (!(field_name in FIELD_TO_COLUMN)) {
      errors.push(`Unknown field: "${field_name}" — no column mapping, skipping`);
      continue;
    }

    // ---- Append-to-notes fields ----
    if (APPEND_TO_NOTES.has(field_name)) {
      const label = labelFor(field_name);
      const text = typeof proposed_value === 'string'
        ? proposed_value
        : JSON.stringify(proposed_value);
      notesAdditions.push(`${label}: ${text}`);
      pendingAudit.push({
        field,
        previousValue: null, // notes append — no single prior value
        appliedValue: text,
      });
      continue;
    }

    // ---- Stage change ----
    if (field_name === 'stage') {
      const stageName = String(proposed_value);
      const { data: stageRow, error: stageLookupError } = await supabase
        .from('deal_stages')
        .select('id')
        .ilike('name', stageName)
        .limit(1)
        .maybeSingle();

      if (stageLookupError || !stageRow) {
        errors.push(`Stage not found: "${stageName}" — skipping stage change`);
        continue;
      }

      updates.stage_id = stageRow.id;
      updates.stage_changed_at = new Date().toISOString();
      pendingAudit.push({
        field,
        previousValue: deal.stage_id ?? null,
        appliedValue: stageRow.id,
      });
      continue;
    }

    // ---- next_steps — APPEND ----
    if (field_name === 'next_steps') {
      const existing = (deal.next_steps as string | null) || '';
      const newText = String(proposed_value);
      const separator = existing.trim() ? '\n' : '';
      const combined = `${existing}${separator}${newText}`.trim();
      updates.next_steps = combined;
      pendingAudit.push({
        field,
        previousValue: existing || null,
        appliedValue: combined,
      });
      continue;
    }

    // ---- close_date ----
    if (field_name === 'close_date') {
      const dateStr = String(proposed_value);
      const parsed = new Date(dateStr);
      if (isNaN(parsed.getTime())) {
        errors.push(`Invalid date for close_date: "${dateStr}" — skipping`);
        continue;
      }
      updates.expected_close_date = dateStr;
      pendingAudit.push({
        field,
        previousValue: deal.expected_close_date ?? null,
        appliedValue: dateStr,
      });
      continue;
    }

    // ---- deal_value ----
    if (field_name === 'deal_value') {
      const raw = typeof proposed_value === 'number'
        ? proposed_value
        : parseFloat(String(proposed_value).replace(/[$,]/g, ''));
      if (isNaN(raw)) {
        errors.push(`Invalid number for deal_value: "${proposed_value}" — skipping`);
        continue;
      }
      updates.value = raw;
      pendingAudit.push({
        field,
        previousValue: deal.value ?? null,
        appliedValue: raw,
      });
      continue;
    }
  }

  // ---- Collapse notes additions ----
  if (notesAdditions.length > 0) {
    const existingNotes = (deal.notes as string | null) || '';
    const datestamp = new Date().toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
    const separator = existingNotes.trim() ? '\n\n' : '';
    updates.notes = `${existingNotes}${separator}[${datestamp}]\n${notesAdditions.join('\n')}`;
  }

  // -------------------------------------------------------------------------
  // 3. Write deals table update (one call)
  // -------------------------------------------------------------------------
  if (Object.keys(updates).length > 0) {
    updates.updated_at = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('deals')
      .update(updates)
      .eq('id', context.deal_id);

    if (updateError) {
      errors.push(`Failed to update deal: ${updateError.message}`);
      return { applied, errors };
    }
  }

  // -------------------------------------------------------------------------
  // 4. Record each change in crm_field_updates
  // -------------------------------------------------------------------------
  for (const { field, previousValue, appliedValue } of pendingAudit) {
    try {
      const { error: auditError } = await supabase
        .from('crm_field_updates')
        .insert({
          org_id: context.org_id,
          deal_id: context.deal_id,
          user_id: context.user_id,
          field_name: field.field_name,
          old_value: previousValue !== undefined && previousValue !== null
            ? JSON.parse(JSON.stringify(previousValue))
            : null,
          new_value: JSON.parse(JSON.stringify(appliedValue)),
          previous_value: previousValue !== undefined && previousValue !== null
            ? JSON.parse(JSON.stringify(previousValue))
            : null,
          confidence: field.confidence,
          confidence_score: field.confidence,
          change_source: 'auto_apply',
          meeting_id: context.meeting_id,
          reasoning: field.reason,
        });

      if (auditError) {
        console.error(
          `[crm-auto-apply] Audit insert failed for field "${field.field_name}":`,
          auditError.message,
        );
        errors.push(`Audit record failed for "${field.field_name}": ${auditError.message}`);
        continue;
      }

      applied.push({
        field_name: field.field_name,
        previous_value: previousValue,
        applied_value: appliedValue,
        confidence: field.confidence,
        reason: field.reason,
      });
    } catch (auditErr) {
      const msg = auditErr instanceof Error ? auditErr.message : String(auditErr);
      console.error(`[crm-auto-apply] Audit exception for "${field.field_name}":`, msg);
      errors.push(`Audit exception for "${field.field_name}": ${msg}`);
    }
  }

  // -------------------------------------------------------------------------
  // 5. Insert activity record summarising the batch
  // -------------------------------------------------------------------------
  if (applied.length > 0) {
    try {
      const { error: activityError } = await supabase
        .from('activities')
        .insert({
          user_id: context.user_id,
          org_id: context.org_id,
          activity_type: 'crm_auto_update',
          title: `AI auto-updated ${applied.length} CRM field${applied.length !== 1 ? 's' : ''}`,
          deal_id: context.deal_id,
          activity_date: new Date().toISOString(),
          metadata: {
            source: 'crm_auto_apply',
            meeting_id: context.meeting_id,
            fields_updated: applied.map(a => a.field_name),
            field_count: applied.length,
          },
        });

      if (activityError) {
        // Activity failure is non-fatal — log it but don't propagate
        console.warn('[crm-auto-apply] Activity insert failed:', activityError.message);
      }
    } catch (activityErr) {
      console.warn('[crm-auto-apply] Activity insert exception:', activityErr);
    }
  }

  console.log(
    `[crm-auto-apply] Complete: ${applied.length} applied, ${errors.length} errors`,
  );

  return { applied, errors };
}

// =============================================================================
// Helpers
// =============================================================================

function labelFor(fieldName: string): string {
  const labels: Record<string, string> = {
    notes: 'Notes',
    stakeholders: 'Stakeholders',
    blockers: 'Blockers',
    activity_log: 'Activity',
    summary: 'Meeting Summary',
    meddic_score: 'MEDDIC Score',
    budget_confirmed: 'Budget Confirmed',
  };
  return labels[fieldName] ?? fieldName;
}

// =============================================================================
// SkillAdapter wrapper — used by the fleet runner registry
// =============================================================================

/**
 * Fleet runner adapter for the 'auto-apply-crm-fields' sequence step.
 *
 * Reads classified fields from the upstream 'classify-crm-fields' step,
 * resolves deal/user context from tier2, and calls autoApplyFields().
 *
 * Output shape:
 *   { applied: AppliedChange[], errors: string[], deal_id: string, meeting_id: string }
 */
export const crmAutoApplyAdapter: SkillAdapter = {
  name: 'auto-apply-crm-fields',

  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();

    try {
      const deal = state.context.tier2?.deal;
      if (!deal?.id) {
        return {
          success: true,
          output: { applied: [], errors: [], skipped: true, reason: 'No deal in context' },
          duration_ms: Date.now() - start,
        };
      }

      const classifiedOutput = state.outputs['classify-crm-fields'] as ClassifiedFields | undefined;
      const fieldsToApply: FieldChange[] = classifiedOutput?.autoApply ?? [];

      if (fieldsToApply.length === 0) {
        return {
          success: true,
          output: { applied: [], errors: [], skipped: true, reason: 'No auto-apply fields' },
          duration_ms: Date.now() - start,
        };
      }

      const supabase = getServiceClient();
      const context: ApplyContext = {
        org_id: state.event.org_id,
        user_id: state.event.user_id ?? '',
        deal_id: deal.id,
        meeting_id: (state.event.payload as any)?.meeting_id ?? '',
      };

      const result = await autoApplyFields(supabase, context, fieldsToApply);

      console.log(
        `[auto-apply-crm-fields] applied=${result.applied.length}, errors=${result.errors.length}`,
      );

      return {
        success: true,
        output: {
          ...result,
          deal_id: context.deal_id,
          meeting_id: context.meeting_id,
          auto_applied_fields: result.applied.map((a) => a.field_name),
        },
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      console.error('[auto-apply-crm-fields] Error:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - start,
      };
    }
  },
};
