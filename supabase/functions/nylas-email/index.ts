import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { authenticateRequest } from '../_shared/edgeAuth.ts';
import { getNylasIntegration, nylasRequest, mapNylasMessageToGmail } from '../_shared/nylasClient.ts';

/**
 * Nylas Email Edge Function
 *
 * Provides email read and draft operations via Nylas API v3.
 * Used by paid Google users who connect Gmail through Nylas.
 * Response shapes match google-gmail for frontend compatibility.
 *
 * Actions: list, get, draft
 */

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const requestBody = await req.json();
    const action = requestBody.action;

    if (!action) {
      throw new Error('action is required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { userId } = await authenticateRequest(req, supabase, supabaseServiceKey, requestBody.userId);

    // Get Nylas integration
    const nylasInt = await getNylasIntegration(supabase, userId);
    if (!nylasInt) {
      throw new Error('Nylas integration not found. Please connect Gmail via Nylas first.');
    }

    let response;

    switch (action) {
      case 'list': {
        const params: Record<string, string> = {};
        if (requestBody.maxResults) params.limit = String(requestBody.maxResults);
        if (requestBody.pageToken) params.page_token = requestBody.pageToken;
        if (requestBody.q) params.search_query_native = requestBody.q;
        if (requestBody.labelIds) params.in = requestBody.labelIds;

        const res = await nylasRequest(nylasInt.grantId, '/messages', { params });
        const data = await res.json();

        // Map Nylas response to google-gmail compatible shape
        response = {
          messages: (data.data || []).map(mapNylasMessageToGmail),
          nextPageToken: data.next_cursor || null,
          resultSizeEstimate: data.data?.length || 0,
        };
        break;
      }

      case 'get':
      case 'get-message': {
        const messageId = requestBody.messageId;
        if (!messageId) throw new Error('messageId is required');

        const res = await nylasRequest(nylasInt.grantId, `/messages/${encodeURIComponent(messageId)}`);
        const data = await res.json();

        response = mapNylasMessageToGmail(data.data);
        break;
      }

      case 'draft': {
        const draftBody: Record<string, unknown> = {
          subject: requestBody.subject || '',
          body: requestBody.body || '',
          to: (requestBody.to || '').split(',').map((email: string) => ({
            email: email.trim(),
          })),
        };

        if (requestBody.threadId) {
          draftBody.thread_id = requestBody.threadId;
        }

        const res = await nylasRequest(nylasInt.grantId, '/drafts', {
          method: 'POST',
          body: draftBody,
        });
        const data = await res.json();

        response = {
          id: data.data?.id,
          message: { id: data.data?.id },
          threadId: data.data?.thread_id,
        };
        break;
      }

      default:
        throw new Error(`Unsupported action: ${action}. Nylas email supports: list, get, draft.`);
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const status = error.statusCode || 400;
    console.error('[nylas-email] Error:', error.message || error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// mapNylasMessageToGmail is imported from _shared/nylasClient.ts
