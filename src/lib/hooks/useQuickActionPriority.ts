import { useMemo } from 'react';

export type QuickActionId =
  | 'follow_up_email'
  | 'generate_proposal'
  | 'create_task'
  | 'create_deal'
  | 'share_recording'
  | 'book_call';

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

const DEFAULT_ORDER: QuickActionId[] = [
  'follow_up_email',
  'generate_proposal',
  'create_task',
  'create_deal',
  'share_recording',
  'book_call',
];

/**
 * Determines the priority order of quick actions based on meeting context.
 * Returns ordered actions with optional urgency indicator for the first action.
 */
export function useQuickActionPriority(meeting: Meeting | null): QuickActionPriorityResult {
  return useMemo(() => {
    if (!meeting) {
      return {
        orderedActions: DEFAULT_ORDER,
        urgentAction: null,
        urgencyReason: null,
      };
    }

    const { meeting_type, sentiment_score } = meeting;

    let priority: QuickActionId[] = [...DEFAULT_ORDER];
    let urgentAction: QuickActionId | null = null;
    let urgencyReason: string | null = null;

    // Adjust top actions based on meeting type
    switch (meeting_type) {
      case 'discovery':
      case 'demo':
        // After discovery/demo, book next call + proposal are key
        priority = ['book_call', 'generate_proposal', 'follow_up_email', 'create_task', 'create_deal', 'share_recording'];
        urgentAction = 'book_call';
        urgencyReason = 'Keep momentum';
        break;
      case 'negotiation':
      case 'closing':
        // Closing meetings: proposal + follow-up are critical
        priority = ['generate_proposal', 'follow_up_email', 'create_deal', 'create_task', 'book_call', 'share_recording'];
        urgentAction = 'generate_proposal';
        urgencyReason = 'Strike while hot';
        break;
      case 'follow_up':
        // Follow-up meetings: email recap + tasks from action items
        priority = ['follow_up_email', 'create_task', 'share_recording', 'generate_proposal', 'create_deal', 'book_call'];
        break;
    }

    // Boost follow-up if negative sentiment (needs immediate attention)
    if (sentiment_score !== null && sentiment_score !== undefined && sentiment_score < 0.4) {
      priority = ['follow_up_email', ...priority.filter(a => a !== 'follow_up_email')];
      urgentAction = 'follow_up_email';
      urgencyReason = 'Address concerns';
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
