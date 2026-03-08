import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    let payload: Record<string, unknown> | null = null;
    try {
      payload = await req.json();
    } catch {
      payload = null;
    }

    const leadId = typeof payload?.lead_id === "string" ? payload.lead_id : null;
    if (!leadId) {
      return new Response(
        JSON.stringify({ error: "lead_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: lead, error: fetchError } = await supabase
      .from("leads")
      .select("id, metadata")
      .eq("id", leadId)
      .single();

    if (fetchError || !lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found", details: fetchError?.message }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const now = new Date().toISOString();

    // Remove auto-generated prep notes
    const { error: deleteNotesError } = await supabase
      .from("lead_prep_notes")
      .delete()
      .eq("lead_id", leadId)
      .eq("is_auto_generated", true);

    if (deleteNotesError) {
      throw deleteNotesError;
    }

    // Clean metadata
    const metadata = { ...((lead.metadata as Record<string, unknown> | null) ?? {}) };
    delete metadata.prep_generated_at;
    delete metadata.prep_model;
    delete metadata.prep_ai;
    delete metadata.prep_failed_at;
    delete metadata.prep_last_error;

    // Reset lead statuses
    const { error: updateLeadError } = await supabase
      .from("leads")
      .update({
        prep_status: "pending",
        enrichment_status: "pending",
        prep_summary: null,
        enrichment_provider: null,
        metadata,
        updated_at: now,
      })
      .eq("id", leadId);

    if (updateLeadError) {
      throw updateLeadError;
    }

    // Trigger the prep function for this specific lead
    let processResponse: Response | null = null;
    let processResult: Record<string, unknown> | null = null;
    let processError: string | null = null;

    try {
      processResponse = await fetch(`${SUPABASE_URL}/functions/v1/process-jobs-router`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
          "apikey": SERVICE_ROLE_KEY,
          ...(Deno.env.get("CRON_SECRET")
            ? { "x-cron-secret": Deno.env.get("CRON_SECRET") as string }
            : {}),
        },
        body: JSON.stringify({ action: 'lead_prep', lead_ids: [leadId] }),
      });

      const responseText = await processResponse.text();
      try {
        processResult = JSON.parse(responseText);
      } catch {
        processResult = { raw: responseText };
      }

      if (!processResponse.ok) {
        processError = processResult?.error as string ?? "Failed to trigger process-lead-prep";
      }
    } catch (error) {
      processError = error instanceof Error ? error.message : String(error);
    }

    const responseBody = {
      success: true,
      lead_id: leadId,
      notes_deleted: true,
      status_reset: true,
      process_triggered: !processError,
      process_error: processError,
      process_result: processResult,
    };

    return new Response(JSON.stringify(responseBody), {
      status: processError ? 207 : 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});


