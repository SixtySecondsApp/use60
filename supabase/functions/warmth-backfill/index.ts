/**
 * warmth-backfill — WB-002
 *
 * Reads historical activities, meetings, and deal stage changes,
 * seeds contact_warmth_signals, then triggers batch warmth-recalculate.
 *
 * POST body:
 *   { org_id: string }
 *
 * Returns:
 *   {
 *     total_signals: number,
 *     contacts_affected: number,
 *     sources: { activities: number, meetings: number, deal_stages: number },
 *     recalculate: { processed: number, updated: number }
 *   }
 *
 * Deploy with --no-verify-jwt (staging ES256 JWT issue).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  errorResponse,
  jsonResponse,
} from '../_shared/corsHelper.ts';

// ============================================================================
// Config
// ============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const PAGE_SIZE = 1000;
const INSERT_BATCH_SIZE = 500;

// ============================================================================
// Types
// ============================================================================

interface RequestBody {
  org_id: string;
}

interface SignalInsert {
  contact_id: string;
  org_id: string;
  signal_type: string;
  signal_weight: number;
  occurred_at: string;
  metadata: Record<string, unknown>;
}

// ============================================================================
// Helpers
// ============================================================================

/** Paginated fetch — Supabase caps at 1000 rows per request. */
async function fetchAll<T>(
  queryFn: (offset: number, limit: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const results: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await queryFn(offset, offset + PAGE_SIZE - 1);
    if (error) {
      console.error('[warmth-backfill] paginated fetch error:', error.message);
      break;
    }
    if (!data?.length) break;
    results.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return results;
}

// ============================================================================
// Org membership helper
// ============================================================================

/** Get all user_ids belonging to an org via organization_memberships. */
async function getOrgMemberIds(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
): Promise<string[]> {
  const rows = await fetchAll((from, to) =>
    supabase
      .from('organization_memberships')
      .select('user_id')
      .eq('org_id', orgId)
      .range(from, to),
  );
  return rows.map((r) => r.user_id);
}

// ============================================================================
// Source extractors — scoped via organization_memberships (not clerk_org_id)
// ============================================================================

/**
 * Source 1: Activities — outbound (email/call/linkedin), meetings, proposals.
 * Scoped by activities.user_id IN org member ids.
 */
async function extractActivities(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  memberIds: string[],
): Promise<SignalInsert[]> {
  if (memberIds.length === 0) return [];

  const rows = await fetchAll((from, to) =>
    supabase
      .from('activities')
      .select('id, contact_id, type, outbound_type, date, subject')
      .in('user_id', memberIds)
      .eq('status', 'completed')
      .not('contact_id', 'is', null)
      .in('type', ['outbound', 'meeting', 'proposal'])
      .range(from, to),
  );

  const signals: SignalInsert[] = [];

  for (const a of rows) {
    let signalType: string | null = null;

    if (a.type === 'outbound') {
      if (a.outbound_type === 'email') signalType = 'email_sent';
      else if (a.outbound_type === 'call') signalType = 'call_completed';
      else if (a.outbound_type === 'linkedin') signalType = 'linkedin_message';
    } else if (a.type === 'meeting') {
      signalType = 'meeting_held';
    } else if (a.type === 'proposal') {
      signalType = 'proposal_opened';
    }

    if (!signalType || !a.contact_id || !a.date) continue;

    signals.push({
      contact_id: a.contact_id,
      org_id: orgId,
      signal_type: signalType,
      signal_weight: 1.0,
      occurred_at: a.date,
      metadata: {
        source: 'backfill',
        source_table: 'activities',
        activity_id: a.id,
        subject: a.subject ?? null,
      },
    });
  }

  return signals;
}

/**
 * Source 2: Meetings via meeting_contacts junction — one signal per attendee.
 * Scoped by meetings.owner_user_id IN org member ids.
 */
async function extractMeetings(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  memberIds: string[],
): Promise<SignalInsert[]> {
  if (memberIds.length === 0) return [];

  const rows = await fetchAll((from, to) =>
    supabase
      .from('meeting_contacts')
      .select('contact_id, meeting_id, meetings!inner(id, meeting_start, title, owner_user_id)')
      .in('meetings.owner_user_id', memberIds)
      .range(from, to),
  );

  const signals: SignalInsert[] = [];

  for (const mc of rows) {
    const meeting = mc.meetings as { id: string; meeting_start: string; title: string } | null;
    if (!meeting?.meeting_start || !mc.contact_id) continue;

    signals.push({
      contact_id: mc.contact_id,
      org_id: orgId,
      signal_type: 'meeting_held',
      signal_weight: 1.0,
      occurred_at: meeting.meeting_start,
      metadata: {
        source: 'backfill',
        source_table: 'meeting_contacts',
        meeting_id: meeting.id,
        title: meeting.title ?? null,
      },
    });
  }

  return signals;
}

/**
 * Source 3: Deal stage changes — propagated to all contacts on each deal.
 * Scoped by deals.owner_id IN org member ids.
 */
async function extractDealStages(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  memberIds: string[],
): Promise<SignalInsert[]> {
  if (memberIds.length === 0) return [];

  // Step 1: Get deal → contact mapping for this org
  const dcRows = await fetchAll((from, to) =>
    supabase
      .from('deal_contacts')
      .select('deal_id, contact_id, deals!inner(id, owner_id)')
      .in('deals.owner_id', memberIds)
      .range(from, to),
  );

  const dealToContacts: Record<string, string[]> = {};
  for (const dc of dcRows) {
    (dealToContacts[dc.deal_id] ??= []).push(dc.contact_id);
  }

  const dealIds = Object.keys(dealToContacts);
  if (dealIds.length === 0) return [];

  // Step 2: Get stage history for those deals
  const stageRows = await fetchAll((from, to) =>
    supabase
      .from('deal_stage_history')
      .select('deal_id, entered_at, stage_id')
      .in('deal_id', dealIds)
      .not('entered_at', 'is', null)
      .range(from, to),
  );

  const signals: SignalInsert[] = [];

  for (const sh of stageRows) {
    const contacts = dealToContacts[sh.deal_id] ?? [];
    for (const contactId of contacts) {
      signals.push({
        contact_id: contactId,
        org_id: orgId,
        signal_type: 'deal_stage_change',
        signal_weight: 1.0,
        occurred_at: sh.entered_at,
        metadata: {
          source: 'backfill',
          source_table: 'deal_stage_history',
          deal_id: sh.deal_id,
          stage_id: sh.stage_id ?? null,
        },
      });
    }
  }

  return signals;
}

// ============================================================================
// Entry point
// ============================================================================

serve(async (req: Request) => {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', req, 400);
  }

  const { org_id } = body;
  if (!org_id) {
    return errorResponse('org_id is required', req, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const startMs = Date.now();

    // ---- Verify org exists ---------------------------------------------------
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('id', org_id)
      .maybeSingle();

    if (!org) {
      return errorResponse('Organization not found', req, 404);
    }

    // ---- Get org member user_ids for scoping ----------------------------------
    const memberIds = await getOrgMemberIds(supabase, org_id);
    console.log(`[warmth-backfill] Org ${org_id} has ${memberIds.length} members`);

    if (memberIds.length === 0) {
      return jsonResponse(
        { total_signals: 0, contacts_affected: 0, sources: { activities: 0, meetings: 0, deal_stages: 0 }, recalculate: { processed: 0, updated: 0 }, duration_ms: Date.now() - startMs },
        req,
      );
    }

    // ---- Delete previous backfill signals (idempotent re-runs) ---------------
    const { error: deleteErr } = await supabase
      .from('contact_warmth_signals')
      .delete()
      .eq('org_id', org_id)
      .eq('metadata->>source', 'backfill');

    if (deleteErr) {
      console.warn('[warmth-backfill] cleanup warning:', deleteErr.message);
    }

    // ---- Extract signals from all sources in parallel ------------------------
    const [activitySignals, meetingSignals, dealStageSignals] = await Promise.all([
      extractActivities(supabase, org_id, memberIds),
      extractMeetings(supabase, org_id, memberIds),
      extractDealStages(supabase, org_id, memberIds),
    ]);

    const allSignals = [...activitySignals, ...meetingSignals, ...dealStageSignals];

    console.log(
      `[warmth-backfill] Extracted: activities=${activitySignals.length}, meetings=${meetingSignals.length}, deal_stages=${dealStageSignals.length}, total=${allSignals.length}`,
    );

    // ---- Batch insert --------------------------------------------------------
    let totalInserted = 0;
    for (let i = 0; i < allSignals.length; i += INSERT_BATCH_SIZE) {
      const batch = allSignals.slice(i, i + INSERT_BATCH_SIZE);
      const { error: insertErr } = await supabase
        .from('contact_warmth_signals')
        .insert(batch);

      if (insertErr) {
        console.error(`[warmth-backfill] batch insert error at offset ${i}:`, insertErr.message);
        continue;
      }
      totalInserted += batch.length;
    }

    // ---- Count distinct contacts affected ------------------------------------
    const contactIds = new Set(allSignals.map((s) => s.contact_id));

    // ---- Trigger batch warmth recalculation ----------------------------------
    let recalcResult = { processed: 0, updated: 0 };

    if (totalInserted > 0) {
      try {
        const recalcResp = await fetch(`${SUPABASE_URL}/functions/v1/warmth-recalculate`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ org_id, mode: 'batch' }),
        });

        if (recalcResp.ok) {
          recalcResult = await recalcResp.json();
        } else {
          console.error('[warmth-backfill] recalculate failed:', recalcResp.status, await recalcResp.text());
        }
      } catch (err) {
        console.error('[warmth-backfill] recalculate invoke error:', err instanceof Error ? err.message : String(err));
      }
    }

    const durationMs = Date.now() - startMs;

    return jsonResponse(
      {
        total_signals: totalInserted,
        contacts_affected: contactIds.size,
        sources: {
          activities: activitySignals.length,
          meetings: meetingSignals.length,
          deal_stages: dealStageSignals.length,
        },
        recalculate: recalcResult,
        duration_ms: durationMs,
      },
      req,
    );
  } catch (err) {
    console.error(
      '[warmth-backfill] unexpected error:',
      err instanceof Error ? err.message : String(err),
    );
    return errorResponse(
      err instanceof Error ? err.message : 'Internal server error',
      req,
      500,
    );
  }
});
