import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { legacyCorsHeaders as corsHeaders } from '../_shared/corsHelper.ts';
import { requireOrgRole, getUserOrgId } from '../_shared/edgeAuth.ts';
import { getJustCallAuthHeaders } from '../_shared/justcall.ts';

type Body = {
  org_id?: string;
  call_sid?: string; // e.g. CA2bbf...
  from_datetime?: string; // YYYY-MM-DD HH:MM:SS (UTC)
  to_datetime?: string; // YYYY-MM-DD HH:MM:SS (UTC)
  max_pages?: number;
};

function formatJustCallDateTimeUTC(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

async function fetchPaged(args: {
  url: string;
  headers: Record<string, string>;
  maxPages: number;
  limit: number;
}): Promise<any[]> {
  const items: any[] = [];
  let pageUrl: string | null = args.url;
  let pages = 0;

  while (pageUrl && pages < args.maxPages && items.length < args.limit) {
    pages++;
    const resp = await fetch(pageUrl, { headers: args.headers });
    const text = await resp.text().catch(() => '');
    if (!resp.ok) throw new Error(`Fetch failed (${resp.status}): ${text}`);
    let json: any = {};
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
    const list: any[] =
      (Array.isArray(json?.calls) && json.calls) ||
      (Array.isArray(json?.data) && json.data) ||
      (Array.isArray(json?.items) && json.items) ||
      [];
    for (const it of list) {
      items.push(it);
      if (items.length >= args.limit) break;
    }
    pageUrl =
      (typeof json?.next_page_link === 'string' && json.next_page_link) ||
      (typeof json?.next === 'string' && json.next) ||
      null;
  }

  return items;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\\s+/i, '').trim();
    if (!token) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = userData.user.id;

    const body: Body = await req.json().catch(() => ({} as any));
    let orgId: string | null = typeof body.org_id === 'string' ? body.org_id : null;
    if (!orgId) orgId = await getUserOrgId(sb, userId);
    if (!orgId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing org_id' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    try {
      await requireOrgRole(sb, orgId, userId, ['owner', 'admin']);
    } catch (e) {
      return new Response(
        JSON.stringify({ success: false, error: e?.message || 'Unauthorized: insufficient permissions', org_id: orgId }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const callSid = typeof body.call_sid === 'string' ? body.call_sid.trim() : '';
    if (!callSid) {
      return new Response(JSON.stringify({ success: false, error: 'call_sid is required' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiBase = (Deno.env.get('JUSTCALL_API_BASE_URL') || 'https://api.justcall.io').replace(/\/$/, '');
    const headers = await getJustCallAuthHeaders(sb, orgId);

    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const fromDt = (typeof body.from_datetime === 'string' && body.from_datetime.trim()) || formatJustCallDateTimeUTC(defaultFrom);
    const toDt = (typeof body.to_datetime === 'string' && body.to_datetime.trim()) || formatJustCallDateTimeUTC(now);
    const maxPages = Math.min(Math.max(Number(body.max_pages ?? 10), 1), 50);

    // 1) Regular calls list (v2.1)
    const q = new URLSearchParams({
      per_page: '100',
      page: '1',
      from_datetime: fromDt,
      to_datetime: toDt,
    });
    const v21Url = `${apiBase}/v2.1/calls?${q.toString().replace(/\+/g, '%20')}`;
    const v21Items = await fetchPaged({ url: v21Url, headers, maxPages, limit: 2000 });
    const v21Matches = v21Items.filter((c) => String(c?.call_sid ?? c?.callSid ?? c?.sid ?? '').trim() === callSid);

    // 2) Sales Dialer list (v1)
    const start_date = fromDt.split(' ')[0] || fromDt;
    const end_date = toDt.split(' ')[0] || toDt;
    const sdUrl = `${apiBase}/v1/autodialer/calls/list`;
    // We can't use fetchPaged for this POST endpoint, so do a small loop here.
    const sdMatches: any[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const resp = await fetch(sdUrl, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ start_date, end_date, page, per_page: 100, order: 1 }),
      });
      const text = await resp.text().catch(() => '');
      if (!resp.ok) break;
      let json: any = {};
      try {
        json = JSON.parse(text);
      } catch {
        json = {};
      }
      const list: any[] = Array.isArray(json?.data) ? json.data : [];
      for (const it of list) {
        const sid = String(it?.call_sid ?? it?.callSid ?? it?.sid ?? '').trim();
        if (sid === callSid) sdMatches.push(it);
      }
      if (list.length < 100) break;
      if (sdMatches.length) break;
    }

    return new Response(
      JSON.stringify({
        success: true,
        org_id: orgId,
        call_sid: callSid,
        from_datetime: fromDt,
        to_datetime: toDt,
        v21_scanned: v21Items.length,
        v21_matches: v21Matches.slice(0, 5),
        sales_dialer_matches: sdMatches.slice(0, 5),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    // Debug helper: return 200 so clients can display a useful payload instead of a generic "non-2xx" error.
    return new Response(JSON.stringify({ success: false, error: e?.message || 'Search failed' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});













