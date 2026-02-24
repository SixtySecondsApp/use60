/**
 * Agent Config Inference Module
 *
 * Takes enrichment data (company industry, size, domain, bio, country) and
 * optionally CRM data (HubSpot pipeline stages, custom fields, deal stats),
 * then uses Gemini to infer the 14 agent configuration items defined in PRD-23.
 *
 * This module is called AFTER enrich-organization completes. It is NOT wired
 * into any edge function handler here — that wiring happens in a later story.
 *
 * Confidence tiers:
 *   'high'   — item already present in enrichment or directly backed by CRM data
 *   'medium' — AI-inferred from company context, or rule-derived from country/size
 *   'low'    — pure guess with minimal supporting signals
 */

// =============================================================================
// Types
// =============================================================================

export interface EnrichmentData {
  company_industry?: string;
  company_size?: string;
  company_bio?: string;
  company_domain?: string;
  company_country_code?: string;
  company_website?: string;
}

export interface CrmData {
  /** Ordered pipeline stages from the connected CRM (e.g. HubSpot) */
  pipeline_stages?: Array<{ name: string; order: number }>;
  /** Names of custom CRM fields configured in the org */
  custom_fields?: string[];
  /** Total number of closed/open deals in the CRM */
  deal_count?: number;
  /** Average closed-won deal value in the org's base currency */
  avg_deal_amount?: number;
  /** Average days from deal creation to close */
  avg_cycle_days?: number;
  /** Number of CRM users / sales reps in the org */
  user_count?: number;
}

export interface InferredConfigItem {
  /** Snake-case key matching the agent config schema */
  config_key: string;
  /** The inferred value — may be a string, number, array, or object */
  value: unknown;
  /** Confidence in this inference */
  confidence: "low" | "medium" | "high";
  /**
   * Where the value originated:
   *   'enrichment'    — copied directly from enrichment fields (no AI needed)
   *   'crm_data'      — derived directly from CRM stats / pipeline stages
   *   'country_rule'  — determined by a deterministic country-based rule
   *   'industry_norm' — from well-known industry norms without AI
   *   'ai_inference'  — Gemini inferred this from context
   */
  source: "enrichment" | "crm_data" | "country_rule" | "industry_norm" | "ai_inference";
  /**
   * Which agent type(s) this config item primarily applies to.
   * Values match AgentName in agentDefinitions.ts.
   */
  agent_type: string;
}

export interface AgentConfigInferenceResult {
  items: InferredConfigItem[];
  /** Raw Gemini response object for debugging / audit logging */
  raw_inference?: unknown;
}

// ---------------------------------------------------------------------------
// Internal: Gemini response shape
// ---------------------------------------------------------------------------

interface GeminiAgentConfigInference {
  sales_methodology?: string;
  sales_motion_type?: string;
  key_competitors?: string[];
  target_customer_profile?: string;
  typical_deal_size_range?: string;
  average_sales_cycle_days?: number;
  pricing_model?: string;
  common_objections?: string[];
  product_service_category?: string;
}

// =============================================================================
// Constants
// =============================================================================

const GEMINI_MODEL =
  Deno.env.get("GEMINI_FLASH_MODEL") ??
  Deno.env.get("GEMINI_MODEL") ??
  "gemini-2.5-flash";

const GEMINI_API_KEY =
  Deno.env.get("GEMINI_API_KEY") ??
  Deno.env.get("GOOGLE_GEMINI_API_KEY") ??
  "";

// =============================================================================
// Helpers
// =============================================================================

/**
 * Infer the fiscal year start month from a country code.
 *
 * Returns the 1-based month number (1 = January, 4 = April, 7 = July).
 * Falls back to 1 (January / calendar year) for unknown countries.
 *
 * Sources:
 *   - UK (GB): 6 April statutory year-end → month 4
 *   - Australia (AU): 1 July → month 7
 *   - India (IN): 1 April → month 4
 *   - Japan (JP): 1 April → month 4
 *   - Canada (CA): varies, but most corporations use 1 Jan or bespoke; default 1
 *   - All others: January (1)
 */
export function inferFiscalYear(countryCode?: string | null): {
  start_month: number;
  confidence: "medium" | "low";
} {
  if (!countryCode) {
    return { start_month: 1, confidence: "low" };
  }

  const code = countryCode.trim().toUpperCase();

  switch (code) {
    case "GB": // United Kingdom
    case "IE": // Ireland (follows similar convention)
      return { start_month: 4, confidence: "medium" };

    case "AU": // Australia
    case "NZ": // New Zealand
      return { start_month: 7, confidence: "medium" };

    case "IN": // India
    case "JP": // Japan
      return { start_month: 4, confidence: "medium" };

    default:
      // US, CA, EU, and most other countries default to January
      return { start_month: 1, confidence: "medium" };
  }
}

/**
 * Robust JSON parser — handles markdown code fences and minor formatting issues.
 * Mirrors the same approach used in enrich-organization/index.ts.
 */
function parseGeminiJSON(text: string): unknown {
  const fencedMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  let jsonString = fencedMatch ? fencedMatch[1] : text;

  if (!jsonString.trim().startsWith("{")) {
    const objectMatch = jsonString.match(/\{[\s\S]*\}/);
    if (objectMatch) jsonString = objectMatch[0];
  }

  jsonString = jsonString.trim();
  const firstBrace = jsonString.indexOf("{");
  const lastBrace = jsonString.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    jsonString = jsonString.substring(firstBrace, lastBrace + 1);
  }

  try {
    return JSON.parse(jsonString);
  } catch (_firstErr) {
    // Repair pass: escape unescaped control characters inside strings
    let inString = false;
    let escapeNext = false;
    const out: string[] = [];

    for (let i = 0; i < jsonString.length; i++) {
      const ch = jsonString[i];

      if (escapeNext) {
        out.push(ch);
        escapeNext = false;
        continue;
      }
      if (ch === "\\") {
        out.push(ch);
        escapeNext = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        out.push(ch);
        continue;
      }
      if (inString) {
        if (ch === "\n" || ch === "\r") out.push("\\n");
        else if (ch === "\t") out.push("\\t");
        else out.push(ch);
      } else {
        out.push(ch);
      }
    }

    if (inString) out.push('"');

    let repaired = out.join("");
    repaired = repaired.replace(/,(\s*[}\]])/g, "$1"); // strip trailing commas

    return JSON.parse(repaired);
  }
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isPositiveNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

function isNonEmptyArray(v: unknown): v is unknown[] {
  return Array.isArray(v) && v.length > 0;
}

// =============================================================================
// Gemini call
// =============================================================================

async function callGeminiForAgentConfig(input: {
  enrichment: EnrichmentData;
  crm: CrmData;
}): Promise<{ data: GeminiAgentConfigInference | null; rawText: string | null }> {
  if (!GEMINI_API_KEY) {
    console.warn("[agentConfigInference] GEMINI_API_KEY not set — skipping AI inference");
    return { data: null, rawText: null };
  }

  const { enrichment, crm } = input;

  // Build a concise context block so Gemini has signal without token waste
  const contextLines: string[] = [];

  if (isNonEmptyString(enrichment.company_domain)) {
    contextLines.push(`Domain: ${enrichment.company_domain}`);
  }
  if (isNonEmptyString(enrichment.company_industry)) {
    contextLines.push(`Industry: ${enrichment.company_industry}`);
  }
  if (isNonEmptyString(enrichment.company_size)) {
    contextLines.push(`Company size: ${enrichment.company_size}`);
  }
  if (isNonEmptyString(enrichment.company_country_code)) {
    contextLines.push(`Country: ${enrichment.company_country_code}`);
  }
  if (isNonEmptyString(enrichment.company_bio)) {
    contextLines.push(`Bio: ${enrichment.company_bio}`);
  }
  if (isNonEmptyString(enrichment.company_website)) {
    contextLines.push(`Website: ${enrichment.company_website}`);
  }

  // CRM signals — only include if meaningful
  if (isPositiveNumber(crm.avg_deal_amount)) {
    contextLines.push(`Avg deal value: ${crm.avg_deal_amount}`);
  }
  if (isPositiveNumber(crm.avg_cycle_days)) {
    contextLines.push(`Avg sales cycle days: ${crm.avg_cycle_days}`);
  }
  if (isPositiveNumber(crm.user_count)) {
    contextLines.push(`CRM user count: ${crm.user_count}`);
  }
  if (isPositiveNumber(crm.deal_count)) {
    contextLines.push(`Total CRM deals: ${crm.deal_count}`);
  }

  const companyContext = contextLines.join("\n");

  const prompt = `You are a B2B sales intelligence assistant.

Based on the following company profile, infer key sales configuration items for this organisation's AI sales copilot.

COMPANY PROFILE:
${companyContext}

INSTRUCTIONS:
- Infer values that are NOT already provided (industry, size, country are already known).
- Be concise and specific — generic answers are not useful.
- For competitors, name real companies the prospect would encounter.
- For pricing model, use one of: subscription, usage_based, one_time, hybrid, freemium.
- For sales methodology, use one of: generic, meddic, bant, spin, challenger.
- For sales motion type, use one of: plg, mid_market, enterprise, transactional.
- Omit fields you genuinely cannot infer.

CRITICAL OUTPUT RULES:
- Return ONLY valid JSON.
- No markdown, no code fences, no commentary.
- All strings must be JSON-escaped.

Return a JSON object with these fields (omit any you cannot confidently infer):
{
  "sales_methodology": "generic | meddic | bant | spin | challenger",
  "sales_motion_type": "plg | mid_market | enterprise | transactional",
  "key_competitors": ["CompanyName1", "CompanyName2"],
  "target_customer_profile": "1-2 sentence ICP description",
  "typical_deal_size_range": "e.g. $5,000–$50,000",
  "average_sales_cycle_days": 45,
  "pricing_model": "subscription | usage_based | one_time | hybrid | freemium",
  "common_objections": ["Objection 1", "Objection 2"],
  "product_service_category": "e.g. B2B SaaS, Professional Services, Hardware"
}`;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${GEMINI_API_KEY}`;

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        topP: 0.85,
        maxOutputTokens: 1000,
        responseMimeType: "application/json",
      },
    }),
  });

  const rawText = await resp.text();

  if (!resp.ok) {
    console.error("[agentConfigInference] Gemini API error:", rawText);
    return { data: null, rawText };
  }

  try {
    const payload = JSON.parse(rawText);
    const parts: Array<Record<string, unknown>> =
      payload.candidates?.[0]?.content?.parts ?? [];

    const text = parts
      .map((p) => (typeof p.text === "string" ? p.text : ""))
      .join("")
      .trim();

    if (!text) {
      console.warn("[agentConfigInference] Gemini returned empty text");
      return { data: null, rawText };
    }

    const parsed = parseGeminiJSON(text) as GeminiAgentConfigInference;
    return { data: parsed, rawText: text };
  } catch (err) {
    console.error("[agentConfigInference] Failed to parse Gemini payload:", err);
    return { data: null, rawText };
  }
}

// =============================================================================
// CRM stage mapping helper
// =============================================================================

/**
 * Converts raw pipeline stages into a simple key → label mapping.
 * Sorts by order ascending so downstream code gets a consistent shape.
 */
function buildCrmStageMapping(
  stages: Array<{ name: string; order: number }>
): Record<string, string> {
  const sorted = [...stages].sort((a, b) => a.order - b.order);
  const result: Record<string, string> = {};
  for (const stage of sorted) {
    const key = stage.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    result[key] = stage.name;
  }
  return result;
}

// =============================================================================
// Main export
// =============================================================================

/**
 * Infer agent configuration items from enrichment and optional CRM data.
 *
 * Skips Gemini entirely if no enrichment data is provided.
 *
 * @param enrichment  - Output from enrich-organization (or a subset thereof)
 * @param crm         - Optional CRM stats and pipeline stages
 * @returns           - Structured inference result with confidence scores
 */
export async function inferAgentConfig(
  enrichment: EnrichmentData,
  crm: CrmData = {}
): Promise<AgentConfigInferenceResult> {
  // Guard: nothing to infer without any enrichment signal
  const hasEnrichmentData =
    isNonEmptyString(enrichment.company_industry) ||
    isNonEmptyString(enrichment.company_size) ||
    isNonEmptyString(enrichment.company_bio) ||
    isNonEmptyString(enrichment.company_domain);

  if (!hasEnrichmentData) {
    console.info("[agentConfigInference] No enrichment data — returning empty result");
    return { items: [] };
  }

  const items: InferredConfigItem[] = [];

  // -------------------------------------------------------------------------
  // Pass 1: High-confidence items directly from enrichment data (no AI needed)
  // -------------------------------------------------------------------------

  if (isNonEmptyString(enrichment.company_industry)) {
    items.push({
      config_key: "industry_vertical",
      value: enrichment.company_industry.trim(),
      confidence: "high",
      source: "enrichment",
      agent_type: "pipeline",
    });
  }

  if (isNonEmptyString(enrichment.company_size)) {
    items.push({
      config_key: "company_size",
      value: enrichment.company_size.trim(),
      confidence: "high",
      source: "enrichment",
      agent_type: "pipeline",
    });
  }

  if (isNonEmptyString(enrichment.company_bio)) {
    items.push({
      config_key: "product_service_category",
      value: enrichment.company_bio.trim(),
      confidence: "high",
      source: "enrichment",
      agent_type: "research",
    });
  }

  // -------------------------------------------------------------------------
  // Pass 2: CRM-backed items (high confidence when present)
  // -------------------------------------------------------------------------

  if (isPositiveNumber(crm.avg_deal_amount)) {
    // Format as a range: ±50% of the average to give a sensible band
    const lo = Math.round(crm.avg_deal_amount * 0.5);
    const hi = Math.round(crm.avg_deal_amount * 1.5);
    items.push({
      config_key: "typical_deal_size_range",
      value: `${lo}–${hi}`,
      confidence: "high",
      source: "crm_data",
      agent_type: "pipeline",
    });
  }

  if (isPositiveNumber(crm.avg_cycle_days)) {
    items.push({
      config_key: "average_sales_cycle_days",
      value: Math.round(crm.avg_cycle_days),
      confidence: "high",
      source: "crm_data",
      agent_type: "pipeline",
    });
  }

  if (isPositiveNumber(crm.user_count)) {
    items.push({
      config_key: "team_size",
      value: crm.user_count,
      confidence: "high",
      source: "crm_data",
      agent_type: "crm_ops",
    });
  }

  if (isNonEmptyArray(crm.pipeline_stages)) {
    items.push({
      config_key: "crm_stage_mapping",
      value: buildCrmStageMapping(
        crm.pipeline_stages as Array<{ name: string; order: number }>
      ),
      confidence: "high",
      source: "crm_data",
      agent_type: "pipeline",
    });
  }

  // -------------------------------------------------------------------------
  // Pass 3: Country-based rule for fiscal year (medium confidence)
  // -------------------------------------------------------------------------

  const fiscalYear = inferFiscalYear(enrichment.company_country_code);
  items.push({
    config_key: "fiscal_year_start_month",
    value: fiscalYear.start_month,
    confidence: fiscalYear.confidence,
    source: "country_rule",
    agent_type: "pipeline",
  });

  // -------------------------------------------------------------------------
  // Pass 4: Gemini inference for the remaining items
  // -------------------------------------------------------------------------

  // Determine which items we still need to ask Gemini for
  const alreadyInferredKeys = new Set(items.map((i) => i.config_key));

  const needsGemini =
    !alreadyInferredKeys.has("sales_methodology") ||
    !alreadyInferredKeys.has("sales_motion_type") ||
    !alreadyInferredKeys.has("key_competitors") ||
    !alreadyInferredKeys.has("target_customer_profile") ||
    !alreadyInferredKeys.has("typical_deal_size_range") ||
    !alreadyInferredKeys.has("average_sales_cycle_days") ||
    !alreadyInferredKeys.has("pricing_model") ||
    !alreadyInferredKeys.has("common_objections") ||
    !alreadyInferredKeys.has("product_service_category");

  let rawInference: unknown;

  if (needsGemini) {
    const gemini = await callGeminiForAgentConfig({ enrichment, crm });
    rawInference = gemini.rawText;

    if (gemini.data) {
      const g = gemini.data;

      if (
        isNonEmptyString(g.sales_methodology) &&
        !alreadyInferredKeys.has("sales_methodology")
      ) {
        items.push({
          config_key: "sales_methodology",
          value: g.sales_methodology.trim().toLowerCase(),
          confidence: "medium",
          source: "ai_inference",
          agent_type: "pipeline",
        });
      }

      if (
        isNonEmptyString(g.sales_motion_type) &&
        !alreadyInferredKeys.has("sales_motion_type")
      ) {
        items.push({
          config_key: "sales_motion_type",
          value: g.sales_motion_type.trim().toLowerCase(),
          confidence: "medium",
          source: "ai_inference",
          agent_type: "pipeline",
        });
      }

      if (
        isNonEmptyArray(g.key_competitors) &&
        !alreadyInferredKeys.has("key_competitors")
      ) {
        items.push({
          config_key: "key_competitors",
          value: (g.key_competitors as string[])
            .filter(isNonEmptyString)
            .map((s: string) => s.trim()),
          confidence: "medium",
          source: "ai_inference",
          agent_type: "research",
        });
      }

      if (
        isNonEmptyString(g.target_customer_profile) &&
        !alreadyInferredKeys.has("target_customer_profile")
      ) {
        items.push({
          config_key: "target_customer_profile",
          value: g.target_customer_profile.trim(),
          confidence: "medium",
          source: "ai_inference",
          agent_type: "prospecting",
        });
      }

      if (
        isNonEmptyString(g.typical_deal_size_range) &&
        !alreadyInferredKeys.has("typical_deal_size_range")
      ) {
        items.push({
          config_key: "typical_deal_size_range",
          value: g.typical_deal_size_range.trim(),
          confidence: "medium",
          source: "ai_inference",
          agent_type: "pipeline",
        });
      }

      if (
        isPositiveNumber(g.average_sales_cycle_days) &&
        !alreadyInferredKeys.has("average_sales_cycle_days")
      ) {
        items.push({
          config_key: "average_sales_cycle_days",
          value: Math.round(g.average_sales_cycle_days),
          confidence: "medium",
          source: "ai_inference",
          agent_type: "pipeline",
        });
      }

      if (
        isNonEmptyString(g.pricing_model) &&
        !alreadyInferredKeys.has("pricing_model")
      ) {
        items.push({
          config_key: "pricing_model",
          value: g.pricing_model.trim().toLowerCase(),
          confidence: "medium",
          source: "ai_inference",
          agent_type: "outreach",
        });
      }

      if (
        isNonEmptyArray(g.common_objections) &&
        !alreadyInferredKeys.has("common_objections")
      ) {
        items.push({
          config_key: "common_objections",
          value: (g.common_objections as string[])
            .filter(isNonEmptyString)
            .map((s: string) => s.trim()),
          confidence: "medium",
          source: "ai_inference",
          agent_type: "outreach",
        });
      }

      // product_service_category: only use AI value if enrichment bio was absent
      if (
        isNonEmptyString(g.product_service_category) &&
        !alreadyInferredKeys.has("product_service_category")
      ) {
        items.push({
          config_key: "product_service_category",
          value: g.product_service_category.trim(),
          confidence: "medium",
          source: "ai_inference",
          agent_type: "research",
        });
      }
    } else {
      console.warn(
        "[agentConfigInference] Gemini returned no data; AI-inferred items will be absent"
      );
    }
  }

  // -------------------------------------------------------------------------
  // Pass 5: Fallback low-confidence industry norms for items still missing
  // -------------------------------------------------------------------------

  const finalKeys = new Set(items.map((i) => i.config_key));

  if (!finalKeys.has("sales_methodology")) {
    items.push({
      config_key: "sales_methodology",
      value: "generic",
      confidence: "low",
      source: "industry_norm",
      agent_type: "pipeline",
    });
  }

  if (!finalKeys.has("team_size")) {
    items.push({
      config_key: "team_size",
      value: null,
      confidence: "low",
      source: "industry_norm",
      agent_type: "crm_ops",
    });
  }

  return { items, raw_inference: rawInference };
}
