/**
 * Email Send Orchestrator Adapter
 *
 * Generates AI-powered follow-up emails using shared contextEnrichment:
 * - Meeting transcript & summary
 * - Contact record (title, company, prior interactions)
 * - Recent meetings with this contact (last 7 days)
 * - Email thread history
 * - Activity timeline
 * - Action items & detected intents from prior pipeline steps
 *
 * Uses the followup-reply-drafter skill methodology:
 * - Acknowledge-Advance framework for active post-meeting threads
 * - "What We Heard" technique (mirror prospect's own words)
 * - Tone matching (one notch toward professional)
 * - Single CTA with specific time/option
 * - Under 200 words for post-meeting recaps
 * - No dead phrases ("hope you're well", "just checking in")
 */

import { logAICostEvent, extractAnthropicUsage } from '../../costTracking.ts';
import { logAgentAction } from '../../memory/dailyLog.ts';
import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import {
  getServiceClient,
  enrichContactContext,
  formatContactSection,
  formatRelationshipHistory,
  type ContactEnrichment,
} from './contextEnrichment.ts';

// =============================================================================
// AI Prompt Builder — uses followup-reply-drafter methodology
// =============================================================================

export function buildFollowupEmailPrompt(params: {
  repName: string;
  orgName: string;
  meetingTitle: string;
  transcript: string;
  summary: string;
  enrichment: ContactEnrichment;
  actionItems: unknown;
  intents: unknown;
  callType: unknown;
}): string {
  const { repName, orgName, meetingTitle, transcript, summary, enrichment, actionItems, intents, callType } = params;

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Use shared formatting helpers for contact and relationship context
  const contactSection = formatContactSection(enrichment);
  const relationshipSection = formatRelationshipHistory(enrichment);

  // Build pipeline outputs section
  const pipelineLines: string[] = [];
  if (actionItems) pipelineLines.push(`Action Items:\n${JSON.stringify(actionItems, null, 2)}`);
  if (intents) pipelineLines.push(`Detected Intents (commitments, buying signals):\n${JSON.stringify(intents, null, 2)}`);
  if (callType) pipelineLines.push(`Call Classification:\n${JSON.stringify(callType, null, 2)}`);

  return `You are a sales follow-up email writer for ${orgName}. Draft a post-meeting follow-up email from ${repName}.

TODAY'S DATE: ${today}

## RECIPIENT
${contactSection}

## RELATIONSHIP HISTORY
${relationshipSection}

## THIS MEETING
Title: ${meetingTitle}
${summary ? `Summary: ${summary}\n` : ''}${pipelineLines.length > 0 ? pipelineLines.join('\n\n') : ''}

## TRANSCRIPT
${transcript ? transcript.slice(0, 8000) : 'No transcript available. Use summary and action items.'}

## HOW TO WRITE THIS EMAIL

Write like a real human. Someone who was in the meeting and is sitting down to write a quick follow-up. NOT a meeting summary. NOT a recap template. A real email.

**Structure guidance (DO NOT use headers, bold labels, or bullet-point sections):**

Open with 1-2 sentences that prove you were paying attention. Reference a specific moment, something they said that stuck with you or a decision that clicked into place. Be genuine, not formulaic.

Then flow naturally into 2-3 short paragraphs. Weave in:
- Their own words and phrases (use their language, not yours)
- What was agreed and who's doing what, worked into sentences not a checklist
- Any commitments you're making ("I'll have that over to you by Friday")

End with ONE specific ask. Propose a concrete time or action, not an open-ended "let me know."

**The litmus test:** If you removed the signature, could this email have been written by a real person in 3 minutes on their phone? If not, it's too formal.

## RULES
- Under 150 words
- NO headers, NO bold text, NO bullet points, NO numbered lists. Just flowing paragraphs.
- NO section labels like "What We Heard" or "Next Steps"
- NEVER use em dashes (—). Use commas, periods or "and" instead. Em dashes are an instant AI tell.
- NEVER use Oxford commas (the comma before "and" in a list of three). Write "X, Y and Z" not "X, Y, and Z".
- Mirror their vocabulary. If they said "pipeline visibility", say that, not "sales analytics".
- Reference relationship history naturally ("Since we last spoke..." or "Building on Tuesday's call...")
- NEVER use: "hope you're well", "just checking in", "per my last email", "please find attached", "let me know your thoughts", "don't hesitate to reach out", "I wanted to follow up"
- NEVER re-pitch features not discussed in the meeting
- One paragraph = one thought. Keep paragraphs to 2-3 sentences max.
- Sign off with just "Best,\\n${repName}". No "Thanks so much!" or "Looking forward!"

## OUTPUT FORMAT
Return JSON only (no markdown code blocks):
{
  "subject": "subject line under 50 chars, reference a specific topic from the meeting, not generic 'Meeting Follow-up' or 'Great chatting'",
  "body": "full email text with \\n for line breaks between paragraphs. NO markdown, NO bold, NO bullets, NO em dashes, NO Oxford commas.",
  "body_short": "executive variant under 75 words, even more concise, 2 short paragraphs max, same natural tone",
  "tone": "professional|friendly|executive",
  "framework": "conversational-followup"
}`;
}

// =============================================================================
// Adapters
// =============================================================================

export const draftFollowupEmailAdapter: SkillAdapter = {
  name: 'draft-followup-email',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
      const supabase = getServiceClient();

      // Get meeting title from event payload
      const meetingTitle = (state.event.payload.title as string) || 'Our meeting';
      let contactData = state.context.tier2?.contact;

      // --- Contact Resolution Fallbacks ---
      if (!contactData?.email && state.event.payload.meeting_id) {
        console.log('[draft-followup-email] No contact from context, querying meeting_attendees directly');
        const meetingId = state.event.payload.meeting_id as string;

        const { data: attendees } = await supabase
          .from('meeting_attendees')
          .select('email, name, is_external')
          .eq('meeting_id', meetingId)
          .not('email', 'is', null);

        const extAttendee = attendees?.find((a: any) => a.is_external) || attendees?.[0];
        if (extAttendee?.email) {
          contactData = {
            id: `attendee:${extAttendee.email}`,
            name: extAttendee.name || extAttendee.email,
            email: extAttendee.email,
          };
          console.log(`[draft-followup-email] Using attendee fallback: ${extAttendee.email}`);
        }

        // Calendar time-matching fallback
        if (!contactData?.email) {
          const { data: mtg } = await supabase
            .from('meetings')
            .select('meeting_start, owner_user_id')
            .eq('id', meetingId)
            .maybeSingle();

          if (mtg?.meeting_start) {
            const meetingStart = new Date(mtg.meeting_start);
            const windowStart = new Date(meetingStart.getTime() - 15 * 60 * 1000).toISOString();
            const windowEnd = new Date(meetingStart.getTime() + 15 * 60 * 1000).toISOString();

            const { data: calEvents } = await supabase
              .from('calendar_events')
              .select('id, attendees')
              .eq('user_id', mtg.owner_user_id)
              .gte('start_time', windowStart)
              .lte('start_time', windowEnd)
              .limit(3);

            if (calEvents && calEvents.length > 0) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('email')
                .eq('id', mtg.owner_user_id)
                .maybeSingle();
              const userEmail = profile?.email;

              const eventIds = calEvents.map((e: any) => e.id);
              const { data: calAtts } = await supabase
                .from('calendar_attendees')
                .select('email, name')
                .in('event_id', eventIds)
                .eq('is_organizer', false);

              const extCal = calAtts?.find((a: any) => a.email && a.email !== userEmail);
              if (extCal?.email) {
                contactData = { id: `cal:${extCal.email}`, name: extCal.name || extCal.email, email: extCal.email };
              }

              if (!contactData?.email) {
                for (const evt of calEvents) {
                  if (!evt.attendees || !Array.isArray(evt.attendees)) continue;
                  const ext = (evt.attendees as any[]).find((a: any) =>
                    a.email && a.email !== userEmail && !a.organizer && !a.self
                  );
                  if (ext?.email) {
                    contactData = { id: `cal-json:${ext.email}`, name: ext.displayName || ext.email, email: ext.email };
                    break;
                  }
                }
              }
            }
          }
        }
      }

      if (!contactData?.email) {
        console.log('[draft-followup-email] No contact email after all fallbacks, skipping');
        return { success: true, output: { skipped: true, reason: 'no_contact_email' }, duration_ms: Date.now() - start };
      }

      // --- Fetch Meeting Transcript & Summary ---
      const meetingId = state.event.payload.meeting_id as string | undefined;
      let transcript = '';
      let summary = '';

      if (meetingId) {
        const { data: meeting } = await supabase
          .from('meetings')
          .select('transcript_text, summary')
          .eq('id', meetingId)
          .maybeSingle();
        transcript = meeting?.transcript_text || '';
        summary = meeting?.summary || '';
      }

      // --- Enrich Contact Context (shared module) ---
      const enrichment = await enrichContactContext(supabase, contactData, meetingId);
      console.log(`[draft-followup-email] Context enrichment: ${enrichment.recentMeetings.length} recent meetings, ${enrichment.recentEmails.length} emails, ${enrichment.recentActivities.length} activities, deal=${enrichment.dealContext?.name || 'none'}`);

      // --- Gather Previous Pipeline Outputs ---
      const actionItemsOutput = state.outputs['extract-action-items'];
      const intentsOutput = state.outputs['detect-intents'];
      const callTypeOutput = state.outputs['classify-call-type'];

      const repName = state.context.tier1.user.name || state.context.tier1.user.email || 'Team';
      const orgName = state.context.tier1.org.name || 'Our team';

      // --- AI-Powered Email Generation ---
      if (anthropicKey && (transcript || summary)) {
        console.log('[draft-followup-email] Generating AI-powered email with full context...');

        const prompt = buildFollowupEmailPrompt({
          repName,
          orgName,
          meetingTitle,
          transcript,
          summary,
          enrichment,
          actionItems: actionItemsOutput,
          intents: intentsOutput,
          callType: callTypeOutput,
        });

        const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 1500,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        if (anthropicResponse.ok) {
          const anthropicData = await anthropicResponse.json();

          // Cost tracking
          const usage = extractAnthropicUsage(anthropicData);
          await logAICostEvent(
            supabase,
            state.event.user_id,
            state.event.org_id,
            'anthropic',
            'claude-sonnet-4-5-20250929',
            usage.inputTokens,
            usage.outputTokens,
            'draft-followup-email',
            { meeting_id: meetingId },
          );

          const content = anthropicData.content?.[0]?.text || '';
          if (content) {
            let jsonText = content.trim();
            if (jsonText.startsWith('```')) {
              const lines = jsonText.split('\n');
              jsonText = lines.slice(1, -1).join('\n');
              if (jsonText.startsWith('json')) jsonText = jsonText.substring(4).trim();
            }

            try {
              const parsed = JSON.parse(jsonText);
              const emailDraft = {
                to: contactData.email,
                subject: parsed.subject || `Follow-up: ${meetingTitle}`,
                body: parsed.body || '',
                body_short: parsed.body_short || '',
                tone: parsed.tone || 'professional',
                framework: parsed.framework || 'acknowledge-advance',
                cc: state.event.payload.cc,
                bcc: state.event.payload.bcc,
                ai_generated: true,
              };

              console.log(`[draft-followup-email] AI email generated — tone=${emailDraft.tone}, framework=${emailDraft.framework}`);

              logAgentAction({
                supabaseClient: supabase as any,
                orgId: state.event.org_id,
                userId: state.event.user_id ?? null,
                agentType: 'meeting_ended',
                actionType: 'draft_generated',
                actionDetail: {
                  subject_preview: emailDraft.subject,
                  to: emailDraft.to,
                  ai_generated: true,
                  tone: emailDraft.tone,
                },
                outcome: 'success',
                chainId: state.event.parent_job_id ?? null,
              });

              return {
                success: true,
                output: {
                  email_draft: emailDraft,
                  to: contactData.email,
                  contact_name: enrichment.contact.name,
                  contact_title: enrichment.contact.title,
                  contact_company: enrichment.contact.company,
                  subject: emailDraft.subject,
                  tone: emailDraft.tone,
                  ai_generated: true,
                  context_used: {
                    has_transcript: !!transcript,
                    has_summary: !!summary,
                    recent_meetings: enrichment.recentMeetings.length,
                    recent_emails: enrichment.recentEmails.length,
                    recent_activities: enrichment.recentActivities.length,
                    has_deal: !!enrichment.dealContext,
                  },
                },
                duration_ms: Date.now() - start,
              };
            } catch (parseErr) {
              console.error('[draft-followup-email] Failed to parse AI response:', parseErr);
            }
          }
        } else {
          const errText = await anthropicResponse.text().catch(() => '');
          console.error('[draft-followup-email] Anthropic API error:', errText);
        }
      } else {
        console.log(`[draft-followup-email] AI skipped: key=${!!anthropicKey}, content=${!!(transcript || summary)}`);
      }

      // --- Fallback: Template-based email ---
      console.log('[draft-followup-email] Using template fallback');
      const actionItemsSummary = actionItemsOutput?.itemsCreated
        ? `We captured ${actionItemsOutput.itemsCreated} action item(s) from our discussion.`
        : '';

      const emailDraft = {
        to: contactData.email,
        subject: `Follow-up: ${meetingTitle}`,
        body: `Hi ${enrichment.contact.name || 'there'},\n\nThank you for taking the time to meet today. ${actionItemsSummary}\n\nLooking forward to our next steps.\n\nBest,\n${repName}`,
        cc: state.event.payload.cc,
        bcc: state.event.payload.bcc,
        ai_generated: false,
      };

      return {
        success: true,
        output: {
          email_draft: emailDraft,
          to: contactData.email,
          contact_name: enrichment.contact.name,
          subject: emailDraft.subject,
          ai_generated: false,
        },
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      console.error('[draft-followup-email] Error:', err);
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
