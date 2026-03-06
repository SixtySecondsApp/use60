;
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { corsHeaders } from "../../../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface CSVRow {
  id: string;           // SavvyCal event ID
  link_id: string;      // SavvyCal link ID
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_term: string;
  utm_content: string;
  scheduler_email?: string;
  start_at?: string;
}

interface BackfillResult {
  total_processed: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export async function handleBackfill(req: Request): Promise<Response> {
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
    const { rows, mode = "preview" } = await req.json() as {
      rows: CSVRow[];
      mode: "preview" | "execute";
    };

    if (!rows || !Array.isArray(rows)) {
      return new Response(
        JSON.stringify({ error: "rows array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const result: BackfillResult = {
      total_processed: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    // Get link mappings for fallback source detection
    const { data: linkMappings } = await supabase
      .from("savvycal_link_mappings")
      .select("link_id, source_name, channel, medium");

    const linkMap = new Map(
      (linkMappings || []).map(m => [m.link_id, m])
    );

    // Process in batches
    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);

      for (const row of batch) {
        result.total_processed++;

        if (!row.id) {
          result.skipped++;
          continue;
        }

        // Build the update payload
        const updatePayload: Record<string, unknown> = {};

        // Add UTM fields if present
        if (row.utm_source) updatePayload.utm_source = row.utm_source;
        if (row.utm_medium) updatePayload.utm_medium = row.utm_medium;
        if (row.utm_campaign) updatePayload.utm_campaign = row.utm_campaign;
        if (row.utm_term) updatePayload.utm_term = row.utm_term;
        if (row.utm_content) updatePayload.utm_content = row.utm_content;

        // Add link_id if present
        if (row.link_id) {
          updatePayload.booking_link_id = row.link_id;

          // Derive source info from link mapping if no UTM data
          const linkInfo = linkMap.get(row.link_id);
          if (linkInfo) {
            if (!updatePayload.utm_source && !updatePayload.source_channel) {
              updatePayload.source_channel = linkInfo.channel;
            }
            if (!updatePayload.utm_medium) {
              updatePayload.utm_medium = linkInfo.medium;
            }
          }
        }

        // Determine source_channel based on UTM data
        if (row.utm_source && !updatePayload.source_channel) {
          const source = row.utm_source.toLowerCase();
          if (source === 'fb' || source === 'facebook' || source === 'ig' || source === 'instagram') {
            updatePayload.source_channel = 'paid_social';
            if (!updatePayload.utm_medium) {
              updatePayload.utm_medium = 'meta';
            }
          } else if (source === 'linkedin') {
            updatePayload.source_channel = 'paid_social';
          } else if (source === 'google') {
            updatePayload.source_channel = row.utm_medium === 'cpc' ? 'paid_search' : 'organic';
          } else if (source === 'email') {
            updatePayload.source_channel = 'email';
          }
        }

        // Skip if nothing to update
        if (Object.keys(updatePayload).length === 0) {
          result.skipped++;
          continue;
        }

        if (mode === "execute") {
          // Try to match by external_id first (SavvyCal event ID)
          const { data: lead, error: fetchError } = await supabase
            .from("leads")
            .select("id, utm_source, source_channel")
            .eq("external_id", row.id)
            .maybeSingle();

          if (fetchError) {
            result.errors.push(`Error fetching lead ${row.id}: ${fetchError.message}`);
            continue;
          }

          if (!lead) {
            result.skipped++;
            continue;
          }

          // Skip if lead already has source tracking
          if (lead.utm_source || lead.source_channel) {
            result.skipped++;
            continue;
          }

          // Update the lead
          const { error: updateError } = await supabase
            .from("leads")
            .update(updatePayload)
            .eq("id", lead.id);

          if (updateError) {
            result.errors.push(`Error updating lead ${lead.id}: ${updateError.message}`);
            continue;
          }

          result.updated++;
        } else {
          // Preview mode - just count
          result.updated++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        mode,
        result,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        success: false
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
