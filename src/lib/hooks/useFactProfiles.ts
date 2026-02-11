/**
 * useFactProfiles — React Query hooks for Client Fact Profile CRUD
 *
 * Provides useQuery hooks for listing/fetching fact profiles and
 * useMutation hooks for create, update, and delete operations.
 * All mutations invalidate the profile list cache and show toast feedback.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { factProfileService } from '@/lib/services/factProfileService';
import type {
  FactProfile,
  CreateFactProfilePayload,
  UpdateFactProfilePayload,
} from '@/lib/types/factProfile';

// ---------------------------------------------------------------------------
// Query Keys
// ---------------------------------------------------------------------------

export const factProfileKeys = {
  all: ['fact-profiles'] as const,
  list: (orgId: string) => ['fact-profiles', orgId] as const,
  detail: (id: string) => ['fact-profiles', id] as const,
  public: (shareToken: string) => ['fact-profiles', 'public', shareToken] as const,
};

// ---------------------------------------------------------------------------
// Query: List all fact profiles for an org
// ---------------------------------------------------------------------------

export function useFactProfiles(orgId: string | undefined) {
  return useQuery<FactProfile[], Error>({
    queryKey: factProfileKeys.list(orgId ?? ''),
    queryFn: () => factProfileService.listProfiles(orgId!),
    enabled: !!orgId,
  });
}

// ---------------------------------------------------------------------------
// Query: Get a single fact profile by ID
// ---------------------------------------------------------------------------

export function useFactProfile(id: string | undefined) {
  return useQuery<FactProfile | null, Error>({
    queryKey: factProfileKeys.detail(id ?? ''),
    queryFn: () => factProfileService.getProfile(id!),
    enabled: !!id,
  });
}

// ---------------------------------------------------------------------------
// Query: Get a public fact profile by share token (no auth needed)
// ---------------------------------------------------------------------------

export function usePublicFactProfile(shareToken: string | undefined) {
  return useQuery<FactProfile | null, Error>({
    queryKey: factProfileKeys.public(shareToken ?? ''),
    queryFn: () => factProfileService.getPublicProfile(shareToken!),
    enabled: !!shareToken,
  });
}

// ---------------------------------------------------------------------------
// Mutation: Create fact profile
// ---------------------------------------------------------------------------

export function useCreateFactProfile() {
  const queryClient = useQueryClient();

  return useMutation<FactProfile, Error, CreateFactProfilePayload>({
    mutationFn: (payload) => factProfileService.createProfile(payload),
    onSuccess: (profile) => {
      queryClient.invalidateQueries({ queryKey: factProfileKeys.list(profile.organization_id) });
      toast.success(`Fact profile "${profile.company_name}" created`);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create fact profile');
    },
  });
}

// ---------------------------------------------------------------------------
// Mutation: Update fact profile
// ---------------------------------------------------------------------------

interface UpdateFactProfileMutationInput {
  id: string;
  payload: UpdateFactProfilePayload;
  silent?: boolean;
}

export function useUpdateFactProfile() {
  const queryClient = useQueryClient();

  return useMutation<FactProfile, Error, UpdateFactProfileMutationInput>({
    mutationFn: ({ id, payload }) => factProfileService.updateProfile(id, payload),
    onSuccess: (profile, variables) => {
      queryClient.invalidateQueries({ queryKey: factProfileKeys.list(profile.organization_id) });
      queryClient.invalidateQueries({ queryKey: factProfileKeys.detail(profile.id) });
      if (!variables.silent) {
        toast.success(`Fact profile "${profile.company_name}" updated`);
      }
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update fact profile');
    },
  });
}

// ---------------------------------------------------------------------------
// Mutation: Delete fact profile (optimistic update)
// ---------------------------------------------------------------------------

export function useDeleteFactProfile() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: string; orgId: string; companyName: string }>({
    mutationFn: ({ id }) => factProfileService.deleteProfile(id),
    onMutate: async ({ id, orgId }) => {
      // Cancel any in-flight refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: factProfileKeys.list(orgId) });

      // Snapshot previous value
      const previousProfiles = queryClient.getQueryData<FactProfile[]>(factProfileKeys.list(orgId));

      // Optimistically remove the profile from the cache
      if (previousProfiles) {
        queryClient.setQueryData<FactProfile[]>(
          factProfileKeys.list(orgId),
          previousProfiles.filter((p) => p.id !== id)
        );
      }

      return { previousProfiles };
    },
    onSuccess: (_data, { orgId, companyName }) => {
      queryClient.invalidateQueries({ queryKey: factProfileKeys.list(orgId) });
      toast.success(`Fact profile "${companyName}" deleted`);
    },
    onError: (error, { orgId }, context) => {
      // Rollback on error
      if (context?.previousProfiles) {
        queryClient.setQueryData(factProfileKeys.list(orgId), context.previousProfiles);
      }
      toast.error(error.message || 'Failed to delete fact profile');
    },
  });
}
