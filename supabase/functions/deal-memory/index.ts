/**
 * deal-memory edge function (MEM-007)
 *
 * RPC wrapper around the deal memory tables.
 *
 * POST /events   — paginated deal memory events (with optional category filter)
 * POST /snapshot — latest snapshot (narrative + key_facts)
 * POST /contact  — contact memory profile + cross-deal events
 * POST /flag     — flag an event as incorrect (soft-marks flagged_by_user = true)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return respond({ error: 'Unauthorized' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return respond({ error: 'Unauthorized' }, 401);

    const db = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Resolve org
    const { data: membership } = await db
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    const orgId = membership?.org_id;
    if (!orgId) return respond({ error: 'No organization found' }, 403);

    // Route
    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();
    const body = await req.json().catch(() => ({}));

    // ── GET EVENTS ──────────────────────────────────────────────────────────
    if (path === 'events') {
      const { deal_id, categories, limit = 50, offset = 0 } = body as {
        deal_id: string;
        categories?: string[];
        limit?: number;
        offset?: number;
      };

      if (!deal_id) return respond({ error: 'deal_id required' }, 400);

      let query = db
        .from('deal_memory_events')
        .select(
          'id, event_type, event_category, source_type, source_timestamp, summary, detail, verbatim_quote, speaker, confidence, salience, contact_ids, is_active',
          { count: 'exact' },
        )
        .eq('org_id', orgId)
        .eq('deal_id', deal_id)
        .eq('is_active', true)
        .order('source_timestamp', { ascending: false })
        .range(offset, offset + limit - 1);

      if (categories?.length) {
        query = query.in('event_category', categories);
      }

      const { data, error, count } = await query;
      if (error) return respond({ error: error.message }, 500);
      return respond({ events: data ?? [], total: count ?? 0 });
    }

    // ── GET SNAPSHOT ────────────────────────────────────────────────────────
    if (path === 'snapshot') {
      const { deal_id } = body as { deal_id: string };
      if (!deal_id) return respond({ error: 'deal_id required' }, 400);

      const { data, error } = await db
        .from('deal_memory_snapshots')
        .select(
          'id, narrative, key_facts, stakeholder_map, risk_assessment, sentiment_trajectory, open_commitments, event_count, created_at',
        )
        .eq('org_id', orgId)
        .eq('deal_id', deal_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) return respond({ error: error.message }, 500);
      return respond({ snapshot: data });
    }

    // ── GET CONTACT MEMORY ──────────────────────────────────────────────────
    if (path === 'contact') {
      const { contact_id, limit = 30 } = body as { contact_id: string; limit?: number };
      if (!contact_id) return respond({ error: 'contact_id required' }, 400);

      const [eventsRes, profileRes] = await Promise.all([
        db
          .from('deal_memory_events')
          .select('id, event_type, event_category, source_timestamp, summary, detail, salience, deal_id')
          .eq('org_id', orgId)
          .eq('is_active', true)
          .contains('contact_ids', [contact_id])
          .order('source_timestamp', { ascending: false })
          .limit(limit),
        db
          .from('contact_memory')
          .select(
            'id, communication_style, decision_style, interests, relationship_strength, last_interaction_at, summary',
          )
          .eq('org_id', orgId)
          .eq('contact_id', contact_id)
          .maybeSingle(),
      ]);

      return respond({
        events: eventsRes.data ?? [],
        profile: profileRes.data ?? null,
      });
    }

    // ── FLAG EVENT ──────────────────────────────────────────────────────────
    if (path === 'flag') {
      const { event_id } = body as { event_id: string; reason?: string };
      if (!event_id) return respond({ error: 'event_id required' }, 400);

      // Verify the event belongs to this org before updating
      const { data: existing } = await db
        .from('deal_memory_events')
        .select('id')
        .eq('id', event_id)
        .eq('org_id', orgId)
        .maybeSingle();

      if (!existing) return respond({ error: 'Event not found' }, 404);

      // Soft-delete: mark inactive so the AI no longer uses it
      const { error } = await db
        .from('deal_memory_events')
        .update({ is_active: false })
        .eq('id', event_id)
        .eq('org_id', orgId);

      if (error) return respond({ error: error.message }, 500);
      return respond({ success: true });
    }

    return respond({ error: 'Unknown action' }, 404);
  } catch (err) {
    console.error('[deal-memory]', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
