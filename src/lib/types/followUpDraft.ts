/**
 * Follow-Up Draft types — PRD-120
 */

export type DraftStatus =
  | 'pending'
  | 'editing'
  | 'approved'
  | 'scheduled'
  | 'sent'
  | 'rejected'
  | 'expired';

export interface FollowUpDraft {
  id: string;
  orgId: string;
  userId: string;
  meetingId: string | null;
  to: string;
  toName: string | null;
  subject: string;
  body: string;
  originalBody: string;
  status: DraftStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  rejectedAt: string | null;
  expiredAt: string | null;
  editedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Joined meeting data (optional)
  meeting?: DraftMeeting | null;
}

export interface DraftMeeting {
  id: string;
  title: string;
  startedAt: string | null;
  attendees: string[];
  outcomes: string | null;
  buyingSignals: string[] | null;
}

export interface DraftHistoryEntry {
  id: string;
  draftId: string;
  status: DraftStatus;
  note: string | null;
  actorId: string | null;
  createdAt: string;
}

export type DraftStatusFilter = 'all' | DraftStatus;
