/**
 * usePlatformSkills Hook
 *
 * React Query hooks for managing platform-level skill documents.
 * Provides CRUD operations with optimistic updates and cache management.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPlatformSkills,
  getPlatformSkill,
  getPlatformSkillByKey,
  createPlatformSkill,
  updatePlatformSkill,
  deletePlatformSkill,
  togglePlatformSkillActive,
  getPlatformSkillHistory,
  rollbackPlatformSkill,
  previewSkillCompilation,
  getOrganizationContext,
  syncSkillAfterSave,
  type PlatformSkill,
  type CreatePlatformSkillInput,
  type UpdatePlatformSkillInput,
  type SkillCategory,
  type PlatformSkillHistory,
  type PlatformSkillFrontmatter,
} from '@/lib/services/platformSkillService';
import { ensureStandardFolders } from '@/lib/services/skillFolderService';
import { useOrgStore } from '@/lib/stores/orgStore';
import { toast } from 'sonner';

// ============================================================================
// Query Keys
// ============================================================================

const QUERY_KEYS = {
  all: ['platform-skills'] as const,
  list: (category?: SkillCategory) =>
    category ? ['platform-skills', 'list', category] : ['platform-skills', 'list'],
  detail: (id: string) => ['platform-skills', 'detail', id] as const,
  byKey: (key: string) => ['platform-skills', 'by-key', key] as const,
  history: (id: string) => ['platform-skills', 'history', id] as const,
  preview: (skillKey: string, orgId: string) =>
    ['platform-skills', 'preview', skillKey, orgId] as const,
  orgContext: (orgId: string) => ['organization-context', orgId] as const,
};

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Fetch all platform skills, optionally filtered by category
 */
export function usePlatformSkills(category?: SkillCategory) {
  return useQuery({
    queryKey: QUERY_KEYS.list(category),
    queryFn: async () => {
      const result = await getPlatformSkills(category);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch platform skills');
      }
      return result.data || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Fetch a single platform skill by ID
 */
export function usePlatformSkill(skillId: string | null) {
  return useQuery({
    queryKey: skillId ? QUERY_KEYS.detail(skillId) : ['platform-skills', 'null'],
    queryFn: async () => {
      if (!skillId) return null;
      const result = await getPlatformSkill(skillId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch platform skill');
      }
      return result.data;
    },
    enabled: !!skillId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch a platform skill by its skill_key
 */
export function usePlatformSkillByKey(skillKey: string | null) {
  return useQuery({
    queryKey: skillKey ? QUERY_KEYS.byKey(skillKey) : ['platform-skills', 'by-key', 'null'],
    queryFn: async () => {
      if (!skillKey) return null;
      const result = await getPlatformSkillByKey(skillKey);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch platform skill');
      }
      return result.data;
    },
    enabled: !!skillKey,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch version history for a platform skill
 */
export function usePlatformSkillHistory(skillId: string | null) {
  return useQuery({
    queryKey: skillId ? QUERY_KEYS.history(skillId) : ['platform-skills', 'history', 'null'],
    queryFn: async () => {
      if (!skillId) return [];
      const result = await getPlatformSkillHistory(skillId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch skill history');
      }
      return result.data || [];
    },
    enabled: !!skillId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Preview skill compilation with organization context
 */
export function useSkillPreview(
  skillKey: string | null,
  organizationId: string | null,
  enabled = true
) {
  return useQuery({
    queryKey:
      skillKey && organizationId
        ? QUERY_KEYS.preview(skillKey, organizationId)
        : ['platform-skills', 'preview', 'null'],
    queryFn: async () => {
      if (!skillKey || !organizationId) return null;
      const result = await previewSkillCompilation(skillKey, organizationId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to preview skill');
      }
      return result.data;
    },
    enabled: enabled && !!skillKey && !!organizationId,
    staleTime: 0, // Always fresh for preview
  });
}

/**
 * Fetch organization context variables
 */
export function useOrganizationContext(organizationId: string | null) {
  return useQuery({
    queryKey: organizationId ? QUERY_KEYS.orgContext(organizationId) : ['org-context', 'null'],
    queryFn: async () => {
      if (!organizationId) return {};
      const result = await getOrganizationContext(organizationId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch organization context');
      }
      return result.data || {};
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Create a new platform skill
 */
export function useCreatePlatformSkill() {
  const queryClient = useQueryClient();
  const activeOrgId = useOrgStore((state) => state.activeOrgId);

  return useMutation({
    mutationFn: async (params: { input: CreatePlatformSkillInput; userId: string }) => {
      const result = await createPlatformSkill(params.input, params.userId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to create platform skill');
      }
      return result.data;
    },
    onSuccess: (data) => {
      // Invalidate all skill queries
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.all });
      toast.success(`Skill "${data?.frontmatter?.name || data?.skill_key}" created`);

      // Create standard folders (references/, scripts/, assets/) for the new skill
      if (data) {
        ensureStandardFolders(data.id).catch((err) =>
          console.warn('[useCreatePlatformSkill] Failed to create standard folders:', err)
        );
      }

      // Generate embedding + compile org skills in the background
      if (data) {
        syncSkillAfterSave(data, activeOrgId).then(({ embeddingOk, compileOk, errors }) => {
          if (embeddingOk && compileOk) {
            toast.success('Skill synced — embedding generated & compiled for your org');
          } else if (errors.length > 0) {
            console.warn('[useCreatePlatformSkill] Post-save sync issues:', errors);
            toast.warning('Skill saved, but some sync steps had issues. Check console for details.');
          }
        });
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

/**
 * Update an existing platform skill
 */
export function useUpdatePlatformSkill() {
  const queryClient = useQueryClient();
  const activeOrgId = useOrgStore((state) => state.activeOrgId);

  return useMutation({
    mutationFn: async (params: { skillId: string; input: UpdatePlatformSkillInput }) => {
      const result = await updatePlatformSkill(params.skillId, params.input);
      if (!result.success) {
        throw new Error(result.error || 'Failed to update platform skill');
      }
      return result.data;
    },
    onSuccess: (data, variables) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.all });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(variables.skillId) });
      if (data?.skill_key) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.byKey(data.skill_key) });
      }
      toast.success('Skill updated successfully');

      // Re-generate embedding + recompile org skills in the background
      if (data) {
        syncSkillAfterSave(data, activeOrgId).then(({ embeddingOk, compileOk, errors }) => {
          if (embeddingOk && compileOk) {
            toast.success('Skill synced — embedding updated & recompiled for your org');
          } else if (errors.length > 0) {
            console.warn('[useUpdatePlatformSkill] Post-save sync issues:', errors);
            toast.warning('Skill saved, but some sync steps had issues. Check console for details.');
          }
        });
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

/**
 * Delete a platform skill
 */
export function useDeletePlatformSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (skillId: string) => {
      const result = await deletePlatformSkill(skillId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete platform skill');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.all });
      toast.success('Skill deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

/**
 * Toggle skill active status
 */
export function useTogglePlatformSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { skillId: string; isActive: boolean }) => {
      const result = await togglePlatformSkillActive(params.skillId, params.isActive);
      if (!result.success) {
        throw new Error(result.error || 'Failed to toggle skill status');
      }
      return result.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.all });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(variables.skillId) });
      toast.success(variables.isActive ? 'Skill activated' : 'Skill deactivated');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

/**
 * Rollback skill to a previous version
 */
export function useRollbackPlatformSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { skillId: string; version: number }) => {
      const result = await rollbackPlatformSkill(params.skillId, params.version);
      if (!result.success) {
        throw new Error(result.error || 'Failed to rollback skill');
      }
      return result.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.all });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(variables.skillId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.history(variables.skillId) });
      toast.success(`Rolled back to version ${variables.version}`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// ============================================================================
// Combined Operations Hook
// ============================================================================

/**
 * Combined hook for all platform skill operations
 */
export function usePlatformSkillOperations(userId: string) {
  const createMutation = useCreatePlatformSkill();
  const updateMutation = useUpdatePlatformSkill();
  const deleteMutation = useDeletePlatformSkill();
  const toggleMutation = useTogglePlatformSkill();
  const rollbackMutation = useRollbackPlatformSkill();

  return {
    create: (input: CreatePlatformSkillInput) =>
      createMutation.mutateAsync({ input, userId }),
    update: (skillId: string, input: UpdatePlatformSkillInput) =>
      updateMutation.mutateAsync({ skillId, input }),
    delete: (skillId: string) => deleteMutation.mutateAsync(skillId),
    toggle: (skillId: string, isActive: boolean) =>
      toggleMutation.mutateAsync({ skillId, isActive }),
    rollback: (skillId: string, version: number) =>
      rollbackMutation.mutateAsync({ skillId, version }),

    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isToggling: toggleMutation.isPending,
    isRollingBack: rollbackMutation.isPending,
    isProcessing:
      createMutation.isPending ||
      updateMutation.isPending ||
      deleteMutation.isPending ||
      toggleMutation.isPending ||
      rollbackMutation.isPending,
  };
}

// ============================================================================
// Re-exports
// ============================================================================

export type {
  PlatformSkill,
  PlatformSkillFrontmatter,
  PlatformSkillHistory,
  CreatePlatformSkillInput,
  UpdatePlatformSkillInput,
  SkillCategory,
};

export { SKILL_CATEGORIES, getAvailableContextVariables, extractVariablesFromTemplate } from '@/lib/services/platformSkillService';
