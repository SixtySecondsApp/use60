/**
 * agent-competitive-intel (KNW-006)
 *
 * Extracts competitor mentions from meeting transcripts and aggregates
 * competitor profiles with win rates, battlecards, and positioning intel.
 *
 * Two modes:
 *   1. extract   — analyse a meeting transcript for competitor mentions
 *   2. aggregate — recalculate a competitor_profile from all mentions
 *
 * Auth: accepts CRON_SECRET or service-role Bearer token.
 * Deploy: npx supabase functions deploy agent-competitive-intel --project-ref <ref> --no-verify-jwt
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { verifyCronSecret, isServiceRoleAuth } from '../_shared/edgeAuth.ts';
import {
  handleCorsPreflightRequest,
  errorResponse,
  jsonResponse,
} from '../_shared/corsHelper.ts';

// =============================================================================
// Config
// =============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const BATTLECARD_MENTION_THRESHOLD = 5;

// =============================================================================
// Types
// =============================================================================

interface ExtractPayload {
  mode: 'extract';
  meeting_id: string;
  org_id: string;
}

interface AggregatePayload {
  mode: 'aggregate';
  org_id: string;
  competitor_name: string;
}

type Payload = ExtractPayload | AggregatePayload;

interface MentionExtraction {
  competitor_name: string;
  context: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  category: 'pricing' | 'features' | 'support' | 'brand' | 'integration' | 'performance' | 'other';
  strengths: string[];
  weaknesses: string[];
  pricing_discussed: boolean;
  pricing_detail: string | null;
}

interface ExtractResult {
  mode: 'extract';
  meeting_id: string;
  mentions_found: number;
  mentions: MentionExtraction[];
  profiles_to_aggregate: string[];
}

interface AggregateResult {
  mode: 'aggregate';
  competitor_name: string;
  mention_count: number;
  win_rate: number | null;
  battlecard_generated: boolean;
}

// =============================================================================
// Main handler
// =============================================================================

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    const cronSecret = Deno.env.get('CRON_SECRET');
    const authHeader = req.headers.get('Authorization');

    if (
      !verifyCronSecret(req, cronSecret) &&
      !isServiceRoleAuth(authHeader, SUPABASE_SERVICE_ROLE_KEY)
    ) {
      return errorResponse('Unauthorized', req, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body: Payload = await req.json().catch(() => ({ mode: 'extract', meeting_id: '', org_id: '' }));

    console.log(`[agent-competitive-intel] Starting in ${body.mode} mode`);

    if (body.mode === 'extract') {
      const result = await handleExtract(supabase, body as ExtractPayload);
      return jsonResponse(result, req);
    } else if (body.mode === 'aggregate') {
      const result = await handleAggregate(supabase, body as AggregatePayload);
      return jsonResponse(result, req);
    }

    return errorResponse(`Unknown mode: ${body.mode}`, req, 400);

  } catch (error) {
    console.error('[agent-competitive-intel] Fatal error:', error);
    return errorResponse((error as Error).message, req, 500);
  }
});

// =============================================================================
// Mode: extract — analyse meeting transcript for competitor mentions
// =============================================================================

async function handleExtract(
  supabase: ReturnType<typeof createClient>,
  payload: ExtractPayload
): Promise<ExtractResult> {
  const { meeting_id, org_id } = payload;
  const result: ExtractResult = {
    mode: 'extract',
    meeting_id,
    mentions_found: 0,
    mentions: [],
    profiles_to_aggregate: [],
  };

  // 1. Load meeting transcript
  const { data: meeting } = await supabase
    .from('meetings')
    .select('id, title, transcript_text, org_id')
    .eq('id', meeting_id)
    .maybeSingle();

  if (!meeting?.transcript_text) {
    console.log(`[agent-competitive-intel] No transcript for meeting ${meeting_id}`);
    return result;
  }

  const effectiveOrgId = org_id || meeting.org_id;

  // Get deal linked to this meeting (if any)
  const { data: dealMeeting } = await supabase
    .from('deal_meetings')
    .select('deal_id')
    .eq('meeting_id', meeting_id)
    .limit(1)
    .maybeSingle();

  const dealId = dealMeeting?.deal_id || null;

  // 2. Call Claude Haiku to extract competitor mentions
  const mentions = await extractMentionsWithAI(meeting.transcript_text, meeting.title);

  if (!mentions.length) {
    console.log(`[agent-competitive-intel] No competitor mentions found in meeting ${meeting_id}`);
    return result;
  }

  // 3. Insert mentions into competitive_mentions
  const competitorNames = new Set<string>();

  for (const mention of mentions) {
    const normalized = mention.competitor_name.trim();
    competitorNames.add(normalized.toLowerCase());

    const { error } = await supabase
      .from('competitive_mentions')
      .insert({
        org_id: effectiveOrgId,
        deal_id: dealId,
        meeting_id,
        competitor_name: normalized,
        mention_context: mention.context,
        sentiment: mention.sentiment,
        category: mention.category,
        strengths_mentioned: mention.strengths,
        weaknesses_mentioned: mention.weaknesses,
        pricing_discussed: mention.pricing_discussed,
        pricing_detail: mention.pricing_detail,
        detected_by: 'post_meeting_analysis',
      });

    if (error) {
      console.warn(`[agent-competitive-intel] Failed to insert mention:`, error.message);
    } else {
      result.mentions_found++;
      result.mentions.push(mention);
    }
  }

  // 4. Check which competitor profiles should be re-aggregated
  for (const name of competitorNames) {
    const { data: profile } = await supabase
      .from('competitor_profiles')
      .select('mention_count')
      .eq('org_id', effectiveOrgId)
      .ilike('competitor_name', name)
      .maybeSingle();

    const newCount = (profile?.mention_count || 0) + 1;

    // Trigger aggregation at thresholds: 5, 10, 25, 50, ...
    if (newCount >= BATTLECARD_MENTION_THRESHOLD && (
      newCount === BATTLECARD_MENTION_THRESHOLD ||
      newCount === 10 ||
      newCount === 25 ||
      newCount % 25 === 0
    )) {
      result.profiles_to_aggregate.push(name);
    }
  }

  console.log(`[agent-competitive-intel] Extracted ${result.mentions_found} mentions from meeting ${meeting_id}`);
  return result;
}

// =============================================================================
// Mode: aggregate — recalculate competitor profile from all mentions
// =============================================================================

async function handleAggregate(
  supabase: ReturnType<typeof createClient>,
  payload: AggregatePayload
): Promise<AggregateResult> {
  const { org_id, competitor_name } = payload;
  if (!competitor_name) {
    return { mode: 'aggregate', competitor_name: '', mention_count: 0, win_rate: null, battlecard_generated: false, error: 'competitor_name is required' } as AggregateResult;
  }
  const normalizedName = competitor_name.trim();
  const result: AggregateResult = {
    mode: 'aggregate',
    competitor_name: normalizedName,
    mention_count: 0,
    win_rate: null,
    battlecard_generated: false,
  };

  // 1. Fetch all mentions for this competitor
  const { data: mentions } = await supabase
    .from('competitive_mentions')
    .select('id, deal_id, sentiment, category, strengths_mentioned, weaknesses_mentioned, pricing_discussed, pricing_detail, deal_outcome, mention_context, created_at')
    .eq('org_id', org_id)
    .ilike('competitor_name', normalizedName)
    .order('created_at', { ascending: false });

  if (!mentions?.length) return result;
  result.mention_count = mentions.length;

  // 2. Aggregate statistics
  const wins = mentions.filter(m => m.deal_outcome === 'won').length;
  const losses = mentions.filter(m => m.deal_outcome === 'lost').length;
  const totalOutcomes = wins + losses;
  const winRate = totalOutcomes > 0 ? Math.round((wins / totalOutcomes) * 10000) / 100 : null;
  result.win_rate = winRate;

  // Aggregate strengths/weaknesses by frequency
  const strengthMap = new Map<string, number>();
  const weaknessMap = new Map<string, number>();

  for (const m of mentions) {
    for (const s of m.strengths_mentioned || []) {
      const key = s.toLowerCase().trim();
      strengthMap.set(key, (strengthMap.get(key) || 0) + 1);
    }
    for (const w of m.weaknesses_mentioned || []) {
      const key = w.toLowerCase().trim();
      weaknessMap.set(key, (weaknessMap.get(key) || 0) + 1);
    }
  }

  const commonStrengths = [...strengthMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([strength, count]) => ({ strength, count }));

  const commonWeaknesses = [...weaknessMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([weakness, count]) => ({ weakness, count }));

  // Effective counters from winning deals
  const winningMentions = mentions.filter(m => m.deal_outcome === 'won' && m.mention_context);
  const effectiveCounters = winningMentions.slice(0, 5).map(m => ({
    counter: m.mention_context?.slice(0, 200),
    source_deal_id: m.deal_id,
    category: m.category,
  }));

  const lastMentioned = mentions[0]?.created_at || null;

  // 3. Generate auto-battlecard if threshold met
  let autoBattlecard: string | null = null;
  if (mentions.length >= BATTLECARD_MENTION_THRESHOLD && ANTHROPIC_API_KEY) {
    autoBattlecard = await generateBattlecard(normalizedName, commonStrengths, commonWeaknesses, effectiveCounters, winRate, mentions.length);
    if (autoBattlecard) result.battlecard_generated = true;
  }

  // 4. Upsert competitor profile
  const { error } = await supabase
    .from('competitor_profiles')
    .upsert({
      org_id,
      competitor_name: normalizedName,
      mention_count: mentions.length,
      win_count: wins,
      loss_count: losses,
      win_rate: winRate,
      common_strengths: commonStrengths,
      common_weaknesses: commonWeaknesses,
      effective_counters: effectiveCounters,
      last_mentioned_at: lastMentioned,
      ...(autoBattlecard ? { auto_battlecard: autoBattlecard } : {}),
    }, { onConflict: 'org_id,lower(competitor_name)' });

  if (error) {
    // Fallback: try update if upsert fails on computed column constraint
    console.warn('[agent-competitive-intel] Upsert failed, trying update:', error.message);
    await supabase
      .from('competitor_profiles')
      .update({
        mention_count: mentions.length,
        win_count: wins,
        loss_count: losses,
        win_rate: winRate,
        common_strengths: commonStrengths,
        common_weaknesses: commonWeaknesses,
        effective_counters: effectiveCounters,
        last_mentioned_at: lastMentioned,
        ...(autoBattlecard ? { auto_battlecard: autoBattlecard } : {}),
      })
      .eq('org_id', org_id)
      .ilike('competitor_name', normalizedName);
  }

  console.log(`[agent-competitive-intel] Aggregated ${normalizedName}: ${mentions.length} mentions, win rate ${winRate ?? 'N/A'}%`);
  return result;
}

// =============================================================================
// AI: Extract competitor mentions from transcript
// =============================================================================

async function extractMentionsWithAI(transcript: string, title: string | null): Promise<MentionExtraction[]> {
  if (!ANTHROPIC_API_KEY) {
    console.warn('[agent-competitive-intel] No ANTHROPIC_API_KEY, skipping AI extraction');
    return [];
  }

  // Truncate transcript to ~8000 chars for Haiku
  const truncated = transcript.length > 8000 ? transcript.slice(0, 8000) + '\n[transcript truncated]' : transcript;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Analyse this sales meeting transcript and extract any competitor mentions.

Meeting title: ${title || 'Unknown'}

Transcript:
${truncated}

Return a JSON array of competitor mentions. Each mention should have:
- competitor_name: the company/product name mentioned as a competitor
- context: 1-2 sentence excerpt showing the context of the mention (max 200 chars)
- sentiment: "positive" (they like competitor), "negative" (they don't like competitor), or "neutral"
- category: "pricing", "features", "support", "brand", "integration", "performance", or "other"
- strengths: array of strengths mentioned about this competitor (short phrases)
- weaknesses: array of weaknesses mentioned about this competitor (short phrases)
- pricing_discussed: true if specific pricing was discussed
- pricing_detail: if pricing discussed, what was said (null otherwise)

If no competitors are mentioned, return an empty array [].
Only include actual competitor companies/products, not generic industry terms.

Return ONLY the JSON array, no other text.`,
        }],
      }),
    });

    if (!resp.ok) {
      console.error(`[agent-competitive-intel] Anthropic API error: ${resp.status}`);
      return [];
    }

    const data = await resp.json();
    const text = data?.content?.[0]?.text || '[]';

    // Parse JSON from response (handle markdown code blocks)
    const jsonStr = text.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed)) return [];

    // Validate and clean each mention
    return parsed.filter((m: MentionExtraction) =>
      m.competitor_name && typeof m.competitor_name === 'string' && m.competitor_name.length > 0
    ).map((m: MentionExtraction) => ({
      competitor_name: m.competitor_name,
      context: (m.context || '').slice(0, 500),
      sentiment: ['positive', 'negative', 'neutral'].includes(m.sentiment) ? m.sentiment : 'neutral',
      category: ['pricing', 'features', 'support', 'brand', 'integration', 'performance', 'other'].includes(m.category) ? m.category : 'other',
      strengths: Array.isArray(m.strengths) ? m.strengths.filter(s => typeof s === 'string').slice(0, 5) : [],
      weaknesses: Array.isArray(m.weaknesses) ? m.weaknesses.filter(s => typeof s === 'string').slice(0, 5) : [],
      pricing_discussed: !!m.pricing_discussed,
      pricing_detail: m.pricing_detail || null,
    }));

  } catch (err) {
    console.error('[agent-competitive-intel] AI extraction error:', err);
    return [];
  }
}

// =============================================================================
// AI: Generate auto-battlecard
// =============================================================================

async function generateBattlecard(
  competitorName: string,
  strengths: Array<{ strength: string; count: number }>,
  weaknesses: Array<{ weakness: string; count: number }>,
  effectiveCounters: Array<{ counter: string | undefined; category: string }>,
  winRate: number | null,
  mentionCount: number
): Promise<string | null> {
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: `Generate a competitive battlecard for "${competitorName}" based on intelligence from ${mentionCount} sales interactions.

Data:
- Win rate against them: ${winRate != null ? `${winRate}%` : 'Not enough data'}
- Their commonly mentioned strengths: ${strengths.map(s => `${s.strength} (${s.count}x)`).join(', ') || 'None'}
- Their commonly mentioned weaknesses: ${weaknesses.map(w => `${w.weakness} (${w.count}x)`).join(', ') || 'None'}
- Effective counter-positioning from winning deals: ${effectiveCounters.map(c => c.counter).filter(Boolean).join('; ') || 'None yet'}

Generate a concise battlecard in markdown format with these sections:
## Overview
(1-2 sentences: who they are, when they typically come up)

## Their Strengths
(bullet points — acknowledge what they do well)

## Their Weaknesses
(bullet points — where they fall short)

## How to Win
(numbered list — specific counter-positioning tactics from winning deals)

## Pricing Intelligence
(what we know about their pricing, if anything)

Keep it concise and actionable. Focus on what helps a rep win, not encyclopedic detail.`,
        }],
      }),
    });

    if (!resp.ok) return null;

    const data = await resp.json();
    return data?.content?.[0]?.text || null;

  } catch {
    return null;
  }
}
