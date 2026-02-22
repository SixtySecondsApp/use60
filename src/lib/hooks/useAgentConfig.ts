import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getAgentConfig,
  listAgentTypes,
  getMethodologies,
  getOverridableKeys,
  setOrgOverride,
  removeOrgOverride,
  setUserOverride,
  removeUserOverride,
  applyMethodology,
  setOverridable,
} from '@/lib/services/agentConfigService';

export type {
  AgentType,
  ConfigSource,
  AgentConfigEntry,
  AgentConfigMap,
  OverridableKey,
  MethodologyTemplate,
} from '@/lib/services/agentConfigService';

export const AGENT_CONFIG_KEYS = {
  all: ['agent-config'] as const,
  config: (orgId: string, agentType: string) =>
    ['agent-config', 'config', orgId, agentType] as const,
  agentTypes: () => ['agent-config', 'agent-types'] as const,
  methodologies: () => ['agent-config', 'methodologies'] as const,
  overridableKeys: (orgId: string) => ['agent-config', 'overridable', orgId] as const,
};

export function useAgentConfig(orgId: string, agentType: string, userId?: string) {
  return useQuery({
    queryKey: AGENT_CONFIG_KEYS.config(orgId, agentType),
    queryFn: () => getAgentConfig(orgId, agentType as never, userId),
    enabled: !!orgId && !!agentType,
    staleTime: 5 * 60 * 1000,
  });
}

export function useAgentTypes() {
  return useQuery({
    queryKey: AGENT_CONFIG_KEYS.agentTypes(),
    queryFn: listAgentTypes,
    staleTime: 30 * 60 * 1000,
  });
}

export function useMethodologies() {
  return useQuery({
    queryKey: AGENT_CONFIG_KEYS.methodologies(),
    queryFn: getMethodologies,
    staleTime: 30 * 60 * 1000,
  });
}

export function useOverridableKeys(orgId: string, agentType?: string) {
  return useQuery({
    queryKey: AGENT_CONFIG_KEYS.overridableKeys(orgId),
    queryFn: () => getOverridableKeys(orgId, agentType as never),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSetOrgOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      orgId,
      agentType,
      configKey,
      configValue,
    }: {
      orgId: string;
      agentType: string;
      configKey: string;
      configValue: unknown;
    }) => setOrgOverride(orgId, agentType as never, configKey, configValue),
    onSuccess: (_data, { orgId, agentType }) => {
      queryClient.invalidateQueries({ queryKey: AGENT_CONFIG_KEYS.config(orgId, agentType) });
      toast.success('Config override saved');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save override');
    },
  });
}

export function useRemoveOrgOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      orgId,
      agentType,
      configKey,
    }: {
      orgId: string;
      agentType: string;
      configKey: string;
    }) => removeOrgOverride(orgId, agentType as never, configKey),
    onSuccess: (_data, { orgId, agentType }) => {
      queryClient.invalidateQueries({ queryKey: AGENT_CONFIG_KEYS.config(orgId, agentType) });
      toast.success('Override removed');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove override');
    },
  });
}

export function useSetUserOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      orgId,
      agentType,
      configKey,
      configValue,
    }: {
      orgId: string;
      agentType: string;
      configKey: string;
      configValue: unknown;
    }) => setUserOverride(orgId, agentType as never, configKey, configValue),
    onSuccess: (_data, { orgId, agentType }) => {
      queryClient.invalidateQueries({ queryKey: AGENT_CONFIG_KEYS.config(orgId, agentType) });
      toast.success('User override saved');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save user override');
    },
  });
}

export function useRemoveUserOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      orgId,
      agentType,
      configKey,
    }: {
      orgId: string;
      agentType: string;
      configKey: string;
    }) => removeUserOverride(orgId, agentType as never, configKey),
    onSuccess: (_data, { orgId, agentType }) => {
      queryClient.invalidateQueries({ queryKey: AGENT_CONFIG_KEYS.config(orgId, agentType) });
      toast.success('User override removed');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove user override');
    },
  });
}

export function useApplyMethodology() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, methodologyKey }: { orgId: string; methodologyKey: string }) =>
      applyMethodology(orgId, methodologyKey),
    onSuccess: (data, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: ['agent-config', 'config', orgId] });
      toast.success(`Methodology applied — ${data.keys_written} keys written`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to apply methodology');
    },
  });
}

export function useSetOverridable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      orgId,
      agentType,
      configKey,
      isOverridable,
    }: {
      orgId: string;
      agentType: string;
      configKey: string;
      isOverridable: boolean;
    }) => setOverridable(orgId, agentType as never, configKey, isOverridable),
    onSuccess: (_data, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: AGENT_CONFIG_KEYS.overridableKeys(orgId) });
      toast.success('Overridable setting updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update overridable setting');
    },
  });
}
