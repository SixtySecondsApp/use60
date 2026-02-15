// supabase/functions/hubspot-initial-sync/index.ts
// Initial sync to populate CRM index when a customer first connects HubSpot

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders } from '../_shared/corsHelper.ts';
import { captureException } from '../_shared/sentryEdge.ts';
import { HubSpotClient } from '../_shared/hubspot.ts';
import {
  upsertContactIndex,
  upsertCompanyIndex,
  upsertDealIndex,
} from '../_shared/upsertCrmIndex.ts';

const PAGE_SIZE = 100;
const RATE_LIMIT_DELAY_MS = 120; // HubSpot allows 10 req/sec, 120ms is conservative

interface HubSpotContact {
  id: string;
  properties: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

interface HubSpotCompany {
  id: string;
  properties: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

interface HubSpotDeal {
  id: string;
  properties: Record<string, any>;
  associations?: {
    contacts?: { id: string }[];
    companies?: { id: string }[];
  };
  createdAt?: string;
  updatedAt?: string;
}

interface HubSpotSearchResponse<T> {
  results: T[];
  paging?: {
    next?: {
      after: string;
    };
  };
}

/**
 * Sync contacts from HubSpot CRM to index
 */
async function syncContacts(
  hubspot: HubSpotClient,
  supabase: any,
  orgId: string,
  startAfter?: string
): Promise<{ indexed: number; cursor: string | null }> {
  let indexed = 0;
  let cursor = startAfter || null;

  while (true) {
    const response = await hubspot.request<HubSpotSearchResponse<HubSpotContact>>({
      method: 'GET',
      path: '/crm/v3/objects/contacts',
      query: {
        limit: PAGE_SIZE,
        after: cursor,
        properties: 'firstname,lastname,email,company,jobtitle,lifecyclestage,hs_lead_status,createdate,lastmodifieddate',
      },
    });

    if (!response.results || response.results.length === 0) break;

    // Batch upsert contacts
    const upsertPromises = response.results.map((contact) =>
      upsertContactIndex({
        supabase,
        orgId,
        crmSource: 'hubspot',
        crmRecordId: contact.id,
        properties: contact.properties || {},
      }).catch((err) => {
        console.error(`[hubspot-initial-sync] Failed to index contact ${contact.id}:`, err);
        return { success: false };
      })
    );

    const results = await Promise.allSettled(upsertPromises);
    indexed += results.filter((r) => r.status === 'fulfilled' && r.value.success).length;

    // Update cursor
    cursor = response.paging?.next?.after || null;

    if (!cursor) break; // No more pages
  }

  return { indexed, cursor };
}

/**
 * Sync companies from HubSpot CRM to index
 */
async function syncCompanies(
  hubspot: HubSpotClient,
  supabase: any,
  orgId: string,
  startAfter?: string
): Promise<{ indexed: number; cursor: string | null }> {
  let indexed = 0;
  let cursor = startAfter || null;

  while (true) {
    const response = await hubspot.request<HubSpotSearchResponse<HubSpotCompany>>({
      method: 'GET',
      path: '/crm/v3/objects/companies',
      query: {
        limit: PAGE_SIZE,
        after: cursor,
        properties: 'name,domain,industry,numberofemployees,annualrevenue,hs_lastmodifieddate',
      },
    });

    if (!response.results || response.results.length === 0) break;

    // Batch upsert companies
    const upsertPromises = response.results.map((company) =>
      upsertCompanyIndex({
        supabase,
        orgId,
        crmSource: 'hubspot',
        crmRecordId: company.id,
        properties: company.properties || {},
      }).catch((err) => {
        console.error(`[hubspot-initial-sync] Failed to index company ${company.id}:`, err);
        return { success: false };
      })
    );

    const results = await Promise.allSettled(upsertPromises);
    indexed += results.filter((r) => r.status === 'fulfilled' && r.value.success).length;

    // Update cursor
    cursor = response.paging?.next?.after || null;

    if (!cursor) break;
  }

  return { indexed, cursor };
}

/**
 * Sync deals from HubSpot CRM to index
 */
async function syncDeals(
  hubspot: HubSpotClient,
  supabase: any,
  orgId: string,
  startAfter?: string
): Promise<{ indexed: number; cursor: string | null }> {
  let indexed = 0;
  let cursor = startAfter || null;

  while (true) {
    const response = await hubspot.request<HubSpotSearchResponse<HubSpotDeal>>({
      method: 'GET',
      path: '/crm/v3/objects/deals',
      query: {
        limit: PAGE_SIZE,
        after: cursor,
        properties: 'dealname,dealstage,amount,closedate,hubspot_owner_id,hs_lastmodifieddate',
        associations: 'contacts,companies',
      },
    });

    if (!response.results || response.results.length === 0) break;

    // Batch upsert deals
    const upsertPromises = response.results.map((deal) => {
      // Extract association IDs
      const contactIds = deal.associations?.contacts?.map((c) => c.id) || [];
      const companyId = deal.associations?.companies?.[0]?.id || null;

      const enrichedProperties = {
        ...deal.properties,
        associations: {
          contacts: contactIds,
          company: companyId,
        },
      };

      return upsertDealIndex({
        supabase,
        orgId,
        crmSource: 'hubspot',
        crmRecordId: deal.id,
        properties: enrichedProperties,
      }).catch((err) => {
        console.error(`[hubspot-initial-sync] Failed to index deal ${deal.id}:`, err);
        return { success: false };
      });
    });

    const results = await Promise.allSettled(upsertPromises);
    indexed += results.filter((r) => r.status === 'fulfilled' && r.value.success).length;

    // Update cursor
    cursor = response.paging?.next?.after || null;

    if (!cursor) break;
  }

  return { indexed, cursor };
}

/**
 * Update sync state in database
 */
async function updateSyncState(
  supabase: any,
  orgId: string,
  updates: {
    sync_status?: 'idle' | 'syncing' | 'error';
    cursors?: Record<string, string | null>;
    error_message?: string | null;
    last_sync_started_at?: string;
    last_sync_completed_at?: string;
    last_successful_sync?: string;
  }
) {
  await supabase
    .from('hubspot_org_sync_state')
    .upsert({
      org_id: orgId,
      ...updates,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'org_id'
    });
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verify JWT and get user
    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body = await req.json();
    const { org_id } = body;

    if (!org_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'org_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user belongs to org
    const { data: membership } = await supabaseAdmin
      .from('organization_memberships')
      .select('role')
      .eq('org_id', org_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) {
      return new Response(
        JSON.stringify({ success: false, error: 'Not a member of this organization' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get HubSpot credentials
    const { data: integration } = await supabaseAdmin
      .from('hubspot_org_integrations')
      .select('org_id, is_active, is_connected')
      .eq('org_id', org_id)
      .eq('is_active', true)
      .maybeSingle();

    if (!integration) {
      return new Response(
        JSON.stringify({ success: false, error: 'HubSpot integration not active' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: creds } = await supabaseAdmin
      .from('hubspot_org_credentials')
      .select('access_token')
      .eq('org_id', org_id)
      .maybeSingle();

    if (!creds?.access_token) {
      return new Response(
        JSON.stringify({ success: false, error: 'HubSpot credentials not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize HubSpot client
    const hubspot = new HubSpotClient({
      accessToken: creds.access_token,
      minDelayMs: RATE_LIMIT_DELAY_MS,
    });

    // Mark sync as started
    await updateSyncState(supabaseAdmin, org_id, {
      sync_status: 'syncing',
      last_sync_started_at: new Date().toISOString(),
      error_message: null,
    });

    // Sync contacts
    console.log('[hubspot-initial-sync] Syncing contacts...');
    const contactResult = await syncContacts(hubspot, supabaseAdmin, org_id);
    console.log(`[hubspot-initial-sync] Indexed ${contactResult.indexed} contacts`);

    // Update cursors after contacts
    await updateSyncState(supabaseAdmin, org_id, {
      cursors: {
        contacts: contactResult.cursor,
      },
    });

    // Sync companies
    console.log('[hubspot-initial-sync] Syncing companies...');
    const companyResult = await syncCompanies(hubspot, supabaseAdmin, org_id);
    console.log(`[hubspot-initial-sync] Indexed ${companyResult.indexed} companies`);

    // Update cursors after companies
    await updateSyncState(supabaseAdmin, org_id, {
      cursors: {
        contacts: contactResult.cursor,
        companies: companyResult.cursor,
      },
    });

    // Sync deals
    console.log('[hubspot-initial-sync] Syncing deals...');
    const dealResult = await syncDeals(hubspot, supabaseAdmin, org_id);
    console.log(`[hubspot-initial-sync] Indexed ${dealResult.indexed} deals`);

    const durationMs = Date.now() - startTime;
    const nowISO = new Date().toISOString();

    // Mark sync as complete
    await updateSyncState(supabaseAdmin, org_id, {
      sync_status: 'idle',
      last_sync_completed_at: nowISO,
      last_successful_sync: nowISO,
      cursors: {
        contacts: contactResult.cursor,
        companies: companyResult.cursor,
        deals: dealResult.cursor,
      },
      error_message: null,
    });

    return new Response(
      JSON.stringify({
        success: true,
        org_id,
        contacts_indexed: contactResult.indexed,
        companies_indexed: companyResult.indexed,
        deals_indexed: dealResult.indexed,
        duration_ms: durationMs,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    await captureException(error, {
      tags: {
        function: 'hubspot-initial-sync',
        integration: 'hubspot',
      },
    });

    console.error('[hubspot-initial-sync] Error:', error);

    // Try to update sync state with error (but don't fail if this fails)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

      // Extract org_id from request body if available
      const body = await req.clone().json().catch(() => ({}));
      if (body.org_id) {
        await updateSyncState(supabaseAdmin, body.org_id, {
          sync_status: 'error',
          error_message: error?.message || 'Initial sync failed',
          last_error_at: new Date().toISOString(),
        });
      }
    } catch (stateError) {
      console.error('[hubspot-initial-sync] Failed to update error state:', stateError);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || 'Initial sync failed',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
