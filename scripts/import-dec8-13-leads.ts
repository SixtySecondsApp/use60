/**
 * Import Dec 8-13, 2025 SavvyCal leads that were missed during the outage
 *
 * Usage: npx tsx scripts/import-dec8-13-leads.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple CSV parser
function parseCSV(content: string): Record<string, string>[] {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = (values[idx] || '').trim();
    });
    rows.push(row);
  }

  return rows;
}

// Load environment
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/webhook-leads/savvycal`;

interface CSVRow {
  id: string;
  link_id: string;
  poll_id: string;
  state: string;
  summary: string;
  description: string;
  start_at: string;
  end_at: string;
  created_at: string;
  location: string;
  organizer_display_name: string;
  organizer_email: string;
  scheduler_display_name: string;
  scheduler_email: string;
  scheduler_phone_number: string;
  url: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_term: string;
  utm_content: string;
  question_1: string;
  answer_1: string;
  question_2: string;
  answer_2: string;
}

function csvRowToWebhookPayload(row: CSVRow) {
  // Build attendees array
  const attendees = [
    {
      id: `attendee_organizer_${row.id}`,
      email: row.organizer_email,
      display_name: row.organizer_display_name,
      first_name: row.organizer_display_name.split(' ')[0],
      last_name: row.organizer_display_name.split(' ').slice(1).join(' '),
      time_zone: 'Europe/London',
      response_status: 'accepted',
      phone_number: null,
      is_organizer: true,
      marketing_opt_in: false,
      fields: [],
    },
    {
      id: `attendee_scheduler_${row.id}`,
      email: row.scheduler_email,
      display_name: row.scheduler_display_name,
      first_name: row.scheduler_display_name.split(' ')[0],
      last_name: row.scheduler_display_name.split(' ').slice(1).join(' '),
      time_zone: 'Europe/London',
      response_status: 'accepted',
      phone_number: row.scheduler_phone_number || null,
      is_organizer: false,
      marketing_opt_in: false,
      fields: [],
    },
  ];

  // Build custom fields from Q&A
  const fields: Array<{ question: string; answer: string }> = [];
  if (row.question_1 && row.answer_1) {
    fields.push({ question: row.question_1, answer: row.answer_1 });
  }
  if (row.question_2 && row.answer_2) {
    fields.push({ question: row.question_2, answer: row.answer_2 });
  }

  return {
    event: 'event.confirmed',
    payload: {
      id: row.id,
      state: row.state,
      summary: row.summary,
      description: row.description || '',
      start_at: row.start_at,
      end_at: row.end_at,
      created_at: row.created_at,
      location: row.location,
      url: row.url,
      duration: Math.round((new Date(row.end_at).getTime() - new Date(row.start_at).getTime()) / 60000),
      metadata: {
        utm_source: row.utm_source || null,
        utm_medium: row.utm_medium || null,
        utm_campaign: row.utm_campaign || null,
        utm_term: row.utm_term || null,
        utm_content: row.utm_content || null,
      },
      organizer: attendees[0],
      scheduler: attendees[1],
      attendees,
      link: {
        id: row.link_id,
        name: row.summary,
        slug: 'imported',
      },
      scope: {
        id: 'scope_imported',
        name: row.organizer_display_name,
        slug: row.organizer_display_name.toLowerCase().replace(/\s+/g, ''),
      },
      conferencing: row.location ? {
        type: row.location.includes('meet.google.com') ? 'google_meet' : 'other',
        join_url: row.location,
      } : null,
      additional_info: fields.length > 0 ? fields : null,
    },
  };
}

async function importLead(row: CSVRow): Promise<{ success: boolean; email: string; error?: string }> {
  const payload = csvRowToWebhookPayload(row);

  console.log(`\n📤 Importing: ${row.scheduler_email} (${row.scheduler_display_name})`);
  console.log(`   Created: ${row.created_at}`);
  console.log(`   Meeting: ${row.start_at}`);

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();

    if (!response.ok) {
      console.log(`   ❌ Failed: ${response.status} - ${text}`);
      return { success: false, email: row.scheduler_email, error: text };
    }

    console.log(`   ✅ Success: ${text}`);
    return { success: true, email: row.scheduler_email };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.log(`   ❌ Error: ${errorMsg}`);
    return { success: false, email: row.scheduler_email, error: errorMsg };
  }
}

async function main() {
  console.log('🚀 SavvyCal Dec 8-13 Lead Import');
  console.log('================================\n');

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
    process.exit(1);
  }

  console.log(`📍 Webhook URL: ${WEBHOOK_URL}\n`);

  // Read the filtered CSV
  const csvPath = '/tmp/dec8-13-leads.csv';

  if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV file not found: ${csvPath}`);
    process.exit(1);
  }

  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvContent) as unknown as CSVRow[];

  console.log(`📊 Found ${rows.length} leads to import\n`);

  const results = {
    success: 0,
    failed: 0,
    errors: [] as string[],
  };

  for (const row of rows) {
    // Skip if not confirmed
    if (row.state !== 'confirmed') {
      console.log(`⏭️  Skipping ${row.scheduler_email} (state: ${row.state})`);
      continue;
    }

    const result = await importLead(row);
    if (result.success) {
      results.success++;
    } else {
      results.failed++;
      results.errors.push(`${result.email}: ${result.error}`);
    }

    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n================================');
  console.log('📊 Import Summary');
  console.log('================================');
  console.log(`✅ Successful: ${results.success}`);
  console.log(`❌ Failed: ${results.failed}`);

  if (results.errors.length > 0) {
    console.log('\nErrors:');
    results.errors.forEach(e => console.log(`  - ${e}`));
  }
}

main().catch(console.error);
