import { useState, useEffect, useRef } from 'react';
import { FileText, Loader2, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { toast } from 'sonner';
import ProposalProgressOverlay from '@/components/proposals/ProposalProgressOverlay';

interface ProposalQuickGenerateProps {
  meetingId: string;
  dealId?: string | null;
  contactId?: string | null;
  hasRecording: boolean;
  hasNotes: boolean;
  onProposalStarted?: (proposalId: string) => void;
  onCustomise?: () => void;
}

export function ProposalQuickGenerate({
  meetingId,
  dealId,
  contactId,
  hasRecording,
  hasNotes,
  onProposalStarted,
  onCustomise,
}: ProposalQuickGenerateProps) {
  const [loading, setLoading] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null);
  const { userId } = useAuth();
  const orgId = useActiveOrgId();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const isDisabled = !hasRecording && !hasNotes;

  // -------------------------------------------------------------------
  // Realtime subscription — tracks generation_status on created proposal
  // -------------------------------------------------------------------
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
      toast.error('Unable to generate proposal — missing user or org context');
      return;
    }

    setLoading(true);
    try {
      // 1. Create the proposal row immediately so we have an ID for the overlay
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

      // 2. Open the overlay immediately — user sees the stepper right away
      setActiveProposalId(proposalId);
      setOverlayOpen(true);
      setLoading(false);
      onProposalStarted?.(proposalId);

      // 3. Fire the /proposal skill in the background via run-skill
      //    Routes through executeAction → generate-proposal-v2 → proposal-pipeline-v2
      supabase.functions.invoke('run-skill', {
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
      }).then(({ error }) => {
        if (error) {
          console.error('[ProposalQuickGenerate] run-skill error:', error.message);
          // The overlay's realtime subscription will pick up the 'failed' status
        }
      }).catch((err) => {
        console.error('[ProposalQuickGenerate] run-skill invocation failed:', err);
      });
    } catch (err) {
      console.error('[ProposalQuickGenerate] Unexpected error:', err);
      toast.error('Something went wrong starting proposal generation');
    } finally {
      setLoading(false);
    }
  };

  const button = (
    <Button
      size="sm"
      variant="default"
      disabled={isDisabled || loading}
      onClick={handleGenerate}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <FileText className="h-4 w-4 mr-2" />
      )}
      Generate Proposal
    </Button>
  );

  if (isDisabled) {
    return (
      <>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>{button}</span>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              No meeting data available yet
            </TooltipContent>
          </Tooltip>
          {onCustomise && (
            <button
              type="button"
              onClick={onCustomise}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <Settings2 className="h-3 w-3" />
              Customise
            </button>
          )}
        </div>
        {activeProposalId && (
          <ProposalProgressOverlay
            proposalId={activeProposalId}
            open={overlayOpen}
            onOpenChange={setOverlayOpen}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {button}
        {onCustomise && (
          <button
            type="button"
            onClick={onCustomise}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <Settings2 className="h-3 w-3" />
            Customise
          </button>
        )}
      </div>

      {activeProposalId && (
        <ProposalProgressOverlay
          proposalId={activeProposalId}
          open={overlayOpen}
          onOpenChange={setOverlayOpen}
        />
      )}
    </>
  );
}
