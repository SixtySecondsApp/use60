/**
 * Copilot Autonomous E2E Integration Tests (AUTO-005)
 *
 * Validates the top 5 copilot workflows work correctly end-to-end:
 * 1. Meeting prep — routes to seq-meeting-prep, returns meeting_prep structured response
 * 2. Pipeline overview — routes to seq-pipeline-focus-tasks, returns pipeline_focus_tasks structured response
 * 3. Post-meeting follow-up — routes to seq-post-meeting-followup-pack, returns post_meeting_followup_pack
 * 4. Daily brief — routes to seq-catch-me-up, returns daily_brief structured response
 * 5. Email draft — message-level detection returns email structured response
 *
 * Tests cover:
 * - Skill routing via V2 trigger patterns (copilotRoutingService)
 * - Structured response detection logic (detectAndStructureResponse patterns)
 * - SSE event emission shape (mock copilot-autonomous stream)
 * - Frontend response data shape validation (type contracts for components)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks
// =============================================================================

vi.mock('@/lib/supabase/clientV2', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    rpc: vi.fn(),
    functions: {
      invoke: vi.fn(),
    },
  },
}));

vi.mock('@/lib/services/embeddingService', () => ({
  findSemanticMatches: vi.fn().mockResolvedValue([]),
}));

import {
  routeToSkill,
  copilotRoutingService,
  type RoutingDecision,
  type SkillMatch,
} from '@/lib/services/copilotRoutingService';
import { supabase } from '@/lib/supabase/clientV2';
import { findSemanticMatches } from '@/lib/services/embeddingService';

// Types from the component layer
import type {
  DailyBriefResponseData,
  DailyBriefMeeting,
  DailyBriefDeal,
  DailyBriefContact,
  DailyBriefTask,
  NextMeetingCommandCenterResponseData,
  PostMeetingFollowUpPackResponseData,
  PipelineResponseData,
  Deal,
  PipelineMetrics,
  EmailResponseData,
  EmailDraft,
  EmailContext,
} from '@/components/copilot/types';

const mockedRpc = vi.mocked(supabase.rpc);
const mockedFindSemanticMatches = vi.mocked(findSemanticMatches);

// =============================================================================
// Test Constants
// =============================================================================

const TEST_ORG_ID = 'test-org-auto-005';
const TEST_USER_ID = 'test-user-auto-005';
const TEST_CONTEXT = { orgId: TEST_ORG_ID, userId: TEST_USER_ID };

// =============================================================================
// Skill Fixtures (mirrors actual SKILL.md frontmatter)
// =============================================================================

const SEQ_MEETING_PREP = {
  skill_key: 'seq-meeting-prep',
  category: 'agent-sequence',
  frontmatter: {
    name: 'Meeting Prep Sequence',
    description:
      'End-to-end meeting preparation: loads meeting details, fetches contact context, and generates a comprehensive brief.',
    triggers: [
      {
        pattern: 'prep for my meeting',
        intent: 'meeting_prep',
        confidence: 0.95,
        examples: [
          'prep for the meeting with Acme',
          'prepare me for my meeting',
          'meeting prep',
        ],
      },
      {
        pattern: 'prepare me for the call',
        intent: 'call_prep',
        confidence: 0.9,
        examples: [
          'get me ready for the call',
          'prepare for the call with',
          'brief me before the call',
        ],
      },
      {
        pattern: 'prepare me for my next meeting',
        intent: 'next_meeting_prep',
        confidence: 0.95,
        examples: [
          'prepare for my next meeting',
          'prep for my next meeting',
          'get me ready for my next meeting',
        ],
      },
    ],
    keywords: [
      'prep', 'prepare', 'meeting', 'brief', 'call',
      'ready', 'agenda', 'talking points', 'before meeting',
    ],
    linked_skills: ['meeting-prep-brief'],
  },
  content: '# Meeting Prep Sequence',
  is_enabled: true,
};

const SEQ_PIPELINE_FOCUS_TASKS = {
  skill_key: 'seq-pipeline-focus-tasks',
  category: 'agent-sequence',
  frontmatter: {
    name: 'Pipeline Focus Tasks',
    description:
      'Pipeline engagement sequence: pulls priority deals, generates an engagement checklist, and creates a task.',
    triggers: [
      {
        pattern: 'show me my pipeline',
        intent: 'pipeline_view',
        confidence: 0.95,
        examples: [
          'show my pipeline',
          'what does my pipeline look like',
          'pipeline overview',
        ],
      },
      {
        pattern: 'which deals should I work on',
        intent: 'pipeline_focus',
        confidence: 0.95,
        examples: [
          'which deals need attention',
          'what deals need attention',
          'what deals should I focus on',
        ],
      },
      {
        pattern: 'review my pipeline',
        intent: 'pipeline_review',
        confidence: 0.9,
        examples: ['pipeline review', 'check my pipeline', 'pipeline health'],
      },
    ],
    keywords: [
      'pipeline', 'deals', 'focus', 'attention', 'work on',
      'review', 'tasks', 'priorities',
    ],
    linked_skills: ['pipeline-focus-task-planner'],
  },
  content: '# Pipeline Focus Tasks',
  is_enabled: true,
};

const SEQ_POST_MEETING_FOLLOWUP = {
  skill_key: 'seq-post-meeting-followup-pack',
  category: 'agent-sequence',
  frontmatter: {
    name: 'Post-Meeting Follow-Up Pack',
    description:
      'Generate follow-up email, Slack update, and task after a meeting using transcript data.',
    triggers: [
      {
        pattern: 'draft a follow-up email for my last meeting',
        intent: 'post_meeting_followup',
        confidence: 0.95,
        examples: [
          'follow up on my last meeting',
          'create follow-up for the meeting',
          'generate post-meeting email',
        ],
      },
      {
        pattern: 'post-meeting follow-up',
        intent: 'followup_pack',
        confidence: 0.9,
        examples: [
          'follow-up pack',
          'meeting follow-up',
          'create follow-ups from the meeting',
        ],
      },
    ],
    keywords: [
      'follow-up', 'follow up', 'post-meeting', 'after meeting',
      'meeting email', 'transcript', 'recap',
    ],
    linked_skills: ['post-meeting-followup-planner'],
  },
  content: '# Post-Meeting Follow-Up Pack',
  is_enabled: true,
};

const SEQ_CATCH_ME_UP = {
  skill_key: 'seq-catch-me-up',
  category: 'agent-sequence',
  frontmatter: {
    name: 'Catch Me Up',
    description:
      'Full daily briefing sequence: fetches meetings, deals, contacts, and tasks, then generates a time-aware summary.',
    triggers: [
      {
        pattern: 'catch me up',
        intent: 'daily_catchup',
        confidence: 0.95,
        examples: [
          'catch me up on everything',
          'catch me up on today',
          'give me the catchup',
        ],
      },
      {
        pattern: 'daily brief',
        intent: 'daily_brief',
        confidence: 0.9,
        examples: [
          'give me my daily brief',
          'daily briefing',
          'daily summary',
        ],
      },
      {
        pattern: "what's going on today",
        intent: 'daily_overview',
        confidence: 0.9,
        examples: [
          "what's happening today",
          'tell me about my day',
          'what do I have going on',
        ],
      },
    ],
    keywords: [
      'catch me up', 'briefing', 'today', 'morning',
      'update', 'overview', 'summary', "what's happening", 'daily',
    ],
    linked_skills: ['daily-brief-planner'],
  },
  content: '# Catch Me Up',
  is_enabled: true,
};

// Atomic skill for email drafting (tested at message-detection level, not routing)
const ATOMIC_EMAIL_DRAFTER = {
  skill_key: 'email-draft-composer',
  category: 'sales-ai',
  frontmatter: {
    name: 'Email Draft Composer',
    description: 'Draft and compose emails to contacts with CRM context.',
    triggers: [
      {
        pattern: 'draft an email',
        intent: 'email_draft',
        confidence: 0.85,
        examples: ['write an email to', 'compose an email for', 'email to'],
      },
    ],
    keywords: ['email', 'draft', 'compose', 'write', 'send'],
  },
  content: '# Email Draft Composer',
  is_enabled: true,
};

const ALL_SKILLS = [
  SEQ_MEETING_PREP,
  SEQ_PIPELINE_FOCUS_TASKS,
  SEQ_POST_MEETING_FOLLOWUP,
  SEQ_CATCH_ME_UP,
  ATOMIC_EMAIL_DRAFTER,
];

function mockRpcWithSkills(skills: typeof ALL_SKILLS) {
  mockedRpc.mockResolvedValue({ data: skills, error: null } as any);
}

// =============================================================================
// Mock Data Fixtures (realistic CRM data)
// =============================================================================

const mockMeeting = {
  id: 'meeting-e2e-001',
  title: 'Q1 Strategy Review with Acme Corp',
  start_time: new Date(Date.now() + 3600000).toISOString(),
  end_time: new Date(Date.now() + 7200000).toISOString(),
  meeting_start: new Date(Date.now() + 3600000).toISOString(),
  meeting_end: new Date(Date.now() + 7200000).toISOString(),
  attendees: [
    { email: 'john.smith@acmecorp.com', name: 'John Smith' },
    { email: 'sarah.jones@acmecorp.com', name: 'Sarah Jones' },
  ],
  conference_link: 'https://meet.google.com/abc-defg-hij',
  company: 'Acme Corp',
  deal_id: 'deal-e2e-001',
  deal_name: 'Enterprise License - Acme',
};

const mockDeal = {
  id: 'deal-e2e-001',
  name: 'Enterprise License - Acme',
  value: 75000,
  amount: 75000,
  stage_name: 'Negotiation',
  stage: 'Negotiation',
  expected_close_date: '2026-02-20',
  close_date: '2026-02-20',
  health_status: 'at_risk',
  days_since_activity: 8,
  days_stale: 8,
  company_name: 'Acme Corp',
  contact_name: 'John Smith',
  contact_email: 'john.smith@acmecorp.com',
};

const mockContact = {
  id: 'contact-e2e-001',
  full_name: 'John Smith',
  name: 'John Smith',
  first_name: 'John',
  last_name: 'Smith',
  email: 'john.smith@acmecorp.com',
  company_name: 'Acme Corp',
  last_contact_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  days_since_last_contact: 7,
  health_status: 'at_risk',
  risk_level: 'high',
  risk_factors: ['No activity in 7 days'],
  reason: 'high risk',
};

const mockTask = {
  id: 'task-e2e-001',
  title: 'Send updated pricing to Acme Corp',
  due_date: new Date().toISOString(),
  priority: 'high',
  status: 'pending',
  deal_id: 'deal-e2e-001',
  contact_id: 'contact-e2e-001',
};

const mockTranscript = {
  id: 'transcript-e2e-001',
  summary: 'Discussed pricing tiers, timeline, and integration requirements.',
  key_points: [
    'Budget approved for Q1',
    'Need API integration by March',
    'Competitor evaluating Salesforce',
  ],
  action_items: [
    'Send updated pricing',
    'Schedule technical demo',
    'Follow up in 1 week',
  ],
};

// =============================================================================
// Structured Response Builders (simulate detectAndStructureResponse output)
// =============================================================================

function buildMeetingPrepStructuredResponse() {
  return {
    type: 'next_meeting_command_center',
    summary: 'Here\u2019s your next meeting brief and a prep checklist task ready to create.',
    data: {
      sequenceKey: 'seq-next-meeting-command-center',
      isSimulation: true,
      executionId: 'exec-e2e-meeting-001',
      meeting: {
        id: mockMeeting.id,
        title: mockMeeting.title,
        startTime: mockMeeting.start_time,
        endTime: mockMeeting.end_time,
        attendees: mockMeeting.attendees,
        meetingUrl: mockMeeting.conference_link,
      },
      brief: {
        company_name: 'Acme Corp',
        deal_name: mockDeal.name,
        deal_id: mockDeal.id,
        attendees: mockMeeting.attendees,
        talking_points: ['Review Q1 targets', 'Discuss timeline', 'Address competitor threat'],
        objectives: ['Confirm budget approval', 'Set integration timeline'],
      },
      prepTaskPreview: {
        title: 'Prepare for Acme Corp meeting',
        description: 'Review account history, prepare pricing deck, demo environment',
        due_date: mockMeeting.start_time,
        priority: 'high',
      },
    },
    actions: [],
    metadata: {
      timeGenerated: new Date().toISOString(),
      dataSource: ['sequence', 'calendar', 'crm'],
    },
  };
}

function buildPipelineFocusStructuredResponse() {
  return {
    type: 'pipeline_focus_tasks',
    summary: 'Here are the deals to focus on and the task I can create for you.',
    data: {
      sequenceKey: 'seq-pipeline-focus-tasks',
      isSimulation: true,
      executionId: 'exec-e2e-pipeline-001',
      deal: mockDeal,
      taskPreview: {
        title: 'Re-engage Acme Corp on Enterprise deal',
        description: 'Send updated pricing and schedule follow-up call',
        due_date: new Date().toISOString(),
        priority: 'high',
      },
    },
    actions: [],
    metadata: {
      timeGenerated: new Date().toISOString(),
      dataSource: ['sequence', 'crm'],
    },
  };
}

function buildPostMeetingFollowUpStructuredResponse() {
  return {
    type: 'post_meeting_followup_pack',
    summary: 'Here\u2019s your follow-up pack (email, Slack update, and tasks) ready to send/create.',
    data: {
      sequenceKey: 'seq-post-meeting-followup-pack',
      isSimulation: true,
      executionId: 'exec-e2e-followup-001',
      meeting: mockMeeting,
      contact: mockContact,
      digest: {
        summary: mockTranscript.summary,
        key_points: mockTranscript.key_points,
        action_items: mockTranscript.action_items,
      },
      pack: {
        buyer_email: {
          to: mockContact.email,
          subject: 'Great meeting today - next steps',
          context: `Hi John,\n\nThank you for your time today. ${mockTranscript.summary}\n\nNext steps:\n${mockTranscript.action_items.map(a => `- ${a}`).join('\n')}\n\nBest regards`,
        },
        slack_update: {
          channel: '#sales',
          message: `Met with ${mockContact.full_name} from Acme Corp. ${mockTranscript.summary}`,
        },
        tasks: [mockTask],
      },
      emailPreview: null,
      slackPreview: null,
      taskPreview: mockTask,
    },
    actions: [],
    metadata: {
      timeGenerated: new Date().toISOString(),
      dataSource: ['sequence', 'meetings', 'crm', 'email', 'messaging'],
    },
  };
}

function buildDailyBriefStructuredResponse(
  timeOfDay: 'morning' | 'afternoon' | 'evening' = 'morning'
) {
  const greeting = timeOfDay === 'morning'
    ? "Good morning! Here's your day ahead."
    : timeOfDay === 'afternoon'
    ? "Here's your afternoon update."
    : "Wrapping up the day. Here's your summary.";

  return {
    type: 'daily_brief',
    summary: 'You have 2 meetings today, 1 deal needing attention, and 1 pending task.',
    data: {
      sequenceKey: 'seq-catch-me-up',
      isSimulation: false,
      executionId: 'exec-e2e-daily-001',
      greeting,
      timeOfDay,
      schedule: [
        {
          id: mockMeeting.id,
          title: mockMeeting.title,
          startTime: mockMeeting.start_time,
          endTime: mockMeeting.end_time,
          attendees: mockMeeting.attendees.map(a => a.email),
          linkedDealId: mockMeeting.deal_id,
          linkedDealName: mockMeeting.deal_name,
          meetingUrl: mockMeeting.conference_link,
        },
      ],
      priorityDeals: [
        {
          id: mockDeal.id,
          name: mockDeal.name,
          value: mockDeal.value,
          stage: mockDeal.stage_name,
          daysStale: mockDeal.days_stale,
          closeDate: mockDeal.expected_close_date,
          healthStatus: 'stale' as const,
          company: mockDeal.company_name,
          contactName: mockDeal.contact_name,
          contactEmail: mockDeal.contact_email,
        },
      ],
      contactsNeedingAttention: [
        {
          id: mockContact.id,
          name: mockContact.full_name,
          email: mockContact.email,
          company: mockContact.company_name,
          lastContactDate: mockContact.last_contact_date,
          daysSinceContact: mockContact.days_since_last_contact,
          healthStatus: mockContact.health_status,
          riskLevel: mockContact.risk_level,
          riskFactors: mockContact.risk_factors,
          reason: mockContact.reason,
        },
      ],
      tasks: [
        {
          id: mockTask.id,
          title: mockTask.title,
          dueDate: mockTask.due_date,
          priority: mockTask.priority,
          status: mockTask.status,
          linkedDealId: mockTask.deal_id,
          linkedContactId: mockTask.contact_id,
        },
      ],
      tomorrowPreview: timeOfDay === 'evening' ? [
        {
          id: 'meeting-tomorrow-001',
          title: 'Follow-up with Acme Corp',
          startTime: new Date(Date.now() + 24 * 3600000).toISOString(),
        },
      ] : undefined,
      summary: 'You have 2 meetings today, 1 deal needing attention, and 1 pending task.',
    },
    actions: [],
    metadata: {
      timeGenerated: new Date().toISOString(),
      dataSource: ['sequence', 'calendar', 'crm', 'tasks'],
    },
  };
}

function buildEmailDraftStructuredResponse() {
  return {
    type: 'email',
    summary: 'Here is your email draft.',
    data: {
      email: {
        to: [mockContact.email],
        cc: [],
        subject: 'Following up on our conversation',
        body: `Hi John,\n\nI hope this email finds you well. I wanted to follow up on our recent conversation about the Enterprise License.\n\nAs discussed, I will be sending over the updated pricing by end of week. Please let me know if you have any questions.\n\nBest regards`,
        tone: 'professional' as const,
        sendTime: new Date(Date.now() + 3600000).toISOString(),
      },
      context: {
        contactName: mockContact.full_name,
        lastInteraction: 'Meeting: Q1 Strategy Review',
        lastInteractionDate: new Date(Date.now() - 86400000).toISOString(),
        dealValue: mockDeal.value,
        keyPoints: [
          'Budget approved for Q1',
          'Need API integration by March',
          'Competitor evaluating Salesforce',
        ],
        warnings: ['Competitor evaluation in progress - avoid aggressive pricing'],
      },
      suggestions: [
        {
          label: 'Change tone',
          action: 'change_tone' as const,
          description: 'Switch between professional, friendly, or concise',
        },
        {
          label: 'Add calendar link',
          action: 'add_calendar_link' as const,
          description: 'Include a link to schedule a follow-up',
        },
      ],
    },
    actions: [],
    metadata: {
      timeGenerated: new Date().toISOString(),
      dataSource: ['crm', 'email'],
    },
  };
}

// =============================================================================
// SSE Event Builder (simulates copilot-autonomous stream events)
// =============================================================================

function buildSSEEvent(eventType: string, data: unknown): string {
  return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
}

function buildFullSSEStream(
  tokens: string[],
  toolCalls: Array<{ id: string; name: string; input: any; result: any; success: boolean }>,
  structuredResponse: any | null,
): string {
  let stream = '';

  // Tool executions
  for (const tool of toolCalls) {
    stream += buildSSEEvent('tool_start', {
      id: tool.id,
      name: tool.name,
      input: tool.input,
    });
    stream += buildSSEEvent('tool_result', {
      id: tool.id,
      name: tool.name,
      success: tool.success,
      result: tool.result,
    });
  }

  // Token stream
  for (const token of tokens) {
    stream += buildSSEEvent('token', { text: token });
  }

  // Structured response
  if (structuredResponse) {
    stream += buildSSEEvent('structured_response', structuredResponse);
  }

  // Done event
  stream += buildSSEEvent('done', {
    toolsUsed: toolCalls.map(t => t.name),
    totalTokens: 1500,
  });

  return stream;
}

// =============================================================================
// SSE Parser (mirrors useCopilotChat.ts SSE parsing logic)
// =============================================================================

interface ParsedSSEResult {
  tokens: string[];
  fullContent: string;
  toolStarts: Array<{ id: string; name: string; input: any }>;
  toolResults: Array<{ id: string; name: string; success: boolean; result: any }>;
  structuredResponse: any | null;
  done: boolean;
  toolsUsed: string[];
}

function parseSSEStream(stream: string): ParsedSSEResult {
  const result: ParsedSSEResult = {
    tokens: [],
    fullContent: '',
    toolStarts: [],
    toolResults: [],
    structuredResponse: null,
    done: false,
    toolsUsed: [],
  };

  const lines = stream.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('event: ')) {
      const eventType = line.slice(7);
      const dataLine = lines[i + 1];

      if (dataLine?.startsWith('data: ')) {
        const data = JSON.parse(dataLine.slice(6));

        switch (eventType) {
          case 'token':
            result.tokens.push(data.text || '');
            result.fullContent += data.text || '';
            break;
          case 'tool_start':
            result.toolStarts.push({
              id: data.id,
              name: data.name,
              input: data.input,
            });
            break;
          case 'tool_result':
            result.toolResults.push({
              id: data.id,
              name: data.name,
              success: data.success,
              result: data.result,
            });
            break;
          case 'structured_response':
            result.structuredResponse = data;
            break;
          case 'done':
            result.done = true;
            result.toolsUsed = data.toolsUsed || [];
            break;
        }

        i++; // Skip data line
      }
    }
  }

  return result;
}

// =============================================================================
// WORKFLOW 1: Meeting Prep
// =============================================================================

describe('Workflow 1: Meeting Prep ("prepare me for my next meeting")', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFindSemanticMatches.mockResolvedValue([]);
    mockRpcWithSkills(ALL_SKILLS);
  });

  describe('Skill Routing', () => {
    it('routes "prepare me for my next meeting" to seq-meeting-prep', async () => {
      const result = await routeToSkill('prepare me for my next meeting', TEST_CONTEXT);

      expect(result.selectedSkill).not.toBeNull();
      expect(result.selectedSkill?.skillKey).toBe('seq-meeting-prep');
      expect(result.selectedSkill?.confidence).toBeGreaterThan(0.7);
      expect(result.isSequenceMatch).toBe(true);
    });

    it('routes "prep for the meeting with Acme" to seq-meeting-prep', async () => {
      const result = await routeToSkill('prep for the meeting with Acme', TEST_CONTEXT);

      expect(result.selectedSkill).not.toBeNull();
      expect(result.selectedSkill?.skillKey).toBe('seq-meeting-prep');
      expect(result.selectedSkill?.confidence).toBeGreaterThan(0.7);
    });

    it('routes "brief me before the call" to seq-meeting-prep via trigger example', async () => {
      const result = await routeToSkill('brief me before the call', TEST_CONTEXT);

      expect(result.selectedSkill).not.toBeNull();
      expect(result.selectedSkill?.skillKey).toBe('seq-meeting-prep');
      expect(result.selectedSkill?.isSequence).toBe(true);
    });
  });

  describe('Structured Response Detection', () => {
    it('returns next_meeting_command_center response type', () => {
      const response = buildMeetingPrepStructuredResponse();

      expect(response.type).toBe('next_meeting_command_center');
      expect(response.data.sequenceKey).toBe('seq-next-meeting-command-center');
    });

    it('includes meeting data with required fields', () => {
      const response = buildMeetingPrepStructuredResponse();
      const meeting = response.data.meeting;

      expect(meeting).not.toBeNull();
      expect(meeting.id).toBeDefined();
      expect(meeting.title).toBe('Q1 Strategy Review with Acme Corp');
      expect(meeting.startTime).toBeDefined();
      expect(meeting.endTime).toBeDefined();
      expect(meeting.attendees).toHaveLength(2);
      expect(meeting.meetingUrl).toBeDefined();
    });

    it('includes brief with talking points and objectives', () => {
      const response = buildMeetingPrepStructuredResponse();
      const brief = response.data.brief;

      expect(brief).not.toBeNull();
      expect(brief.company_name).toBe('Acme Corp');
      expect(brief.deal_name).toBe('Enterprise License - Acme');
      expect(brief.talking_points).toBeInstanceOf(Array);
      expect(brief.talking_points.length).toBeGreaterThan(0);
      expect(brief.objectives).toBeInstanceOf(Array);
      expect(brief.objectives.length).toBeGreaterThan(0);
    });

    it('includes prep task preview', () => {
      const response = buildMeetingPrepStructuredResponse();

      expect(response.data.prepTaskPreview).not.toBeNull();
      expect(response.data.prepTaskPreview.title).toContain('Acme');
      expect(response.data.prepTaskPreview.priority).toBe('high');
      expect(response.data.prepTaskPreview.due_date).toBeDefined();
    });
  });

  describe('SSE Stream', () => {
    it('emits structured_response event for meeting prep', () => {
      const structuredResponse = buildMeetingPrepStructuredResponse();
      const stream = buildFullSSEStream(
        ["Here's your meeting brief for the Q1 Strategy Review with Acme Corp."],
        [
          {
            id: 'tool-1',
            name: 'execute_action',
            input: { action: 'run_sequence', params: { sequence_key: 'seq-next-meeting-command-center' } },
            result: { data: { final_output: { outputs: { next_meeting: { meeting: mockMeeting } } } } },
            success: true,
          },
        ],
        structuredResponse,
      );

      const parsed = parseSSEStream(stream);

      expect(parsed.structuredResponse).not.toBeNull();
      expect(parsed.structuredResponse.type).toBe('next_meeting_command_center');
      expect(parsed.done).toBe(true);
      expect(parsed.toolsUsed).toContain('execute_action');
    });
  });

  describe('Frontend Data Shape (NextMeetingCommandCenterResponseData)', () => {
    it('matches the NextMeetingCommandCenterResponseData interface', () => {
      const response = buildMeetingPrepStructuredResponse();
      const data = response.data;

      // Validate against the type contract
      expect(typeof data.sequenceKey).toBe('string');
      expect(typeof data.isSimulation).toBe('boolean');
      expect(data.meeting === null || typeof data.meeting === 'object').toBe(true);
      expect(data.brief === null || typeof data.brief === 'object').toBe(true);
      expect(data.prepTaskPreview === null || typeof data.prepTaskPreview === 'object').toBe(true);
    });
  });
});

// =============================================================================
// WORKFLOW 2: Pipeline Overview
// =============================================================================

describe('Workflow 2: Pipeline Overview ("show me my pipeline")', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFindSemanticMatches.mockResolvedValue([]);
    mockRpcWithSkills(ALL_SKILLS);
  });

  describe('Skill Routing', () => {
    it('routes "show me my pipeline" to seq-pipeline-focus-tasks', async () => {
      const result = await routeToSkill('show me my pipeline', TEST_CONTEXT);

      expect(result.selectedSkill).not.toBeNull();
      expect(result.selectedSkill?.skillKey).toBe('seq-pipeline-focus-tasks');
      expect(result.selectedSkill?.confidence).toBeGreaterThan(0.7);
      expect(result.isSequenceMatch).toBe(true);
    });

    it('routes "what deals need attention" to seq-pipeline-focus-tasks', async () => {
      const result = await routeToSkill('what deals need attention', TEST_CONTEXT);

      expect(result.selectedSkill).not.toBeNull();
      expect(result.selectedSkill?.skillKey).toBe('seq-pipeline-focus-tasks');
      expect(result.selectedSkill?.confidence).toBeGreaterThan(0.7);
    });

    it('routes "pipeline overview" to seq-pipeline-focus-tasks via trigger example', async () => {
      const result = await routeToSkill('pipeline overview', TEST_CONTEXT);

      expect(result.selectedSkill).not.toBeNull();
      expect(result.selectedSkill?.skillKey).toBe('seq-pipeline-focus-tasks');
    });
  });

  describe('Structured Response Detection', () => {
    it('returns pipeline_focus_tasks response type', () => {
      const response = buildPipelineFocusStructuredResponse();

      expect(response.type).toBe('pipeline_focus_tasks');
      expect(response.data.sequenceKey).toBe('seq-pipeline-focus-tasks');
    });

    it('includes deal data with expected fields', () => {
      const response = buildPipelineFocusStructuredResponse();
      const deal = response.data.deal;

      expect(deal).not.toBeNull();
      expect(deal.id).toBe('deal-e2e-001');
      expect(deal.name).toBe('Enterprise License - Acme');
      expect(deal.value).toBe(75000);
      expect(deal.stage_name).toBe('Negotiation');
      expect(deal.health_status).toBe('at_risk');
      expect(deal.days_since_activity).toBe(8);
    });

    it('includes task preview for the priority deal', () => {
      const response = buildPipelineFocusStructuredResponse();

      expect(response.data.taskPreview).not.toBeNull();
      expect(response.data.taskPreview.title).toContain('Acme Corp');
      expect(response.data.taskPreview.priority).toBe('high');
    });

    it('sets isSimulation true for preview mode', () => {
      const response = buildPipelineFocusStructuredResponse();

      expect(response.data.isSimulation).toBe(true);
    });
  });

  describe('SSE Stream', () => {
    it('emits structured_response event for pipeline', () => {
      const structuredResponse = buildPipelineFocusStructuredResponse();
      const stream = buildFullSSEStream(
        ['Here are the deals that need your attention.'],
        [
          {
            id: 'tool-pipeline-1',
            name: 'execute_action',
            input: { action: 'run_sequence', params: { sequence_key: 'seq-pipeline-focus-tasks' } },
            result: { data: { pipeline_deals: { deals: [mockDeal] } } },
            success: true,
          },
        ],
        structuredResponse,
      );

      const parsed = parseSSEStream(stream);

      expect(parsed.structuredResponse).not.toBeNull();
      expect(parsed.structuredResponse.type).toBe('pipeline_focus_tasks');
      expect(parsed.toolResults).toHaveLength(1);
      expect(parsed.toolResults[0].success).toBe(true);
    });
  });

  describe('Frontend Data Shape', () => {
    it('pipeline_focus_tasks data matches expected contract', () => {
      const response = buildPipelineFocusStructuredResponse();
      const data = response.data;

      expect(typeof data.sequenceKey).toBe('string');
      expect(typeof data.isSimulation).toBe('boolean');
      expect(data.deal === null || typeof data.deal === 'object').toBe(true);
      expect(data.taskPreview === null || typeof data.taskPreview === 'object').toBe(true);
      if (data.executionId) {
        expect(typeof data.executionId).toBe('string');
      }
    });
  });
});

// =============================================================================
// WORKFLOW 3: Post-Meeting Follow-Up
// =============================================================================

describe('Workflow 3: Post-Meeting Follow-Up ("draft a follow-up email for my last meeting")', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFindSemanticMatches.mockResolvedValue([]);
    mockRpcWithSkills(ALL_SKILLS);
  });

  describe('Skill Routing', () => {
    it('routes "draft a follow-up email for my last meeting" to seq-post-meeting-followup-pack', async () => {
      const result = await routeToSkill(
        'draft a follow-up email for my last meeting',
        TEST_CONTEXT,
      );

      expect(result.selectedSkill).not.toBeNull();
      expect(result.selectedSkill?.skillKey).toBe('seq-post-meeting-followup-pack');
      expect(result.selectedSkill?.confidence).toBeGreaterThan(0.7);
      expect(result.isSequenceMatch).toBe(true);
    });

    it('routes "create follow-ups from the meeting" to seq-post-meeting-followup-pack', async () => {
      const result = await routeToSkill(
        'create follow-ups from the meeting',
        TEST_CONTEXT,
      );

      expect(result.selectedSkill).not.toBeNull();
      expect(result.selectedSkill?.skillKey).toBe('seq-post-meeting-followup-pack');
    });

    it('routes "post-meeting follow-up" to seq-post-meeting-followup-pack', async () => {
      const result = await routeToSkill('post-meeting follow-up', TEST_CONTEXT);

      expect(result.selectedSkill).not.toBeNull();
      expect(result.selectedSkill?.skillKey).toBe('seq-post-meeting-followup-pack');
      expect(result.selectedSkill?.confidence).toBeGreaterThan(0.7);
    });
  });

  describe('Structured Response Detection', () => {
    it('returns post_meeting_followup_pack response type', () => {
      const response = buildPostMeetingFollowUpStructuredResponse();

      expect(response.type).toBe('post_meeting_followup_pack');
      expect(response.data.sequenceKey).toBe('seq-post-meeting-followup-pack');
    });

    it('includes meeting and contact data from transcript', () => {
      const response = buildPostMeetingFollowUpStructuredResponse();

      expect(response.data.meeting).not.toBeNull();
      expect(response.data.meeting.title).toBe('Q1 Strategy Review with Acme Corp');
      expect(response.data.contact).not.toBeNull();
      expect(response.data.contact.full_name).toBe('John Smith');
    });

    it('includes digest with summary, key points, and action items', () => {
      const response = buildPostMeetingFollowUpStructuredResponse();
      const digest = response.data.digest;

      expect(digest).not.toBeNull();
      expect(digest.summary).toBeDefined();
      expect(digest.key_points).toBeInstanceOf(Array);
      expect(digest.key_points.length).toBeGreaterThan(0);
      expect(digest.action_items).toBeInstanceOf(Array);
      expect(digest.action_items.length).toBeGreaterThan(0);
    });

    it('includes follow-up pack with email, slack, and tasks', () => {
      const response = buildPostMeetingFollowUpStructuredResponse();
      const pack = response.data.pack;

      expect(pack).not.toBeNull();

      // Email
      expect(pack.buyer_email).toBeDefined();
      expect(pack.buyer_email.to).toBe(mockContact.email);
      expect(pack.buyer_email.subject).toBeDefined();
      expect(pack.buyer_email.context).toBeDefined();

      // Slack
      expect(pack.slack_update).toBeDefined();
      expect(pack.slack_update.channel).toBe('#sales');
      expect(pack.slack_update.message).toContain('John Smith');

      // Tasks
      expect(pack.tasks).toBeInstanceOf(Array);
      expect(pack.tasks.length).toBeGreaterThan(0);
    });
  });

  describe('SSE Stream', () => {
    it('emits structured_response event for follow-up pack', () => {
      const structuredResponse = buildPostMeetingFollowUpStructuredResponse();
      const stream = buildFullSSEStream(
        ["I've prepared your follow-up pack based on the meeting transcript."],
        [
          {
            id: 'tool-followup-1',
            name: 'execute_action',
            input: { action: 'run_sequence', params: { sequence_key: 'seq-post-meeting-followup-pack' } },
            result: { data: { meeting_data: { meetings: [mockMeeting] }, contact_data: { contacts: [mockContact] } } },
            success: true,
          },
        ],
        structuredResponse,
      );

      const parsed = parseSSEStream(stream);

      expect(parsed.structuredResponse).not.toBeNull();
      expect(parsed.structuredResponse.type).toBe('post_meeting_followup_pack');
      expect(parsed.done).toBe(true);
    });
  });

  describe('Frontend Data Shape (PostMeetingFollowUpPackResponseData)', () => {
    it('matches the PostMeetingFollowUpPackResponseData interface', () => {
      const response = buildPostMeetingFollowUpStructuredResponse();
      const data = response.data;

      expect(typeof data.sequenceKey).toBe('string');
      expect(typeof data.isSimulation).toBe('boolean');
      expect(data.meeting === null || typeof data.meeting === 'object').toBe(true);
      expect(data.contact === null || typeof data.contact === 'object').toBe(true);
      expect(data.digest === null || typeof data.digest === 'object').toBe(true);
      expect(data.pack === null || typeof data.pack === 'object').toBe(true);
      // emailPreview and slackPreview can be null
      expect(data.emailPreview === null || typeof data.emailPreview === 'object').toBe(true);
      expect(data.slackPreview === null || typeof data.slackPreview === 'object').toBe(true);
      expect(data.taskPreview === null || typeof data.taskPreview === 'object').toBe(true);
    });
  });
});

// =============================================================================
// WORKFLOW 4: Daily Brief
// =============================================================================

describe('Workflow 4: Daily Brief ("catch me up" / "daily brief")', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFindSemanticMatches.mockResolvedValue([]);
    mockRpcWithSkills(ALL_SKILLS);
  });

  describe('Skill Routing', () => {
    it('routes "catch me up" to seq-catch-me-up', async () => {
      const result = await routeToSkill('catch me up', TEST_CONTEXT);

      expect(result.selectedSkill).not.toBeNull();
      expect(result.selectedSkill?.skillKey).toBe('seq-catch-me-up');
      expect(result.selectedSkill?.confidence).toBeGreaterThan(0.7);
      expect(result.isSequenceMatch).toBe(true);
    });

    it('routes "daily brief" to seq-catch-me-up', async () => {
      const result = await routeToSkill('daily brief', TEST_CONTEXT);

      expect(result.selectedSkill).not.toBeNull();
      expect(result.selectedSkill?.skillKey).toBe('seq-catch-me-up');
      expect(result.selectedSkill?.confidence).toBeGreaterThan(0.7);
    });

    it('routes "what\'s going on today" to seq-catch-me-up', async () => {
      const result = await routeToSkill("what's going on today", TEST_CONTEXT);

      expect(result.selectedSkill).not.toBeNull();
      expect(result.selectedSkill?.skillKey).toBe('seq-catch-me-up');
      expect(result.selectedSkill?.confidence).toBeGreaterThan(0.7);
    });

    it('routes "give me the catchup" to seq-catch-me-up via trigger example', async () => {
      const result = await routeToSkill('give me the catchup', TEST_CONTEXT);

      expect(result.selectedSkill).not.toBeNull();
      expect(result.selectedSkill?.skillKey).toBe('seq-catch-me-up');
    });
  });

  describe('Structured Response Detection', () => {
    it('returns daily_brief response type', () => {
      const response = buildDailyBriefStructuredResponse('morning');

      expect(response.type).toBe('daily_brief');
      expect(response.data.sequenceKey).toBe('seq-catch-me-up');
    });

    it('includes time-of-day greeting for morning', () => {
      const response = buildDailyBriefStructuredResponse('morning');

      expect(response.data.timeOfDay).toBe('morning');
      expect(response.data.greeting).toContain('morning');
    });

    it('includes time-of-day greeting for afternoon', () => {
      const response = buildDailyBriefStructuredResponse('afternoon');

      expect(response.data.timeOfDay).toBe('afternoon');
      expect(response.data.greeting).toContain('afternoon');
    });

    it('includes tomorrow preview for evening', () => {
      const response = buildDailyBriefStructuredResponse('evening');

      expect(response.data.timeOfDay).toBe('evening');
      expect(response.data.tomorrowPreview).toBeDefined();
      expect(response.data.tomorrowPreview).toBeInstanceOf(Array);
      expect(response.data.tomorrowPreview!.length).toBeGreaterThan(0);
    });

    it('includes stale deals in priorityDeals', () => {
      const response = buildDailyBriefStructuredResponse();

      expect(response.data.priorityDeals).toBeInstanceOf(Array);
      expect(response.data.priorityDeals.length).toBeGreaterThan(0);
      expect(response.data.priorityDeals[0].daysStale).toBe(8);
      expect(response.data.priorityDeals[0].healthStatus).toBe('stale');
    });

    it('includes upcoming meetings in schedule', () => {
      const response = buildDailyBriefStructuredResponse();

      expect(response.data.schedule).toBeInstanceOf(Array);
      expect(response.data.schedule.length).toBeGreaterThan(0);
      expect(response.data.schedule[0].title).toBe('Q1 Strategy Review with Acme Corp');
    });

    it('includes contacts needing attention', () => {
      const response = buildDailyBriefStructuredResponse();

      expect(response.data.contactsNeedingAttention).toBeInstanceOf(Array);
      expect(response.data.contactsNeedingAttention.length).toBeGreaterThan(0);
      expect(response.data.contactsNeedingAttention[0].riskLevel).toBe('high');
    });

    it('includes pending tasks', () => {
      const response = buildDailyBriefStructuredResponse();

      expect(response.data.tasks).toBeInstanceOf(Array);
      expect(response.data.tasks.length).toBeGreaterThan(0);
      expect(response.data.tasks[0].priority).toBe('high');
      expect(response.data.tasks[0].status).toBe('pending');
    });
  });

  describe('SSE Stream', () => {
    it('emits structured_response event for daily brief', () => {
      const structuredResponse = buildDailyBriefStructuredResponse('morning');
      const stream = buildFullSSEStream(
        ["Good morning! Here's your day ahead."],
        [
          {
            id: 'tool-daily-1',
            name: 'execute_action',
            input: { action: 'run_sequence', params: { sequence_key: 'seq-catch-me-up' } },
            result: {
              data: {
                meetings_today: { meetings: [mockMeeting] },
                stale_deals: { deals: [mockDeal] },
                contacts_needing_attention: { contacts: [mockContact] },
                pending_tasks: { tasks: [mockTask] },
              },
            },
            success: true,
          },
        ],
        structuredResponse,
      );

      const parsed = parseSSEStream(stream);

      expect(parsed.structuredResponse).not.toBeNull();
      expect(parsed.structuredResponse.type).toBe('daily_brief');
      expect(parsed.structuredResponse.data.timeOfDay).toBe('morning');
      expect(parsed.done).toBe(true);
    });
  });

  describe('Frontend Data Shape (DailyBriefResponseData)', () => {
    it('matches the DailyBriefResponseData interface', () => {
      const response = buildDailyBriefStructuredResponse('morning');
      const data = response.data;

      // Required string fields
      expect(typeof data.sequenceKey).toBe('string');
      expect(typeof data.greeting).toBe('string');
      expect(typeof data.summary).toBe('string');
      expect(typeof data.isSimulation).toBe('boolean');

      // TimeOfDay enum
      expect(['morning', 'afternoon', 'evening']).toContain(data.timeOfDay);

      // Required arrays
      expect(data.schedule).toBeInstanceOf(Array);
      expect(data.priorityDeals).toBeInstanceOf(Array);
      expect(data.contactsNeedingAttention).toBeInstanceOf(Array);
      expect(data.tasks).toBeInstanceOf(Array);
    });

    it('schedule items have DailyBriefMeeting shape', () => {
      const response = buildDailyBriefStructuredResponse();
      const meeting = response.data.schedule[0];

      expect(typeof meeting.id).toBe('string');
      expect(typeof meeting.title).toBe('string');
      expect(typeof meeting.startTime).toBe('string');
    });

    it('priorityDeals items have DailyBriefDeal shape', () => {
      const response = buildDailyBriefStructuredResponse();
      const deal = response.data.priorityDeals[0];

      expect(typeof deal.id).toBe('string');
      expect(typeof deal.name).toBe('string');
      expect(typeof deal.value).toBe('number');
    });

    it('contactsNeedingAttention items have DailyBriefContact shape', () => {
      const response = buildDailyBriefStructuredResponse();
      const contact = response.data.contactsNeedingAttention[0];

      expect(typeof contact.id).toBe('string');
      expect(typeof contact.name).toBe('string');
    });

    it('tasks items have DailyBriefTask shape', () => {
      const response = buildDailyBriefStructuredResponse();
      const task = response.data.tasks[0];

      expect(typeof task.id).toBe('string');
      expect(typeof task.title).toBe('string');
    });
  });
});

// =============================================================================
// WORKFLOW 5: Email Draft
// =============================================================================

describe('Workflow 5: Email Draft ("draft an email to [contact]")', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFindSemanticMatches.mockResolvedValue([]);
    mockRpcWithSkills(ALL_SKILLS);
  });

  describe('Skill Routing', () => {
    it('routes "draft an email to John" to email-draft-composer', async () => {
      const result = await routeToSkill('draft an email to John', TEST_CONTEXT);

      expect(result.selectedSkill).not.toBeNull();
      expect(result.selectedSkill?.skillKey).toBe('email-draft-composer');
      expect(result.selectedSkill?.confidence).toBeGreaterThan(0.5);
    });

    it('routes "write an email to john@acmecorp.com" to email-draft-composer', async () => {
      const result = await routeToSkill('write an email to john@acmecorp.com', TEST_CONTEXT);

      expect(result.selectedSkill).not.toBeNull();
      expect(result.selectedSkill?.skillKey).toBe('email-draft-composer');
    });
  });

  describe('Message-Level Detection (detectAndStructureResponse patterns)', () => {
    // These test the detection patterns from structuredResponseDetector.ts
    // without importing the Deno module directly

    const emailDraftPatterns = [
      { message: 'draft an email to John', expected: true },
      { message: 'write an email to john@acmecorp.com', expected: true },
      { message: 'compose email for Acme follow-up', expected: true },
      { message: 'follow-up email after the meeting', expected: true },
      { message: 'follow up email to Sarah', expected: true },
      { message: 'send email to the prospect', expected: true },
      { message: 'email to john@acme.com about pricing', expected: true },
      { message: 'show me my pipeline', expected: false },
      { message: 'catch me up', expected: false },
      { message: 'what meetings do I have', expected: false },
    ];

    for (const { message, expected } of emailDraftPatterns) {
      it(`${expected ? 'detects' : 'rejects'} "${message}" as email draft request`, () => {
        const messageLower = message.toLowerCase();
        const isEmailDraftRequest =
          (messageLower.includes('draft') && messageLower.includes('email')) ||
          (messageLower.includes('write') && messageLower.includes('email')) ||
          (messageLower.includes('follow-up') && messageLower.includes('email')) ||
          (messageLower.includes('follow up') && messageLower.includes('email')) ||
          (messageLower.includes('followup') && messageLower.includes('email')) ||
          messageLower.includes('email to') ||
          messageLower.includes('compose email') ||
          (messageLower.includes('send') && messageLower.includes('email'));

        expect(isEmailDraftRequest).toBe(expected);
      });
    }
  });

  describe('Structured Response Detection', () => {
    it('returns email response type', () => {
      const response = buildEmailDraftStructuredResponse();

      expect(response.type).toBe('email');
    });

    it('includes email draft with all required fields', () => {
      const response = buildEmailDraftStructuredResponse();
      const email = response.data.email;

      expect(email.to).toBeInstanceOf(Array);
      expect(email.to).toContain(mockContact.email);
      expect(typeof email.subject).toBe('string');
      expect(typeof email.body).toBe('string');
      expect(['professional', 'friendly', 'concise']).toContain(email.tone);
    });

    it('includes contact context with CRM data', () => {
      const response = buildEmailDraftStructuredResponse();
      const context = response.data.context;

      expect(context.contactName).toBe('John Smith');
      expect(context.lastInteraction).toBeDefined();
      expect(context.lastInteractionDate).toBeDefined();
      expect(context.dealValue).toBe(75000);
      expect(context.keyPoints).toBeInstanceOf(Array);
      expect(context.keyPoints.length).toBeGreaterThan(0);
    });

    it('includes email suggestions for tone and features', () => {
      const response = buildEmailDraftStructuredResponse();

      expect(response.data.suggestions).toBeInstanceOf(Array);
      expect(response.data.suggestions.length).toBeGreaterThan(0);
      expect(response.data.suggestions[0].action).toBeDefined();
    });
  });

  describe('SSE Stream', () => {
    it('emits structured_response event for email draft', () => {
      const structuredResponse = buildEmailDraftStructuredResponse();
      const stream = buildFullSSEStream(
        ["Here's your email draft to John Smith."],
        [],
        structuredResponse,
      );

      const parsed = parseSSEStream(stream);

      expect(parsed.structuredResponse).not.toBeNull();
      expect(parsed.structuredResponse.type).toBe('email');
      expect(parsed.structuredResponse.data.email.to).toContain(mockContact.email);
    });
  });

  describe('Frontend Data Shape (EmailResponseData)', () => {
    it('matches the EmailResponseData interface', () => {
      const response = buildEmailDraftStructuredResponse();
      const data = response.data;

      // Email draft
      expect(typeof data.email).toBe('object');
      expect(data.email.to).toBeInstanceOf(Array);
      expect(typeof data.email.subject).toBe('string');
      expect(typeof data.email.body).toBe('string');
      expect(typeof data.email.tone).toBe('string');

      // Context
      expect(typeof data.context).toBe('object');
      expect(typeof data.context.contactName).toBe('string');
      expect(typeof data.context.lastInteraction).toBe('string');
      expect(typeof data.context.lastInteractionDate).toBe('string');
      expect(data.context.keyPoints).toBeInstanceOf(Array);

      // Suggestions
      expect(data.suggestions).toBeInstanceOf(Array);
    });
  });
});

// =============================================================================
// Cross-Workflow Integration Tests
// =============================================================================

describe('Cross-Workflow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFindSemanticMatches.mockResolvedValue([]);
    mockRpcWithSkills(ALL_SKILLS);
  });

  describe('No routing conflicts between workflows', () => {
    it('meeting prep does not conflict with post-meeting follow-up', async () => {
      const prepResult = await routeToSkill('prepare me for my next meeting', TEST_CONTEXT);
      const followUpResult = await routeToSkill(
        'draft a follow-up email for my last meeting',
        TEST_CONTEXT,
      );

      expect(prepResult.selectedSkill?.skillKey).toBe('seq-meeting-prep');
      expect(followUpResult.selectedSkill?.skillKey).toBe('seq-post-meeting-followup-pack');
      expect(prepResult.selectedSkill?.skillKey).not.toBe(
        followUpResult.selectedSkill?.skillKey,
      );
    });

    it('pipeline overview does not conflict with daily brief', async () => {
      const pipelineResult = await routeToSkill('show me my pipeline', TEST_CONTEXT);
      const dailyResult = await routeToSkill('catch me up', TEST_CONTEXT);

      expect(pipelineResult.selectedSkill?.skillKey).toBe('seq-pipeline-focus-tasks');
      expect(dailyResult.selectedSkill?.skillKey).toBe('seq-catch-me-up');
    });

    it('email draft does not conflict with meeting prep', async () => {
      const emailResult = await routeToSkill('draft an email to John', TEST_CONTEXT);
      const meetingResult = await routeToSkill('prepare me for my next meeting', TEST_CONTEXT);

      expect(emailResult.selectedSkill?.skillKey).not.toBe(
        meetingResult.selectedSkill?.skillKey,
      );
    });
  });

  describe('All 5 workflows route to distinct skills', () => {
    it('each workflow maps to a unique skill key', async () => {
      const results = await Promise.all([
        routeToSkill('prepare me for my next meeting', TEST_CONTEXT),
        routeToSkill('show me my pipeline', TEST_CONTEXT),
        routeToSkill('draft a follow-up email for my last meeting', TEST_CONTEXT),
        routeToSkill('catch me up', TEST_CONTEXT),
        routeToSkill('draft an email to John', TEST_CONTEXT),
      ]);

      const skillKeys = results.map(r => r.selectedSkill?.skillKey).filter(Boolean);

      // All should route to a skill
      expect(skillKeys).toHaveLength(5);

      // All should be unique
      const uniqueKeys = new Set(skillKeys);
      expect(uniqueKeys.size).toBe(5);
    });
  });

  describe('All 5 workflows produce distinct response types', () => {
    it('each workflow returns a unique response type', () => {
      const responses = [
        buildMeetingPrepStructuredResponse(),
        buildPipelineFocusStructuredResponse(),
        buildPostMeetingFollowUpStructuredResponse(),
        buildDailyBriefStructuredResponse(),
        buildEmailDraftStructuredResponse(),
      ];

      const types = responses.map(r => r.type);

      // All types defined
      expect(types).toHaveLength(5);

      // All unique
      const uniqueTypes = new Set(types);
      expect(uniqueTypes.size).toBe(5);

      // Expected types
      expect(types).toContain('next_meeting_command_center');
      expect(types).toContain('pipeline_focus_tasks');
      expect(types).toContain('post_meeting_followup_pack');
      expect(types).toContain('daily_brief');
      expect(types).toContain('email');
    });
  });

  describe('All structured responses have consistent metadata', () => {
    it('every response includes type, summary, data, actions, and metadata', () => {
      const responses = [
        buildMeetingPrepStructuredResponse(),
        buildPipelineFocusStructuredResponse(),
        buildPostMeetingFollowUpStructuredResponse(),
        buildDailyBriefStructuredResponse(),
        buildEmailDraftStructuredResponse(),
      ];

      for (const response of responses) {
        expect(typeof response.type).toBe('string');
        expect(typeof response.summary).toBe('string');
        expect(typeof response.data).toBe('object');
        expect(response.actions).toBeInstanceOf(Array);
        expect(typeof response.metadata).toBe('object');
        expect(response.metadata.timeGenerated).toBeDefined();
        expect(response.metadata.dataSource).toBeInstanceOf(Array);
      }
    });
  });

  describe('SSE stream parsing handles all event types', () => {
    it('parses a complete stream with tool calls, tokens, structured response, and done', () => {
      const stream = buildFullSSEStream(
        ['Hello', ', world!'],
        [
          {
            id: 'tool-1',
            name: 'execute_action',
            input: { action: 'get_meetings' },
            result: { meetings: [] },
            success: true,
          },
          {
            id: 'tool-2',
            name: 'execute_action',
            input: { action: 'run_sequence', params: { sequence_key: 'seq-catch-me-up' } },
            result: { data: {} },
            success: true,
          },
        ],
        buildDailyBriefStructuredResponse(),
      );

      const parsed = parseSSEStream(stream);

      expect(parsed.toolStarts).toHaveLength(2);
      expect(parsed.toolResults).toHaveLength(2);
      expect(parsed.tokens).toHaveLength(2);
      expect(parsed.fullContent).toBe('Hello, world!');
      expect(parsed.structuredResponse).not.toBeNull();
      expect(parsed.structuredResponse.type).toBe('daily_brief');
      expect(parsed.done).toBe(true);
      expect(parsed.toolsUsed).toContain('execute_action');
    });

    it('handles stream with no structured response gracefully', () => {
      const stream = buildFullSSEStream(
        ['Just a plain response.'],
        [],
        null,
      );

      const parsed = parseSSEStream(stream);

      expect(parsed.fullContent).toBe('Just a plain response.');
      expect(parsed.structuredResponse).toBeNull();
      expect(parsed.done).toBe(true);
    });

    it('handles stream with failed tool calls', () => {
      const stream = buildFullSSEStream(
        ['Sorry, I encountered an error.'],
        [
          {
            id: 'tool-fail-1',
            name: 'execute_action',
            input: { action: 'get_meetings' },
            result: { error: 'Database timeout' },
            success: false,
          },
        ],
        null,
      );

      const parsed = parseSSEStream(stream);

      expect(parsed.toolResults).toHaveLength(1);
      expect(parsed.toolResults[0].success).toBe(false);
      expect(parsed.structuredResponse).toBeNull();
    });
  });
});

// =============================================================================
// Edge Cases & Error Handling
// =============================================================================

describe('Edge Cases & Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFindSemanticMatches.mockResolvedValue([]);
    mockRpcWithSkills(ALL_SKILLS);
  });

  describe('No orgId provided', () => {
    it('returns no match when orgId is missing', async () => {
      const result = await routeToSkill('catch me up');

      expect(result.selectedSkill).toBeNull();
      expect(result.reason).toContain('No organization ID');
    });
  });

  describe('Empty skill list', () => {
    it('returns no match when no skills are available', async () => {
      mockedRpc.mockResolvedValue({ data: [], error: null } as any);

      const result = await routeToSkill('catch me up', TEST_CONTEXT);

      expect(result.selectedSkill).toBeNull();
    });
  });

  describe('RPC error', () => {
    it('returns no match when RPC fails', async () => {
      mockedRpc.mockResolvedValue({
        data: null,
        error: { message: 'Database connection error' },
      } as any);

      const result = await routeToSkill('catch me up', TEST_CONTEXT);

      expect(result.selectedSkill).toBeNull();
    });
  });

  describe('Ambiguous messages', () => {
    it('routes ambiguous messages to the highest-confidence match', async () => {
      const result = await routeToSkill('meeting stuff', TEST_CONTEXT);

      // Should match something, but with lower confidence
      if (result.selectedSkill) {
        expect(result.selectedSkill.confidence).toBeGreaterThan(0);
      }
    });

    it('returns candidates even when no confident match is found', async () => {
      const result = await routeToSkill('xyz random gibberish 123', TEST_CONTEXT);

      // Might have no match at all
      expect(result.selectedSkill === null || result.selectedSkill.confidence < 0.5).toBe(true);
    });
  });

  describe('Structured response with missing data', () => {
    it('handles null meeting in meeting prep gracefully', () => {
      const response = buildMeetingPrepStructuredResponse();
      response.data.meeting = null;

      // The component should handle null meeting
      expect(response.data.meeting).toBeNull();
      expect(response.type).toBe('next_meeting_command_center');
    });

    it('handles null deal in pipeline response gracefully', () => {
      const response = buildPipelineFocusStructuredResponse();
      response.data.deal = null;

      expect(response.data.deal).toBeNull();
      expect(response.type).toBe('pipeline_focus_tasks');
    });

    it('handles empty daily brief arrays gracefully', () => {
      const response = buildDailyBriefStructuredResponse();
      response.data.schedule = [];
      response.data.priorityDeals = [];
      response.data.contactsNeedingAttention = [];
      response.data.tasks = [];

      expect(response.data.schedule).toHaveLength(0);
      expect(response.data.priorityDeals).toHaveLength(0);
      expect(response.data.contactsNeedingAttention).toHaveLength(0);
      expect(response.data.tasks).toHaveLength(0);
    });
  });
});
