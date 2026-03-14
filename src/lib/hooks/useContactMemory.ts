/**
 * useContactMemory — React Query hooks for the Contact Memory tab (TRINITY-012)
 *
 * Fetches contact_memory rows filtered by org_id, ordered by relationship_strength DESC.
 * Optionally fetches a single contact's full memory + related copilot_memories.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgStore } from '@/lib/stores/orgStore';

// ============================================================================
// Cache keys
// ============================================================================

export const CONTACT_MEMORY_KEY = 'contact-memory' as const;
export const CONTACT_MEMORY_DETAIL_KEY = 'contact-memory-detail' as const;
export const CONTACT_MEMORY_RELATED_MEMORIES_KEY = 'contact-memory-related' as const;
export const CONTACT_MEMORY_NAMES_KEY = 'contact-memory-names' as const;

// ============================================================================
// Types
// ============================================================================

export interface ContactMemoryRow {
  id: string;
  org_id: string;
  contact_id: string;
  communication_style: Record<string, unknown>;
  decision_style: Record<string, unknown>;
  interests: unknown[];
  buying_role_history: unknown[];
  relationship_strength: number;
  total_meetings: number;
  total_emails_sent: number;
  total_emails_received: number;
  last_interaction_at: string | null;
  avg_response_time_hours: number | null;
  summary: string | null;
  summary_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactNameInfo {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  title: string | null;
}

export interface RelatedCopilotMemory {
  id: string;
  category: string;
  subject: string;
  content: string;
  confidence: number;
  decay_score: number;
  created_at: string;
}

// ============================================================================
// Query hooks
// ============================================================================

/**
 * Fetch all contact_memory rows for the current org, ordered by relationship_strength DESC.
 */
export function useContactMemoryList() {
  const activeOrgId = useOrgStore((s) => s.activeOrgId);

  return useQuery<ContactMemoryRow[]>({
    queryKey: [CONTACT_MEMORY_KEY, activeOrgId],
    queryFn: async () => {
      if (!activeOrgId) return [];

      const { data, error } = await supabase
        .from('contact_memory')
        .select(
          'id, org_id, contact_id, communication_style, decision_style, interests, buying_role_history, relationship_strength, total_meetings, total_emails_sent, total_emails_received, last_interaction_at, avg_response_time_hours, summary, summary_updated_at, created_at, updated_at'
        )
        .eq('org_id', activeOrgId)
        .order('relationship_strength', { ascending: false })
        .limit(200);

      if (error) throw error;
      return (data ?? []) as ContactMemoryRow[];
    },
    enabled: !!activeOrgId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Fetch contact names for a list of contact_ids.
 * Since contact_memory.contact_id is TEXT (not a UUID FK), we query contacts separately.
 */
export function useContactNames(contactIds: string[]) {
  const activeOrgId = useOrgStore((s) => s.activeOrgId);

  return useQuery<Record<string, ContactNameInfo>>({
    queryKey: [CONTACT_MEMORY_NAMES_KEY, activeOrgId, contactIds],
    queryFn: async () => {
      if (!activeOrgId || contactIds.length === 0) return {};

      const { data, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email, title')
        .in('id', contactIds)
        .limit(200);

      if (error) throw error;
      if (!data) return {};

      const nameMap: Record<string, ContactNameInfo> = {};
      for (const c of data) {
        nameMap[c.id] = c as ContactNameInfo;
      }
      return nameMap;
    },
    enabled: !!activeOrgId && contactIds.length > 0,
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Fetch a single contact's full memory by contactId.
 */
export function useContactMemoryDetail(contactId: string | null) {
  const activeOrgId = useOrgStore((s) => s.activeOrgId);

  return useQuery<ContactMemoryRow | null>({
    queryKey: [CONTACT_MEMORY_DETAIL_KEY, activeOrgId, contactId],
    queryFn: async () => {
      if (!activeOrgId || !contactId) return null;

      const { data, error } = await supabase
        .from('contact_memory')
        .select(
          'id, org_id, contact_id, communication_style, decision_style, interests, buying_role_history, relationship_strength, total_meetings, total_emails_sent, total_emails_received, last_interaction_at, avg_response_time_hours, summary, summary_updated_at, created_at, updated_at'
        )
        .eq('org_id', activeOrgId)
        .eq('contact_id', contactId)
        .maybeSingle();

      if (error) throw error;
      return (data as ContactMemoryRow) ?? null;
    },
    enabled: !!activeOrgId && !!contactId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch related copilot_memories for a specific contact.
 */
export function useContactRelatedMemories(contactId: string | null) {
  const activeOrgId = useOrgStore((s) => s.activeOrgId);

  return useQuery<RelatedCopilotMemory[]>({
    queryKey: [CONTACT_MEMORY_RELATED_MEMORIES_KEY, activeOrgId, contactId],
    queryFn: async () => {
      if (!activeOrgId || !contactId) return [];

      const { data, error } = await supabase
        .from('copilot_memories')
        .select(
          'id, category, subject, content, confidence, decay_score, created_at'
        )
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data ?? []) as RelatedCopilotMemory[];
    },
    enabled: !!activeOrgId && !!contactId,
    staleTime: 5 * 60 * 1000,
  });
}
