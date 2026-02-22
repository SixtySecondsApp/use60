/**
 * useCustomSOPs
 * SOP-005: React Query hooks for custom SOP CRUD
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import type { SOPStep, StepActionType } from '@/components/agent/SOPStepBuilder';
import type { TriggerType, TriggerConfig } from '@/components/agent/TriggerConditionSelector';

// ============================================================
// Types
// ============================================================

export interface CustomSOP {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  trigger_type: TriggerType;
  trigger_config: TriggerConfig;
  is_active: boolean;
  is_platform_default: boolean;
  version: number;
  credit_cost_estimate: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  steps?: SOPStepRecord[];
}

export interface SOPStepRecord {
  id: string;
  sop_id: string;
  step_order: number;
  action_type: StepActionType;
  action_config: Record<string, unknown>;
  requires_approval: boolean;
  created_at: string;
}

export interface CreateSOPInput {
  name: string;
  description?: string;
  trigger_type: TriggerType;
  trigger_config: TriggerConfig;
  is_active?: boolean;
  credit_cost_estimate?: number;
  steps: Array<{
    step_order: number;
    action_type: StepActionType;
    action_config: Record<string, unknown>;
    requires_approval: boolean;
  }>;
}

export interface UpdateSOPInput {
  id: string;
  name?: string;
  description?: string;
  trigger_type?: TriggerType;
  trigger_config?: TriggerConfig;
  is_active?: boolean;
  credit_cost_estimate?: number;
  steps?: Array<{
    step_order: number;
    action_type: StepActionType;
    action_config: Record<string, unknown>;
    requires_approval: boolean;
  }>;
}

// ============================================================
// Query keys
// ============================================================

export const SOP_KEYS = {
  all: ['custom-sops'] as const,
  list: (orgId: string) => ['custom-sops', 'list', orgId] as const,
  detail: (sopId: string) => ['custom-sops', 'detail', sopId] as const,
};

// ============================================================
// Hooks
// ============================================================

export function useCustomSOPs(orgId: string) {
  return useQuery({
    queryKey: SOP_KEYS.list(orgId),
    queryFn: async () => {
      // Fetch SOPs: org-specific + platform defaults
      const { data: sops, error } = await supabase
        .from('custom_sops')
        .select('id, org_id, name, description, trigger_type, trigger_config, is_active, is_platform_default, version, credit_cost_estimate, created_by, created_at, updated_at')
        .or(`org_id.eq.${orgId},is_platform_default.eq.true`)
        .order('is_platform_default', { ascending: false })
        .order('name');

      if (error) throw error;
      if (!sops || sops.length === 0) return [];

      // Fetch steps for all SOPs
      const sopIds = sops.map((s) => s.id);
      const { data: steps, error: stepsError } = await supabase
        .from('sop_steps')
        .select('id, sop_id, step_order, action_type, action_config, requires_approval, created_at')
        .in('sop_id', sopIds)
        .order('step_order');

      if (stepsError) throw stepsError;

      // Join steps into SOPs
      return sops.map((sop) => ({
        ...sop,
        steps: (steps ?? []).filter((step) => step.sop_id === sop.id),
      })) as CustomSOP[];
    },
    enabled: !!orgId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useCreateSOP(orgId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateSOPInput) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: sop, error } = await supabase
        .from('custom_sops')
        .insert({
          org_id: orgId,
          name: input.name,
          description: input.description ?? null,
          trigger_type: input.trigger_type,
          trigger_config: input.trigger_config,
          is_active: input.is_active ?? true,
          is_platform_default: false,
          credit_cost_estimate: input.credit_cost_estimate ?? 0,
          created_by: user?.id ?? null,
        })
        .select('id')
        .single();

      if (error) throw error;

      if (input.steps.length > 0) {
        const { error: stepsError } = await supabase
          .from('sop_steps')
          .insert(
            input.steps.map((step) => ({
              sop_id: sop.id,
              step_order: step.step_order,
              action_type: step.action_type,
              action_config: step.action_config,
              requires_approval: step.requires_approval,
            }))
          );
        if (stepsError) throw stepsError;
      }

      return sop.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SOP_KEYS.list(orgId) });
      toast.success('SOP created successfully');
    },
    onError: (err: Error) => {
      toast.error(`Failed to create SOP: ${err.message}`);
    },
  });
}

export function useUpdateSOP(orgId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateSOPInput) => {
      const { id, steps, ...fields } = input;

      const updatePayload: Record<string, unknown> = {};
      if (fields.name !== undefined) updatePayload.name = fields.name;
      if (fields.description !== undefined) updatePayload.description = fields.description;
      if (fields.trigger_type !== undefined) updatePayload.trigger_type = fields.trigger_type;
      if (fields.trigger_config !== undefined) updatePayload.trigger_config = fields.trigger_config;
      if (fields.is_active !== undefined) updatePayload.is_active = fields.is_active;
      if (fields.credit_cost_estimate !== undefined) updatePayload.credit_cost_estimate = fields.credit_cost_estimate;

      if (Object.keys(updatePayload).length > 0) {
        const { error } = await supabase
          .from('custom_sops')
          .update(updatePayload)
          .eq('id', id);
        if (error) throw error;
      }

      // Replace steps if provided
      if (steps !== undefined) {
        const { error: deleteError } = await supabase
          .from('sop_steps')
          .delete()
          .eq('sop_id', id);
        if (deleteError) throw deleteError;

        if (steps.length > 0) {
          const { error: insertError } = await supabase
            .from('sop_steps')
            .insert(
              steps.map((step) => ({
                sop_id: id,
                step_order: step.step_order,
                action_type: step.action_type,
                action_config: step.action_config,
                requires_approval: step.requires_approval,
              }))
            );
          if (insertError) throw insertError;
        }
      }

      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SOP_KEYS.list(orgId) });
      toast.success('SOP updated');
    },
    onError: (err: Error) => {
      toast.error(`Failed to update SOP: ${err.message}`);
    },
  });
}

export function useDeleteSOP(orgId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (sopId: string) => {
      const { error } = await supabase
        .from('custom_sops')
        .delete()
        .eq('id', sopId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SOP_KEYS.list(orgId) });
      toast.success('SOP deleted');
    },
    onError: (err: Error) => {
      toast.error(`Failed to delete SOP: ${err.message}`);
    },
  });
}

export function useToggleSOPActive(orgId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('custom_sops')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, { is_active }) => {
      qc.invalidateQueries({ queryKey: SOP_KEYS.list(orgId) });
      toast.success(`SOP ${is_active ? 'enabled' : 'disabled'}`);
    },
    onError: (err: Error) => {
      toast.error(`Failed to toggle SOP: ${err.message}`);
    },
  });
}
