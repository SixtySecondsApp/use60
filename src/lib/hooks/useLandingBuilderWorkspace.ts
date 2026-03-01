/**
 * useLandingBuilderWorkspace
 *
 * React hook wrapping landingBuilderWorkspaceService with auto-refetch
 * on mutations and optimistic phase transitions.
 */

import { useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  landingBuilderWorkspaceService,
  type LandingBuilderWorkspace,
  type WorkspacePhaseKey,
} from '@/lib/services/landingBuilderWorkspaceService';
import type { LandingSection, AssetStatus } from '@/components/landing-builder/types';
import { toast } from 'sonner';
import logger from '@/lib/utils/logger';

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------

const workspaceKeys = {
  all: ['landing-builder-workspace'] as const,
  byConversation: (id: string) => [...workspaceKeys.all, id] as const,
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseLandingBuilderWorkspaceParams {
  conversationId: string | undefined;
  userId: string | undefined;
  orgId: string | undefined;
}

export function useLandingBuilderWorkspace({
  conversationId,
  userId,
  orgId,
}: UseLandingBuilderWorkspaceParams) {
  const queryClient = useQueryClient();
  const initRef = useRef(false);

  // --- Query: fetch workspace ---
  const {
    data: workspace,
    isLoading,
    error,
  } = useQuery({
    queryKey: workspaceKeys.byConversation(conversationId ?? ''),
    queryFn: async () => {
      if (!conversationId || !userId || !orgId) return null;

      const ws = await landingBuilderWorkspaceService.getOrCreate({
        conversation_id: conversationId,
        user_id: userId,
        org_id: orgId,
      });

      initRef.current = true;
      return ws;
    },
    enabled: !!conversationId && !!userId && !!orgId,
    staleTime: 30_000,
  });

  // --- Helper: invalidate workspace query ---
  const invalidate = useCallback(() => {
    if (!conversationId) return;
    queryClient.invalidateQueries({ queryKey: workspaceKeys.byConversation(conversationId) });
  }, [conversationId, queryClient]);

  // --- Mutation: update phase output ---
  const updatePhaseOutput = useMutation({
    mutationFn: async ({
      phase,
      output,
    }: {
      phase: WorkspacePhaseKey;
      output: Record<string, unknown>;
    }) => {
      if (!conversationId) throw new Error('No conversationId');
      await landingBuilderWorkspaceService.updatePhaseOutput(conversationId, phase, output);
    },
    onSuccess: () => invalidate(),
    onError: (err) => {
      logger.error('[useWorkspace] updatePhaseOutput failed:', err);
      toast.error('Failed to save phase output');
    },
  });

  // --- Mutation: update code ---
  const updateCode = useMutation({
    mutationFn: async (code: string) => {
      if (!conversationId) throw new Error('No conversationId');
      await landingBuilderWorkspaceService.updateCode(conversationId, code);
    },
    onSuccess: () => invalidate(),
    onError: (err) => {
      logger.error('[useWorkspace] updateCode failed:', err);
      toast.error('Failed to save generated code');
    },
  });

  // --- Mutation: advance phase (optimistic) ---
  const advancePhase = useMutation({
    mutationFn: async ({
      nextPhase,
      phaseStatus,
    }: {
      nextPhase: number;
      phaseStatus: Record<string, string>;
    }) => {
      if (!conversationId) throw new Error('No conversationId');
      await landingBuilderWorkspaceService.advancePhase(conversationId, nextPhase, phaseStatus);
    },
    onMutate: async ({ nextPhase, phaseStatus }) => {
      // Optimistic update
      if (!conversationId) return;
      const key = workspaceKeys.byConversation(conversationId);
      await queryClient.cancelQueries({ queryKey: key });

      const previous = queryClient.getQueryData<LandingBuilderWorkspace>(key);
      if (previous) {
        queryClient.setQueryData<LandingBuilderWorkspace>(key, {
          ...previous,
          current_phase: nextPhase,
          phase_status: phaseStatus,
        });
      }
      return { previous };
    },
    onError: (err, _vars, context) => {
      // Rollback on error
      if (context?.previous && conversationId) {
        queryClient.setQueryData(
          workspaceKeys.byConversation(conversationId),
          context.previous,
        );
      }
      logger.error('[useWorkspace] advancePhase failed:', err);
      toast.error('Failed to update phase');
    },
    onSettled: () => invalidate(),
  });

  // --- Mutation: update all sections ---
  const updateSections = useMutation({
    mutationFn: async (sections: LandingSection[]) => {
      if (!conversationId) throw new Error('No conversationId');
      await landingBuilderWorkspaceService.updateSections(conversationId, sections);
    },
    onMutate: async (sections) => {
      if (!conversationId) return;
      const key = workspaceKeys.byConversation(conversationId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<LandingBuilderWorkspace>(key);
      if (previous) {
        queryClient.setQueryData<LandingBuilderWorkspace>(key, { ...previous, sections });
      }
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous && conversationId) {
        queryClient.setQueryData(workspaceKeys.byConversation(conversationId), context.previous);
      }
      logger.error('[useWorkspace] updateSections failed:', err);
      toast.error('Failed to save sections');
    },
    onSettled: () => invalidate(),
  });

  // --- Mutation: update single section ---
  const updateSection = useMutation({
    mutationFn: async ({ sectionId, patch }: { sectionId: string; patch: Partial<LandingSection> }) => {
      if (!conversationId) throw new Error('No conversationId');
      await landingBuilderWorkspaceService.updateSection(conversationId, sectionId, patch);
    },
    onMutate: async ({ sectionId, patch }) => {
      if (!conversationId) return;
      const key = workspaceKeys.byConversation(conversationId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<LandingBuilderWorkspace>(key);
      if (previous) {
        const sections = (previous.sections ?? []).map((s) =>
          s.id === sectionId ? { ...s, ...patch } : s,
        );
        queryClient.setQueryData<LandingBuilderWorkspace>(key, { ...previous, sections });
      }
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous && conversationId) {
        queryClient.setQueryData(workspaceKeys.byConversation(conversationId), context.previous);
      }
      logger.error('[useWorkspace] updateSection failed:', err);
      toast.error('Failed to save section');
    },
    onSettled: () => invalidate(),
  });

  // --- Mutation: update section asset ---
  const updateSectionAsset = useMutation({
    mutationFn: async ({
      sectionId,
      assetType,
      status,
      value,
    }: {
      sectionId: string;
      assetType: 'image' | 'svg';
      status: AssetStatus;
      value?: string;
    }) => {
      if (!conversationId) throw new Error('No conversationId');
      await landingBuilderWorkspaceService.updateSectionAsset(
        conversationId,
        sectionId,
        assetType,
        status,
        value,
      );
    },
    onMutate: async ({ sectionId, assetType, status, value }) => {
      if (!conversationId) return;
      const key = workspaceKeys.byConversation(conversationId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<LandingBuilderWorkspace>(key);
      if (previous) {
        const sections = (previous.sections ?? []).map((s) => {
          if (s.id !== sectionId) return s;
          if (assetType === 'image') {
            return { ...s, image_status: status, ...(value !== undefined && { image_url: value }) };
          }
          return { ...s, svg_status: status, ...(value !== undefined && { svg_code: value }) };
        });
        queryClient.setQueryData<LandingBuilderWorkspace>(key, { ...previous, sections });
      }
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous && conversationId) {
        queryClient.setQueryData(workspaceKeys.byConversation(conversationId), context.previous);
      }
      logger.error('[useWorkspace] updateSectionAsset failed:', err);
      toast.error('Failed to update asset');
    },
    onSettled: () => invalidate(),
  });

  // --- Mutation: delete workspace ---
  const removeWorkspace = useMutation({
    mutationFn: async () => {
      if (!conversationId) throw new Error('No conversationId');
      await landingBuilderWorkspaceService.remove(conversationId);
    },
    onSuccess: () => invalidate(),
    onError: (err) => {
      logger.error('[useWorkspace] remove failed:', err);
      toast.error('Failed to delete session');
    },
  });

  return {
    workspace,
    isLoading,
    error,
    isInitialized: initRef.current,
    updatePhaseOutput: updatePhaseOutput.mutateAsync,
    updateCode: updateCode.mutateAsync,
    advancePhase: advancePhase.mutateAsync,
    updateSections: updateSections.mutateAsync,
    updateSection: updateSection.mutateAsync,
    updateSectionAsset: updateSectionAsset.mutateAsync,
    removeWorkspace: removeWorkspace.mutateAsync,
  };
}
