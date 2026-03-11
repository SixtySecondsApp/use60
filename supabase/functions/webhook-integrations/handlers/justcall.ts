;
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { hmacSha256Hex, timingSafeEqual } from '../../../_shared/use60Signing.ts';
import { legacyCorsHeaders as corsHeaders } from '../../../_shared/corsHelper.ts';
import { captureException } from '../../../_shared/sentryEdge.ts';

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

function parseTimestampToMs(v: string | null): number | null {
  if (!v) return null;
  const s = v.trim();
  if (!s) return null;
  // epoch seconds or ms
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    // assume seconds if 10 digits-ish
    return n < 2_000_000_000_000 ? n * 1000 : n;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

// RFC3986-ish encoding (Ruby CGI.escape differs slightly; this is closest in JS)
function urlEncode(input: string): string {
  return encodeURIComponent(input)
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

async function verifyJustCallDynamicSignature(args: {
  secret: string;
  signature: string | null;
  signatureVersion: string | null;
  requestTimestamp: string | null;
  payloadWebhookUrl: string | null;
  payloadType: string | null;
}): Promise<{ ok: boolean; reason?: string }> {
  const { secret, signature, signatureVersion, requestTimestamp, payloadWebhookUrl, payloadType } = args;

  if (!signature) return { ok: false, reason: 'Missing x-justcall-signature' };
  if (signatureVersion && signatureVersion.trim() !== '' && signatureVersion.trim().toLowerCase() !== 'v1') {
    return { ok: false, reason: `Unsupported signature version: ${signatureVersion}` };
  }

  if (!payloadWebhookUrl) return { ok: false, reason: 'Missing webhook_url in payload' };
  if (!payloadType) return { ok: false, reason: 'Missing type in payload' };
  if (!requestTimestamp) return { ok: false, reason: 'Missing x-justcall-request-timestamp' };

  const tsMs = parseTimestampToMs(requestTimestamp);
  if (!tsMs) return { ok: false, reason: 'Invalid x-justcall-request-timestamp' };

  const ageMs = Math.abs(Date.now() - tsMs);
  if (ageMs > 10 * 60 * 1000) {
    return { ok: false, reason: 'Stale webhook timestamp (possible replay)' };
  }

  // As per JustCall docs:
  // payload_string = secret|urlencoded(webhook_url)|type|x-justcall-request-timestamp
  // signature = HMAC_SHA256_HEX(secret, payload_string)
  const payloadString = `${secret}|${urlEncode(payloadWebhookUrl)}|${payloadType}|${requestTimestamp}`;
  const expected = await hmacSha256Hex(secret, payloadString);
  const provided = signature.trim();
  const ok = timingSafeEqual(expected, provided);
  return ok ? { ok: true } : { ok: false, reason: 'Invalid JustCall signature' };
}

function extractCallFields(payload: any): {
  externalId: string | null;
  direction: 'inbound' | 'outbound' | 'internal' | 'unknown';
  status: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  fromNumber: string | null;
  toNumber: string | null;
  agentEmail: string | null;
  justcallAgentId: string | null;
  recordingUrl: string | null;
  recordingMime: string | null;
  transcriptText: string | null;
  transcriptJson: any | null;
} {
  const data = payload?.data ?? payload?.call ?? payload ?? {};

  const rawId =
    data?.id ??
    data?.call_id ??
    data?.callId ??
    data?.sid ??
    data?.uuid ??
    payload?.id ??
    payload?.call_id ??
    null;

  const externalId = rawId != null ? String(rawId) : null;

  const rawDir = (data?.direction ?? data?.call_direction ?? payload?.direction ?? '').toString().toLowerCase();
  const direction =
    rawDir.includes('in') ? 'inbound' : rawDir.includes('out') ? 'outbound' : rawDir.includes('internal') ? 'internal' : 'unknown';

  const status = data?.status ? String(data.status) : payload?.status ? String(payload.status) : null;

  const startedAt =
    data?.started_at ??
    data?.start_time ??
    data?.startedAt ??
    data?.startTime ??
    payload?.started_at ??
    payload?.start_time ??
    null;

  const endedAt =
    data?.ended_at ??
    data?.end_time ??
    data?.endedAt ??
    data?.endTime ??
    payload?.ended_at ??
    payload?.end_time ??
    null;

  const durationSecondsRaw = data?.duration ?? data?.duration_seconds ?? payload?.duration ?? null;
  const durationSeconds =
    durationSecondsRaw == null ? null : Number.isFinite(Number(durationSecondsRaw)) ? Math.max(0, Math.floor(Number(durationSecondsRaw))) : null;

  const fromNumber = data?.from ?? data?.from_number ?? data?.fromNumber ?? payload?.from ?? null;
  const toNumber = data?.to ?? data?.to_number ?? data?.toNumber ?? payload?.to ?? null;

  const agentEmail = data?.agent_email ?? data?.agentEmail ?? data?.user_email ?? null;
  const justcallAgentId = data?.agent_id ?? data?.agentId ?? null;

  const recordingUrl =
    data?.recording_url ??
    data?.recordingUrl ??
    data?.recording ??
    data?.recording_link ??
    payload?.recording_url ??
    null;

  const recordingMime = data?.recording_mime ?? data?.recordingMime ?? null;

  const transcriptText = data?.transcript_text ?? data?.transcript ?? payload?.transcript_text ?? null;
  const transcriptJson = data?.transcript_json ?? data?.transcriptJson ?? null;

  return {
    externalId,
    direction,
    status,
    startedAt: startedAt ? new Date(startedAt).toISOString() : null,
    endedAt: endedAt ? new Date(endedAt).toISOString() : null,
    durationSeconds,
    fromNumber: fromNumber != null ? String(fromNumber) : null,
    toNumber: toNumber != null ? String(toNumber) : null,
    agentEmail: agentEmail != null ? String(agentEmail) : null,
    justcallAgentId: justcallAgentId != null ? String(justcallAgentId) : null,
    recordingUrl: recordingUrl != null ? String(recordingUrl) : null,
    recordingMime: recordingMime != null ? String(recordingMime) : null,
    transcriptText: transcriptText != null ? String(transcriptText) : null,
    transcriptJson: transcriptJson ?? null,
  };
}

export async function handleWebhook(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const authHeader = req.headers.get('Authorization') || '';
  const proxySecret = Deno.env.get('JUSTCALL_WEBHOOK_PROXY_SECRET') ?? '';
  const use60Ts = req.headers.get('X-Use60-Timestamp') || '';
  const use60Sig = req.headers.get('X-Use60-Signature') || '';

  const allowServiceRole = serviceRoleKey && authHeader.trim() === `Bearer ${serviceRoleKey}`;

  // Read raw body once (needed for signature verification and JSON parsing)
  const rawBody = await req.text();

  let allowProxySig = false;
  if (proxySecret && use60Ts && use60Sig.startsWith('v1=')) {
    const expected = await hmacSha256Hex(proxySecret, `v1:${use60Ts}:${rawBody}`);
    const provided = use60Sig.slice('v1='.length).trim();
    allowProxySig = timingSafeEqual(expected, provided);
  }

  if (!allowServiceRole && !allowProxySig) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized webhook' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token') || url.searchParams.get('webhook_token');
    if (!token) {
      return new Response(JSON.stringify({ success: false, error: 'Missing token query param' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: integration } = await supabase
      .from('justcall_integrations')
      .select('id, org_id, is_active, auth_type, webhook_token, connected_by_user_id')
      .eq('webhook_token', token)
      .eq('is_active', true)
      .maybeSingle();

    if (!integration) {
      return new Response(JSON.stringify({ success: false, error: 'Unknown webhook token' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = JSON.parse(rawBody);

    // Optional: Verify JustCall dynamic signature if api_secret exists (api key mode).
    const { data: secrets } = await supabase
      .from('justcall_integration_secrets')
      .select('api_secret')
      .eq('integration_id', integration.id)
      .maybeSingle();

    if (secrets?.api_secret) {
      const sig = req.headers.get('x-justcall-signature');
      const sigVer = req.headers.get('x-justcall-signature-version');
      const reqTs = req.headers.get('x-justcall-request-timestamp');

      const webhookUrlFromPayload =
        (payload && typeof payload.webhook_url === 'string' && payload.webhook_url) ||
        (payload?.webhook && typeof payload.webhook.url === 'string' && payload.webhook.url) ||
        null;

      const payloadType = payload?.type ? String(payload.type) : null;

      const verified = await verifyJustCallDynamicSignature({
        secret: secrets.api_secret,
        signature: sig,
        signatureVersion: sigVer,
        requestTimestamp: reqTs,
        payloadWebhookUrl: webhookUrlFromPayload,
        payloadType,
      });

      if (!verified.ok) {
        return new Response(JSON.stringify({ success: false, error: verified.reason || 'Invalid JustCall signature' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const callFields = extractCallFields(payload);
    if (!callFields.externalId) {
      // Don't hard-fail the webhook if a non-call event (e.g. SMS/WhatsApp) is accidentally subscribed.
      // Returning 2xx prevents retries and avoids JustCall marking the webhook as unhealthy.
      return new Response(
        JSON.stringify({
          success: true,
          ignored: true,
          reason: 'missing_call_id',
          type: payload?.type ?? null,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Best-effort owner mapping by agent email -> profiles.email (org scoped)
    let ownerUserId: string | null = null;
    let ownerEmail: string | null = null;
    if (callFields.agentEmail) {
      ownerEmail = callFields.agentEmail;
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('email', callFields.agentEmail)
        .maybeSingle();
      if (profile?.id) ownerUserId = profile.id;
    }

    const hasRecording = Boolean(callFields.recordingUrl);
    const hasTranscript = Boolean(callFields.transcriptText && callFields.transcriptText.trim().length > 0);

    const upsertPayload: any = {
      org_id: integration.org_id,
      provider: 'justcall',
      external_id: callFields.externalId,
      direction: callFields.direction,
      status: callFields.status,
      started_at: callFields.startedAt,
      ended_at: callFields.endedAt,
      duration_seconds: callFields.durationSeconds,
      from_number: callFields.fromNumber,
      to_number: callFields.toNumber,
      justcall_agent_id: callFields.justcallAgentId,
      agent_email: callFields.agentEmail,
      owner_user_id: ownerUserId,
      owner_email: ownerEmail,
      recording_url: callFields.recordingUrl,
      recording_mime: callFields.recordingMime,
      has_recording: hasRecording,
      transcript_text: hasTranscript ? callFields.transcriptText : null,
      transcript_json: callFields.transcriptJson,
      transcript_status: hasTranscript ? 'ready' : hasRecording ? 'queued' : 'missing',
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: callRow, error: upsertErr } = await supabase
      .from('calls')
      .upsert(upsertPayload, { onConflict: 'org_id,provider,external_id' })
      .select('id, transcript_text')
      .single();

    if (upsertErr || !callRow) {
      return new Response(JSON.stringify({ success: false, error: `Failed to upsert call: ${upsertErr?.message || 'unknown'}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If transcript missing but recording exists, enqueue transcript fetch
    if (!callRow.transcript_text && hasRecording) {
      await supabase
        .from('call_transcript_queue')
        .upsert(
          {
            org_id: integration.org_id,
            call_id: callRow.id,
            priority: 0,
            attempts: 0,
            last_attempt_at: null,
            error_message: null,
          },
          { onConflict: 'call_id' }
        );
    }

    // If transcript present on initial insert, queue indexing explicitly (trigger is UPDATE-only)
    if (callFields.transcriptText && callFields.transcriptText.trim().length > 100) {
      await supabase
        .from('call_index_queue')
        .upsert(
          {
            org_id: integration.org_id,
            call_id: callRow.id,
            owner_user_id: ownerUserId,
            priority: 0,
            attempts: 0,
            last_attempt_at: null,
            error_message: null,
          },
          { onConflict: 'call_id' }
        );
    }

    // Log comm event + outbound activity
    const effectiveUserId = ownerUserId || integration.connected_by_user_id || null;
    if (effectiveUserId) {
      await ensureCommunicationEvent(supabase, {
        userId: effectiveUserId,
        orgId: integration.org_id,
        callExternalId: callFields.externalId,
        direction: callFields.direction,
        whenIso: callFields.startedAt,
        fromNumber: callFields.fromNumber,
        toNumber: callFields.toNumber,
        durationSeconds: callFields.durationSeconds,
        hasRecording,
      });

      if (callFields.direction === 'outbound') {
        await ensureOutboundCallActivity(supabase, {
          userId: effectiveUserId,
          originalActivityId: callRow.id,
          whenIso: callFields.startedAt,
          fromNumber: callFields.fromNumber,
          toNumber: callFields.toNumber,
          durationSeconds: callFields.durationSeconds,
          externalId: callFields.externalId,
          provider: 'justcall',
          salesRep: ownerEmail || callFields.agentEmail || 'JustCall',
        });
      }
    }

    // Update integration heartbeat
    await supabase
      .from('justcall_integrations')
      .update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', integration.id);

    return new Response(JSON.stringify({ success: true, org_id: integration.org_id, call_id: callRow.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    await captureException(e, {
      tags: {
        function: 'justcall-webhook',
        integration: 'justcall',
      },
    });
    return new Response(JSON.stringify({ success: false, error: e?.message || 'Webhook processing failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
