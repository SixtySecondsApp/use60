/**
 * Meeting Analytics Cron Edge Function
 *
 * Triggered by pg_cron on a schedule. Checks notification_settings in the
 * Railway DB and fans out report-generation requests to the
 * meeting-analytics edge function.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { Pool } from 'https://deno.land/x/postgres@v0.19.3/mod.ts';

// ---------------------------------------------------------------------------
// Railway DB connection (same pattern as meeting-analytics/db.ts)
// ---------------------------------------------------------------------------

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const url = Deno.env.get('RAILWAY_DATABASE_URL');
    if (!url) {
      throw new Error('RAILWAY_DATABASE_URL is required for meeting-analytics-cron');
    }
    pool = new Pool(url, 3, true);
  }
  return pool;
}

async function queryRows<T = Record<string, unknown>>(
  query: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = await getPool().connect();
  try {
    const result = await client.queryObject<T>({ text: query, args: params });
    return result.rows;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  // CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    // ---- Auth: validate cron secret ----
    const cronSecret = Deno.env.get('CRON_SECRET');
    const headerSecret = req.headers.get('x-cron-secret');

    if (!cronSecret || headerSecret !== cronSecret) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized — invalid or missing x-cron-secret' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ---- Parse request body ----
    const body = await req.json();
    const type: string = body?.type;

    if (type !== 'daily' && type !== 'weekly') {
      return new Response(
        JSON.stringify({ error: 'Invalid type — must be "daily" or "weekly"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ---- Query notification_settings from Railway DB ----
    let settings: { id: string }[];

    if (type === 'daily') {
      settings = await queryRows<{ id: string }>(
        `SELECT id FROM notification_settings WHERE enabled = true AND (schedule_type = 'daily' OR schedule_type IS NULL)`,
      );
    } else {
      settings = await queryRows<{ id: string }>(
        `SELECT id FROM notification_settings WHERE enabled = true AND schedule_type = 'weekly'`,
      );
    }

    console.log(`[meeting-analytics-cron] Found ${settings.length} ${type} notification settings`);

    if (settings.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, type, triggered: 0, results: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ---- Fan out to meeting-analytics /api/reports/send ----
    const baseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    const results = await Promise.allSettled(
      settings.map(async (setting) => {
        const res = await fetch(
          `${baseUrl}/functions/v1/meeting-analytics/api/reports/send`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ type, settingId: setting.id }),
          },
        );

        const resBody = await res.text();
        return {
          settingId: setting.id,
          status: res.status,
          body: resBody,
        };
      }),
    );

    const summary = results.map((r, i) => {
      if (r.status === 'fulfilled') {
        return { settingId: settings[i].id, ok: true, httpStatus: r.value.status };
      }
      return { settingId: settings[i].id, ok: false, error: String((r as PromiseRejectedResult).reason) };
    });

    console.log(`[meeting-analytics-cron] Completed: ${JSON.stringify(summary)}`);

    return new Response(
      JSON.stringify({ ok: true, type, triggered: settings.length, results: summary }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[meeting-analytics-cron] Unhandled error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
