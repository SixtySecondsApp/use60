/**
 * useTestMeetings Hook
 *
 * Fetches meetings categorized by quality tier for skill testing.
 * Quality is based on transcript availability and AI summary.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';
import type { QualityScore, QualityTier } from '@/lib/utils/entityTestTypes';

export interface TestMeeting {
  id: string;
  title: string | null;
  meeting_start: string | null;
  duration_minutes: number | null;
  summary: string | null;
  transcript_text: string | null;
  transcript_excerpt: string | null; // First 500 chars for preview
  company_id: string | null;
  company_name: string | null;
  primary_contact_id: string | null;
  contact_name: string | null;
  owner_user_id: string | null;
  qualityScore: QualityScore;
}

interface UseTestMeetingsOptions {
  mode: QualityTier;
  enabled?: boolean;
  limit?: number;
}

interface UseTestMeetingsReturn {
  meetings: TestMeeting[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Calculate meeting quality score based on transcript and data completeness
 */
function calculateMeetingQualityScore(meeting: {
  transcript_text: string | null;
  summary: string | null;
  title: string | null;
  company_id: string | null;
  primary_contact_id: string | null;
  duration_minutes: number | null;
}): QualityScore {
  const breakdown: Record<string, number> = {};
  const reasons: string[] = [];
  let score = 0;

  // Transcript (40 points max)
  if (meeting.transcript_text) {
    const transcriptLength = meeting.transcript_text.length;
    if (transcriptLength > 5000) {
      breakdown.transcript = 40;
      reasons.push('Full transcript available');
    } else if (transcriptLength > 1000) {
      breakdown.transcript = 25;
      reasons.push('Partial transcript available');
    } else {
      breakdown.transcript = 10;
      reasons.push('Minimal transcript');
    }
  } else {
    breakdown.transcript = 0;
    reasons.push('No transcript');
  }
  score += breakdown.transcript;

  // AI Summary (25 points max)
  if (meeting.summary && meeting.summary.length > 100) {
    breakdown.summary = 25;
    reasons.push('AI summary available');
  } else if (meeting.summary) {
    breakdown.summary = 10;
    reasons.push('Brief summary');
  } else {
    breakdown.summary = 0;
    reasons.push('No AI summary');
  }
  score += breakdown.summary;

  // Title (10 points)
  if (meeting.title && meeting.title.length > 5) {
    breakdown.title = 10;
  } else {
    breakdown.title = 0;
    reasons.push('Missing title');
  }
  score += breakdown.title;

  // Company link (10 points)
  if (meeting.company_id) {
    breakdown.company = 10;
  } else {
    breakdown.company = 0;
    reasons.push('No company linked');
  }
  score += breakdown.company;

  // Contact link (10 points)
  if (meeting.primary_contact_id) {
    breakdown.contact = 10;
  } else {
    breakdown.contact = 0;
    reasons.push('No contact linked');
  }
  score += breakdown.contact;

  // Duration (5 points)
  if (meeting.duration_minutes && meeting.duration_minutes > 5) {
    breakdown.duration = 5;
  } else {
    breakdown.duration = 0;
  }
  score += breakdown.duration;

  // Determine tier
  let tier: QualityTier;
  if (score >= 70) {
    tier = 'good';
  } else if (score >= 40) {
    tier = 'average';
  } else {
    tier = 'bad';
  }

  return { tier, score, breakdown, reasons };
}

/**
 * Fetch meetings by quality tier
 */
async function fetchMeetingsByTier(
  userId: string,
  userEmail: string | undefined,
  orgId: string | null,
  tier: QualityTier,
  limit: number
): Promise<TestMeeting[]> {
  let query = supabase
    .from('meetings')
    .select(`
      id,
      title,
      meeting_start,
      duration_minutes,
      summary,
      transcript_text,
      company_id,
      primary_contact_id,
      owner_user_id,
      companies!fk_meetings_company_id(id, name),
      contacts:primary_contact_id(id, first_name, last_name, full_name)
    `) as any; // Use any to avoid deep type instantiation issues

  // Filter by org_id if available
  if (orgId) {
    query = query.eq('org_id', orgId);
  }

  // Filter by owner - check both owner_user_id and owner_email
  if (userEmail) {
    query = query.or(`owner_user_id.eq.${userId},owner_email.eq.${userEmail}`);
  } else {
    query = query.eq('owner_user_id', userId);
  }

  // Apply tier-specific filters
  switch (tier) {
    case 'good':
      // Has transcript AND summary
      query = query
        .not('transcript_text', 'is', null)
        .not('summary', 'is', null)
        .order('meeting_start', { ascending: false });
      break;

    case 'average':
      // Has transcript OR summary but not both
      query = query
        .or('transcript_text.not.is.null,summary.not.is.null')
        .order('meeting_start', { ascending: false });
      break;

    case 'bad':
      // No transcript
      query = query
        .is('transcript_text', null)
        .order('meeting_start', { ascending: false });
      break;
  }

  query = query.limit(limit);

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching test meetings:', error);
    throw error;
  }

  if (!data) return [];

  // Transform and score meetings
  return data.map((meeting) => {
    const qualityScore = calculateMeetingQualityScore({
      transcript_text: meeting.transcript_text,
      summary: meeting.summary,
      title: meeting.title,
      company_id: meeting.company_id,
      primary_contact_id: meeting.primary_contact_id,
      duration_minutes: meeting.duration_minutes,
    });

    // Create transcript excerpt for preview
    const transcriptExcerpt = meeting.transcript_text
      ? meeting.transcript_text.slice(0, 500) + (meeting.transcript_text.length > 500 ? '...' : '')
      : null;

    // Get contact name
    const contact = meeting.contacts as any;
    const contactName = contact
      ? contact.full_name || [contact.first_name, contact.last_name].filter(Boolean).join(' ')
      : null;

    return {
      id: meeting.id,
      title: meeting.title,
      meeting_start: meeting.meeting_start,
      duration_minutes: meeting.duration_minutes,
      summary: meeting.summary,
      transcript_text: meeting.transcript_text,
      transcript_excerpt: transcriptExcerpt,
      company_id: meeting.company_id,
      company_name: (meeting.companies as any)?.name || null,
      primary_contact_id: meeting.primary_contact_id,
      contact_name: contactName,
      owner_user_id: meeting.owner_user_id,
      qualityScore,
    };
  });
}

/**
 * Hook for fetching meetings by quality tier
 */
export function useTestMeetings(options: UseTestMeetingsOptions): UseTestMeetingsReturn {
  const { mode, enabled = true, limit = 10 } = options;
  const { user } = useAuth();
  const { activeOrgId } = useOrgStore();

  const query = useQuery({
    queryKey: ['test-meetings', mode, user?.id, user?.email, activeOrgId, limit],
    queryFn: () => fetchMeetingsByTier(user!.id, user?.email, activeOrgId, mode, limit),
    enabled: enabled && !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    meetings: query.data || [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}

/**
 * Search meetings for custom selection
 */
export async function searchTestMeetings(
  userId: string,
  userEmail: string | undefined,
  orgId: string | null,
  searchQuery: string,
  limit: number = 10
): Promise<TestMeeting[]> {
  if (!searchQuery.trim()) return [];

  let query = supabase
    .from('meetings')
    .select(`
      id,
      title,
      meeting_start,
      duration_minutes,
      summary,
      transcript_text,
      company_id,
      primary_contact_id,
      owner_user_id,
      companies!fk_meetings_company_id(id, name),
      contacts:primary_contact_id(id, first_name, last_name, full_name)
    `) as any;

  // Filter by org_id if available
  if (orgId) {
    query = query.eq('org_id', orgId);
  }

  // Filter by owner - check both owner_user_id and owner_email
  if (userEmail) {
    query = query.or(`owner_user_id.eq.${userId},owner_email.eq.${userEmail}`);
  } else {
    query = query.eq('owner_user_id', userId);
  }

  const { data, error } = await query
    .ilike('title', `%${searchQuery}%`)
    .order('meeting_start', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error searching meetings:', error);
    throw error;
  }

  if (!data) return [];

  return data.map((meeting) => {
    const qualityScore = calculateMeetingQualityScore({
      transcript_text: meeting.transcript_text,
      summary: meeting.summary,
      title: meeting.title,
      company_id: meeting.company_id,
      primary_contact_id: meeting.primary_contact_id,
      duration_minutes: meeting.duration_minutes,
    });

    const transcriptExcerpt = meeting.transcript_text
      ? meeting.transcript_text.slice(0, 500) + (meeting.transcript_text.length > 500 ? '...' : '')
      : null;

    const contact = meeting.contacts as any;
    const contactName = contact
      ? contact.full_name || [contact.first_name, contact.last_name].filter(Boolean).join(' ')
      : null;

    return {
      id: meeting.id,
      title: meeting.title,
      meeting_start: meeting.meeting_start,
      duration_minutes: meeting.duration_minutes,
      summary: meeting.summary,
      transcript_text: meeting.transcript_text,
      transcript_excerpt: transcriptExcerpt,
      company_id: meeting.company_id,
      company_name: (meeting.companies as any)?.name || null,
      primary_contact_id: meeting.primary_contact_id,
      contact_name: contactName,
      owner_user_id: meeting.owner_user_id,
      qualityScore,
    };
  });
}
