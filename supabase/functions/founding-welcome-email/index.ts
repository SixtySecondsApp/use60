// supabase/functions/founding-welcome-email/index.ts
// Sends a welcome email to new Founding Members.
// Called fire-and-forget from webhook-stripe-v2 after checkout completion.
// Deploy with --no-verify-jwt (server-to-server calls only).

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { getCorsHeaders, handleCorsPreflightRequest } from "../_shared/corsHelper.ts";
import { sendEmail } from "../_shared/ses.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APP_URL = Deno.env.get("FRONTEND_URL") ?? "https://app.use60.com";

interface WelcomeEmailRequest {
  org_id: string;
  session_id?: string;
  customer_id?: string;
}

/**
 * Build the HTML body for the founding member welcome email.
 */
function buildHtmlBody(firstName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to 60, Founding Member</title>
</head>
<body style="margin:0; padding:0; background-color:#f8fafc; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc; padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background:#ffffff; border-radius:12px; border:1px solid #e2e8f0; overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:32px 32px 24px; border-bottom:1px solid #e2e8f0;">
              <h1 style="margin:0 0 8px; font-size:24px; font-weight:700; color:#0f172a;">
                Welcome to 60, Founding Member
              </h1>
              <p style="margin:0; font-size:15px; color:#64748b; line-height:1.5;">
                Hey ${firstName}, you're officially one of the first. Thank you for believing in what we're building.
              </p>
            </td>
          </tr>

          <!-- Next steps -->
          <tr>
            <td style="padding:24px 32px;">
              <p style="margin:0 0 20px; font-size:15px; color:#334155; line-height:1.6;">
                Here's how to get the most out of 60 right away:
              </p>

              <!-- Step 1 -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
                <tr>
                  <td width="32" valign="top" style="padding-top:2px;">
                    <div style="width:24px; height:24px; border-radius:50%; background:#3b82f6; color:#fff; font-size:13px; font-weight:600; text-align:center; line-height:24px;">1</div>
                  </td>
                  <td style="padding-left:12px;">
                    <p style="margin:0 0 4px; font-size:15px; font-weight:600; color:#0f172a;">Set up your API key</p>
                    <p style="margin:0; font-size:14px; color:#64748b; line-height:1.5;">
                      Connect your AI provider so 60 can start working for you.
                      <a href="${APP_URL}/settings/api-keys" style="color:#3b82f6; text-decoration:none;"> Go to settings &rarr;</a>
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Step 2 -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
                <tr>
                  <td width="32" valign="top" style="padding-top:2px;">
                    <div style="width:24px; height:24px; border-radius:50%; background:#3b82f6; color:#fff; font-size:13px; font-weight:600; text-align:center; line-height:24px;">2</div>
                  </td>
                  <td style="padding-left:12px;">
                    <p style="margin:0 0 4px; font-size:15px; font-weight:600; color:#0f172a;">Join the community</p>
                    <p style="margin:0; font-size:14px; color:#64748b; line-height:1.5;">
                      Our Slack group is where founding members share tips and get early access to new features.
                      <a href="https://join.slack.com/share/enQtMTA2OTU3NTcxNjIzNTUtNDQ0Mjg0ZmQxNDkxNjRhODczYTNhODM0MDk0ZjczMTliNjYyNDBjYzI3Yzc1NjFlMzEyZGQ4ODU2YmE2OWI1Yg" style="color:#3b82f6; text-decoration:none;"> Join Slack &rarr;</a>
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Step 3 -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td width="32" valign="top" style="padding-top:2px;">
                    <div style="width:24px; height:24px; border-radius:50%; background:#3b82f6; color:#fff; font-size:13px; font-weight:600; text-align:center; line-height:24px;">3</div>
                  </td>
                  <td style="padding-left:12px;">
                    <p style="margin:0 0 4px; font-size:15px; font-weight:600; color:#0f172a;">Explore your 500 credits</p>
                    <p style="margin:0; font-size:14px; color:#64748b; line-height:1.5;">
                      Use them for AI research, meeting prep, follow-ups, and more. They never expire.
                      <a href="${APP_URL}/settings/credits" style="color:#3b82f6; text-decoration:none;"> View credits &rarr;</a>
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 16px;">
                    <a href="${APP_URL}" style="display:inline-block; padding:12px 28px; background:#3b82f6; color:#ffffff; font-size:15px; font-weight:600; text-decoration:none; border-radius:8px;">
                      Open 60
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px; border-top:1px solid #e2e8f0; background:#f8fafc;">
              <p style="margin:0; font-size:13px; color:#94a3b8; line-height:1.5;">
                Thanks for being here from the start.<br/>
                &mdash; The 60 Team
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Build plain text fallback for the welcome email.
 */
function buildTextBody(firstName: string): string {
  return `Welcome to 60, Founding Member

Hey ${firstName}, you're officially one of the first. Thank you for believing in what we're building.

Here's how to get the most out of 60 right away:

1. Set up your API key
   Connect your AI provider so 60 can start working for you.
   ${APP_URL}/settings/api-keys

2. Join the community
   Our Slack group is where founding members share tips and get early access to new features.
   https://join.slack.com/share/enQtMTA2OTU3NTcxNjIzNTUtNDQ0Mjg0ZmQxNDkxNjRhODczYTNhODM0MDk0ZjczMTliNjYyNDBjYzI3Yzc1NjFlMzEyZGQ4ODU2YmE2OWI1Yg

3. Explore your 500 credits
   Use them for AI research, meeting prep, follow-ups, and more. They never expire.
   ${APP_URL}/settings/credits

Open 60: ${APP_URL}

Thanks for being here from the start.
-- The 60 Team`;
}

serve(async (req) => {
  // Handle CORS preflight
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const body: WelcomeEmailRequest = await req.json();
    const { org_id } = body;

    if (!org_id) {
      return new Response(
        JSON.stringify({ error: "Missing required field: org_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Look up the org owner from organization_memberships
    const { data: ownerMembership, error: memberError } = await supabase
      .from("organization_memberships")
      .select("user_id")
      .eq("org_id", org_id)
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();

    if (memberError || !ownerMembership) {
      console.error("[founding-welcome-email] Could not find org owner:", memberError);
      return new Response(
        JSON.stringify({ error: "Organization owner not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userId = ownerMembership.user_id;

    // Get user email from auth.users (requires service role)
    const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(userId);

    if (userError || !user) {
      console.error("[founding-welcome-email] Could not get user:", userError);
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const email = user.email;
    if (!email) {
      console.error("[founding-welcome-email] User has no email");
      return new Response(
        JSON.stringify({ error: "User has no email address" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Try to get first name from profiles table, fall back to auth metadata
    let firstName = "there";

    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, full_name")
      .eq("id", userId)
      .maybeSingle();

    if (profile?.first_name) {
      firstName = profile.first_name;
    } else if (profile?.full_name) {
      firstName = profile.full_name.split(" ")[0];
    } else if (user.user_metadata?.first_name) {
      firstName = user.user_metadata.first_name as string;
    } else if (user.user_metadata?.full_name) {
      firstName = (user.user_metadata.full_name as string).split(" ")[0];
    } else {
      // Last resort: use email prefix
      firstName = email.split("@")[0];
    }

    // Send email via SES
    const result = await sendEmail({
      to: email,
      subject: "Welcome to 60, Founding Member",
      html: buildHtmlBody(firstName),
      text: buildTextBody(firstName),
      fromName: "60",
    });

    if (!result.success) {
      console.error("[founding-welcome-email] SES send failed:", result.error);
      return new Response(
        JSON.stringify({ error: `Email send failed: ${result.error}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[founding-welcome-email] Sent welcome email to ${email} (messageId: ${result.messageId})`);

    // Log to email_logs (non-fatal)
    try {
      await supabase.from("email_logs").insert({
        email_type: "founding_welcome",
        to_email: email,
        user_id: userId,
        status: "sent",
        metadata: {
          message_id: result.messageId,
          org_id,
          session_id: body.session_id,
        },
        sent_via: "aws_ses",
      });
    } catch (logError) {
      console.warn("[founding-welcome-email] Failed to log email:", logError);
    }

    return new Response(
      JSON.stringify({ success: true, message_id: result.messageId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[founding-welcome-email] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
