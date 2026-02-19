import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders } from '../_shared/corsHelper.ts';

const WELCOME_CREDITS = 10;
const WELCOME_DESCRIPTION = 'Welcome — 10 free AI credits';

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Validate JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2. Create user-scoped client (respects RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // 3. Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 4. Parse request body
    const { org_id } = await req.json();
    if (!org_id) {
      return new Response(JSON.stringify({ error: 'org_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 5. Verify caller is a member of the org
    const { data: membership, error: memberError } = await supabase
      .from('organization_memberships')
      .select('id')
      .eq('org_id', org_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (memberError || !membership) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 6. Idempotency check — has this org already received welcome credits?
    const { data: existingTx } = await supabase
      .from('credit_transactions')
      .select('id')
      .eq('org_id', org_id)
      .ilike('description', '%Welcome%')
      .limit(1)
      .maybeSingle();

    if (existingTx) {
      return new Response(JSON.stringify({ success: true, already_granted: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 7. Grant credits via RPC
    const { error: rpcError } = await supabase.rpc('add_credits', {
      p_org_id: org_id,
      p_amount: WELCOME_CREDITS,
      p_type: 'bonus',
      p_description: WELCOME_DESCRIPTION,
    });

    if (rpcError) {
      console.error('[grant-welcome-credits] RPC error:', rpcError);
      return new Response(JSON.stringify({ error: 'Failed to grant credits' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true, already_granted: false }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[grant-welcome-credits] Error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
