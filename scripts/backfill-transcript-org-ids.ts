#!/usr/bin/env tsx
/**
 * Backfill org_id on Railway transcripts that have org_id IS NULL.
 *
 * For each transcript:
 * 1. Look up meeting in Supabase by external_id (= meeting.id)
 * 2. Get owner_user_id from meeting
 * 3. Resolve org_id from organization_memberships (user_id -> org_id)
 * 4. Update transcript with org_id
 *
 * Usage:
 *   tsx scripts/backfill-transcript-org-ids.ts [--limit N] [--dry-run]
 *
 * Env (staging Supabase + Railway):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY - Supabase project with meetings
 *   RAILWAY_DATABASE_URL or DATABASE_URL - Railway PostgreSQL
 */

import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.staging' });
dotenv.config({ path: 'meeting-translation/.env' });
dotenv.config({ path: 'meeting-translation/.env.production' });

// Use meeting-analytics project when both URL and key are set; else fall back to main Supabase
const meetingAnalyticsUrl = process.env.MEETING_ANALYTICS_SUPABASE_URL;
const meetingAnalyticsKey = process.env.MEETING_ANALYTICS_SUPABASE_SERVICE_ROLE_KEY;
const useMeetingAnalytics = meetingAnalyticsUrl && meetingAnalyticsKey;

const SUPABASE_URL = useMeetingAnalytics
  ? meetingAnalyticsUrl
  : process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = useMeetingAnalytics
  ? meetingAnalyticsKey
  : process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    '';
const RAILWAY_DB_URL =
  process.env.RAILWAY_DATABASE_URL ||
  process.env.DATABASE_URL ||
  '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  if (meetingAnalyticsUrl && !meetingAnalyticsKey) {
    console.error(
      'MEETING_ANALYTICS_SUPABASE_URL is set but MEETING_ANALYTICS_SUPABASE_SERVICE_ROLE_KEY is missing.'
    );
    console.error(
      'Get the service role key from Supabase Dashboard > Project caerqjzvuerejfrdtygb > Settings > API'
    );
  } else {
    console.error(
      'Missing Supabase config. Set MEETING_ANALYTICS_SUPABASE_URL and MEETING_ANALYTICS_SUPABASE_SERVICE_ROLE_KEY'
    );
    console.error(
      '(or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for the project where meetings live)'
    );
  }
  process.exit(1);
}

if (!RAILWAY_DB_URL) {
  console.error(
    'Missing RAILWAY_DATABASE_URL or DATABASE_URL (Railway PostgreSQL)'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface CliOptions {
  limit?: number;
  dryRun?: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--limit':
      case '-l': {
        const value = args[i + 1];
        if (!value) throw new Error(`Missing value for ${arg}`);
        options.limit = parseInt(value, 10);
        if (isNaN(options.limit!)) throw new Error(`Invalid number: ${value}`);
        i++;
        break;
      }
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: tsx scripts/backfill-transcript-org-ids.ts [options]

Options:
  --limit N, -l N   Process at most N transcripts (default: all)
  --dry-run         Show what would be updated without making changes
  --help, -h        Show this help
`);
        process.exit(0);
      default:
        break;
    }
  }
  return options;
}

async function main() {
  const options = parseArgs();

  const pgClient = new pg.Client({ connectionString: RAILWAY_DB_URL });
  await pgClient.connect();

  try {
    const limitClause = options.limit ? `LIMIT ${options.limit}` : '';
    const res = await pgClient.query<{ id: string; external_id: string }>(
      `SELECT id, external_id FROM transcripts WHERE org_id IS NULL AND external_id IS NOT NULL ${limitClause}`
    );

    const rows = res.rows;
    console.log(`Found ${rows.length} transcripts with org_id IS NULL`);

    if (rows.length === 0) {
      console.log('Nothing to backfill.');
      return;
    }

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
        console.warn(`No owner_user_id for meeting ${meetingId}, skipping`);
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
        console.warn(
          `No org membership for user ${meeting.owner_user_id}, skipping`
        );
        skipped++;
        continue;
      }

      if (options.dryRun) {
        console.log(
          `[dry-run] Would set org_id=${orgId} for transcript ${transcriptId} (meeting ${meetingId})`
        );
        updated++;
        continue;
      }

      await pgClient.query(
        'UPDATE transcripts SET org_id = $1 WHERE id = $2',
        [orgId, transcriptId]
      );
      updated++;
      if (updated % 10 === 0) {
        console.log(`Updated ${updated} transcripts...`);
      }
    }

    console.log(`Done. Updated: ${updated}, Skipped: ${skipped}, Failed: ${failed}`);
  } finally {
    await pgClient.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
