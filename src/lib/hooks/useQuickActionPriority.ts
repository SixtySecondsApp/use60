import { useMemo } from 'react';

export type QuickActionId = 'follow_up_email' | 'book_call' | 'share_recording';

export interface QuickActionPriorityResult {
  orderedActions: QuickActionId[];
  urgentAction: QuickActionId | null;
  urgencyReason: string | null;
}

interface Meeting {
  meeting_type?: string | null;
  sentiment_score?: number | null;
  source_type?: string | null;
  voice_recording_id?: string | null;
}

/**
 * Determines the priority order of quick actions based on meeting context.
 * Returns ordered actions with optional urgency indicator for the first action.
 */
export function useQuickActionPriority(meeting: Meeting | null): QuickActionPriorityResult {
  return useMemo(() => {
    if (!meeting) {
      return {
        orderedActions: ['follow_up_email', 'book_call', 'share_recording'],
        urgentAction: null,
        urgencyReason: null,
      };
    }

    const { meeting_type, sentiment_score, source_type } = meeting;

    // Default priority
    let priority: QuickActionId[] = ['follow_up_email', 'book_call', 'share_recording'];
    let urgentAction: QuickActionId | null = null;
    let urgencyReason: string | null = null;

    // Adjust based on meeting type
    switch (meeting_type) {
      case 'discovery':
      case 'demo':
        // After discovery/demo, booking next call is most important
        priority = ['book_call', 'follow_up_email', 'share_recording'];
        urgentAction = 'book_call';
        urgencyReason = 'Keep momentum after demo';
        break;
      case 'negotiation':
      case 'closing':
        priority = ['follow_up_email', 'book_call', 'share_recording'];
        urgentAction = 'follow_up_email';
        urgencyReason = 'Strike while hot';
        break;
      case 'follow_up':
        // Follow-up meetings benefit from email recap and sharing recordings
        priority = ['follow_up_email', 'share_recording', 'book_call'];
        break;
    }

    // Boost follow-up if negative sentiment (needs immediate attention)
    if (sentiment_score !== null && sentiment_score !== undefined && sentiment_score < 0.4) {
      priority = ['follow_up_email', ...priority.filter(a => a !== 'follow_up_email')];
      urgentAction = 'follow_up_email';
      urgencyReason = 'Address concerns quickly';
    }

    // High positive sentiment - strike while hot
    if (sentiment_score !== null && sentiment_score !== undefined && sentiment_score > 0.7 && !urgentAction) {
      urgentAction = priority[0];
      urgencyReason = 'Strike while hot';
    }

    return {
      orderedActions: priority,
      urgentAction,
      urgencyReason,
    };
  }, [meeting]);
}
