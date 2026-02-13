/**
 * Email Send Orchestrator Adapter
 * Wraps email-send-as-rep for orchestrator sequences
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';

export const draftFollowupEmailAdapter: SkillAdapter = {
  name: 'draft-followup-email',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

      // Draft email based on meeting context
      // For now, this is a placeholder - will be replaced with actual email drafting logic
      const meetingData = state.context.tier1?.meeting;
      const contactData = state.context.tier2?.contact;

      if (!meetingData || !contactData) {
        throw new Error('Missing meeting or contact data for email draft');
      }

      // This adapter prepares the email draft and pauses for approval
      const emailDraft = {
        to: contactData.email,
        subject: `Follow-up: ${meetingData.title || 'Our meeting'}`,
        body: `Hi ${contactData.name || 'there'},\n\nThank you for taking the time to meet today. Here are the key action items we discussed:\n\n[Action items will be populated here]\n\nLooking forward to our next steps.\n\nBest regards`,
        cc: state.event.payload.cc,
        bcc: state.event.payload.bcc,
      };

      return {
        success: true,
        output: {
          email_draft: emailDraft,
        },
        duration_ms: Date.now() - start,
        pending_approval: {
          step_name: 'draft-followup-email',
          action_type: 'email_send',
          preview: `Email to ${contactData.email}: ${emailDraft.subject}`,
          created_at: new Date().toISOString(),
        },
      };
    } catch (err) {
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};

export const sendEmailAsRepAdapter: SkillAdapter = {
  name: 'send-email-as-rep',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

      // Get email draft from previous step output
      const emailDraft = state.outputs['draft-followup-email']?.email_draft;
      if (!emailDraft) {
        throw new Error('No email draft found in state outputs');
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/email-send-as-rep`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: state.event.user_id,
          org_id: state.event.org_id,
          to: emailDraft.to,
          subject: emailDraft.subject,
          body: emailDraft.body,
          cc: emailDraft.cc,
          bcc: emailDraft.bcc,
          thread_id: emailDraft.thread_id,
          in_reply_to: emailDraft.in_reply_to,
          references: emailDraft.references,
          job_id: state.job_id,
        }),
      });

      if (!response.ok) {
        throw new Error(`email-send-as-rep returned ${response.status}: ${await response.text()}`);
      }

      const output = await response.json();
      return { success: true, output, duration_ms: Date.now() - start };
    } catch (err) {
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};
