/**
 * useBuyerSignals — Buyer Signal Scoring for Follow-Up Drafts
 *
 * Queries lightweight buyer context (recent activities, deal stage/velocity,
 * meeting sentiment) and computes a send confidence score (0-100).
 *
 * Returns: { score, level, warnings, suggestions, isLoading }
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import type { FollowUpDraft } from './useFollowUpDrafts';

// ============================================================================
// Types
// ============================================================================

export type SignalLevel = 'high' | 'medium' | 'low';

export interface BuyerSignalResult {
  score: number;
  level: SignalLevel;
  warnings: string[];
  suggestions: string[];
}

interface ContactContext {
  contactId: string | null;
  dealId: string | null;
  dealStage: string | null;
  dealStageChangedAt: string | null;
  dealValue: number | null;
}

interface ActivityStats {
  totalCount: number;
  emailsSent: number;
  emailsOpened: number;
  emailsClicked: number;
  emailsReplied: number;
  daysSinceLastActivity: number | null;
}

interface MeetingSentiment {
  score: number | null;
  label: string | null;
}

// ============================================================================
// Score calculation helpers
// ============================================================================

function classifyLevel(score: number): SignalLevel {
  if (score >= 80) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function buildWarnings(
  activityStats: ActivityStats,
  contactCtx: ContactContext,
  sentiment: MeetingSentiment
): string[] {
  const warnings: string[] = [];

  // Email engagement warnings
  if (activityStats.emailsSent >= 2 && activityStats.emailsOpened === 0) {
    warnings.push(`Last ${activityStats.emailsSent} emails unopened`);
  }

  // Recency warnings
  if (activityStats.daysSinceLastActivity !== null) {
    if (activityStats.daysSinceLastActivity >= 14) {
      warnings.push(`No contact in ${activityStats.daysSinceLastActivity} days`);
    } else if (activityStats.daysSinceLastActivity >= 7) {
      warnings.push(`${activityStats.daysSinceLastActivity} days since last activity`);
    }
  }

  // Deal stage warnings
  if (contactCtx.dealStage && contactCtx.dealStageChangedAt) {
    const daysInStage = Math.floor(
      (Date.now() - new Date(contactCtx.dealStageChangedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysInStage > 21) {
      warnings.push(`Deal stalled at ${contactCtx.dealStage}`);
    }
  }

  // Sentiment warnings
  if (sentiment.score !== null && sentiment.score < -0.25) {
    warnings.push('Negative meeting sentiment detected');
  }

  // No engagement at all
  if (activityStats.totalCount === 0) {
    warnings.push('No recent engagement history');
  }

  return warnings;
}

function buildSuggestions(
  activityStats: ActivityStats,
  contactCtx: ContactContext,
  sentiment: MeetingSentiment
): string[] {
  const suggestions: string[] = [];

  // Low engagement
  if (activityStats.emailsSent >= 2 && activityStats.emailsOpened === 0) {
    suggestions.push('Consider calling instead');
  }

  // Stalled deal
  if (contactCtx.dealStage && contactCtx.dealStageChangedAt) {
    const daysInStage = Math.floor(
      (Date.now() - new Date(contactCtx.dealStageChangedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysInStage > 14) {
      suggestions.push('Add a value-add resource');
    }
  }

  // No recent touch
  if (activityStats.daysSinceLastActivity !== null && activityStats.daysSinceLastActivity >= 7) {
    suggestions.push('Reference their recent LinkedIn post');
  }

  // Positive engagement
  if (activityStats.emailsReplied > 0) {
    suggestions.push('Build on their recent reply');
  }

  // High engagement
  if (activityStats.emailsClicked > 0) {
    suggestions.push('They clicked your last link - follow up on that topic');
  }

  // Negative sentiment
  if (sentiment.score !== null && sentiment.score < -0.25) {
    suggestions.push('Address concerns raised in the last meeting');
  }

  return suggestions;
}

function calculateScore(
  activityStats: ActivityStats,
  contactCtx: ContactContext,
  sentiment: MeetingSentiment
): number {
  let score = 50; // Base score

  // Engagement component (max +30 / -20)
  if (activityStats.emailsReplied > 0) {
    score += 20;
  }
  if (activityStats.emailsOpened > 0) {
    score += 10;
  }
  if (activityStats.emailsClicked > 0) {
    score += 10;
  }
  if (activityStats.emailsSent >= 2 && activityStats.emailsOpened === 0) {
    score -= 20;
  }

  // Recency component (max +15 / -25)
  if (activityStats.daysSinceLastActivity !== null) {
    if (activityStats.daysSinceLastActivity <= 3) {
      score += 15;
    } else if (activityStats.daysSinceLastActivity <= 7) {
      score += 5;
    } else if (activityStats.daysSinceLastActivity >= 14) {
      score -= 25;
    } else if (activityStats.daysSinceLastActivity >= 7) {
      score -= 10;
    }
  }

  // Deal velocity component (max +10 / -15)
  if (contactCtx.dealStage && contactCtx.dealStageChangedAt) {
    const daysInStage = Math.floor(
      (Date.now() - new Date(contactCtx.dealStageChangedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysInStage <= 7) {
      score += 10; // Deal is moving
    } else if (daysInStage > 21) {
      score -= 15; // Stalled
    }
  }

  // Sentiment component (max +10 / -15)
  if (sentiment.score !== null) {
    if (sentiment.score >= 0.25) {
      score += 10;
    } else if (sentiment.score < -0.25) {
      score -= 15;
    }
  }

  return Math.max(0, Math.min(100, score));
}

// ============================================================================
// Data fetching
// ============================================================================

async function fetchBuyerSignals(draft: FollowUpDraft): Promise<BuyerSignalResult> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // --- 1. Find contact by email ---
  let contactCtx: ContactContext = {
    contactId: null,
    dealId: null,
    dealStage: null,
    dealStageChangedAt: null,
    dealValue: null,
  };

  const { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('email', draft.to_email)
    .eq('owner_id', draft.user_id)
    .maybeSingle();

  if (contact) {
    contactCtx.contactId = contact.id;

    // Get the most recent active deal linked to this contact
    const { data: dealContact } = await supabase
      .from('deal_contacts')
      .select('deal_id')
      .eq('contact_id', contact.id)
      .limit(1)
      .maybeSingle();

    if (dealContact) {
      const { data: deal } = await supabase
        .from('deals')
        .select('id, value, stage_changed_at, deal_stages!inner(name)')
        .eq('id', dealContact.deal_id)
        .eq('status', 'active')
        .maybeSingle();

      if (deal) {
        contactCtx.dealId = deal.id;
        contactCtx.dealValue = deal.value;
        contactCtx.dealStage = (deal as any).deal_stages?.name ?? null;
        contactCtx.dealStageChangedAt = deal.stage_changed_at;
      }
    }
  }

  // --- 2. Get communication events for this contact (lightweight) ---
  let activityStats: ActivityStats = {
    totalCount: 0,
    emailsSent: 0,
    emailsOpened: 0,
    emailsClicked: 0,
    emailsReplied: 0,
    daysSinceLastActivity: null,
  };

  if (contactCtx.contactId) {
    const { data: events } = await supabase
      .from('communication_events')
      .select('event_type, was_opened, was_clicked, was_replied, event_timestamp')
      .eq('contact_id', contactCtx.contactId)
      .gte('event_timestamp', thirtyDaysAgo)
      .order('event_timestamp', { ascending: false })
      .limit(20);

    if (events && events.length > 0) {
      activityStats.totalCount = events.length;
      activityStats.emailsSent = events.filter(
        (e) => e.event_type === 'email_sent'
      ).length;
      activityStats.emailsOpened = events.filter((e) => e.was_opened).length;
      activityStats.emailsClicked = events.filter((e) => e.was_clicked).length;
      activityStats.emailsReplied = events.filter((e) => e.was_replied).length;

      const mostRecent = new Date(events[0].event_timestamp);
      activityStats.daysSinceLastActivity = Math.floor(
        (Date.now() - mostRecent.getTime()) / (1000 * 60 * 60 * 24)
      );
    }
  }

  // --- 3. Meeting sentiment (if draft has a meeting_id) ---
  let sentiment: MeetingSentiment = { score: null, label: null };

  if (draft.meeting_id) {
    const { data: meeting } = await supabase
      .from('meetings')
      .select('sentiment_score')
      .eq('id', draft.meeting_id)
      .maybeSingle();

    if (meeting) {
      sentiment.score = meeting.sentiment_score;
    }
  }

  // --- 4. Calculate score ---
  const score = calculateScore(activityStats, contactCtx, sentiment);
  const level = classifyLevel(score);
  const warnings = buildWarnings(activityStats, contactCtx, sentiment);
  const suggestions = buildSuggestions(activityStats, contactCtx, sentiment);

  return { score, level, warnings, suggestions };
}

// ============================================================================
// Hook
// ============================================================================

export function useBuyerSignals(draft: FollowUpDraft | null) {
  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['buyer-signals', draft?.id],
    queryFn: () => fetchBuyerSignals(draft!),
    enabled: !!draft,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    signal: data ?? null,
    isLoading,
    error: error ? (error as Error).message : null,
  };
}
