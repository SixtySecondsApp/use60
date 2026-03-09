import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { corsHeaders } from "../../_shared/cors.ts";
import { getUserOrgId, requireOrgRole } from "../../_shared/edgeAuth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// Legacy fallback token (for backwards compatibility)
const LEGACY_SAVVYCAL_API_TOKEN = Deno.env.get("SAVVYCAL_API_TOKEN") ??
                          Deno.env.get("SAVVYCAL_SECRET_KEY") ?? "";

const JSON_HEADERS = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

interface SavvyCalLink {
  id: string;
  slug: string;
  name: string | null;
  private_name: string | null;
  description: string | null;
  url?: string;
}

export async function handleSavvycalLink(req: Request): Promise<Response> {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { link_id, org_id: explicitOrgId } = await req.json();

    if (!link_id) {
      return new Response(
        JSON.stringify({ error: "link_id is required" }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    // Initialize clients
    const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Try to get authenticated user
    const { data: authData } = await anon.auth.getUser();
    const user = authData?.user;

    let apiToken: string | null = null;
    let orgId: string | null = explicitOrgId ?? null;

    // If user is authenticated, get their org's API token
    if (user) {
      if (!orgId) {
        orgId = await getUserOrgId(service, user.id);
      }

      if (orgId) {
        // Verify user is org admin/owner for this operation
        await requireOrgRole(service, orgId, user.id, ["owner", "admin", "member"]);

        // Get org's SavvyCal integration
        const { data: integration } = await service
          .from("savvycal_integrations")
          .select("id")
          .eq("org_id", orgId)
          .eq("is_active", true)
          .maybeSingle();

        if (integration) {
          const { data: secrets } = await service
            .from("savvycal_integration_secrets")
            .select("api_token")
            .eq("integration_id", integration.id)
            .maybeSingle();

          if (secrets?.api_token) {
            apiToken = secrets.api_token;
          }
        }
      }
    }

    // Fall back to legacy global token if no org token found
    if (!apiToken) {
      apiToken = LEGACY_SAVVYCAL_API_TOKEN;
    }

    if (!apiToken) {
      return new Response(
        JSON.stringify({
          error: "SavvyCal API token not configured. Please configure your SavvyCal integration or set SAVVYCAL_API_TOKEN environment variable."
        }),
        { status: 500, headers: JSON_HEADERS }
      );
    }

    // Fetch link details from SavvyCal API
    const response = await fetch(`https://api.savvycal.com/v1/links/${link_id}`, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();

      // Handle 404 specifically - link has been deleted
      if (response.status === 404) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Link not found (404)",
            deleted: true,
            message: "This link has been deleted from SavvyCal"
          }),
          { status: 200, headers: JSON_HEADERS } // Return 200 so UI can handle it gracefully
        );
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: `SavvyCal API error: ${response.status} ${errorText}`,
          deleted: false
        }),
        { status: response.status, headers: JSON_HEADERS }
      );
    }

    const link: SavvyCalLink = await response.json();

    // Return link details including private_name for source matching
    return new Response(
      JSON.stringify({
        success: true,
        link: {
          id: link.id,
          slug: link.slug,
          name: link.name || link.private_name || link.slug,
          private_name: link.private_name,
          description: link.description,
          url: link.url || `https://savvycal.com/${link.slug}`,
        },
        org_id: orgId,
      }),
      { status: 200, headers: JSON_HEADERS }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to fetch link details"
      }),
      { status: 500, headers: JSON_HEADERS }
    );
  }
}
