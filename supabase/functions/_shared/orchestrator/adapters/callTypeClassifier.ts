/**
 * Call Type Classifier Adapter
 *
 * First step in the meeting_ended sequence. Classifies the call type to enable
 * downstream gating of sales-only steps (proposals, email follow-ups, intent detection).
 *
 * Logic:
 * 1. Check if the meeting already has a call type classification (from Fathom/Fireflies sync)
 * 2. If classified with confidence >= 0.5, reuse the existing classification
 * 3. If not classified, run classifyCallType() against the transcript
 * 4. Save result to meetings table and return classification for downstream gating
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** Sales call type names (case-insensitive substring match) */
const SALES_TYPE_KEYWORDS = ['discovery', 'demo', 'close'];

function isSalesType(name: string): boolean {
  const lower = name.toLowerCase();
  return SALES_TYPE_KEYWORDS.some(kw => lower.includes(kw));
}

export const callTypeClassifierAdapter: SkillAdapter = {
  name: 'classify-call-type',

  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();

    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

      if (!supabaseUrl || !serviceKey) {
        throw new Error('Missing required environment variables');
      }

      const supabase = createClient(supabaseUrl, serviceKey);

      const meetingId = state.event.payload.meeting_id as string;
      if (!meetingId) {
        throw new Error('meeting_id not found in event payload');
      }

      // 1. Check if meeting already has a call type classification
      const { data: meeting, error: meetingError } = await supabase
        .from('meetings')
        .select('id, title, meeting_start, owner_email, org_id, call_type_id, call_type_confidence, call_type_reasoning, transcript_text')
        .eq('id', meetingId)
        .maybeSingle();

      if (meetingError || !meeting) {
        throw new Error(`Meeting ${meetingId} not found: ${meetingError?.message || 'no data'}`);
      }

      // 2. If already classified with sufficient confidence, reuse it
      if (meeting.call_type_id && (meeting.call_type_confidence || 0) >= 0.5) {
        const { data: callType } = await supabase
          .from('org_call_types')
          .select('id, name, enable_coaching')
          .eq('id', meeting.call_type_id)
          .maybeSingle();

        const callTypeName = callType?.name || 'Unknown';
        const enableCoaching = callType?.enable_coaching ?? true;

        console.log(`[classify-call-type] Reusing existing classification: ${callTypeName} (${((meeting.call_type_confidence || 0) * 100).toFixed(1)}%)`);

        return {
          success: true,
          output: {
            call_type_id: meeting.call_type_id,
            call_type_name: callTypeName,
            confidence: meeting.call_type_confidence,
            reasoning: meeting.call_type_reasoning || 'Pre-classified during sync',
            enable_coaching: enableCoaching,
            is_sales: isSalesType(callTypeName),
            source: 'existing',
          },
          duration_ms: Date.now() - start,
        };
      }

      // 3. Not classified — run classification
      const orgId = meeting.org_id || state.event.org_id;
      if (!orgId) {
        return {
          success: true,
          output: {
            call_type_id: null,
            call_type_name: null,
            confidence: 0,
            reasoning: 'No org_id available for classification',
            enable_coaching: true,
            is_sales: true, // Default to sales to avoid skipping workflows
            source: 'fallback',
          },
          duration_ms: Date.now() - start,
        };
      }

      // Fetch org call types
      const { data: orgCallTypes } = await supabase
        .from('org_call_types')
        .select('id, name, description, keywords, is_active, enable_coaching')
        .eq('org_id', orgId)
        .eq('is_active', true);

      if (!orgCallTypes || orgCallTypes.length === 0) {
        return {
          success: true,
          output: {
            call_type_id: null,
            call_type_name: null,
            confidence: 0,
            reasoning: 'No active call types configured for organization',
            enable_coaching: true,
            is_sales: true,
            source: 'no_config',
          },
          duration_ms: Date.now() - start,
        };
      }

      // Get transcript for classification
      const transcript = meeting.transcript_text || '';
      if (!transcript || transcript.trim().length === 0) {
        return {
          success: true,
          output: {
            call_type_id: null,
            call_type_name: null,
            confidence: 0,
            reasoning: 'No transcript available for classification',
            enable_coaching: true,
            is_sales: true,
            source: 'no_transcript',
          },
          duration_ms: Date.now() - start,
        };
      }

      // 3b. Try keyword-based classification as a fast fallback
      //     (The full AI classifier lives in fathom-sync and isn't available here)
      const transcriptLower = transcript.toLowerCase().slice(0, 5000);
      let bestMatch: { id: string; name: string; enable_coaching: boolean; score: number } | null = null;

      for (const ct of orgCallTypes) {
        let score = 0;
        const keywords: string[] = Array.isArray(ct.keywords) ? ct.keywords : [];

        // Keyword matching
        for (const kw of keywords) {
          if (transcriptLower.includes(kw.toLowerCase())) score += 2;
        }

        // Name/description matching
        if (ct.name && transcriptLower.includes(ct.name.toLowerCase())) score += 3;
        if (ct.description) {
          const descWords = ct.description.toLowerCase().split(/\s+/).filter((w: string) => w.length > 4);
          for (const word of descWords.slice(0, 10)) {
            if (transcriptLower.includes(word)) score += 0.5;
          }
        }

        if (score > 0 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { id: ct.id, name: ct.name, enable_coaching: ct.enable_coaching ?? true, score };
        }
      }

      if (bestMatch && bestMatch.score >= 2) {
        const confidence = Math.min(bestMatch.score / 10, 0.85);

        // Save classification
        await supabase
          .from('meetings')
          .update({
            call_type_id: bestMatch.id,
            call_type_confidence: confidence,
            call_type_reasoning: `Keyword match (score: ${bestMatch.score})`,
          })
          .eq('id', meetingId);

        console.log(`[classify-call-type] Keyword classified: ${bestMatch.name} (score: ${bestMatch.score}, confidence: ${(confidence * 100).toFixed(1)}%)`);

        return {
          success: true,
          output: {
            call_type_id: bestMatch.id,
            call_type_name: bestMatch.name,
            confidence,
            reasoning: `Keyword match (score: ${bestMatch.score})`,
            enable_coaching: bestMatch.enable_coaching,
            is_sales: isSalesType(bestMatch.name),
            source: 'keyword_classified',
          },
          duration_ms: Date.now() - start,
        };
      }

      // 3c. Keyword matching insufficient — use AI classification
      const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
      if (anthropicKey) {
        console.log('[classify-call-type] Keyword match insufficient, running AI classification');

        const callTypeList = orgCallTypes.map(ct => `- ${ct.name}: ${ct.description || 'No description'}`).join('\n');
        const transcriptSnippet = transcript.slice(0, 8000);

        const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 300,
            messages: [{
              role: 'user',
              content: `Classify this meeting transcript into exactly ONE of these call types:\n${callTypeList}\n\nTranscript (first 8000 chars):\n${transcriptSnippet}\n\nRespond with ONLY valid JSON: {"call_type": "<exact name from list>", "confidence": <0.0-1.0>, "reasoning": "<one sentence>"}`,
            }],
          }),
        });

        if (aiResponse.ok) {
          const aiResult = await aiResponse.json();
          const aiText = aiResult.content?.[0]?.text || '';
          const jsonMatch = aiText.match(/\{[\s\S]*\}/);

          if (jsonMatch) {
            try {
              const parsed = JSON.parse(jsonMatch[0]);
              const matchedType = orgCallTypes.find(
                ct => ct.name.toLowerCase() === (parsed.call_type || '').toLowerCase()
              );

              if (matchedType) {
                const aiConfidence = Math.min(Math.max(parsed.confidence || 0.7, 0.5), 0.95);

                // Save classification
                await supabase
                  .from('meetings')
                  .update({
                    call_type_id: matchedType.id,
                    call_type_confidence: aiConfidence,
                    call_type_reasoning: parsed.reasoning || 'AI classified',
                  })
                  .eq('id', meetingId);

                console.log(`[classify-call-type] AI classified: ${matchedType.name} (${(aiConfidence * 100).toFixed(1)}%)`);

                return {
                  success: true,
                  output: {
                    call_type_id: matchedType.id,
                    call_type_name: matchedType.name,
                    confidence: aiConfidence,
                    reasoning: parsed.reasoning || 'AI classified',
                    enable_coaching: matchedType.enable_coaching ?? true,
                    is_sales: isSalesType(matchedType.name),
                    source: 'ai_classified',
                  },
                  duration_ms: Date.now() - start,
                };
              }
            } catch (parseErr) {
              console.warn('[classify-call-type] AI response parse failed:', parseErr);
            }
          }
        } else {
          console.warn('[classify-call-type] AI classification request failed:', aiResponse.status);
        }
      }

      // No confident match — default to sales to avoid skipping downstream steps
      console.log('[classify-call-type] No classification succeeded, defaulting to sales');
      return {
        success: true,
        output: {
          call_type_id: null,
          call_type_name: null,
          confidence: 0,
          reasoning: 'No confident classification available',
          enable_coaching: true,
          is_sales: true,
          source: 'unclassified',
        },
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
