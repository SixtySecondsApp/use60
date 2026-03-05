import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { legacyCorsHeaders as corsHeaders } from '../_shared/corsHelper.ts';
import { getJustCallAuthHeaders } from '../_shared/justcall.ts';
import { requireOrgRole, getUserOrgId } from '../_shared/edgeAuth.ts';

type SyncType = 'manual' | 'incremental' | 'webhook' | 'all_time';

type SyncRequest = {
  sync_type?: SyncType;
  org_id?: string;
  limit?: number;
  max_pages?: number;
  process_transcript_queue?: boolean;
  from_datetime?: string; // optional override (YYYY-MM-DD HH:MM:SS)
  to_datetime?: string;   // optional override (YYYY-MM-DD HH:MM:SS)
};

function parseListResponse(json: any): { items: any[]; next: string | null } {
  const items: any[] =
    (Array.isArray(json?.data) && json.data) ||
    (Array.isArray(json?.calls) && json.calls) ||
    (Array.isArray(json?.items) && json.items) ||
    (Array.isArray(json) && json) ||
    [];

  const next =
    (typeof json?.next_page_link === 'string' && json.next_page_link) ||
    (typeof json?.next === 'string' && json.next) ||
    (typeof json?.links?.next === 'string' && json.links.next) ||
    null;

  return { items, next };
}

function toIsoOrNull(v: any): string | null {
  if (v == null) return null;
  const d = new Date(v);
  const t = d.getTime();
  if (!Number.isFinite(t)) return null;
  return d.toISOString();
}

function formatJustCallDateTimeUTC(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function mapCall(call: any): {
  external_id: string;
  direction: 'inbound' | 'outbound' | 'internal' | 'unknown';
  status: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  from_number: string | null;
  to_number: string | null;
  agent_email: string | null;
  justcall_agent_id: string | null;
  recording_url: string | null;
  recording_mime: string | null;
} {
  const external_id = String(call?.id ?? call?.call_id ?? call?.sid ?? call?.uuid);
  const rawDir = String(call?.direction ?? call?.call_direction ?? '').toLowerCase();
  const direction =
    rawDir.includes('in') ? 'inbound' : rawDir.includes('out') ? 'outbound' : rawDir.includes('internal') ? 'internal' : 'unknown';

  const durationSecondsRaw = call?.duration ?? call?.duration_seconds ?? null;
  const duration_seconds =
    durationSecondsRaw == null ? null : Number.isFinite(Number(durationSecondsRaw)) ? Math.max(0, Math.floor(Number(durationSecondsRaw))) : null;

  const recording_url = call?.recording_url ?? call?.recording ?? call?.recording_link ?? null;

  return {
    external_id,
    direction,
    status: call?.status ? String(call.status) : null,
    // "time" appears in Sales Dialer payloads
    started_at: toIsoOrNull(call?.start_time ?? call?.started_at ?? call?.startedAt ?? call?.time),
    ended_at: toIsoOrNull(call?.end_time ?? call?.ended_at ?? call?.endedAt),
    duration_seconds,
    from_number: call?.from ? String(call.from) : call?.from_number ? String(call.from_number) : null,
    to_number: call?.to ? String(call.to) : call?.to_number ? String(call.to_number) : null,
    agent_email: call?.agent_email ? String(call.agent_email) : call?.user_email ? String(call.user_email) : null,
    justcall_agent_id: call?.agent_id ? String(call.agent_id) : null,
    recording_url: recording_url != null ? String(recording_url) : null,
    recording_mime: call?.recording_mime ? String(call.recording_mime) : null,
  };
}

async function fetchJustCallCalls(args: {
  apiBase: string;
  headers: Record<string, string>;
  fromDt: string;
  toDt: string;
  limit: number;
  maxPages: number;
}): Promise<{ calls: any[]; pages: number }> {
  // NOTE: Do NOT force platform=1 here.
  // Some accounts primarily use Sales Dialer; those calls may be excluded by platform filters.
  // We rely on provider mapping on our side instead.
  const qs = new URLSearchParams();
  qs.set('per_page', '100');
  qs.set('page', '1');
  qs.set('from_datetime', args.fromDt);
  qs.set('to_datetime', args.toDt);

  // URLSearchParams encodes spaces as '+'; some APIs are picky. Replace with '%20'.
  const query = qs.toString().replace(/\+/g, '%20');
  let pageUrl: string | null = `${args.apiBase}/v2.1/calls?${query}`;
  const calls: any[] = [];
  let pages = 0;

  while (pageUrl && pages < args.maxPages && calls.length < args.limit) {
    pages++;
    const resp = await fetch(pageUrl, { headers: args.headers });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`JustCall calls fetch failed (${resp.status}): ${txt}`);
    }
    const json = await resp.json().catch(() => ({} as any));
    const { items, next } = parseListResponse(json);
    for (const item of items) {
      calls.push(item);
      if (calls.length >= args.limit) break;
    }
    pageUrl = next;
  }

  return { calls, pages };
}

async function fetchSalesDialerCalls(args: {
  apiBase: string;
  headers: Record<string, string>;
  fromDt: string;
  toDt: string;
  limit: number;
  maxPages: number;
}): Promise<{ calls: any[]; pages: number; error: { status: number; body: string } | null }> {
  // Sales Dialer uses a separate endpoint (v1) and returns data[].
  const endpoint = `${args.apiBase}/v1/autodialer/calls/list`;
  const calls: any[] = [];
  let pages = 0;
  let err: { status: number; body: string } | null = null;

  // Convert "YYYY-MM-DD HH:MM:SS" -> "YYYY-MM-DD"
  const start_date = args.fromDt.split(' ')[0] || args.fromDt;
  const end_date = args.toDt.split(' ')[0] || args.toDt;

  for (let page = 1; page <= args.maxPages && calls.length < args.limit; page++) {
    pages++;
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { ...args.headers, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        start_date,
        end_date,
        page,
        per_page: 100,
        order: 1, // desc
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      err = { status: resp.status, body: txt };
      // Don't throw: return diagnostics so the UI can instruct the user.
      return { calls: [], pages, error: err };
    }

    const json = await resp.json().catch(() => ({} as any));
    // Sales Dialer sometimes returns 200 with a failure payload.
    if (typeof json?.status === 'string' && json.status.toLowerCase() !== 'success') {
      const msg = typeof json?.message === 'string' ? json.message : JSON.stringify(json);
      err = { status: 200, body: msg };
      return { calls: [], pages, error: err };
    }
    const items: any[] = Array.isArray(json?.data) ? json.data : [];
    for (const item of items) {
      calls.push(item);
      if (calls.length >= args.limit) break;
    }

    if (items.length < 100) break;
  }

  return { calls, pages, error: err };
}

// Single-call version for backwards compatibility
async function resolveOwnerUserId(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  agentEmail: string | null
): Promise<{ owner_user_id: string | null; owner_email: string | null }> {
  if (!agentEmail) return { owner_user_id: null, owner_email: null };

  // Ensure the user belongs to the org (team-wide visibility, but ownership should map within org)
  const { data: profile } = await supabase.from('profiles').select('id, email').eq('email', agentEmail).maybeSingle();
  if (!profile?.id) return { owner_user_id: null, owner_email: agentEmail };

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('user_id')
    .eq('org_id', orgId)
    .eq('user_id', profile.id)
    .maybeSingle();

  if (!membership?.user_id) return { owner_user_id: null, owner_email: agentEmail };
  return { owner_user_id: profile.id, owner_email: profile.email || agentEmail };
}

// Batch version - pre-loads all owner mappings in 2 queries instead of 2*N
async function batchResolveOwnerUserIds(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  agentEmails: (string | null)[]
): Promise<Map<string, { owner_user_id: string | null; owner_email: string | null }>> {
  const result = new Map<string, { owner_user_id: string | null; owner_email: string | null }>();

  // Filter out nulls and get unique emails
  const uniqueEmails = [...new Set(agentEmails.filter((e): e is string => !!e))];
  if (uniqueEmails.length === 0) return result;

  // Batch query 1: Get all profiles by email
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email')
    .in('email', uniqueEmails);

  if (!profiles || profiles.length === 0) {
    // No profiles found - return emails without user IDs
    for (const email of uniqueEmails) {
      result.set(email, { owner_user_id: null, owner_email: email });
    }
    return result;
  }

  const profilesByEmail = new Map(profiles.map((p) => [p.email, p]));
  const profileUserIds = profiles.map((p) => p.id);

  // Batch query 2: Get all org memberships for these users
  const { data: memberships } = await supabase
    .from('organization_memberships')
    .select('user_id')
    .eq('org_id', orgId)
    .in('user_id', profileUserIds);

  const memberUserIds = new Set(memberships?.map((m) => m.user_id) ?? []);

  // Build the result map
  for (const email of uniqueEmails) {
    const profile = profilesByEmail.get(email);
    if (!profile) {
      result.set(email, { owner_user_id: null, owner_email: email });
    } else if (!memberUserIds.has(profile.id)) {
      result.set(email, { owner_user_id: null, owner_email: email });
    } else {
      result.set(email, { owner_user_id: profile.id, owner_email: profile.email || email });
    }
  }

  return result;
}

async function ensureCommunicationEvent(
  supabase: ReturnType<typeof createClient>,
  args: {
    userId: string;
    orgId: string;
    callExternalId: string;
    direction: 'inbound' | 'outbound' | 'unknown' | 'internal';
    whenIso: string | null;
    fromNumber: string | null;
    toNumber: string | null;
    durationSeconds: number | null;
    hasRecording: boolean;
  }
): Promise<void> {
  const eventType = args.direction === 'inbound' ? 'call_received' : 'call_made';
  const direction = args.direction === 'inbound' ? 'inbound' : 'outbound';

  // Dedupe: if we already logged this external call for this user, skip
  const { data: existing } = await supabase
    .from('communication_events')
    .select('id')
    .eq('user_id', args.userId)
    .eq('external_id', args.callExternalId)
    .eq('external_source', 'justcall')
    .limit(1)
    .maybeSingle();

  if (existing?.id) return;

  await supabase.from('communication_events').insert({
    user_id: args.userId,
    event_type: eventType,
    direction,
    subject: null,
    body: null,
    snippet: null,
    external_id: args.callExternalId,
    external_source: 'justcall',
    metadata: {
      org_id: args.orgId,
      from_number: args.fromNumber,
      to_number: args.toNumber,
      duration_seconds: args.durationSeconds,
      has_recording: args.hasRecording,
    },
    event_timestamp: args.whenIso || new Date().toISOString(),
  });
}

async function ensureOutboundCallActivity(
  supabase: ReturnType<typeof createClient>,
  args: {
    userId: string;
    originalActivityId: string;
    whenIso: string | null;
    fromNumber: string | null;
    toNumber: string | null;
    durationSeconds: number | null;
    externalId: string;
    provider: string;
    salesRep: string;
  }
): Promise<void> {
  // Dedupe: one outbound activity per call row
  const { data: existing } = await supabase
    .from('activities')
    .select('id')
    .eq('user_id', args.userId)
    .eq('type', 'outbound')
    .eq('outbound_type', 'call')
    .eq('original_activity_id', args.originalActivityId)
    .limit(1)
    .maybeSingle();

  if (existing?.id) return;

  const clientName = args.toNumber || args.fromNumber || 'Unknown';
  const detailsParts = [
    `Call (${args.provider})`,
    args.fromNumber && args.toNumber ? `${args.fromNumber} → ${args.toNumber}` : null,
    typeof args.durationSeconds === 'number' ? `duration=${args.durationSeconds}s` : null,
    `external_id=${args.externalId}`,
  ].filter(Boolean);

  await supabase.from('activities').insert({
    user_id: args.userId,
    type: 'outbound',
    status: 'completed',
    priority: 'medium',
    client_name: clientName,
    sales_rep: args.salesRep,
    details: detailsParts.join(' • '),
    date: args.whenIso || new Date().toISOString(),
    quantity: 1,
    outbound_type: 'call',
    contact_identifier: args.toNumber || args.fromNumber || null,
    contact_identifier_type: 'phone',
    original_activity_id: args.originalActivityId,
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const allowServiceRole = serviceKey && authHeader.trim() === `Bearer ${serviceKey}`;

    let userId: string | null = null;
    const body: SyncRequest = await req.json().catch(() => ({} as any));

    if (!allowServiceRole) {
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const { data: userData, error: userErr } = await sb.auth.getUser(token);
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      userId = userData.user.id;
    }

    // Resolve org
    let orgId: string | null = typeof body.org_id === 'string' ? body.org_id : null;
    if (!orgId && userId) {
      orgId = await getUserOrgId(sb, userId);
    }
    if (!orgId) {
      return new Response(JSON.stringify({ error: 'Missing org_id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Only org admins can run sync from the client
    if (userId) {
      await requireOrgRole(sb, orgId, userId, ['owner', 'admin']);
    }

    const syncType: SyncType = body.sync_type || 'manual';
    const limit = Math.min(Math.max(Number(body.limit ?? 200), 1), 2000);
    const maxPages = Math.min(Math.max(Number(body.max_pages ?? 10), 1), 50);
    const processTranscriptQueue = body.process_transcript_queue !== false;

    // Ensure active integration exists
    const { data: integration } = await sb
      .from('justcall_integrations')
      .select('id, org_id, auth_type, is_active, connected_by_user_id, last_sync_at')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .maybeSingle();

    if (!integration) {
      return new Response(JSON.stringify({ error: 'JustCall integration not connected for this org' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch calls from JustCall
    const headers = await getJustCallAuthHeaders(sb, orgId);

    const apiBase = (Deno.env.get('JUSTCALL_API_BASE_URL') || 'https://api.justcall.io').replace(/\/$/, '');

    // JustCall supports filtering by datetime range. Default to a 30-day lookback so
    // orgs with no very-recent calls still import successfully (common during initial setup).
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Incremental sync: if we have last_sync_at, start slightly earlier for overlap.
    const lastSync = integration?.last_sync_at ? new Date(integration.last_sync_at) : null;
    const incrementalFrom = lastSync ? new Date(lastSync.getTime() - 24 * 60 * 60 * 1000) : null;

    const fromOverride = typeof body.from_datetime === 'string' ? body.from_datetime.trim() : '';
    const toOverride = typeof body.to_datetime === 'string' ? body.to_datetime.trim() : '';

    const fromDt =
      fromOverride ||
      (syncType === 'incremental' && incrementalFrom ? formatJustCallDateTimeUTC(incrementalFrom) : formatJustCallDateTimeUTC(defaultFrom));
    const toDt = toOverride || formatJustCallDateTimeUTC(now);

    const { calls: justcallCalls, pages: justcallPages } = await fetchJustCallCalls({
      apiBase,
      headers,
      fromDt,
      toDt,
      limit,
      maxPages,
    });

    const {
      calls: salesDialerCalls,
      pages: salesDialerPages,
      error: salesDialerError,
    } = await fetchSalesDialerCalls({
      apiBase,
      headers,
      fromDt,
      toDt,
      limit,
      maxPages,
    });

    const calls: any[] = [...justcallCalls, ...salesDialerCalls];
    const pages = justcallPages + salesDialerPages;

    let callsUpserted = 0;
    let eventsLogged = 0;
    let transcriptsQueued = 0;

    // OPTIMIZATION: Batch load all owner mappings in 2 queries instead of 2*N queries
    const mappedCalls = calls
      .map((c) => mapCall(c))
      .filter((m) => m.external_id && m.external_id !== 'undefined');
    const agentEmails = mappedCalls.map((m) => m.agent_email);
    const ownerMap = await batchResolveOwnerUserIds(sb, orgId, agentEmails);

    for (const mapped of mappedCalls) {
      // Use pre-loaded owner map instead of individual queries
      const owner = mapped.agent_email
        ? ownerMap.get(mapped.agent_email) ?? { owner_user_id: null, owner_email: mapped.agent_email }
        : { owner_user_id: null, owner_email: null };
      const hasRecording = Boolean(mapped.recording_url);

      const { data: callRow, error: upsertErr } = await sb
        .from('calls')
        .upsert(
          {
            org_id: orgId,
            provider: 'justcall',
            external_id: mapped.external_id,
            direction: mapped.direction,
            status: mapped.status,
            started_at: mapped.started_at,
            ended_at: mapped.ended_at,
            duration_seconds: mapped.duration_seconds,
            from_number: mapped.from_number,
            to_number: mapped.to_number,
            agent_email: mapped.agent_email,
            justcall_agent_id: mapped.justcall_agent_id,
            owner_user_id: owner.owner_user_id,
            owner_email: owner.owner_email,
            recording_url: mapped.recording_url,
            recording_mime: mapped.recording_mime,
            has_recording: hasRecording,
            transcript_status: hasRecording ? 'queued' : 'missing',
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'org_id,provider,external_id' }
        )
        .select('id, transcript_text')
        .single();

      if (upsertErr || !callRow) continue;
      callsUpserted++;

      // Queue transcript if missing and we have recording
      if (!callRow.transcript_text && hasRecording) {
        const { error: qErr } = await sb
          .from('call_transcript_queue')
          .upsert(
            {
              org_id: orgId,
              call_id: callRow.id,
              priority: 0,
              attempts: 0,
              error_message: null,
              last_attempt_at: null,
            },
            { onConflict: 'call_id' }
          );
        if (!qErr) transcriptsQueued++;
      }

      // Log comm event
      const effectiveUserId = owner.owner_user_id || integration.connected_by_user_id || userId;
      if (effectiveUserId) {
        await ensureCommunicationEvent(sb, {
          userId: effectiveUserId,
          orgId,
          callExternalId: mapped.external_id,
          direction: mapped.direction,
          whenIso: mapped.started_at,
          fromNumber: mapped.from_number,
          toNumber: mapped.to_number,
          durationSeconds: mapped.duration_seconds,
          hasRecording,
        });
        eventsLogged++;

        // Also log outbound calls as outbound activities (Sales Dialer best practice).
        if (mapped.direction === 'outbound') {
          await ensureOutboundCallActivity(sb, {
            userId: effectiveUserId,
            originalActivityId: callRow.id,
            whenIso: mapped.started_at,
            fromNumber: mapped.from_number,
            toNumber: mapped.to_number,
            durationSeconds: mapped.duration_seconds,
            externalId: mapped.external_id,
            provider: 'justcall',
            salesRep: owner.owner_email || mapped.agent_email || 'JustCall',
          });
        }
      }
    }

    let transcriptsFetched = 0;
    let transcriptsFailed = 0;

    if (processTranscriptQueue) {
      // Process transcript queue items (best-effort, limited per run)
      const { data: queueItems } = await sb
        .from('call_transcript_queue')
        .select('id, call_id, attempts, max_attempts')
        .eq('org_id', orgId)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(50);

      for (const qi of queueItems || []) {
        const { data: callRow } = await sb
          .from('calls')
          .select('id, external_id, transcript_text')
          .eq('id', qi.call_id)
          .maybeSingle();

        if (!callRow) continue;
        if (callRow.transcript_text && callRow.transcript_text.trim().length > 0) {
          await sb.from('call_transcript_queue').delete().eq('id', qi.id);
          continue;
        }

        if ((qi.attempts || 0) >= (qi.max_attempts || 10)) {
          transcriptsFailed++;
          continue;
        }

        try {
          const tUrl = `${apiBase}/v1/justcalliq/transcription`;
          const tResp = await fetch(tUrl, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: String(callRow.external_id), platform: 1 }),
          });

          const tText = await tResp.text();
          let tJson: any = null;
          try {
            tJson = JSON.parse(tText);
          } catch {
            tJson = { raw: tText };
          }

          if (!tResp.ok) {
            await sb
              .from('call_transcript_queue')
              .update({
                attempts: (qi.attempts || 0) + 1,
                last_attempt_at: new Date().toISOString(),
                error_message: `transcription_fetch_failed_${tResp.status}`,
              })
              .eq('id', qi.id);
            transcriptsFailed++;
            continue;
          }

          const transcriptText =
            (typeof tJson?.transcription === 'string' && tJson.transcription) ||
            (typeof tJson?.transcript === 'string' && tJson.transcript) ||
            (typeof tJson?.data?.transcription === 'string' && tJson.data.transcription) ||
            null;

          if (!transcriptText || transcriptText.trim().length < 20) {
            // Not ready yet, keep queued
            await sb
              .from('call_transcript_queue')
              .update({
                attempts: (qi.attempts || 0) + 1,
                last_attempt_at: new Date().toISOString(),
                error_message: 'transcript_not_ready',
              })
              .eq('id', qi.id);
            continue;
          }

          await sb
            .from('calls')
            .update({
              transcript_text: transcriptText,
              transcript_json: tJson,
              transcript_status: 'ready',
              transcript_fetch_attempts: (qi.attempts || 0) + 1,
              last_transcript_fetch_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', callRow.id);

          await sb.from('call_transcript_queue').delete().eq('id', qi.id);
          transcriptsFetched++;
        } catch (e) {
          await sb
            .from('call_transcript_queue')
            .update({
              attempts: (qi.attempts || 0) + 1,
              last_attempt_at: new Date().toISOString(),
              error_message: e?.message || 'transcript_fetch_error',
            })
            .eq('id', qi.id);
          transcriptsFailed++;
        }
      }
    }

    await sb
      .from('justcall_integrations')
      .update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('org_id', orgId);

    return new Response(
      JSON.stringify({
        success: true,
        sync_type: syncType,
        org_id: orgId,
        from_datetime: fromDt,
        to_datetime: toDt,
        pages_fetched: pages,
        calls_found: calls.length,
        justcall_calls_found: justcallCalls.length,
        sales_dialer_calls_found: salesDialerCalls.length,
        sales_dialer_error: salesDialerError,
        calls_upserted: callsUpserted,
        communication_events_logged: eventsLogged,
        transcripts_queued: transcriptsQueued,
        transcripts_fetched: transcriptsFetched,
        transcripts_failed: transcriptsFailed,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e?.message || 'Sync failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});













