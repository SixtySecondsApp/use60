/**
 * useProfileVersions — React Query hooks for profile version history
 *
 * Generic hooks that work for all 3 profile types (fact, product, ICP).
 * Uses profileVersionService under the hood.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { profileVersionService } from '@/lib/services/profileVersionService';
import { factProfileKeys } from '@/lib/hooks/useFactProfiles';
import type { ProfileType, ProfileVersion } from '@/lib/types/profileVersion';

// ---------------------------------------------------------------------------
// Query Keys
// ---------------------------------------------------------------------------

export const profileVersionKeys = {
  all: ['profile-versions'] as const,
  list: (profileType: ProfileType, profileId: string) =>
    ['profile-versions', profileType, profileId] as const,
};

// ---------------------------------------------------------------------------
// Query: List versions for a profile
// ---------------------------------------------------------------------------

export function useProfileVersions(profileType: ProfileType, profileId: string | undefined) {
  return useQuery<ProfileVersion[], Error>({
    queryKey: profileVersionKeys.list(profileType, profileId ?? ''),
    queryFn: () => profileVersionService.listVersions(profileType, profileId!),
    enabled: !!profileId,
  });
}

// ---------------------------------------------------------------------------
// Mutation: Revert to a specific version
// ---------------------------------------------------------------------------

export function useRevertToVersion(profileType: ProfileType) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { profileId: string; versionId: string }>({
    mutationFn: async ({ profileId, versionId }) => {
      switch (profileType) {
        case 'fact_profile':
          return profileVersionService.revertFactProfile(profileId, versionId);
        case 'product_profile':
          return profileVersionService.revertProductProfile(profileId, versionId);
        case 'icp_profile':
          return profileVersionService.revertICPProfile(profileId, versionId);
      }
    },
    onSuccess: (_data, { profileId }) => {
      // Invalidate version list so it shows the new snapshot
      queryClient.invalidateQueries({
        queryKey: profileVersionKeys.list(profileType, profileId),
      });

      // Invalidate the parent profile data
      if (profileType === 'fact_profile') {
        queryClient.invalidateQueries({ queryKey: factProfileKeys.detail(profileId) });
        queryClient.invalidateQueries({ queryKey: factProfileKeys.all });
      } else if (profileType === 'product_profile') {
        queryClient.invalidateQueries({ queryKey: ['product-profiles'] });
      } else if (profileType === 'icp_profile') {
        queryClient.invalidateQueries({ queryKey: ['icp-profiles'] });
      }

      toast.success('Reverted to previous version');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to revert to version');
    },
  });
}
