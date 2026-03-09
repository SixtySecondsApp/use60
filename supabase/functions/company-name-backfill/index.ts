/**
 * company-name-backfill
 *
 * Enriches company names using Apollo's org enrichment endpoint.
 * Processes companies in batches to avoid rate limits.
 *
 * POST body:
 *   owner_id  — required, the user whose companies to backfill
 *   batch_size — optional, default 20
 *   dry_run   — optional, if true just returns what would be updated
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4"
import { getCorsHeaders, handleCorsPreflightRequest } from "../_shared/corsHelper.ts"
import { getAuthContext } from "../_shared/edgeAuth.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const APOLLO_API_KEY = Deno.env.get("APOLLO_API_KEY") ?? ""

interface EnrichResult {
  company_id: string
  domain: string
  old_name: string
  new_name: string | null
  status: "updated" | "no_match" | "error" | "skipped"
}

serve(async (req) => {
  const preflight = handleCorsPreflightRequest(req)
  if (preflight) return preflight
  const cors = getCorsHeaders(req)

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Auth check
    try {
      await getAuthContext(req, supabase, SUPABASE_SERVICE_ROLE_KEY, {
        cronSecret: Deno.env.get("CRON_SECRET") ?? undefined,
      })
    } catch {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      })
    }

    const { owner_id, batch_size = 20, dry_run = false } = await req.json()

    if (!owner_id) {
      return new Response(JSON.stringify({ error: "owner_id is required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      })
    }

    if (!APOLLO_API_KEY) {
      return new Response(JSON.stringify({ error: "APOLLO_API_KEY not configured" }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      })
    }

    // Fetch companies with domains that haven't been enriched yet
    // (enrichment_data is null or empty)
    const { data: companies, error: fetchErr } = await supabase
      .from("companies")
      .select("id, name, domain")
      .eq("owner_id", owner_id)
      .not("domain", "is", null)
      .or("enrichment_data.is.null,enrichment_data.eq.{}")
      .order("created_at", { ascending: false })
      .limit(batch_size)

    if (fetchErr) {
      return new Response(JSON.stringify({ error: "Failed to fetch companies", details: fetchErr.message }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      })
    }

    if (!companies || companies.length === 0) {
      return new Response(JSON.stringify({ message: "No companies to enrich", processed: 0 }), {
        status: 200, headers: { ...cors, "Content-Type": "application/json" },
      })
    }

    const results: EnrichResult[] = []

    for (const company of companies) {
      if (!company.domain) {
        results.push({ company_id: company.id, domain: "", old_name: company.name, new_name: null, status: "skipped" })
        continue
      }

      try {
        // Apollo org enrichment by domain
        const apolloResp = await fetch("https://api.apollo.io/api/v1/organizations/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": APOLLO_API_KEY },
          body: JSON.stringify({ domain: company.domain }),
        })

        if (!apolloResp.ok) {
          results.push({ company_id: company.id, domain: company.domain, old_name: company.name, new_name: null, status: "error" })
          continue
        }

        const apolloData = await apolloResp.json()
        const org = apolloData.organization

        if (!org?.name) {
          results.push({ company_id: company.id, domain: company.domain, old_name: company.name, new_name: null, status: "no_match" })
          continue
        }

        const newName = org.name

        if (!dry_run) {
          // Update company name + enrichment fields
          const updatePayload: Record<string, unknown> = {
            name: newName,
            updated_at: new Date().toISOString(),
            enrichment_data: {
              company_name: org.name,
              description: org.short_description || org.description || null,
              industry: org.industry || null,
              size: org.estimated_num_employees || null,
              linkedin_url: org.linkedin_url || null,
              phone: org.phone || null,
              city: org.city || null,
              state: org.state || null,
              country: org.country || null,
              logo_url: org.logo_url || null,
            },
          }
          if (org.short_description || org.description) updatePayload.description = org.short_description || org.description
          if (org.industry) updatePayload.industry = org.industry
          if (org.estimated_num_employees) updatePayload.size = String(org.estimated_num_employees)
          if (org.linkedin_url) updatePayload.linkedin_url = org.linkedin_url
          if (org.phone) updatePayload.phone = org.phone

          await supabase.from("companies").update(updatePayload).eq("id", company.id)

          // Also update client_name on activities linked to this company
          await supabase
            .from("activities")
            .update({ client_name: newName })
            .eq("company_id", company.id)
            .neq("client_name", newName)

          // Also update company name on deals linked to this company
          await supabase
            .from("deals")
            .update({ company: newName, updated_at: new Date().toISOString() })
            .eq("company_id", company.id)
            .neq("company", newName)
        }

        results.push({ company_id: company.id, domain: company.domain, old_name: company.name, new_name: newName, status: "updated" })

        // Rate limit: 100ms between Apollo calls
        await new Promise(resolve => setTimeout(resolve, 100))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[company-name-backfill] Error enriching ${company.domain}:`, msg)
        results.push({ company_id: company.id, domain: company.domain, old_name: company.name, new_name: null, status: "error" })
      }
    }

    const updated = results.filter(r => r.status === "updated").length
    const noMatch = results.filter(r => r.status === "no_match").length
    const errors = results.filter(r => r.status === "error").length

    return new Response(JSON.stringify({
      processed: results.length,
      updated,
      no_match: noMatch,
      errors,
      dry_run,
      results,
    }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return new Response(JSON.stringify({ error: "Internal server error", details: msg }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    })
  }
})
