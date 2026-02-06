/**
 * Shared types for multi-entity skill testing
 *
 * Supports testing skills with different entity contexts:
 * - Contact: CRM contacts with meeting history
 * - Deal: Pipeline deals with health scores
 * - Email: Categorized emails with sales signals
 * - Activity: Sales activities (meetings, proposals, outbound)
 */

/**
 * Entity types available for skill testing
 */
export type EntityType = 'contact' | 'deal' | 'email' | 'activity' | 'meeting';

/**
 * Quality tier for entity categorization
 */
export type QualityTier = 'good' | 'average' | 'bad';

/**
 * Test mode selection (includes none and custom search)
 */
export type EntityTestMode = 'none' | 'good' | 'average' | 'bad' | 'custom';

/**
 * Generic quality score structure
 */
export interface QualityScore {
  tier: QualityTier;
  score: number; // 0-100
  breakdown: Record<string, number>;
  reasons: string[];
}

/**
 * Configuration for entity type display
 */
export interface EntityTypeConfig {
  label: string;
  icon: string; // lucide-react icon name
  description: string;
  pluralLabel: string;
}

/**
 * Entity type display configurations
 */
export const ENTITY_TYPE_CONFIG: Record<EntityType, EntityTypeConfig> = {
  contact: {
    label: 'Contact',
    icon: 'User',
    description: 'Test with contact context',
    pluralLabel: 'Contacts',
  },
  deal: {
    label: 'Deal',
    icon: 'Briefcase',
    description: 'Test with deal context',
    pluralLabel: 'Deals',
  },
  email: {
    label: 'Email',
    icon: 'Mail',
    description: 'Test with email context',
    pluralLabel: 'Emails',
  },
  activity: {
    label: 'Activity',
    icon: 'Calendar',
    description: 'Test with activity context',
    pluralLabel: 'Activities',
  },
  meeting: {
    label: 'Meeting',
    icon: 'Video',
    description: 'Test with meeting transcript',
    pluralLabel: 'Meetings',
  },
};

/**
 * Mode descriptions vary by entity type
 */
export const MODE_DESCRIPTIONS: Record<EntityType, Record<EntityTestMode, string>> = {
  contact: {
    none: 'Test without contact context',
    good: 'Rich data: meetings, title, company',
    average: 'Moderate data: 1-3 meetings',
    bad: 'Minimal data: no meetings, sparse info',
    custom: 'Search and select any contact',
  },
  deal: {
    none: 'Test without deal context',
    good: 'Healthy deals with high scores (≥75)',
    average: 'Warning deals with moderate scores (50-74)',
    bad: 'Critical/stalled deals with low scores (<50)',
    custom: 'Search and select any deal',
  },
  email: {
    none: 'Test without email context',
    good: 'Actionable emails requiring response',
    average: 'FYI emails with some signals',
    bad: 'Low signal emails (marketing, automated)',
    custom: 'Search and select any email',
  },
  activity: {
    none: 'Test without activity context',
    good: 'Completed meetings with high value',
    average: 'Moderate activities, some data',
    bad: 'Cancelled/no-show or minimal data',
    custom: 'Search and select any activity',
  },
  meeting: {
    none: 'Test without meeting context',
    good: 'Meetings with full transcript and AI summary',
    average: 'Meetings with transcript only',
    bad: 'Meetings with minimal or no transcript',
    custom: 'Search and select any meeting',
  },
};

/**
 * Get tier color classes for consistent styling
 */
export function getTierColorClasses(tier: QualityTier): {
  bg: string;
  text: string;
  border: string;
} {
  switch (tier) {
    case 'good':
      return {
        bg: 'bg-emerald-100 dark:bg-emerald-900/30',
        text: 'text-emerald-700 dark:text-emerald-400',
        border: 'border-emerald-200 dark:border-emerald-800/50',
      };
    case 'average':
      return {
        bg: 'bg-amber-100 dark:bg-amber-900/30',
        text: 'text-amber-700 dark:text-amber-400',
        border: 'border-amber-200 dark:border-amber-800/50',
      };
    case 'bad':
      return {
        bg: 'bg-red-100 dark:bg-red-900/30',
        text: 'text-red-700 dark:text-red-400',
        border: 'border-red-200 dark:border-red-800/50',
      };
  }
}
