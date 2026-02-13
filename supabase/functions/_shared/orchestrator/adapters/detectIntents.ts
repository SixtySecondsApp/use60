/**
 * Detect Intents Adapter
 *
 * Wraps the detect-intents edge function to conform to the orchestrator's
 * SkillAdapter interface. Analyzes meeting transcripts for commitments,
 * buying signals, and follow-up items, then maps detected intents to
 * queued followup events.
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult, QueuedFollowup } from '../types.ts';

export const detectIntentsAdapter: SkillAdapter = {
  name: 'detect-intents',

  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();

    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

      if (!supabaseUrl || !serviceKey) {
        throw new Error('Missing required environment variables');
      }

      // Get transcript from meeting context
      const transcript = state.context.tier2?.meetingHistory?.[0]?.transcript || '';
      if (!transcript) {
        console.log('[detect-intents] No transcript available, skipping');
        return {
          success: true,
          output: { skipped: true, reason: 'no_transcript' },
          duration_ms: Date.now() - start,
        };
      }

      // Build org context
      const orgName = state.context.tier1.org.name || state.context.tier1.org.company_name || 'Unknown';
      const products = state.context.tier1.products || state.context.tier1.org.products || [];

      // Build attendees list
      const attendees: string[] = [];
      if (state.context.tier2?.contact?.name) {
        attendees.push(state.context.tier2.contact.name);
      }

      // Get rep name
      const repName = state.context.tier1.user.name || state.context.tier1.user.email;

      // Get meeting ID from event payload
      const meetingId = state.event.payload.meeting_id as string | undefined;

      // Call detect-intents edge function
      const response = await fetch(`${supabaseUrl}/functions/v1/detect-intents`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transcript,
          org_context: {
            org_name: orgName,
            products,
          },
          attendees: attendees.length > 0 ? attendees : ['Prospect'],
          rep_name: repName,
          meeting_id: meetingId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`detect-intents returned ${response.status}: ${errorText}`);
      }

      const result = await response.json();

      // Map detected intents to queued followups
      const followups: QueuedFollowup[] = [];

      // Process commitments
      for (const commitment of result.commitments || []) {
        if (commitment.speaker === 'rep') {
          // Rep commitments trigger automation
          if (commitment.intent === 'send_proposal') {
            followups.push({
              type: 'proposal_generation',
              source: 'orchestrator:chain',
              payload: {
                meeting_id: meetingId,
                contact_id: state.context.tier2?.contact?.id,
                trigger_phrase: commitment.phrase,
                confidence: commitment.confidence,
              },
            });
          } else if (commitment.intent === 'schedule_meeting') {
            followups.push({
              type: 'calendar_find_times',
              source: 'orchestrator:chain',
              payload: {
                meeting_id: meetingId,
                contact_id: state.context.tier2?.contact?.id,
                trigger_phrase: commitment.phrase,
                confidence: commitment.confidence,
              },
            });
          } else if (commitment.intent === 'send_content') {
            // Could trigger content delivery sequence in future
            console.log('[detect-intents] Content delivery intent detected:', commitment.phrase);
          }
        }
      }

      console.log('[detect-intents] Success:', {
        commitments: result.commitments?.length || 0,
        buying_signals: result.buying_signals?.length || 0,
        follow_up_items: result.follow_up_items?.length || 0,
        queued_followups: followups.length,
      });

      return {
        success: true,
        output: result,
        duration_ms: Date.now() - start,
        queued_followups: followups.length > 0 ? followups : undefined,
      };
    } catch (error) {
      console.error('[detect-intents] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: Date.now() - start,
      };
    }
  },
};
