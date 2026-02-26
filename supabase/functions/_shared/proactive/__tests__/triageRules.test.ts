/**
 * Triage Rules — Unit tests (AOA-014)
 *
 * Tests:
 * - Empty payload suppression
 * - Urgent priority bypass
 * - Deduplication within 4h window
 * - Cooldown max 3/hr per type
 * - Quiet hours batching
 * - Matrix routing (deliver vs batch)
 * - Unknown notification type fallback
 * - Batch assignment (create + append)
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { triageNotification, assignToBatch } from '../triageRules.ts';
import type { TriageInput } from '../triageRules.ts';

// ─── Mock Helpers ────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<TriageInput> = {}): TriageInput {
  return {
    id: 'notif-001',
    userId: 'user-abc',
    orgId: 'org-xyz',
    notificationType: 'deal_risk_scan',
    priority: 'high',
    entityType: 'deal',
    entityId: 'deal-123',
    payload: { summary: 'Deal at risk', message: 'Acme Corp needs attention' },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

interface MockChainConfig {
  dedupResults?: any[];
  cooldownCount?: number;
  personaData?: any;
  batchData?: any;
}

function makeMockSupabase(config: MockChainConfig = {}) {
  const {
    dedupResults = [],
    cooldownCount = 0,
    personaData = null,
    batchData = null,
  } = config;

  let fromCallCount = 0;

  const supabase = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'notification_queue') {
        fromCallCount++;
        // First call = dedup check, second call = cooldown check
        if (fromCallCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              gte: vi.fn().mockReturnThis(),
              neq: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({ data: dedupResults, error: null }),
            }),
          };
        }
        // Cooldown check
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            neq: vi.fn().mockReturnThis(),
          }),
          // count query returns immediately from select
        };
      }
      if (table === 'notification_batches') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: batchData, error: null }),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'batch-new' }, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    }),
    rpc: vi.fn().mockResolvedValue({ data: personaData ? [personaData] : [], error: null }),
  };

  return supabase;
}

/**
 * Create a mock that properly handles the chained query for both dedup and cooldown.
 *
 * Dedup chain: .select('id').eq().eq().eq().eq().gte().neq().neq().limit() -> { data, error }
 * Cooldown chain: .select('id', { count, head }).eq().eq().gte().neq().neq() -> { count, error }
 */
function makeMockSupabaseDetailed(config: {
  dedupResults?: any[];
  cooldownCount?: number;
  personaData?: any;
} = {}) {
  const { dedupResults = [], cooldownCount = 0, personaData = null } = config;

  let nqCallCount = 0;

  const supabase = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'notification_queue') {
        nqCallCount++;
        const currentCall = nqCallCount;

        // Create a chainable mock where every method returns the chain
        // Terminal methods (.limit for dedup, last .neq for cooldown) return the result
        const makeChain = (isCountQuery: boolean): any => {
          const resolvedValue = isCountQuery
            ? { count: cooldownCount, error: null }
            : { data: currentCall === 1 ? dedupResults : [], error: null };

          const chain: any = {};
          // All filter methods return chain (chainable)
          chain.eq = vi.fn().mockReturnValue(chain);
          chain.gte = vi.fn().mockReturnValue(chain);
          chain.neq = vi.fn().mockReturnValue(chain);
          // Terminal: limit for dedup queries
          chain.limit = vi.fn().mockResolvedValue(resolvedValue);

          // For count queries, make the chain itself thenable so that
          // awaiting the final .neq() resolves to { count, error }
          if (isCountQuery) {
            chain.then = (resolve: any) => resolve(resolvedValue);
          }

          return chain;
        };

        return {
          select: vi.fn().mockImplementation((_cols: string, opts?: any) => {
            return makeChain(!!opts?.count);
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    }),
    rpc: vi.fn().mockResolvedValue({
      data: personaData ? [personaData] : [],
      error: null,
    }),
  };

  return supabase;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('triageNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Rule 4: Empty check (runs first)
  describe('empty payload suppression', () => {
    test('suppresses notification with isEmpty flag', async () => {
      const supabase = makeMockSupabaseDetailed();
      const input = makeInput({ payload: { isEmpty: true } });

      const result = await triageNotification(supabase as any, input);

      expect(result.decision).toBe('suppress');
      expect(result.reason).toContain('Empty check');
      // Should NOT call any DB queries (cheapest check first)
      expect(supabase.from).not.toHaveBeenCalled();
    });

    test('suppresses notification with itemCount === 0', async () => {
      const supabase = makeMockSupabaseDetailed();
      const input = makeInput({ payload: { itemCount: 0 } });

      const result = await triageNotification(supabase as any, input);

      expect(result.decision).toBe('suppress');
      expect(result.reason).toContain('no actionable content');
    });

    test('suppresses notification with no summary, message, or blocks', async () => {
      const supabase = makeMockSupabaseDetailed();
      const input = makeInput({ payload: {} });

      const result = await triageNotification(supabase as any, input);

      expect(result.decision).toBe('suppress');
      expect(result.reason).toContain('no content to deliver');
    });

    test('does NOT suppress notification with summary', async () => {
      const supabase = makeMockSupabaseDetailed();
      const input = makeInput({ payload: { summary: 'Deal update' } });

      const result = await triageNotification(supabase as any, input);

      expect(result.decision).not.toBe('suppress');
    });
  });

  // Urgent bypass
  describe('urgent priority bypass', () => {
    test('delivers immediately for urgent priority regardless of other rules', async () => {
      const supabase = makeMockSupabaseDetailed({ dedupResults: [{ id: 'old-notif' }] });
      const input = makeInput({ priority: 'urgent', payload: { summary: 'Critical alert' } });

      const result = await triageNotification(supabase as any, input);

      expect(result.decision).toBe('deliver');
      expect(result.channel).toBe('slack_dm');
      expect(result.reason).toContain('Urgent');
    });
  });

  // Rule 1: Deduplication
  describe('deduplication', () => {
    test('suppresses duplicate within 4h window', async () => {
      const supabase = makeMockSupabaseDetailed({
        dedupResults: [{ id: 'existing-notif' }],
      });
      const input = makeInput({ payload: { summary: 'Deal at risk' } });

      const result = await triageNotification(supabase as any, input);

      expect(result.decision).toBe('suppress');
      expect(result.reason).toContain('Duplicate');
    });

    test('skips dedup check when no entityType/entityId', async () => {
      const supabase = makeMockSupabaseDetailed();
      const input = makeInput({
        entityType: undefined,
        entityId: undefined,
        payload: { summary: 'General alert' },
      });

      const result = await triageNotification(supabase as any, input);

      // Should pass through dedup (no entity to deduplicate on)
      expect(result.decision).not.toBe('suppress');
    });
  });

  // Rule 2: Cooldown
  describe('cooldown', () => {
    test('suppresses when cooldown limit (3/hr) is reached', async () => {
      const supabase = makeMockSupabaseDetailed({
        dedupResults: [],
        cooldownCount: 3,
      });
      const input = makeInput({ payload: { summary: 'Another alert' } });

      const result = await triageNotification(supabase as any, input);

      expect(result.decision).toBe('suppress');
      expect(result.reason).toContain('Cooldown');
    });

    test('allows when under cooldown limit', async () => {
      const supabase = makeMockSupabaseDetailed({
        dedupResults: [],
        cooldownCount: 2,
      });
      const input = makeInput({ payload: { summary: 'Alert' } });

      const result = await triageNotification(supabase as any, input);

      expect(result.decision).not.toBe('suppress');
    });
  });

  // Rule 3: Quiet hours
  describe('quiet hours', () => {
    test('batches to morning_briefing when in quiet hours', async () => {
      // Mock persona with quiet hours that cover the current time
      const now = new Date();
      const currentHour = now.getHours();
      // Set quiet hours to include current time
      const quietStart = `${String(currentHour).padStart(2, '0')}:00`;
      const quietEnd = `${String((currentHour + 2) % 24).padStart(2, '0')}:00`;

      const supabase = makeMockSupabaseDetailed({
        dedupResults: [],
        cooldownCount: 0,
        personaData: {
          quiet_hours_start: quietStart,
          quiet_hours_end: quietEnd,
          timezone: 'UTC',
        },
      });
      const input = makeInput({ payload: { summary: 'Alert during quiet hours' } });

      const result = await triageNotification(supabase as any, input);

      expect(result.decision).toBe('batch');
      expect(result.batchType).toBe('morning_briefing');
      expect(result.reason).toContain('business hours');
    });
  });

  // Matrix routing
  describe('triage matrix routing', () => {
    test('delivers high-priority deal_risk_scan immediately', async () => {
      const supabase = makeMockSupabaseDetailed({
        dedupResults: [],
        cooldownCount: 0,
      });
      const input = makeInput({
        notificationType: 'deal_risk_scan',
        priority: 'high',
        payload: { summary: 'Risk detected' },
      });

      const result = await triageNotification(supabase as any, input);

      expect(result.decision).toBe('deliver');
      expect(result.channel).toBe('slack_dm');
    });

    test('batches low-priority campaign_daily_check to daily_digest', async () => {
      const supabase = makeMockSupabaseDetailed({
        dedupResults: [],
        cooldownCount: 0,
      });
      const input = makeInput({
        notificationType: 'campaign_daily_check',
        priority: 'low',
        payload: { summary: 'Campaign stats' },
      });

      const result = await triageNotification(supabase as any, input);

      expect(result.decision).toBe('batch');
      expect(result.batchType).toBe('daily_digest');
    });

    test('batches coaching_weekly to coaching_digest', async () => {
      const supabase = makeMockSupabaseDetailed({
        dedupResults: [],
        cooldownCount: 0,
      });
      const input = makeInput({
        notificationType: 'coaching_weekly',
        priority: 'low',
        payload: { summary: 'Weekly insights' },
      });

      const result = await triageNotification(supabase as any, input);

      expect(result.decision).toBe('batch');
      expect(result.batchType).toBe('coaching_digest');
    });

    test('delivers unknown notification type by default', async () => {
      const supabase = makeMockSupabaseDetailed({
        dedupResults: [],
        cooldownCount: 0,
      });
      const input = makeInput({
        notificationType: 'completely_unknown_type',
        priority: 'medium',
        payload: { summary: 'Unknown' },
      });

      const result = await triageNotification(supabase as any, input);

      expect(result.decision).toBe('deliver');
      expect(result.reason).toContain('Unknown type');
    });
  });
});

describe('assignToBatch', () => {
  test('appends to existing collecting batch', async () => {
    const updateEq = vi.fn().mockResolvedValue({ data: null, error: null });
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq });

    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'notification_batches') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: 'batch-existing',
                      item_count: 1,
                      items: ['notif-old'],
                    },
                    error: null,
                  }),
                }),
              }),
            }),
            update: updateFn,
          };
        }
        return {};
      }),
    };

    const batchId = await assignToBatch(supabase as any, 'notif-new', 'user-abc', 'org-xyz', 'daily_digest');

    expect(batchId).toBe('batch-existing');
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        item_count: 2,
        items: ['notif-old', 'notif-new'],
        status: 'ready', // 2 items >= MIN_BATCH_ITEMS
      })
    );
  });

  test('creates new batch when none exists', async () => {
    const insertSingle = vi.fn().mockResolvedValue({ data: { id: 'batch-new' }, error: null });
    const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
    const insertFn = vi.fn().mockReturnValue({ select: insertSelect });

    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'notification_batches') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
            insert: insertFn,
          };
        }
        return {};
      }),
    };

    const batchId = await assignToBatch(supabase as any, 'notif-001', 'user-abc', 'org-xyz', 'morning_briefing');

    expect(batchId).toBe('batch-new');
    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-abc',
        org_id: 'org-xyz',
        batch_type: 'morning_briefing',
        item_count: 1,
        items: ['notif-001'],
        status: 'collecting',
      })
    );
  });
});
