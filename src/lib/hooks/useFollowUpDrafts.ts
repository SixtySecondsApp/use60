/**
 * useFollowUpDrafts — FU-001
 * Fetches follow-up drafts from follow_up_drafts table.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

export interface FollowUpDraft {
  id: string;
  org_id: string;
  user_id: string;
  meeting_id: string | null;
  to_email: string;
  to_name: string | null;
  subject: string;
  body: string;
  edited_body: string | null;
  status: 'pending' | 'editing' | 'approved' | 'scheduled' | 'sent' | 'rejected' | 'expired';
  buying_signals: Record<string, unknown>[] | null;
  generated_at: string;
  approved_at: string | null;
  sent_at: string | null;
  rejected_at: string | null;
  expires_at: string | null;
  scheduled_email_id: string | null;
  created_at: string;
  updated_at: string;
}

interface UseFollowUpDraftsOptions {
  orgId?: string;
  userId?: string;
  status?: string;
}

interface UseFollowUpDraftsReturn {
  drafts: FollowUpDraft[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  updateDraftStatus: (
    draftId: string,
    status: FollowUpDraft['status'],
    extra?: Partial<FollowUpDraft>
  ) => Promise<boolean>;
}

export function useFollowUpDrafts({
  orgId,
  userId,
  status,
}: UseFollowUpDraftsOptions): UseFollowUpDraftsReturn {
  const [drafts, setDrafts] = useState<FollowUpDraft[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!orgId || !userId) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    async function load() {
      try {
        let query = supabase
          .from('follow_up_drafts')
          .select(
            'id, org_id, user_id, meeting_id, to_email, to_name, subject, body, edited_body, status, buying_signals, generated_at, approved_at, sent_at, rejected_at, expires_at, scheduled_email_id, created_at, updated_at'
          )
          .eq('org_id', orgId)
          .order('generated_at', { ascending: false });

        if (status) {
          query = query.eq('status', status);
        }

        const { data, error: fetchError } = await query;

        if (cancelled) return;
        if (fetchError) {
          setError(fetchError.message);
          return;
        }
        setDrafts((data as FollowUpDraft[]) ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load drafts');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [orgId, userId, status, tick]);

  const updateDraftStatus = useCallback(
    async (
      draftId: string,
      newStatus: FollowUpDraft['status'],
      extra: Partial<FollowUpDraft> = {}
    ): Promise<boolean> => {
      const now = new Date().toISOString();
      const updates: Partial<FollowUpDraft> = { status: newStatus, ...extra };

      if (newStatus === 'approved') updates.approved_at = now;
      if (newStatus === 'rejected') updates.rejected_at = now;
      if (newStatus === 'sent') updates.sent_at = now;

      const { error: updateError } = await supabase
        .from('follow_up_drafts')
        .update(updates)
        .eq('id', draftId);

      if (updateError) {
        toast.error(`Failed to update draft: ${updateError.message}`);
        return false;
      }

      // Optimistic update
      setDrafts((prev) =>
        prev.map((d) => (d.id === draftId ? { ...d, ...updates } : d))
      );

      return true;
    },
    []
  );

  return { drafts, isLoading, error, refetch, updateDraftStatus };
}
