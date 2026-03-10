/**
 * Handler: deal-room-archive
 * Extracted from supabase/functions/slack-deal-room-archive/index.ts
 */

/**
 * Deal Room Archive Worker (Edge Function)
 *
 * Archives Slack deal room channels that are due for archiving:
 * - slack_deal_rooms.is_archived = false
 * - slack_deal_rooms.archive_scheduled_for <= now()
 *
 * SECURITY:
 * - POST only
 * - FAIL-CLOSED: Requires CRON_SECRET or service role authentication
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { verifyCronSecret, isServiceRoleAuth } from '../../_shared/edgeAuth.ts';
import { handleCorsPreflightRequest, errorResponse, jsonResponse } from '../../_shared/corsHelper.ts';

type ArchiveCandidate = {
  id: string;
  org_id: string;
  deal_id: string;
  slack_channel_id: string;
  slack_channel_name: string;
  archive_scheduled_for: string;
};

async function archiveChannel(
  botToken: string,
  channelId: string
): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch('https://slack.com/api/conversations.archive', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel: channelId }),
  });

  return response.json();
}

export async function handleDealRoomArchive(req: Request): Promise<Response> {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed. Use POST.', req, 405);
  }

  try {
    // SECURITY: Fail-closed authentication
    const cronSecret = Deno.env.get('CRON_SECRET');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const authHeader = req.headers.get('Authorization');

    const isCronAuth = verifyCronSecret(req, cronSecret);
    const isServiceRole = isServiceRoleAuth(authHeader, supabaseServiceKey);

    if (!isCronAuth && !isServiceRole) {
      console.error('[slack-deal-room-archive] Unauthorized access attempt');
      return errorResponse('Unauthorized: valid CRON_SECRET or service role key required', req, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    const body = (await req.json().catch(() => ({}))) as { limit?: number };
    const limit = typeof body.limit === 'number' && Number.isFinite(body.limit) ? Math.min(100, Math.max(1, body.limit)) : 50;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Fetch due deal rooms
    const nowIso = new Date().toISOString();
    const { data: rooms, error: roomsError } = await supabase
      .from('slack_deal_rooms')
      .select('id, org_id, deal_id, slack_channel_id, slack_channel_name, archive_scheduled_for')
      .eq('is_archived', false)
      .not('archive_scheduled_for', 'is', null)
      .lte('archive_scheduled_for', nowIso)
      .order('archive_scheduled_for', { ascending: true })
      .limit(limit);

    if (roomsError) {
      throw new Error(`Failed to fetch due deal rooms: ${roomsError.message}`);
    }

    const candidates = (rooms || []) as ArchiveCandidate[];
    if (candidates.length === 0) {
      return jsonResponse(
        { success: true, message: 'No due deal rooms to archive', processed: 0, archived: 0, errors: [] },
        req
      );
    }

    // Preload bot tokens per org (single query)
    const orgIds = Array.from(new Set(candidates.map((r) => r.org_id)));
    const { data: orgTokens, error: tokensError } = await supabase
      .from('slack_org_settings')
      .select('org_id, bot_access_token')
      .in('org_id', orgIds)
      .eq('is_connected', true);

    if (tokensError) {
      throw new Error(`Failed to fetch Slack bot tokens: ${tokensError.message}`);
    }

    const tokenByOrg = new Map<string, string>();
    (orgTokens || []).forEach((row: any) => {
      if (row?.org_id && row?.bot_access_token) tokenByOrg.set(row.org_id, row.bot_access_token);
    });

    const results = {
      processed: 0,
      archived: 0,
      errors: [] as Array<{ dealRoomId: string; channelId: string; error: string }>,
    };

    for (const room of candidates) {
      results.processed += 1;

      const token = tokenByOrg.get(room.org_id);
      if (!token) {
        results.errors.push({
          dealRoomId: room.id,
          channelId: room.slack_channel_id,
          error: 'No bot token for org (Slack not connected?)',
        });
        continue;
      }

      const archiveRes = await archiveChannel(token, room.slack_channel_id);

      // Slack may return errors like "already_archived" or "channel_not_found"
      const okish =
        archiveRes.ok === true ||
        archiveRes.error === 'already_archived' ||
        archiveRes.error === 'channel_not_found';

      if (!okish) {
        results.errors.push({
          dealRoomId: room.id,
          channelId: room.slack_channel_id,
          error: archiveRes.error || 'Unknown Slack archive error',
        });
        continue;
      }

      const { error: updateErr } = await supabase
        .from('slack_deal_rooms')
        .update({
          is_archived: true,
          archived_at: new Date().toISOString(),
          archive_scheduled_for: null,
        })
        .eq('id', room.id);

      if (updateErr) {
        results.errors.push({
          dealRoomId: room.id,
          channelId: room.slack_channel_id,
          error: `Archived in Slack but failed DB update: ${updateErr.message}`,
        });
        continue;
      }

      results.archived += 1;
    }

    return jsonResponse(
      {
        success: true,
        message: `Processed ${results.processed} due deal rooms`,
        ...results,
        now: nowIso,
      },
      req
    );
  } catch (err: any) {
    console.error('[slack-deal-room-archive] Error:', err);
    return errorResponse(err?.message || 'Internal server error', req, 500);
  }
}


