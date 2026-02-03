/**
 * useUserProfile Hook
 *
 * React Query wrapper for fetching user profiles.
 * This hook provides cached profile data that is deduplicated across all components.
 *
 * Use this for profile data when you already have the user email.
 * The cache prevents duplicate API calls when multiple components need the profile.
 *
 * @example
 * const { data: profile, isLoading } = useUserProfile(userEmail);
 * if (profile) {
 *   console.log('Profile:', profile.first_name);
 * }
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import type { Database } from '@/lib/database.types';
import logger from '@/lib/utils/logger';

type UserProfile = Database['public']['Tables']['profiles']['Row'];

// Query key for user profiles
export const USER_PROFILE_QUERY_KEY = ['user-profile'] as const;

/**
 * Fetches the user profile from Supabase by email
 */
async function fetchUserProfileByEmail(email: string): Promise<UserProfile | null> {
  logger.log('🔍 useUserProfile: Fetching profile by email:', email);

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name, avatar_url, is_admin, created_at, updated_at, timezone, week_starts_on')
    .eq('email', email)
    .maybeSingle();

  if (error) {
    logger.warn('useUserProfile: Profile fetch error:', error.message);
    return null;
  }

  if (profile) {
    logger.log('✅ useUserProfile: Profile fetched successfully');
  }

  return profile;
}

/**
 * Fetches the user profile from Supabase by ID
 */
async function fetchUserProfileById(userId: string): Promise<UserProfile | null> {
  logger.log('🔍 useUserProfile: Fetching profile by ID:', userId);

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name, avatar_url, is_admin, created_at, updated_at, timezone, week_starts_on')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    logger.warn('useUserProfile: Profile fetch error:', error.message);
    return null;
  }

  return profile;
}

/**
 * Hook to get a user profile by email with React Query caching.
 *
 * Benefits:
 * - Automatic deduplication: Multiple components calling this hook = 1 API call
 * - Long stale time: Profile data rarely changes mid-session
 * - No refetch on focus: Prevents unnecessary calls on tab switch
 *
 * @param email - User email to fetch profile for
 * @returns Query result with profile data
 */
export function useUserProfile(email: string | null | undefined) {
  return useQuery({
    queryKey: [...USER_PROFILE_QUERY_KEY, email] as const,
    queryFn: () => fetchUserProfileByEmail(email!),
    enabled: !!email,
    staleTime: 10 * 60 * 1000, // 10 minutes - profile rarely changes
    gcTime: 30 * 60 * 1000, // 30 minutes - keep in cache longer
    refetchOnWindowFocus: 'stale', // Refetch if data is stale when user returns to app
    refetchOnMount: 'stale', // Refetch on mount if data is stale
    refetchOnReconnect: false, // Don't refetch on network reconnect
    retry: 1, // Only retry once for profile
  });
}

/**
 * Hook to get a user profile by ID with React Query caching and real-time updates.
 *
 * @param userId - User ID to fetch profile for
 * @returns Query result with profile data
 */
export function useUserProfileById(userId: string | null | undefined) {
  const queryClient = useQueryClient();

  // Set up real-time subscription to profile changes
  useEffect(() => {
    if (!userId) return;

    try {
      // Subscribe to profile updates via Postgres Changes
      const channel = supabase
        .channel(`profile_changes_${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${userId}`,
          },
          () => {
            logger.log('[useUserProfileById] Profile updated via Realtime, invalidating cache');
            // Invalidate the specific profile query to trigger a refetch
            queryClient.invalidateQueries({
              queryKey: [...USER_PROFILE_QUERY_KEY, 'by-id', userId],
            });
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            logger.log(`[useUserProfileById] Real-time subscription active for user ${userId}`);
          } else if (status === 'CLOSED') {
            logger.log(`[useUserProfileById] Real-time subscription closed for user ${userId}`);
          }
        });

      // Cleanup subscription on unmount
      return () => {
        channel.unsubscribe();
      };
    } catch (error) {
      logger.error('[useUserProfileById] Failed to set up real-time subscription:', error);
      // Gracefully handle subscription failures - fallback to polling via refetchOnWindowFocus
    }
  }, [userId, queryClient]);

  return useQuery({
    queryKey: [...USER_PROFILE_QUERY_KEY, 'by-id', userId] as const,
    queryFn: () => fetchUserProfileById(userId!),
    enabled: !!userId,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: 'stale', // Refetch if data is stale when user returns to app
    refetchOnMount: 'stale', // Refetch on mount if data is stale (ensures fresh profile on dashboard load after onboarding)
    refetchOnReconnect: false,
    retry: 1,
  });
}

/**
 * Hook to invalidate user profile cache.
 * Call this when you know the profile has changed.
 *
 * @example
 * const invalidateProfile = useInvalidateUserProfile();
 * await updateProfile({ first_name: 'New Name' });
 * invalidateProfile(userEmail);
 */
export function useInvalidateUserProfile() {
  const queryClient = useQueryClient();

  return (email?: string) => {
    if (email) {
      queryClient.invalidateQueries({ queryKey: [...USER_PROFILE_QUERY_KEY, email] });
    } else {
      // Invalidate all profile queries
      queryClient.invalidateQueries({ queryKey: USER_PROFILE_QUERY_KEY });
    }
  };
}

export default useUserProfile;
