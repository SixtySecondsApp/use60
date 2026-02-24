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

    const domain = email.split("@")[1]?.toLowerCase() || "";

    // Skip personal email domains
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

    if (personalDomains.includes(domain)) {
      console.log("[handle-organization-joining] Personal email - skipping auto-join");
      return new Response(
        JSON.stringify({
          success: true,
          message: "Personal email - no org joining needed",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if organization with matching company_domain exists
    const { data: existingOrg, error: orgError } = await supabaseAdmin
      .from("organizations")
      .select("id, name, company_domain")
      .eq("company_domain", domain)
      .eq("is_active", true)
      .maybeSingle();

    if (orgError) {
      console.error("[handle-organization-joining] Error checking org:", orgError);
      return new Response(
        JSON.stringify({
          success: true,
          message: "No matching organization found",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!existingOrg) {
      console.log("[handle-organization-joining] No matching organization found");
      return new Response(
        JSON.stringify({
          success: true,
          message: "No matching organization found",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[handle-organization-joining] Found matching org: ${existingOrg.name}`);

    // Check if user already has membership
    const { data: existingMembership } = await supabaseAdmin
      .from("organization_memberships")
      .select("id")
      .eq("org_id", existingOrg.id)
      .eq("user_id", userId)
      .maybeSingle();

    if (existingMembership) {
      console.log("[handle-organization-joining] User already has membership");
      return new Response(
        JSON.stringify({
          success: true,
          message: "User already has membership",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create join request using RPC
    console.log("[handle-organization-joining] Creating pending join request...");

    const { data: joinRequestResult, error: joinRequestError } = await supabaseAdmin.rpc(
      "create_join_request",
      {
        p_org_id: existingOrg.id,
        p_user_id: userId,
      }
    );

    if (joinRequestError) {
      console.error(
        "[handle-organization-joining] Failed to create join request:",
        joinRequestError
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: joinRequestError.message,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update profile status to pending_approval
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ status: "pending_approval" })
      .eq("id", userId);

    if (profileError) {
      console.error("[handle-organization-joining] Error updating profile:", profileError);
    }

    // Update onboarding progress to show pending_approval step
    const { error: onboardingError } = await supabaseAdmin
      .from("user_onboarding_progress")
      .update({ onboarding_step: "pending_approval" })
      .eq("user_id", userId);

    if (onboardingError) {
      console.error("[handle-organization-joining] Error updating onboarding:", onboardingError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Join request created successfully",
        org_id: existingOrg.id,
        org_name: existingOrg.name,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[handle-organization-joining] Exception:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};
