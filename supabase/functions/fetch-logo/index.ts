import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const JSON_HEADERS = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

interface FetchLogoRequest {
  domain: string;
}

interface LogoSuccessResponse {
  logo_url: string;
  source: "logo_dev";
  domain: string;
  format: "png";
}

interface LogoFallbackResponse {
  logo_url: null;
  source: "fallback";
  domain: string;
  fallback_text: string;
}

type LogoResponse = LogoSuccessResponse | LogoFallbackResponse;

/**
 * Fetch Logo Edge Function (BRD-001)
 *
 * Fetches company logos from Logo.dev API.
 * Validates logo existence via HEAD request before returning the URL.
 * Falls back gracefully when Logo.dev returns no result or errors.
 *
 * POST { domain: string }
 * Returns { logo_url, source, domain, format } or fallback response.
 *
 * Required Environment Variables:
 * - LOGO_DEV_API_KEY (Logo.dev API key)
 */
serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Only accept POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: JSON_HEADERS }
    );
  }

  try {
    // --- Auth: validate user JWT ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: JSON_HEADERS }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: invalid session" }),
        { status: 401, headers: JSON_HEADERS }
      );
    }

    // --- Parse and validate request body ---
    let body: FetchLogoRequest;
    try {
      body = await req.json();
    } catch (_parseError) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    const { domain } = body;

    if (!domain || typeof domain !== "string") {
      return new Response(
        JSON.stringify({ error: "domain is required and must be a string" }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    // Normalize domain: strip protocol, www prefix, trailing slashes, paths
    const normalizedDomain = domain
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "")
      .toLowerCase()
      .trim();

    if (!normalizedDomain || !normalizedDomain.includes(".")) {
      return new Response(
        JSON.stringify({ error: "Invalid domain format" }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    // --- Check Logo.dev API key ---
    const logoDevApiKey = Deno.env.get("LOGO_DEV_API_KEY");
    if (!logoDevApiKey) {
      console.error("[fetch-logo] LOGO_DEV_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Logo service not configured" }),
        { status: 500, headers: JSON_HEADERS }
      );
    }

    // --- Build Logo.dev URL ---
    const logoUrl = `https://img.logo.dev/${normalizedDomain}?token=${logoDevApiKey}&size=200&format=png`;

    // --- Validate logo exists with HEAD request ---
    try {
      const headResponse = await fetch(logoUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000), // 5s timeout
      });

      if (!headResponse.ok) {
        console.warn(
          `[fetch-logo] Logo.dev HEAD returned ${headResponse.status} for ${normalizedDomain}`
        );
        return buildFallbackResponse(normalizedDomain);
      }

      // Check content-type to ensure we got an image, not an error page
      const contentType = headResponse.headers.get("content-type") || "";
      if (!contentType.startsWith("image/")) {
        console.warn(
          `[fetch-logo] Logo.dev returned non-image content-type "${contentType}" for ${normalizedDomain}`
        );
        return buildFallbackResponse(normalizedDomain);
      }
    } catch (fetchError: unknown) {
      const message =
        fetchError instanceof Error ? fetchError.message : String(fetchError);
      console.error(
        `[fetch-logo] HEAD request failed for ${normalizedDomain}: ${message}`
      );
      return buildFallbackResponse(normalizedDomain);
    }

    // --- Logo exists: return the URL for client-side use ---
    const successResponse: LogoSuccessResponse = {
      logo_url: logoUrl,
      source: "logo_dev",
      domain: normalizedDomain,
      format: "png",
    };

    return new Response(JSON.stringify(successResponse), {
      status: 200,
      headers: {
        ...JSON_HEADERS,
        // Suggest client-side caching (logo URLs are stable)
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    console.error("[fetch-logo] Unhandled error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: JSON_HEADERS }
    );
  }
});

/**
 * Build a fallback response when logo cannot be fetched.
 * Derives a human-readable company name from the domain for use as
 * fallback text (e.g. initials or placeholder).
 */
function buildFallbackResponse(normalizedDomain: string): Response {
  // Derive a company name from the domain (e.g. "acme.com" -> "Acme")
  const domainParts = normalizedDomain.split(".");
  const companySlug = domainParts[0] || normalizedDomain;
  const fallbackText =
    companySlug.charAt(0).toUpperCase() + companySlug.slice(1);

  const fallbackResponse: LogoFallbackResponse = {
    logo_url: null,
    source: "fallback",
    domain: normalizedDomain,
    fallback_text: fallbackText,
  };

  return new Response(JSON.stringify(fallbackResponse), {
    status: 200,
    headers: JSON_HEADERS,
  });
}
