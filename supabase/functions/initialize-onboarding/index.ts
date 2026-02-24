import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { userId, email } = await req.json();

    if (!userId || !email) {
      return new Response(
        JSON.stringify({ error: "Missing userId or email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role to bypass RLS
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Determine starting step based on email domain
    const domain = email.split("@")[1]?.toLowerCase() || "";
    const personalDomains = [
      "gmail.com",
      "yahoo.com",
      "hotmail.com",
      "outlook.com",
      "icloud.com",
      "aol.com",
      "protonmail.com",
      "proton.me",
      "mail.com",
      "ymail.com",
      "live.com",
      "msn.com",
      "me.com",
      "mac.com",
    ];

    const isPersonalEmail = personalDomains.includes(domain);
    const initialStep = isPersonalEmail ? "website_input" : "enrichment_loading";

    // Insert onboarding progress using service role
    const { data, error } = await supabaseAdmin
      .from("user_onboarding_progress")
      .upsert(
        {
          user_id: userId,
          onboarding_step: initialStep,
          onboarding_completed_at: null,
          skipped_onboarding: false,
        },
        {
          onConflict: "user_id",
        }
      )
      .select();

    if (error) {
      console.error("[initialize-onboarding] Error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ------------------------------------------------------------------
    // Seed contextual config questions for the user's org (non-fatal).
    // We look up the first org the user belongs to via organization_members.
    // This covers the common path where the org is created before onboarding
    // is initialised (e.g. invite flow or auto-org creation at sign-up).
    // If no org membership exists yet, seeding is skipped here and should be
    // triggered separately when org membership is established.
    // ------------------------------------------------------------------
    try {
      const { data: memberRow } = await supabaseAdmin
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();

      if (memberRow?.organization_id) {
        const { error: seedError } = await supabaseAdmin.rpc(
          "seed_config_questions_for_org",
          {
            p_org_id: memberRow.organization_id,
            p_user_id: userId,
          }
        );
        if (seedError) {
          console.warn(
            "[initialize-onboarding] Config question seeding failed (non-fatal):",
            seedError.message
          );
        } else {
          console.log(
            "[initialize-onboarding] Config questions seeded for org",
            memberRow.organization_id
          );
        }
      } else {
        console.log(
          "[initialize-onboarding] No org membership found for user",
          userId,
          "— config question seeding deferred."
        );
      }
    } catch (seedErr) {
      console.warn(
        "[initialize-onboarding] Config question seeding threw (non-fatal):",
        seedErr instanceof Error ? seedErr.message : seedErr
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        onboarding_step: initialStep,
        message: "Onboarding progress initialized",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[initialize-onboarding] Exception:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};
