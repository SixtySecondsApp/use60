/**
 * CRM Update Adapter
 *
 * Updates deal fields based on AI-extracted field changes from meeting transcripts.
 * Runs after extract-action-items, detect-intents, and extract-crm-fields in the
 * meeting_ended sequence (Wave 3).
 *
 * Responsibilities:
 * 1. Read upstream outputs from extract-crm-fields
 * 2. Get current deal from tier2 context
 * 3. Map field changes to actual deal table columns
 * 4. Write field changes to the deals table
 * 5. Record each change in crm_field_updates table via RPC
 * 6. Return summary for downstream Slack notification
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { getServiceClient } from './contextEnrichment.ts';
import { crmFieldExtractorAdapter } from './crmFieldExtractor.ts';

// =============================================================================
// Types
// =============================================================================

interface DealFieldChange {
  field_name: string;
  old_value: unknown;
  new_value: unknown;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

interface FieldExtractionOutput {
  fields_changed: DealFieldChange[];
  no_change_reason?: string;
}

// =============================================================================
// Field Mapping Configuration
// =============================================================================

/**
 * Maps CRM field names from the extractor to actual deals table columns
 */
const FIELD_MAPPING: Record<string, string> = {
  stage: 'stage', // Note: This updates stage_id via stage name lookup
  next_steps: 'next_steps',
  close_date: 'expected_close_date',
  deal_value: 'value',
  stakeholders: 'notes', // Append to notes with "Stakeholders: ..." prefix
  blockers: 'notes', // Append to notes with "Blockers: ..." prefix
  summary: 'notes', // Append to notes as meeting summary
};

/**
 * Fields that should be appended to notes rather than replaced
 */
const APPEND_TO_NOTES_FIELDS = ['stakeholders', 'blockers', 'summary'];

// =============================================================================
// Adapter
// =============================================================================

export const crmUpdateAdapter: SkillAdapter = {
  name: 'update-crm-from-meeting',

  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();

    try {
      console.log('[update-crm-from-meeting] Starting CRM update...');

      const supabase = getServiceClient();

      // --- Get deal from tier2 context ---
      const currentDeal = state.context.tier2?.deal;
      if (!currentDeal) {
        console.log('[update-crm-from-meeting] No deal in context, skipping');
        return {
          success: true,
          output: {
            skipped: true,
            reason: 'No deal associated with meeting',
            changes_applied: 0,
          },
          duration_ms: Date.now() - start,
        };
      }

      // --- Get field changes from upstream extract-crm-fields step ---
      // Check if extraction already ran in a prior step
      let extractionOutput = state.outputs['extract-crm-fields'] as FieldExtractionOutput | undefined;

      // If not in outputs, call the extractor adapter directly
      if (!extractionOutput) {
        console.log('[update-crm-from-meeting] Running CRM field extraction...');
        const extractionResult = await crmFieldExtractorAdapter.execute(state, step);

        if (!extractionResult.success) {
          console.warn('[update-crm-from-meeting] Field extraction failed:', extractionResult.error);
          return {
            success: true,
            output: {
              skipped: true,
              reason: `Field extraction failed: ${extractionResult.error}`,
              changes_applied: 0,
            },
            duration_ms: Date.now() - start,
          };
        }

        extractionOutput = extractionResult.output as FieldExtractionOutput;
      }

      const fieldsChanged = extractionOutput?.fields_changed || [];

      if (fieldsChanged.length === 0) {
        console.log('[update-crm-from-meeting] No field changes detected, skipping');
        return {
          success: true,
          output: {
            skipped: true,
            reason: extractionOutput?.no_change_reason || 'No field changes detected',
            changes_applied: 0,
          },
          duration_ms: Date.now() - start,
        };
      }

      console.log(`[update-crm-from-meeting] Processing ${fieldsChanged.length} field changes for deal ${currentDeal.name}`);

      // --- Process field changes ---
      const updates: Record<string, unknown> = {};
      const auditRecords: Array<{
        field_name: string;
        old_value: unknown;
        new_value: unknown;
        confidence: string;
        reasoning: string;
      }> = [];

      // Get current deal record to access existing notes
      const { data: dealRecord, error: dealFetchError } = await supabase
        .from('deals')
        .select('id, notes, next_steps, value, expected_close_date, stage_id')
        .eq('id', currentDeal.id)
        .maybeSingle();

      if (dealFetchError) {
        throw new Error(`Failed to fetch deal record: ${dealFetchError.message}`);
      }

      if (!dealRecord) {
        throw new Error(`Deal not found: ${currentDeal.id}`);
      }

      let notesAdditions: string[] = [];

      for (const change of fieldsChanged) {
        const fieldName = change.field_name;
        const dealColumn = FIELD_MAPPING[fieldName];

        if (!dealColumn) {
          console.warn(`[update-crm-from-meeting] Unknown field: ${fieldName}, skipping`);
          continue;
        }

        // Handle fields that append to notes
        if (APPEND_TO_NOTES_FIELDS.includes(fieldName)) {
          const prefix = fieldName === 'summary' ? 'Meeting Summary' :
                        fieldName === 'stakeholders' ? 'Stakeholders' :
                        fieldName === 'blockers' ? 'Blockers' : fieldName;

          const addition = `${prefix}: ${String(change.new_value)}`;
          notesAdditions.push(addition);

          // Track for audit
          auditRecords.push({
            field_name: fieldName,
            old_value: null,
            new_value: change.new_value,
            confidence: change.confidence,
            reasoning: change.reasoning,
          });
          continue;
        }

        // Handle stage changes (requires stage lookup)
        if (fieldName === 'stage') {
          const newStageName = String(change.new_value);

          // Look up stage_id by name
          // Note: If deal_stages has organization_id column, this query will work
          // If not, it will search globally (stages may be shared across orgs)
          const { data: stageData, error: stageError } = await supabase
            .from('deal_stages')
            .select('id')
            .ilike('name', newStageName)
            .limit(1)
            .maybeSingle();

          if (stageError || !stageData) {
            console.warn(
              `[update-crm-from-meeting] Stage not found: "${newStageName}", skipping stage change`,
            );
            continue;
          }

          updates.stage_id = stageData.id;
          updates.stage_changed_at = new Date().toISOString();

          auditRecords.push({
            field_name: fieldName,
            old_value: change.old_value,
            new_value: change.new_value,
            confidence: change.confidence,
            reasoning: change.reasoning,
          });
          continue;
        }

        // Handle direct field updates
        if (fieldName === 'close_date') {
          // Parse and validate date
          const dateValue = String(change.new_value);
          const parsedDate = new Date(dateValue);

          if (isNaN(parsedDate.getTime())) {
            console.warn(`[update-crm-from-meeting] Invalid date: ${dateValue}, skipping`);
            continue;
          }

          updates.expected_close_date = dateValue;
        } else if (fieldName === 'deal_value') {
          // Parse and validate numeric value
          const numericValue = typeof change.new_value === 'number'
            ? change.new_value
            : parseFloat(String(change.new_value).replace(/[$,]/g, ''));

          if (isNaN(numericValue)) {
            console.warn(`[update-crm-from-meeting] Invalid number: ${change.new_value}, skipping`);
            continue;
          }

          updates.value = numericValue;
        } else if (fieldName === 'next_steps') {
          updates.next_steps = String(change.new_value);
        }

        auditRecords.push({
          field_name: fieldName,
          old_value: change.old_value,
          new_value: change.new_value,
          confidence: change.confidence,
          reasoning: change.reasoning,
        });
      }

      // Append notes additions
      if (notesAdditions.length > 0) {
        const existingNotes = dealRecord.notes || '';
        const timestamp = new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        const separator = existingNotes ? '\n\n' : '';
        const newNotes = `${existingNotes}${separator}[${timestamp}]\n${notesAdditions.join('\n')}`;

        updates.notes = newNotes;
      }

      // Update updated_at timestamp
      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date().toISOString();
      }

      console.log(
        `[update-crm-from-meeting] Applying ${Object.keys(updates).length} field updates to deal`,
      );

      // --- Write updates to deals table ---
      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from('deals')
          .update(updates)
          .eq('id', currentDeal.id);

        if (updateError) {
          throw new Error(`Failed to update deal: ${updateError.message}`);
        }
      }

      // --- Record changes in crm_field_updates table ---
      const updateIds: string[] = [];

      for (const record of auditRecords) {
        try {
          const { data: updateId, error: auditError } = await supabase.rpc(
            'create_crm_field_update',
            {
              p_org_id: state.event.org_id,
              p_deal_id: currentDeal.id,
              p_user_id: state.event.user_id,
              p_field_name: record.field_name,
              p_old_value: record.old_value !== null && record.old_value !== undefined
                ? JSON.parse(JSON.stringify(record.old_value))
                : null,
              p_new_value: JSON.parse(JSON.stringify(record.new_value)),
              p_confidence: record.confidence,
              p_reasoning: record.reasoning,
              p_source_job_id: state.event.parent_job_id || null,
            },
          );

          if (auditError) {
            console.error(
              `[update-crm-from-meeting] Failed to create audit record for ${record.field_name}:`,
              auditError,
            );
            continue;
          }

          if (updateId) {
            updateIds.push(updateId);
          }
        } catch (auditErr) {
          console.error(
            `[update-crm-from-meeting] Exception creating audit record:`,
            auditErr,
          );
        }
      }

      // --- Build summary for downstream Slack notification ---
      const summary = {
        deal_id: currentDeal.id,
        deal_name: currentDeal.name,
        changes_applied: auditRecords.length,
        update_ids: updateIds,
        field_changes: auditRecords.map(r => ({
          field: r.field_name,
          new_value: r.new_value,
          confidence: r.confidence,
        })),
      };

      console.log(
        `[update-crm-from-meeting] CRM update complete: ${auditRecords.length} changes applied, ${updateIds.length} audit records created`,
      );

      return {
        success: true,
        output: summary,
        duration_ms: Date.now() - start,
      };
    } catch (error) {
      console.error('[update-crm-from-meeting] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: Date.now() - start,
      };
    }
  },
};
