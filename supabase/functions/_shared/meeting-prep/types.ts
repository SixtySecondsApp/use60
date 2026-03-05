// Types for the upgraded meeting prep system

import type { RAGResult, RAGFilters, Commitment, Stakeholder } from '../memory/types.ts';

// Re-export for convenience
export type { RAGResult, RAGFilters, Commitment, Stakeholder };

export interface PrepRAGQuery {
  id: string;
  query: string;
  purpose: string;
  priority: 'required' | 'nice_to_have';
  maxTokens: number;
}

export interface HistoricalContext {
  hasHistory: boolean;
  meetingCount: number;
  sections: Record<string, RAGResult>;
  queryCredits: number;
  failedQueries: string[]; // IDs of queries that returned empty or errored
}

export interface MeetingHistory {
  isReturnMeeting: boolean;
  priorMeetingCount: number;
  priorMeetingIds: string[];
  firstMeetingDate: string | null;
  lastMeetingDate: string | null;
  attendeeHistory: AttendeeHistoryEntry[];
}

export interface AttendeeHistoryEntry {
  email: string;
  name: string;
  contactId: string | null;
  meetingsAttended: number;
  firstSeen: string | null;
  lastSeen: string | null;
  classification: 'new' | 'returning' | 'returning_after_absence';
}

export interface AttendeeComparison {
  returning: AttendeeHistoryEntry[];
  new: AttendeeHistoryEntry[];
  absent: AttendeeHistoryEntry[]; // Regular attendees not in today's meeting
}

export interface GenerationStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'complete' | 'failed' | 'skipped';
  duration_ms?: number;
  detail?: string;
}

export interface PrepBriefingResult {
  slackBlocks: any[];
  markdown: string;
  metadata: {
    meeting_number: number;
    prior_meetings_found: number;
    rag_queries_run: number;
    rag_queries_returned: number;
    attendees_enriched: number;
    credits_consumed: number;
    generation_time_ms: number;
    model_used: string;
    is_return_meeting: boolean;
  };
}

export interface StepTracker {
  start(id: string, label: string): void;
  complete(id: string, detail?: string): void;
  skip(id: string, detail?: string): void;
  fail(id: string, detail?: string): void;
  getSteps(): GenerationStep[];
}
