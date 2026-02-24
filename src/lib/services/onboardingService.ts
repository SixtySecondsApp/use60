/**
 * Waitlist Onboarding Service
 * Tracks user completion of 6 key onboarding steps with automatic progress calculation
 * Table: waitlist_onboarding_progress (renamed to avoid conflict with general onboarding table)
 */

import { supabase } from '../supabase/clientV2';

export type OnboardingStep =
  | 'account_created'
  | 'profile_completed'
  | 'first_meeting_synced'
  | 'meeting_intelligence_used'
  | 'crm_integrated'
  | 'team_invited';

export interface OnboardingProgress {
  id: string;
  user_id: string;
  waitlist_entry_id?: string;
  account_created_at?: string;
  profile_completed_at?: string;
  first_meeting_synced_at?: string;
  meeting_intelligence_used_at?: string;
  crm_integrated_at?: string;
  team_invited_at?: string;
  completion_percentage: number;
  completed_steps: number;
  total_steps: number;
  created_at: string;
  updated_at: string;
}

export interface OnboardingAnalytics {
  total_users: number;
  avg_completion: number;
  completed_users: number;
  in_progress_users: number;
  not_started_users: number;
  stuck_users: number;
  distribution: {
    '0-25': number;
    '26-50': number;
    '51-75': number;
    '76-100': number;
  };
  avg_days_to_complete: number;
}

export interface StuckUser {
  user_id: string;
  email: string;
  name: string;
  completion_percentage: number;
  completed_steps: number;
  days_since_created: number;
  last_step_completed: string;
  last_step_date: string;
}

export interface OnboardingFilters {
  completion_min?: number;
  completion_max?: number;
  stuck_only?: boolean;
  limit?: number;
}

export interface ServiceResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Mark an onboarding step as complete for a user
 * Only marks if not already completed
 */
export async function markOnboardingStep(
  userId: string,
  step: OnboardingStep
): Promise<ServiceResult> {
  try {
    // Call the PostgreSQL function
    const { data, error } = await supabase.rpc('mark_onboarding_step', {
      p_user_id: userId,
      p_step: step,
    });

    if (error) throw error;

    return {
      success: true,
      data,
    };
  } catch (error: any) {
    console.error(`Error marking onboarding step ${step}:`, error);
    return {
      success: false,
      error: error.message || `Failed to mark onboarding step: ${step}`,
    };
  }
}

/**
 * Get onboarding progress for a specific user
 */
export async function getOnboardingProgress(
  userId: string
): Promise<ServiceResult<OnboardingProgress>> {
  try {
    const { data, error } = await supabase
      .from('waitlist_onboarding_progress')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    return {
      success: true,
      data: data || undefined,
    };
  } catch (error: any) {
    console.error('Error fetching onboarding progress:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch onboarding progress',
    };
  }
}

/**
 * Get all onboarding progress records with optional filters
 */
export async function getAllOnboardingProgress(
  filters?: OnboardingFilters
): Promise<ServiceResult<OnboardingProgress[]>> {
  try {
    let query = supabase.from('waitlist_onboarding_progress').select('*');

    if (filters?.completion_min !== undefined) {
      query = query.gte('completion_percentage', filters.completion_min);
    }

    if (filters?.completion_max !== undefined) {
      query = query.lte('completion_percentage', filters.completion_max);
    }

    if (filters?.stuck_only) {
      query = query
        .lt('completion_percentage', 50)
        .lt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    }

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    query = query.order('completion_percentage', { ascending: false });

    const { data, error } = await query;

    if (error) throw error;

    return {
      success: true,
      data: data || [],
    };
  } catch (error: any) {
    console.error('Error fetching onboarding progress:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch onboarding progress',
    };
  }
}

/**
 * Get aggregated onboarding analytics
 */
export async function getOnboardingAnalytics(): Promise<ServiceResult<OnboardingAnalytics>> {
  try {
    const { data, error } = await supabase.rpc('get_onboarding_analytics');

    if (error) throw error;

    return {
      success: true,
      data,
    };
  } catch (error: any) {
    console.error('Error fetching onboarding analytics:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch onboarding analytics',
    };
  }
}

/**
 * Get list of stuck users (< 50% completion after 7 days)
 */
export async function getStuckOnboardingUsers(): Promise<ServiceResult<StuckUser[]>> {
  try {
    const { data, error } = await supabase.rpc('get_stuck_onboarding_users');

    if (error) throw error;

    return {
      success: true,
      data: data || [],
    };
  } catch (error: any) {
    console.error('Error fetching stuck users:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch stuck users',
    };
  }
}

/**
 * Helper function to get next recommended step based on current progress
 */
export function getNextOnboardingStep(
  progress: OnboardingProgress
): { step: OnboardingStep; title: string; description: string } | null {
  // Check steps in order
  if (!progress.profile_completed_at) {
    return {
      step: 'profile_completed',
      title: 'Complete Your Profile',
      description: 'Add your details and preferences to personalize your experience',
    };
  }

  if (!progress.first_meeting_synced_at) {
    return {
      step: 'first_meeting_synced',
      title: 'Connect Your Calendar',
      description: 'Sync your first meeting to start capturing insights',
    };
  }

  if (!progress.meeting_intelligence_used_at) {
    return {
      step: 'meeting_intelligence_used',
      title: 'Try AI Search',
      description: 'Experience semantic search across your meeting transcripts',
    };
  }

  if (!progress.crm_integrated_at) {
    return {
      step: 'crm_integrated',
      title: 'Integrate Your CRM',
      description: 'Connect your sales tools for seamless workflow',
    };
  }

  if (!progress.team_invited_at) {
    return {
      step: 'team_invited',
      title: 'Invite Your Team',
      description: 'Collaborate with colleagues and share insights',
    };
  }

  return null; // All steps completed
}

/**
 * Get user-friendly step label
 */
export function getStepLabel(step: OnboardingStep): string {
  const labels: Record<OnboardingStep, string> = {
    account_created: 'Account Created',
    profile_completed: 'Profile Completed',
    first_meeting_synced: 'First Meeting Synced',
    meeting_intelligence_used: 'AI Search Used',
    crm_integrated: 'CRM Integrated',
    team_invited: 'Team Invited',
  };

  return labels[step];
}

/**
 * Get completion status badge color
 */
export function getCompletionBadgeColor(percentage: number): string {
  if (percentage === 0) return 'bg-gray-500';
  if (percentage < 33) return 'bg-red-500';
  if (percentage < 66) return 'bg-yellow-500';
  if (percentage < 100) return 'bg-blue-500';
  return 'bg-green-500';
}

/**
 * Get all onboarding steps in order
 */
export function getAllOnboardingSteps(): {
  step: OnboardingStep;
  title: string;
  description: string;
}[] {
  return [
    {
      step: 'account_created',
      title: 'Account Created',
      description: 'Successfully created your account',
    },
    {
      step: 'profile_completed',
      title: 'Complete Profile',
      description: 'Add your details and preferences',
    },
    {
      step: 'first_meeting_synced',
      title: 'Sync First Meeting',
      description: 'Connect your calendar and sync a meeting',
    },
    {
      step: 'meeting_intelligence_used',
      title: 'Try AI Search',
      description: 'Experience semantic meeting search',
    },
    {
      step: 'crm_integrated',
      title: 'Integrate CRM',
      description: 'Connect your sales tools',
    },
    {
      step: 'team_invited',
      title: 'Invite Team',
      description: 'Collaborate with colleagues',
    },
  ];
}

/**
 * Calculate days stuck (for users below 50% after 7+ days)
 */
export function getDaysStuck(progress: OnboardingProgress): number | null {
  if (progress.completion_percentage >= 50) return null;

  const createdDate = new Date(progress.created_at);
  const now = new Date();
  const daysDiff = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));

  return daysDiff > 7 ? daysDiff : null;
}

/**
 * Integration points - call these from appropriate places in the app
 */

// Call when user completes profile settings
export async function trackProfileCompletion(userId: string): Promise<void> {
  await markOnboardingStep(userId, 'profile_completed');
}

// Call when first meeting is synced (CalendarService)
export async function trackFirstMeetingSync(userId: string): Promise<void> {
  await markOnboardingStep(userId, 'first_meeting_synced');
}

// Call when user performs first AI search query (Meeting Intelligence page)
export async function trackMeetingIntelligenceUsage(userId: string): Promise<void> {
  await markOnboardingStep(userId, 'meeting_intelligence_used');
}

// Call when CRM connection is successful
export async function trackCRMIntegration(userId: string): Promise<void> {
  await markOnboardingStep(userId, 'crm_integrated');
}

// Call when first team invite is sent
export async function trackTeamInvite(userId: string): Promise<void> {
  await markOnboardingStep(userId, 'team_invited');
}
