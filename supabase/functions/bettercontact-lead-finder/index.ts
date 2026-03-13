import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

const BETTERCONTACT_API_URL = 'https://app.bettercontact.rocks/api/v2';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const headers = getCorsHeaders(req);

  try {
    const body = await req.json();
    const { action } = body;

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), { status: 401, headers });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    }

    // Get org
    const { data: membership } = await serviceClient
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (!membership) {
      return new Response(JSON.stringify({ error: 'No organization found' }), { status: 403, headers });
    }
    const orgId = membership.org_id;

    // Get BetterContact API key (BYOK)
    const { data: creds } = await serviceClient
      .from('integration_credentials')
      .select('credentials')
      .eq('organization_id', orgId)
      .eq('provider', 'bettercontact')
      .maybeSingle();

    const apiKey = (creds?.credentials as Record<string, string>)?.api_key;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'BetterContact API key not configured' }), { status: 400, headers });
    }

    switch (action) {
      case 'submit':
        return await handleSubmitSearch(body, serviceClient, user, orgId, apiKey, headers);
      case 'poll':
        return await handlePollResults(body, serviceClient, user, orgId, apiKey, headers);
      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400, headers });
    }
  } catch (err: any) {
    console.error('[bettercontact-lead-finder] Error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), { status: 500, headers });
  }
});

async function handleSubmitSearch(
  body: any,
  serviceClient: any,
  user: any,
  orgId: string,
  apiKey: string,
  headers: HeadersInit
): Promise<Response> {
  const { filters } = body;

  if (!filters?.company_name && !filters?.company_domain) {
    return new Response(JSON.stringify({ error: 'At least company_name or company_domain is required' }), { status: 400, headers });
  }

  // Submit to BetterContact Lead Finder
  const searchPayload: Record<string, any> = {};
  if (filters.company_name) searchPayload.company_name = filters.company_name;
  if (filters.company_domain) searchPayload.company_domain = filters.company_domain;
  if (filters.job_title) searchPayload.job_title = filters.job_title;
  if (filters.location) searchPayload.location = filters.location;
  if (filters.limit) searchPayload.limit = filters.limit;

  const bcResponse = await fetch(`${BETTERCONTACT_API_URL}/lead_finder/async`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify(searchPayload),
  });

  if (!bcResponse.ok) {
    const errorText = await bcResponse.text();
    console.error('[bettercontact-lead-finder] API error:', bcResponse.status, errorText);
    return new Response(JSON.stringify({ error: `BetterContact API error: ${bcResponse.status}` }), { status: 502, headers });
  }

  const bcResult = await bcResponse.json();

  // Track the request
  await serviceClient
    .from('bettercontact_requests')
    .insert({
      organization_id: orgId,
      bettercontact_request_id: bcResult.id,
      action: 'lead_finder',
      status: 'pending',
      total_contacts: 0,
      created_by: user.id,
    });

  return new Response(JSON.stringify({
    request_id: bcResult.id,
    message: 'Lead search submitted',
  }), { status: 200, headers });
}

async function handlePollResults(
  body: any,
  serviceClient: any,
  user: any,
  orgId: string,
  apiKey: string,
  headers: HeadersInit
): Promise<Response> {
  const { request_id, auto_create_table = true } = body;

  if (!request_id) {
    return new Response(JSON.stringify({ error: 'request_id required' }), { status: 400, headers });
  }

  // Poll BetterContact
  const bcResponse = await fetch(`${BETTERCONTACT_API_URL}/lead_finder/async/${request_id}`, {
    method: 'GET',
    headers: { 'X-API-Key': apiKey },
  });

  if (!bcResponse.ok) {
    return new Response(JSON.stringify({ error: `BetterContact API error: ${bcResponse.status}` }), { status: bcResponse.status, headers });
  }

  const bcResult = await bcResponse.json();

  // If still processing, return status
  if (bcResult.status !== 'terminated') {
    return new Response(JSON.stringify({
      status: bcResult.status,
      message: 'Still processing',
    }), { status: 200, headers });
  }

  // Results ready -- create Ops table if requested
  if (!auto_create_table || !bcResult.data || bcResult.data.length === 0) {
    // Update tracking
    await serviceClient
      .from('bettercontact_requests')
      .update({
        status: 'terminated',
        processed_contacts: bcResult.data?.length || 0,
        credits_consumed: bcResult.credits_consumed || 0,
        completed_at: new Date().toISOString(),
      })
      .eq('bettercontact_request_id', request_id)
      .eq('organization_id', orgId);

    return new Response(JSON.stringify({
      status: 'terminated',
      data: bcResult.data,
      summary: bcResult.summary,
      credits_consumed: bcResult.credits_consumed,
    }), { status: 200, headers });
  }

  // Create dynamic table
  const tableName = `BetterContact Search — ${new Date().toLocaleDateString()}`;

  const { data: table } = await serviceClient
    .from('dynamic_tables')
    .insert({
      organization_id: orgId,
      created_by: user.id,
      name: tableName,
      source_type: 'bettercontact',
      row_count: bcResult.data.length,
    })
    .select('id')
    .single();

  if (!table) {
    return new Response(JSON.stringify({ error: 'Failed to create table' }), { status: 500, headers });
  }

  // Create columns
  const columnDefs = [
    { key: 'first_name', label: 'First Name', column_type: 'text', position: 0 },
    { key: 'last_name', label: 'Last Name', column_type: 'text', position: 1 },
    { key: 'email', label: 'Email', column_type: 'email', position: 2 },
    { key: 'email_status', label: 'Email Status', column_type: 'text', position: 3 },
    { key: 'phone', label: 'Phone', column_type: 'phone', position: 4 },
    { key: 'job_title', label: 'Job Title', column_type: 'text', position: 5 },
    { key: 'gender', label: 'Gender', column_type: 'text', position: 6 },
    { key: 'email_provider', label: 'Email Provider', column_type: 'text', position: 7 },
  ];

  const { data: columns } = await serviceClient
    .from('dynamic_table_columns')
    .insert(columnDefs.map(col => ({ ...col, table_id: table.id })))
    .select('id, key');

  if (!columns) {
    return new Response(JSON.stringify({ error: 'Failed to create columns' }), { status: 500, headers });
  }

  const colMap: Record<string, string> = {};
  for (const col of columns) {
    colMap[col.key] = col.id;
  }

  // Create rows and cells
  for (let i = 0; i < bcResult.data.length; i++) {
    const contact = bcResult.data[i];

    const { data: row } = await serviceClient
      .from('dynamic_table_rows')
      .insert({
        table_id: table.id,
        row_index: i,
        source_data: { bettercontact: contact },
      })
      .select('id')
      .single();

    if (!row) continue;

    // Create cells
    const cellData = [
      { row_id: row.id, column_id: colMap['first_name'], value: contact.contact_first_name || null, status: 'complete', source: 'bettercontact' },
      { row_id: row.id, column_id: colMap['last_name'], value: contact.contact_last_name || null, status: 'complete', source: 'bettercontact' },
      { row_id: row.id, column_id: colMap['email'], value: contact.contact_email_address || null, status: contact.enriched ? 'complete' : 'failed', source: 'bettercontact' },
      { row_id: row.id, column_id: colMap['email_status'], value: contact.contact_email_address_status || null, status: 'complete', source: 'bettercontact' },
      { row_id: row.id, column_id: colMap['phone'], value: contact.contact_phone_number || null, status: 'complete', source: 'bettercontact' },
      { row_id: row.id, column_id: colMap['job_title'], value: contact.contact_job_title || null, status: 'complete', source: 'bettercontact' },
      { row_id: row.id, column_id: colMap['gender'], value: contact.contact_gender || null, status: 'complete', source: 'bettercontact' },
      { row_id: row.id, column_id: colMap['email_provider'], value: contact.email_provider || null, status: 'complete', source: 'bettercontact' },
    ].filter(c => c.column_id); // Filter out any missing columns

    await serviceClient
      .from('dynamic_table_cells')
      .insert(cellData);
  }

  // Update tracking
  await serviceClient
    .from('bettercontact_requests')
    .update({
      status: 'terminated',
      table_id: table.id,
      processed_contacts: bcResult.data.length,
      credits_consumed: bcResult.credits_consumed || 0,
      completed_at: new Date().toISOString(),
    })
    .eq('bettercontact_request_id', request_id)
    .eq('organization_id', orgId);

  return new Response(JSON.stringify({
    status: 'terminated',
    table_id: table.id,
    table_name: tableName,
    row_count: bcResult.data.length,
    credits_consumed: bcResult.credits_consumed,
    summary: bcResult.summary,
  }), { status: 200, headers });
}
