/**
 * useStakeholders Hook
 *
 * Manages deal stakeholders (buying committee members) for a deal.
 * Part of PRD-121: Stakeholder Mapping & Buying Committee.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgStore } from '@/lib/stores/orgStore';
import { toast } from 'sonner';
import type {
  DealStakeholder,
  DealStakeholderWithContact,
  CreateStakeholderPayload,
  UpdateStakeholderPayload,
} from '@/lib/types/stakeholder';

// ============================================================================
// useStakeholders
// ============================================================================

/**
 * Hook to manage stakeholders for a specific deal.
 *
 * Fetches stakeholders with their contact info, and provides
 * add/update/remove operations with optimistic updates.
 */
export function useStakeholders(dealId: string | null) {
  const activeOrgId = useOrgStore((state) => state.activeOrgId);
  const [stakeholders, setStakeholders] = useState<DealStakeholderWithContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStakeholders = useCallback(async () => {
    if (!dealId) {
      setStakeholders([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: queryError } = await supabase
        .from('deal_stakeholders')
        .select(`
          id,
          deal_id,
          contact_id,
          org_id,
          role,
          influence,
          sentiment_score,
          engagement_status,
          days_since_last_contact,
          meeting_count,
          email_count,
          last_contacted_at,
          auto_detected,
          source_meeting_id,
          confidence_score,
          needs_review,
          notes,
          created_at,
          updated_at,
          contact:contacts(
            id,
            first_name,
            last_name,
            email,
            title,
            company,
            avatar_url
          )
        `)
        .eq('deal_id', dealId)
        .order('created_at', { ascending: true });

      if (queryError) throw queryError;

      setStakeholders((data as DealStakeholderWithContact[]) || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch stakeholders';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  // Add a stakeholder to the deal
  const addStakeholder = useCallback(
    async (contactId: string, role = 'unknown' as DealStakeholder['role']) => {
      if (!dealId || !activeOrgId) return null;

      const payload: CreateStakeholderPayload = {
        deal_id: dealId,
        contact_id: contactId,
        org_id: activeOrgId,
        role,
      };

      try {
        const { data, error: insertError } = await supabase
          .from('deal_stakeholders')
          .insert(payload)
          .select(`
            id,
            deal_id,
            contact_id,
            org_id,
            role,
            influence,
            sentiment_score,
            engagement_status,
            days_since_last_contact,
            meeting_count,
            email_count,
            last_contacted_at,
            auto_detected,
            source_meeting_id,
            confidence_score,
            needs_review,
            notes,
            created_at,
            updated_at,
            contact:contacts(
              id,
              first_name,
              last_name,
              email,
              title,
              company,
              avatar_url
            )
          `)
          .single();

        if (insertError) throw insertError;

        setStakeholders((prev) => [...prev, data as DealStakeholderWithContact]);
        toast.success('Stakeholder added to buying committee');
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to add stakeholder';
        toast.error(message);
        return null;
      }
    },
    [dealId, activeOrgId],
  );

  // Update a stakeholder's role, influence, sentiment, or notes
  const updateStakeholder = useCallback(
    async (stakeholderId: string, updates: UpdateStakeholderPayload) => {
      // Optimistic update
      setStakeholders((prev) =>
        prev.map((s) => (s.id === stakeholderId ? { ...s, ...updates } : s)),
      );

      try {
        const { error: updateError } = await supabase
          .from('deal_stakeholders')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', stakeholderId);

        if (updateError) throw updateError;

        return true;
      } catch (err) {
        // Revert on error
        await fetchStakeholders();
        toast.error('Failed to update stakeholder');
        return false;
      }
    },
    [fetchStakeholders],
  );

  // Remove a stakeholder from the deal
  const removeStakeholder = useCallback(
    async (stakeholderId: string) => {
      // Optimistic remove
      setStakeholders((prev) => prev.filter((s) => s.id !== stakeholderId));

      try {
        const { error: deleteError } = await supabase
          .from('deal_stakeholders')
          .delete()
          .eq('id', stakeholderId);

        if (deleteError) throw deleteError;

        toast.success('Stakeholder removed');
        return true;
      } catch (err) {
        await fetchStakeholders();
        toast.error('Failed to remove stakeholder');
        return false;
      }
    },
    [fetchStakeholders],
  );

  // Auto-populate from meeting attendees
  const autoPopulateFromMeeting = useCallback(
    async (meetingId: string) => {
      if (!dealId) return null;

      try {
        const { data, error: funcError } = await supabase.functions.invoke(
          'auto-populate-stakeholders',
          { body: { dealId, meetingId } },
        );

        if (funcError) throw funcError;

        if (data?.success) {
          await fetchStakeholders();
          toast.success(`${data.added} stakeholder(s) auto-populated from meeting attendees`);
        }

        return data;
      } catch (err) {
        toast.error('Failed to auto-populate stakeholders');
        return null;
      }
    },
    [dealId, fetchStakeholders],
  );

  // Recalculate engagement statuses for the deal
  const recalculateEngagement = useCallback(async () => {
    if (!dealId) return null;

    try {
      const { data, error: funcError } = await supabase.functions.invoke(
        'calculate-stakeholder-engagement',
        { body: { dealId } },
      );

      if (funcError) throw funcError;

      if (data?.success) {
        await fetchStakeholders();
        toast.success('Engagement statuses updated');
      }

      return data;
    } catch (err) {
      toast.error('Failed to recalculate engagement');
      return null;
    }
  }, [dealId, fetchStakeholders]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!dealId) return;

    fetchStakeholders();

    const channel = supabase
      .channel(`deal_stakeholders:${dealId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deal_stakeholders',
          filter: `deal_id=eq.${dealId}`,
        },
        () => {
          fetchStakeholders();
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [dealId, fetchStakeholders]);

  return {
    stakeholders,
    loading,
    error,
    refresh: fetchStakeholders,
    addStakeholder,
    updateStakeholder,
    removeStakeholder,
    autoPopulateFromMeeting,
    recalculateEngagement,
    // Convenience getters
    committeeSize: stakeholders.length,
    hasEconomicBuyer: stakeholders.some((s) => s.role === 'economic_buyer'),
    hasChampion: stakeholders.some((s) => s.role === 'champion'),
    hasBlocker: stakeholders.some((s) => s.role === 'blocker'),
    needsReviewCount: stakeholders.filter((s) => s.needs_review).length,
    activeCount: stakeholders.filter((s) => s.engagement_status === 'active').length,
    coldCount: stakeholders.filter((s) => s.engagement_status === 'cold').length,
  };
}
