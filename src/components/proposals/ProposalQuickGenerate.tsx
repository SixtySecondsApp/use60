import { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
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

interface ProposalQuickGenerateProps {
  meetingId: string;
  dealId?: string | null;
  contactId?: string | null;
  hasRecording: boolean;
  hasNotes: boolean;
  onProposalStarted?: (proposalId: string) => void;
}

export function ProposalQuickGenerate({
  meetingId,
  dealId,
  contactId,
  hasRecording,
  hasNotes,
  onProposalStarted,
}: ProposalQuickGenerateProps) {
  const [loading, setLoading] = useState(false);
  const { userId } = useAuth();
  const orgId = useActiveOrgId();

  const isDisabled = !hasRecording && !hasNotes;

  const handleGenerate = async () => {
    if (!userId || !orgId) {
      toast.error('Unable to generate proposal — missing user or org context');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('proposal-pipeline-v2', {
        body: {
          meeting_id: meetingId,
          deal_id: dealId ?? undefined,
          contact_id: contactId ?? undefined,
          trigger_type: 'manual_button',
          user_id: userId,
          org_id: orgId,
        },
      });

      if (error) {
        console.error('[ProposalQuickGenerate] Edge function error:', error);
        toast.error('Failed to start proposal generation');
        return;
      }

      if (data?.proposal_id) {
        toast.success('Proposal generation started');
        onProposalStarted?.(data.proposal_id);
      } else {
        toast.error('Proposal generation failed — no proposal ID returned');
      }
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
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0}>{button}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          No meeting data available yet
        </TooltipContent>
      </Tooltip>
    );
  }

  return button;
}
