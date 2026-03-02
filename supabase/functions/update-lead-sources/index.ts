import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface LeadSourceUpdate {
  domain: string;
  contactName?: string;
  newSourceKey: string;
  newSourceName: string;
  channel?: string;
  medium?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const updates: LeadSourceUpdate[] = await req.json();

    if (!Array.isArray(updates) || updates.length === 0) {
      return new Response(
        JSON.stringify({ error: "Updates array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const results = [];

    for (const update of updates) {
      // Find matching leads
      let query = supabase
        .from("leads")
        .select("id, domain, contact_name, contact_email, source_id, source:lead_sources(name, source_key)")
        .eq("domain", update.domain)
        .is("deleted_at", null);

      if (update.contactName) {
        query = query.ilike("contact_name", `%${update.contactName}%`);
      }

      const { data: leads, error: findError } = await query;

      if (findError) {
        results.push({
          domain: update.domain,
          success: false,
          error: findError.message,
          leadsUpdated: 0,
        });
        continue;
      }

      if (!leads || leads.length === 0) {
        results.push({
          domain: update.domain,
          success: false,
          error: "No leads found",
          leadsUpdated: 0,
        });
        continue;
      }

      // Get or create the lead source
      const { data: existingSource } = await supabase
        .from("lead_sources")
        .select("id")
        .eq("source_key", update.newSourceKey)
        .maybeSingle();

      let sourceId: string;

      if (existingSource) {
        sourceId = existingSource.id;
      } else {
        const { data: newSource, error: createError } = await supabase
          .from("lead_sources")
          .insert({
            source_key: update.newSourceKey,
            name: update.newSourceName,
            channel: update.channel || null,
            utm_medium: update.medium || null,
            is_active: true,
          })
          .select("id")
          .single();

        if (createError) {
          results.push({
            domain: update.domain,
            success: false,
            error: createError.message,
            leadsUpdated: 0,
          });
          continue;
        }

        sourceId = newSource.id;
      }

      // Update each lead
      let updatedCount = 0;
      for (const lead of leads) {
        const { error: updateError } = await supabase
          .from("leads")
          .update({
            source_id: sourceId,
            source_channel: update.channel || null,
            source_medium: update.medium || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", lead.id);

        if (updateError) {
        } else {
          updatedCount++;
        }
      }

      results.push({
        domain: update.domain,
        success: true,
        leadsUpdated: updatedCount,
        totalLeads: leads.length,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
        totalUpdated: results.reduce((sum, r) => sum + (r.leadsUpdated || 0), 0),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

