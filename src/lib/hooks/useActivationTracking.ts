/**
 * useActivationTracking - Track user activation milestones
 * 
 * North Star Metric: "First Summary Viewed"
 * 
 * Activation funnel:
 * 1. Account Created
 * 2. Fathom Connected
 * 3. First Meeting Synced
 * 4. First Summary Viewed (NORTH STAR)
 * 5. Fully Activated
 */

import { useCallback } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { trackEvent, trackFirstSummaryViewed as trackEnchargeFirstSummary } from '@/lib/services/enchargeTrackingService';

export type ActivationEventType =
  | 'account_created'
  | 'email_verified'
  | 'fathom_connected'
  | 'first_meeting_synced'
  | 'first_summary_viewed' // NORTH STAR
  | 'first_action_item_viewed'
  | 'first_ai_question_asked'
  | 'first_proposal_generated'
  | 'subscription_started'
  | 'trial_started'
  | 'notetaker_connected'
  | 'instant_replay_completed'
  | 'credits_topped_up'
  | 'tour_completed';

interface UseActivationTrackingReturn {
  trackActivationEvent: (eventType: ActivationEventType, data?: Record<string, any>) => Promise<void>;
  trackFirstSummaryViewed: (meetingId: string) => Promise<void>;
  trackFathomConnected: () => Promise<void>;
  trackFirstMeetingSynced: (meetingCount: number) => Promise<void>;
  trackFirstProposalGenerated: (proposalId: string) => Promise<void>;
  trackFirstAIQuestion: (question: string) => Promise<void>;
  trackNotetakerConnected: () => Promise<void>;
  trackInstantReplayCompleted: (meetingId: string) => Promise<void>;
  trackCreditsToppedUp: (creditsAdded: number) => Promise<void>;
  trackTourCompleted: (tourId?: string) => Promise<void>;
}

export function useActivationTracking(): UseActivationTrackingReturn {
  const { user } = useAuth();

  const trackActivationEvent = useCallback(
    async (eventType: ActivationEventType, data?: Record<string, any>) => {
      if (!user) {
        console.warn('[useActivationTracking] No user, skipping event:', eventType);
        return;
      }

      try {
        // Record in database via RPC
        const { error } = await supabase.rpc('record_activation_event', {
          p_user_id: user.id,
          p_event_type: eventType,
          p_event_data: data || {},
        });

        if (error) {
          console.error('[useActivationTracking] Error recording event:', error);
          // Don't throw - we don't want to block user actions due to tracking failures
        } else {
          console.log('[useActivationTracking] Event recorded:', eventType);
        }

        // Also track in Encharge for email automation
        trackEvent(eventType, {
          userId: user.id,
          email: user.email,
          ...data,
        });
      } catch (err) {
        console.error('[useActivationTracking] Exception:', err);
        // Silent fail - tracking should never block the user
      }
    },
    [user]
  );

  // NORTH STAR: Track first summary viewed
  const trackFirstSummaryViewed = useCallback(
    async (meetingId: string) => {
      if (!user) return;

      await trackActivationEvent('first_summary_viewed', { meeting_id: meetingId });

      // Track in Encharge for email triggers
      trackEnchargeFirstSummary({
        email: user.email || '',
        userId: user.id,
        meetingId,
      });
    },
    [user, trackActivationEvent]
  );

  const trackFathomConnected = useCallback(async () => {
    await trackActivationEvent('fathom_connected');
  }, [trackActivationEvent]);

  const trackFirstMeetingSynced = useCallback(
    async (meetingCount: number) => {
      await trackActivationEvent('first_meeting_synced', { meeting_count: meetingCount });
    },
    [trackActivationEvent]
  );

  const trackFirstProposalGenerated = useCallback(
    async (proposalId: string) => {
      await trackActivationEvent('first_proposal_generated', { proposal_id: proposalId });
    },
    [trackActivationEvent]
  );

  const trackFirstAIQuestion = useCallback(
    async (question: string) => {
      await trackActivationEvent('first_ai_question_asked', { question });
    },
    [trackActivationEvent]
  );

  const trackNotetakerConnected = useCallback(async () => {
    await trackActivationEvent('notetaker_connected');
  }, [trackActivationEvent]);

  const trackInstantReplayCompleted = useCallback(
    async (meetingId: string) => {
      await trackActivationEvent('instant_replay_completed', { meeting_id: meetingId });
    },
    [trackActivationEvent]
  );

  const trackCreditsToppedUp = useCallback(
    async (creditsAdded: number) => {
      await trackActivationEvent('credits_topped_up', { credits_added: creditsAdded });
    },
    [trackActivationEvent]
  );

  const trackTourCompleted = useCallback(
    async (tourId?: string) => {
      await trackActivationEvent('tour_completed', tourId ? { tour_id: tourId } : undefined);
    },
    [trackActivationEvent]
  );

  return {
    trackActivationEvent,
    trackFirstSummaryViewed,
    trackFathomConnected,
    trackFirstMeetingSynced,
    trackFirstProposalGenerated,
    trackFirstAIQuestion,
    trackNotetakerConnected,
    trackInstantReplayCompleted,
    trackCreditsToppedUp,
    trackTourCompleted,
  };
}

export default useActivationTracking;















