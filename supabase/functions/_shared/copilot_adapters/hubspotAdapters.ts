import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { HubSpotClient } from '../hubspot.ts';
import type { ActionResult, CRMAdapter, MeetingAdapter } from './types.ts';

type SupabaseClient = ReturnType<typeof createClient>;

function ok(data: unknown, source: string): ActionResult {
  return { success: true, data, source };
}

function fail(error: string, source: string, extra?: Partial<ActionResult>): ActionResult {
  return { success: false, data: null, error, source, ...extra };
}

/**
 * Get HubSpot access token for an organization
 * Automatically refreshes expired tokens using the refresh_token
 */
async function getHubSpotToken(client: SupabaseClient, orgId: string): Promise<string | null> {
  const { data: creds, error } = await client
    .from('hubspot_org_credentials')
    .select('access_token, refresh_token, token_expires_at')
    .eq('org_id', orgId)
    .maybeSingle();

  if (error || !creds) return null;

  const accessToken = String(creds.access_token || '');
  const refreshToken = String(creds.refresh_token || '');
  const expiresAt = new Date(String(creds.token_expires_at || 0)).getTime();

  // If token is still valid (expires in more than 2 minutes), use it
  if (expiresAt && expiresAt - Date.now() > 2 * 60 * 1000) {
    return accessToken;
  }

  // Token expired - try to refresh it
  if (!refreshToken) {
    console.log(`[HubSpot] No refresh token for org ${orgId}`);
    return null;
  }

  const clientId = Deno.env.get('HUBSPOT_CLIENT_ID') || '';
  const clientSecret = Deno.env.get('HUBSPOT_CLIENT_SECRET') || '';

  if (!clientId || !clientSecret) {
    console.log('[HubSpot] Missing HUBSPOT_CLIENT_ID or HUBSPOT_CLIENT_SECRET');
    return null;
  }

  try {
    console.log(`[HubSpot] Token expired for org ${orgId}, refreshing...`);

    const tokenParams = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    });

    const tokenResp = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });

    if (!tokenResp.ok) {
      const errorText = await tokenResp.text();
      console.log(`[HubSpot] Token refresh failed: ${errorText}`);
      return null;
    }

    const tokenData = await tokenResp.json();
    const newAccessToken = String(tokenData.access_token || '');
    const newRefreshToken = tokenData.refresh_token ? String(tokenData.refresh_token) : refreshToken;
    const expiresIn = Number(tokenData.expires_in || 1800);
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Update credentials in database
    await client
      .from('hubspot_org_credentials')
      .update({
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        token_expires_at: tokenExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId);

    console.log(`[HubSpot] Token refreshed for org ${orgId}, expires at ${tokenExpiresAt}`);
    return newAccessToken;
  } catch (e) {
    console.log(`[HubSpot] Token refresh error: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/**
 * Check if an organization has HubSpot connected
 */
export async function hasHubSpotIntegration(client: SupabaseClient, orgId: string): Promise<boolean> {
  const { data } = await client
    .from('hubspot_org_integrations')
    .select('is_connected')
    .eq('org_id', orgId)
    .maybeSingle();

  return data?.is_connected === true;
}

/**
 * HubSpot CRM Adapter
 * Searches HubSpot API directly for contacts and deals
 */
export function createHubSpotCrmAdapter(
  client: SupabaseClient,
  orgId: string,
  hubspotClient: HubSpotClient
): CRMAdapter {
  return {
    source: 'hubspot_crm',
    async getContact(params) {
      try {
        const email = params.email ? String(params.email).trim().toLowerCase() : null;
        const name = params.name ? String(params.name).trim() : null;
        const id = params.id ? String(params.id).trim() : null;

        // Search by HubSpot ID
        if (id) {
          const contact = await hubspotClient.request<any>({
            method: 'GET',
            path: `/crm/v3/objects/contacts/${id}`,
            query: {
              properties: 'firstname,lastname,email,phone,jobtitle,company,hs_lead_status',
            },
          });

          return ok(
            {
              contacts: contact
                ? [
                    {
                      id: contact.id,
                      email: contact.properties?.email,
                      first_name: contact.properties?.firstname,
                      last_name: contact.properties?.lastname,
                      full_name: `${contact.properties?.firstname || ''} ${contact.properties?.lastname || ''}`.trim(),
                      phone: contact.properties?.phone,
                      title: contact.properties?.jobtitle,
                      company_name: contact.properties?.company,
                      source: 'hubspot',
                    },
                  ]
                : [],
            },
            this.source
          );
        }

        // Search by email
        if (email) {
          const searchResult = await hubspotClient.request<any>({
            method: 'POST',
            path: '/crm/v3/objects/contacts/search',
            body: {
              filterGroups: [
                {
                  filters: [
                    {
                      propertyName: 'email',
                      operator: 'EQ',
                      value: email,
                    },
                  ],
                },
              ],
              properties: ['firstname', 'lastname', 'email', 'phone', 'jobtitle', 'company', 'hs_lead_status'],
              limit: 10,
            },
          });

          const contacts = (searchResult?.results || []).map((c: any) => ({
            id: c.id,
            email: c.properties?.email,
            first_name: c.properties?.firstname,
            last_name: c.properties?.lastname,
            full_name: `${c.properties?.firstname || ''} ${c.properties?.lastname || ''}`.trim(),
            phone: c.properties?.phone,
            title: c.properties?.jobtitle,
            company_name: c.properties?.company,
            source: 'hubspot',
          }));

          return ok({ contacts }, this.source);
        }

        // Search by name
        if (name) {
          const searchResult = await hubspotClient.request<any>({
            method: 'POST',
            path: '/crm/v3/objects/contacts/search',
            body: {
              query: name,
              properties: ['firstname', 'lastname', 'email', 'phone', 'jobtitle', 'company', 'hs_lead_status'],
              limit: 10,
            },
          });

          const contacts = (searchResult?.results || []).map((c: any) => ({
            id: c.id,
            email: c.properties?.email,
            first_name: c.properties?.firstname,
            last_name: c.properties?.lastname,
            full_name: `${c.properties?.firstname || ''} ${c.properties?.lastname || ''}`.trim(),
            phone: c.properties?.phone,
            title: c.properties?.jobtitle,
            company_name: c.properties?.company,
            source: 'hubspot',
          }));

          return ok({ contacts }, this.source);
        }

        return ok({ contacts: [] }, this.source);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return fail(msg, this.source);
      }
    },

    async getDeal(params) {
      try {
        const id = params.id ? String(params.id).trim() : null;
        const name = params.name ? String(params.name).trim() : null;

        // Search by HubSpot ID
        if (id) {
          const deal = await hubspotClient.request<any>({
            method: 'GET',
            path: `/crm/v3/objects/deals/${id}`,
            query: {
              properties: 'dealname,amount,dealstage,closedate,pipeline,hubspot_owner_id',
            },
          });

          return ok(
            {
              deals: deal
                ? [
                    {
                      id: deal.id,
                      name: deal.properties?.dealname,
                      value: parseFloat(deal.properties?.amount || '0'),
                      stage: deal.properties?.dealstage,
                      expected_close_date: deal.properties?.closedate,
                      source: 'hubspot',
                    },
                  ]
                : [],
            },
            this.source
          );
        }

        // Search by name
        if (name) {
          const searchResult = await hubspotClient.request<any>({
            method: 'POST',
            path: '/crm/v3/objects/deals/search',
            body: {
              query: name,
              properties: ['dealname', 'amount', 'dealstage', 'closedate', 'pipeline', 'hubspot_owner_id'],
              limit: 10,
            },
          });

          const deals = (searchResult?.results || []).map((d: any) => ({
            id: d.id,
            name: d.properties?.dealname,
            value: parseFloat(d.properties?.amount || '0'),
            stage: d.properties?.dealstage,
            expected_close_date: d.properties?.closedate,
            source: 'hubspot',
          }));

          return ok({ deals }, this.source);
        }

        return ok({ deals: [] }, this.source);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return fail(msg, this.source);
      }
    },

    async updateCRM(_params, ctx) {
      // For now, don't allow direct HubSpot updates through Copilot
      // This would need careful confirmation flow
      return fail('HubSpot CRM updates not yet supported through Copilot', this.source, {
        needs_confirmation: true,
      });
    },

    // Pipeline methods - not implemented for HubSpot adapter
    // Return null to signal delegation to DB adapter (composite adapter will handle fallback)
    async getPipelineSummary(_params) {
      return { success: false, data: null, delegate: true, source: this.source };
    },

    async getPipelineDeals(_params) {
      return { success: false, data: null, delegate: true, source: this.source };
    },

    async getPipelineForecast(_params) {
      return { success: false, data: null, delegate: true, source: this.source };
    },

    async getContactsNeedingAttention(_params) {
      return { success: false, data: null, delegate: true, source: this.source };
    },

    async getCompanyStatus(_params) {
      return { success: false, data: null, delegate: true, source: this.source };
    },
  };
}

/**
 * Search HubSpot tickets by contact email or company name
 */
export async function searchHubSpotTickets(
  hubspotClient: HubSpotClient,
  params: { contactEmail?: string; companyName?: string; limit?: number }
): Promise<ActionResult> {
  try {
    const limit = Math.min(params.limit || 5, 20);
    const filters: any[] = [];

    // Note: Tickets don't have direct email filter, need to search by associated contact
    // For now, search by subject containing company name
    if (params.companyName) {
      filters.push({
        propertyName: 'subject',
        operator: 'CONTAINS_TOKEN',
        value: params.companyName,
      });
    }

    const searchResult = await hubspotClient.request<any>({
      method: 'POST',
      path: '/crm/v3/objects/tickets/search',
      body: {
        filterGroups: filters.length > 0 ? [{ filters }] : undefined,
        properties: ['subject', 'content', 'hs_ticket_priority', 'hs_pipeline_stage', 'createdate'],
        limit,
        sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
      },
    });

    const tickets = (searchResult?.results || []).map((t: any) => ({
      id: t.id,
      subject: t.properties?.subject,
      content: t.properties?.content,
      priority: t.properties?.hs_ticket_priority,
      stage: t.properties?.hs_pipeline_stage,
      created_at: t.properties?.createdate,
      source: 'hubspot',
    }));

    return { success: true, data: { tickets }, source: 'hubspot_tickets' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, data: null, error: msg, source: 'hubspot_tickets' };
  }
}

/**
 * Get or create HubSpot client for an organization
 */
export async function getHubSpotClientForOrg(
  client: SupabaseClient,
  orgId: string
): Promise<HubSpotClient | null> {
  const token = await getHubSpotToken(client, orgId);
  if (!token) return null;
  return new HubSpotClient({ accessToken: token });
}
