/**
 * Copilot Test Fixtures
 *
 * Golden path fixtures for testing Copilot V1 workflows.
 * Use these fixtures to mock Supabase responses and sequence executions.
 *
 * Usage:
 * ```typescript
 * import { fixtures } from '@/tests/fixtures/copilot';
 *
 * // Mock a next meeting response
 * const meeting = fixtures.meetings.nextMeeting;
 *
 * // Mock a sequence execution result
 * const result = fixtures.sequences.nextMeetingCommandCenter.simulationResult;
 * ```
 */

import meetingsFixtures from './meetings.json';
import dealsFixtures from './deals.json';
import contactsFixtures from './contacts.json';
import sequencesFixtures from './sequences.json';

// Type definitions for fixtures
export interface MeetingFixture {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  external_id?: string;
  meeting_url?: string;
  attendees: Array<{
    email: string;
    name: string;
    is_organizer?: boolean;
  }>;
  attendees_count: number;
  source_type?: string;
  fathom_recording?: {
    id: string;
    summary: string;
    action_items: string[];
  };
}

export interface DealFixture {
  id: string;
  name: string;
  company: string;
  value: number;
  stage: string;
  stage_name?: string;
  probability: number;
  expected_close_date?: string;
  close_date?: string;
  contact_id?: string;
  contact_name?: string;
  contact_email?: string;
  days_in_stage?: number;
  last_activity_date?: string;
  next_step?: string;
  notes?: string;
  risk_factors?: string[];
}

export interface ContactFixture {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  company: string;
  position?: string;
  linkedin_url?: string;
  last_contacted?: string;
  relationship_score?: number;
  notes?: string;
  tags?: string[];
  needs_followup?: boolean;
}

export interface SequenceResultFixture {
  success: boolean;
  execution_id: string;
  sequence_key: string;
  status: 'completed' | 'failed' | 'running';
  is_simulation: boolean;
  step_results: Array<{
    step_index: number;
    step_type: 'skill' | 'action';
    skill_key?: string;
    action?: string;
    status: 'success' | 'failed';
    output?: Record<string, unknown>;
    error?: string;
    duration_ms: number;
    retry_count?: number;
    max_retries?: number;
    retry_attempts?: Array<{
      attempt: number;
      error: string;
      delay_ms: number;
    }>;
    timeout_ms?: number;
    timed_out?: boolean;
  }>;
  final_output?: Record<string, unknown>;
  error?: string | null;
}

// Export typed fixtures
export const fixtures = {
  meetings: meetingsFixtures as {
    description: string;
    version: string;
    nextMeeting: MeetingFixture;
    todayMeetings: MeetingFixture[];
    tomorrowMeetings: MeetingFixture[];
    pastMeeting: MeetingFixture;
    emptyState: {
      todayMeetings: [];
      tomorrowMeetings: [];
    };
  },
  deals: dealsFixtures as {
    description: string;
    version: string;
    activeDeal: DealFixture;
    atRiskDeal: DealFixture;
    wonDeal: DealFixture;
    pipelineDeals: DealFixture[];
    pipelineSummary: {
      total_value: number;
      weighted_value: number;
      deal_count: number;
      stages: Record<string, { count: number; value: number }>;
    };
    dealContextForMeeting: {
      deal_id: string;
      deal_name: string;
      value: number;
      stage: string;
      last_interaction: string;
      key_contacts: Array<{
        name: string;
        role: string;
        email: string;
      }>;
      open_tasks: string[];
    };
  },
  contacts: contactsFixtures as {
    description: string;
    version: string;
    primaryContact: ContactFixture;
    secondaryContact: ContactFixture;
    newContact: ContactFixture;
    coldContact: ContactFixture;
    contactsList: ContactFixture[];
    ambiguousNames: {
      description: string;
      query: string;
      matches: ContactFixture[];
    };
    contactNeedingAttention: ContactFixture & {
      days_since_contact: number;
      has_open_deal: boolean;
      deal_value: number;
      attention_reason: string;
    };
  },
  sequences: sequencesFixtures as {
    description: string;
    version: string;
    nextMeetingCommandCenter: {
      sequenceKey: string;
      description: string;
      simulationResult: SequenceResultFixture;
      executionResult: SequenceResultFixture;
    };
    pipelineFocusTasks: {
      sequenceKey: string;
      description: string;
      simulationResult: SequenceResultFixture;
    };
    catchMeUp: {
      sequenceKey: string;
      description: string;
      simulationResult: SequenceResultFixture;
    };
    failedSequence: {
      sequenceKey: string;
      description: string;
      simulationResult: SequenceResultFixture;
    };
    retryScenario: {
      description: string;
      sequenceKey: string;
      result: SequenceResultFixture;
    };
    timeoutScenario: {
      description: string;
      sequenceKey: string;
      result: SequenceResultFixture;
    };
  },
};

// Helper functions for common fixture operations
export function getMeetingById(id: string): MeetingFixture | undefined {
  const allMeetings = [
    fixtures.meetings.nextMeeting,
    ...fixtures.meetings.todayMeetings,
    ...fixtures.meetings.tomorrowMeetings,
    fixtures.meetings.pastMeeting,
  ];
  return allMeetings.find(m => m.id === id);
}

export function getDealById(id: string): DealFixture | undefined {
  const allDeals = [
    fixtures.deals.activeDeal,
    fixtures.deals.atRiskDeal,
    fixtures.deals.wonDeal,
    ...fixtures.deals.pipelineDeals,
  ];
  return allDeals.find(d => d.id === id);
}

export function getContactById(id: string): ContactFixture | undefined {
  const allContacts = [
    fixtures.contacts.primaryContact,
    fixtures.contacts.secondaryContact,
    fixtures.contacts.newContact,
    fixtures.contacts.coldContact,
    ...fixtures.contacts.contactsList,
    ...fixtures.contacts.ambiguousNames.matches,
  ];
  return allContacts.find(c => c.id === id);
}

/**
 * Create a mock Supabase client for testing
 * Returns fixture data for common copilot queries
 */
export function createMockSupabaseForCopilot() {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            // Return appropriate fixture based on table
            if (table === 'calendar_events') {
              return { data: fixtures.meetings.nextMeeting, error: null };
            }
            if (table === 'deals') {
              return { data: fixtures.deals.activeDeal, error: null };
            }
            if (table === 'contacts') {
              return { data: fixtures.contacts.primaryContact, error: null };
            }
            return { data: null, error: null };
          },
          single: async () => {
            if (table === 'calendar_events') {
              return { data: fixtures.meetings.nextMeeting, error: null };
            }
            return { data: null, error: null };
          },
        }),
        gte: () => ({
          order: () => ({
            limit: async () => {
              if (table === 'calendar_events') {
                return { data: fixtures.meetings.todayMeetings, error: null };
              }
              return { data: [], error: null };
            },
          }),
        }),
      }),
    }),
  };
}

export default fixtures;
