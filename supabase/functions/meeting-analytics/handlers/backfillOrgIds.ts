/**
 * Backfill org_id on Railway transcripts that have org_id IS NULL.
 * Requires CRON_SECRET or service_role Authorization.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';
import { getRailwayDb } from '../db.ts';
import { successResponse, errorResponse, jsonResponse } from '../helpers.ts';

function isAuthorized(req: Request): boolean {
  const auth = req.headers.get('Authorization');
  const cronSecret = req.headers.get('x-cron-secret') || req.headers.get('X-Cron-Secret');
  const expectedCron = Deno.env.get('CRON_SECRET');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (cronSecret && expectedCron && cronSecret === expectedCron) return true;
  if (auth?.startsWith('Bearer ') && serviceRoleKey && auth.slice(7) === serviceRoleKey) return true;
  return false;
}

export async function handleBackfillOrgIds(req: Request): Promise<Response> {
  if (!isAuthorized(req)) {
    return errorResponse('Unauthorized', 401, req);
  }

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
  const dryRun = url.searchParams.get('dry_run') === 'true' || url.searchParams.get('dryRun') === 'true';

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return errorResponse('Missing Supabase config in edge function', 500, req);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const db = getRailwayDb();

  try {
    const rows = await db.unsafe<{ id: string; external_id: string }>(
      `SELECT id, external_id FROM transcripts WHERE org_id IS NULL AND external_id IS NOT NULL LIMIT $1`,
      [limit]
    );

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of rows) {
      const { id: transcriptId, external_id: meetingId } = row;

      const { data: meeting, error: meetingErr } = await supabase
        .from('meetings')
        .select('owner_user_id')
        .eq('id', meetingId)
        .maybeSingle();

      if (meetingErr) {
        console.error(`Meeting lookup failed for ${meetingId}:`, meetingErr);
        failed++;
        continue;
      }

      if (!meeting?.owner_user_id) {
        skipped++;
        continue;
      }

      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', meeting.owner_user_id)
        .limit(1)
        .maybeSingle();

      const orgId = membership?.org_id ?? null;
      if (!orgId) {
        skipped++;
        continue;
      }

      if (dryRun) {
        updated++;
        continue;
      }

      await db.unsafe('UPDATE transcripts SET org_id = $1 WHERE id = $2', [
        orgId,
        transcriptId,
      ]);
      updated++;
    }

    return jsonResponse(
      {
        message: dryRun ? 'Dry run complete' : 'Backfill complete',
        processed: rows.length,
        updated,
        skipped,
        failed,
        dryRun,
      },
      200,
      req
    );
  } catch (err) {
    console.error('Backfill error:', err);
    return errorResponse(
      err instanceof Error ? err.message : 'Backfill failed',
      500,
      req
    );
  }
}
