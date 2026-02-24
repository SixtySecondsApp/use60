/**
 * Detect Intents Adapter
 *
 * Wraps the detect-intents edge function to conform to the orchestrator's
 * SkillAdapter interface. Analyzes meeting transcripts for commitments,
 * buying signals, and follow-up items, then maps detected intents to
 * queued followup events.
 *
 * Uses contextEnrichment for mega context-aware intent detection:
 * - Meeting attendees enriched with titles and companies
 * - Contact record with deal context
 * - Relationship history (prior meetings, emails, activities)
 * - Prior pipeline outputs (call type classification)
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult, QueuedFollowup } from '../types.ts';
import {
  getServiceClient,
  enrichMeetingContext,
  enrichContactContext,
  formatContactSection,
  formatRelationshipHistory,
} from './contextEnrichment.ts';
import { resolveIntentAction, resolveSlackChannelAsync } from '../intentActionRegistry.ts';

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

      const supabase = getServiceClient();
      const meetingId = state.event.payload.meeting_id as string | undefined;

      // --- Context Enrichment (defensive — failures don't crash the step) ---
      console.log('[detect-intents] Enriching context...');

      let transcript = '';
      let enrichedAttendees: Array<{ name: string; email?: string; role?: string; company?: string; side: string }> = [];

      // Get transcript and attendees from meeting context
      if (meetingId) {
        try {
          const meetingCtx = await enrichMeetingContext(supabase, meetingId);
          transcript = meetingCtx.transcript;
          enrichedAttendees = meetingCtx.attendees.map(a => ({
            name: a.name,
            email: a.email,
            role: a.title,
            company: a.company,
            side: a.is_external ? 'buyer' : 'seller',
          }));
        } catch (enrichErr) {
          console.warn('[detect-intents] Meeting enrichment failed, using fallbacks:', enrichErr);
        }
      }

      // Fallback transcript from context
      if (!transcript) {
        transcript = (state.context.tier2?.meetingHistory?.[0] as any)?.transcript_text || state.context.tier2?.meetingHistory?.[0]?.transcript || '';
      }

      // Fallback: query meeting directly
      if (!transcript && meetingId) {
        try {
          const { data: meeting } = await supabase
            .from('meetings')
            .select('transcript_text')
            .eq('id', meetingId)
            .maybeSingle();
          transcript = meeting?.transcript_text || '';
        } catch {
          console.warn('[detect-intents] Direct meeting query failed');
        }
      }

      if (!transcript) {
        console.log('[detect-intents] No transcript available, skipping');
        return {
          success: true,
          output: { skipped: true, reason: 'no_transcript' },
          duration_ms: Date.now() - start,
        };
      }

      // Contact enrichment for deal context and relationship history (non-fatal)
      let contactCtx: any = null;
      const contactData = state.context.tier2?.contact;
      if (contactData) {
        try {
          contactCtx = await enrichContactContext(supabase, contactData, meetingId);
        } catch (contactErr) {
          console.warn('[detect-intents] Contact enrichment failed:', contactErr);
        }
      }

      console.log(
        `[detect-intents] Context: ${enrichedAttendees.length} attendees, ` +
        `deal=${contactCtx?.dealContext?.name || 'none'}, ` +
        `prior_meetings=${contactCtx?.recentMeetings?.length || 0}, ` +
        `prior_emails=${contactCtx?.recentEmails?.length || 0}`,
      );

      // Build org context
      const orgName = state.context.tier1.org.name || state.context.tier1.org.company_name || 'Unknown';
      const products = state.context.tier1.products || state.context.tier1.org.products || [];
      const repName = state.context.tier1.user.name || state.context.tier1.user.email;

      // Build fallback attendees from state if enrichment returned none
      if (enrichedAttendees.length === 0) {
        if (state.context.tier2?.contact?.name) {
          enrichedAttendees.push({
            name: state.context.tier2.contact.name,
            side: 'buyer',
          });
        }
      }

      // Build enriched context for edge function
      const enrichedContext: Record<string, unknown> = {};
      if (contactCtx) {
        enrichedContext.contact = formatContactSection(contactCtx);
        enrichedContext.relationship_history = formatRelationshipHistory(contactCtx);
        if (contactCtx.dealContext) {
          enrichedContext.deal_context = contactCtx.dealContext;
        }
      }
      const callType = state.outputs['classify-call-type'];
      if (callType) {
        enrichedContext.call_type = callType;
      }

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
          attendees: enrichedAttendees.length > 0
            ? enrichedAttendees
            : [{ name: 'Prospect', side: 'buyer' }],
          rep_name: repName,
          meeting_id: meetingId,
          user_id: state.event.user_id,
          org_id: state.event.org_id,
          enriched_context: Object.keys(enrichedContext).length > 0 ? enrichedContext : undefined,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`detect-intents returned ${response.status}: ${errorText}`);
      }

      const result = await response.json();

      // Persist buying signals + commitments to meeting_structured_summaries
      if (meetingId && (result.buying_signals?.length || result.commitments?.length)) {
        try {
          const repCommitments = (result.commitments || [])
            .filter((c: any) => c.speaker_side === 'seller' || c.speaker === 'rep')
            .map((c: any) => c.phrase || c.source_quote);
          const prospectCommitments = (result.commitments || [])
            .filter((c: any) => c.speaker_side === 'buyer' || c.speaker === 'prospect')
            .map((c: any) => c.phrase || c.source_quote);
          const competitorMentions = (result.commitments || [])
            .filter((c: any) => c.intent === 'competitive_mention')
            .map((c: any) => c.phrase || c.source_quote);
          const objections = (result.commitments || [])
            .filter((c: any) => c.intent === 'objection_blocker')
            .map((c: any) => c.phrase || c.source_quote);
          const outcomeSignals = (result.buying_signals || []).map((s: any) => ({
            text: s.text || s.description,
            framework: s.framework || 'MEDDICC',
            strength: s.strength,
            category: s.category,
          }));

          await supabase
            .from('meeting_structured_summaries')
            .upsert({
              meeting_id: meetingId,
              org_id: state.event.org_id,
              rep_commitments: repCommitments,
              prospect_commitments: prospectCommitments,
              competitor_mentions: competitorMentions,
              objections: objections,
              outcome_signals: outcomeSignals,
              ai_model_used: 'claude-haiku-4-5',
              version: 2,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'meeting_id' });

          console.log('[detect-intents] Persisted to meeting_structured_summaries');
        } catch (persistErr) {
          console.warn('[detect-intents] Failed to persist structured summary:', persistErr);
        }
      }

      // Map detected intents to queued followups via registry
      const followups: QueuedFollowup[] = [];

      for (const commitment of result.commitments || []) {
        const resolution = resolveIntentAction({
          intent: commitment.intent,
          confidence: commitment.confidence,
          confidence_tier: commitment.confidence_tier,
        });

        if (!resolution) continue;

        const { config, should_auto_action, should_suggest } = resolution;

        // Only queue follow-ups for actionable commitments
        if (!should_auto_action && !should_suggest) continue;

        // Build base payload with deadline passthrough + buying signals
        const basePayload: Record<string, unknown> = {
          meeting_id: meetingId,
          contact_id: state.context.tier2?.contact?.id,
          deal_id: state.context.tier2?.deal?.id,
          trigger_phrase: commitment.phrase || commitment.source_quote,
          confidence: commitment.confidence,
          confidence_tier: commitment.confidence_tier,
          intent: commitment.intent,
          deadline_parsed: commitment.deadline_parsed || null,
          auto_action: should_auto_action,
          // Pass buying signals so tasks get them in metadata
          buying_signals: result.buying_signals || [],
        };

        // Queue orchestrator event if one is mapped
        if (config.orchestrator_event) {
          followups.push({
            type: config.orchestrator_event as any, // EventType may not include all new types yet
            source: 'orchestrator:chain',
            payload: basePayload,
          });
        }

        // Queue Slack channel ping for check_with_team type intents
        if (config.slack_action === 'ping_channel') {
          const channelResult = await resolveSlackChannelAsync({
            phrase: commitment.phrase || '',
            context: commitment.context,
            orgId: state.event.org_id,
          });
          followups.push({
            type: 'meeting_ended' as any, // Reuse meeting_ended as carrier event
            source: 'orchestrator:chain',
            payload: {
              ...basePayload,
              _action: 'ping_slack_channel',
              slack_channel: channelResult?.channel_name ?? null,
              slack_channel_id: channelResult?.channel_id ?? null,
              commitment_text: commitment.phrase || commitment.source_quote,
            },
          });
        }

        // Queue skill execution for linked skills
        if (config.linked_skill) {
          followups.push({
            type: 'meeting_ended' as any,
            source: 'orchestrator:chain',
            payload: {
              ...basePayload,
              _action: 'execute_skill',
              skill_key: config.linked_skill,
            },
          });
        }

        // Queue task creation via signal processor for all auto-actionable intents
        if (should_auto_action && config.signal_type) {
          followups.push({
            type: 'meeting_ended' as any,
            source: 'orchestrator:chain',
            payload: {
              ...basePayload,
              _action: 'create_task',
              signal_type: config.signal_type,
              task_type: config.task_type,
              deliverable_type: config.deliverable_type,
              auto_generate: config.auto_generate,
            },
          });
        }

        // Log CRM updates for separate processing
        if (config.crm_updates && config.crm_updates.length > 0) {
          followups.push({
            type: 'meeting_ended' as any,
            source: 'orchestrator:chain',
            payload: {
              ...basePayload,
              _action: 'crm_update',
              crm_updates: config.crm_updates,
            },
          });
        }
      }

      console.log('[detect-intents] Success:', {
        commitments: result.commitments?.length || 0,
        buying_signals: result.buying_signals?.length || 0,
        follow_up_items: result.follow_up_items?.length || 0,
        queued_followups: followups.length,
        auto_actioned: followups.filter((f: any) => f.payload?.auto_action).length,
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
