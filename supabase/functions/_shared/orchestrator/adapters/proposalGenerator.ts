/**
 * Proposal Generator Adapter
 *
 * Wraps the generate-proposal edge function for orchestrator use.
 * Generates proposal templates based on meeting context, deal info, and detected intents.
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { logAICostEvent, extractAnthropicUsage } from '../../costTracking.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getServiceClient } from './contextEnrichment.ts';

// =============================================================================
// detect-proposal-intent — PROP-001
// =============================================================================

/**
 * Detects a send_proposal commitment in detect-intents output and, when found,
 * calls generate-proposal with enriched deal-memory context to kick off an
 * async proposal job.  The resulting proposal_job_id is stored in the step
 * output so that the downstream HITL step (PROP-002) can surface it.
 *
 * Skip conditions (all return success with skipped:true, no error):
 *   - detect-intents step produced no output
 *   - no commitment of type 'send_proposal' found in commitments array
 *   - deal_id is unavailable (proposal has no CRM anchor)
 */
export const detectProposalIntentAdapter: SkillAdapter = {
  name: 'detect-proposal-intent',

  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();

    try {
      console.log('[detect-proposal-intent] Checking for send_proposal intent');

      // ---- 1. Read detect-intents output ----------------------------------
      const intentsOutput = state.outputs['detect-intents'] as
        | {
            commitments?: Array<{ intent?: string; type?: string; phrase?: string; source_quote?: string; confidence?: number }>;
            skipped?: boolean;
          }
        | undefined;

      if (!intentsOutput || intentsOutput.skipped) {
        console.log('[detect-proposal-intent] No detect-intents output, skipping');
        return {
          success: true,
          output: { skipped: true, reason: 'no_intents_output' },
          duration_ms: Date.now() - start,
        };
      }

      // ---- 2. Find send_proposal commitment --------------------------------
      const commitments = intentsOutput.commitments || [];
      const proposalCommitment = commitments.find(
        (c) => c.intent === 'send_proposal' || c.type === 'send_proposal',
      );

      if (!proposalCommitment) {
        console.log('[detect-proposal-intent] No send_proposal intent found, skipping');
        return {
          success: true,
          output: { skipped: true, reason: 'no_send_proposal_intent' },
          duration_ms: Date.now() - start,
        };
      }

      console.log(
        `[detect-proposal-intent] Found send_proposal intent (confidence=${proposalCommitment.confidence ?? 'n/a'})`,
      );

      // ---- 3. Require deal_id — proposal needs a CRM anchor ---------------
      const deal = state.context.tier2?.deal;
      if (!deal?.id) {
        console.warn('[detect-proposal-intent] No deal_id in context, cannot anchor proposal');
        return {
          success: true,
          output: { skipped: true, reason: 'no_deal_id' },
          duration_ms: Date.now() - start,
        };
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

      if (!supabaseUrl || !serviceKey) {
        throw new Error('Missing required environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      }

      // ---- 4. Assemble deal-memory context --------------------------------
      // Pull requirements, pricing tier, and company background from deal memory
      // (stored in deal_memory_events by the memory writer). Fall back to
      // whatever tier2 context is already loaded.
      const contact = state.context.tier2?.contact;
      const company = state.context.tier2?.company;

      let dealMemory: {
        requirements?: string;
        pricing_tier?: string;
        background?: string;
        commercial_summary?: string;
        objections?: string[];
      } = {};

      try {
        const supabase = createClient(supabaseUrl, serviceKey);
        const { data: memoryEvents } = await supabase
          .from('deal_memory_events')
          .select('event_type, content, category, created_at')
          .eq('deal_id', deal.id)
          .in('category', ['commercial', 'commitment', 'objection'])
          .order('created_at', { ascending: false })
          .limit(20);

        if (memoryEvents && memoryEvents.length > 0) {
          const commercialEvents = memoryEvents.filter((e: any) => e.category === 'commercial');
          const objectionEvents = memoryEvents.filter((e: any) => e.category === 'objection');

          dealMemory = {
            commercial_summary: commercialEvents.map((e: any) => e.content).join(' | '),
            objections: objectionEvents.slice(0, 5).map((e: any) => e.content),
          };
        }
      } catch (memErr) {
        console.warn('[detect-proposal-intent] Deal memory fetch failed (non-fatal):', memErr);
      }

      // ---- 5. Assemble transcript highlights from prior step outputs ------
      const actionItemsOutput = state.outputs['extract-action-items'] as any;
      const pricingOutput = state.outputs['extract-pricing-discussion'] as any;

      const meetingContext = {
        action_items: actionItemsOutput?.action_items || actionItemsOutput || [],
        intents: intentsOutput,
        commitments: commitments,
        pricing_discussion: pricingOutput || null,
        trigger_phrase: proposalCommitment.phrase || proposalCommitment.source_quote || null,
      };

      // ---- 6. Call generate-proposal with async job creation --------------
      const payload = {
        action: 'analyze_focus_areas',
        async: true,
        org_id: state.event.org_id,
        user_id: state.event.user_id,
        deal_id: deal.id,
        contact_id: contact?.id,
        contact_name: contact?.name,
        company_name: company?.name || contact?.company,
        transcripts: state.context.tier2?.meetingHistory?.[0]?.transcript
          ? [state.context.tier2.meetingHistory[0].transcript.substring(0, 5000)]
          : [],
        deal_context: {
          name: deal.name,
          value: deal.value,
          stage: deal.stage,
          expected_close_date: deal.expected_close_date,
          requirements: dealMemory.requirements,
          pricing_tier: dealMemory.pricing_tier,
          background: dealMemory.background,
          commercial_summary: dealMemory.commercial_summary,
          objections: dealMemory.objections,
        },
        meeting_context: meetingContext,
        intent_data: intentsOutput,
        trigger_phrase: proposalCommitment.phrase || proposalCommitment.source_quote,
      };

      const response = await fetch(`${supabaseUrl}/functions/v1/generate-proposal`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        // Degrade gracefully — proposal generation failing should not block the
        // rest of the meeting_ended sequence.
        console.warn(`[detect-proposal-intent] generate-proposal returned ${response.status}: ${errorText}`);
        return {
          success: true,
          output: {
            skipped: true,
            reason: 'generate_proposal_error',
            http_status: response.status,
          },
          duration_ms: Date.now() - start,
        };
      }

      const result = await response.json();

      const proposalJobId: string | undefined =
        result.job_id ?? result.proposal_job_id ?? undefined;

      console.log(
        `[detect-proposal-intent] Proposal job created: job_id=${proposalJobId ?? 'sync_response'}`,
      );

      return {
        success: true,
        output: {
          proposal_job_id: proposalJobId,
          deal_id: deal.id,
          deal_name: deal.name,
          trigger_phrase: proposalCommitment.phrase || proposalCommitment.source_quote,
          confidence: proposalCommitment.confidence,
          // Pass generate-proposal's full response in case caller needs it
          generate_proposal_response: result,
        },
        duration_ms: Date.now() - start,
      };
    } catch (error) {
      console.error('[detect-proposal-intent] Error:', error);
      // Fire-and-forget pattern — return success with error detail so the
      // orchestrator continues the rest of the meeting_ended sequence.
      return {
        success: true,
        output: {
          skipped: true,
          reason: 'unexpected_error',
          error: error instanceof Error ? error.message : String(error),
        },
        duration_ms: Date.now() - start,
      };
    }
  },
};

export const proposalGeneratorAdapter: SkillAdapter = {
  name: 'select-proposal-template',

  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();

    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

      if (!supabaseUrl || !serviceKey) {
        throw new Error('Missing required environment variables');
      }

      // Prepare payload for generate-proposal
      const payload = {
        action: 'analyze_focus_areas',
        org_id: state.event.org_id,
        user_id: state.event.user_id,
        deal_id: state.context.tier2?.deal?.id,
        contact_id: state.context.tier2?.contact?.id,
        trigger_phrase: state.event.payload.trigger_phrase as string | undefined,
        meeting_context: state.outputs['extract-action-items'] || {},
        intent_data: state.outputs['detect-intents'] || {},
        transcripts: state.context.tier1?.transcript ? [state.context.tier1.transcript.substring(0, 5000)] : [],
      };

      // Call generate-proposal edge function
      const response = await fetch(`${supabaseUrl}/functions/v1/generate-proposal`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`generate-proposal returned ${response.status}: ${errorText}`);
      }

      const result = await response.json();

      return {
        success: true,
        output: result,
        duration_ms: Date.now() - start,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: Date.now() - start,
      };
    }
  },
};

export const populateProposalAdapter: SkillAdapter = {
  name: 'populate-proposal',

  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();

    try {
      console.log('[populate-proposal] Starting proposal population');

      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

      if (!supabaseUrl || !serviceKey) {
        throw new Error('Missing required environment variables');
      }

      // Get template selection from previous step
      const templateData = state.outputs['select-proposal-template'];
      if (!templateData) {
        throw new Error('No template data found from select-proposal-template step');
      }

      // Extract CRM data from tier2 context
      const deal = state.context.tier2?.deal;
      const contact = state.context.tier2?.contact;
      const company = state.context.tier2?.company;

      // Build context objects
      const dealContext = deal ? {
        name: deal.name,
        value: deal.value,
        stage: deal.stage,
        expected_close_date: deal.expected_close_date,
      } : undefined;

      const contactContext = contact ? {
        name: contact.name,
        email: contact.email,
        title: contact.title,
        company: company?.name,
      } : undefined;

      // Get meeting context from previous steps
      const actionItems = state.outputs['extract-action-items'];
      const intents = state.outputs['detect-intents'];

      const meetingContext = {
        action_items: actionItems || [],
        intents: intents || {},
        commitments: intents?.commitments || [],
      };

      // Prepare payload for generate-proposal
      const payload = {
        action: 'populate_template',
        org_id: state.event.org_id,
        user_id: state.event.user_id,
        deal_id: deal?.id,
        contact_id: contact?.id,
        template_data: templateData,
        deal_context: dealContext,
        contact_context: contactContext,
        meeting_context: meetingContext,
      };

      console.log('[populate-proposal] Calling generate-proposal edge function');

      // Call generate-proposal edge function
      const response = await fetch(`${supabaseUrl}/functions/v1/generate-proposal`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`generate-proposal returned ${response.status}: ${errorText}`);
      }

      const result = await response.json();

      console.log('[populate-proposal] Successfully populated proposal');

      return {
        success: true,
        output: result,
        duration_ms: Date.now() - start,
      };
    } catch (error) {
      console.error('[populate-proposal] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: Date.now() - start,
      };
    }
  },
};

export const generateCustomSectionsAdapter: SkillAdapter = {
  name: 'generate-custom-sections',

  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();

    try {
      console.log('[generate-custom-sections] Starting custom section generation');

      const apiKey = Deno.env.get('ANTHROPIC_API_KEY');

      // Get populated proposal from previous step
      const proposalData = state.outputs['populate-proposal'] as any;
      if (!proposalData) {
        throw new Error('No proposal data found from populate-proposal step');
      }

      // Get deal context from tier2
      const deal = state.context.tier2?.deal;
      const dealName = deal?.name || 'Untitled Deal';
      const dealValue = deal?.value ? `$${deal.value.toLocaleString()}` : 'N/A';
      const dealStage = deal?.stage || 'Unknown';

      // Get meeting context
      const actionItems = state.outputs['extract-action-items'];
      const intents = state.outputs['detect-intents'];

      // If no API key, return fallback sections
      if (!apiKey) {
        console.log('[generate-custom-sections] No ANTHROPIC_API_KEY found, using fallback sections');
        return {
          success: true,
          output: {
            executive_summary: 'Executive summary will be generated when API key is configured.',
            roi_projections: 'ROI projections will be generated when API key is configured.',
            custom_sections: [
              { title: 'Next Steps', content: 'To be customized based on your specific needs.' },
            ],
          },
          duration_ms: Date.now() - start,
        };
      }

      // Build prompt for Claude
      const promptText = `
Generate custom proposal sections for this deal:

DEAL CONTEXT:
- Name: ${dealName}
- Value: ${dealValue}
- Stage: ${dealStage}

PROPOSAL DATA:
${JSON.stringify(proposalData, null, 2)}

MEETING CONTEXT:
${actionItems ? `Action Items: ${JSON.stringify(actionItems)}` : ''}
${intents ? `Intents: ${JSON.stringify(intents)}` : ''}

Please generate:
1. executive_summary: A 2-3 paragraph executive summary tailored to the prospect, highlighting key value propositions and how our solution addresses their specific needs
2. roi_projections: Quantified value propositions and ROI estimates based on the deal context and meeting insights
3. custom_sections: An array of additional relevant sections (each with "title" and "content" fields)

Return ONLY valid JSON with this structure:
{
  "executive_summary": "...",
  "roi_projections": "...",
  "custom_sections": [{"title": "...", "content": "..."}]
}
`;

      console.log('[generate-custom-sections] Calling Claude API');

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2048,
          temperature: 0.4,
          system: 'You are a proposal writer. Generate compelling, tailored proposal sections based on deal context and meeting insights. Return ONLY valid JSON.',
          messages: [{ role: 'user', content: promptText }],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Claude API returned ${response.status}: ${errorText}`);
      }

      const result = await response.json();

      // Cost tracking
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (supabaseUrl && serviceKey) {
        const supabase = createClient(supabaseUrl, serviceKey);
        const usage = extractAnthropicUsage(result);
        await logAICostEvent(
          supabase,
          state.event.user_id,
          state.event.org_id,
          'anthropic',
          'claude-haiku-4-5-20251001',
          usage.inputTokens,
          usage.outputTokens,
          'generate-proposal',
          { deal_id: state.context.tier2?.deal?.id },
        );
      }

      const textContent = result.content?.[0]?.text || '';

      // Parse JSON from response
      const jsonMatch = textContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in Claude response');
      }

      const parsedResult = JSON.parse(jsonMatch[0]);

      console.log('[generate-custom-sections] Successfully generated custom sections');

      return {
        success: true,
        output: parsedResult,
        duration_ms: Date.now() - start,
      };
    } catch (error) {
      console.error('[generate-custom-sections] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: Date.now() - start,
      };
    }
  },
};

// =============================================================================
// proposal-approval — PROP-002
// =============================================================================

/**
 * Sends a Slack HITL message for rep approval of a generated proposal.
 *
 * Reads the proposal_job_id from detect-proposal-intent output, queries the
 * proposal_jobs table for content, creates a hitl_pending_approvals row, and
 * sends a Slack DM with [Approve & Send] [Edit in 60] [Skip] buttons.
 *
 * Skip conditions (all return success with skipped:true, no error):
 *   - detect-proposal-intent step was skipped or produced no proposal_job_id
 *   - no Slack integration / user mapping found
 *   - proposal_jobs row not found or not yet complete (graceful fallback)
 */

// Block Kit helpers (copied from emailDraftApproval.ts)
function _paHeader(text: string) {
  return {
    type: 'header',
    text: { type: 'plain_text', text: text.substring(0, 150), emoji: false },
  };
}

function _paSection(text: string) {
  return {
    type: 'section',
    text: { type: 'mrkdwn', text: text.substring(0, 3000) },
  };
}

function _paDivider() {
  return { type: 'divider' };
}

function _paContextBlock(elements: string[]) {
  return {
    type: 'context',
    elements: elements.map((t) => ({ type: 'mrkdwn', text: t.substring(0, 300) })),
  };
}

function _paButton(
  text: string,
  actionId: string,
  value: string,
  style?: 'primary' | 'danger',
  url?: string,
): unknown {
  const btn: Record<string, unknown> = {
    type: 'button',
    text: { type: 'plain_text', text: text.substring(0, 75), emoji: false },
    action_id: actionId,
    value,
  };
  if (style) btn.style = style;
  if (url) btn.url = url;
  return btn;
}

function _paActionsBlock(blockId: string, elements: unknown[]) {
  return { type: 'actions', block_id: blockId, elements };
}

function buildProposalApprovalBlocks(params: {
  approvalId: string;
  dealName: string;
  contactName: string;
  meetingTitle: string;
  executiveSummary: string;
  pricingSection: string | null;
  appUrl: string;
}): unknown[] {
  const { approvalId, dealName, contactName, meetingTitle, executiveSummary, pricingSection, appUrl } = params;

  const summaryPreview = executiveSummary.length > 500
    ? executiveSummary.substring(0, 500) + '...'
    : executiveSummary;

  const editUrl = `${appUrl}/deals?proposal_approval=${approvalId}`;

  const blocks: unknown[] = [
    _paHeader('Proposal Ready for Review'),
    _paContextBlock([`Deal: *${dealName}* | Contact: ${contactName} | Meeting: ${meetingTitle}`]),
    _paDivider(),
    _paSection(`*Executive Summary*\n${summaryPreview}`),
  ];

  if (pricingSection) {
    blocks.push(_paDivider());
    const pricingPreview = pricingSection.length > 500
      ? pricingSection.substring(0, 500) + '...'
      : pricingSection;
    blocks.push(_paSection(`*Pricing*\n${pricingPreview}`));
  }

  blocks.push(_paDivider());

  // Three buttons — each in its own actionsBlock to avoid action_id conflicts
  blocks.push(
    _paActionsBlock(`proposal_approval_approve_${approvalId}`, [
      _paButton('Approve & Send', `approve::proposal::${approvalId}`, JSON.stringify({ approvalId }), 'primary'),
    ]),
  );
  blocks.push(
    _paActionsBlock(`proposal_approval_edit_${approvalId}`, [
      _paButton('Edit in 60', `edit::proposal::${approvalId}`, JSON.stringify({ approvalId }), undefined, editUrl),
    ]),
  );
  blocks.push(
    _paActionsBlock(`proposal_approval_skip_${approvalId}`, [
      _paButton('Skip', `reject::proposal::${approvalId}`, JSON.stringify({ approvalId, subAction: 'skip' }), 'danger'),
    ]),
  );

  blocks.push(_paContextBlock(['Expires in 24 hours | View full proposal in Sixty']));

  return blocks;
}

export const proposalApprovalAdapter: SkillAdapter = {
  name: 'proposal-approval',

  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      const appUrl = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://app.use60.com';
      const supabase = getServiceClient();

      // --- 1. Read detect-proposal-intent output ---
      const intentOutput = state.outputs['detect-proposal-intent'] as
        | {
            skipped?: boolean;
            proposal_job_id?: string;
            deal_id?: string;
            deal_name?: string;
            trigger_phrase?: string;
            generate_proposal_response?: Record<string, unknown>;
          }
        | undefined;

      if (!intentOutput || intentOutput.skipped || !intentOutput.proposal_job_id) {
        console.log('[proposal-approval] No proposal job from detect-proposal-intent, skipping');
        return {
          success: true,
          output: { skipped: true, reason: 'no_proposal_job_id' },
          duration_ms: Date.now() - start,
        };
      }

      const proposalJobId = intentOutput.proposal_job_id;
      const deal = state.context.tier2?.deal;
      const contact = state.context.tier2?.contact;
      const dealName = intentOutput.deal_name || deal?.name || 'Untitled Deal';
      const contactName = contact?.name || 'the prospect';
      const meetingTitle = (state.event.payload.title as string | undefined) || 'Our meeting';
      const meetingId = state.event.payload.meeting_id as string | undefined;

      // --- 2. Try to fetch proposal content from proposal_jobs table ---
      let executiveSummary = 'Executive summary will be available once the proposal is generated.';
      let pricingSection: string | null = null;

      try {
        const { data: jobRow } = await supabase
          .from('proposal_jobs')
          .select('status, result, executive_summary, pricing_section, content')
          .eq('id', proposalJobId)
          .maybeSingle();

        if (jobRow) {
          // Accept completed or in-progress (show preview if available)
          const summary =
            jobRow.executive_summary ||
            (jobRow.result as Record<string, unknown> | null)?.executive_summary ||
            (jobRow.content as Record<string, unknown> | null)?.executive_summary;

          const pricing =
            jobRow.pricing_section ||
            (jobRow.result as Record<string, unknown> | null)?.pricing_section ||
            (jobRow.content as Record<string, unknown> | null)?.pricing_section;

          if (typeof summary === 'string' && summary.trim()) {
            executiveSummary = summary;
          }
          if (typeof pricing === 'string' && pricing.trim()) {
            pricingSection = pricing;
          }
        }
      } catch (fetchErr) {
        console.warn('[proposal-approval] Failed to fetch proposal_jobs row (non-fatal):', fetchErr);
      }

      // --- 3. Get Slack credentials for DM delivery ---
      const { data: slackIntegration } = await supabase
        .from('slack_integrations')
        .select('access_token')
        .eq('user_id', state.event.user_id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      const { data: slackMapping } = await supabase
        .from('slack_user_mappings')
        .select('slack_user_id')
        .eq('org_id', state.event.org_id)
        .eq('sixty_user_id', state.event.user_id)
        .maybeSingle();

      const botToken = slackIntegration?.access_token;
      const recipientSlackUserId = slackMapping?.slack_user_id;

      if (!botToken || !recipientSlackUserId) {
        console.log('[proposal-approval] No Slack credentials — skipping HITL step');
        return {
          success: true,
          output: { skipped: true, reason: 'no_slack_integration' },
          duration_ms: Date.now() - start,
        };
      }

      // --- 4. Open DM channel with the rep ---
      const dmResponse = await fetch('https://slack.com/api/conversations.open', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${botToken}`,
        },
        body: JSON.stringify({ users: recipientSlackUserId }),
      });

      const dmData = await dmResponse.json();
      const dmChannelId = dmData.channel?.id;
      const slackTeamId = dmData.channel?.context_team_id || '';

      if (!dmChannelId) {
        console.warn('[proposal-approval] Failed to open DM channel:', dmData.error);
        return {
          success: true,
          output: { skipped: true, reason: 'slack_dm_failed' },
          duration_ms: Date.now() - start,
        };
      }

      // --- 5. Create hitl_pending_approvals row (get real ID before building blocks) ---
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const { data: approval, error: approvalError } = await supabase
        .from('hitl_pending_approvals')
        .insert({
          org_id: state.event.org_id,
          user_id: state.event.user_id,
          created_by: state.event.user_id,
          resource_type: 'proposal',
          resource_id: intentOutput.deal_id || deal?.id || state.event.org_id,
          resource_name: `Proposal: ${dealName}`,
          slack_team_id: slackTeamId,
          slack_channel_id: dmChannelId,
          slack_message_ts: '', // updated after message is sent
          status: 'pending',
          original_content: {
            proposal_job_id: proposalJobId,
            deal_id: intentOutput.deal_id || deal?.id,
            deal_name: dealName,
            contact_name: contactName,
            meeting_id: meetingId,
            meeting_title: meetingTitle,
            executive_summary: executiveSummary,
            pricing_section: pricingSection,
            trigger_phrase: intentOutput.trigger_phrase,
          },
          callback_type: 'edge_function',
          callback_target: 'hitl-send-followup-email',
          callback_metadata: {
            proposal_job_id: proposalJobId,
            meeting_id: meetingId,
            job_id: (state as any).job_id || null,
            sequence_type: 'meeting_ended',
          },
          expires_at: expiresAt,
          metadata: {
            sequence_type: 'meeting_ended',
            step: 'proposal-approval',
            meeting_id: meetingId,
            proposal_job_id: proposalJobId,
          },
        })
        .select('id')
        .single();

      if (approvalError || !approval?.id) {
        console.error('[proposal-approval] Failed to create hitl_pending_approvals row:', approvalError);
        return {
          success: true,
          output: { skipped: true, reason: 'approval_insert_failed', error: approvalError?.message },
          duration_ms: Date.now() - start,
        };
      }

      const approvalId = approval.id;

      // --- 6. Build and send Slack Block Kit message ---
      const blocks = buildProposalApprovalBlocks({
        approvalId,
        dealName,
        contactName,
        meetingTitle,
        executiveSummary,
        pricingSection,
        appUrl,
      });

      const fallbackText = `Proposal ready for review: ${dealName} — ${contactName}`;

      const slackResponse = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${botToken}`,
        },
        body: JSON.stringify({
          channel: dmChannelId,
          text: fallbackText,
          blocks,
        }),
      });

      const slackResult = await slackResponse.json();

      if (!slackResult.ok) {
        console.error('[proposal-approval] Slack postMessage failed:', slackResult.error);
        // Clean up the approval row since Slack delivery failed
        await supabase.from('hitl_pending_approvals').delete().eq('id', approvalId);
        return {
          success: true,
          output: { skipped: true, reason: 'slack_post_failed', error: slackResult.error },
          duration_ms: Date.now() - start,
        };
      }

      // --- 7. Update approval row with actual Slack message timestamp ---
      await supabase
        .from('hitl_pending_approvals')
        .update({ slack_message_ts: slackResult.ts || '', updated_at: new Date().toISOString() })
        .eq('id', approvalId);

      console.log(
        `[proposal-approval] HITL approval created: id=${approvalId}, ` +
        `deal=${dealName}, slack_ts=${slackResult.ts}`,
      );

      return {
        success: true,
        output: {
          approval_id: approvalId,
          deal_name: dealName,
          contact_name: contactName,
          proposal_job_id: proposalJobId,
          slack_message_ts: slackResult.ts,
          slack_channel_id: dmChannelId,
          hitl_created: true,
        },
        duration_ms: Date.now() - start,
        // Signal the runner to pause and wait for human approval
        pending_approval: {
          step_name: 'proposal-approval',
          action_type: 'proposal',
          preview: `Proposal for ${dealName} — ${contactName}`,
          slack_pending_action_id: approvalId,
          created_at: new Date().toISOString(),
        },
      };
    } catch (err) {
      console.error('[proposal-approval] Error:', err);
      // Non-fatal: return success with skipped so the sequence can continue
      return {
        success: true,
        output: { skipped: true, reason: 'unexpected_error', error: String(err) },
        duration_ms: Date.now() - start,
      };
    }
  },
};

export const presentForReviewAdapter: SkillAdapter = {
  name: 'present-for-review',

  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();

    try {
      console.log('[present-for-review] Presenting proposal for review');

      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

      if (!supabaseUrl || !serviceKey) {
        throw new Error('Missing required environment variables');
      }

      // Get proposal data
      const proposalData = state.outputs['populate-proposal'] as any;
      const customSections = state.outputs['generate-custom-sections'] as any;

      if (!proposalData) {
        throw new Error('No proposal data found');
      }

      // Get deal context
      const deal = state.context.tier2?.deal;
      const company = state.context.tier2?.company;
      const dealId = deal?.id || 'unknown';
      const dealName = deal?.name || 'Untitled Deal';
      const companyName = company?.name || 'Unknown Company';
      const dealValue = deal?.value ? `$${deal.value.toLocaleString()}` : 'N/A';

      // Get executive summary preview (first 500 chars)
      const executiveSummary = customSections?.executive_summary || 'No executive summary available';
      const summaryPreview = executiveSummary.length > 500
        ? executiveSummary.substring(0, 500) + '...'
        : executiveSummary;

      // Build Slack blocks
      const slackBlocks = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '📄 Proposal Ready for Review',
            emoji: true,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Deal:*\n${dealName}`,
            },
            {
              type: 'mrkdwn',
              text: `*Company:*\n${companyName}`,
            },
            {
              type: 'mrkdwn',
              text: `*Value:*\n${dealValue}`,
            },
            {
              type: 'mrkdwn',
              text: `*Stage:*\n${deal?.stage || 'N/A'}`,
            },
          ],
        },
        {
          type: 'divider',
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Executive Summary Preview:*\n${summaryPreview}`,
          },
        },
        {
          type: 'divider',
        },
        {
          type: 'actions',
          block_id: `proposal_review::${dealId}`,
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '✅ Approve & Send',
                emoji: true,
              },
              style: 'primary',
              action_id: `proposal_approve::${dealId}`,
              value: dealId,
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '✏️ Edit',
                emoji: true,
              },
              action_id: `proposal_edit::${dealId}`,
              value: dealId,
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '⏭️ Skip',
                emoji: true,
              },
              style: 'danger',
              action_id: `proposal_skip::${dealId}`,
              value: dealId,
            },
          ],
        },
      ];

      const fallbackText = `Proposal ready for review: ${dealName} (${companyName}) - ${dealValue}`;

      // Call send-slack-message edge function
      const response = await fetch(`${supabaseUrl}/functions/v1/send-slack-message`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          org_id: state.event.org_id,
          user_id: state.event.user_id,
          message: fallbackText,
          blocks: slackBlocks,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[present-for-review] Slack delivery failed (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      const slackDelivered = response.ok && result.success;

      console.log(`[present-for-review] Slack delivery: ${slackDelivered}`);

      return {
        success: true,
        output: {
          proposal_preview_sent: true,
          slack_delivered: slackDelivered,
          slack_ts: result.slack_ts,
          deal_id: dealId,
          deal_name: dealName,
        },
        duration_ms: Date.now() - start,
        pending_approval: {
          step_name: 'present-for-review',
          action_type: 'proposal_review',
          preview: `Proposal for ${dealName} ready for review`,
          created_at: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error('[present-for-review] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: Date.now() - start,
      };
    }
  },
};
