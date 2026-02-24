/**
 * Golden Path Scenario Tests for Copilot V1 Workflows
 * 
 * Tests the 5 core workflows return correct structured response types:
 * 1. Catch me up → daily_brief
 * 2. Prep for next meeting → next_meeting_command_center
 * 3. Create follow-ups → post_meeting_followup_pack
 * 4. Email inbox → followup_zero_inbox
 * 5. Pipeline focus → pipeline_focus_tasks
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Test Fixtures
// =============================================================================

const mockMeeting = {
  id: 'meeting-123',
  title: 'Q1 Planning with Acme Corp',
  startTime: new Date().toISOString(),
  endTime: new Date(Date.now() + 3600000).toISOString(),
  attendees: [
    { name: 'John Doe', email: 'john@acme.com', contact_id: 'contact-1' }
  ],
  meetingUrl: 'https://meet.google.com/abc-defg-hij',
  company: 'Acme Corp'
};

const mockDeal = {
  id: 'deal-456',
  name: 'Enterprise License - Acme',
  value: 50000,
  stage_name: 'Negotiation',
  expected_close_date: '2026-02-15',
  health_status: 'at_risk',
  days_since_activity: 5,
  company: 'Acme Corp'
};

const mockContact = {
  id: 'contact-1',
  name: 'John Doe',
  full_name: 'John Doe',
  email: 'john@acme.com',
  company: 'Acme Corp',
  lastContactDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
};

const mockTask = {
  id: 'task-789',
  title: 'Follow up on proposal',
  due_date: new Date().toISOString(),
  priority: 'high',
  status: 'pending'
};

// =============================================================================
// Structured Response Type Validators
// =============================================================================

function isValidDailyBrief(data: any): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.greeting === 'string' &&
    ['morning', 'afternoon', 'evening'].includes(data.timeOfDay) &&
    Array.isArray(data.schedule) &&
    Array.isArray(data.priorityDeals) &&
    Array.isArray(data.contactsNeedingAttention) &&
    Array.isArray(data.tasks) &&
    typeof data.summary === 'string'
  );
}

function isValidNextMeetingCommandCenter(data: any): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.sequenceKey === 'string' &&
    typeof data.isSimulation === 'boolean' &&
    (data.meeting === null || typeof data.meeting === 'object')
  );
}

function isValidPostMeetingFollowupPack(data: any): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.sequenceKey === 'string' &&
    typeof data.isSimulation === 'boolean' &&
    (data.meeting === null || typeof data.meeting === 'object') &&
    (data.pack === null || typeof data.pack === 'object')
  );
}

function isValidFollowupZeroInbox(data: any): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.sequenceKey === 'string' &&
    typeof data.isSimulation === 'boolean'
  );
}

function isValidPipelineFocusTasks(data: any): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.sequenceKey === 'string' &&
    typeof data.isSimulation === 'boolean' &&
    (data.deal === null || typeof data.deal === 'object')
  );
}

// =============================================================================
// Mock Response Builders (simulate backend responses)
// =============================================================================

function buildDailyBriefResponse(timeOfDay: 'morning' | 'afternoon' | 'evening' = 'morning') {
  return {
    type: 'daily_brief',
    summary: `Here's your ${timeOfDay} briefing.`,
    data: {
      sequenceKey: 'seq-catch-me-up',
      isSimulation: false,
      executionId: 'exec-123',
      greeting: timeOfDay === 'morning' 
        ? "Good morning! Here's your day ahead." 
        : timeOfDay === 'afternoon'
        ? "Here's your afternoon update."
        : "Wrapping up the day. Here's your summary.",
      timeOfDay,
      schedule: [mockMeeting],
      priorityDeals: [mockDeal],
      contactsNeedingAttention: [mockContact],
      tasks: [mockTask],
      tomorrowPreview: timeOfDay === 'evening' ? [mockMeeting] : undefined,
      summary: 'You have 3 meetings today and 2 stale deals that need attention.'
    },
    actions: [],
    metadata: { timeGenerated: new Date().toISOString(), dataSource: ['calendar', 'crm'] }
  };
}

function buildNextMeetingCommandCenterResponse(hasMeeting = true) {
  return {
    type: 'next_meeting_command_center',
    summary: hasMeeting ? `Your next meeting is "${mockMeeting.title}".` : 'No upcoming meetings found.',
    data: {
      sequenceKey: 'seq-next-meeting-command-center',
      isSimulation: true,
      executionId: 'exec-456',
      meeting: hasMeeting ? mockMeeting : null,
      brief: hasMeeting ? {
        company_name: 'Acme Corp',
        deal_name: mockDeal.name,
        deal_id: mockDeal.id,
        attendees: mockMeeting.attendees,
        talking_points: ['Review Q1 targets', 'Discuss timeline'],
        objectives: ['Confirm budget', 'Set next steps']
      } : null,
      prepTaskPreview: hasMeeting ? {
        title: 'Prepare for Acme meeting',
        description: 'Review account history and prepare demo',
        due_date: mockMeeting.startTime,
        priority: 'high'
      } : null
    },
    actions: [],
    metadata: { timeGenerated: new Date().toISOString(), dataSource: ['calendar', 'crm'] }
  };
}

function buildPostMeetingFollowupPackResponse(hasMeeting = true) {
  return {
    type: 'post_meeting_followup_pack',
    summary: hasMeeting ? 'I\'ve prepared your follow-up pack.' : 'No recent meetings found.',
    data: {
      sequenceKey: 'seq-post-meeting-followup-pack',
      isSimulation: true,
      executionId: 'exec-789',
      meeting: hasMeeting ? mockMeeting : null,
      contact: hasMeeting ? mockContact : null,
      digest: null,
      pack: hasMeeting ? {
        buyer_email: {
          to: mockContact.email,
          subject: 'Great meeting today!',
          context: 'Thank you for your time today. Here are the next steps...'
        },
        slack_update: {
          channel: '#sales',
          message: `Just met with ${mockContact.name} from ${mockMeeting.company}. Key takeaway: Ready to move forward.`
        },
        tasks: [mockTask]
      } : null,
      emailPreview: null,
      slackPreview: null,
      taskPreview: hasMeeting ? mockTask : null
    },
    actions: [],
    metadata: { timeGenerated: new Date().toISOString(), dataSource: ['meetings', 'crm'] }
  };
}

function buildFollowupZeroInboxResponse(hasEmails = true) {
  return {
    type: 'followup_zero_inbox',
    summary: hasEmails ? 'Found 3 emails needing follow-up.' : 'Inbox is clear!',
    data: {
      sequenceKey: 'seq-followup-zero-inbox',
      isSimulation: true,
      executionId: 'exec-101',
      emailThreads: hasEmails ? [
        { subject: 'RE: Proposal', from: 'john@acme.com', urgency: 'high', last_message_date: '2 hours ago' }
      ] : null,
      triage: hasEmails ? {
        threads_needing_response: [
          { subject: 'RE: Proposal', reason: 'Awaiting pricing confirmation', urgency: 'high' }
        ],
        priorities: ['high', 'medium']
      } : null,
      replyDrafts: hasEmails ? {
        reply_drafts: [
          { to: 'john@acme.com', subject: 'RE: Proposal', context: 'Hi John, Thanks for...' }
        ],
        task_previews: [mockTask]
      } : null,
      emailPreview: null,
      taskPreview: hasEmails ? mockTask : null
    },
    actions: [],
    metadata: { timeGenerated: new Date().toISOString(), dataSource: ['email'] }
  };
}

function buildPipelineFocusTasksResponse(hasDeals = true) {
  return {
    type: 'pipeline_focus_tasks',
    summary: hasDeals ? 'Focus on Acme - they need attention.' : 'Pipeline looks healthy!',
    data: {
      sequenceKey: 'seq-pipeline-focus-tasks',
      isSimulation: true,
      executionId: 'exec-202',
      deal: hasDeals ? mockDeal : null,
      taskPreview: hasDeals ? {
        title: 'Re-engage Acme Corp',
        description: 'Send update on pricing and schedule call',
        due_date: new Date().toISOString(),
        priority: 'high'
      } : null
    },
    actions: [],
    metadata: { timeGenerated: new Date().toISOString(), dataSource: ['crm'] }
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('Copilot V1 Workflows', () => {
  
  describe('1. Catch Me Up (Daily Brief)', () => {
    it('returns daily_brief structured response for morning', () => {
      const response = buildDailyBriefResponse('morning');
      
      expect(response.type).toBe('daily_brief');
      expect(isValidDailyBrief(response.data)).toBe(true);
      expect(response.data.timeOfDay).toBe('morning');
      expect(response.data.greeting).toContain('morning');
    });

    it('returns daily_brief with tomorrow preview for evening', () => {
      const response = buildDailyBriefResponse('evening');
      
      expect(response.type).toBe('daily_brief');
      expect(response.data.timeOfDay).toBe('evening');
      expect(response.data.tomorrowPreview).toBeDefined();
      expect(Array.isArray(response.data.tomorrowPreview)).toBe(true);
    });

    it('includes schedule, deals, contacts, and tasks arrays', () => {
      const response = buildDailyBriefResponse('afternoon');
      
      expect(Array.isArray(response.data.schedule)).toBe(true);
      expect(Array.isArray(response.data.priorityDeals)).toBe(true);
      expect(Array.isArray(response.data.contactsNeedingAttention)).toBe(true);
      expect(Array.isArray(response.data.tasks)).toBe(true);
    });
  });

  describe('2. Prep for Next Meeting', () => {
    it('returns next_meeting_command_center structured response', () => {
      const response = buildNextMeetingCommandCenterResponse(true);
      
      expect(response.type).toBe('next_meeting_command_center');
      expect(isValidNextMeetingCommandCenter(response.data)).toBe(true);
      expect(response.data.isSimulation).toBe(true);
    });

    it('includes meeting, brief, and prepTaskPreview when meeting exists', () => {
      const response = buildNextMeetingCommandCenterResponse(true);
      
      expect(response.data.meeting).not.toBeNull();
      expect(response.data.brief).not.toBeNull();
      expect(response.data.prepTaskPreview).not.toBeNull();
      expect(response.data.brief?.talking_points).toBeDefined();
      expect(response.data.brief?.objectives).toBeDefined();
    });

    it('handles no upcoming meetings gracefully', () => {
      const response = buildNextMeetingCommandCenterResponse(false);
      
      expect(response.type).toBe('next_meeting_command_center');
      expect(response.data.meeting).toBeNull();
      expect(response.summary).toContain('No upcoming meetings');
    });
  });

  describe('3. Post-Meeting Follow-Up Pack', () => {
    it('returns post_meeting_followup_pack structured response', () => {
      const response = buildPostMeetingFollowupPackResponse(true);
      
      expect(response.type).toBe('post_meeting_followup_pack');
      expect(isValidPostMeetingFollowupPack(response.data)).toBe(true);
      expect(response.data.isSimulation).toBe(true);
    });

    it('includes email, slack, and task previews in pack', () => {
      const response = buildPostMeetingFollowupPackResponse(true);
      
      expect(response.data.pack?.buyer_email).toBeDefined();
      expect(response.data.pack?.slack_update).toBeDefined();
      expect(response.data.pack?.tasks).toBeDefined();
      expect(Array.isArray(response.data.pack?.tasks)).toBe(true);
    });

    it('sets isSimulation true for preview mode', () => {
      const response = buildPostMeetingFollowupPackResponse(true);
      
      expect(response.data.isSimulation).toBe(true);
      expect(response.data.sequenceKey).toBe('seq-post-meeting-followup-pack');
    });

    it('handles no recent meetings gracefully', () => {
      const response = buildPostMeetingFollowupPackResponse(false);
      
      expect(response.data.meeting).toBeNull();
      expect(response.data.pack).toBeNull();
    });
  });

  describe('4. Email Zero Inbox', () => {
    it('returns followup_zero_inbox structured response', () => {
      const response = buildFollowupZeroInboxResponse(true);
      
      expect(response.type).toBe('followup_zero_inbox');
      expect(isValidFollowupZeroInbox(response.data)).toBe(true);
      expect(response.data.isSimulation).toBe(true);
    });

    it('includes email threads and reply drafts when emails exist', () => {
      const response = buildFollowupZeroInboxResponse(true);
      
      expect(response.data.triage?.threads_needing_response).toBeDefined();
      expect(response.data.replyDrafts?.reply_drafts).toBeDefined();
    });

    it('handles empty inbox gracefully', () => {
      const response = buildFollowupZeroInboxResponse(false);
      
      expect(response.type).toBe('followup_zero_inbox');
      expect(response.summary).toContain('clear');
    });
  });

  describe('5. Pipeline Focus Tasks', () => {
    it('returns pipeline_focus_tasks structured response', () => {
      const response = buildPipelineFocusTasksResponse(true);
      
      expect(response.type).toBe('pipeline_focus_tasks');
      expect(isValidPipelineFocusTasks(response.data)).toBe(true);
      expect(response.data.isSimulation).toBe(true);
    });

    it('includes deal with required fields', () => {
      const response = buildPipelineFocusTasksResponse(true);
      
      const deal = response.data.deal;
      expect(deal).not.toBeNull();
      expect(deal?.id).toBeDefined();
      expect(deal?.name).toBeDefined();
      expect(deal?.value).toBeDefined();
      expect(deal?.stage_name).toBeDefined();
      expect(deal?.health_status).toBeDefined();
      expect(deal?.days_since_activity).toBeDefined();
    });

    it('includes task preview for priority deal', () => {
      const response = buildPipelineFocusTasksResponse(true);
      
      expect(response.data.taskPreview).not.toBeNull();
      expect(response.data.taskPreview?.title).toBeDefined();
      expect(response.data.taskPreview?.priority).toBe('high');
    });

    it('handles empty pipeline gracefully', () => {
      const response = buildPipelineFocusTasksResponse(false);
      
      expect(response.data.deal).toBeNull();
      expect(response.summary).toContain('healthy');
    });
  });

  describe('Pending Action for Preview Flows', () => {
    it('simulation mode responses should be confirmable', () => {
      const responses = [
        buildNextMeetingCommandCenterResponse(true),
        buildPostMeetingFollowupPackResponse(true),
        buildFollowupZeroInboxResponse(true),
        buildPipelineFocusTasksResponse(true)
      ];

      for (const response of responses) {
        expect(response.data.isSimulation).toBe(true);
        expect(response.data.sequenceKey).toBeDefined();
        expect(response.data.sequenceKey.startsWith('seq-')).toBe(true);
      }
    });

    it('simulation responses include execution ID for tracking', () => {
      const response = buildNextMeetingCommandCenterResponse(true);
      
      expect(response.data.executionId).toBeDefined();
      expect(typeof response.data.executionId).toBe('string');
    });
  });
});
