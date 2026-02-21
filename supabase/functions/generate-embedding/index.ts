/**
 * Generate Embedding Edge Function
 *
 * Thin wrapper around OpenAI's text-embedding-3-small API.
 * Used by the frontend embeddingService for runtime query embedding.
 *
 * POST /generate-embedding
 * Body: { text: string }
 * Returns: { embedding: number[] }
 *
 * Required secrets: OPENAI_API_KEY
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { logFlatRateCostEvent, checkCreditBalance } from '../_shared/costTracking.ts';

serve(async (req: Request) => {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  const cors = getCorsHeaders(req);

  try {
    // Auth: validate JWT to get user/org context for credit tracking
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    let orgId: string | null = null;

    if (authHeader) {
      try {
        const anonClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_ANON_KEY') ?? '',
          { global: { headers: { Authorization: authHeader } } }
        );
        const { data: { user } } = await anonClient.auth.getUser();
        if (user) {
          userId = user.id;
          const { data: membership } = await anonClient
            .from('organization_memberships')
            .select('org_id')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle();
          orgId = membership?.org_id ?? null;
        }
      } catch {
        // Non-fatal — credit tracking is best-effort
      }
    }

    const { text } = await req.json();

    if (!text || typeof text !== 'string') {
      return new Response(
        JSON.stringify({ error: 'text is required' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'OPENAI_API_KEY not configured' }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // Check credit balance before calling OpenAI
    if (userId && orgId) {
      const serviceClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      const creditCheck = await checkCreditBalance(serviceClient, orgId);
      if (!creditCheck.allowed) {
        return new Response(
          JSON.stringify({ error: 'Insufficient credits', message: creditCheck.message }),
          { status: 402, headers: { ...cors, 'Content-Type': 'application/json' } }
        );
      }
    }

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
        dimensions: 1536,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[generate-embedding] OpenAI error:', errorBody);
      return new Response(
        JSON.stringify({ error: `OpenAI API error: ${response.status}` }),
        { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const embedding = data.data[0].embedding;

    // Log flat-rate cost event for embedding generation
    if (userId && orgId) {
      const serviceClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      logFlatRateCostEvent(serviceClient, userId, orgId, 'openai', 'text-embedding-3-small', 0.1, 'task_execution').catch(() => {});
    }

    return new Response(
      JSON.stringify({ embedding }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[generate-embedding] Error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }
});
