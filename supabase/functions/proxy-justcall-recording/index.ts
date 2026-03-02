import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { legacyCorsHeaders as corsHeaders } from '../_shared/corsHelper.ts';
import { getJustCallAuthHeaders } from '../_shared/justcall.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Headers':
          'authorization, x-client-info, apikey, content-type, range',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
    });
  }

  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const url = new URL(req.url);
    const authHeader = req.headers.get('Authorization') || '';
    const tokenFromQuery = url.searchParams.get('token') || url.searchParams.get('access_token');

    if (!serviceKey) {
      return new Response(JSON.stringify({ error: 'Server not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const allowServiceRole = authHeader.trim() === `Bearer ${serviceKey}`;

    const sb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let userId: string | null = null;
    if (!allowServiceRole) {
      const token = authHeader
        ? authHeader.replace(/^Bearer\s+/i, '').trim()
        : (tokenFromQuery || '').trim();
      if (!token) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: userData, error: userErr } = await sb.auth.getUser(token);
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      userId = userData.user.id;
    }

    const callId = url.searchParams.get('call_id') || url.searchParams.get('id');
    if (!callId) {
      return new Response(JSON.stringify({ error: 'Missing call_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: callRow, error: callErr } = await sb
      .from('calls')
      .select('id, org_id, recording_url, recording_mime, has_recording')
      .eq('id', callId)
      .maybeSingle();

    if (callErr || !callRow) {
      return new Response(JSON.stringify({ error: 'Call not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!callRow.recording_url) {
      return new Response(JSON.stringify({ error: 'Recording not available' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!allowServiceRole) {
      const { data: membership } = await sb
        .from('organization_memberships')
        .select('user_id')
        .eq('org_id', callRow.org_id)
        .eq('user_id', userId!)
        .maybeSingle();

      if (!membership?.user_id) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const range = req.headers.get('Range');

    // Use org JustCall credentials for the recording request (some recording URLs require auth).
    const jcHeaders = await getJustCallAuthHeaders(sb, callRow.org_id);

    const upstreamHeaders: Record<string, string> = {
      ...jcHeaders,
      Accept: 'audio/*',
    };
    if (range) upstreamHeaders['Range'] = range;

    const upstream = await fetch(callRow.recording_url, {
      method: 'GET',
      headers: upstreamHeaders,
    });

    if (!upstream.ok && upstream.status !== 206) {
      const txt = await upstream.text().catch(() => '');
      return new Response(JSON.stringify({ error: `Failed to fetch recording (${upstream.status})`, details: txt }), {
        status: upstream.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const contentType =
      upstream.headers.get('content-type') ||
      callRow.recording_mime ||
      'audio/mpeg';

    const headers: HeadersInit = {
      ...corsHeaders,
      'Content-Type': contentType,
      'Accept-Ranges': upstream.headers.get('accept-ranges') || 'bytes',
      'Cache-Control': 'private, max-age=60',
    };

    const contentLength = upstream.headers.get('content-length');
    const contentRange = upstream.headers.get('content-range');
    if (contentLength) (headers as any)['Content-Length'] = contentLength;
    if (contentRange) (headers as any)['Content-Range'] = contentRange;

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || 'Proxy failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});













