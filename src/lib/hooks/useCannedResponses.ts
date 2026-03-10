import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

export interface CannedResponse {
  id: string;
  org_id: string | null;
  title: string;
  content: string;
  category: string | null;
  shortcut: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateCannedResponsePayload {
  org_id?: string | null;
  title: string;
  content: string;
  category?: string | null;
  shortcut?: string | null;
}

export interface UpdateCannedResponsePayload {
  id: string;
  title?: string;
  content?: string;
  category?: string | null;
  shortcut?: string | null;
}

const CANNED_RESPONSES_KEY = ['canned-responses'];

const COLUMNS = 'id, org_id, title, content, category, shortcut, created_by, created_at, updated_at';

/**
 * Fetches canned responses visible to the current user.
 * Platform admins see all; org admins see global + their org's responses.
 * Optionally filter by category.
 */
export function useCannedResponses(category?: string) {
  return useQuery({
    queryKey: category ? [...CANNED_RESPONSES_KEY, category] : CANNED_RESPONSES_KEY,
    queryFn: async () => {
      let query = supabase
        .from('support_canned_responses')
        .select(COLUMNS)
        .order('title', { ascending: true });

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as CannedResponse[];
    },
  });
}

/**
 * Creates a new canned response.
 * Platform admins can create global (org_id = null) or org-specific.
 * Org admins can only create for their own org.
 */
export function useCreateCannedResponse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateCannedResponsePayload) => {
      const { data, error } = await supabase
        .from('support_canned_responses')
        .insert({
          org_id: payload.org_id ?? null,
          title: payload.title,
          content: payload.content,
          category: payload.category ?? null,
          shortcut: payload.shortcut ?? null,
          created_by: (await supabase.auth.getUser()).data.user!.id,
        })
        .select(COLUMNS)
        .single();

      if (error) throw error;
      return data as CannedResponse;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: CANNED_RESPONSES_KEY });
      toast.success('Canned response created', { description: data.title });
    },
    onError: (error: Error) => {
      toast.error('Failed to create canned response', { description: error.message });
    },
  });
}

/**
 * Updates an existing canned response.
 */
export function useUpdateCannedResponse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UpdateCannedResponsePayload) => {
      const { id, ...updates } = payload;

      const { data, error } = await supabase
        .from('support_canned_responses')
        .update(updates)
        .eq('id', id)
        .select(COLUMNS)
        .single();

      if (error) throw error;
      return data as CannedResponse;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: CANNED_RESPONSES_KEY });
      toast.success('Canned response updated', { description: data.title });
    },
    onError: (error: Error) => {
      toast.error('Failed to update canned response', { description: error.message });
    },
  });
}

/**
 * Deletes a canned response by ID.
 */
export function useDeleteCannedResponse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('support_canned_responses')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CANNED_RESPONSES_KEY });
      toast.success('Canned response deleted');
    },
    onError: (error: Error) => {
      toast.error('Failed to delete canned response', { description: error.message });
    },
  });
}
