/**
 * Delivery Slack — Persona injection tests (AOA-014)
 *
 * Tests:
 * - Agent persona name is loaded and injected into Slack messages
 * - Context block is prepended to blocks with agent identity
 * - Double-injection is prevented
 * - Fallback to 'Sixty' when no persona exists
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock global fetch for Slack API calls
global.fetch = vi.fn();

// We test the internal helper functions by importing the module.
// The deliverToSlack function integrates persona loading + injection.
// Since loadAgentPersona and injectPersonaHeader are not exported,
// we test them through the public deliverToSlack function.

import { deliverToSlack, sendSlackDM } from '../deliverySlack.ts';

// ─── Mock Helpers ────────────────────────────────────────────────────────────

function makeMockFetch() {
  return vi.mocked(global.fetch).mockImplementation(async (url: any) => {
    const urlStr = typeof url === 'string' ? url : url.toString();

    if (urlStr.includes('conversations.open')) {
      return new Response(JSON.stringify({ ok: true, channel: { id: 'D123' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (urlStr.includes('chat.postMessage')) {
      return new Response(JSON.stringify({ ok: true, ts: '1234.5678' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: false }), { status: 404 });
  });
}

function makeMockSupabase(opts: {
  personaData?: { agent_name: string; tone: string } | null;
  slackPrefEnabled?: boolean;
  hasInteractionRpc?: boolean;
} = {}) {
  const { personaData = null, slackPrefEnabled = true, hasInteractionRpc = true } = opts;

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'agent_persona') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: personaData, error: null }),
            }),
          }),
        };
      }
      if (table === 'slack_user_preferences') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: slackPrefEnabled ? { is_enabled: true } : null,
              error: null,
            }),
          }),
        };
      }
      if (table === 'slack_user_mappings') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      }
      if (table === 'slack_notifications_sent') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockResolvedValue({ count: 0, error: null }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    }),
    rpc: vi.fn().mockResolvedValue({ data: hasInteractionRpc ? 'interaction-123' : null, error: null }),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('sendSlackDM', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    makeMockFetch();
  });

  test('sends Slack DM successfully', async () => {
    const result = await sendSlackDM({
      botToken: 'xoxb-test',
      slackUserId: 'U123',
      text: 'Test message',
    });

    expect(result.success).toBe(true);
    expect(result.channelId).toBe('D123');
    expect(result.ts).toBe('1234.5678');
  });

  test('includes blocks in message when provided', async () => {
    const blocks = [
      { type: 'section', text: { type: 'mrkdwn', text: 'Hello' } },
    ];

    await sendSlackDM({
      botToken: 'xoxb-test',
      slackUserId: 'U123',
      text: 'Test',
      blocks,
    });

    // Verify chat.postMessage was called with blocks
    const postMessageCall = vi.mocked(global.fetch).mock.calls.find(
      (call: any) => call[0]?.toString().includes('chat.postMessage')
    );
    expect(postMessageCall).toBeDefined();

    const body = JSON.parse((postMessageCall as any)[1].body);
    expect(body.blocks).toBeDefined();
    expect(body.blocks[0].type).toBe('section');
  });

  test('handles Slack API error gracefully', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: 'channel_not_found' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await sendSlackDM({
      botToken: 'xoxb-test',
      slackUserId: 'U123',
      text: 'Test',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('channel_not_found');
  });
});

describe('deliverToSlack — persona injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    makeMockFetch();
  });

  test('injects custom agent name into message text', async () => {
    const supabase = makeMockSupabase({
      personaData: { agent_name: 'Atlas', tone: 'direct' },
    });

    await deliverToSlack(
      supabase as any,
      {
        recipientUserId: 'user-abc',
        recipientSlackUserId: 'U123',
        orgId: 'org-xyz',
        type: 'deal_risk_scan',
        message: 'Deal needs attention',
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Deal details' } }],
      },
      'xoxb-test'
    );

    // Verify the chat.postMessage call had personalized text
    const postMessageCall = vi.mocked(global.fetch).mock.calls.find(
      (call: any) => call[0]?.toString().includes('chat.postMessage')
    );
    expect(postMessageCall).toBeDefined();

    const body = JSON.parse((postMessageCall as any)[1].body);
    expect(body.text).toContain('[Atlas]');
    expect(body.text).toContain('Deal needs attention');
  });

  test('injects persona context block at top of blocks', async () => {
    const supabase = makeMockSupabase({
      personaData: { agent_name: 'Scout', tone: 'conversational' },
    });

    await deliverToSlack(
      supabase as any,
      {
        recipientUserId: 'user-abc',
        recipientSlackUserId: 'U123',
        orgId: 'org-xyz',
        type: 'meeting_ended',
        message: 'Meeting summary',
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: 'Post-Meeting Debrief' } },
          { type: 'section', text: { type: 'mrkdwn', text: 'Summary here' } },
        ],
      },
      'xoxb-test'
    );

    const postMessageCall = vi.mocked(global.fetch).mock.calls.find(
      (call: any) => call[0]?.toString().includes('chat.postMessage')
    );
    const body = JSON.parse((postMessageCall as any)[1].body);

    // First block should be the injected persona context
    expect(body.blocks[0].type).toBe('context');
    expect(JSON.stringify(body.blocks[0])).toContain('Scout');
    expect(JSON.stringify(body.blocks[0])).toContain('Your AI Sales Agent');

    // Original blocks follow
    expect(body.blocks[1].type).toBe('header');
    expect(body.blocks[2].type).toBe('section');
  });

  test('falls back to "Sixty" when no persona exists', async () => {
    const supabase = makeMockSupabase({
      personaData: null,
    });

    await deliverToSlack(
      supabase as any,
      {
        recipientUserId: 'user-abc',
        recipientSlackUserId: 'U123',
        orgId: 'org-xyz',
        type: 'deal_risk_scan',
        message: 'Alert',
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Details' } }],
      },
      'xoxb-test'
    );

    const postMessageCall = vi.mocked(global.fetch).mock.calls.find(
      (call: any) => call[0]?.toString().includes('chat.postMessage')
    );
    const body = JSON.parse((postMessageCall as any)[1].body);

    expect(body.text).toContain('[Sixty]');
    expect(body.blocks[0].type).toBe('context');
    expect(JSON.stringify(body.blocks[0])).toContain('Sixty');
  });

  test('does not double-inject persona header', async () => {
    const supabase = makeMockSupabase({
      personaData: { agent_name: 'Scout', tone: 'direct' },
    });

    // Blocks already have a context with the agent name
    const existingBlocks = [
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: '*Scout* | Your AI Sales Agent' }],
      },
      { type: 'section', text: { type: 'mrkdwn', text: 'Content' } },
    ];

    await deliverToSlack(
      supabase as any,
      {
        recipientUserId: 'user-abc',
        recipientSlackUserId: 'U123',
        orgId: 'org-xyz',
        type: 'deal_risk_scan',
        message: 'Alert',
        blocks: existingBlocks,
      },
      'xoxb-test'
    );

    const postMessageCall = vi.mocked(global.fetch).mock.calls.find(
      (call: any) => call[0]?.toString().includes('chat.postMessage')
    );
    const body = JSON.parse((postMessageCall as any)[1].body);

    // Should NOT have double context blocks
    const contextBlocks = body.blocks.filter((b: any) => b.type === 'context');
    expect(contextBlocks.length).toBe(1);
  });

  test('returns not sent when no Slack user ID', async () => {
    const supabase = makeMockSupabase();

    const result = await deliverToSlack(
      supabase as any,
      {
        recipientUserId: 'user-abc',
        recipientSlackUserId: '',
        orgId: 'org-xyz',
        type: 'deal_risk_scan',
        message: 'Alert',
      },
      'xoxb-test'
    );

    expect(result.sent).toBe(false);
    expect(result.error).toContain('No Slack user ID');
  });
});
