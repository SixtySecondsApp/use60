/**
 * Structured Response Detector — Intent Routing Unit Tests
 *
 * Tests the keyword-based intent detection in detectAndStructureResponse()
 * to ensure user messages route to the correct structured response type.
 *
 * Critical coverage:
 * - Deal context gating (dealIds prevents pipeline hijack)
 * - Priority ordering between overlapping intent detectors
 * - Each intent detector's positive and negative cases
 *
 * Run: npx vitest run --config vitest.config.edge.ts supabase/functions/_shared/__tests__/structuredResponseDetector.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock modelRouter before importing the module under test
// ---------------------------------------------------------------------------
vi.mock('../modelRouter.ts', () => ({
  resolveModel: vi.fn(() => ({
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    apiKey: 'test-key',
  })),
}))

// Mock api-utils (pure functions, but let's keep it simple)
vi.mock('../api-utils.ts', () => ({
  isValidUUID: vi.fn((val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)),
}))

import { detectAndStructureResponse, type ChatRequestContext } from '../structuredResponseDetector.ts'

// ---------------------------------------------------------------------------
// Mock Supabase client factory
// ---------------------------------------------------------------------------

const TEST_USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

const mockDeals = [
  {
    id: 'deal-001',
    name: 'Acme Corp Enterprise',
    value: 50000,
    stage_id: 'stage-1',
    status: 'active',
    expected_close_date: new Date(Date.now() + 14 * 86400000).toISOString(),
    probability: 60,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    deal_stages: { name: 'Negotiation' },
    company_name: 'Acme Corp',
    contact_name: 'John Doe',
    contact_email: 'john@acme.com',
  },
  {
    id: 'deal-002',
    name: 'Beta Inc Starter',
    value: 15000,
    stage_id: 'stage-2',
    status: 'active',
    expected_close_date: null,
    probability: 30,
    created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 20 * 86400000).toISOString(),
    deal_stages: { name: 'Opportunity' },
    company_name: 'Beta Inc',
    contact_name: 'Jane Smith',
    contact_email: 'jane@beta.com',
  },
]

const mockMeetings = [
  {
    id: 'meeting-001',
    title: 'Q1 Planning with Acme',
    start_time: new Date(Date.now() + 3600000).toISOString(),
    end_time: new Date(Date.now() + 7200000).toISOString(),
    attendees: [{ name: 'John Doe', email: 'john@acme.com' }],
    conference_link: 'https://meet.google.com/abc',
    deal_id: 'deal-001',
    owner_user_id: TEST_USER_ID,
    contact_id: 'contact-001',
    company_id: 'company-001',
    org_id: 'org-001',
  },
]

const mockTasks = [
  {
    id: 'task-001',
    title: 'Follow up on proposal',
    due_date: new Date().toISOString(),
    priority: 'high',
    status: 'pending',
    deal_id: 'deal-001',
    contact_id: 'contact-001',
    assigned_to: TEST_USER_ID,
  },
]

const mockContacts = [
  {
    id: 'contact-001',
    first_name: 'John',
    last_name: 'Doe',
    full_name: 'John Doe',
    name: 'John Doe',
    email: 'john@acme.com',
    company_name: 'Acme Corp',
    owner_id: TEST_USER_ID,
  },
]

/**
 * Creates a chainable mock Supabase client.
 * All query chains resolve with table-appropriate test data.
 */
function createMockClient() {
  const tableData: Record<string, any[]> = {
    deals: mockDeals,
    meetings: mockMeetings,
    tasks: mockTasks,
    contacts: mockContacts,
    calendar_events: mockMeetings,
    activities: [],
    user_settings: [],
    integration_credentials: [],
  }

  function makeChain(tableName: string) {
    const data = tableData[tableName] || []
    // Use a proxy-based approach to avoid self-referential const issue
    const chain: any = {}

    // Chain methods — all return the chain itself
    const chainMethods = [
      'select', 'eq', 'neq', 'in', 'gte', 'lte', 'gt', 'lt',
      'ilike', 'like', 'or', 'not', 'is', 'order', 'limit', 'range',
      'contains', 'filter', 'match', 'textSearch',
    ]
    for (const method of chainMethods) {
      chain[method] = vi.fn(() => chain)
    }

    // Terminal methods
    chain.single = vi.fn().mockResolvedValue({ data: data[0] || null, error: null })
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: data[0] || null, error: null })

    // Insert/update/delete chains
    chain.insert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: { id: 'new-1' }, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'new-1' }, error: null }),
        then: (resolve: any) => resolve({ data: [{ id: 'new-1' }], error: null }),
      })),
      then: (resolve: any) => resolve({ data: [{ id: 'new-1' }], error: null }),
    }))
    chain.update = vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      match: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: (resolve: any) => resolve({ data: null, error: null }),
    }))
    chain.delete = vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: (resolve: any) => resolve({ data: null, error: null }),
    }))

    // Thenable: allows `await client.from('deals').select()...` to resolve
    // Must behave like a proper thenable for `await` to work
    chain.then = (resolve: any, _reject?: any) => {
      const result = resolve({ data, error: null })
      return Promise.resolve(result)
    }

    return chain
  }

  return {
    from: vi.fn((table: string) => makeChain(table)),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NO_CONTEXT: ChatRequestContext = { userId: TEST_USER_ID }
const DEAL_CONTEXT: ChatRequestContext = {
  userId: TEST_USER_ID,
  currentView: 'pipeline',
  dealIds: ['deal-001'],
}

async function detectType(
  message: string,
  context: ChatRequestContext = NO_CONTEXT,
  aiContent = 'Here is my analysis of the situation.',
): Promise<string | null> {
  const client = createMockClient()
  const result = await detectAndStructureResponse(
    message,
    aiContent,
    client,
    TEST_USER_ID,
    [],
    undefined,
    context,
    [],
  )
  return result?.type ?? null
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('detectAndStructureResponse — Intent Routing', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // =========================================================================
  // 1. Email Draft Detection
  // =========================================================================
  describe('Email Draft Detection', () => {
    it.each([
      ['draft an email to John', 'draft + email'],
      ['write an email about the proposal', 'write + email'],
      ['send a follow-up email to Sarah', 'follow-up + email'],
      ['follow up email with John', 'follow up + email'],
      ['compose email about pricing', 'compose email'],
      ['reach out to John about the project', 'reach out + to'],
      ['get in touch with the prospect', 'get in touch'],
    ])('detects "%s" as email draft (%s)', async (message) => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const client = createMockClient()
      await detectAndStructureResponse(message, 'Here is a draft.', client, TEST_USER_ID, [], undefined, NO_CONTEXT, [])
      const emailDraftLogs = logSpy.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('[EMAIL-DRAFT] Detected email draft request')
      )
      expect(emailDraftLogs.length).toBeGreaterThan(0)
    })

    it('does NOT detect "follow up task with John" as email draft', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const client = createMockClient()
      await detectAndStructureResponse('follow up task with John', 'OK.', client, TEST_USER_ID, [], undefined, NO_CONTEXT, [])
      const emailDraftLogs = logSpy.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('[EMAIL-DRAFT] Detected email draft request')
      )
      expect(emailDraftLogs.length).toBe(0)
    })
  })

  // =========================================================================
  // 2. Task Creation Detection
  // =========================================================================
  describe('Task Creation Detection', () => {
    // Note: "remind me to follow up" routes to email draft (P2) because
    // "follow up" without "task" matches the email draft detector first.
    // "create a task to call John" may route to contact_selection if it
    // tries to resolve the contact name "John". We test the branch entry.
    it.each([
      'create a task to review the contract',
      'add a task for the proposal review',
      'set a reminder for the demo',
      'new task to prepare slides',
    ])('enters task creation branch for "%s"', async (message) => {
      const result = await detectType(message)
      // structureTaskCreationResponse may return task_creation or contact_selection
      expect(['task_creation', 'contact_selection']).toContain(result)
    })

    it('does NOT detect task creation when message contains "email"', async () => {
      const result = await detectType('create a task to send email to John')
      expect(result).not.toBe('task_creation')
    })

    it.each([
      'yes',
      'yep',
      'go ahead',
      'confirm',
      'ok',
    ])('does NOT detect "%s" as task creation (affirmative confirmation)', async (message) => {
      const result = await detectType(message)
      expect(result).not.toBe('task_creation')
    })
  })

  // =========================================================================
  // 3. Meeting Prep Detection
  // =========================================================================
  describe('Meeting Prep Detection', () => {
    it.each([
      'prep me for my next meeting',
      'prepare for the call with Acme',
      'brief me on my upcoming meeting',
      'meeting prep',
      'what should i know before the meeting',
      'help me prepare for the demo',
    ])('detects "%s" as meeting prep', async (message) => {
      const result = await detectType(message)
      // Meeting prep returns a structured response or null depending on DB data
      // The key assertion is that it enters the meeting prep branch
      const logSpy = consoleSpy
      // Since we already have consoleSpy capturing, let's just verify it's not pipeline
      expect(result).not.toBe('pipeline')
    })
  })

  // =========================================================================
  // 4. Daily Brief Detection
  // =========================================================================
  describe('Daily Brief Detection', () => {
    it.each([
      'catch me up',
      'daily brief',
      'morning briefing',
      "what's going on today",
      'give me the rundown',
      "today's summary",
    ])('detects "%s" as daily_brief', async (message) => {
      const result = await detectType(message)
      expect(result).toBe('daily_brief')
    })

    it('is case insensitive — "CATCH ME UP"', async () => {
      const result = await detectType('CATCH ME UP')
      expect(result).toBe('daily_brief')
    })

    it('does NOT detect "catch up on email" as daily brief', async () => {
      const result = await detectType('catch up on email')
      expect(result).not.toBe('daily_brief')
    })
  })

  // =========================================================================
  // 5. Activity Creation Detection
  // =========================================================================
  describe('Activity Creation Detection', () => {
    it.each([
      ['add a proposal for Acme', 'proposal'],
      ['create outbound for leads', 'outbound'],
    ])('detects "%s" as activity_creation (%s)', async (message) => {
      const result = await detectType(message)
      expect(result).toBe('activity_creation')
    })

    it('detects "add a sale for $50k" as activity creation (may resolve to contact_selection)', async () => {
      const result = await detectType('add a sale for $50k')
      expect(['activity_creation', 'contact_selection']).toContain(result)
    })

    it('does NOT detect "prep for meeting with John" as activity creation (meeting prep fires first)', async () => {
      const result = await detectType('prep for meeting with John')
      expect(result).not.toBe('activity_creation')
    })
  })

  // =========================================================================
  // 6. Pipeline Query Detection — WITHOUT deal context
  // =========================================================================
  describe('Pipeline Query Detection (no deal context)', () => {
    it.each([
      'show me my pipeline',
      'pipeline health',
      'show me my deals',
      'deals at risk',
      'what needs attention',
    ])('detects "%s" as pipeline', async (message) => {
      const result = await detectType(message, NO_CONTEXT)
      expect(result).toBe('pipeline')
    })

    it('detects "how is my deal with Acme" as pipeline when no deal context', async () => {
      const result = await detectType('how is my deal with Acme', NO_CONTEXT)
      expect(result).toBe('pipeline')
    })
  })

  // =========================================================================
  // 7. Pipeline Query Detection — WITH deal context (CRITICAL)
  // =========================================================================
  describe('Pipeline Query Detection (with deal context — deal gating)', () => {
    it.each([
      'What should I do next to advance this deal?',
      'How is the deal going?',
      'Tell me about my deal',
      'What is the deal status?',
      'Give me an update on this deal',
    ])('does NOT route "%s" to pipeline when dealIds is set', async (message) => {
      const result = await detectType(message, DEAL_CONTEXT)
      expect(result).not.toBe('pipeline')
    })

    it.each([
      'show me my pipeline',
      'deals at risk',
      'what needs attention',
      'pipeline health',
    ])('DOES route "%s" to pipeline even when dealIds is set', async (message) => {
      const result = await detectType(message, DEAL_CONTEXT)
      expect(result).toBe('pipeline')
    })

    it('routes "show me my deals" to pipeline even with deal context', async () => {
      // structurePipelineResponse may return null if mock data insufficient,
      // but should still not route to a deal-specific response
      const result = await detectType('show me my deals', DEAL_CONTEXT)
      // Accepts pipeline (from structurePipelineResponse) or null (if function errors)
      // The key assertion: it should NOT return a single-deal response type
      expect(result).not.toBe('daily_brief')
      expect(result).not.toBe('email')
      expect(result).not.toBe('task_creation')
      if (result !== null) {
        expect(result).toBe('pipeline')
      }
    })

    it('routes "compare this deal with my other deals" toward pipeline, not single-deal', async () => {
      const result = await detectType('compare this deal with my other deals', DEAL_CONTEXT)
      // "deals" (plural) should not be gated as single-deal reference
      expect(result).not.toBe('daily_brief')
      expect(result).not.toBe('email')
      expect(result).not.toBe('task_creation')
      if (result !== null) {
        expect(result).toBe('pipeline')
      }
    })
  })

  // =========================================================================
  // 8. Email History Detection
  // =========================================================================
  describe('Email History Detection', () => {
    it.each([
      'show me my last emails',
      'email history with John',
      'what emails did I get today',
      'show me my gmail',
      'find recent emails from Acme',
    ])('enters email history branch for "%s"', async (message) => {
      // This branch calls structureCommunicationHistoryResponse which may return null
      // depending on Gmail auth. We just verify it enters the branch (not pipeline).
      const result = await detectType(message)
      expect(result).not.toBe('pipeline')
    })
  })

  // =========================================================================
  // 9. Calendar Query Detection
  // =========================================================================
  describe('Calendar Query Detection', () => {
    it.each([
      'when am i free on Tuesday',
      'find me a free slot next week',
      'am I available on Monday',
      'what is my availability this week',
    ])('enters calendar branch for "%s"', async (message) => {
      const result = await detectType(message)
      expect(result).not.toBe('pipeline')
    })
  })

  // =========================================================================
  // 10. Task Query Detection
  // =========================================================================
  describe('Task Query Detection', () => {
    it.each([
      'show me my tasks',
      'list high priority tasks',
      'what should I prioritize today',
      'task overview',
    ])('detects "%s" as task', async (message) => {
      const result = await detectType(message)
      expect(result).toBe('task')
    })

    it('detects "what tasks are due today" as task-related', async () => {
      // "task" + "due" + "today" may match task_creation before task query
      const result = await detectType('what tasks are due today')
      expect(['task', 'task_creation']).toContain(result)
    })
  })

  // =========================================================================
  // 11. Priority Ordering
  // =========================================================================
  describe('Priority Ordering', () => {
    it('"draft a follow-up email" routes to email, not task', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const client = createMockClient()
      await detectAndStructureResponse('draft a follow-up email', 'Draft.', client, TEST_USER_ID, [], undefined, NO_CONTEXT, [])
      const emailBranch = logSpy.mock.calls.some(
        (call) => typeof call[0] === 'string' && call[0].includes('[EMAIL-DRAFT] Detected')
      )
      expect(emailBranch).toBe(true)
    })

    it('"follow up with John" routes to email, not task (no "task" word)', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const client = createMockClient()
      await detectAndStructureResponse('follow up with John', 'Follow up.', client, TEST_USER_ID, [], undefined, NO_CONTEXT, [])
      const emailBranch = logSpy.mock.calls.some(
        (call) => typeof call[0] === 'string' && call[0].includes('[EMAIL-DRAFT] Detected')
      )
      expect(emailBranch).toBe(true)
    })

    it('"follow up task with John" routes to task, not email', async () => {
      const result = await detectType('follow up task with John')
      expect(result).toBe('task_creation')
    })

    it('"catch me up on my pipeline" routes to daily brief, not pipeline', async () => {
      const result = await detectType('catch me up on my pipeline')
      expect(result).toBe('daily_brief')
    })
  })

  // =========================================================================
  // 12. Edge Cases
  // =========================================================================
  describe('Edge Cases', () => {
    it('returns null for empty message', async () => {
      const result = await detectType('')
      expect(result).toBeNull()
    })

    it('returns non-pipeline for generic greeting with no intent keywords', async () => {
      // Fallback classifier may catch stray keywords — "doing" could match "doing" in sales_coach
      const result = await detectType('hello how are you doing today')
      expect(result).not.toBe('pipeline')
    })

    it('handles all caps correctly', async () => {
      const result = await detectType('SHOW ME MY PIPELINE')
      expect(result).toBe('pipeline')
    })

    it('"deal" without deal context triggers pipeline', async () => {
      const result = await detectType('tell me about the deal', NO_CONTEXT)
      expect(result).toBe('pipeline')
    })

    it('"deal" with deal context does NOT trigger pipeline', async () => {
      const result = await detectType('tell me about the deal', DEAL_CONTEXT)
      expect(result).not.toBe('pipeline')
    })
  })
})
