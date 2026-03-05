/**
 * Role Inference Adapter — REL-003
 *
 * Post-meeting Wave 2 step. After the call-type classify step completes, this
 * adapter calls Claude Haiku with the full meeting transcript and the attendee
 * list to infer each external attendee's stakeholder role in the deal.
 *
 * Roles (matches deal_contacts.role CHECK constraint):
 *   champion | blocker | economic_buyer | influencer | end_user | technical_evaluator
 *
 * Results are written to `deal_contacts` with:
 *   - inferred_from = 'transcript'
 *   - confidence    = 0.6–0.9 (transcript-based range)
 *   - last_active   = now()
 *
 * Upsert semantics (ON CONFLICT deal_id, contact_id):
 *   UPDATE role, confidence, last_active only when the new confidence is
 *   strictly higher than the existing value — never downgrade.
 *
 * Graceful degradation:
 *   - No transcript → returns success with skipped=true, no DB writes.
 *   - No deal in context → returns success with skipped=true.
 *   - No ANTHROPIC_API_KEY → falls back gracefully, no hard failure.
 *   - AI parse error → logs warning, continues with partial results.
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { getServiceClient, enrichMeetingContext } from './contextEnrichment.ts';
import { logAICostEvent, extractAnthropicUsage } from '../../costTracking.ts';

// =============================================================================
// Types
// =============================================================================

export type StakeholderRole =
  | 'champion'
  | 'blocker'
  | 'economic_buyer'
  | 'influencer'
  | 'end_user'
  | 'technical_evaluator';

const VALID_ROLES: Set<StakeholderRole> = new Set([
  'champion',
  'blocker',
  'economic_buyer',
  'influencer',
  'end_user',
  'technical_evaluator',
]);

export interface InferredAttendeeRole {
  name: string;
  email: string | null;
  contact_id: string | null;
  role: StakeholderRole;
  confidence: number;
  reasoning: string;
}

export interface RoleInferenceResult {
  skipped: boolean;
  skip_reason?: string;
  deal_id: string | null;
  attendees_evaluated: number;
  roles_inferred: number;
  roles_written: number;
  inferences: InferredAttendeeRole[];
}

// =============================================================================
// Adapter
// =============================================================================

export const roleInferenceAdapter: SkillAdapter = {
  name: 'infer-attendee-roles',

  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();

    try {
      console.log('[infer-attendee-roles] Starting transcript-based role inference...');

      // ── 1. Prerequisite guards ──

      const deal = state.context.tier2?.deal;
      if (!deal?.id) {
        console.log('[infer-attendee-roles] No deal in context — skipping');
        return {
          success: true,
          output: {
            skipped: true,
            skip_reason: 'No deal associated with meeting',
            deal_id: null,
            attendees_evaluated: 0,
            roles_inferred: 0,
            roles_written: 0,
            inferences: [],
          } satisfies RoleInferenceResult,
          duration_ms: Date.now() - start,
        };
      }

      const meetingId = state.event.payload.meeting_id as string | undefined;
      if (!meetingId) {
        console.log('[infer-attendee-roles] No meeting_id in payload — skipping');
        return {
          success: true,
          output: {
            skipped: true,
            skip_reason: 'No meeting_id in event payload',
            deal_id: deal.id,
            attendees_evaluated: 0,
            roles_inferred: 0,
            roles_written: 0,
            inferences: [],
          } satisfies RoleInferenceResult,
          duration_ms: Date.now() - start,
        };
      }

      const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
      if (!anthropicKey) {
        console.warn('[infer-attendee-roles] No ANTHROPIC_API_KEY configured — skipping');
        return {
          success: true,
          output: {
            skipped: true,
            skip_reason: 'ANTHROPIC_API_KEY not configured',
            deal_id: deal.id,
            attendees_evaluated: 0,
            roles_inferred: 0,
            roles_written: 0,
            inferences: [],
          } satisfies RoleInferenceResult,
          duration_ms: Date.now() - start,
        };
      }

      const supabase = getServiceClient();

      // ── 2. Load transcript and attendees ──

      let transcript = '';
      let attendees: Array<{ name: string; email?: string; is_external: boolean; title?: string; company?: string }> = [];

      try {
        const meetingCtx = await enrichMeetingContext(supabase, meetingId);
        transcript = meetingCtx.transcript || '';
        attendees = meetingCtx.attendees || [];
      } catch (enrichErr) {
        console.warn('[infer-attendee-roles] Meeting enrichment failed:', enrichErr);
      }

      // Skip gracefully if no transcript
      if (!transcript || transcript.trim().length === 0) {
        console.log('[infer-attendee-roles] No transcript available — skipping');
        return {
          success: true,
          output: {
            skipped: true,
            skip_reason: 'No transcript available for this meeting',
            deal_id: deal.id,
            attendees_evaluated: 0,
            roles_inferred: 0,
            roles_written: 0,
            inferences: [],
          } satisfies RoleInferenceResult,
          duration_ms: Date.now() - start,
        };
      }

      // Only classify external attendees — internal reps are not stakeholders on the deal
      const externalAttendees = attendees.filter((a) => a.is_external !== false);

      if (externalAttendees.length === 0) {
        console.log('[infer-attendee-roles] No external attendees found — skipping');
        return {
          success: true,
          output: {
            skipped: true,
            skip_reason: 'No external attendees in meeting',
            deal_id: deal.id,
            attendees_evaluated: 0,
            roles_inferred: 0,
            roles_written: 0,
            inferences: [],
          } satisfies RoleInferenceResult,
          duration_ms: Date.now() - start,
        };
      }

      console.log(
        `[infer-attendee-roles] Classifying ${externalAttendees.length} external attendees ` +
        `for deal "${deal.name}" (${deal.id})`,
      );

      // ── 3. Resolve contact IDs from emails (batch) ──

      const emailToContactId = new Map<string, string>();
      const attendeeEmails = externalAttendees
        .map((a) => a.email)
        .filter((e): e is string => !!e && e.includes('@'));

      if (attendeeEmails.length > 0) {
        const { data: contacts } = await supabase
          .from('contacts')
          .select('id, email')
          .in('email', attendeeEmails)
          .eq('owner_id', state.event.user_id);

        for (const c of contacts || []) {
          if (c.email) emailToContactId.set(c.email.toLowerCase(), c.id);
        }
      }

      // ── 4. Build AI prompt ──

      const attendeeList = externalAttendees.map((a, idx) => {
        const parts = [`${idx + 1}. Name: ${a.name}`];
        if (a.email) parts.push(`Email: ${a.email}`);
        if (a.title) parts.push(`Title: ${a.title}`);
        if (a.company) parts.push(`Company: ${a.company}`);
        return parts.join(', ');
      }).join('\n');

      const truncatedTranscript = truncateTranscript(transcript, 8000);

      const systemPrompt = buildSystemPrompt();
      const userPrompt = buildUserPrompt({
        dealName: deal.name,
        dealStage: deal.stage,
        attendeeList,
        transcript: truncatedTranscript,
      });

      // ── 5. Call Claude Haiku ──

      console.log('[infer-attendee-roles] Calling Claude Haiku for role inference...');

      const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          temperature: 0.1,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });

      if (!aiResponse.ok) {
        const errText = await aiResponse.text().catch(() => '');
        throw new Error(`Claude API returned ${aiResponse.status}: ${errText}`);
      }

      const aiResult = await aiResponse.json();

      // Cost tracking (non-blocking)
      try {
        const usage = extractAnthropicUsage(aiResult);
        await logAICostEvent(
          supabase,
          state.event.user_id,
          state.event.org_id,
          'anthropic',
          'claude-haiku-4-5-20251001',
          usage.inputTokens,
          usage.outputTokens,
          'infer-attendee-roles',
          { meeting_id: meetingId, deal_id: deal.id },
        );
      } catch (costErr) {
        console.warn('[infer-attendee-roles] Cost tracking failed (non-blocking):', costErr);
      }

      const textContent: string = aiResult.content?.[0]?.text || '';

      // ── 6. Parse AI response ──

      const inferences = parseAIResponse(textContent, externalAttendees, emailToContactId);

      console.log(
        `[infer-attendee-roles] Inferred ${inferences.length} roles from ${externalAttendees.length} attendees`,
      );

      // ── 7. Upsert deal_contacts ──

      let rolesWritten = 0;
      const now = new Date().toISOString();

      for (const inf of inferences) {
        if (!inf.contact_id) {
          console.log(
            `[infer-attendee-roles] No contact_id for ${inf.name} (${inf.email || 'no email'}) — skipping DB write`,
          );
          continue;
        }

        // Check existing confidence to avoid downgrading
        const { data: existing } = await supabase
          .from('deal_contacts')
          .select('id, confidence, role')
          .eq('deal_id', deal.id)
          .eq('contact_id', inf.contact_id)
          .maybeSingle();

        if (existing) {
          // Only update if new confidence is strictly higher than current
          if (inf.confidence <= (existing.confidence ?? 0)) {
            console.log(
              `[infer-attendee-roles] ${inf.name}: skipping update — ` +
              `existing confidence ${existing.confidence} >= new ${inf.confidence}`,
            );
            // Still update last_active to reflect this meeting
            await supabase
              .from('deal_contacts')
              .update({ last_active: now })
              .eq('id', existing.id);
            continue;
          }

          console.log(
            `[infer-attendee-roles] ${inf.name}: upgrading confidence ` +
            `${existing.confidence} → ${inf.confidence} (${existing.role} → ${inf.role})`,
          );
        }

        const { error: upsertError } = await supabase
          .from('deal_contacts')
          .upsert(
            {
              deal_id: deal.id,
              contact_id: inf.contact_id,
              role: inf.role,
              confidence: inf.confidence,
              inferred_from: 'transcript',
              last_active: now,
            },
            {
              onConflict: 'deal_id,contact_id',
              ignoreDuplicates: false,
            },
          );

        if (upsertError) {
          console.error(
            `[infer-attendee-roles] Upsert failed for ${inf.name}: ${upsertError.message}`,
          );
        } else {
          rolesWritten++;
          console.log(
            `[infer-attendee-roles] Wrote: ${inf.name} → ${inf.role} (confidence: ${inf.confidence})`,
          );
        }
      }

      const result: RoleInferenceResult = {
        skipped: false,
        deal_id: deal.id,
        attendees_evaluated: externalAttendees.length,
        roles_inferred: inferences.length,
        roles_written: rolesWritten,
        inferences,
      };

      console.log(
        `[infer-attendee-roles] Complete: ` +
        `${result.attendees_evaluated} evaluated, ` +
        `${result.roles_inferred} inferred, ` +
        `${result.roles_written} written to deal_contacts`,
      );

      return {
        success: true,
        output: result,
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      console.error('[infer-attendee-roles] Unhandled error:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - start,
      };
    }
  },
};

// =============================================================================
// Prompt Builders
// =============================================================================

function buildSystemPrompt(): string {
  return [
    'You are a B2B sales intelligence specialist analyzing meeting transcripts to classify stakeholder roles.',
    '',
    'Classify each attendee into exactly ONE of these roles based on their behavior in the conversation:',
    '  champion         — internal advocate who promotes the vendor\'s solution; asks clarifying questions, evangelizes internally',
    '  blocker          — raises objections, expresses skepticism, creates friction or delays',
    '  economic_buyer   — controls budget; discusses pricing, ROI, contract terms, approval authority',
    '  influencer       — shapes opinions without final authority; references peers, committees, or processes',
    '  end_user         — focused on day-to-day usage, workflows, feature requirements, training needs',
    '  technical_evaluator — asks technical integration, security, architecture, or compliance questions',
    '',
    'Confidence scoring guidelines (transcript-based inference range: 0.6–0.9):',
    '  0.85–0.90 — strong, unambiguous signals (e.g., person explicitly discusses budget approval)',
    '  0.70–0.84 — clear directional signals but not definitive',
    '  0.60–0.69 — weak or indirect signals; role is a best-guess from limited evidence',
    '',
    'Return ONLY valid JSON — no markdown fences, no explanatory text outside the JSON.',
  ].join('\n');
}

function buildUserPrompt(params: {
  dealName: string;
  dealStage?: string;
  attendeeList: string;
  transcript: string;
}): string {
  const sections: string[] = [];

  sections.push('# STAKEHOLDER ROLE CLASSIFICATION TASK');
  sections.push('');
  sections.push(`Deal: ${params.dealName}`);
  if (params.dealStage) sections.push(`Current stage: ${params.dealStage}`);
  sections.push('');

  sections.push('## ATTENDEES TO CLASSIFY');
  sections.push(params.attendeeList);
  sections.push('');

  sections.push('## MEETING TRANSCRIPT');
  sections.push('```');
  sections.push(params.transcript);
  sections.push('```');
  sections.push('');

  sections.push('## INSTRUCTIONS');
  sections.push('');
  sections.push('For each attendee in the list above, determine their stakeholder role from the signals in the transcript:');
  sections.push('');
  sections.push('- Authority signals: who approves decisions, who mentions budget or legal review');
  sections.push('- Questions asked: technical detail questions → technical_evaluator; pricing/ROI → economic_buyer; feature/workflow → end_user');
  sections.push('- Objection types: who pushes back or raises concerns → blocker');
  sections.push('- Speaking patterns: who defends the vendor or rallies others → champion; who references committees or processes → influencer');
  sections.push('');
  sections.push('Return JSON in this exact schema:');
  sections.push('{');
  sections.push('  "classifications": [');
  sections.push('    {');
  sections.push('      "name": "<attendee name as listed above>",');
  sections.push('      "role": "<one of: champion | blocker | economic_buyer | influencer | end_user | technical_evaluator>",');
  sections.push('      "confidence": <number between 0.60 and 0.90>,');
  sections.push('      "reasoning": "<one concise sentence explaining the primary signal>"');
  sections.push('    }');
  sections.push('  ]');
  sections.push('}');
  sections.push('');
  sections.push('Include every attendee from the list. Do not add attendees that were not listed.');

  return sections.join('\n');
}

// =============================================================================
// Response Parser
// =============================================================================

function parseAIResponse(
  text: string,
  externalAttendees: Array<{ name: string; email?: string; is_external: boolean; title?: string; company?: string }>,
  emailToContactId: Map<string, string>,
): InferredAttendeeRole[] {
  const inferences: InferredAttendeeRole[] = [];

  try {
    // Strip markdown code fences if present
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;
    const parsed = JSON.parse(jsonStr);

    if (!parsed?.classifications || !Array.isArray(parsed.classifications)) {
      console.warn('[infer-attendee-roles] AI response missing classifications array');
      return inferences;
    }

    for (const item of parsed.classifications) {
      if (!item || typeof item !== 'object') continue;

      const name: string = String(item.name || '').trim();
      const rawRole: string = String(item.role || '').trim().toLowerCase();
      const rawConfidence: number = Number(item.confidence ?? 0);
      const reasoning: string = String(item.reasoning || '').trim();

      // Validate role
      if (!VALID_ROLES.has(rawRole as StakeholderRole)) {
        console.warn(`[infer-attendee-roles] Invalid role "${rawRole}" for attendee "${name}" — skipping`);
        continue;
      }

      // Clamp confidence to transcript-based inference range
      const confidence = Math.min(Math.max(rawConfidence, 0.6), 0.9);

      // Match back to the original attendee to get email/contact_id
      const matched = externalAttendees.find(
        (a) => a.name.toLowerCase() === name.toLowerCase(),
      );

      const email = matched?.email || null;
      const contact_id = email ? (emailToContactId.get(email.toLowerCase()) || null) : null;

      inferences.push({
        name: name || (matched?.name ?? 'Unknown'),
        email,
        contact_id,
        role: rawRole as StakeholderRole,
        confidence,
        reasoning,
      });
    }
  } catch (parseErr) {
    console.warn('[infer-attendee-roles] Failed to parse AI response:', parseErr);
    console.warn('[infer-attendee-roles] Raw AI text (first 500 chars):', text.slice(0, 500));
  }

  return inferences;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Truncate transcript to fit within Claude's token budget.
 * Keeps first 60% + last 40% to capture opening context and closing commitments.
 */
function truncateTranscript(transcript: string, maxChars: number): string {
  if (transcript.length <= maxChars) return transcript;

  const firstPart = transcript.slice(0, Math.floor(maxChars * 0.6));
  const lastPart = transcript.slice(-(Math.floor(maxChars * 0.4)));

  return `${firstPart}\n\n[... middle of transcript truncated for token budget ...]\n\n${lastPart}`;
}
