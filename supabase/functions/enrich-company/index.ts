import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { getCorsHeaders, handleCorsPreflightRequest } from "../_shared/corsHelper.ts";
import { getAuthContext } from "../_shared/edgeAuth.ts";
import { logFlatRateCostEvent, checkCreditBalance } from "../_shared/costTracking.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY") ?? "";
const APOLLO_API_KEY = Deno.env.get("APOLLO_API_KEY") ?? "";

serve(async (req) => {
  // Handle CORS preflight
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  const cors = getCorsHeaders(req);

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // SECURITY (fail-closed): require service role, CRON_SECRET, or a valid user session.
    let authCtx: Awaited<ReturnType<typeof getAuthContext>>;
    try {
      authCtx = await getAuthContext(req, supabase, SUPABASE_SERVICE_ROLE_KEY, {
        cronSecret: Deno.env.get("CRON_SECRET") ?? undefined,
      });
    } catch (_authError) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const { company_id } = await req.json();

    if (!company_id) {
      return new Response(
        JSON.stringify({ error: "company_id is required" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // Fetch company details
    const { data: company, error: fetchError } = await supabase
      .from("companies")
      .select("id, name, domain")
      .eq("id", company_id)
      .single();

    if (fetchError || !company) {
      return new Response(
        JSON.stringify({ error: "Company not found", details: fetchError?.message }),
        { status: 404, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    if (!company.domain) {
      return new Response(
        JSON.stringify({ error: "Company has no domain to enrich" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // Resolve org for credit tracking
    const userId = authCtx.userId;
    let orgId: string | null = null;
    if (userId) {
      const { data: membership } = await supabase
        .from("organization_memberships")
        .select("org_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      orgId = membership?.org_id ?? null;
    }

    // Check credit balance before calling enrichment APIs
    if (orgId) {
      const creditCheck = await checkCreditBalance(supabase, orgId);
      if (!creditCheck.allowed) {
        return new Response(
          JSON.stringify({ error: "Insufficient credits", message: creditCheck.message }),
          { status: 402, headers: { ...cors, "Content-Type": "application/json" } }
        );
      }
    }

    // Try Perplexity first
    let enrichmentData: Record<string, unknown> = {};
    
    if (PERPLEXITY_API_KEY) {
      try {
        const perplexityResponse = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${PERPLEXITY_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "llama-3.1-sonar-large-128k-online",
            messages: [
              {
                role: "user",
                content: `Provide a comprehensive overview of ${company.name} (${company.domain}). Include: company description, industry, company size/employee count, headquarters location, website, phone number, LinkedIn URL, and any notable information. Return as JSON with keys: description, industry, size, website, phone, address, linkedin_url.`,
              },
            ],
            temperature: 0.2,
          }),
        });

        if (perplexityResponse.ok) {
          const perplexityData = await perplexityResponse.json();
          const content = perplexityData.choices?.[0]?.message?.content || "";
          
          // Try to parse JSON from response
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              enrichmentData = JSON.parse(jsonMatch[0]);
            } catch (e) {
              // Fallback: extract key info from text
              if (content.includes("description")) {
                enrichmentData.description = content.split("description")[1]?.split("\n")[0]?.trim();
              }
            }
          }
        }
      } catch (error) {
      }
    }

    // Try Apollo as backup if Perplexity didn't provide enough data
    if ((!enrichmentData.description || !enrichmentData.industry) && APOLLO_API_KEY) {
      try {
        const apolloResponse = await fetch("https://api.apollo.io/api/v1/organizations/enrich", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": APOLLO_API_KEY,
          },
          body: JSON.stringify({
            domain: company.domain,
          }),
        });

        if (apolloResponse.ok) {
          const apolloData = await apolloResponse.json();
          const org = apolloData.organization;

          if (org) {
            enrichmentData = {
              ...enrichmentData,
              description: enrichmentData.description || org.short_description || org.description,
              industry: enrichmentData.industry || org.industry,
              size: enrichmentData.size || org.estimated_num_employees,
              website: enrichmentData.website || org.website_url,
              phone: enrichmentData.phone || org.phone,
              address: enrichmentData.address || (org.city && org.state ? `${org.city}, ${org.state}` : org.city),
              linkedin_url: enrichmentData.linkedin_url || org.linkedin_url,
            };
          }
        }
      } catch (error) {
      }
    }

    // Update company with enrichment data
    if (Object.keys(enrichmentData).length > 0) {
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (enrichmentData.description) updateData.description = enrichmentData.description;
      if (enrichmentData.industry) updateData.industry = enrichmentData.industry;
      if (enrichmentData.size) updateData.size = enrichmentData.size;
      if (enrichmentData.website) updateData.website = enrichmentData.website;
      if (enrichmentData.phone) updateData.phone = enrichmentData.phone;
      if (enrichmentData.address) updateData.address = enrichmentData.address;
      if (enrichmentData.linkedin_url) updateData.linkedin_url = enrichmentData.linkedin_url;

      const { error: updateError } = await supabase
        .from("companies")
        .update(updateData)
        .eq("id", company_id);

      if (updateError) {
        return new Response(
          JSON.stringify({ error: "Failed to update company", details: updateError.message }),
          { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
        );
      }
      // Log flat-rate cost event for enrichment
      if (userId && orgId) {
        const provider = PERPLEXITY_API_KEY ? 'perplexity' : 'apollo';
        logFlatRateCostEvent(supabase, userId, orgId, provider, 'enrich', 0.5, 'research_enrichment').catch(() => {});
      }

      return new Response(
        JSON.stringify({ success: true, company_id, enriched_fields: Object.keys(updateData) }),
        { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, message: "No enrichment data available" }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});












