#!/usr/bin/env npx ts-node
/**
 * Backfill SavvyCal events from a date range
 *
 * This script fetches events directly from the SavvyCal API and pushes them
 * through the webhook-leads/savvycal edge function for processing.
 *
 * Usage:
 *   npx ts-node scripts/backfill-savvycal-events.ts --since 2025-12-08 --until 2025-12-13
 *   npx ts-node scripts/backfill-savvycal-events.ts --since 2025-12-08 --until 2025-12-13 --execute
 *
 * Options:
 *   --since    Start date (ISO format or YYYY-MM-DD)
 *   --until    End date (ISO format or YYYY-MM-DD)
 *   --execute  Actually process events (default is preview mode)
 *   --batch    Batch size for processing (default: 10)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SAVVYCAL_API_TOKEN = process.env.SAVVYCAL_API_TOKEN || process.env.SAVVYCAL_SECRET_KEY || '';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

interface SavvyCalEvent {
  id: string;
  state: string;
  summary: string;
  description: string | null;
  start_at: string;
  end_at: string;
  created_at: string;
  updated_at: string;
  duration: number;
  attendees: Array<{
    id: string;
    email: string;
    display_name: string;
    first_name: string | null;
    last_name: string | null;
    is_organizer: boolean;
    phone_number: string | null;
    time_zone: string | null;
    marketing_opt_in: boolean | null;
  }>;
  organizer: {
    id: string;
    email: string;
    display_name: string;
    is_organizer: boolean;
  };
  scheduler?: {
    id: string;
    email: string;
    display_name: string;
    first_name: string | null;
    last_name: string | null;
    phone_number: string | null;
    time_zone: string | null;
  };
  conferencing?: {
    type: string | null;
    join_url: string | null;
    meeting_id: string | null;
  };
  link?: {
    id: string;
    slug: string;
    name: string | null;
    private_name: string | null;
  };
  scope?: {
    id: string;
    name: string;
    slug: string;
  };
  metadata?: Record<string, unknown>;
  location?: string | null;
}

interface ApiResponse {
  data: SavvyCalEvent[];
  meta: {
    after?: string;
    before?: string;
    has_more: boolean;
  };
}

function parseArgs(): { since: string; until: string; execute: boolean; batch: number } {
  const args = process.argv.slice(2);
  let since = '';
  let until = '';
  let execute = false;
  let batch = 10;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--since' && args[i + 1]) {
      since = args[i + 1];
      i++;
    } else if (args[i] === '--until' && args[i + 1]) {
      until = args[i + 1];
      i++;
    } else if (args[i] === '--execute') {
      execute = true;
    } else if (args[i] === '--batch' && args[i + 1]) {
      batch = parseInt(args[i + 1], 10);
      i++;
    }
  }

  // Default date range: Dec 8-13, 2025
  if (!since) since = '2025-12-08T00:00:00Z';
  if (!until) until = '2025-12-13T23:59:59Z';

  // Normalize dates to ISO format
  if (!since.includes('T')) since = `${since}T00:00:00Z`;
  if (!until.includes('T')) until = `${until}T23:59:59Z`;

  return { since, until, execute, batch };
}

async function fetchSavvyCalEvents(since: string, until: string): Promise<SavvyCalEvent[]> {
  const allEvents: SavvyCalEvent[] = [];
  let cursor: string | null = null;
  let page = 1;

  console.log(`📡 Fetching SavvyCal events from ${since} to ${until}...`);

  while (true) {
    const params = new URLSearchParams({
      'filter[created_at][gte]': since,
      'filter[created_at][lte]': until,
      per_page: '100',
    });

    if (cursor) {
      params.set('page[after]', cursor);
    }

    const url = `https://api.savvycal.com/v1/events?${params.toString()}`;

    console.log(`  Page ${page}: Fetching...`);

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${SAVVYCAL_API_TOKEN}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SavvyCal API error: ${response.status} - ${errorText}`);
    }

    const data: ApiResponse = await response.json();

    if (data.data && data.data.length > 0) {
      allEvents.push(...data.data);
      console.log(`  Page ${page}: Found ${data.data.length} events (total: ${allEvents.length})`);
    }

    if (!data.meta?.has_more || !data.meta?.after) {
      break;
    }

    cursor = data.meta.after;
    page++;

    // Rate limiting - wait 200ms between requests
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return allEvents;
}

async function processEventThroughWebhook(event: SavvyCalEvent): Promise<{ success: boolean; error?: string }> {
  const webhookUrl = `${SUPABASE_URL}/functions/v1/webhook-leads/savvycal`;

  // Transform event to webhook format
  const webhookPayload = {
    id: `backfill_${event.id}_${Date.now()}`,
    occurred_at: event.created_at,
    type: 'booking.confirmed',
    version: '1.0',
    payload: event,
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify(webhookPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `${response.status}: ${errorText}` };
    }

    const result = await response.json();
    return { success: result.success ?? true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function main() {
  console.log('🔄 SavvyCal Events Backfill Tool');
  console.log('================================\n');

  // Validate environment
  if (!SAVVYCAL_API_TOKEN) {
    console.error('❌ SAVVYCAL_API_TOKEN not set in environment');
    process.exit(1);
  }

  if (!SUPABASE_URL) {
    console.error('❌ SUPABASE_URL not set in environment');
    process.exit(1);
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY not set in environment');
    process.exit(1);
  }

  const { since, until, execute, batch } = parseArgs();

  console.log(`📅 Date range: ${since} to ${until}`);
  console.log(`🔧 Mode: ${execute ? '🚀 EXECUTE' : '👀 PREVIEW'}`);
  console.log(`📦 Batch size: ${batch}`);
  console.log(`🌐 Webhook URL: ${SUPABASE_URL}/functions/v1/webhook-leads/savvycal`);
  console.log('');

  // Fetch events from SavvyCal
  const events = await fetchSavvyCalEvents(since, until);

  if (events.length === 0) {
    console.log('\n⚠️ No events found in the specified date range');
    return;
  }

  console.log(`\n📊 Found ${events.length} events to process\n`);

  // Group by state
  const byState: Record<string, number> = {};
  for (const event of events) {
    byState[event.state] = (byState[event.state] || 0) + 1;
  }
  console.log('📈 Events by state:');
  for (const [state, count] of Object.entries(byState)) {
    console.log(`  ${state}: ${count}`);
  }

  // Group by link
  const byLink: Record<string, number> = {};
  for (const event of events) {
    const linkName = event.link?.private_name || event.link?.name || event.link?.slug || 'Unknown';
    byLink[linkName] = (byLink[linkName] || 0) + 1;
  }
  console.log('\n📈 Events by booking link:');
  const sortedLinks = Object.entries(byLink).sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [link, count] of sortedLinks) {
    console.log(`  ${link}: ${count}`);
  }

  if (!execute) {
    console.log('\n👀 PREVIEW MODE - No events processed');
    console.log('Run with --execute to process events through the webhook');
    console.log('\nExample:');
    console.log(`  npx ts-node scripts/backfill-savvycal-events.ts --since ${since.split('T')[0]} --until ${until.split('T')[0]} --execute`);
    return;
  }

  // Process events through webhook
  console.log('\n🚀 Processing events through webhook...\n');

  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ eventId: string; error: string }> = [];

  for (let i = 0; i < events.length; i += batch) {
    const batchEvents = events.slice(i, i + batch);

    const results = await Promise.all(
      batchEvents.map(async (event) => {
        const result = await processEventThroughWebhook(event);
        return { eventId: event.id, ...result };
      })
    );

    for (const result of results) {
      if (result.success) {
        successCount++;
      } else {
        errorCount++;
        errors.push({ eventId: result.eventId, error: result.error || 'Unknown error' });
      }
    }

    // Progress update
    const processed = Math.min(i + batch, events.length);
    console.log(`  Progress: ${processed}/${events.length} (✅ ${successCount} | ❌ ${errorCount})`);

    // Rate limiting between batches
    if (i + batch < events.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log('\n✅ Backfill complete!');
  console.log(`  Successfully processed: ${successCount}`);
  console.log(`  Errors: ${errorCount}`);

  if (errors.length > 0) {
    console.log('\n❌ Error details (first 10):');
    for (const error of errors.slice(0, 10)) {
      console.log(`  Event ${error.eventId}: ${error.error}`);
    }
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
