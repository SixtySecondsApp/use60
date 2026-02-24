/**
 * Edge Function: provision-standard-ops-tables
 *
 * Provisions standard ops tables for the authenticated user's organization.
 *
 * Accepts optional `table_keys` in the request body to provision specific tables:
 *   - No body / empty table_keys: provisions all tables
 *   - table_keys: ['standard_deals'] — provisions only Deals
 *   - table_keys: ['standard_waitlist'] — provisions only Waitlist Signups
 *   - table_keys: ['standard_leads', ...] — provisions main 4 (Leads, Meetings, Contacts, Companies)
 *
 * Idempotent - can be called multiple times safely.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

// Keys handled by provision_standard_ops_tables RPC (main 4)
const MAIN_TABLE_KEYS = new Set([
  'standard_leads',
  'standard_meetings',
  'standard_all_contacts',
  'standard_all_companies',
  'standard_clients',
]);

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    // Parse optional body
    let tableKeys: string[] | null = null;
    try {
      const body = await req.json();
      if (Array.isArray(body?.table_keys) && body.table_keys.length > 0) {
        tableKeys = body.table_keys;
      }
    } catch {
      // No body or invalid JSON — provision all
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Create user-scoped Supabase client for authentication
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: { Authorization: authHeader }
        }
      }
    );

    // Authenticate user — pass token directly (global headers don't apply to auth calls)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', detail: authError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role client for provisioning RPC and org lookup
    // Service role is required because the RPC creates records across multiple tables
    // with SECURITY DEFINER and needs to bypass RLS policies
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get user's organization (service role bypasses RLS on organization_memberships)
    const { data: membership, error: membershipError } = await serviceClient
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (membershipError) {
      throw new Error(`Failed to fetch organization membership: ${membershipError.message}`);
    }

    if (!membership?.org_id) {
      return new Response(
        JSON.stringify({ error: 'No organization found for user' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const orgId = membership.org_id;
    const userId = user.id;

    // Determine which RPCs to call based on table_keys
    const provisionAll = !tableKeys;
    const needsMain = provisionAll || tableKeys!.some((k) => MAIN_TABLE_KEYS.has(k));
    const needsDeals = provisionAll || tableKeys!.includes('standard_deals');
    const needsWaitlist = provisionAll || tableKeys!.includes('standard_waitlist');

    const results: Record<string, unknown> = {};
    const errors: Record<string, string> = {};

    // 1. Main 4 tables (Leads, Meetings, All Contacts, All Companies, Clients)
    if (needsMain) {
      const { data, error } = await serviceClient.rpc('provision_standard_ops_tables', {
        p_org_id: orgId,
        p_user_id: userId,
      });
      if (error) {
        console.error('Failed to provision main tables:', error.message);
        errors.main = error.message;
      } else {
        results.main = data;
      }
    }

    // 2. Deals table
    if (needsDeals) {
      const { data, error } = await serviceClient.rpc('provision_deals_ops_table', {
        p_org_id: orgId,
        p_user_id: userId,
      });
      if (error) {
        console.error('Failed to provision Deals ops table:', error.message);
        errors.deals = error.message;
      } else {
        results.deals = data;
      }
    }

    // 3. Waitlist Signups table (platform org only)
    if (needsWaitlist) {
      try {
        const { data: org } = await serviceClient
          .from('organizations')
          .select('name')
          .eq('id', orgId)
          .maybeSingle();

        if (org?.name?.toLowerCase().includes('sixty')) {
          const { data, error } = await serviceClient.rpc('provision_waitlist_ops_table', {
            p_org_id: orgId,
            p_user_id: userId,
          });
          if (error) {
            console.error('Failed to provision Waitlist ops table:', error.message);
            errors.waitlist = error.message;
          } else {
            results.waitlist = data;
          }
        } else {
          results.waitlist = { status: 'skipped', reason: 'not_platform_org' };
        }
      } catch (err) {
        console.error('Waitlist provisioning check failed:', err);
        errors.waitlist = err instanceof Error ? err.message : 'Unknown error';
      }
    }

    // If every requested RPC failed, return 500
    const hasAnySuccess = Object.keys(results).length > 0;
    const hasErrors = Object.keys(errors).length > 0;

    if (!hasAnySuccess && hasErrors) {
      return new Response(
        JSON.stringify({ success: false, errors }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: results,
        ...(hasErrors ? { errors } : {}),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error provisioning standard ops tables:', error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
