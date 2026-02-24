/// <reference path="../deno.d.ts" />

/**
 * route-message — Unified Routing Edge Function
 *
 * Runs the 5-step routing pipeline server-side and returns a routing decision:
 *   1. Intent Classification  — short-circuit for greetings/help/chit-chat
 *   2. Sequence Triggers      — org skills with category 'agent-sequence' (threshold 0.7)
 *   3. Skill Triggers         — individual org skills (threshold 0.5)
 *   4. Semantic Fallback      — cosine similarity on skill embeddings (threshold 0.6)
 *   5. General Fallthrough    — route: 'general', confidence: 0.0
 *
 * POST /route-message
 * Body: {
 *   message:  string,
 *   source:   'web_copilot' | 'slack_copilot' | 'fleet_agent',
 *   org_id:   string,
 *   user_id:  string,
 *   context?: Record<string, unknown>
 * }
 *
 * Response: {
 *   route:          string,           // skill_key or 'general'
 *   skill_key?:     string,
 *   confidence:     number,
 *   model_override?: string,
 *   matched_by:     'sequence_trigger' | 'skill_trigger' | 'semantic' | 'general',
 *   trace_id:       string,
 *   duration_ms:    number
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { createLogger } from '../_shared/logger.ts';

// =============================================================================
// Types
// =============================================================================

interface RequestBody {
  message: string;
  source: 'web_copilot' | 'slack_copilot' | 'fleet_agent';
  org_id: string;
  user_id: string;
  context?: Record<string, unknown>;
}

interface RouteResponse {
  route: string;
  skill_key?: string;
  confidence: number;
  model_override?: string;
  matched_by: 'sequence_trigger' | 'skill_trigger' | 'semantic' | 'general' | 'cache';
  trace_id: string;
  duration_ms: number;
}

interface SkillTrigger {
  pattern: string;
  confidence?: number;
  examples?: string[];
}

interface SkillFrontmatter {
  name?: string;
  description?: string;
  triggers?: (string | SkillTrigger)[];
  keywords?: string[];
}

interface OrgSkillRow {
  skill_key: string;
  category: string;
  frontmatter: SkillFrontmatter;
  embedding?: number[] | null;
  is_enabled: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const SEQUENCE_CONFIDENCE_THRESHOLD = 0.7;
const INDIVIDUAL_CONFIDENCE_THRESHOLD = 0.5;
const SEMANTIC_SIMILARITY_THRESHOLD = 0.6;

// Patterns that indicate general/chit-chat intent — skip skill routing entirely
const GENERAL_INTENT_PATTERNS = [
  /^(hi|hello|hey|howdy|greetings?)\b/i,
  /^(good\s+(morning|afternoon|evening|day))\b/i,
  /^(what can you (do|help)|how (do|can) (i|you)|what are (you|your)|who are you)\b/i,
  /^(help|support|assist|guide|tutorial)\s*\??$/i,
  /^(thanks?|thank you|cheers|great|awesome|perfect|ok(ay)?|got it|sounds good)\s*\.?\s*$/i,
  /^(yes|no|sure|ok|nope|yep|yeah|nah)\s*\.?\s*$/i,
];

// =============================================================================
// Intent Classification (Step 1)
// =============================================================================

function isGeneralIntent(message: string): boolean {
  const trimmed = message.trim();
  return GENERAL_INTENT_PATTERNS.some((re) => re.test(trimmed));
}

// =============================================================================
// Trigger Matching Helpers
// =============================================================================

function normalizeTriggers(
  triggers: (string | SkillTrigger)[] | undefined
): SkillTrigger[] {
  if (!triggers) return [];
  return triggers.map((t) =>
    typeof t === 'string' ? { pattern: t, confidence: 0.75 } : t
  );
}

/**
 * Score how well `message` matches a skill's triggers, keywords, and description.
 * Returns the best confidence found (0–1) and the matched term.
 */
function scoreSkill(
  message: string,
  frontmatter: SkillFrontmatter
): { confidence: number; matchedTrigger?: string } {
  const msgLower = message.toLowerCase();
  const words = msgLower.split(/\s+/);

  let bestConfidence = 0;
  let matchedTrigger: string | undefined;

  // Triggers (highest priority)
  const triggers = normalizeTriggers(frontmatter?.triggers);
  for (const trigger of triggers) {
    const patternLower = trigger.pattern.toLowerCase();

    if (msgLower.includes(patternLower)) {
      const confidence = trigger.confidence ?? 0.8;
      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        matchedTrigger = trigger.pattern;
      }
    }

    if (trigger.examples) {
      for (const example of trigger.examples) {
        if (msgLower.includes(example.toLowerCase())) {
          const confidence = (trigger.confidence ?? 0.8) * 0.9;
          if (confidence > bestConfidence) {
            bestConfidence = confidence;
            matchedTrigger = example;
          }
        }
      }
    }
  }

  // Keywords (medium priority)
  const keywords = frontmatter?.keywords;
  if (keywords && bestConfidence < 0.5) {
    const keywordMatches = keywords.filter((kw) =>
      words.includes(kw.toLowerCase())
    );
    if (keywordMatches.length > 0) {
      const keywordConfidence = Math.min(0.6, keywordMatches.length * 0.2);
      if (keywordConfidence > bestConfidence) {
        bestConfidence = keywordConfidence;
        matchedTrigger = keywordMatches[0];
      }
    }
  }

  // Description word overlap (lowest priority fallback)
  const description = frontmatter?.description;
  if (description && bestConfidence < 0.4) {
    const descLower = description.toLowerCase();
    const descMatches = words.filter(
      (word) => word.length > 3 && descLower.includes(word)
    );
    if (descMatches.length >= 2) {
      const descConfidence = Math.min(0.45, descMatches.length * 0.1);
      if (descConfidence > bestConfidence) {
        bestConfidence = descConfidence;
        matchedTrigger = `description match: ${descMatches.slice(0, 2).join(', ')}`;
      }
    }
  }

  return { confidence: bestConfidence, matchedTrigger };
}

// =============================================================================
// Cache Helpers
// =============================================================================

const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

async function computeCacheKey(message: string, org_id: string, source: string): Promise<string> {
  const raw = `${message}|${org_id}|${source}`;
  const encoded = new TextEncoder().encode(raw);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 32);
}

async function getCachedRoute(
  client: ReturnType<typeof createClient>,
  hashKey: string
): Promise<RouteResponse | null> {
  try {
    const { data, error } = await client
      .from('routing_cache')
      .select('response, expires_at')
      .eq('hash_key', hashKey)
      .maybeSingle();

    if (error || !data) return null;
    if (new Date(data.expires_at) <= new Date()) return null;
    return data.response as RouteResponse;
  } catch {
    return null;
  }
}

async function setCachedRoute(
  client: ReturnType<typeof createClient>,
  hashKey: string,
  response: RouteResponse
): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString();
    await client.from('routing_cache').upsert(
      { hash_key: hashKey, response, expires_at: expiresAt },
      { onConflict: 'hash_key' }
    );
  } catch {
    // Non-fatal — cache write failures must never break the response
  }
}

// =============================================================================
// Semantic Similarity Helper (Step 4)
// =============================================================================

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Generate an embedding for the message using OpenAI text-embedding-3-small.
 * Returns null if embedding generation fails (semantic step is skipped gracefully).
 */
async function embedMessage(message: string): Promise<number[] | null> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return null;

  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: message,
      }),
    });

    if (!res.ok) return null;
    const json = await res.json() as { data: Array<{ embedding: number[] }> };
    return json.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

// =============================================================================
// Main Handler
// =============================================================================

serve(async (req: Request) => {
  // CORS preflight
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: RequestBody;
  try {
    body = await req.json() as RequestBody;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { message, source, org_id, user_id, context } = body;

  if (!message || !org_id || !user_id || !source) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: message, source, org_id, user_id' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const startMs = Date.now();
  const logger = createLogger('route-message', { userId: user_id, orgId: org_id });
  const traceId = logger.trace_id;

  logger.info('routing.start', { source, message_length: message.length });

  // Auth — validate JWT from Authorization header
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const authHeader = req.headers.get('Authorization');
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader ?? '' } },
    auth: { persistSession: false },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    logger.warn('routing.auth.failed', { error: authError?.message });
    await logger.flush();
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Service-role client for skill fetching and log writes
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // =========================================================================
  // Cache Check — before routing pipeline
  // =========================================================================
  const cacheKey = await computeCacheKey(message, org_id, source);
  const cached = await getCachedRoute(serviceClient, cacheKey);
  if (cached) {
    logger.info('routing.cache.hit', { hash_key: cacheKey });
    const cacheResult: RouteResponse = {
      ...cached,
      matched_by: 'cache',
      trace_id: traceId,
      duration_ms: Date.now() - startMs,
    };
    await logger.flush();
    return new Response(JSON.stringify(cacheResult), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let result: RouteResponse;

  try {
    // =========================================================================
    // Step 1 — Intent Classification (greetings, chit-chat, help)
    // =========================================================================
    if (isGeneralIntent(message)) {
      logger.info('routing.general_intent', { matched_by: 'intent_classification' });
      result = {
        route: 'general',
        confidence: 1.0,
        matched_by: 'general',
        trace_id: traceId,
        duration_ms: Date.now() - startMs,
      };
      await Promise.all([
        logRoutingDecision(serviceClient, { user_id, org_id, source, message, result, context }),
        setCachedRoute(serviceClient, cacheKey, result),
      ]);
      await logger.flush();
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // =========================================================================
    // Fetch org skills filtered by namespace for this source
    // Mapping: web_copilot → copilot+shared, slack_copilot → slack+shared,
    //          fleet_agent → fleet+shared  (enforced server-side by the RPC)
    // =========================================================================
    const skillsFetchSpan = logger.createSpan('skills.fetch');
    const { data: allSkills, error: skillsError } = await serviceClient
      .rpc('get_organization_skills_for_agent', { p_org_id: org_id, p_source: source }) as {
        data: OrgSkillRow[] | null;
        error: { message: string } | null;
      };

    skillsFetchSpan.stop({ count: allSkills?.length ?? 0, error: skillsError?.message });

    if (skillsError || !allSkills) {
      logger.warn('routing.skills.fetch_failed', { error: skillsError?.message });
      // Fall through to general rather than failing the request
      result = {
        route: 'general',
        confidence: 0.0,
        matched_by: 'general',
        trace_id: traceId,
        duration_ms: Date.now() - startMs,
      };
      await Promise.all([
        logRoutingDecision(serviceClient, { user_id, org_id, source, message, result, context }),
        setCachedRoute(serviceClient, cacheKey, result),
      ]);
      await logger.flush();
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // =========================================================================
    // Step 2 — Sequence Triggers (agent-sequence category, threshold 0.7)
    // =========================================================================
    const sequences = allSkills.filter((s) => s.category === 'agent-sequence' && s.is_enabled);
    let bestSequenceConfidence = 0;
    let bestSequenceSkill: OrgSkillRow | null = null;
    let bestSequenceTrigger: string | undefined;

    for (const seq of sequences) {
      const { confidence, matchedTrigger } = scoreSkill(message, seq.frontmatter);
      if (confidence > bestSequenceConfidence) {
        bestSequenceConfidence = confidence;
        bestSequenceSkill = seq;
        bestSequenceTrigger = matchedTrigger;
      }
    }

    if (bestSequenceSkill && bestSequenceConfidence >= SEQUENCE_CONFIDENCE_THRESHOLD) {
      logger.info('routing.matched.sequence', {
        skill_key: bestSequenceSkill.skill_key,
        confidence: bestSequenceConfidence,
        matched_trigger: bestSequenceTrigger,
      });
      result = {
        route: bestSequenceSkill.skill_key,
        skill_key: bestSequenceSkill.skill_key,
        confidence: bestSequenceConfidence,
        matched_by: 'sequence_trigger',
        trace_id: traceId,
        duration_ms: Date.now() - startMs,
      };
      await Promise.all([
        logRoutingDecision(serviceClient, { user_id, org_id, source, message, result, context }),
        setCachedRoute(serviceClient, cacheKey, result),
      ]);
      await logger.flush();
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // =========================================================================
    // Step 3 — Skill Triggers (individual skills, threshold 0.5)
    // =========================================================================
    const individualSkills = allSkills.filter(
      (s) => s.category !== 'agent-sequence' && s.category !== 'hitl' && s.is_enabled
    );

    let bestSkillConfidence = 0;
    let bestSkill: OrgSkillRow | null = null;
    let bestSkillTrigger: string | undefined;

    for (const skill of individualSkills) {
      const { confidence, matchedTrigger } = scoreSkill(message, skill.frontmatter);
      if (confidence > bestSkillConfidence) {
        bestSkillConfidence = confidence;
        bestSkill = skill;
        bestSkillTrigger = matchedTrigger;
      }
    }

    if (bestSkill && bestSkillConfidence >= INDIVIDUAL_CONFIDENCE_THRESHOLD) {
      logger.info('routing.matched.skill', {
        skill_key: bestSkill.skill_key,
        confidence: bestSkillConfidence,
        matched_trigger: bestSkillTrigger,
      });
      result = {
        route: bestSkill.skill_key,
        skill_key: bestSkill.skill_key,
        confidence: bestSkillConfidence,
        matched_by: 'skill_trigger',
        trace_id: traceId,
        duration_ms: Date.now() - startMs,
      };
      await Promise.all([
        logRoutingDecision(serviceClient, { user_id, org_id, source, message, result, context }),
        setCachedRoute(serviceClient, cacheKey, result),
      ]);
      await logger.flush();
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // =========================================================================
    // Step 4 — Semantic Fallback (cosine similarity on skill embeddings)
    // =========================================================================
    const semanticSpan = logger.createSpan('routing.semantic');
    try {
      const msgEmbedding = await embedMessage(message);

      if (msgEmbedding) {
        // All skills (sequences + individual) that have embeddings
        const skillsWithEmbeddings = allSkills.filter(
          (s) => s.is_enabled && Array.isArray(s.embedding) && s.embedding!.length > 0
        );

        let bestSimilarity = 0;
        let bestSemanticSkill: OrgSkillRow | null = null;

        for (const skill of skillsWithEmbeddings) {
          const similarity = cosineSimilarity(msgEmbedding, skill.embedding!);
          if (similarity > bestSimilarity) {
            bestSimilarity = similarity;
            bestSemanticSkill = skill;
          }
        }

        semanticSpan.stop({
          candidates: skillsWithEmbeddings.length,
          best_similarity: bestSimilarity,
          matched: bestSemanticSkill?.skill_key,
        });

        if (bestSemanticSkill && bestSimilarity >= SEMANTIC_SIMILARITY_THRESHOLD) {
          logger.info('routing.matched.semantic', {
            skill_key: bestSemanticSkill.skill_key,
            similarity: bestSimilarity,
          });
          result = {
            route: bestSemanticSkill.skill_key,
            skill_key: bestSemanticSkill.skill_key,
            confidence: bestSimilarity,
            matched_by: 'semantic',
            trace_id: traceId,
            duration_ms: Date.now() - startMs,
          };
          await Promise.all([
            logRoutingDecision(serviceClient, { user_id, org_id, source, message, result, context }),
            setCachedRoute(serviceClient, cacheKey, result),
          ]);
          await logger.flush();
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } else {
        semanticSpan.stop({ skipped: true, reason: 'no_embedding_generated' });
      }
    } catch (semanticErr) {
      semanticSpan.stop({ error: String(semanticErr) });
      logger.warn('routing.semantic.error', { error: String(semanticErr) });
      // Non-fatal — fall through to general
    }

    // =========================================================================
    // Step 5 — General Fallthrough
    // =========================================================================
    logger.info('routing.general_fallthrough', {
      best_sequence_confidence: bestSequenceConfidence,
      best_skill_confidence: bestSkillConfidence,
    });
    result = {
      route: 'general',
      confidence: 0.0,
      matched_by: 'general',
      trace_id: traceId,
      duration_ms: Date.now() - startMs,
    };
    await Promise.all([
      logRoutingDecision(serviceClient, { user_id, org_id, source, message, result, context }),
      setCachedRoute(serviceClient, cacheKey, result),
    ]);
  } catch (err) {
    logger.error('routing.unhandled_error', err);
    result = {
      route: 'general',
      confidence: 0.0,
      matched_by: 'general',
      trace_id: traceId,
      duration_ms: Date.now() - startMs,
    };
  }

  await logger.flush();
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

// =============================================================================
// Logging Helper
// =============================================================================

async function logRoutingDecision(
  client: ReturnType<typeof createClient>,
  params: {
    user_id: string;
    org_id: string;
    source: string;
    message: string;
    result: RouteResponse;
    context?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await client.from('copilot_routing_logs').insert({
      user_id: params.user_id,
      org_id: params.org_id,
      source: params.source,
      message_snippet: params.message.slice(0, 200),
      selected_skill_key: params.result.skill_key ?? null,
      confidence: params.result.confidence,
      matched_by: params.result.matched_by,
      trace_id: params.result.trace_id,
      duration_ms: params.result.duration_ms,
    });
  } catch {
    // Non-fatal — routing log failures must never break the response
  }
}
