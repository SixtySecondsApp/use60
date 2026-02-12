/**
 * useProductProfiles — React Query hooks for Product Profile CRUD
 *
 * Provides useQuery hooks for listing/fetching product profiles and
 * useMutation hooks for create, update, and delete operations.
 * All mutations invalidate the profile list cache and show toast feedback.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { productProfileService } from '@/lib/services/productProfileService';
import type {
  ProductProfile,
  CreateProductProfilePayload,
  UpdateProductProfilePayload,
} from '@/lib/types/productProfile';

// ---------------------------------------------------------------------------
// Query Keys
// ---------------------------------------------------------------------------

export const productProfileKeys = {
  all: ['product-profiles'] as const,
  list: (orgId: string) => ['product-profiles', orgId] as const,
  byFactProfile: (factProfileId: string) => ['product-profiles', 'by-fact-profile', factProfileId] as const,
  detail: (id: string) => ['product-profiles', id] as const,
};

// ---------------------------------------------------------------------------
// Query: List all product profiles for an org
// ---------------------------------------------------------------------------

export function useProductProfiles(orgId: string | undefined) {
  return useQuery<ProductProfile[], Error>({
    queryKey: productProfileKeys.list(orgId ?? ''),
    queryFn: () => productProfileService.listByOrg(orgId!),
    enabled: !!orgId,
  });
}

// ---------------------------------------------------------------------------
// Query: List product profiles by fact profile ID
// ---------------------------------------------------------------------------

export function useProductProfilesByFactProfile(factProfileId: string | undefined) {
  return useQuery<ProductProfile[], Error>({
    queryKey: productProfileKeys.byFactProfile(factProfileId ?? ''),
    queryFn: () => productProfileService.listByFactProfile(factProfileId!),
    enabled: !!factProfileId,
  });
}

// ---------------------------------------------------------------------------
// Query: Get a single product profile by ID
// ---------------------------------------------------------------------------

export function useProductProfile(id: string | undefined) {
  return useQuery<ProductProfile | null, Error>({
    queryKey: productProfileKeys.detail(id ?? ''),
    queryFn: () => productProfileService.getProfile(id!),
    enabled: !!id,
  });
}

// ---------------------------------------------------------------------------
// Mutation: Create product profile
// ---------------------------------------------------------------------------

export function useCreateProductProfile() {
  const queryClient = useQueryClient();

  return useMutation<ProductProfile, Error, CreateProductProfilePayload>({
    mutationFn: (payload) => productProfileService.createProfile(payload),
    onSuccess: (profile) => {
      queryClient.invalidateQueries({ queryKey: productProfileKeys.list(profile.organization_id) });
      if (profile.fact_profile_id) {
        queryClient.invalidateQueries({ queryKey: productProfileKeys.byFactProfile(profile.fact_profile_id) });
      }
      toast.success(`Product profile "${profile.name}" created`);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create product profile');
    },
  });
}

// ---------------------------------------------------------------------------
// Mutation: Update product profile
// ---------------------------------------------------------------------------

interface UpdateProductProfileMutationInput {
  id: string;
  payload: UpdateProductProfilePayload;
  silent?: boolean;
}

export function useUpdateProductProfile() {
  const queryClient = useQueryClient();

  return useMutation<ProductProfile, Error, UpdateProductProfileMutationInput>({
    mutationFn: ({ id, payload }) => productProfileService.updateProfile(id, payload),
    onSuccess: (profile, variables) => {
      queryClient.invalidateQueries({ queryKey: productProfileKeys.list(profile.organization_id) });
      queryClient.invalidateQueries({ queryKey: productProfileKeys.detail(profile.id) });
      if (profile.fact_profile_id) {
        queryClient.invalidateQueries({ queryKey: productProfileKeys.byFactProfile(profile.fact_profile_id) });
      }
      if (!variables.silent) {
        toast.success(`Product profile "${profile.name}" updated`);
      }
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update product profile');
    },
  });
}

// ---------------------------------------------------------------------------
// Mutation: Delete product profile (optimistic update)
// ---------------------------------------------------------------------------

export function useDeleteProductProfile() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: string; orgId: string; name: string; factProfileId?: string | null }>({
    mutationFn: ({ id }) => productProfileService.deleteProfile(id),
    onMutate: async ({ id, orgId }) => {
      await queryClient.cancelQueries({ queryKey: productProfileKeys.list(orgId) });

      const previousProfiles = queryClient.getQueryData<ProductProfile[]>(productProfileKeys.list(orgId));

      if (previousProfiles) {
        queryClient.setQueryData<ProductProfile[]>(
          productProfileKeys.list(orgId),
          previousProfiles.filter((p) => p.id !== id)
        );
      }

      return { previousProfiles };
    },
    onSuccess: (_data, { orgId, name, factProfileId }) => {
      queryClient.invalidateQueries({ queryKey: productProfileKeys.list(orgId) });
      if (factProfileId) {
        queryClient.invalidateQueries({ queryKey: productProfileKeys.byFactProfile(factProfileId) });
      }
      toast.success(`Product profile "${name}" deleted`);
    },
    onError: (error, { orgId }, context) => {
      if (context?.previousProfiles) {
        queryClient.setQueryData(productProfileKeys.list(orgId), context.previousProfiles);
      }
      toast.error(error.message || 'Failed to delete product profile');
    },
  });
}
