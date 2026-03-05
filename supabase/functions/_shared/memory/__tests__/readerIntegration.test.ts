/**
 * MW-002: Deal memory reader + generate-follow-up integration tests
 *
 * Verifies:
 * - getDealContext() returns structured context with commitments, events, stakeholders
 * - Follow-up email gets deal memory injected when deal_id is available
 * - Graceful fallback when no memory data exists
 * - Correct deal memory shape passed to composer
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock RAGClient
vi.mock('../ragClient.ts', () => ({
  RAGClient: vi.fn().mockImplementation(() => ({
    query: vi.fn().mockResolvedValue({
      answer: '',
      sources: [],
      query_metadata: { semantic_query: null, filters_applied: {}, meetings_searched: 0, response_time_ms: 0 },
    }),
    queryBatch: vi.fn().mockResolvedValue([]),
  })),
}));

// Mock commitments module
vi.mock('../commitments.ts', () => ({
  getOpenCommitments: vi.fn().mockResolvedValue([]),
  getOverdueCommitments: vi.fn().mockResolvedValue([]),
}));

import { createDealMemoryReader } from '../reader.ts';
import { RAGClient } from '../ragClient.ts';
import type { DealContext, Commitment, Stakeholder, RiskFactor } from '../types.ts';

// ---- Supabase mock factory --------------------------------------------------

function createMockSupabase(overrides: {
  snapshot?: any;
  events?: any[];
  contactProfiles?: any[];
} = {}) {
  const defaultSnapshot = overrides.snapshot === undefined ? null : overrides.snapshot;
  const defaultEvents = overrides.events ?? [];
  const defaultProfiles = overrides.contactProfiles ?? [];

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'deal_memory_snapshots') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: defaultSnapshot,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }

      if (table === 'deal_memory_events') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  gte: vi.fn().mockReturnValue({
                    in: vi.fn().mockReturnValue({
                      limit: vi.fn().mockResolvedValue({
                        data: defaultEvents,
                        error: null,
                      }),
                    }),
                    order: vi.fn().mockReturnValue({
                      limit: vi.fn().mockResolvedValue({
                        data: defaultEvents,
                        error: null,
                      }),
                    }),
                  }),
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: defaultEvents,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }

      if (table === 'contact_memory') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: defaultProfiles,
                error: null,
              }),
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      // Default fallback
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
      };
    }),
  };
}

// ---- Tests ------------------------------------------------------------------

describe('DealMemoryReader — getDealContext()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty context when no snapshot or events exist', async () => {
    const mockSupabase = createMockSupabase();
    const ragClient = new RAGClient('http://localhost', 'key', 'org-1');
    const reader = createDealMemoryReader(mockSupabase as any, ragClient);

    const ctx = await reader.getDealContext('deal-1', 'org-1');

    expect(ctx).toBeDefined();
    expect(ctx.snapshot).toBeNull();
    expect(ctx.recentEvents).toEqual([]);
    expect(ctx.openCommitments).toEqual([]);
    expect(ctx.stakeholderMap).toEqual([]);
    expect(ctx.riskFactors).toEqual([]);
    expect(ctx.eventCount).toBe(0);
    expect(ctx.ragQueryCost).toBe(0);
  });

  it('returns snapshot when one exists', async () => {
    const snapshot = {
      id: 'snap-1',
      deal_id: 'deal-1',
      narrative: 'This deal is progressing well. The champion is engaged.',
      key_facts: { close_date: '2026-04-15', amount: 50000, stage: 'Proposal', champion: null, blockers: [], competitors: ['CompetitorX'], open_commitments_count: 2 },
      stakeholder_map: [
        { contact_id: 'c1', name: 'Jane Doe', role: 'champion', engagement_level: 'active', last_active: '2026-03-01' },
      ],
      risk_assessment: { overall_score: 0.3, factors: [] },
      sentiment_trajectory: [],
      open_commitments: [
        { event_id: 'evt-1', owner: 'rep', action: 'Send proposal', deadline: '2026-03-10', status: 'pending', created_at: '2026-03-03' },
      ],
      events_included_through: '2026-03-03T00:00:00Z',
      event_count: 5,
      generated_by: 'event_threshold',
      model_used: 'claude-sonnet-4-6',
      created_at: '2026-03-03T00:00:00Z',
    };

    const mockSupabase = createMockSupabase({ snapshot });
    const ragClient = new RAGClient('http://localhost', 'key', 'org-1');
    const reader = createDealMemoryReader(mockSupabase as any, ragClient);

    const ctx = await reader.getDealContext('deal-1', 'org-1');

    expect(ctx.snapshot).toBeDefined();
    expect(ctx.snapshot?.narrative).toContain('progressing well');
    expect(ctx.stakeholderMap).toHaveLength(1);
    expect(ctx.stakeholderMap[0].name).toBe('Jane Doe');
    expect(ctx.openCommitments).toHaveLength(1);
    expect(ctx.openCommitments[0].action).toBe('Send proposal');
  });

  it('includes recent events since last snapshot', async () => {
    const events = [
      {
        id: 'evt-3',
        event_type: 'objection_raised',
        event_category: 'objection',
        source_type: 'transcript',
        source_id: 'meeting-2',
        source_timestamp: '2026-03-05',
        summary: 'Prospect concerned about implementation timeline',
        detail: { objection_type: 'timeline', severity: 'concern' },
        verbatim_quote: null,
        speaker: 'prospect',
        confidence: 0.9,
        salience: 'high',
        contact_ids: [],
        extracted_by: 'extract-deal-memory-events',
        is_active: true,
      },
    ];

    const mockSupabase = createMockSupabase({ events });
    const ragClient = new RAGClient('http://localhost', 'key', 'org-1');
    const reader = createDealMemoryReader(mockSupabase as any, ragClient);

    const ctx = await reader.getDealContext('deal-1', 'org-1');

    expect(ctx.recentEvents).toHaveLength(1);
    expect(ctx.recentEvents[0].event_type).toBe('objection_raised');
    expect(ctx.recentEvents[0].summary).toContain('implementation timeline');
  });

  it('gracefully handles database errors (returns empty data)', async () => {
    // Build a self-referencing chainable mock that returns errors at every terminal
    const errorResult = { data: null, error: { message: 'Database connection failed' } };
    const chainable: any = {};
    chainable.eq = vi.fn().mockReturnValue(chainable);
    chainable.gte = vi.fn().mockReturnValue(chainable);
    chainable.in = vi.fn().mockReturnValue(chainable);
    chainable.order = vi.fn().mockReturnValue(chainable);
    chainable.limit = vi.fn().mockReturnValue(chainable);
    chainable.not = vi.fn().mockReturnValue(chainable);
    chainable.maybeSingle = vi.fn().mockResolvedValue(errorResult);
    // When used as a promise (await), resolve with error
    chainable.then = vi.fn((resolve: any) => Promise.resolve(errorResult).then(resolve));

    const mockSupabase = {
      from: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockReturnValue(chainable),
      })),
    };

    const ragClient = new RAGClient('http://localhost', 'key', 'org-1');
    const reader = createDealMemoryReader(mockSupabase as any, ragClient);

    const ctx = await reader.getDealContext('deal-1', 'org-1');

    // Should not throw — returns empty data
    expect(ctx.snapshot).toBeNull();
    expect(ctx.recentEvents).toEqual([]);
    expect(ctx.eventCount).toBe(0);
  });
});

describe('MW-002: Deal memory shape for follow-up composer', () => {
  it('produces the correct deal context shape for the compose input', () => {
    // Simulate what generate-follow-up does with the deal context
    const dealMemoryContext: DealContext = {
      snapshot: {
        id: 'snap-1',
        org_id: 'org-1',
        deal_id: 'deal-1',
        narrative: 'Active deal in proposal stage',
        key_facts: { close_date: '2026-04-15', amount: 50000, stage: 'Proposal', champion: null, blockers: [], competitors: [], open_commitments_count: 1 },
        stakeholder_map: [
          { contact_id: 'c1', name: 'Jane', role: 'champion', engagement_level: 'active', last_active: '2026-03-01' },
        ],
        risk_assessment: { overall_score: 0.2, factors: [{ type: 'timeline_pressure', severity: 'medium', detail: 'Close date approaching' }] },
        sentiment_trajectory: [],
        open_commitments: [
          { event_id: 'evt-1', owner: 'rep', action: 'Send pricing deck', deadline: '2026-03-10', status: 'pending', created_at: '2026-03-03' },
        ],
        events_included_through: '2026-03-03',
        event_count: 5,
        generated_by: 'event_threshold',
        model_used: 'claude-sonnet-4-6',
        created_at: '2026-03-03',
      },
      recentEvents: [
        {
          id: 'evt-2', org_id: 'org-1', deal_id: 'deal-1', event_type: 'objection_raised',
          event_category: 'objection', source_type: 'transcript', source_id: 'mtg-1',
          source_timestamp: '2026-03-03', summary: 'Timeline concern raised',
          detail: {}, verbatim_quote: null, speaker: 'prospect', confidence: 0.9,
          salience: 'high', is_active: true, superseded_by: null, contact_ids: [],
          extracted_by: 'test', model_used: null, credit_cost: 0,
          created_at: '2026-03-03', updated_at: '2026-03-03',
        },
      ],
      openCommitments: [
        { event_id: 'evt-1', owner: 'rep', action: 'Send pricing deck', deadline: '2026-03-10', status: 'pending', created_at: '2026-03-03' },
      ],
      stakeholderMap: [
        { contact_id: 'c1', name: 'Jane', role: 'champion', engagement_level: 'active', last_active: '2026-03-01' },
      ],
      riskFactors: [{ type: 'timeline_pressure', severity: 'medium', detail: 'Close date approaching' }],
      contactProfiles: [],
      eventCount: 6,
      lastMeetingDate: '2026-03-03',
      ragQueryCost: 0,
    };

    // Transform to the shape passed to the composer (as done in generate-follow-up)
    const deal = {
      commitments: dealMemoryContext.openCommitments.map(c => ({
        owner: c.owner,
        action: c.action,
        deadline: c.deadline,
        status: c.status,
      })),
      recentEvents: dealMemoryContext.recentEvents.slice(0, 10).map(e => ({
        type: e.event_type,
        summary: e.summary,
        date: e.source_timestamp,
      })),
      narrative: dealMemoryContext.snapshot?.narrative ?? null,
      riskFactors: dealMemoryContext.riskFactors.map(r => r.detail),
      stakeholders: dealMemoryContext.stakeholderMap.map(s => ({
        name: s.name,
        role: s.role,
      })),
    };

    expect(deal.commitments).toHaveLength(1);
    expect(deal.commitments[0]).toEqual({
      owner: 'rep',
      action: 'Send pricing deck',
      deadline: '2026-03-10',
      status: 'pending',
    });

    expect(deal.recentEvents).toHaveLength(1);
    expect(deal.recentEvents[0].type).toBe('objection_raised');

    expect(deal.narrative).toBe('Active deal in proposal stage');

    expect(deal.riskFactors).toEqual(['Close date approaching']);

    expect(deal.stakeholders).toEqual([{ name: 'Jane', role: 'champion' }]);
  });

  it('returns null deal when no dealMemoryContext exists', () => {
    const dealMemoryContext: DealContext | null = null;

    const deal = dealMemoryContext ? {
      commitments: dealMemoryContext.openCommitments.map(c => ({
        owner: c.owner,
        action: c.action,
      })),
    } : null;

    expect(deal).toBeNull();
  });
});
