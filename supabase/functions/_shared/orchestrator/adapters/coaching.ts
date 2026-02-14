/**
 * Coaching Orchestrator Adapters
 *
 * coachingMicroFeedbackAdapter uses contextEnrichment for mega context-aware coaching:
 * - Meeting transcript with enriched attendees (titles, companies)
 * - Contact record with deal context and relationship history
 * - Prior coaching scores and trends for this rep
 * - Org winning patterns from closed-won deals
 * - Prior pipeline outputs (call type, action items)
 *
 * Other adapters (aggregate, correlate, digest, Slack) operate on aggregated data
 * and don't need per-meeting enrichment.
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import {
  getServiceClient,
  enrichMeetingContext,
  enrichContactContext,
  enrichCoachingHistory,
  formatContactSection,
  formatRelationshipHistory,
  formatAttendeesSection,
  formatCoachingHistory,
} from './contextEnrichment.ts';

export const coachingMicroFeedbackAdapter: SkillAdapter = {
  name: 'coaching-micro-feedback',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = getServiceClient();
      const meetingId = state.event.payload.meeting_id as string;

      // --- Context Enrichment (defensive — failures don't crash the step) ---
      console.log('[coaching-micro-feedback] Enriching context...');

      let meetingCtx: any = { transcript: '', summary: '', title: 'Meeting', attendees: [] };
      try {
        meetingCtx = await enrichMeetingContext(supabase, meetingId);
      } catch (err) {
        console.warn('[coaching-micro-feedback] Meeting enrichment failed:', err);
      }

      let contactCtx: any = null;
      const contactData = state.context.tier2?.contact;
      if (contactData) {
        try {
          contactCtx = await enrichContactContext(supabase, contactData, meetingId);
        } catch (err) {
          console.warn('[coaching-micro-feedback] Contact enrichment failed:', err);
        }
      }

      let coachingCtx: any = { priorScores: [], orgWinPatterns: undefined };
      try {
        coachingCtx = await enrichCoachingHistory(
          supabase, state.event.user_id, state.event.org_id,
        );
      } catch (err) {
        console.warn('[coaching-micro-feedback] Coaching history enrichment failed:', err);
      }

      console.log(
        `[coaching-micro-feedback] Context: ${meetingCtx.attendees?.length || 0} attendees, ` +
        `${coachingCtx.priorScores?.length || 0} prior scores, ` +
        `win_patterns=${!!coachingCtx.orgWinPatterns}`,
      );

      // --- Build enriched context for edge function ---
      const enrichedContext: Record<string, unknown> = {
        rep_name: state.context.tier1.user.name,
        org_name: state.context.tier1.org.name,
        products: state.context.tier1.products || state.context.tier1.org.products || [],
        attendees_section: formatAttendeesSection(meetingCtx.attendees || []),
        coaching_history_section: formatCoachingHistory(coachingCtx),
        meeting_title: meetingCtx.title,
        meeting_duration: meetingCtx.durationMinutes,
        meeting_start: meetingCtx.meetingStart,
        call_type: state.outputs['classify-call-type'],
        action_items_summary: state.outputs['extract-action-items'],
      };

      if (contactCtx) {
        enrichedContext.contact_section = formatContactSection(contactCtx);
        enrichedContext.relationship_history = formatRelationshipHistory(contactCtx);
        if (contactCtx.dealContext) {
          enrichedContext.deal_context = contactCtx.dealContext;
        }
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/coaching-analysis`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          org_id: state.event.org_id,
          user_id: state.event.user_id,
          meeting_id: meetingId,
          analysis_type: 'per_meeting',
          transcript: meetingCtx.transcript || state.event.payload.transcript,
          context: enrichedContext,
        }),
      });

      if (!response.ok) {
        throw new Error(`coaching-analysis returned ${response.status}: ${await response.text()}`);
      }

      const output = await response.json();
      return { success: true, output, duration_ms: Date.now() - start };
    } catch (err) {
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};

export const aggregateWeeklyMetricsAdapter: SkillAdapter = {
  name: 'aggregate-weekly-metrics',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

      const response = await fetch(`${supabaseUrl}/functions/v1/coaching-analysis`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          org_id: state.event.org_id,
          user_id: state.event.user_id,
          analysis_type: 'weekly',
        }),
      });

      if (!response.ok) {
        throw new Error(`coaching-analysis returned ${response.status}: ${await response.text()}`);
      }

      const output = await response.json();
      return { success: true, output, duration_ms: Date.now() - start };
    } catch (err) {
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};

export const correlateWinLossAdapter: SkillAdapter = {
  name: 'correlate-win-loss',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

      const response = await fetch(`${supabaseUrl}/functions/v1/coaching-analysis`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          org_id: state.event.org_id,
          user_id: state.event.user_id,
          mode: 'correlate_win_loss',
          weekly_metrics: state.outputs['aggregate-weekly-metrics'],
        }),
      });

      if (!response.ok) {
        throw new Error(`correlate-win-loss returned ${response.status}: ${await response.text()}`);
      }

      const output = await response.json();
      return { success: true, output, duration_ms: Date.now() - start };
    } catch (err) {
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};

export const generateCoachingDigestAdapter: SkillAdapter = {
  name: 'generate-coaching-digest',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

      const response = await fetch(`${supabaseUrl}/functions/v1/coaching-analysis`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          org_id: state.event.org_id,
          user_id: state.event.user_id,
          mode: 'generate_digest',
          weekly_metrics: state.outputs['aggregate-weekly-metrics'],
          win_loss_correlation: state.outputs['correlate-win-loss'],
        }),
      });

      if (!response.ok) {
        throw new Error(`generate-coaching-digest returned ${response.status}: ${await response.text()}`);
      }

      const output = await response.json();
      return { success: true, output, duration_ms: Date.now() - start };
    } catch (err) {
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};

export const deliverCoachingSlackAdapter: SkillAdapter = {
  name: 'deliver-coaching-slack',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

      const digest = state.outputs['generate-coaching-digest'];

      const response = await fetch(`${supabaseUrl}/functions/v1/send-slack-message`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          org_id: state.event.org_id,
          user_id: state.event.user_id,
          message_type: 'coaching_digest',
          data: digest,
        }),
      });

      if (!response.ok) {
        throw new Error(`send-slack-message returned ${response.status}: ${await response.text()}`);
      }

      const output = await response.json();
      return { success: true, output, duration_ms: Date.now() - start };
    } catch (err) {
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};
