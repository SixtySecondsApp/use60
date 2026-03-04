/**
 * Stakeholder Mapping Types
 *
 * Types for PRD-121: Stakeholder Mapping & Buying Committee
 * - deal_stakeholders table rows
 * - Buying committee roles, influence levels, engagement status
 */

// ============================================================================
// Enums / Literal Types
// ============================================================================

export type StakeholderRole =
  | 'economic_buyer'
  | 'champion'
  | 'technical_evaluator'
  | 'end_user'
  | 'blocker'
  | 'coach'
  | 'influencer'
  | 'legal'
  | 'procurement'
  | 'unknown';

export type StakeholderInfluence = 'high' | 'medium' | 'low' | 'unknown';

export type StakeholderEngagementStatus = 'active' | 'warming' | 'cold' | 'unknown';

// ============================================================================
// Database Row
// ============================================================================

export interface DealStakeholder {
  id: string;
  deal_id: string;
  contact_id: string;
  org_id: string;

  role: StakeholderRole;
  influence: StakeholderInfluence;
  sentiment_score: number | null; // -1 to 1
  engagement_status: StakeholderEngagementStatus;

  days_since_last_contact: number | null;
  meeting_count: number;
  email_count: number;
  last_contacted_at: string | null;

  auto_detected: boolean;
  source_meeting_id: string | null;
  confidence_score: number | null; // 0 to 1
  needs_review: boolean;

  notes: string | null;

  created_at: string;
  updated_at: string;
}

// ============================================================================
// With joined contact data
// ============================================================================

export interface DealStakeholderWithContact extends DealStakeholder {
  contact: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    title: string | null;
    company: string | null;
    avatar_url: string | null;
  };
}

// ============================================================================
// Create / Update payloads
// ============================================================================

export interface CreateStakeholderPayload {
  deal_id: string;
  contact_id: string;
  org_id: string;
  role?: StakeholderRole;
  influence?: StakeholderInfluence;
  sentiment_score?: number | null;
  notes?: string | null;
  auto_detected?: boolean;
  source_meeting_id?: string | null;
  confidence_score?: number | null;
  needs_review?: boolean;
}

export interface UpdateStakeholderPayload {
  role?: StakeholderRole;
  influence?: StakeholderInfluence;
  sentiment_score?: number | null;
  engagement_status?: StakeholderEngagementStatus;
  notes?: string | null;
  needs_review?: boolean;
}

// ============================================================================
// Display config helpers
// ============================================================================

export const ROLE_LABELS: Record<StakeholderRole, string> = {
  economic_buyer: 'Economic Buyer',
  champion: 'Champion',
  technical_evaluator: 'Technical Evaluator',
  end_user: 'End User',
  blocker: 'Blocker',
  coach: 'Coach',
  influencer: 'Influencer',
  legal: 'Legal',
  procurement: 'Procurement',
  unknown: 'Unknown',
};

export const INFLUENCE_LABELS: Record<StakeholderInfluence, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  unknown: 'Unknown',
};

export const ENGAGEMENT_LABELS: Record<StakeholderEngagementStatus, string> = {
  active: 'Active',
  warming: 'Warming',
  cold: 'Cold',
  unknown: 'Unknown',
};

/** Tailwind classes for engagement status badges */
export const ENGAGEMENT_COLORS: Record<StakeholderEngagementStatus, string> = {
  active: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  warming: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  cold: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  unknown: 'bg-gray-500/15 text-gray-600 dark:text-gray-400',
};

/** Tailwind classes for influence level badges */
export const INFLUENCE_COLORS: Record<StakeholderInfluence, string> = {
  high: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
  medium: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  low: 'bg-gray-500/15 text-gray-600 dark:text-gray-400',
  unknown: 'bg-gray-400/15 text-gray-500 dark:text-gray-500',
};

/** Tailwind classes for role badges */
export const ROLE_COLORS: Record<StakeholderRole, string> = {
  economic_buyer: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  champion: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  technical_evaluator: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  end_user: 'bg-teal-500/15 text-teal-700 dark:text-teal-400',
  blocker: 'bg-red-500/15 text-red-700 dark:text-red-400',
  coach: 'bg-purple-500/15 text-purple-700 dark:text-purple-400',
  influencer: 'bg-pink-500/15 text-pink-700 dark:text-pink-400',
  legal: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  procurement: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400',
  unknown: 'bg-gray-500/15 text-gray-600 dark:text-gray-400',
};

// ============================================================================
// MEDDIC alignment
// ============================================================================

/** MEDDIC roles required for a healthy buying committee */
export const MEDDIC_REQUIRED_ROLES: StakeholderRole[] = ['economic_buyer', 'champion'];

/** Check if the buying committee covers MEDDIC basics */
export function getMeddicCoverage(stakeholders: DealStakeholder[]): {
  hasEconomicBuyer: boolean;
  hasChampion: boolean;
  coverageLevel: 'full' | 'partial' | 'missing';
} {
  const roles = new Set(stakeholders.map((s) => s.role));
  const hasEconomicBuyer = roles.has('economic_buyer');
  const hasChampion = roles.has('champion');

  let coverageLevel: 'full' | 'partial' | 'missing';
  if (hasEconomicBuyer && hasChampion) {
    coverageLevel = 'full';
  } else if (hasEconomicBuyer || hasChampion) {
    coverageLevel = 'partial';
  } else {
    coverageLevel = 'missing';
  }

  return { hasEconomicBuyer, hasChampion, coverageLevel };
}
