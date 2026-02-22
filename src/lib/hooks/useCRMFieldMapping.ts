import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import { useActiveOrgId } from '@/lib/stores/orgStore';

// ============================================================
// Types
// ============================================================

export interface CRMFieldMapping {
  id?: string;
  org_id?: string;
  crm_provider: 'hubspot' | 'attio' | 'bullhorn';
  crm_object: 'contact' | 'deal' | 'company' | 'activity';
  crm_field_name: string;
  crm_field_type?: string;
  sixty_field_name?: string | null;
  confidence: number;
  is_confirmed: boolean;
  is_excluded: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CRMWritePolicy {
  id?: string;
  org_id?: string;
  crm_object: 'contact' | 'deal' | 'company' | 'activity';
  field_name: string;
  policy: 'auto' | 'approval' | 'suggest' | 'disabled';
  created_at?: string;
  updated_at?: string;
}

export interface DetectedField {
  crm_field_name: string;
  crm_field_type: string;
  crm_field_label: string;
  group_name: string;
  sixty_field_name: string | null;
  confidence: number;
  is_required: boolean;
  options: Array<{ label: string; value: string }>;
}

export interface TestMappingResult {
  crm_field_name: string;
  sixty_field_name: string;
  status: 'pass' | 'empty' | 'no_data';
  success_count: number;
  null_count: number;
  sample_values: unknown[];
  total_records_checked: number;
}

// ============================================================
// Query Keys
// ============================================================

export const CRM_FIELD_MAPPING_KEYS = {
  all: ['crm-field-mappings'] as const,
  mappings: (orgId: string, provider: string, object: string) =>
    ['crm-field-mappings', 'list', orgId, provider, object] as const,
  policies: (orgId: string, object: string) =>
    ['crm-write-policies', 'list', orgId, object] as const,
};

// ============================================================
// Hooks
// ============================================================

export function useCRMFieldMappings(
  provider: 'hubspot' | 'attio' | 'bullhorn',
  object: 'contact' | 'deal' | 'company' | 'activity'
) {
  const orgId = useActiveOrgId();

  return useQuery({
    queryKey: CRM_FIELD_MAPPING_KEYS.mappings(orgId ?? '', provider, object),
    queryFn: async (): Promise<CRMFieldMapping[]> => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('crm_field_mappings')
        .select('id, org_id, crm_provider, crm_object, crm_field_name, crm_field_type, sixty_field_name, confidence, is_confirmed, is_excluded, created_at, updated_at')
        .eq('org_id', orgId)
        .eq('crm_provider', provider)
        .eq('crm_object', object)
        .order('confidence', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CRMFieldMapping[];
    },
    enabled: !!orgId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useCRMWritePolicies(object: 'contact' | 'deal' | 'company' | 'activity') {
  const orgId = useActiveOrgId();

  return useQuery({
    queryKey: CRM_FIELD_MAPPING_KEYS.policies(orgId ?? '', object),
    queryFn: async (): Promise<CRMWritePolicy[]> => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('crm_write_policies')
        .select('id, org_id, crm_object, field_name, policy, created_at, updated_at')
        .eq('org_id', orgId)
        .eq('crm_object', object);
      if (error) throw error;
      return (data ?? []) as CRMWritePolicy[];
    },
    enabled: !!orgId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useSaveCRMFieldMappings() {
  const queryClient = useQueryClient();
  const orgId = useActiveOrgId();

  return useMutation({
    mutationFn: async (mappings: CRMFieldMapping[]) => {
      if (!orgId) throw new Error('No org ID');
      const rows = mappings.map((m) => ({
        ...m,
        org_id: orgId,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase
        .from('crm_field_mappings')
        .upsert(rows, { onConflict: 'org_id,crm_provider,crm_object,crm_field_name' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CRM_FIELD_MAPPING_KEYS.all });
      toast.success('Field mappings saved');
    },
    onError: (err: Error) => {
      toast.error(`Failed to save mappings: ${err.message}`);
    },
  });
}

export function useSaveCRMWritePolicies() {
  const queryClient = useQueryClient();
  const orgId = useActiveOrgId();

  return useMutation({
    mutationFn: async (policies: CRMWritePolicy[]) => {
      if (!orgId) throw new Error('No org ID');
      const rows = policies.map((p) => ({
        ...p,
        org_id: orgId,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase
        .from('crm_write_policies')
        .upsert(rows, { onConflict: 'org_id,crm_object,field_name' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-write-policies'] });
      toast.success('Write policies saved');
    },
    onError: (err: Error) => {
      toast.error(`Failed to save policies: ${err.message}`);
    },
  });
}
