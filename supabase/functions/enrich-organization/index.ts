import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { getCorsHeaders, handleCorsPreflightRequest } from "../_shared/corsHelper.ts";
import { getAuthContext, requireOrgRole } from "../_shared/edgeAuth.ts";
import { logAICostEvent, checkCreditBalance } from "../_shared/costTracking.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const GEMINI_MODEL =
  Deno.env.get("GEMINI_FLASH_MODEL") ??
  Deno.env.get("GEMINI_MODEL") ??
  "gemini-2.5-flash";

const GEMINI_API_KEY =
  Deno.env.get("GEMINI_API_KEY") ??
  Deno.env.get("GOOGLE_GEMINI_API_KEY") ??
  "";

// JSON_HEADERS is computed per-request in the serve handler using getCorsHeaders(req)

type EnrichOrganizationRequest = {
  orgId: string;
  domain?: string;
  orgName?: string;
  force?: boolean;
};

type GeminiOrgEnrichment = {
  currency_code?: string;
  currency_locale?: string;
  company_domain?: string;
  company_website?: string;
  company_country_code?: string;
  company_timezone?: string;
  company_industry?: string;
  company_size?: string;
  company_bio?: string;
  company_linkedin_url?: string;
  user_bio?: string;
  confidence?: number;
};

const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "aol.com",
  "protonmail.com",
]);

const SUPPORTED_CURRENCIES = new Set(["GBP", "USD", "EUR", "AUD", "CAD"]);

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function clamp01(n: unknown): number | null {
  const x = typeof n === "number" ? n : typeof n === "string" ? Number(n) : NaN;
  if (!Number.isFinite(x)) return null;
  return Math.min(1, Math.max(0, x));
}

function normalizeDomain(raw: string): string {
  const v = raw.trim().toLowerCase();
  // strip protocol
  const noProto = v.replace(/^https?:\/\//, "");
  // strip path/query
  const host = noProto.split("/")[0].split("?")[0].split("#")[0];
  // strip leading www.
  return host.replace(/^www\./, "");
}

function domainFromEmail(email: string | null | undefined): string | null {
  if (!email || !email.includes("@")) return null;
  const domain = email.split("@")[1]?.toLowerCase().trim();
  if (!domain) return null;
  return normalizeDomain(domain);
}

function defaultLocaleForCurrency(currencyCode: string): string {
  switch (currencyCode) {
    case "GBP":
      return "en-GB";
    case "USD":
      return "en-US";
    case "EUR":
      return "en-IE";
    case "AUD":
      return "en-AU";
    case "CAD":
      return "en-CA";
    default:
      return "en-GB";
  }
}

/**
 * Robust JSON parser for Gemini responses.
 * Handles markdown code blocks, trailing text, and common malformed JSON.
 */
function parseGeminiJSONResponse(text: string): any {
  const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  let jsonString = jsonMatch ? jsonMatch[1] : text;

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
  } catch (_err) {
    // Repair pass
    let repaired = jsonString;

    let inString = false;
    let escapeNext = false;
    const out: string[] = [];

    for (let i = 0; i < repaired.length; i++) {
      const ch = repaired[i];

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

    repaired = out.join("");
    repaired = repaired.replace(/,(\s*[}\]])/g, "$1"); // trailing commas

    return JSON.parse(repaired);
  }
}

async function callGeminiForOrgEnrichment(input: {
  domain: string;
  orgName?: string | null;
  userName?: string | null;
  userEmail?: string | null;
}): Promise<{ data: GeminiOrgEnrichment | null; rawText: string | null }> {
  if (!GEMINI_API_KEY) {
    return { data: null, rawText: null };
  }

  const prompt = `You are a B2B company enrichment assistant.

Given:
- Organization name: ${input.orgName || "Unknown"}
- Company domain: ${input.domain}
- Signup user: ${input.userName || "Unknown"}
- Signup email: ${input.userEmail || "Unknown"}

Infer the organization/company profile and the most likely location.

CRITICAL OUTPUT RULES:
- Return ONLY valid JSON.
- No markdown, no code fences, no commentary.
- Omit fields you cannot infer.
- All strings must be JSON-escaped (\\n for newlines, \\" for quotes).

Return a JSON object with these fields (omit any you cannot infer):
{
  "currency_code": "One of: GBP, USD, EUR, AUD, CAD",
  "currency_locale": "A locale like en-GB, en-US, de-DE, en-AU, en-CA",
  "company_domain": "Normalized domain, like example.com",
  "company_website": "Full website URL (https://...) if known",
  "company_country_code": "2-letter country code like GB, US, DE",
  "company_timezone": "IANA timezone like Europe/London",
  "company_industry": "Industry label",
  "company_size": "Size label (free text is fine)",
  "company_bio": "2-4 sentence company bio",
  "company_linkedin_url": "LinkedIn company page URL",
  "user_bio": "1-2 sentence bio for the signup user if you can infer a role (optional)",
  "confidence": 0.0
}`;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${GEMINI_API_KEY}`;

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        topP: 0.8,
        maxOutputTokens: 1200,
        responseMimeType: "application/json",
      },
    }),
  });

  const rawText = await resp.text();
  if (!resp.ok) {
    console.error("[enrich-organization] Gemini error:", rawText);
    return { data: null, rawText };
  }

  // Gemini returns JSON body; parse and extract text
  try {
    const payload = JSON.parse(rawText);
    const parts = payload.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .map((p: Record<string, unknown>) => (typeof (p as any).text === "string" ? (p as any).text : ""))
      .join("")
      .trim();

    if (!text) {
      return { data: null, rawText };
    }

    const parsed = parseGeminiJSONResponse(text);
    return { data: parsed as GeminiOrgEnrichment, rawText: text };
  } catch (e) {
    console.error("[enrich-organization] Failed to parse Gemini payload:", e);
    return { data: null, rawText };
  }
}

function pickIfMissingOrForce(
  current: unknown,
  next: unknown,
  force: boolean
): unknown {
  if (force) return next;
  const cur = typeof current === "string" ? current.trim() : current;
  if (cur === null || cur === undefined) return next;
  if (typeof cur === "string" && cur.length === 0) return next;
  return current;
}

serve(async (req) => {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  const cors = getCorsHeaders(req);
  const JSON_HEADERS = { ...cors, "Content-Type": "application/json" };

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing Supabase configuration" }),
        { status: 500, headers: JSON_HEADERS },
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const auth = await getAuthContext(req, supabase as any, SERVICE_ROLE_KEY);

    if (auth.mode !== "user" || !auth.userId) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: JSON_HEADERS },
      );
    }

    const body = (await req.json().catch(() => ({}))) as Partial<EnrichOrganizationRequest>;
    const orgId = body.orgId;
    const force = body.force === true;

    if (!isNonEmptyString(orgId)) {
      return new Response(
        JSON.stringify({ success: false, error: "orgId is required" }),
        { status: 400, headers: JSON_HEADERS },
      );
    }

    // External release hardening: org admins (or platform admins) only.
    if (!auth.isPlatformAdmin) {
      await requireOrgRole(supabase as any, orgId, auth.userId, ["owner", "admin"]);
    }

    // Load org + user profile
    const { data: org, error: orgError } = await (supabase as any)
      .from("organizations")
      .select(
        "id, name, currency_code, currency_locale, company_domain, company_website, company_country_code, company_timezone, company_industry, company_size, company_bio, company_linkedin_url, company_enrichment_status"
      )
      .eq("id", orgId)
      .single();

    if (orgError || !org) {
      return new Response(
        JSON.stringify({ success: false, error: "Organization not found" }),
        { status: 404, headers: JSON_HEADERS },
      );
    }

    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("email, first_name, last_name, bio")
      .eq("id", auth.userId)
      .single();

    const userEmail = (profile as any)?.email as string | null | undefined;
    const userName = `${(profile as any)?.first_name || ""} ${(profile as any)?.last_name || ""}`.trim() || null;
    const userBioCurrent = (profile as any)?.bio as string | null | undefined;

    // Early exit if already completed and not forcing
    if (!force && org.company_enrichment_status === "completed") {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Organization already enriched",
          status: org.company_enrichment_status,
          orgId,
        }),
        { status: 200, headers: JSON_HEADERS },
      );
    }

    // Determine domain
    const inputDomainRaw = isNonEmptyString(body.domain)
      ? body.domain
      : isNonEmptyString((org as any).company_domain)
        ? (org as any).company_domain
        : domainFromEmail(userEmail);

    const domain = inputDomainRaw ? normalizeDomain(inputDomainRaw) : null;

    if (!domain || PERSONAL_EMAIL_DOMAINS.has(domain)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Unable to infer a company domain from input/user email",
        }),
        { status: 400, headers: JSON_HEADERS },
      );
    }

    // Check credit balance before Gemini enrichment
    const creditCheck = await checkCreditBalance(supabase as any, orgId);
    if (!creditCheck.allowed) {
      return new Response(
        JSON.stringify({ success: false, error: "Insufficient credits", message: creditCheck.message }),
        { status: 402, headers: JSON_HEADERS },
      );
    }

    // Mark pending
    await (supabase as any)
      .from("organizations")
      .update({
        company_enrichment_status: "pending",
        updated_at: new Date().toISOString(),
        company_domain: (org as any).company_domain || domain,
      })
      .eq("id", orgId);

    const gemini = await callGeminiForOrgEnrichment({
      domain,
      orgName: body.orgName || (org as any).name,
      userName,
      userEmail,
    });

    if (!gemini.data) {
      await (supabase as any)
        .from("organizations")
        .update({
          company_enrichment_status: "failed",
          updated_at: new Date().toISOString(),
          company_enrichment_raw: gemini.rawText
            ? { error: "Gemini enrichment failed", raw: gemini.rawText }
            : { error: "Gemini enrichment failed" },
        })
        .eq("id", orgId);

      return new Response(
        JSON.stringify({ success: false, error: "Gemini enrichment failed" }),
        { status: 500, headers: JSON_HEADERS },
      );
    }

    const parsed = gemini.data;

    const currencyCode = isNonEmptyString(parsed.currency_code)
      ? parsed.currency_code.trim().toUpperCase()
      : null;

    const safeCurrencyCode = currencyCode && SUPPORTED_CURRENCIES.has(currencyCode)
      ? currencyCode
      : null;

    const safeCurrencyLocale = isNonEmptyString(parsed.currency_locale)
      ? parsed.currency_locale.trim()
      : safeCurrencyCode
        ? defaultLocaleForCurrency(safeCurrencyCode)
        : null;

    const confidence = clamp01(parsed.confidence);

    const orgUpdate: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      company_enriched_at: new Date().toISOString(),
      company_enrichment_status: "completed",
      company_enrichment_confidence: confidence,
      company_enrichment_raw: {
        model: GEMINI_MODEL,
        input: { domain, orgName: body.orgName || (org as any).name },
        output: parsed,
      },
    };

    // Non-destructive updates unless force=true
    orgUpdate.company_domain = pickIfMissingOrForce((org as any).company_domain, normalizeDomain(parsed.company_domain || domain), force);
    if (isNonEmptyString(parsed.company_website)) {
      orgUpdate.company_website = pickIfMissingOrForce((org as any).company_website, parsed.company_website.trim(), force);
    }
    if (isNonEmptyString(parsed.company_country_code)) {
      orgUpdate.company_country_code = pickIfMissingOrForce((org as any).company_country_code, parsed.company_country_code.trim().toUpperCase(), force);
    }
    if (isNonEmptyString(parsed.company_timezone)) {
      orgUpdate.company_timezone = pickIfMissingOrForce((org as any).company_timezone, parsed.company_timezone.trim(), force);
    }
    if (isNonEmptyString(parsed.company_industry)) {
      orgUpdate.company_industry = pickIfMissingOrForce((org as any).company_industry, parsed.company_industry.trim(), force);
    }
    if (isNonEmptyString(parsed.company_size)) {
      orgUpdate.company_size = pickIfMissingOrForce((org as any).company_size, parsed.company_size.trim(), force);
    }
    if (isNonEmptyString(parsed.company_bio)) {
      orgUpdate.company_bio = pickIfMissingOrForce((org as any).company_bio, parsed.company_bio.trim(), force);
    }
    if (isNonEmptyString(parsed.company_linkedin_url)) {
      orgUpdate.company_linkedin_url = pickIfMissingOrForce((org as any).company_linkedin_url, parsed.company_linkedin_url.trim(), force);
    }

    // Currency: do not overwrite user-customized values unless force=true.
    const currentCurrencyCode = isNonEmptyString((org as any).currency_code) ? String((org as any).currency_code).trim().toUpperCase() : "GBP";
    const currentLocale = isNonEmptyString((org as any).currency_locale) ? String((org as any).currency_locale).trim() : "en-GB";

    if (safeCurrencyCode) {
      const shouldUpdateCurrency = force || currentCurrencyCode === "GBP";
      if (shouldUpdateCurrency) {
        orgUpdate.currency_code = safeCurrencyCode;
        orgUpdate.currency_locale = safeCurrencyLocale || defaultLocaleForCurrency(safeCurrencyCode);
      } else {
        // Keep user-configured currency, but still store inferred currency in raw payload.
        orgUpdate.currency_code = currentCurrencyCode;
        orgUpdate.currency_locale = currentLocale;
      }
    }

    const { error: updateOrgError } = await (supabase as any)
      .from("organizations")
      .update(orgUpdate)
      .eq("id", orgId);

    if (updateOrgError) {
      return new Response(
        JSON.stringify({ success: false, error: updateOrgError.message || "Failed to update organization" }),
        { status: 500, headers: JSON_HEADERS },
      );
    }

    // Log AI cost event for Gemini enrichment call (estimated tokens)
    logAICostEvent(supabase as any, auth.userId!, orgId, 'gemini', GEMINI_MODEL, 500, 400, 'research_enrichment').catch(() => {});

    // Optionally update user bio
    let userBioUpdated = false;
    if (isNonEmptyString(parsed.user_bio)) {
      const shouldUpdateBio = force || !isNonEmptyString(userBioCurrent);
      if (shouldUpdateBio) {
        const { error: bioError } = await (supabase as any)
          .from("profiles")
          .update({ bio: parsed.user_bio.trim(), updated_at: new Date().toISOString() })
          .eq("id", auth.userId);
        if (!bioError) userBioUpdated = true;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        orgId,
        status: "completed",
        confidence,
        userBioUpdated,
      }),
      { status: 200, headers: JSON_HEADERS },
    );
  } catch (error: any) {
    console.error("[enrich-organization] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message || "Internal server error" }),
      { status: 500, headers: JSON_HEADERS },
    );
  }
});












