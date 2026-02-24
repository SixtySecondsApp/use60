// supabase/functions/demo-research/index.ts
//
// Public edge function: researches a company domain and generates a complete
// ResearchData payload for the demo experience.
//
// Architecture (2-phase pipeline, ~3-6s total):
//   Phase 1: Exa semantic search → raw web page content (~1s)
//            Returns actual text from 5 top results (company site, LinkedIn, etc.)
//   Phase 2: Single Gemini 2.5 Flash call → full structured JSON (~2-4s)
//            Extracts company info + generates demo content in one shot.
//            Thinking disabled for speed (thinkingBudget=0).
//
// Fallback chain: Exa fails → Gemini 3 Flash grounded search → single-shot.

import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';

// ============================================================================
// Rate limiter (in-memory, per-isolate)
// ============================================================================

const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(ip) ?? [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) return true;
  recent.push(now);
  rateLimitMap.set(ip, recent);
  return false;
}

// ============================================================================
// Domain extraction
// ============================================================================

function extractDomain(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?/, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
  if (!cleaned || !cleaned.includes('.') || cleaned.length < 4) return null;
  return cleaned;
}

// ============================================================================
// Exa search — fast semantic web search (~1s)
// ============================================================================

async function exaSearch(
  domain: string,
  apiKey: string
): Promise<{ text: string; durationMs: number }> {
  const start = performance.now();

  const response = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `${domain} company overview products services customers`,
      type: 'auto',
      numResults: 5,
      contents: {
        text: { maxCharacters: 1500 },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Exa API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const results = data.results || [];

  // Combine text from all results into a single context string
  const text = results
    .map((r: { title?: string; url?: string; text?: string }) => {
      const title = r.title || '';
      const url = r.url || '';
      const content = r.text || '';
      return `[${title}] (${url})\n${content}`;
    })
    .join('\n\n---\n\n');

  const durationMs = Math.round(performance.now() - start);
  console.log(`[exa] Got ${results.length} results (${text.length} chars) in ${durationMs}ms`);

  if (!text || text.length < 50) {
    throw new Error('Exa returned insufficient content');
  }

  return { text, durationMs };
}

// ============================================================================
// Gemini helper
// ============================================================================

const GEMINI_MODEL_FAST = 'gemini-2.5-flash';
const GEMINI_MODEL_GROUNDED = 'gemini-3-flash-preview';

async function callGemini(
  apiKey: string,
  prompt: string,
  opts: {
    temperature?: number;
    maxOutputTokens?: number;
    grounding?: boolean;
    model?: string;
    disableThinking?: boolean;
  } = {}
): Promise<{ text: string; inputTokens: number; outputTokens: number; durationMs: number }> {
  const start = performance.now();
  const model = opts.model ?? GEMINI_MODEL_FAST;

  const generationConfig: Record<string, unknown> = {
    temperature: opts.temperature ?? 0.3,
    maxOutputTokens: opts.maxOutputTokens ?? 2048,
  };

  if (opts.disableThinking) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  const requestBody: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig,
  };

  if (opts.grounding) {
    requestBody.tools = [{ googleSearch: {} }];
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as Record<string, Record<string, string>>;
    throw new Error(`Gemini API error (${model}): ${err.error?.message || response.statusText}`);
  }

  const data = await response.json();
  // Gemini 2.5 Flash returns thinking + text parts — extract only non-thought text
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts
    .filter((p: { thought?: boolean }) => !p.thought)
    .map((p: { text?: string }) => p.text || '')
    .join('') || '';
  if (!text) throw new Error(`Empty response from ${model}`);

  return {
    text,
    inputTokens: data.usageMetadata?.promptTokenCount || 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
    durationMs: Math.round(performance.now() - start),
  };
}

function parseJsonFromText(text: string): Record<string, unknown> {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;
  return JSON.parse(jsonStr);
}

// ============================================================================
// Generation prompt — single Gemini call produces all demo content
// ============================================================================

function buildExtractionPrompt(domain: string, searchResults: string): string {
  return `Web search results about ${domain}:

${searchResults}

---

Extract real company information and generate fictional demo content. Use REAL company data from the search results. Use FICTIONAL names for people and prospect companies.

For the email_preview: under 75 words, lowercase 3-word subject line then body, open with an observation about the prospect's business, end with a "worth a look?" style CTA, use contractions, reference a real product from the search results.

Return ONLY a JSON object:
{"company":{"name":"","vertical":"2 word industry","product_summary":"what they do in 2 sentences","value_props":["","",""],"icp_title":"who buys this","icp_company_size":"typical buyer size","icp_industry":"buyer industry","employee_range":"","competitors":["",""]},"outreach":{"target_name":"fictional","target_title":"","target_company":"fictional","personalised_hook":"1 sentence referencing real product","email_preview":"under 75 words cold email"},"meeting":{"attendee_name":"fictional","attendee_company":"fictional","context":"","talking_points":["","",""]},"pipeline":{"deal_name":"fictional — deal type","deal_value":"$XX,000","days_stale":0,"health_score":0,"risk_signal":"","suggested_action":"","signals":[{"label":"","type":"warning"},{"label":"","type":"warning"},{"label":"","type":"positive"},{"label":"","type":"positive"}]}}`;
}

// ============================================================================
// Primary pipeline: Exa search (~1s) → Gemini extraction (~3s)
// ============================================================================

async function researchPipeline(
  domain: string,
  geminiKey: string,
  exaKey: string
): Promise<{ data: Record<string, unknown>; meta: Record<string, unknown> }> {
  const pipelineStart = performance.now();

  // Phase 1: Exa semantic search
  const exa = await exaSearch(domain, exaKey);

  // Phase 2: Single Gemini 2.5 Flash call — all sections in one shot
  const prompt = buildExtractionPrompt(domain, exa.text);
  const gemini = await callGemini(geminiKey, prompt, {
    temperature: 0.3,
    maxOutputTokens: 2048,
    model: GEMINI_MODEL_FAST,
    disableThinking: true,
  });

  const parsed = parseJsonFromText(gemini.text);

  // Restructure into frontend-expected shape
  const rawCompany = (parsed.company as Record<string, unknown>) || {};
  const outreach = (parsed.outreach as Record<string, unknown>) || {};
  const meeting = (parsed.meeting as Record<string, unknown>) || {};
  const pipeline = (parsed.pipeline as Record<string, unknown>) || {};

  // Restructure flat ICP fields into nested object for frontend compatibility
  const company: Record<string, unknown> = { ...rawCompany };
  if (rawCompany.icp_title || rawCompany.icp_company_size || rawCompany.icp_industry) {
    company.icp = {
      title: rawCompany.icp_title || '',
      company_size: rawCompany.icp_company_size || '',
      industry: rawCompany.icp_industry || '',
    };
    delete company.icp_title;
    delete company.icp_company_size;
    delete company.icp_industry;
  }

  const data: Record<string, unknown> = {
    company: { ...company, domain },
    demo_actions: {
      cold_outreach: outreach.target_name ? outreach : {},
      proposal_draft: {},
      meeting_prep: meeting.attendee_name ? meeting : {},
      pipeline_action: pipeline.deal_name ? pipeline : {},
    },
    stats: {
      signals_found: Math.floor(Math.random() * 30) + 30,
      actions_queued: Math.floor(Math.random() * 7) + 8,
      contacts_identified: Math.floor(Math.random() * 7) + 5,
      opportunities_mapped: Math.floor(Math.random() * 3) + 3,
    },
  };

  const totalDurationMs = Math.round(performance.now() - pipelineStart);
  console.log(`[pipeline] Exa+Gemini: ${totalDurationMs}ms (exa=${exa.durationMs}ms, gemini=${gemini.durationMs}ms)`);

  return {
    data,
    meta: {
      mode: 'exa-pipeline',
      models: { search: 'exa', extraction: GEMINI_MODEL_FAST },
      calls: 2,
      totalDurationMs,
      exaMs: exa.durationMs,
      geminiMs: gemini.durationMs,
      inputTokens: gemini.inputTokens,
      outputTokens: gemini.outputTokens,
    },
  };
}

// ============================================================================
// Fallback: Gemini grounded search → structured extraction
// Used when Exa is unavailable or fails.
// ============================================================================

async function researchGeminiFallback(
  domain: string,
  apiKey: string
): Promise<{ data: Record<string, unknown>; meta: Record<string, unknown> }> {
  console.log(`[fallback-gemini] Grounded research for ${domain}`);
  const pipelineStart = performance.now();

  // Phase 1: Grounded plain text brief via Gemini 3 Flash
  const briefPrompt = `Research "${domain}" thoroughly using web search. Write a concise company intelligence brief covering:

1. COMPANY: Official name, what they do (1-2 sentences), industry/vertical, approximate employee count, founding year
2. PRODUCTS: Their main products or services with specific names and what each does
3. CUSTOMERS: Who buys from them — typical job titles, company sizes, industries
4. COMPETITORS: 2-3 direct competitors with names
5. RECENT NEWS: Any notable recent developments, funding, partnerships, or growth signals

Be specific and factual. Use real product names, real competitor names, real details from their website.`;

  const brief = await callGemini(apiKey, briefPrompt, {
    temperature: 0.1,
    maxOutputTokens: 768,
    grounding: true,
    model: GEMINI_MODEL_GROUNDED,
  });

  // Phase 2: Single Gemini 2.5 Flash extraction
  const extractionPrompt = buildExtractionPrompt(domain, brief.text);
  const gemini = await callGemini(apiKey, extractionPrompt, {
    temperature: 0.3,
    maxOutputTokens: 2048,
    model: GEMINI_MODEL_FAST,
    disableThinking: true,
  });

  const parsed = parseJsonFromText(gemini.text);

  const rawCompany = (parsed.company as Record<string, unknown>) || {};
  const outreach = (parsed.outreach as Record<string, unknown>) || {};
  const meeting = (parsed.meeting as Record<string, unknown>) || {};
  const pipeline = (parsed.pipeline as Record<string, unknown>) || {};

  const company: Record<string, unknown> = { ...rawCompany };
  if (rawCompany.icp_title || rawCompany.icp_company_size || rawCompany.icp_industry) {
    company.icp = {
      title: rawCompany.icp_title || '',
      company_size: rawCompany.icp_company_size || '',
      industry: rawCompany.icp_industry || '',
    };
    delete company.icp_title;
    delete company.icp_company_size;
    delete company.icp_industry;
  }

  const data: Record<string, unknown> = {
    company: { ...company, domain },
    demo_actions: {
      cold_outreach: outreach.target_name ? outreach : {},
      proposal_draft: {},
      meeting_prep: meeting.attendee_name ? meeting : {},
      pipeline_action: pipeline.deal_name ? pipeline : {},
    },
    stats: {
      signals_found: Math.floor(Math.random() * 30) + 30,
      actions_queued: Math.floor(Math.random() * 7) + 8,
      contacts_identified: Math.floor(Math.random() * 7) + 5,
      opportunities_mapped: Math.floor(Math.random() * 3) + 3,
    },
  };

  const totalDurationMs = Math.round(performance.now() - pipelineStart);
  console.log(`[fallback-gemini] Total: ${totalDurationMs}ms (brief=${brief.durationMs}ms, extraction=${gemini.durationMs}ms)`);

  return {
    data,
    meta: {
      mode: 'gemini-fallback',
      models: { research: GEMINI_MODEL_GROUNDED, extraction: GEMINI_MODEL_FAST },
      calls: 2,
      totalDurationMs,
      briefMs: brief.durationMs,
      extractionMs: gemini.durationMs,
      inputTokens: brief.inputTokens + gemini.inputTokens,
      outputTokens: brief.outputTokens + gemini.outputTokens,
    },
  };
}

// ============================================================================
// Handler
// ============================================================================

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('cf-connecting-ip') ||
    'unknown';
  if (isRateLimited(ip)) {
    return errorResponse('Rate limit exceeded. Try again in a minute.', req, 429);
  }

  try {
    const body = await req.json();
    const rawUrl = body?.url;
    if (!rawUrl || typeof rawUrl !== 'string') {
      return errorResponse('Missing or invalid "url" field', req, 400);
    }

    const domain = extractDomain(rawUrl);
    if (!domain) {
      return errorResponse('Invalid domain', req, 400);
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';
    if (!GEMINI_API_KEY) {
      return errorResponse('GEMINI_API_KEY not configured', req, 500);
    }

    const EXA_API_KEY = Deno.env.get('EXA_API_KEY') || '';

    console.log(`[demo-research] domain=${domain} exa=${!!EXA_API_KEY}`);

    // Try Exa pipeline first (fastest), fall back to Gemini grounded search
    if (EXA_API_KEY) {
      try {
        const result = await researchPipeline(domain, GEMINI_API_KEY, EXA_API_KEY);
        console.log(`[demo-research] Exa pipeline: ${result.meta.totalDurationMs}ms`);
        return jsonResponse({ success: true, data: result.data, meta: result.meta }, req);
      } catch (exaError) {
        console.warn(`[demo-research] Exa pipeline failed:`, exaError);
        // Fall through to Gemini fallback
      }
    }

    try {
      const result = await researchGeminiFallback(domain, GEMINI_API_KEY);
      console.log(`[demo-research] Gemini fallback: ${result.meta.totalDurationMs}ms`);
      return jsonResponse({
        success: true,
        data: result.data,
        meta: { ...result.meta, fallback: !EXA_API_KEY ? 'no-exa-key' : 'exa-failed' },
      }, req);
    } catch (fallbackError) {
      console.error(`[demo-research] All pipelines failed:`, fallbackError);
      const message = fallbackError instanceof Error ? fallbackError.message : 'Research failed';
      return errorResponse(message, req, 500);
    }
  } catch (error) {
    console.error('[demo-research] Error:', error);
    const message = error instanceof Error ? error.message : 'Research failed';
    return errorResponse(message, req, 500);
  }
});
