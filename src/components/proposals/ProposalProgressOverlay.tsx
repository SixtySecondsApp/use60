/**
 * ProposalProgressOverlay — UX-002
 *
 * Modal overlay with a 5-stage vertical progress stepper that tracks
 * proposal generation via Supabase Realtime. Shows a polished completion
 * view with PDF actions when the pipeline finishes, or an error state
 * if it fails.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  FileText,
  Download,
  Pencil,
  Send,
  Coins,
  Search,
  BrainCircuit,
  Paintbrush,
  FileOutput,
  PackageCheck,
  Clock,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProposalProgressOverlayProps {
  proposalId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditSections?: (proposalId: string) => void;
  onSendToClient?: (proposalId: string) => void;
}

type PipelineStatus =
  | 'assembling'
  | 'context_assembled'
  | 'composing'
  | 'composed'
  | 'rendering'
  | 'rendered'
  | 'delivering'
  | 'ready'
  | 'failed';

type StageState = 'pending' | 'active' | 'complete' | 'failed';

interface StageDefinition {
  label: string;
  description: string;
  icon: React.ElementType;
}

interface ProposalRow {
  id: string;
  title: string | null;
  generation_status: PipelineStatus | null;
  pdf_url: string | null;
  credits_used: number | null;
  metadata: Record<string, unknown> | null;
  brand_config: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STAGES: StageDefinition[] = [
  {
    label: 'Context Assembly',
    description: 'Gathering deal context, meeting notes, and company data...',
    icon: Search,
  },
  {
    label: 'AI Composition',
    description: 'Writing proposal sections with your style preferences...',
    icon: BrainCircuit,
  },
  {
    label: 'Template Merge',
    description: 'Applying your brand template and formatting...',
    icon: Paintbrush,
  },
  {
    label: 'PDF Rendering',
    description: 'Generating pixel-perfect PDF via Gotenberg...',
    icon: FileOutput,
  },
  {
    label: 'Delivery',
    description: 'Preparing download and notifications...',
    icon: PackageCheck,
  },
];

/**
 * Map a pipeline status to the zero-based active stage index.
 */
function getActiveStageIndex(status: PipelineStatus | null): number {
  switch (status) {
    case 'assembling':
      return 0;
    case 'context_assembled':
    case 'composing':
      return 1;
    case 'composed':
    case 'rendering':
      return 2;
    case 'rendered':
      return 3;
    case 'delivering':
      return 4;
    case 'ready':
      return 5; // past all stages
    default:
      return -1;
  }
}

/**
 * Determine the visual state for a given stage index.
 */
function getStageState(
  stageIndex: number,
  currentStatus: PipelineStatus | null,
  isFailed: boolean,
): StageState {
  if (!currentStatus) return 'pending';

  const activeIdx = getActiveStageIndex(currentStatus);

  if (isFailed && stageIndex === activeIdx) return 'failed';
  if (stageIndex < activeIdx) return 'complete';
  if (stageIndex === activeIdx) return 'active';
  return 'pending';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProposalProgressOverlay({
  proposalId,
  open,
  onOpenChange,
  onEditSections,
  onSendToClient,
}: ProposalProgressOverlayProps) {
  const [proposal, setProposal] = useState<ProposalRow | null>(null);
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(null);

  // -------------------------------------------------------------------
  // Track elapsed time
  // -------------------------------------------------------------------
  useEffect(() => {
    if (open && !startTimeRef.current) {
      startTimeRef.current = Date.now();
    }
    if (!open) {
      startTimeRef.current = null;
      setElapsedSeconds(null);
    }
  }, [open]);

  // Calculate elapsed when pipeline reaches 'ready'
  useEffect(() => {
    if (status === 'ready' && startTimeRef.current) {
      const seconds = Math.round((Date.now() - startTimeRef.current) / 1000);
      setElapsedSeconds(seconds);
    }
  }, [status]);

  // -------------------------------------------------------------------
  // Fetch initial proposal state
  // -------------------------------------------------------------------
  const fetchProposal = useCallback(async () => {
    const { data, error: fetchErr } = await supabase
      .from('proposals')
      .select('id, title, generation_status, pdf_url, credits_used, metadata, brand_config, created_at, updated_at')
      .eq('id', proposalId)
      .maybeSingle();

    if (fetchErr) {
      setError(fetchErr.message);
      return;
    }

    if (data) {
      const row = data as unknown as ProposalRow;
      setProposal(row);
      setStatus(row.generation_status);

      if (row.generation_status === 'failed') {
        const pipelineError =
          (row.metadata as Record<string, unknown> | null)?._pipeline_error as string | undefined;
        setError(pipelineError || 'Proposal generation failed. Please try again.');
      }
    }
  }, [proposalId]);

  // -------------------------------------------------------------------
  // Realtime subscription
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!open) return;

    fetchProposal();

    const channel = supabase
      .channel(`proposal-progress-${proposalId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'proposals',
          filter: `id=eq.${proposalId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const next = payload.new as unknown as ProposalRow;
          setProposal(next);
          setStatus(next.generation_status);

          if (next.generation_status === 'failed') {
            const pipelineError =
              (next.metadata as Record<string, unknown> | null)?._pipeline_error as string | undefined;
            setError(pipelineError || 'Proposal generation failed. Please try again.');
          } else {
            setError(null);
          }
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [open, proposalId, fetchProposal]);

  // Re-fetch full row when status reaches ready (to capture pdf_url etc.)
  useEffect(() => {
    if (status === 'ready') {
      fetchProposal();
    }
  }, [status, fetchProposal]);

  // -------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------
  const isDone = status === 'ready';
  const isFailed = status === 'failed';
  const thumbnailUrl = (proposal?.metadata as Record<string, unknown> | null)?.thumbnail_url as
    | string
    | undefined;

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {isDone ? 'Proposal Ready' : isFailed ? 'Generation Failed' : 'Generating Proposal'}
          </DialogTitle>
          <DialogDescription>
            {isDone
              ? 'Your proposal has been generated and is ready to review.'
              : isFailed
                ? 'Something went wrong during generation.'
                : 'Sit tight — this usually takes under a minute.'}
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {/* ---- Error State ---- */}
          {isFailed && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-col items-center gap-4 py-6"
            >
              {/* Progress stepper showing failure point */}
              <div className="w-full mb-2">
                <ProgressStepper status={status} isFailed />
              </div>

              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/20">
                <AlertCircle className="h-7 w-7 text-red-500 dark:text-red-400" />
              </div>

              <p className="max-w-xs text-center text-sm text-[#64748B] dark:text-gray-400">
                {error}
              </p>

              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </motion.div>
          )}

          {/* ---- Done State ---- */}
          {isDone && (
            <motion.div
              key="done"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-col items-center gap-5 py-4"
            >
              {/* Success icon */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/20"
              >
                <CheckCircle2 className="h-7 w-7 text-emerald-500 dark:text-emerald-400" />
              </motion.div>

              {/* PDF Thumbnail or placeholder */}
              <div className="flex h-36 w-28 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 shadow-sm dark:border-gray-700 dark:bg-gray-800/50 overflow-hidden">
                {thumbnailUrl ? (
                  <img
                    src={thumbnailUrl}
                    alt="Proposal thumbnail"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <FileText className="h-10 w-10 text-[#64748B] dark:text-gray-500" />
                )}
              </div>

              {/* Title */}
              {proposal?.title && (
                <p className="text-sm font-medium text-[#1E293B] dark:text-white text-center max-w-xs truncate">
                  {proposal.title}
                </p>
              )}

              {/* Metadata badges */}
              <div className="flex flex-wrap items-center justify-center gap-2">
                {proposal?.credits_used != null && proposal.credits_used > 0 && (
                  <Badge variant="secondary" className="gap-1">
                    <Coins className="h-3 w-3" />
                    {proposal.credits_used} credit{proposal.credits_used !== 1 ? 's' : ''} used
                  </Badge>
                )}
                {elapsedSeconds != null && (
                  <Badge variant="outline" className="gap-1">
                    <Clock className="h-3 w-3" />
                    Generated in {elapsedSeconds}s
                  </Badge>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex flex-col w-full gap-2 pt-1">
                <Button
                  className="w-full"
                  onClick={() => {
                    if (proposal?.pdf_url) {
                      window.open(proposal.pdf_url, '_blank', 'noopener');
                    }
                  }}
                  disabled={!proposal?.pdf_url}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </Button>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      if (onEditSections) {
                        onEditSections(proposalId);
                      }
                      onOpenChange(false);
                    }}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit Sections
                  </Button>

                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      if (onSendToClient) {
                        onSendToClient(proposalId);
                      }
                      onOpenChange(false);
                    }}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    Send to Client
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ---- Progress State ---- */}
          {!isDone && !isFailed && (
            <motion.div
              key="progress"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-4"
            >
              <ProgressStepper status={status} isFailed={false} />
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// ProgressStepper — vertical stepper with 5 stages
// ---------------------------------------------------------------------------

function ProgressStepper({
  status,
  isFailed,
}: {
  status: PipelineStatus | null;
  isFailed: boolean;
}) {
  return (
    <ol className="relative space-y-1">
      {STAGES.map((stage, idx) => {
        const state = getStageState(idx, status, isFailed);
        const StageIcon = stage.icon;
        const isLast = idx === STAGES.length - 1;

        return (
          <li key={idx} className="flex gap-3">
            {/* Step icon column */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-300',
                  state === 'complete' &&
                    'border-emerald-500 bg-emerald-50 text-emerald-600 dark:border-emerald-400 dark:bg-emerald-900/30 dark:text-emerald-400',
                  state === 'active' &&
                    'border-blue-500 bg-blue-50 text-blue-600 dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-400',
                  state === 'failed' &&
                    'border-red-500 bg-red-50 text-red-600 dark:border-red-400 dark:bg-red-900/30 dark:text-red-400',
                  state === 'pending' &&
                    'border-gray-200 bg-white text-[#94A3B8] dark:border-gray-600 dark:bg-gray-800 dark:text-gray-500',
                )}
              >
                {/* Pulse ring for active stage */}
                {state === 'active' && (
                  <span className="absolute inset-0 animate-ping rounded-full border-2 border-blue-400 opacity-30 dark:border-blue-500" />
                )}

                {state === 'complete' ? (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </motion.div>
                ) : state === 'active' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : state === 'failed' ? (
                  <AlertCircle className="h-4 w-4" />
                ) : (
                  <StageIcon className="h-4 w-4" />
                )}
              </div>

              {/* Connector line */}
              {!isLast && (
                <div
                  className={cn(
                    'mt-1 w-0.5 flex-1 min-h-[8px] transition-colors duration-300',
                    state === 'complete'
                      ? 'bg-emerald-300 dark:bg-emerald-700'
                      : 'bg-gray-200 dark:bg-gray-700',
                  )}
                />
              )}
            </div>

            {/* Step content */}
            <div className="pt-1 pb-3">
              <p
                className={cn(
                  'text-sm font-medium leading-tight transition-colors duration-300',
                  state === 'complete' && 'text-emerald-700 dark:text-emerald-400',
                  state === 'active' && 'text-blue-700 dark:text-blue-400',
                  state === 'failed' && 'text-red-700 dark:text-red-400',
                  state === 'pending' && 'text-[#94A3B8] dark:text-gray-500',
                )}
              >
                {stage.label}
              </p>
              <p
                className={cn(
                  'mt-0.5 text-xs leading-snug transition-colors duration-300',
                  state === 'complete' || state === 'active'
                    ? 'text-[#64748B] dark:text-gray-400'
                    : state === 'failed'
                      ? 'text-red-500/70 dark:text-red-400/70'
                      : 'text-[#CBD5E1] dark:text-gray-600',
                )}
              >
                {stage.description}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
