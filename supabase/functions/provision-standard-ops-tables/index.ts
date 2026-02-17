/**
 * Edge Function: provision-standard-ops-tables
 *
 * Provisions the 5 standard ops tables (Leads, Meetings, All Contacts, All Companies, Deals)
 * for the authenticated user's organization.
 *
 * This is a one-time provisioning operation that creates:
 * - 5 standard dynamic tables with predefined schemas
 * - All system columns for each table
 * - Default system views for each table
 * - Marks the organization as provisioned
 *
 * Idempotent - can be called multiple times safely.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  const corsHeaders = getCorsHeaders(req);

  try {
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
    // Note: organization_memberships only has org_id, user_id, role, created_at, updated_at
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

    // Call provisioning RPC for main 4 tables
    const { data, error: rpcError } = await serviceClient.rpc('provision_standard_ops_tables', {
      p_org_id: membership.org_id,
      p_user_id: user.id
    });

    if (rpcError) {
      throw new Error(`RPC error: ${rpcError.message}`);
    }

    // Also provision the Deals standard table (separate function for modularity)
    const { data: dealsResult, error: dealsError } = await serviceClient.rpc('provision_deals_ops_table', {
      p_org_id: membership.org_id,
      p_user_id: user.id
    });

    if (dealsError) {
      console.error('Failed to provision Deals ops table:', dealsError.message);
      // Don't fail the whole operation — Deals table is additive
    }

    // Provision Waitlist Signups table for the platform org only
    let waitlistResult = null;
    let waitlistError = null;
    try {
      const { data: org } = await serviceClient
        .from('organizations')
        .select('name')
        .eq('id', membership.org_id)
        .maybeSingle();

      if (org?.name?.toLowerCase().includes('sixty')) {
        const { data: wlResult, error: wlError } = await serviceClient.rpc('provision_waitlist_ops_table', {
          p_org_id: membership.org_id,
          p_user_id: user.id
        });
        waitlistResult = wlResult;
        if (wlError) {
          waitlistError = wlError;
          console.error('Failed to provision Waitlist ops table:', wlError.message);
        }
      }
    } catch (err) {
      console.error('Waitlist provisioning check failed:', err);
      // Non-blocking — don't fail the whole request
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          ...data,
          deals: dealsResult || { error: dealsError?.message },
          ...(waitlistResult ? { waitlist: waitlistResult } : {}),
          ...(waitlistError ? { waitlist: { error: waitlistError.message } } : {})
        }
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
