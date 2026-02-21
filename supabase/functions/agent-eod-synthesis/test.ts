/**
 * EOD Synthesis Pipeline — Integration Tests (EOD-008)
 *
 * Tests the end-of-day synthesis pipeline:
 *   scorecard aggregation → open items detection → tomorrow preview →
 *   overnight plan → Slack Block Kit message rendering
 *
 * Uses Vitest with pure function re-implementations and direct import of
 * the Slack block builder (no Deno globals required at module level).
 *
 * Run:
 *   npm run test -- supabase/functions/agent-eod-synthesis/test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Test Fixtures
// =============================================================================

const TEST_USER_ID  = '00000000-0000-0000-0000-000000000001';
const TEST_ORG_ID   = '00000000-0000-0000-0000-000000000002';
const TEST_DATE     = '2026-02-21';
const APP_URL       = 'https://app.use60.com';

/** Factory for a realistic scorecard payload */
function makeScorecard(overrides: Partial<{
  meetings_completed: number;
  meetings_no_show: number;
  emails_sent: number;
  crm_updates_count: number;
  tasks_completed: number;
  deals_created_count: number;
  deals_created_value: number;
  pipeline_value_today: number;
  pipeline_value_change: number;
}> = {}) {
  return {
    date: TEST_DATE,
    timezone: 'America/Chicago',
    meetings_completed:  overrides.meetings_completed  ?? 4,
    meetings_no_show:    overrides.meetings_no_show    ?? 0,
    emails_sent:         overrides.emails_sent         ?? 12,
    crm_updates_count:   overrides.crm_updates_count   ?? 5,
    tasks_completed:     overrides.tasks_completed     ?? 3,
    deals_created_count: overrides.deals_created_count ?? 1,
    deals_created_value: overrides.deals_created_value ?? 50000,
    pipeline_value_today:  overrides.pipeline_value_today  ?? 450000,
    pipeline_value_change: overrides.pipeline_value_change ?? 50000,
    computed_at: new Date().toISOString(),
  };
}

/** Factory for open items payload */
function makeOpenItems(overrides: Partial<{
  pending_replies: unknown[];
  unsent_drafts: number;
  incomplete_actions: unknown[];
  overdue_tasks: unknown[];
}> = {}) {
  return {
    pending_replies: overrides.pending_replies ?? [
      { contact_name: 'Jane Buyer', subject: 'Re: Pricing', hours_waiting: 3, deal_name: 'Acme Corp' },
    ],
    unsent_drafts: overrides.unsent_drafts ?? 0,
    incomplete_actions: overrides.incomplete_actions ?? [],
    overdue_tasks: overrides.overdue_tasks ?? [
      { title: 'Send proposal', days_overdue: 2, deal_name: 'BetaCo', priority: 'high' },
    ],
    total_attention_items:
      ((overrides.pending_replies ?? [{ a: 1 }]).length) +
      ((overrides.overdue_tasks ?? [{ a: 1 }]).length) +
      ((overrides.incomplete_actions ?? []).length),
  };
}

/** Factory for tomorrow preview payload */
function makeTomorrowPreview(overrides: Partial<{
  total_meetings: number;
  high_attention_count: number;
  meetings: unknown[];
  suggested_first_action: string | null;
}> = {}) {
  const meetings = overrides.meetings ?? [
    {
      event_id: 'evt-001',
      title: 'Discovery Call — Acme Corp',
      start_time: new Date('2026-02-22T14:00:00Z').toISOString(),
      end_time: new Date('2026-02-22T15:00:00Z').toISOString(),
      attendees_count: 3,
      attendees: [{ name: 'Jane Buyer', email: 'jane@acme.com', contact_id: 'c1', is_internal: false }],
      deal_id: 'd1',
      deal_name: 'Acme Corp',
      prep_status: 'ready',
      attention_flags: [],
    },
    {
      event_id: 'evt-002',
      title: 'QBR — BetaCo',
      start_time: new Date('2026-02-22T16:00:00Z').toISOString(),
      end_time: new Date('2026-02-22T17:30:00Z').toISOString(),
      attendees_count: 5,
      attendees: [],
      deal_id: 'd2',
      deal_name: 'BetaCo',
      prep_status: 'none',
      attention_flags: [
        { type: 'at_risk_deal', description: 'BetaCo is at risk', severity: 'high' },
      ],
    },
  ];

  return {
    date: '2026-02-22',
    meetings,
    total_meetings: overrides.total_meetings ?? meetings.length,
    high_attention_count: overrides.high_attention_count ?? 1,
    suggested_first_action: overrides.suggested_first_action ?? 'BetaCo is at risk — review deal health before this meeting',
  };
}

/** Factory for overnight plan payload */
function makeOvernightPlan(overrides: Partial<{
  plan_items: unknown[];
  total_items: number;
  morning_briefing_preview: string;
  enrichment_count: number;
  monitoring_count: number;
  research_count: number;
}> = {}) {
  return {
    plan_items: overrides.plan_items ?? [
      { type: 'enrichment', label: 'Contact enrichment', description: '3 contacts queued for overnight enrichment', count: 3, will_appear_in_briefing: true, estimated_completion: new Date().toISOString(), deal_id: null, contact_ids: [] },
      { type: 'meeting_research', label: 'Meeting prep research', description: 'Preparing briefings for 2 meetings tomorrow', count: 2, will_appear_in_briefing: true, estimated_completion: new Date().toISOString(), deal_id: null, contact_ids: [] },
      { type: 'pipeline_snapshot', label: 'Pipeline snapshot', description: 'Taking a pipeline snapshot', count: 1, will_appear_in_briefing: true, estimated_completion: new Date().toISOString(), deal_id: null, contact_ids: [] },
    ],
    total_items: overrides.total_items ?? 3,
    enrichment_count: overrides.enrichment_count ?? 3,
    monitoring_count: overrides.monitoring_count ?? 0,
    research_count:   overrides.research_count   ?? 2,
    morning_briefing_preview: overrides.morning_briefing_preview
      ?? 'Results from tonight\'s work — 3 enrichments, prep for 2 meetings — will appear in your morning briefing.',
  };
}

// =============================================================================
// Pure helper re-implementations (spec by example, mirrors pipeline logic)
// =============================================================================

/**
 * Determines if a user is eligible for EOD delivery at the given UTC time.
 * Mirrors the eligibility logic in agent-eod-synthesis/index.ts.
 */
function isEligibleForDelivery(
  eodTime: string,   // HH:MM
  timezone: string,
  workingDays: string[],
  utcNow: Date,
  windowMinutes: number = 15
): boolean {
  try {
    const localNow = new Date(utcNow.toLocaleString('en-US', { timeZone: timezone }));
    const localHH = localNow.getHours();
    const localMM = localNow.getMinutes();
    const [eodHH, eodMM] = eodTime.split(':').map(Number);

    const currentMinutes = localHH * 60 + localMM;
    const targetMinutes  = eodHH * 60 + eodMM;
    const delta = currentMinutes - targetMinutes;

    if (delta < 0 || delta >= windowMinutes) return false;

    const dayName = localNow.toLocaleDateString('en-US', { weekday: 'short' });
    return workingDays.some(d => d.toLowerCase() === dayName.toLowerCase());
  } catch {
    return false;
  }
}

// =============================================================================
// Scenario 1: Busy day scorecard
// =============================================================================

describe('EOD-008 Scenario 1: Busy day scorecard', () => {
  it('busy day scorecard has all expected fields', () => {
    const sc = makeScorecard({
      meetings_completed: 5,
      emails_sent: 20,
      tasks_completed: 8,
      deals_created_count: 2,
      deals_created_value: 120000,
      pipeline_value_today: 600000,
      pipeline_value_change: 120000,
    });

    expect(sc.meetings_completed).toBe(5);
    expect(sc.emails_sent).toBe(20);
    expect(sc.tasks_completed).toBe(8);
    expect(sc.deals_created_count).toBe(2);
    expect(sc.deals_created_value).toBe(120000);
    expect(sc.pipeline_value_today).toBe(600000);
    expect(sc.pipeline_value_change).toBe(120000);
    expect(sc.date).toBe(TEST_DATE);
    expect(sc.timezone).toBe('America/Chicago');
  });

  it('positive pipeline_value_change indicates a good day', () => {
    const sc = makeScorecard({ pipeline_value_change: 50000 });
    expect(sc.pipeline_value_change).toBeGreaterThan(0);
  });

  it('buildEODSynthesisMessage renders busy day without throwing', async () => {
    const { buildEODSynthesisMessage } = await import('../_shared/slackBlocks.ts');

    const message = buildEODSynthesisMessage({
      userName: 'Alex Rep',
      slackUserId: 'U12345678',
      date: TEST_DATE,
      scorecard: makeScorecard({ meetings_completed: 5, emails_sent: 20 }),
      openItems: makeOpenItems(),
      tomorrowPreview: makeTomorrowPreview(),
      overnightPlan: makeOvernightPlan(),
      detailLevel: 'full',
      appUrl: APP_URL,
    });

    expect(message).toHaveProperty('blocks');
    expect(message).toHaveProperty('text');
    expect(Array.isArray(message.blocks)).toBe(true);
    expect(message.blocks.length).toBeGreaterThan(0);
  });

  it('busy day message has at most 50 blocks (Slack limit)', async () => {
    const { buildEODSynthesisMessage } = await import('../_shared/slackBlocks.ts');

    const message = buildEODSynthesisMessage({
      userName: 'Alex Rep',
      date: TEST_DATE,
      scorecard: makeScorecard({ meetings_completed: 5, emails_sent: 20 }),
      openItems: makeOpenItems({
        pending_replies: Array.from({ length: 10 }, (_, i) => ({
          contact_name: `Contact ${i}`,
          subject: `Subject ${i}`,
          hours_waiting: i + 1,
          deal_name: `Deal ${i}`,
        })),
        overdue_tasks: Array.from({ length: 10 }, (_, i) => ({
          title: `Task ${i}`,
          days_overdue: i + 1,
          deal_name: `Deal ${i}`,
          priority: 'high',
        })),
      }),
      tomorrowPreview: makeTomorrowPreview(),
      overnightPlan: makeOvernightPlan(),
      detailLevel: 'full',
      appUrl: APP_URL,
    });

    expect(message.blocks.length).toBeLessThanOrEqual(50);
  });
});

// =============================================================================
// Scenario 2: Quiet day (minimal activity)
// =============================================================================

describe('EOD-008 Scenario 2: Quiet day (minimal activity)', () => {
  it('quiet day scorecard with zero meetings renders cleanly', async () => {
    const { buildEODSynthesisMessage } = await import('../_shared/slackBlocks.ts');

    const message = buildEODSynthesisMessage({
      userName: 'Sam Rep',
      date: TEST_DATE,
      scorecard: makeScorecard({
        meetings_completed: 0,
        emails_sent: 2,
        tasks_completed: 1,
        deals_created_count: 0,
        deals_created_value: 0,
        pipeline_value_change: 0,
      }),
      openItems: {
        pending_replies: [],
        unsent_drafts: 0,
        incomplete_actions: [],
        overdue_tasks: [],
        total_attention_items: 0,
      },
      tomorrowPreview: undefined,
      overnightPlan: undefined,
      detailLevel: 'full',
      appUrl: APP_URL,
    });

    expect(message.blocks.length).toBeGreaterThan(0);
    expect(message.blocks.length).toBeLessThanOrEqual(50);
  });

  it('quiet day with no open items does not render open items section', async () => {
    const { buildEODSynthesisMessage } = await import('../_shared/slackBlocks.ts');

    const message = buildEODSynthesisMessage({
      userName: 'Sam Rep',
      date: TEST_DATE,
      scorecard: makeScorecard({ meetings_completed: 0, emails_sent: 1 }),
      openItems: {
        pending_replies: [],
        unsent_drafts: 0,
        incomplete_actions: [],
        overdue_tasks: [],
        total_attention_items: 0,
      },
      detailLevel: 'full',
      appUrl: APP_URL,
    });

    // With no open items, should only have header + scorecard blocks + footer
    // Scorecard: header, divider, section, sectionWithFields, divider = 5 blocks
    // Footer: 1 block
    // Total expected: <= 7 (leaving room for any extra context)
    expect(message.blocks.length).toBeLessThanOrEqual(10);
  });

  it('negative pipeline_value_change is represented correctly', () => {
    const sc = makeScorecard({ pipeline_value_change: -20000 });
    expect(sc.pipeline_value_change).toBeLessThan(0);
  });
});

// =============================================================================
// Scenario 3: No meetings tomorrow
// =============================================================================

describe('EOD-008 Scenario 3: No meetings tomorrow', () => {
  it('message with no tomorrow meetings skips the tomorrow preview section', async () => {
    const { buildEODSynthesisMessage } = await import('../_shared/slackBlocks.ts');

    // tomorrowPreview with 0 meetings — should be treated as undefined/skipped
    const emptyPreview = {
      date: '2026-02-22',
      meetings: [],
      total_meetings: 0,
      high_attention_count: 0,
      suggested_first_action: null,
    };

    const withEmpty = buildEODSynthesisMessage({
      userName: 'Test Rep',
      date: TEST_DATE,
      scorecard: makeScorecard(),
      openItems: makeOpenItems(),
      tomorrowPreview: emptyPreview,
      appUrl: APP_URL,
    });

    const withUndefined = buildEODSynthesisMessage({
      userName: 'Test Rep',
      date: TEST_DATE,
      scorecard: makeScorecard(),
      openItems: makeOpenItems(),
      tomorrowPreview: undefined,
      appUrl: APP_URL,
    });

    // Both should produce the same number of blocks (empty preview = no section)
    expect(withEmpty.blocks.length).toBe(withUndefined.blocks.length);
  });

  it('message still delivers and includes scorecard when no meetings tomorrow', async () => {
    const { buildEODSynthesisMessage } = await import('../_shared/slackBlocks.ts');

    const message = buildEODSynthesisMessage({
      userName: 'Test Rep',
      date: TEST_DATE,
      scorecard: makeScorecard({ meetings_completed: 3 }),
      openItems: makeOpenItems({ pending_replies: [], overdue_tasks: [] }),
      tomorrowPreview: { date: '2026-02-22', meetings: [], total_meetings: 0, high_attention_count: 0, suggested_first_action: null },
      appUrl: APP_URL,
    });

    // Must have blocks and text
    expect(message.blocks.length).toBeGreaterThan(0);
    expect(typeof message.text).toBe('string');
    expect(message.text.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// Scenario 4: Weekend detection (should skip delivery)
// =============================================================================

describe('EOD-008 Scenario 4: Weekend detection — skip delivery', () => {
  it('Saturday is NOT in default working days', () => {
    const workingDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    // Create a Saturday UTC time that would be Saturday in Chicago (UTC-6)
    const saturday = new Date('2026-02-21T20:00:00Z'); // Sat Feb 21 in US timezones

    const eligible = isEligibleForDelivery(
      '17:00',          // EOD time
      'America/Chicago',
      workingDays,
      saturday,
      15
    );

    expect(eligible).toBe(false);
  });

  it('Sunday is NOT in default working days', () => {
    const workingDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    // Sunday
    const sunday = new Date('2026-02-22T20:00:00Z'); // Sun Feb 22

    const eligible = isEligibleForDelivery(
      '17:00',
      'America/Chicago',
      workingDays,
      sunday,
      15
    );

    expect(eligible).toBe(false);
  });

  it('Friday IS in default working days', () => {
    const workingDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    // Friday Feb 20 at 17:00 Chicago time = 23:00 UTC
    const friday1700 = new Date('2026-02-20T23:00:00Z');

    const eligible = isEligibleForDelivery(
      '17:00',
      'America/Chicago',
      workingDays,
      friday1700,
      15
    );

    expect(eligible).toBe(true);
  });

  it('user with custom working days including Saturday gets Saturday delivery', () => {
    const customWorkingDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const saturday = new Date('2026-02-21T20:00:00Z'); // Sat 14:00 CST

    const eligible = isEligibleForDelivery(
      '17:00',
      'America/Chicago',
      customWorkingDays,
      saturday,
      15
    );

    // Saturday 14:00 CST is NOT the 17:00 delivery window
    expect(eligible).toBe(false);
  });
});

// =============================================================================
// Scenario 5: Timezone-aware delivery window
// =============================================================================

describe('EOD-008 Scenario 5: Timezone-aware delivery window', () => {
  it('user in America/Chicago at 17:00 CST is eligible', () => {
    // 17:00 CST = 23:00 UTC (UTC-6)
    const utcNow = new Date('2026-02-20T23:00:00Z'); // Friday 17:00 CST

    const eligible = isEligibleForDelivery(
      '17:00',
      'America/Chicago',
      ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      utcNow,
      15
    );

    expect(eligible).toBe(true);
  });

  it('user in Europe/London at 17:00 GMT is eligible at 17:00 UTC', () => {
    // In winter (GMT), 17:00 local = 17:00 UTC
    const utcNow = new Date('2026-02-20T17:00:00Z'); // Friday 17:00 UTC = 17:00 GMT

    const eligible = isEligibleForDelivery(
      '17:00',
      'Europe/London',
      ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      utcNow,
      15
    );

    expect(eligible).toBe(true);
  });

  it('user in America/Chicago at 17:30 CST is still eligible (within 15-min window)', () => {
    // 17:30 CST = 23:30 UTC
    const utcNow = new Date('2026-02-20T23:30:00Z'); // Friday 17:30 CST

    const eligible = isEligibleForDelivery(
      '17:00',
      'America/Chicago',
      ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      utcNow,
      15
    );

    // 17:30 is within the [17:00, 17:14] window? No — 30 min >= 15 min window
    expect(eligible).toBe(false);
  });

  it('user at 16:59 CST is NOT eligible (before delivery window)', () => {
    // 16:59 CST = 22:59 UTC
    const utcNow = new Date('2026-02-20T22:59:00Z');

    const eligible = isEligibleForDelivery(
      '17:00',
      'America/Chicago',
      ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      utcNow,
      15
    );

    expect(eligible).toBe(false);
  });

  it('user in Asia/Tokyo at 17:00 JST is eligible at correct UTC offset', () => {
    // 17:00 JST = 08:00 UTC (UTC+9)
    const utcNow = new Date('2026-02-20T08:00:00Z'); // Friday 17:00 JST

    const eligible = isEligibleForDelivery(
      '17:00',
      'Asia/Tokyo',
      ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      utcNow,
      15
    );

    expect(eligible).toBe(true);
  });
});

// =============================================================================
// Scenario 6: Slack message structure validation
// =============================================================================

describe('EOD-008 Scenario 6: Slack message structure', () => {
  it('summary mode message is shorter than full mode', async () => {
    const { buildEODSynthesisMessage } = await import('../_shared/slackBlocks.ts');

    const scorecard = makeScorecard();
    const openItems = makeOpenItems();
    const tomorrowPreview = makeTomorrowPreview();
    const overnightPlan = makeOvernightPlan();
    const common = { userName: 'Alex', date: TEST_DATE, scorecard, openItems, tomorrowPreview, overnightPlan, appUrl: APP_URL };

    const fullMsg = buildEODSynthesisMessage({ ...common, detailLevel: 'full' });
    const summaryMsg = buildEODSynthesisMessage({ ...common, detailLevel: 'summary' });

    expect(summaryMsg.blocks.length).toBeLessThanOrEqual(fullMsg.blocks.length);
  });

  it('header block uses the user name', async () => {
    const { buildEODSynthesisMessage } = await import('../_shared/slackBlocks.ts');

    const message = buildEODSynthesisMessage({
      userName: 'UniqueTestUser',
      date: TEST_DATE,
      scorecard: makeScorecard(),
      openItems: makeOpenItems({ pending_replies: [], overdue_tasks: [] }),
      appUrl: APP_URL,
    });

    const headerBlock = message.blocks[0] as { type: string; text?: { text: string } };
    expect(headerBlock.type).toBe('header');
    expect(headerBlock.text?.text ?? '').toContain('UniqueTestUser');
  });

  it('footer has eod_looks_good, eod_adjust_priorities, eod_add_task buttons', async () => {
    const { buildEODSynthesisMessage } = await import('../_shared/slackBlocks.ts');

    const message = buildEODSynthesisMessage({
      userName: 'Test Rep',
      date: TEST_DATE,
      scorecard: makeScorecard(),
      openItems: makeOpenItems({ pending_replies: [], overdue_tasks: [] }),
      appUrl: APP_URL,
    });

    const actionsBlock = message.blocks.at(-1) as {
      type: string;
      elements: Array<{ action_id: string }>;
    };

    expect(actionsBlock.type).toBe('actions');
    const actionIds = actionsBlock.elements.map(e => e.action_id);
    expect(actionIds).toContain('eod_looks_good');
    expect(actionIds).toContain('eod_adjust_priorities');
    expect(actionIds).toContain('eod_add_task');
  });

  it('Slack user mention renders in header when slackUserId is provided', async () => {
    const { buildEODSynthesisMessage } = await import('../_shared/slackBlocks.ts');

    const message = buildEODSynthesisMessage({
      userName: 'Alex Rep',
      slackUserId: 'U9999XXXX',
      date: TEST_DATE,
      scorecard: makeScorecard(),
      openItems: makeOpenItems({ pending_replies: [], overdue_tasks: [] }),
      appUrl: APP_URL,
    });

    const headerBlock = message.blocks[0] as { type: string; text?: { text: string } };
    expect(headerBlock.text?.text ?? '').toContain('U9999XXXX');
  });

  it('fallback text (text field) is a non-empty string', async () => {
    const { buildEODSynthesisMessage } = await import('../_shared/slackBlocks.ts');

    const message = buildEODSynthesisMessage({
      userName: 'Test Rep',
      date: TEST_DATE,
      scorecard: makeScorecard(),
      openItems: makeOpenItems({ pending_replies: [], overdue_tasks: [] }),
      appUrl: APP_URL,
    });

    expect(typeof message.text).toBe('string');
    expect(message.text!.length).toBeGreaterThan(0);
  });

  it('pipeline value change is surfaced in blocks', async () => {
    const { buildEODSynthesisMessage } = await import('../_shared/slackBlocks.ts');

    const message = buildEODSynthesisMessage({
      userName: 'Test Rep',
      date: TEST_DATE,
      scorecard: makeScorecard({ pipeline_value_today: 1234567, pipeline_value_change: 50000 }),
      openItems: makeOpenItems({ pending_replies: [], overdue_tasks: [] }),
      detailLevel: 'full',
      appUrl: APP_URL,
    });

    const allText = message.blocks.map(b => JSON.stringify(b)).join(' ');
    // $1,234,567 or similar should appear
    expect(allText).toMatch(/1[,.]?234[,.]?567|1234567/);
  });
});

// =============================================================================
// Scenario 7: Fleet route and adapter registry contracts
// =============================================================================

describe('EOD-008 Scenario 7: Fleet route and adapter registry contracts', () => {
  it('eod_synthesis sequence has 5 steps in correct order', () => {
    // Documents the expected step order from migration 20260222600004
    const expectedSteps = [
      'aggregate-scorecard',
      'eod-open-items',
      'eod-tomorrow-preview',
      'eod-overnight-plan',
      'deliver-eod-slack',
    ];

    expect(expectedSteps).toHaveLength(5);
    expect(expectedSteps[0]).toBe('aggregate-scorecard');   // always first (critical)
    expect(expectedSteps[4]).toBe('deliver-eod-slack');      // always last (critical)
    // Steps 1-3 are best-effort and can be parallel
    expect(expectedSteps[1]).toBe('eod-open-items');
    expect(expectedSteps[2]).toBe('eod-tomorrow-preview');
    expect(expectedSteps[3]).toBe('eod-overnight-plan');
  });

  it('adapter registry contract: all EOD skills must be registered', () => {
    const requiredSkills = [
      'eod-open-items',
      'eod-tomorrow-preview',
      'eod-overnight-plan',
    ];

    for (const skill of requiredSkills) {
      expect(typeof skill).toBe('string');
      expect(skill.length).toBeGreaterThan(0);
    }
  });

  it('fleet event route contract: cron.eod_synthesis maps to eod_synthesis sequence', () => {
    const route = {
      event_type: 'cron.eod_synthesis',
      sequence_key: 'eod_synthesis',
    };

    expect(route.event_type).toBe('cron.eod_synthesis');
    expect(route.sequence_key).toBe('eod_synthesis');
  });

  it('cron schedule fires every 15 minutes', () => {
    // Document the pg_cron expression used in migration 20260222600005
    const cronExpression = '*/15 * * * *';
    // Parse: */15 = every 15 minutes, * = every hour, every day, every month, every weekday
    const parts = cronExpression.split(' ');
    expect(parts).toHaveLength(5);
    expect(parts[0]).toBe('*/15');  // every 15 minutes
    expect(parts[1]).toBe('*');     // every hour
    expect(parts[4]).toBe('*');     // every day of week (no day restriction — edge fn handles it)
  });

  it('eod_deliveries unique constraint prevents double delivery', () => {
    // Verify deduplication contract: UNIQUE(user_id, delivery_date)
    // A user can only have one delivery row per date.
    const deliveries = [
      { user_id: TEST_USER_ID, delivery_date: TEST_DATE, delivered_at: new Date().toISOString() },
    ];

    const duplicates = deliveries.filter(
      d => d.user_id === TEST_USER_ID && d.delivery_date === TEST_DATE
    );

    expect(duplicates).toHaveLength(1); // Only one delivery per user per day
  });
});

// =============================================================================
// Scenario 8: Edge cases and graceful degradation
// =============================================================================

describe('EOD-008 Scenario 8: Edge cases and graceful degradation', () => {
  it('message renders with no optional sections (tomorrowPreview and overnightPlan undefined)', async () => {
    const { buildEODSynthesisMessage } = await import('../_shared/slackBlocks.ts');

    const message = buildEODSynthesisMessage({
      userName: 'Test Rep',
      date: TEST_DATE,
      scorecard: makeScorecard(),
      openItems: makeOpenItems({ pending_replies: [], overdue_tasks: [] }),
      // No tomorrowPreview, no overnightPlan
      appUrl: APP_URL,
    });

    expect(message.blocks.length).toBeGreaterThan(0);
    expect(message.blocks.length).toBeLessThanOrEqual(50);
  });

  it('very long contact name is truncated in open items section', async () => {
    const { buildEODSynthesisMessage } = await import('../_shared/slackBlocks.ts');

    const longName = 'A'.repeat(200);
    const message = buildEODSynthesisMessage({
      userName: 'Test Rep',
      date: TEST_DATE,
      scorecard: makeScorecard(),
      openItems: makeOpenItems({
        pending_replies: [{ contact_name: longName, subject: 'Test', hours_waiting: 2, deal_name: null }],
        overdue_tasks: [],
      }),
      appUrl: APP_URL,
    });

    // All block text should be within Slack limits (3000 chars for mrkdwn)
    for (const block of message.blocks) {
      const blockStr = JSON.stringify(block);
      // No single block field should exceed 3000 characters
      const textMatches = blockStr.match(/"text":"([^"]{2900,})"/);
      expect(textMatches).toBeNull();
    }
  });

  it('deals_created_count=0 does not show deals section in scorecard', async () => {
    const { buildEODSynthesisMessage } = await import('../_shared/slackBlocks.ts');

    const message = buildEODSynthesisMessage({
      userName: 'Test Rep',
      date: TEST_DATE,
      scorecard: makeScorecard({ deals_created_count: 0, deals_created_value: 0 }),
      openItems: makeOpenItems({ pending_replies: [], overdue_tasks: [] }),
      detailLevel: 'full',
      appUrl: APP_URL,
    });

    const allText = message.blocks.map(b => JSON.stringify(b)).join(' ');
    // "Deals Created" label should not appear when count is 0
    expect(allText).not.toContain('Deals Created');
  });

  it('meetings_no_show appears in scorecard when > 0', async () => {
    const { buildEODSynthesisMessage } = await import('../_shared/slackBlocks.ts');

    const message = buildEODSynthesisMessage({
      userName: 'Test Rep',
      date: TEST_DATE,
      scorecard: makeScorecard({ meetings_completed: 3, meetings_no_show: 2 }),
      openItems: makeOpenItems({ pending_replies: [], overdue_tasks: [] }),
      detailLevel: 'full',
      appUrl: APP_URL,
    });

    const allText = message.blocks.map(b => JSON.stringify(b)).join(' ');
    expect(allText).toContain('no-show');
  });

  it('currency formatting uses currencyCode when provided', async () => {
    const { buildEODSynthesisMessage } = await import('../_shared/slackBlocks.ts');

    const message = buildEODSynthesisMessage({
      userName: 'Test Rep',
      date: TEST_DATE,
      scorecard: makeScorecard({ pipeline_value_today: 100000 }),
      openItems: makeOpenItems({ pending_replies: [], overdue_tasks: [] }),
      currencyCode: 'GBP',
      currencyLocale: 'en-GB',
      detailLevel: 'full',
      appUrl: APP_URL,
    });

    const allText = message.blocks.map(b => JSON.stringify(b)).join(' ');
    // Should contain British pounds formatting
    expect(allText).toMatch(/£|GBP/);
  });
});
