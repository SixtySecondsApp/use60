import { useEffect, useImperativeHandle, useRef, useState } from 'react';

import ProposalProgressOverlay from '@/components/proposals/ProposalProgressOverlay';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

export interface ProposalQuickGenerateHandle {
  trigger: () => void;
}

interface ProposalQuickGenerateProps {
  meetingId: string;
  dealId?: string | null;
  contactId?: string | null;
  hasRecording: boolean;
  hasNotes: boolean;
  onProposalStarted?: (proposalId: string) => void;
  onCustomise?: () => void;
  triggerRef?: React.Ref<ProposalQuickGenerateHandle>;
}

export function ProposalQuickGenerate({
  meetingId,
  dealId,
  contactId,
  hasRecording,
  hasNotes,
  onProposalStarted,
  onCustomise,
  triggerRef,
}: ProposalQuickGenerateProps) {
  const [loading, setLoading] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null);
  const { userId } = useAuth();
  const orgId = useActiveOrgId();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const isDisabled = !hasRecording && !hasNotes;

  useEffect(() => {
    if (!activeProposalId) return;

    const channel = supabase
      .channel(`pqg-progress-${activeProposalId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'proposals',
          filter: `id=eq.${activeProposalId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const next = payload.new;
          if (next.generation_status === 'failed') {
            toast.error('Proposal generation failed');
          }
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [activeProposalId]);

  const handleGenerate = async () => {
    if (!userId || !orgId) {
      toast.error('Unable to generate proposal - missing user or org context');
      return;
    }

    setLoading(true);
    try {
      const { data: newRow, error: insertErr } = await supabase
        .from('proposals')
        .insert({
          org_id: orgId,
          user_id: userId,
          deal_id: dealId ?? null,
          meeting_id: meetingId,
          contact_id: contactId ?? null,
          type: 'proposal',
          content: '',
          title: 'Proposal',
          trigger_type: 'manual_button',
          generation_status: 'assembling',
          status: 'draft',
          pipeline_version: 2,
        })
        .select('id')
        .single();

      if (insertErr || !newRow?.id) {
        console.error('[ProposalQuickGenerate] Failed to create proposal row:', insertErr?.message);
        toast.error('Failed to start proposal generation');
        return;
      }

      const proposalId = newRow.id;

      setActiveProposalId(proposalId);
      setOverlayOpen(true);
      setLoading(false);
      onProposalStarted?.(proposalId);

      void (async () => {
        try {
          const { error } = await supabase.functions.invoke('run-skill', {
            body: {
              skill_key: 'generate-proposal-v2',
              context: {
                proposal_id: proposalId,
                meeting_id: meetingId,
                deal_id: dealId ?? undefined,
                contact_id: contactId ?? undefined,
                trigger_type: 'manual_button',
                org_id: orgId,
              },
            },
          });

          if (error) {
            console.error('[ProposalQuickGenerate] run-skill error:', error.message);
          }
        } catch (err) {
          console.error('[ProposalQuickGenerate] run-skill invocation failed:', err);
        }
      })();
    } catch (err) {
      console.error('[ProposalQuickGenerate] Unexpected error:', err);
      toast.error('Something went wrong starting proposal generation');
    } finally {
      setLoading(false);
    }
  };

  useImperativeHandle(triggerRef, () => ({ trigger: handleGenerate }), [handleGenerate]);

  // Headless — the QuickActionsCard triggers generation via the imperative handle.
  // Only render the progress overlay modal.
  return activeProposalId ? (
    <ProposalProgressOverlay
      proposalId={activeProposalId}
      open={overlayOpen}
      onOpenChange={setOverlayOpen}
      onCustomise={onCustomise}
    />
  ) : null;
}

export default ProposalQuickGenerate;
