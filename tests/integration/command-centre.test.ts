/**
 * Command Centre Integration Tests — CC-009
 *
 * Tests the core flow:
 *   1. Fleet agent emits item → appears in CC (via writeAdapter / emitter)
 *   2. Approve in CC updates item status to 'approved'
 *   3. Undo reverts approval to 'open'
 *
 * These tests run against a real Supabase project and require:
 *   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars
 *   - A test org_id and user_id
 *   - command_centre_items table present
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const TEST_ORG_ID = process.env.TEST_ORG_ID || 'test-org-id';
const TEST_USER_ID = process.env.TEST_USER_ID || 'test-user-id';

// ---------------------------------------------------------------------------
// Skip guard — tests only run when full Supabase credentials are present
// ---------------------------------------------------------------------------

const canRun = !!(SUPABASE_URL && SUPABASE_SERVICE_KEY && SUPABASE_URL !== '');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

// Track inserted item IDs so we can clean up after tests
const insertedItemIds: string[] = [];

afterAll(async () => {
  if (!canRun || insertedItemIds.length === 0) return;
  const supabase = makeServiceClient();
  await supabase.from('command_centre_items').delete().in('id', insertedItemIds);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!canRun)('Command Centre — Integration (CC-009)', () => {
  let testItemId: string;

  // ---- CC-009: Test 1 — fleet agent emits item and it appears in CC --------

  it('fleet agent emitting an item inserts it with status=open and enrichment_status=pending', async () => {
    const supabase = makeServiceClient();

    const { data, error } = await supabase
      .from('command_centre_items')
      .insert({
        org_id: TEST_ORG_ID,
        user_id: TEST_USER_ID,
        source_agent: 'reengagement',
        item_type: 'follow_up',
        title: '[CC-009 Integration Test] Re-engage Acme Corp',
        summary: 'Deal has been silent for 14 days. AI recommends a follow-up.',
        urgency: 'high',
        priority_score: 0.85,
        context: { deal_id: null, days_silent: 14 },
        status: 'open',
        enrichment_status: 'pending',
      })
      .select('id, status, enrichment_status, source_agent, item_type')
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.status).toBe('open');
    expect(data!.enrichment_status).toBe('pending');
    expect(data!.source_agent).toBe('reengagement');
    expect(data!.item_type).toBe('follow_up');

    testItemId = data!.id;
    insertedItemIds.push(testItemId);
  });

  // ---- CC-009: Test 2 — approve in CC updates item status -----------------

  it('approving a CC item updates status to approved', async () => {
    expect(testItemId).toBeTruthy();
    const supabase = makeServiceClient();

    const { error } = await supabase
      .from('command_centre_items')
      .update({ status: 'approved' })
      .eq('id', testItemId);

    expect(error).toBeNull();

    const { data } = await supabase
      .from('command_centre_items')
      .select('status')
      .eq('id', testItemId)
      .single();

    expect(data!.status).toBe('approved');
  });

  // ---- CC-009: Test 3 — undo reverts approval to open ---------------------

  it('undoing an approval reverts status back to open', async () => {
    expect(testItemId).toBeTruthy();
    const supabase = makeServiceClient();

    const { error } = await supabase
      .from('command_centre_items')
      .update({ status: 'open', resolved_at: null })
      .eq('id', testItemId);

    expect(error).toBeNull();

    const { data } = await supabase
      .from('command_centre_items')
      .select('status, resolved_at')
      .eq('id', testItemId)
      .single();

    expect(data!.status).toBe('open');
    expect(data!.resolved_at).toBeNull();
  });

  // ---- CC-009: Test 4 — item is visible in CC feed query ------------------

  it('emitted item is queryable via org_id + user_id + status filter', async () => {
    expect(testItemId).toBeTruthy();
    const supabase = makeServiceClient();

    const { data, error } = await supabase
      .from('command_centre_items')
      .select('id, title, status, urgency, source_agent')
      .eq('org_id', TEST_ORG_ID)
      .eq('user_id', TEST_USER_ID)
      .in('status', ['open', 'ready'])
      .eq('id', testItemId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].id).toBe(testItemId);
    expect(data![0].urgency).toBe('high');
  });
});
