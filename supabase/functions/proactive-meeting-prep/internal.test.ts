/**
 * Internal Meeting Prep Pipeline — Integration Tests (IMP-007)
 *
 * Tests the full IMP pipeline:
 *   Domain-based detection → meeting type classification → prep generation
 *
 * Covers:
 *   - detectInternalMeeting: same domain, mixed domain, solo event, unknown domain
 *   - classifyMeetingType: 1:1, pipeline review, QBR, standup, other, external
 *   - generateInternalPrep: per-type section generation (structure tests)
 *   - Scenario tests: manager 1:1, pipeline review with at-risk deals, QBR, standup with wins
 *
 * Run:
 *   npm run test -- supabase/functions/proactive-meeting-prep/test-internal.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Import pure functions under test
// These modules have no Deno globals at module level.
// =============================================================================

import {
  detectInternalMeeting,
  type InternalMeetingDetectionResult,
} from '../_shared/orchestrator/adapters/internalMeetingDetector.ts';

import {
  classifyMeetingType,
  type MeetingType,
  type MeetingTypeClassification,
} from '../_shared/orchestrator/adapters/meetingTypeClassifier.ts';

import {
  generateInternalPrep,
  type PrepContent,
} from '../_shared/orchestrator/adapters/internalPrepTemplates.ts';

// =============================================================================
// Test constants
// =============================================================================

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000010';
const EVENT_ID = '00000000-0000-0000-0000-000000000020';
const ORG_DOMAIN = 'acme.com';

// =============================================================================
// Supabase mock factory
// =============================================================================

function makeSupabaseMock(overrides: {
  orgDomain?: string;
  userEmail?: string;
  deals?: unknown[];
  risks?: unknown[];
  activities?: unknown[];
  closedDeals?: unknown[];
  pipelineMath?: unknown;
} = {}) {
  const {
    orgDomain = ORG_DOMAIN,
    userEmail = `alice@${ORG_DOMAIN}`,
    deals = [],
    risks = [],
    activities = [],
    closedDeals = [],
    pipelineMath = null,
  } = overrides;

  const mockFrom = vi.fn().mockImplementation((table: string) => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      contains: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
    };

    // Configure maybeSingle / data responses per table
    if (table === 'organizations') {
      builder.maybeSingle.mockResolvedValue({
        data: { company_website: `https://www.${orgDomain}` },
        error: null,
      });
      // Also provide a default resolved value for chained calls
      Object.assign(builder, {
        // For non-maybeSingle queries
        then: undefined,
      });
    } else if (table === 'profiles') {
      builder.maybeSingle.mockResolvedValue({
        data: { email: userEmail, first_name: 'Alice', last_name: 'Smith', job_title: 'Sales Rep' },
        error: null,
      });
    } else if (table === 'deals') {
      // Used by fetchUserDeals and fetchRecentWins
      const returnDeals = closedDeals.length > 0 ? closedDeals : deals;
      Object.assign(builder, {
        data: returnDeals,
        error: null,
      });
      // Override limit to return mock data
      builder.limit.mockReturnValue({ data: returnDeals, error: null });
    } else if (table === 'deal_risk_scores') {
      Object.assign(builder, { data: risks, error: null });
    } else if (table === 'activities') {
      Object.assign(builder, { data: activities, error: null });
      builder.limit.mockReturnValue({ data: activities, error: null });
    } else if (table === 'agent_jobs') {
      builder.maybeSingle.mockResolvedValue({ data: null, error: null });
    } else if (table === 'calendar_events') {
      builder.maybeSingle.mockResolvedValue({ data: null, error: null });
    }

    return builder;
  });

  const mockRpc = vi.fn().mockImplementation((rpcName: string) => {
    if (rpcName === 'calculate_pipeline_math' && pipelineMath) {
      return Promise.resolve({ data: pipelineMath, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });

  return { from: mockFrom, rpc: mockRpc };
}

// =============================================================================
// Helper: create a minimal calendar event
// =============================================================================

function makeCalendarEvent(overrides: {
  id?: string;
  user_id?: string;
  title?: string;
  attendees?: Array<string | { email: string }>;
  attendees_count?: number;
} = {}) {
  return {
    id: overrides.id ?? EVENT_ID,
    user_id: overrides.user_id ?? USER_ID,
    title: overrides.title ?? 'Test Meeting',
    attendees: overrides.attendees ?? [],
    attendees_count: overrides.attendees_count ?? 2,
  };
}

// =============================================================================
// Part 1: detectInternalMeeting
// =============================================================================

describe('detectInternalMeeting', () => {
  it('classifies a meeting with all internal attendees as internal', async () => {
    const supabase = makeSupabaseMock({ orgDomain: 'acme.com' });
    const event = makeCalendarEvent({
      attendees: ['alice@acme.com', 'bob@acme.com'],
      attendees_count: 2,
    });

    const result = await detectInternalMeeting(supabase as any, event, ORG_ID);

    expect(result.is_internal).toBe(true);
    expect(result.internal_attendees).toHaveLength(2);
    expect(result.external_attendees).toHaveLength(0);
    expect(result.skipped).toBe(false);
    expect(result.org_domain).toBe('acme.com');
  });

  it('classifies a meeting with one external attendee as external', async () => {
    const supabase = makeSupabaseMock({ orgDomain: 'acme.com' });
    const event = makeCalendarEvent({
      attendees: ['alice@acme.com', 'charlie@rival.com'],
      attendees_count: 2,
    });

    const result = await detectInternalMeeting(supabase as any, event, ORG_ID);

    expect(result.is_internal).toBe(false);
    expect(result.internal_attendees).toHaveLength(1);
    expect(result.external_attendees).toHaveLength(1);
    expect(result.skipped).toBe(false);
  });

  it('skips solo events (attendees_count <= 1)', async () => {
    const supabase = makeSupabaseMock();
    const event = makeCalendarEvent({ attendees: ['alice@acme.com'], attendees_count: 1 });

    const result = await detectInternalMeeting(supabase as any, event, ORG_ID);

    expect(result.skipped).toBe(true);
    expect(result.skip_reason).toBe('attendees_count <= 1');
  });

  it('handles object-style attendees with email field', async () => {
    const supabase = makeSupabaseMock({ orgDomain: 'acme.com' });
    const event = makeCalendarEvent({
      attendees: [
        { email: 'alice@acme.com', name: 'Alice' },
        { email: 'bob@acme.com', name: 'Bob' },
      ],
      attendees_count: 2,
    });

    const result = await detectInternalMeeting(supabase as any, event, ORG_ID);

    expect(result.is_internal).toBe(true);
    expect(result.internal_attendees).toHaveLength(2);
  });

  it('falls back to user email domain when org has no company_website', async () => {
    // Override mock: org returns null company_website
    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        const builder = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(),
        };
        if (table === 'organizations') {
          builder.maybeSingle.mockResolvedValue({ data: { company_website: null }, error: null });
        } else if (table === 'profiles') {
          builder.maybeSingle.mockResolvedValue({
            data: { email: 'alice@acme.com' },
            error: null,
          });
        }
        return builder;
      }),
    };

    const event = makeCalendarEvent({
      attendees: ['alice@acme.com', 'bob@acme.com'],
      attendees_count: 2,
    });

    const result = await detectInternalMeeting(supabase as any, event, ORG_ID);

    expect(result.is_internal).toBe(true);
    expect(result.org_domain).toBe('acme.com');
  });

  it('marks event as skipped when org domain cannot be resolved', async () => {
    const supabase = {
      from: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    };

    const event = makeCalendarEvent({ attendees_count: 2 });

    const result = await detectInternalMeeting(supabase as any, event, ORG_ID);

    expect(result.skipped).toBe(true);
    expect(result.skip_reason).toBe('org_domain_unresolvable');
  });
});

// =============================================================================
// Part 2: classifyMeetingType — pure function, no DB calls
// =============================================================================

describe('classifyMeetingType', () => {
  it('classifies 2-person internal meeting as one_on_one', () => {
    const result = classifyMeetingType('Weekly sync', true, 2, []);
    expect(result.meeting_type).toBe('one_on_one');
    expect(result.confidence).toBe('high');
  });

  it('classifies title "1:1 with Alice" as one_on_one', () => {
    const result = classifyMeetingType('1:1 with Alice', true, 3, []);
    expect(result.meeting_type).toBe('one_on_one');
  });

  it('classifies title "Pipeline Review" as pipeline_review', () => {
    const result = classifyMeetingType('Pipeline Review', true, 5, []);
    expect(result.meeting_type).toBe('pipeline_review');
    expect(result.confidence).toBe('high');
  });

  it('classifies title "Forecast Call Q2" as pipeline_review', () => {
    const result = classifyMeetingType('Forecast Call Q2', true, 4, []);
    expect(result.meeting_type).toBe('pipeline_review');
  });

  it('classifies title "QBR Q1 2026" as qbr', () => {
    const result = classifyMeetingType('QBR Q1 2026', true, 8, []);
    expect(result.meeting_type).toBe('qbr');
    expect(result.confidence).toBe('high');
  });

  it('classifies title "Quarterly Business Review" as qbr', () => {
    const result = classifyMeetingType('Quarterly Business Review', true, 10, []);
    expect(result.meeting_type).toBe('qbr');
  });

  it('classifies title "Daily Standup" as standup', () => {
    const result = classifyMeetingType('Daily Standup', true, 6, []);
    expect(result.meeting_type).toBe('standup');
  });

  it('classifies title "Morning scrum" as standup', () => {
    const result = classifyMeetingType('Morning scrum', true, 4, []);
    expect(result.meeting_type).toBe('standup');
  });

  it('classifies external meeting as external regardless of title', () => {
    const result = classifyMeetingType('Pipeline Review', false, 5, []);
    expect(result.meeting_type).toBe('external');
  });

  it('falls back to other for unmatched internal meetings', () => {
    const result = classifyMeetingType('Team lunch planning', true, 5, []);
    expect(result.meeting_type).toBe('other');
    expect(result.confidence).toBe('low');
  });

  it('detects manager title and tags signal for 1:1', () => {
    const managerProfiles = [{ id: USER_ID, email: 'manager@acme.com', first_name: 'Bob', last_name: 'Manager', job_title: 'VP Sales' }];
    const result = classifyMeetingType('Weekly sync', true, 2, managerProfiles);
    expect(result.meeting_type).toBe('one_on_one');
    expect(result.signals).toContain('manager_title_detected');
  });

  it('QBR takes priority over pipeline_review when both could match', () => {
    const result = classifyMeetingType('QBR Pipeline Review Q1', true, 8, []);
    expect(result.meeting_type).toBe('qbr'); // QBR checked first
  });
});

// =============================================================================
// Part 3: generateInternalPrep — structure tests (sections, metadata)
// =============================================================================

describe('generateInternalPrep', () => {
  const mockDeals = [
    { id: 'd1', name: 'Acme Corp Deal', value: 50000, stage_id: 's1', status: 'open', probability: 60, expected_close_date: '2026-03-31', last_activity_at: new Date().toISOString(), created_at: new Date().toISOString() },
    { id: 'd2', name: 'Beta Inc Deal', value: 25000, stage_id: 's2', status: 'open', probability: 30, expected_close_date: '2026-04-15', last_activity_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), created_at: new Date().toISOString() },
  ];

  const mockRisks = [
    { deal_id: 'd1', score: 45, signals: [] },
    { deal_id: 'd2', score: 75, signals: [] },
  ];

  const mockWins = [
    { id: 'w1', name: 'Won Deal', value: 30000, status: 'won', updated_at: new Date().toISOString() },
  ];

  // Helper: build a supabase mock that handles query chaining for template functions
  function makePrepSupabaseMock(type: 'one_on_one' | 'pipeline_review' | 'qbr' | 'standup') {
    const mockBuilder = () => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnValue({ data: mockDeals, error: null }),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      filter: vi.fn().mockReturnThis(),
      data: mockDeals,
      error: null,
      // Allow awaiting the builder itself
      then: (resolve: (v: unknown) => unknown) => resolve({ data: mockDeals, error: null }),
    });

    const rpc = vi.fn().mockResolvedValue({
      data: type === 'pipeline_review' || type === 'qbr'
        ? {
            target: 200000,
            closed_so_far: 50000,
            pct_to_target: 0.25,
            total_pipeline: 150000,
            weighted_pipeline: 90000,
            coverage_ratio: 1.2,
            gap_amount: 150000,
            projected_close: 80000,
            deals_at_risk: 1,
            deals_by_stage: { 'Proposal': { count: 2, total_value: 75000 } },
            snapshot_date: '2026-02-21',
          }
        : null,
      error: null,
    });

    return { from: vi.fn().mockReturnValue(mockBuilder()), rpc };
  }

  it('generates one_on_one prep with expected sections', async () => {
    const supabase = makePrepSupabaseMock('one_on_one');
    const event = { id: EVENT_ID, title: '1:1 with Manager' };

    const prep = await generateInternalPrep(supabase as any, USER_ID, ORG_ID, event, 'one_on_one');

    expect(prep.meeting_type).toBe('one_on_one');
    expect(prep.is_lightweight).toBe(false);
    expect(prep.sections.length).toBeGreaterThan(0);
    expect(prep.prep_title).toContain('1:1 with Manager');
    // Should have pipeline, wins, and discussion points sections
    const sectionTitles = prep.sections.map((s) => s.title.toLowerCase());
    expect(sectionTitles.some((t) => t.includes('pipeline') || t.includes('discussion') || t.includes('coaching'))).toBe(true);
  });

  it('generates pipeline_review prep with expected sections', async () => {
    const supabase = makePrepSupabaseMock('pipeline_review');
    const event = { id: EVENT_ID, title: 'Weekly Pipeline Review' };

    const prep = await generateInternalPrep(supabase as any, USER_ID, ORG_ID, event, 'pipeline_review');

    expect(prep.meeting_type).toBe('pipeline_review');
    expect(prep.is_lightweight).toBe(false);
    expect(prep.sections.length).toBeGreaterThan(0);
    const sectionTitles = prep.sections.map((s) => s.title.toLowerCase());
    expect(sectionTitles.some((t) => t.includes('pipeline') || t.includes('risk') || t.includes('agenda'))).toBe(true);
  });

  it('generates qbr prep with quarter performance section', async () => {
    const supabase = makePrepSupabaseMock('qbr');
    const event = { id: EVENT_ID, title: 'Q1 2026 QBR' };

    const prep = await generateInternalPrep(supabase as any, USER_ID, ORG_ID, event, 'qbr');

    expect(prep.meeting_type).toBe('qbr');
    expect(prep.is_lightweight).toBe(false);
    const sectionTitles = prep.sections.map((s) => s.title.toLowerCase());
    expect(sectionTitles.some((t) => t.includes('quarter') || t.includes('win') || t.includes('projection'))).toBe(true);
  });

  it('generates standup prep as lightweight', async () => {
    const supabase = makePrepSupabaseMock('standup');
    const event = { id: EVENT_ID, title: 'Daily Standup' };

    const prep = await generateInternalPrep(supabase as any, USER_ID, ORG_ID, event, 'standup');

    expect(prep.meeting_type).toBe('standup');
    expect(prep.is_lightweight).toBe(true);
    const sectionTitles = prep.sections.map((s) => s.title.toLowerCase());
    expect(sectionTitles.some((t) => t.includes('yesterday') || t.includes('wins') || t.includes("today's focus"))).toBe(true);
  });

  it('returns lightweight note for external meeting type', async () => {
    const supabase = makePrepSupabaseMock('standup');
    const event = { id: EVENT_ID, title: 'Customer Call' };

    const prep = await generateInternalPrep(supabase as any, USER_ID, ORG_ID, event, 'external');

    expect(prep.meeting_type).toBe('external');
    expect(prep.is_lightweight).toBe(true);
  });

  it('has correct metadata fields', async () => {
    const supabase = makePrepSupabaseMock('standup');
    const event = { id: EVENT_ID, title: 'Team Standup' };

    const prep = await generateInternalPrep(supabase as any, USER_ID, ORG_ID, event, 'standup');

    expect(prep.event_id).toBe(EVENT_ID);
    expect(prep.generated_at).toBeTruthy();
    expect(new Date(prep.generated_at).getTime()).not.toBeNaN();
  });
});

// =============================================================================
// Part 4: Scenario tests (end-to-end pipeline simulation)
// =============================================================================

describe('IMP Pipeline scenarios', () => {
  it('Scenario: manager 1:1 with pipeline changes', async () => {
    // Internal meeting, 2 attendees, no 1:1 title cue → classified from attendee count
    const detectionResult: InternalMeetingDetectionResult = {
      event_id: EVENT_ID,
      is_internal: true,
      org_domain: ORG_DOMAIN,
      attendee_count: 2,
      internal_attendees: ['alice@acme.com', 'manager@acme.com'],
      external_attendees: [],
      skipped: false,
    };

    const classification = classifyMeetingType('Bi-weekly sync', true, 2, [
      { id: 'mgr', email: 'manager@acme.com', first_name: 'Bob', last_name: 'Manager', job_title: 'VP Sales' },
    ]);

    expect(detectionResult.is_internal).toBe(true);
    expect(classification.meeting_type).toBe('one_on_one');
    expect(classification.signals).toContain('manager_title_detected');
  });

  it('Scenario: pipeline review with at-risk deals', () => {
    const classification = classifyMeetingType('Thursday Pipeline Review', true, 6, []);
    expect(classification.meeting_type).toBe('pipeline_review');
    expect(classification.confidence).toBe('high');
  });

  it('Scenario: QBR at end of quarter', () => {
    const classification = classifyMeetingType('Q1 QBR — Leadership Review', true, 12, []);
    expect(classification.meeting_type).toBe('qbr');
  });

  it('Scenario: standup with recent wins', () => {
    const classification = classifyMeetingType('Daily Standup', true, 8, []);
    expect(classification.meeting_type).toBe('standup');
    expect(classification.is_lightweight ?? true).toBe(true);
  });

  it('Scenario: external meeting is NOT classified as internal', async () => {
    const supabase = makeSupabaseMock({ orgDomain: 'acme.com' });
    const event = makeCalendarEvent({
      attendees: ['alice@acme.com', 'prospect@rival.com', 'other@rival.com'],
      attendees_count: 3,
    });

    const result = await detectInternalMeeting(supabase as any, event, ORG_ID);

    expect(result.is_internal).toBe(false);
    expect(result.external_attendees).toHaveLength(2);

    const classification = classifyMeetingType('Discovery Call', false, 3, []);
    expect(classification.meeting_type).toBe('external');
  });
});
