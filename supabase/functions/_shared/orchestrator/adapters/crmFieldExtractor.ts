/**
 * CRM Field Extractor Adapter
 *
 * AI-powered deal field extraction from meeting transcripts and action items.
 * Analyzes conversations to detect stage progression, next steps, timeline changes,
 * stakeholder mentions, blockers, and other CRM-relevant signals.
 *
 * Uses Claude Haiku 4.5 for structured field change extraction with confidence scoring.
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { logAICostEvent, extractAnthropicUsage } from '../../costTracking.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

// =============================================================================
// Types
// =============================================================================

export interface DealFieldChange {
  field_name: string;
  old_value: unknown;
  new_value: unknown;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

export interface FieldExtractionResult {
  fields_changed: DealFieldChange[];
  no_change_reason?: string;
}

// =============================================================================
// Adapter
// =============================================================================

export const crmFieldExtractorAdapter: SkillAdapter = {
  name: 'extract-crm-fields',

  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();

    try {
      console.log('[extract-crm-fields] Starting CRM field extraction...');

      const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
      if (!apiKey) {
        console.warn('[extract-crm-fields] No ANTHROPIC_API_KEY, skipping extraction');
        return {
          success: true,
          output: {
            fields_changed: [],
            no_change_reason: 'API key not configured',
          },
          duration_ms: Date.now() - start,
        };
      }

      // --- Gather inputs from context and upstream outputs ---

      // Get current deal
      const currentDeal = state.context.tier2?.deal;
      if (!currentDeal) {
        console.log('[extract-crm-fields] No deal in context, skipping');
        return {
          success: true,
          output: {
            fields_changed: [],
            no_change_reason: 'No deal associated with meeting',
          },
          duration_ms: Date.now() - start,
        };
      }

      // Get transcript from tier2 or meeting context
      let transcript = state.context.tier2?.meetingHistory?.[0]?.transcript || '';
      const meetingId = state.event.payload.meeting_id as string | undefined;

      // If no transcript in tier2, try direct query
      if (!transcript && meetingId) {
        try {
          const supabaseUrl = Deno.env.get('SUPABASE_URL');
          const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

          if (supabaseUrl && serviceKey) {
            const response = await fetch(`${supabaseUrl}/rest/v1/meetings?id=eq.${meetingId}&select=transcript_text`, {
              headers: {
                'apikey': serviceKey,
                'Authorization': `Bearer ${serviceKey}`,
              },
            });

            if (response.ok) {
              const data = await response.json();
              if (data?.[0]?.transcript_text) {
                transcript = data[0].transcript_text;
              }
            }
          }
        } catch (err) {
          console.warn('[extract-crm-fields] Failed to fetch transcript:', err);
        }
      }

      if (!transcript || transcript.trim().length === 0) {
        console.log('[extract-crm-fields] No transcript available, skipping');
        return {
          success: true,
          output: {
            fields_changed: [],
            no_change_reason: 'No transcript available',
          },
          duration_ms: Date.now() - start,
        };
      }

      // Get action items from upstream extract-action-items step
      const actionItemsOutput = state.outputs['extract-action-items'] as {
        action_items?: Array<{ text?: string; title?: string; assigned_to?: string; assignee_name?: string }>;
      } | undefined;

      const actionItems = (actionItemsOutput?.action_items || []).map((item) => ({
        text: item.text || item.title || 'Untitled action',
        assigned_to: item.assigned_to || item.assignee_name,
      }));

      // Get detected intents from upstream detect-intents step
      const intentsOutput = state.outputs['detect-intents'] as Record<string, unknown> | undefined;
      const intents = intentsOutput || {};

      // Get org context for pipeline stages
      const orgContext = {
        pipeline_stages: await getPipelineStages(state.event.org_id),
        company_name: state.context.tier1.org.company_name || state.context.tier1.org.name,
      };

      console.log(
        `[extract-crm-fields] Context: deal=${currentDeal.name}, ` +
        `transcript_length=${transcript.length}, ` +
        `action_items=${actionItems.length}, ` +
        `pipeline_stages=${orgContext.pipeline_stages?.length || 0}`,
      );

      // --- Build AI prompt ---

      const truncatedTranscript = truncateTranscript(transcript, 3000);
      const prompt = buildExtractionPrompt({
        transcript: truncatedTranscript,
        actionItems,
        intents,
        currentDeal: {
          id: currentDeal.id,
          name: currentDeal.name,
          stage: currentDeal.stage,
          value: currentDeal.value,
          probability: currentDeal.probability,
          expected_close_date: currentDeal.expected_close_date,
          last_activity_at: currentDeal.last_activity_at,
        },
        orgContext,
      });

      // --- Call Claude Haiku for field extraction ---

      console.log('[extract-crm-fields] Calling Claude Haiku...');
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
          temperature: 0.1,
          system: buildSystemPrompt(),
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
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
          'extract-crm-fields',
          { meeting_id: meetingId },
        );
      }

      const textContent = result.content?.[0]?.text;

      if (!textContent) {
        throw new Error('No text content in Claude response');
      }

      // Parse JSON from response
      const extractionResult = parseExtractionResult(textContent);

      // Filter to only medium and high confidence changes
      const filteredChanges = extractionResult.fields_changed.filter(
        (change) => change.confidence === 'medium' || change.confidence === 'high',
      );

      console.log(
        `[extract-crm-fields] Extraction complete: ` +
        `${filteredChanges.length}/${extractionResult.fields_changed.length} changes (filtered to medium+ confidence)`,
      );

      return {
        success: true,
        output: {
          fields_changed: filteredChanges,
          no_change_reason: filteredChanges.length === 0 ? extractionResult.no_change_reason : undefined,
        },
        duration_ms: Date.now() - start,
      };
    } catch (error) {
      console.error('[extract-crm-fields] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        output: {
          fields_changed: [],
          no_change_reason: `Extraction failed: ${error instanceof Error ? error.message : String(error)}`,
        },
        duration_ms: Date.now() - start,
      };
    }
  },
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Truncate transcript intelligently to fit token budget.
 * Keeps first 1500 + last 1500 chars if over 3000 total.
 */
function truncateTranscript(transcript: string, maxChars: number): string {
  if (transcript.length <= maxChars) {
    return transcript;
  }

  const halfLimit = Math.floor(maxChars / 2);
  const firstPart = transcript.slice(0, halfLimit);
  const lastPart = transcript.slice(-halfLimit);

  return `${firstPart}\n\n[... middle of transcript truncated ...]\n\n${lastPart}`;
}

/**
 * Get pipeline stages for the organization
 */
async function getPipelineStages(orgId: string): Promise<string[] | undefined> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceKey) {
      return undefined;
    }

    const response = await fetch(
      `${supabaseUrl}/rest/v1/deal_stages?organization_id=eq.${orgId}&select=name&order=display_order.asc`,
      {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
      },
    );

    if (!response.ok) {
      return undefined;
    }

    const stages = await response.json();
    return stages.map((s: { name: string }) => s.name);
  } catch {
    return undefined;
  }
}

/**
 * Build system prompt for Claude
 */
function buildSystemPrompt(): string {
  return [
    'You are a CRM field extraction specialist for sales teams.',
    'Your job is to analyze meeting transcripts and action items to identify CRM deal field updates.',
    '',
    'Extract only factual information explicitly discussed in the conversation.',
    'Do not infer or speculate beyond what was clearly stated.',
    'Assign confidence levels honestly: high = directly stated, medium = strongly implied, low = weakly implied.',
    '',
    'Return ONLY valid JSON matching the specified schema. No markdown formatting, no explanations outside the JSON.',
  ].join('\n');
}

/**
 * Build extraction prompt
 */
function buildExtractionPrompt(params: {
  transcript: string;
  actionItems: Array<{ text: string; assigned_to?: string }>;
  intents: Record<string, unknown>;
  currentDeal: {
    id: string;
    name: string;
    stage?: string;
    value?: number;
    probability?: number;
    expected_close_date?: string;
    last_activity_at?: string;
  };
  orgContext: {
    pipeline_stages?: string[];
    company_name?: string;
  };
}): string {
  const sections: string[] = [];

  sections.push('# CRM FIELD EXTRACTION TASK');
  sections.push('');
  sections.push('Analyze the following meeting data and extract CRM deal field changes.');
  sections.push('');

  // Current deal state
  sections.push('## Current Deal Record');
  sections.push(`Name: ${params.currentDeal.name}`);
  sections.push(`Current Stage: ${params.currentDeal.stage || 'Not set'}`);
  sections.push(`Current Value: ${params.currentDeal.value ? `$${params.currentDeal.value.toLocaleString()}` : 'Not set'}`);
  sections.push(`Current Close Date: ${params.currentDeal.expected_close_date || 'Not set'}`);
  sections.push(`Current Probability: ${params.currentDeal.probability !== undefined ? `${params.currentDeal.probability}%` : 'Not set'}`);
  sections.push('');

  // Pipeline stages context
  if (params.orgContext.pipeline_stages && params.orgContext.pipeline_stages.length > 0) {
    sections.push('## Available Pipeline Stages (in order)');
    params.orgContext.pipeline_stages.forEach((stage, idx) => {
      sections.push(`${idx + 1}. ${stage}`);
    });
    sections.push('');
  }

  // Company context
  if (params.orgContext.company_name) {
    sections.push(`## Selling Organization: ${params.orgContext.company_name}`);
    sections.push('');
  }

  // Transcript
  sections.push('## Meeting Transcript');
  sections.push('```');
  sections.push(params.transcript);
  sections.push('```');
  sections.push('');

  // Action items
  if (params.actionItems.length > 0) {
    sections.push('## Extracted Action Items');
    params.actionItems.forEach((item, idx) => {
      sections.push(`${idx + 1}. ${item.text}${item.assigned_to ? ` (assigned to: ${item.assigned_to})` : ''}`);
    });
    sections.push('');
  }

  // Detected intents
  if (Object.keys(params.intents).length > 0) {
    sections.push('## Detected Intents');
    sections.push('```json');
    sections.push(JSON.stringify(params.intents, null, 2));
    sections.push('```');
    sections.push('');
  }

  // Extraction instructions
  sections.push('---');
  sections.push('');
  sections.push('## EXTRACTION INSTRUCTIONS');
  sections.push('');
  sections.push('Analyze the conversation for updates to these CRM fields:');
  sections.push('');
  sections.push('1. **stage** — Pipeline stage changes');
  sections.push('   - Only suggest stage changes if explicitly discussed or strongly implied');
  sections.push('   - Match to available pipeline stages listed above');
  sections.push('   - Common signals: "moving to demo phase", "ready to present proposal", "contract signed"');
  sections.push('');
  sections.push('2. **next_steps** — Concrete next actions with owners and dates');
  sections.push('   - Extract specific commitments made by either party');
  sections.push('   - Format: "Action by Person on Date" or "Action by Person (timeline)"');
  sections.push('   - Example: "Send pricing proposal by Sarah on Friday"');
  sections.push('');
  sections.push('3. **close_date** — Expected close date / timeline');
  sections.push('   - Only extract if a specific date or timeframe was mentioned');
  sections.push('   - Format: YYYY-MM-DD or relative ("end of Q1 2026")');
  sections.push('   - Common signals: "hoping to close by", "target is", "need this live by"');
  sections.push('');
  sections.push('4. **deal_value** — Deal size / contract value');
  sections.push('   - Extract if pricing was discussed or changed');
  sections.push('   - Include currency if mentioned, otherwise assume USD');
  sections.push('   - Common signals: "budget of $X", "annual contract value", "X seats at $Y each"');
  sections.push('');
  sections.push('5. **stakeholders_mentioned** — New people referenced in conversation');
  sections.push('   - Names and roles of decision makers, influencers, or champions');
  sections.push('   - Example: "Need approval from Jane (CFO)"');
  sections.push('');
  sections.push('6. **blockers** — Risks, concerns, or obstacles flagged');
  sections.push('   - Objections, competitive threats, or internal barriers');
  sections.push('   - Example: "Budget freeze until next quarter"');
  sections.push('');
  sections.push('7. **summary** — Concise meeting summary (2-3 sentences)');
  sections.push('   - High-level overview of what was discussed');
  sections.push('   - Focus on business outcomes, not transcript details');
  sections.push('');
  sections.push('## OUTPUT FORMAT');
  sections.push('');
  sections.push('Return JSON with this structure:');
  sections.push('```json');
  sections.push('{');
  sections.push('  "fields_changed": [');
  sections.push('    {');
  sections.push('      "field_name": "stage",');
  sections.push('      "old_value": "Discovery",');
  sections.push('      "new_value": "Demo",');
  sections.push('      "confidence": "high",');
  sections.push('      "reasoning": "Prospect explicitly said \'ready to see a demo\'"');
  sections.push('    }');
  sections.push('  ],');
  sections.push('  "no_change_reason": "No CRM-relevant signals detected" // only if fields_changed is empty');
  sections.push('}');
  sections.push('```');
  sections.push('');
  sections.push('Confidence levels:');
  sections.push('- **high**: Directly stated in conversation ("we want to close by March 15")');
  sections.push('- **medium**: Strongly implied ("hopefully wrap this up before quarter end")');
  sections.push('- **low**: Weakly implied or uncertain');
  sections.push('');
  sections.push('If no field changes are detected, return empty fields_changed array with a no_change_reason.');
  sections.push('');
  sections.push('Return ONLY the JSON object. No markdown code blocks, no explanatory text.');

  return sections.join('\n');
}

/**
 * Parse extraction result from Claude response
 */
function parseExtractionResult(text: string): FieldExtractionResult {
  try {
    // Try to extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;

    const parsed = JSON.parse(jsonStr);

    // Validate structure
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid JSON structure');
    }

    const result: FieldExtractionResult = {
      fields_changed: [],
      no_change_reason: parsed.no_change_reason,
    };

    if (Array.isArray(parsed.fields_changed)) {
      result.fields_changed = parsed.fields_changed
        .filter((change: unknown) => {
          if (!change || typeof change !== 'object') return false;
          const c = change as Record<string, unknown>;
          return (
            typeof c.field_name === 'string' &&
            c.old_value !== undefined &&
            c.new_value !== undefined &&
            (c.confidence === 'high' || c.confidence === 'medium' || c.confidence === 'low') &&
            typeof c.reasoning === 'string'
          );
        })
        .map((change) => {
          const c = change as Record<string, unknown>;
          return {
            field_name: c.field_name as string,
            old_value: c.old_value,
            new_value: c.new_value,
            confidence: c.confidence as 'high' | 'medium' | 'low',
            reasoning: c.reasoning as string,
          };
        });
    }

    return result;
  } catch (parseError) {
    console.warn('[extract-crm-fields] Failed to parse JSON, returning empty result:', parseError);
    return {
      fields_changed: [],
      no_change_reason: `Failed to parse AI response: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
    };
  }
}
