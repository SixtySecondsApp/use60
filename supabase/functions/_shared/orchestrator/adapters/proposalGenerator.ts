/**
 * Proposal Generator Adapter
 *
 * Wraps the generate-proposal edge function for orchestrator use.
 * Generates proposal templates based on meeting context, deal info, and detected intents.
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';

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
