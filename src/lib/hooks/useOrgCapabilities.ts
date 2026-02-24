/**
 * useOrgCapabilities Hook
 *
 * Fetches capability status for an organization (CRM, Calendar, Email, Meetings, Messaging)
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase/clientV2';

export type Capability = 'crm' | 'calendar' | 'email' | 'meetings' | 'messaging' | 'tasks';

export interface CapabilityStatus {
  capability: Capability;
  available: boolean;
  provider?: string;
  features?: string[];
}

interface CapabilitiesResponse {
  success: boolean;
  capabilities: CapabilityStatus[];
  error?: string;
}

const QUERY_KEYS = {
  capabilities: (orgId: string) => ['org-capabilities', orgId] as const,
};

/**
 * Fetch capabilities for an organization
 */
export function useOrgCapabilities(organizationId: string | null) {
  return useQuery({
    queryKey: organizationId ? QUERY_KEYS.capabilities(organizationId) : ['org-capabilities', 'null'],
    queryFn: async (): Promise<CapabilityStatus[]> => {
      if (!organizationId) return [];

      const { data, error } = await supabase.functions.invoke<CapabilitiesResponse>(
        'check-org-capabilities',
        {
          body: {
            organization_id: organizationId,
          },
        }
      );

      if (error) {
        throw new Error(error.message || 'Failed to fetch capabilities');
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to fetch capabilities');
      }

      return data.capabilities || [];
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
