/**
 * Update Deal Timeline Adapter
 *
 * Processes CRM update actions queued by the detect-intents adapter.
 * When commitment intents like `timeline_signal`, `pricing_request`, or
 * `competitive_mention` are detected, they carry CRM update instructions
 * that need to be applied to deals/contacts.
 *
 * CRM update instructions arrive via `state.event.payload.crm_updates` (queued
 * as an `orchestrator:chain` follow-up event) or, as a fallback, from the
 * `detect-intents` step output stored in `state.outputs`.
 *
 * Update strategies:
 *   - deal.close_date       → HITL (only pull-forward; never push out)
 *   - deal.tags             → direct (non-destructive tag append)
 *   - deal.meddicc_competition → HITL (competitor name extracted from phrase)
 *   - contact.create_stakeholder → task creation (insufficient info for new contact)
 */

import type {
  SkillAdapter,
  SequenceState,
  SequenceStep,
  StepResult,
  PendingApproval,
} from '../types.ts';
import { getServiceClient } from './contextEnrichment.ts';

// =============================================================================
// Types
// =============================================================================

interface CrmUpdateInstruction {
  entity: 'deal' | 'contact';
  field: string;
  value_source: 'extracted' | 'fixed';
  fixed_value?: string;
}

interface AppliedUpdate {
  field: string;
  entity: string;
  old_value: unknown;
  new_value: unknown;
  strategy: 'direct' | 'hitl' | 'task_created' | 'skipped';
  skip_reason?: string;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Extracts a competitor name from the raw commitment trigger phrase.
 * Looks for tokens following "vs", "versus", "against", "over", or "with"
 * and capitalises the result. Falls back to the whole phrase (truncated).
 */
function extractCompetitorName(phrase: string): string {
  if (!phrase) return 'Unknown Competitor';

  const patterns = [
    /\bvs\.?\s+([A-Za-z0-9\s]+)/i,
    /\bversus\s+([A-Za-z0-9\s]+)/i,
    /\bagainst\s+([A-Za-z0-9\s]+)/i,
    /\bcompeting\s+with\s+([A-Za-z0-9\s]+)/i,
    /\bcompetitor[:\s]+([A-Za-z0-9\s]+)/i,
    /\b(?:looking at|evaluating|comparing)\s+([A-Za-z0-9\s]+)/i,
  ];

  for (const pattern of patterns) {
    const match = phrase.match(pattern);
    if (match?.[1]) {
      // Trim trailing noise words and capitalise
      const candidate = match[1]
        .replace(/\b(?:as well|too|also|instead|and|or|but)\b.*/i, '')
        .trim();
      if (candidate.length > 1) {
        return candidate.charAt(0).toUpperCase() + candidate.slice(1);
      }
    }
  }

  // Fallback: return first 50 chars of phrase
  return phrase.slice(0, 50).trim();
}

/**
 * Extracts a new stakeholder name from the commitment trigger phrase.
 * Looks for patterns like "introducing <Name>" or "looping in <Name>".
 */
function extractStakeholderName(phrase: string): string {
  if (!phrase) return 'New Stakeholder';

  const patterns = [
    /\bintroducing\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,
    /\blooping\s+in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
    /\bbringing\s+in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
    /\binvolving\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+will\s+(?:join|be\s+involved)/,
  ];

  for (const pattern of patterns) {
    const match = phrase.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return 'New Stakeholder';
}

// =============================================================================
// Adapter
// =============================================================================

export const updateDealTimelineAdapter: SkillAdapter = {
  name: 'update-deal-timeline',

  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();

    try {
      console.log('[update-deal-timeline] Starting CRM intent update...');

      const supabase = getServiceClient();

      // --- Resolve CRM update instructions ---
      // Primary: queued by detectIntents as an orchestrator:chain event payload
      let crmUpdates = state.event.payload.crm_updates as CrmUpdateInstruction[] | undefined;

      // Fallback: read from upstream detect-intents output stored in state.outputs
      if (!crmUpdates || crmUpdates.length === 0) {
        const detectOutput = state.outputs['detect-intents'] as Record<string, unknown> | undefined;
        if (detectOutput?.crm_updates && Array.isArray(detectOutput.crm_updates)) {
          crmUpdates = detectOutput.crm_updates as CrmUpdateInstruction[];
        }
      }

      if (!crmUpdates || crmUpdates.length === 0) {
        console.log('[update-deal-timeline] No CRM update instructions found, skipping');
        return {
          success: true,
          output: { skipped: true, reason: 'no_crm_updates', updates_applied: 0 },
          duration_ms: Date.now() - start,
        };
      }

      // --- Resolve deal ID ---
      const dealId =
        (state.context.tier2?.deal?.id) ||
        (state.event.payload.deal_id as string | undefined);

      if (!dealId) {
        console.log('[update-deal-timeline] No deal ID available, skipping');
        return {
          success: true,
          output: { skipped: true, reason: 'no_deal_id', updates_applied: 0 },
          duration_ms: Date.now() - start,
        };
      }

      // --- Fetch current deal record ---
      const { data: dealRecord, error: dealFetchError } = await supabase
        .from('deals')
        .select('id, name, expected_close_date, metadata, notes')
        .eq('id', dealId)
        .maybeSingle();

      if (dealFetchError) {
        throw new Error(`Failed to fetch deal record: ${dealFetchError.message}`);
      }

      if (!dealRecord) {
        console.warn(`[update-deal-timeline] Deal ${dealId} not found, skipping`);
        return {
          success: true,
          output: { skipped: true, reason: 'deal_not_found', deal_id: dealId, updates_applied: 0 },
          duration_ms: Date.now() - start,
        };
      }

      // Supporting payload fields passed through from detect-intents follow-up
      const triggerPhrase = (state.event.payload.trigger_phrase as string | undefined) || '';
      const deadlineParsed = state.event.payload.deadline_parsed as string | undefined;

      // Accumulate results
      const appliedUpdates: AppliedUpdate[] = [];
      const directDealUpdates: Record<string, unknown> = {};
      const pendingApprovals: PendingApproval[] = [];

      // --- Process each instruction ---
      for (const instruction of crmUpdates) {
        const { entity, field } = instruction;

        console.log(`[update-deal-timeline] Processing ${entity}.${field} (value_source=${instruction.value_source})`);

        // ---------------------------------------------------------------
        // deal.close_date — timeline_signal
        // ---------------------------------------------------------------
        if (entity === 'deal' && field === 'close_date') {
          // Resolve new date: prefer deadline_parsed from payload, then fixed_value
          const newDateRaw =
            deadlineParsed ||
            (instruction.value_source === 'fixed' ? instruction.fixed_value : undefined);

          if (!newDateRaw) {
            appliedUpdates.push({
              field,
              entity,
              old_value: dealRecord.expected_close_date,
              new_value: null,
              strategy: 'skipped',
              skip_reason: 'no_date_available',
            });
            continue;
          }

          const newDate = new Date(newDateRaw);
          if (isNaN(newDate.getTime())) {
            appliedUpdates.push({
              field,
              entity,
              old_value: dealRecord.expected_close_date,
              new_value: newDateRaw,
              strategy: 'skipped',
              skip_reason: 'invalid_date_format',
            });
            continue;
          }

          const existingDateRaw = dealRecord.expected_close_date as string | undefined;
          const existingDate = existingDateRaw ? new Date(existingDateRaw) : null;

          // Guard: only pull the date forward — never push it out
          if (existingDate && newDate >= existingDate) {
            appliedUpdates.push({
              field,
              entity,
              old_value: existingDateRaw,
              new_value: newDateRaw,
              strategy: 'skipped',
              skip_reason: 'new_date_not_earlier_than_existing',
            });
            console.log(
              `[update-deal-timeline] Skipping close_date update — ${newDateRaw} is not earlier than ${existingDateRaw}`,
            );
            continue;
          }

          const existingLabel = existingDateRaw
            ? new Date(existingDateRaw).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })
            : 'not set';
          const newLabel = newDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          });

          // HITL required — queue as pending approval
          pendingApprovals.push({
            step_name: 'update-deal-timeline',
            action_type: 'crm_update',
            preview: `Update deal close date to ${newLabel} (was ${existingLabel}) for "${dealRecord.name}"`,
            created_at: new Date().toISOString(),
          });

          appliedUpdates.push({
            field,
            entity,
            old_value: existingDateRaw,
            new_value: newDateRaw,
            strategy: 'hitl',
          });

          console.log(`[update-deal-timeline] Queued close_date HITL: ${existingLabel} → ${newLabel}`);
          continue;
        }

        // ---------------------------------------------------------------
        // deal.tags — pricing_request
        // ---------------------------------------------------------------
        if (entity === 'deal' && field === 'tags') {
          const tagToAdd =
            instruction.value_source === 'fixed' && instruction.fixed_value
              ? instruction.fixed_value
              : 'Pricing Requested';

          // Tags are stored in deal metadata (JSONB) as metadata.tags array
          const existingMetadata = (dealRecord.metadata as Record<string, unknown>) || {};
          const existingTags = Array.isArray(existingMetadata.tags)
            ? (existingMetadata.tags as string[])
            : [];

          if (existingTags.includes(tagToAdd)) {
            appliedUpdates.push({
              field,
              entity,
              old_value: existingTags,
              new_value: existingTags,
              strategy: 'skipped',
              skip_reason: 'tag_already_present',
            });
            console.log(`[update-deal-timeline] Tag "${tagToAdd}" already present, skipping`);
            continue;
          }

          const newTags = [...existingTags, tagToAdd];
          directDealUpdates.metadata = {
            ...existingMetadata,
            tags: newTags,
          };

          appliedUpdates.push({
            field,
            entity,
            old_value: existingTags,
            new_value: newTags,
            strategy: 'direct',
          });

          console.log(`[update-deal-timeline] Queued direct tag update: +${tagToAdd}`);
          continue;
        }

        // ---------------------------------------------------------------
        // deal.meddicc_competition — competitive_mention
        // ---------------------------------------------------------------
        if (entity === 'deal' && field === 'meddicc_competition') {
          const competitorName = extractCompetitorName(triggerPhrase);
          const existingMetadata = (dealRecord.metadata as Record<string, unknown>) || {};
          const existingCompetition = (existingMetadata.meddicc_competition as string) || '';

          pendingApprovals.push({
            step_name: 'update-deal-timeline',
            action_type: 'crm_update',
            preview: `Update MEDDICC competition for "${dealRecord.name}" to "${competitorName}"${existingCompetition ? ` (was "${existingCompetition}")` : ''}`,
            created_at: new Date().toISOString(),
          });

          appliedUpdates.push({
            field,
            entity,
            old_value: existingCompetition || null,
            new_value: competitorName,
            strategy: 'hitl',
          });

          console.log(`[update-deal-timeline] Queued meddicc_competition HITL: "${competitorName}"`);
          continue;
        }

        // ---------------------------------------------------------------
        // contact.create_stakeholder — stakeholder_introduction
        // ---------------------------------------------------------------
        if (entity === 'contact' && field === 'create_stakeholder') {
          const stakeholderName = extractStakeholderName(triggerPhrase);

          // Insufficient data to create a contact record — create a task instead
          const { error: taskError } = await supabase
            .from('tasks')
            .insert({
              org_id: state.event.org_id,
              created_by: state.event.user_id,
              assigned_to: state.event.user_id,
              title: `Add new stakeholder: ${stakeholderName}`,
              description:
                `A new stakeholder was mentioned in the meeting. ` +
                `Please find their contact details and add them to the CRM.\n\n` +
                `Context: "${triggerPhrase}"`,
              status: 'pending',
              priority: 'medium',
              due_date: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
              metadata: {
                source: 'orchestrator:update-deal-timeline',
                intent: 'stakeholder_introduction',
                deal_id: dealId,
                stakeholder_name_hint: stakeholderName,
                trigger_phrase: triggerPhrase,
              },
            });

          if (taskError) {
            console.error(
              `[update-deal-timeline] Failed to create stakeholder task:`,
              taskError.message,
            );
            appliedUpdates.push({
              field,
              entity,
              old_value: null,
              new_value: stakeholderName,
              strategy: 'skipped',
              skip_reason: `task_creation_failed: ${taskError.message}`,
            });
          } else {
            appliedUpdates.push({
              field,
              entity,
              old_value: null,
              new_value: stakeholderName,
              strategy: 'task_created',
            });
            console.log(`[update-deal-timeline] Created stakeholder task for "${stakeholderName}"`);
          }
          continue;
        }

        // ---------------------------------------------------------------
        // Unrecognised field — log and skip
        // ---------------------------------------------------------------
        console.warn(
          `[update-deal-timeline] Unrecognised CRM update instruction: ${entity}.${field}, skipping`,
        );
        appliedUpdates.push({
          field,
          entity,
          old_value: null,
          new_value: null,
          strategy: 'skipped',
          skip_reason: `unrecognised_field: ${entity}.${field}`,
        });
      }

      // --- Apply direct (non-HITL) deal updates ---
      if (Object.keys(directDealUpdates).length > 0) {
        directDealUpdates.updated_at = new Date().toISOString();

        const { error: updateError } = await supabase
          .from('deals')
          .update(directDealUpdates)
          .eq('id', dealId);

        if (updateError) {
          throw new Error(`Failed to apply direct deal updates: ${updateError.message}`);
        }

        console.log(
          `[update-deal-timeline] Applied ${Object.keys(directDealUpdates).length - 1} direct field(s) to deal ${dealId}`,
        );
      }

      // --- Build step output ---
      const directCount = appliedUpdates.filter(u => u.strategy === 'direct').length;
      const hitlCount = appliedUpdates.filter(u => u.strategy === 'hitl').length;
      const taskCount = appliedUpdates.filter(u => u.strategy === 'task_created').length;
      const skippedCount = appliedUpdates.filter(u => u.strategy === 'skipped').length;

      console.log(
        `[update-deal-timeline] Complete: direct=${directCount}, hitl=${hitlCount}, tasks=${taskCount}, skipped=${skippedCount}`,
      );

      const result: StepResult = {
        success: true,
        output: {
          deal_id: dealId,
          deal_name: dealRecord.name,
          updates_applied: directCount + taskCount,
          updates_pending_approval: hitlCount,
          updates_skipped: skippedCount,
          updates: appliedUpdates,
          // Surface all pending approvals in output for downstream consumers
          pending_approvals: pendingApprovals.length > 0 ? pendingApprovals : undefined,
        },
        duration_ms: Date.now() - start,
      };

      // StepResult.pending_approval only holds one — use the first; extras are in output
      if (pendingApprovals.length > 0) {
        result.pending_approval = pendingApprovals[0];
      }

      return result;
    } catch (error) {
      console.error('[update-deal-timeline] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: Date.now() - start,
      };
    }
  },
};
