import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { corsHeaders } from '../_shared/cors.ts';
import { HubSpotClient } from '../_shared/hubspot.ts';
/**
 * Get a valid HubSpot access token, refreshing if expired or about to expire
 */ async function getValidAccessToken(svc, orgId) {
  const { data: creds, error: credsError } = await svc.from('hubspot_org_credentials').select('access_token, refresh_token, token_expires_at').eq('org_id', orgId).maybeSingle();
  if (credsError || !creds) {
    return {
      accessToken: null,
      error: 'HubSpot not connected'
    };
  }
  const accessToken = creds.access_token;
  const refreshToken = creds.refresh_token;
  const tokenExpiresAt = creds.token_expires_at;
  if (!accessToken || !refreshToken) {
    return {
      accessToken: null,
      error: 'HubSpot not connected'
    };
  }
  // Check if token is expired or will expire within 5 minutes
  const now = Date.now();
  const expiresAt = tokenExpiresAt ? new Date(tokenExpiresAt).getTime() : 0;
  const isExpiredOrExpiring = expiresAt - now < 5 * 60 * 1000 // 5 minutes buffer
  ;
  if (!isExpiredOrExpiring) {
    return {
      accessToken,
      error: null
    };
  }
  // Token needs refresh
  console.log('[hubspot-admin] Token expired or expiring soon, refreshing...');
  const clientId = Deno.env.get('HUBSPOT_CLIENT_ID') || '';
  const clientSecret = Deno.env.get('HUBSPOT_CLIENT_SECRET') || '';
  if (!clientId || !clientSecret) {
    return {
      accessToken: null,
      error: 'Server misconfigured: missing HubSpot credentials'
    };
  }
  try {
    const tokenParams = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken
    });
    const tokenResp = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: tokenParams.toString()
    });
    const tokenData = await tokenResp.json();
    if (!tokenResp.ok) {
      const msg = tokenData?.message || tokenData?.error_description || 'Token refresh failed';
      console.error('[hubspot-admin] Token refresh failed:', msg);
      // If refresh token is invalid, mark as disconnected
      if (tokenData?.error === 'invalid_grant' || tokenResp.status === 400) {
        await svc.from('hubspot_org_integrations').update({
          is_active: false,
          is_connected: false,
          updated_at: new Date().toISOString()
        }).eq('org_id', orgId);
        return {
          accessToken: null,
          error: 'HubSpot connection expired. Please reconnect.'
        };
      }
      return {
        accessToken: null,
        error: `Token refresh failed: ${msg}`
      };
    }
    const newAccessToken = tokenData.access_token;
    const newRefreshToken = tokenData.refresh_token || refreshToken;
    const expiresIn = Number(tokenData.expires_in || 1800);
    const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    // Update credentials in database
    const { error: updateError } = await svc.from('hubspot_org_credentials').update({
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString()
    }).eq('org_id', orgId);
    if (updateError) {
      console.error('[hubspot-admin] Failed to update refreshed token:', updateError);
      return {
        accessToken: null,
        error: 'Failed to save refreshed token'
      };
    }
    console.log('[hubspot-admin] Token refreshed successfully, expires at:', newExpiresAt);
    return {
      accessToken: newAccessToken,
      error: null
    };
  } catch (e) {
    console.error('[hubspot-admin] Token refresh error:', e);
    return {
      accessToken: null,
      error: e instanceof Error ? e.message : 'Token refresh failed'
    };
  }
}
serve(async (req)=>{
  console.log('[hubspot-admin] Request received:', req.method, req.url);
  if (req.method === 'OPTIONS') return new Response('ok', {
    headers: corsHeaders
  });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({
      success: false,
      error: 'Method not allowed'
    }), {
      status: 405,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Server misconfigured'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    let body = {};
    try {
      const rawBody = await req.text();
      if (rawBody) {
        body = JSON.parse(rawBody);
      }
    } catch (e: any) {
      console.error('[hubspot-admin] Body parse error:', e?.message);
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid JSON body'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    const action = typeof body.action === 'string' ? body.action : null;
    const orgId = typeof body.org_id === 'string' ? body.org_id : null;

    if (!action || !orgId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing action or org_id'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    const svc = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    if (action === 'status') {
      const { data: integration } = await svc.from('hubspot_org_integrations').select('*').eq('org_id', orgId).eq('is_active', true).maybeSingle();
      const { data: syncState } = await svc.from('hubspot_org_sync_state').select('*').eq('org_id', orgId).maybeSingle();
      const { data: settingsRow } = await svc.from('hubspot_settings').select('settings').eq('org_id', orgId).maybeSingle();
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      const webhookToken = integration?.webhook_token ? String(integration.webhook_token) : null;
      const webhookUrl = webhookToken && supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/functions/v1/hubspot-webhook?token=${encodeURIComponent(webhookToken)}` : null;
      return new Response(JSON.stringify({
        success: true,
        connected: Boolean(integration?.is_connected),
        integration,
        sync_state: syncState || null,
        settings: settingsRow?.settings || {},
        webhook_url: webhookUrl
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    if (action === 'save_settings') {
      const settings = body.settings ?? {};
      console.log('[hubspot-admin] Saving settings for org:', orgId, 'settings:', JSON.stringify(settings).substring(0, 200));
      const { error: upsertError } = await svc.from('hubspot_settings').upsert({
        org_id: orgId,
        settings,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'org_id'
      });
      if (upsertError) {
        console.error('[hubspot-admin] Failed to save settings:', upsertError);
        return new Response(JSON.stringify({
          success: false,
          error: upsertError.message || 'Failed to save settings'
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      console.log('[hubspot-admin] Settings saved successfully');
      return new Response(JSON.stringify({
        success: true
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    if (action === 'enqueue') {
      const jobType = typeof body.job_type === 'string' ? body.job_type : null;
      if (!jobType) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Missing job_type'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const payload = body.payload ?? {};
      const dedupeKey = typeof body.dedupe_key === 'string' ? body.dedupe_key : null;
      const priority = typeof body.priority === 'number' ? body.priority : 100;
      // Pull clerk_org_id from integration/settings if available
      const { data: integration } = await svc.from('hubspot_org_integrations').select('clerk_org_id').eq('org_id', orgId).maybeSingle();
      const { error: insertError } = await svc.from('hubspot_sync_queue').insert({
        org_id: orgId,
        clerk_org_id: integration?.clerk_org_id || null,
        job_type: jobType,
        payload,
        dedupe_key: dedupeKey,
        priority,
        run_after: new Date().toISOString(),
        attempts: 0,
        max_attempts: 10
      });
      // Ignore duplicate key errors (job already queued)
      if (insertError) {
        const msg = String(insertError.message || '');
        if (!msg.toLowerCase().includes('duplicate key') && !msg.toLowerCase().includes('unique')) {
          throw new Error(insertError.message || 'Failed to enqueue job');
        }
      }
      return new Response(JSON.stringify({
        success: true
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Get HubSpot properties (deals, contacts, tasks)
    if (action === 'get_properties') {
      const objectType = typeof body.object_type === 'string' ? body.object_type : 'deals';
      // Get valid access token (auto-refreshes if expired)
      const { accessToken, error: tokenError } = await getValidAccessToken(svc, orgId);
      if (!accessToken) {
        return new Response(JSON.stringify({
          success: false,
          error: tokenError || 'HubSpot not connected'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const client = new HubSpotClient({
        accessToken
      });
      try {
        const properties = await client.request({
          method: 'GET',
          path: `/crm/v3/properties/${objectType}`
        });
        return new Response(JSON.stringify({
          success: true,
          properties: properties.results.map((p)=>({
              name: p.name,
              label: p.label,
              type: p.type,
              fieldType: p.fieldType,
              description: p.description,
              groupName: p.groupName,
              options: p.options
            }))
        }), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      } catch (e) {
        return new Response(JSON.stringify({
          success: false,
          error: e.message || 'Failed to fetch properties'
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
    }
    // Get HubSpot deal pipelines and stages
    if (action === 'get_pipelines') {
      // Get valid access token (auto-refreshes if expired)
      const { accessToken, error: tokenError } = await getValidAccessToken(svc, orgId);
      if (!accessToken) {
        return new Response(JSON.stringify({
          success: false,
          error: tokenError || 'HubSpot not connected'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const client = new HubSpotClient({
        accessToken
      });
      try {
        const pipelines = await client.request({
          method: 'GET',
          path: '/crm/v3/pipelines/deals'
        });
        return new Response(JSON.stringify({
          success: true,
          pipelines: pipelines.results.map((p)=>({
              id: p.id,
              label: p.label,
              displayOrder: p.displayOrder,
              stages: (p.stages || []).map((s)=>({
                  id: s.id,
                  label: s.label,
                  displayOrder: s.displayOrder,
                  metadata: s.metadata
                }))
            }))
        }), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      } catch (e) {
        return new Response(JSON.stringify({
          success: false,
          error: e.message || 'Failed to fetch pipelines'
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
    }
    // Get HubSpot segments (replaced deprecated lists endpoint)
    if (action === 'get_lists') {
      // Get valid access token (auto-refreshes if expired)
      const { accessToken, error: tokenError } = await getValidAccessToken(svc, orgId);
      if (!accessToken) {
        return new Response(JSON.stringify({
          success: false,
          error: tokenError || 'HubSpot not connected'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const client = new HubSpotClient({
        accessToken
      });
      try {
        // Fetch all segments with pagination using new API endpoint
        const allSegments = [];
        let after;
        const limit = 100; // HubSpot v3 max per page
        let hasMore = true;
        console.log('[hubspot-admin] Starting get_segments fetch (lists endpoint deprecated)...');
        while(hasMore){
          // Use /crm/v3/objects/contacts/segments instead of deprecated /crm/v3/lists
          const path = after ? `/crm/v3/objects/contacts/segments?limit=${limit}&after=${after}` : `/crm/v3/objects/contacts/segments?limit=${limit}`;
          console.log('[hubspot-admin] Fetching segments from path:', path);
          const response = await client.request({
            method: 'GET',
            path
          });
          console.log('[hubspot-admin] Segments response:', JSON.stringify({
            resultsCount: response?.results?.length ?? 0,
            hasNext: !!response?.paging?.next?.after,
            sampleSegment: response?.results?.[0] ? {
              id: response.results[0].id,
              name: response.results[0].name,
              keys: Object.keys(response.results[0])
            } : null
          }));
          const segments = response?.results || [];
          allSegments.push(...segments);
          after = response?.paging?.next?.after;
          hasMore = !!after;
          // Safety limit
          if (allSegments.length > 5000) break;
        }
        console.log('[hubspot-admin] Total segments found:', allSegments.length);

        // Format segments to match list interface
        const formattedLists = allSegments
          .filter((s: any) => !s.archived) // Skip archived segments
          .map((s: any) => ({
            id: s.id?.toString() || String(Math.random()),
            name: s.name || 'Untitled Segment',
            listType: 'DYNAMIC', // Segments are dynamic by nature
            membershipCount: 0, // Segments API doesn't include membership count
            createdAt: s.createdAt,
            updatedAt: s.updatedAt
          }));

        console.log('[hubspot-admin] Formatted segments count:', formattedLists.length);

        return new Response(JSON.stringify({
          success: true,
          lists: formattedLists // Keep as 'lists' for backwards compatibility
        }), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      } catch (e: any) {
        console.error('[hubspot-admin] get_segments error:', {
          message: e.message,
          status: e.status,
          responseBody: e?.responseBody,
          name: e.name,
        });

        // Provide more specific error messages
        let errorMsg = 'Failed to fetch segments';
        if (e.status === 403) {
          errorMsg = 'Permission denied: missing required scope. Please reconnect HubSpot.';
        } else if (e.status === 401) {
          errorMsg = 'Authentication failed: HubSpot token may have expired. Please reconnect.';
        } else if (e.message?.includes('socket hang up') || e.message?.includes('ECONNREFUSED')) {
          errorMsg = 'Network error: unable to reach HubSpot API. Please try again.';
        }

        return new Response(JSON.stringify({
          success: false,
          error: errorMsg,
          details: e.message
        }), {
          status: e.status || 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
    }
    // Get HubSpot contact preview (first N contacts from list or filter)
    if (action === 'preview_contacts') {
      const listId = body.list_id;
      const filters = body.filters;
      const previewLimit = Math.min(body.limit || 5, 10) // Max 10 for preview
      ;
      const { accessToken, error: tokenError } = await getValidAccessToken(svc, orgId);
      if (!accessToken) {
        return new Response(JSON.stringify({
          success: false,
          error: tokenError || 'HubSpot not connected'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const client = new HubSpotClient({
        accessToken
      });
      try {
        let results = [];
        let totalCount = 0;
        // Preview properties to fetch
        const previewProperties = [
          'email',
          'firstname',
          'lastname',
          'company'
        ];
        if (listId) {
          // Two-step approach for segment-based preview:
          // 1. Get contact IDs from the segment
          // 2. Batch-read contacts with their properties
          try {
            const membershipResponse = await client.request({
              method: 'GET',
              path: `/crm/v3/objects/contacts/segments/${listId}/memberships`,
              query: {
                limit: previewLimit
              }
            });
            const memberIds = membershipResponse?.results?.map((m: any)=>m.recordId) ?? [];
            if (memberIds.length > 0) {
              // Batch-read contacts with properties
              const batchResponse = await client.request({
                method: 'POST',
                path: '/crm/v3/objects/contacts/batch/read',
                body: {
                  propertiesWithHistory: [],
                  inputs: memberIds.map((id: string)=>({
                      id
                    })),
                  properties: previewProperties
                }
              });
              results = batchResponse?.results ?? [];
            }
            // Segments API doesn't provide total count, so use results length
            totalCount = results.length;
          } catch (segmentError: any) {
            // If segment memberships fails, return empty (segment may have no members)
            console.warn('[hubspot-admin] Segment membership fetch failed:', segmentError.message);
            totalCount = 0;
          }
        } else {
          // Use search API with filters
          const searchBody = {
            filterGroups: filters?.length ? [
              {
                filters: filters.map((f)=>({
                    propertyName: f.propertyName,
                    operator: f.operator,
                    value: f.value
                  }))
              }
            ] : [],
            properties: previewProperties,
            limit: previewLimit
          };
          const response = await client.request({
            method: 'POST',
            path: '/crm/v3/objects/contacts/search',
            body: JSON.stringify(searchBody)
          });
          results = response.results || [];
          totalCount = response.total || results.length;
        }
        return new Response(JSON.stringify({
          success: true,
          totalCount,
          contacts: results.map((c)=>({
              id: c.id,
              email: c.properties?.email || '',
              firstName: c.properties?.firstname || '',
              lastName: c.properties?.lastname || '',
              company: c.properties?.company || ''
            }))
        }), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      } catch (e) {
        return new Response(JSON.stringify({
          success: false,
          error: e.message || 'Failed to preview contacts'
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
    }
    // Get HubSpot forms
    if (action === 'get_forms') {
      // Get valid access token (auto-refreshes if expired)
      const { accessToken, error: tokenError } = await getValidAccessToken(svc, orgId);
      if (!accessToken) {
        return new Response(JSON.stringify({
          success: false,
          error: tokenError || 'HubSpot not connected'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const client = new HubSpotClient({
        accessToken
      });
      try {
        const forms = await client.request({
          method: 'GET',
          path: '/marketing/v3/forms'
        });
        return new Response(JSON.stringify({
          success: true,
          forms: forms.results.map((f)=>({
              id: f.id,
              name: f.name,
              formType: f.formType,
              createdAt: f.createdAt,
              updatedAt: f.updatedAt,
              archived: f.archived
            }))
        }), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      } catch (e) {
        return new Response(JSON.stringify({
          success: false,
          error: e.message || 'Failed to fetch forms'
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
    }
    // Trigger sync with time period options
    if (action === 'trigger_sync') {
      const syncType = typeof body.sync_type === 'string' ? body.sync_type : 'deals';
      const timePeriod = typeof body.time_period === 'string' ? body.time_period : 'last_30_days';
      // Calculate date filter based on time period
      let createdAfter = null;
      const now = new Date();
      switch(timePeriod){
        case 'last_7_days':
          createdAfter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
          break;
        case 'last_30_days':
          createdAfter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
          break;
        case 'last_90_days':
          createdAfter = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
          break;
        case 'last_year':
          createdAfter = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
          break;
        case 'all_time':
          createdAfter = null;
          break;
        default:
          createdAfter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      }
      const { data: integration } = await svc.from('hubspot_org_integrations').select('clerk_org_id').eq('org_id', orgId).maybeSingle();
      // Map sync type to allowed job_type values
      const jobTypeMap = {
        deals: 'sync_deal',
        contacts: 'sync_contact',
        tasks: 'sync_task'
      };
      const jobType = jobTypeMap[syncType] || 'sync_deal';
      // Queue the sync job
      console.log('[hubspot-admin] Queueing sync job:', {
        syncType,
        jobType,
        timePeriod,
        createdAfter,
        orgId
      });
      const { error: insertError } = await svc.from('hubspot_sync_queue').insert({
        org_id: orgId,
        job_type: jobType,
        payload: {
          sync_type: syncType,
          time_period: timePeriod,
          created_after: createdAfter,
          is_initial_sync: true
        },
        dedupe_key: `initial_sync_${syncType}_${orgId}`,
        priority: 50,
        run_after: new Date().toISOString(),
        attempts: 0,
        max_attempts: 5
      });
      if (insertError) {
        // Ignore duplicate key errors (job already queued)
        const msg = String(insertError.message || '');
        if (!msg.toLowerCase().includes('duplicate key') && !msg.toLowerCase().includes('unique')) {
          console.error('[hubspot-admin] Failed to queue sync job:', insertError);
          return new Response(JSON.stringify({
            success: false,
            error: insertError.message || 'Failed to queue sync'
          }), {
            status: 500,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            }
          });
        }
        console.log('[hubspot-admin] Sync job already queued (duplicate key)');
      }
      console.log('[hubspot-admin] Sync job queued successfully');
      return new Response(JSON.stringify({
        success: true,
        message: `${syncType} sync queued for ${timePeriod.replace(/_/g, ' ')}`,
        created_after: createdAfter
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // ============================================================================
    // CRUD Operations for Test Data Mode
    // ============================================================================
    // Create a contact in HubSpot
    if (action === 'create_contact') {
      const properties = body.properties || {};
      // Validate required fields
      if (!properties.email && !properties.firstname && !properties.lastname) {
        return new Response(JSON.stringify({
          success: false,
          error: 'At least one of email, firstname, or lastname is required'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const { accessToken, error: tokenError } = await getValidAccessToken(svc, orgId);
      if (!accessToken) {
        return new Response(JSON.stringify({
          success: false,
          error: tokenError || 'HubSpot not connected'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const client = new HubSpotClient({
        accessToken
      });
      try {
        console.log('[hubspot-admin] Creating contact with properties:', JSON.stringify(properties));
        const contact = await client.request({
          method: 'POST',
          path: '/crm/v3/objects/contacts',
          body: {
            properties
          }
        });
        console.log('[hubspot-admin] Contact created:', contact.id);
        return new Response(JSON.stringify({
          success: true,
          id: contact.id,
          properties: contact.properties,
          objectType: 'contact'
        }), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      } catch (e) {
        console.error('[hubspot-admin] Failed to create contact:', e);
        return new Response(JSON.stringify({
          success: false,
          error: e.message || 'Failed to create contact'
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
    }
    // Create a deal in HubSpot
    if (action === 'create_deal') {
      const properties = body.properties || {};
      // Validate required field
      if (!properties.dealname) {
        return new Response(JSON.stringify({
          success: false,
          error: 'dealname is required'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const { accessToken, error: tokenError } = await getValidAccessToken(svc, orgId);
      if (!accessToken) {
        return new Response(JSON.stringify({
          success: false,
          error: tokenError || 'HubSpot not connected'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const client = new HubSpotClient({
        accessToken
      });
      try {
        console.log('[hubspot-admin] Creating deal with properties:', JSON.stringify(properties));
        const deal = await client.request({
          method: 'POST',
          path: '/crm/v3/objects/deals',
          body: {
            properties
          }
        });
        console.log('[hubspot-admin] Deal created:', deal.id);
        return new Response(JSON.stringify({
          success: true,
          id: deal.id,
          properties: deal.properties,
          objectType: 'deal'
        }), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      } catch (e) {
        console.error('[hubspot-admin] Failed to create deal:', e);
        return new Response(JSON.stringify({
          success: false,
          error: e.message || 'Failed to create deal'
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
    }
    // Create a task in HubSpot
    if (action === 'create_task') {
      const properties = body.properties || {};
      const contactId = body.contact_id || body.contactId || null;
      const dealId = body.deal_id || body.dealId || null;
      // Validate required fields - tasks require hs_task_subject
      if (!properties.hs_task_subject) {
        return new Response(JSON.stringify({
          success: false,
          error: 'hs_task_subject is required'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const { accessToken, error: tokenError } = await getValidAccessToken(svc, orgId);
      if (!accessToken) {
        return new Response(JSON.stringify({
          success: false,
          error: tokenError || 'HubSpot not connected'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const client = new HubSpotClient({
        accessToken
      });
      try {
        console.log('[hubspot-admin] Creating task with properties:', JSON.stringify(properties));
        const task = await client.request({
          method: 'POST',
          path: '/crm/v3/objects/tasks',
          body: {
            properties
          }
        });
        console.log('[hubspot-admin] Task created:', task.id);
        // Associate task with contact if contact_id provided
        // Association type 204 = Task to Contact
        if (contactId) {
          try {
            console.log(`[hubspot-admin] Associating task ${task.id} with contact ${contactId}`);
            await client.request({
              method: 'PUT',
              path: `/crm/v3/objects/tasks/${task.id}/associations/contacts/${contactId}/204`
            });
            console.log('[hubspot-admin] Task associated with contact successfully');
          } catch (assocError) {
            console.error('[hubspot-admin] Failed to associate task with contact:', assocError);
          // Don't fail the whole request, just log the warning
          }
        }
        // Associate task with deal if deal_id provided
        // Association type 216 = Task to Deal
        if (dealId) {
          try {
            console.log(`[hubspot-admin] Associating task ${task.id} with deal ${dealId}`);
            await client.request({
              method: 'PUT',
              path: `/crm/v3/objects/tasks/${task.id}/associations/deals/${dealId}/216`
            });
            console.log('[hubspot-admin] Task associated with deal successfully');
          } catch (assocError) {
            console.error('[hubspot-admin] Failed to associate task with deal:', assocError);
          // Don't fail the whole request, just log the warning
          }
        }
        return new Response(JSON.stringify({
          success: true,
          id: task.id,
          properties: task.properties,
          objectType: 'task',
          associations: {
            contact: contactId || null,
            deal: dealId || null
          }
        }), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      } catch (e) {
        console.error('[hubspot-admin] Failed to create task:', e);
        return new Response(JSON.stringify({
          success: false,
          error: e.message || 'Failed to create task'
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
    }
    // Create a timeline activity (note) in HubSpot
    // Notes appear on the contact/deal timeline as activities
    if (action === 'create_activity') {
      const properties = body.properties || {};
      const contactId = body.contact_id || body.contactId || null;
      const dealId = body.deal_id || body.dealId || null;
      // Build note body from properties
      const noteBody = properties.hs_note_body || properties.body || properties.content || properties.message || properties.note || `Activity logged at ${new Date().toISOString()}`;
      const { accessToken, error: tokenError } = await getValidAccessToken(svc, orgId);
      if (!accessToken) {
        return new Response(JSON.stringify({
          success: false,
          error: tokenError || 'HubSpot not connected'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const client = new HubSpotClient({
        accessToken
      });
      try {
        console.log('[hubspot-admin] Creating activity/note with body:', noteBody.substring(0, 100));
        // Create a note object
        const note = await client.request({
          method: 'POST',
          path: '/crm/v3/objects/notes',
          body: {
            properties: {
              hs_note_body: noteBody,
              hs_timestamp: properties.hs_timestamp || new Date().toISOString()
            }
          }
        });
        console.log('[hubspot-admin] Note created:', note.id);
        // Associate note with contact if contact_id provided
        // Association type 202 = Note to Contact
        if (contactId) {
          try {
            console.log(`[hubspot-admin] Associating note ${note.id} with contact ${contactId}`);
            await client.request({
              method: 'PUT',
              path: `/crm/v3/objects/notes/${note.id}/associations/contacts/${contactId}/202`
            });
            console.log('[hubspot-admin] Note associated with contact successfully');
          } catch (assocError) {
            console.error('[hubspot-admin] Failed to associate note with contact:', assocError);
          }
        }
        // Associate note with deal if deal_id provided
        // Association type 214 = Note to Deal
        if (dealId) {
          try {
            console.log(`[hubspot-admin] Associating note ${note.id} with deal ${dealId}`);
            await client.request({
              method: 'PUT',
              path: `/crm/v3/objects/notes/${note.id}/associations/deals/${dealId}/214`
            });
            console.log('[hubspot-admin] Note associated with deal successfully');
          } catch (assocError) {
            console.error('[hubspot-admin] Failed to associate note with deal:', assocError);
          }
        }
        return new Response(JSON.stringify({
          success: true,
          id: note.id,
          properties: note.properties,
          objectType: 'note',
          associations: {
            contact: contactId || null,
            deal: dealId || null
          }
        }), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      } catch (e) {
        console.error('[hubspot-admin] Failed to create activity/note:', e);
        return new Response(JSON.stringify({
          success: false,
          error: e.message || 'Failed to create activity'
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
    }
    // Update a contact in HubSpot (e.g., lifecycle stage)
    if (action === 'update_contact') {
      const contactId = body.record_id || body.contact_id || body.id;
      const properties = body.properties || {};
      if (!contactId) {
        return new Response(JSON.stringify({
          success: false,
          error: 'record_id is required'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      if (Object.keys(properties).length === 0) {
        return new Response(JSON.stringify({
          success: false,
          error: 'At least one property to update is required'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const { accessToken, error: tokenError } = await getValidAccessToken(svc, orgId);
      if (!accessToken) {
        return new Response(JSON.stringify({
          success: false,
          error: tokenError || 'HubSpot not connected'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const client = new HubSpotClient({
        accessToken
      });
      try {
        console.log('[hubspot-admin] Updating contact:', contactId, 'with properties:', JSON.stringify(properties));
        const contact = await client.request({
          method: 'PATCH',
          path: `/crm/v3/objects/contacts/${contactId}`,
          body: {
            properties
          }
        });
        console.log('[hubspot-admin] Contact updated:', contact.id);
        return new Response(JSON.stringify({
          success: true,
          id: contact.id,
          properties: contact.properties,
          objectType: 'contact'
        }), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      } catch (e) {
        console.error('[hubspot-admin] Failed to update contact:', e);
        return new Response(JSON.stringify({
          success: false,
          error: e.message || 'Failed to update contact'
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
    }
    // Update a deal in HubSpot (e.g., pipeline stage)
    if (action === 'update_deal') {
      const dealId = body.record_id || body.deal_id || body.id;
      const properties = body.properties || {};
      if (!dealId) {
        return new Response(JSON.stringify({
          success: false,
          error: 'record_id is required'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      if (Object.keys(properties).length === 0) {
        return new Response(JSON.stringify({
          success: false,
          error: 'At least one property to update is required'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const { accessToken, error: tokenError } = await getValidAccessToken(svc, orgId);
      if (!accessToken) {
        return new Response(JSON.stringify({
          success: false,
          error: tokenError || 'HubSpot not connected'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const client = new HubSpotClient({
        accessToken
      });
      try {
        console.log('[hubspot-admin] Updating deal:', dealId, 'with properties:', JSON.stringify(properties));
        const deal = await client.request({
          method: 'PATCH',
          path: `/crm/v3/objects/deals/${dealId}`,
          body: {
            properties
          }
        });
        console.log('[hubspot-admin] Deal updated:', deal.id);
        return new Response(JSON.stringify({
          success: true,
          id: deal.id,
          properties: deal.properties,
          objectType: 'deal'
        }), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      } catch (e) {
        console.error('[hubspot-admin] Failed to update deal:', e);
        return new Response(JSON.stringify({
          success: false,
          error: e.message || 'Failed to update deal'
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
    }
    // Update a task in HubSpot (e.g., status)
    if (action === 'update_task') {
      const taskId = body.record_id || body.task_id || body.id;
      const properties = body.properties || {};
      if (!taskId) {
        return new Response(JSON.stringify({
          success: false,
          error: 'record_id is required'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      if (Object.keys(properties).length === 0) {
        return new Response(JSON.stringify({
          success: false,
          error: 'At least one property to update is required'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const { accessToken, error: tokenError } = await getValidAccessToken(svc, orgId);
      if (!accessToken) {
        return new Response(JSON.stringify({
          success: false,
          error: tokenError || 'HubSpot not connected'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const client = new HubSpotClient({
        accessToken
      });
      try {
        console.log('[hubspot-admin] Updating task:', taskId, 'with properties:', JSON.stringify(properties));
        const task = await client.request({
          method: 'PATCH',
          path: `/crm/v3/objects/tasks/${taskId}`,
          body: {
            properties
          }
        });
        console.log('[hubspot-admin] Task updated:', task.id);
        return new Response(JSON.stringify({
          success: true,
          id: task.id,
          properties: task.properties,
          objectType: 'task'
        }), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      } catch (e) {
        console.error('[hubspot-admin] Failed to update task:', e);
        return new Response(JSON.stringify({
          success: false,
          error: e.message || 'Failed to update task'
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
    }
    // Delete a contact from HubSpot
    if (action === 'delete_contact') {
      const contactId = body.record_id || body.contact_id || body.id;
      if (!contactId) {
        return new Response(JSON.stringify({
          success: false,
          error: 'record_id is required'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const { accessToken, error: tokenError } = await getValidAccessToken(svc, orgId);
      if (!accessToken) {
        return new Response(JSON.stringify({
          success: false,
          error: tokenError || 'HubSpot not connected'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const client = new HubSpotClient({
        accessToken
      });
      try {
        console.log('[hubspot-admin] Deleting contact:', contactId);
        await client.request({
          method: 'DELETE',
          path: `/crm/v3/objects/contacts/${contactId}`
        });
        console.log('[hubspot-admin] Contact deleted:', contactId);
        return new Response(JSON.stringify({
          success: true,
          deleted: true,
          id: contactId,
          objectType: 'contact'
        }), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      } catch (e) {
        console.error('[hubspot-admin] Failed to delete contact:', e);
        return new Response(JSON.stringify({
          success: false,
          error: e.message || 'Failed to delete contact'
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
    }
    // Delete a deal from HubSpot
    if (action === 'delete_deal') {
      const dealId = body.record_id || body.deal_id || body.id;
      if (!dealId) {
        return new Response(JSON.stringify({
          success: false,
          error: 'record_id is required'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const { accessToken, error: tokenError } = await getValidAccessToken(svc, orgId);
      if (!accessToken) {
        return new Response(JSON.stringify({
          success: false,
          error: tokenError || 'HubSpot not connected'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const client = new HubSpotClient({
        accessToken
      });
      try {
        console.log('[hubspot-admin] Deleting deal:', dealId);
        await client.request({
          method: 'DELETE',
          path: `/crm/v3/objects/deals/${dealId}`
        });
        console.log('[hubspot-admin] Deal deleted:', dealId);
        return new Response(JSON.stringify({
          success: true,
          deleted: true,
          id: dealId,
          objectType: 'deal'
        }), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      } catch (e) {
        console.error('[hubspot-admin] Failed to delete deal:', e);
        return new Response(JSON.stringify({
          success: false,
          error: e.message || 'Failed to delete deal'
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
    }
    // Delete a task from HubSpot
    if (action === 'delete_task') {
      const taskId = body.record_id || body.task_id || body.id;
      if (!taskId) {
        return new Response(JSON.stringify({
          success: false,
          error: 'record_id is required'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const { accessToken, error: tokenError } = await getValidAccessToken(svc, orgId);
      if (!accessToken) {
        return new Response(JSON.stringify({
          success: false,
          error: tokenError || 'HubSpot not connected'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const client = new HubSpotClient({
        accessToken
      });
      try {
        console.log('[hubspot-admin] Deleting task:', taskId);
        await client.request({
          method: 'DELETE',
          path: `/crm/v3/objects/tasks/${taskId}`
        });
        console.log('[hubspot-admin] Task deleted:', taskId);
        return new Response(JSON.stringify({
          success: true,
          deleted: true,
          id: taskId,
          objectType: 'task'
        }), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      } catch (e) {
        console.error('[hubspot-admin] Failed to delete task:', e);
        return new Response(JSON.stringify({
          success: false,
          error: e.message || 'Failed to delete task'
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
    }
    return new Response(JSON.stringify({
      success: false,
      error: 'Unknown action'
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (e) {
    console.error('[hubspot-admin] Unhandled error:', e);
    return new Response(JSON.stringify({
      success: false,
      error: e.message || 'Internal server error'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
