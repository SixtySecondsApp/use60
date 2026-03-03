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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
  Save,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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
  style_config: Record<string, unknown> | null;
  trigger_type: string | null;
  created_at: string | null;
  updated_at: string | null;
  rendered_html: string | null;
}

interface EditableSection {
  type: string;
  title: string;
  content: string;
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
  // onEditSections kept in interface for backward compat; inline edit mode (UX-006) now handles editing
  onEditSections: _onEditSections,
  onSendToClient,
}: ProposalProgressOverlayProps) {
  void _onEditSections;
  const [proposal, setProposal] = useState<ProposalRow | null>(null);
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(null);

  // Edit mode state (UX-006)
  const [editMode, setEditMode] = useState(false);
  const [editingSections, setEditingSections] = useState<EditableSection[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

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
      .select('id, title, generation_status, pdf_url, credits_used, metadata, brand_config, style_config, trigger_type, created_at, updated_at, rendered_html')
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
  // Edit mode handlers (UX-006)
  // -------------------------------------------------------------------
  const handleEnterEditMode = useCallback(async () => {
    setEditLoading(true);
    try {
      const { data, error: fetchErr } = await supabase
        .from('proposals')
        .select('sections')
        .eq('id', proposalId)
        .maybeSingle();

      if (fetchErr) {
        toast.error('Failed to load proposal sections');
        console.error('[ProposalProgressOverlay] Edit fetch error:', fetchErr);
        return;
      }

      const sections = data?.sections as EditableSection[] | null;
      if (!sections || !Array.isArray(sections) || sections.length === 0) {
        toast.error('No editable sections found in this proposal');
        return;
      }

      setEditingSections(sections.map((s) => ({ ...s })));
      setEditMode(true);
    } catch (err) {
      console.error('[ProposalProgressOverlay] Unexpected edit error:', err);
      toast.error('Something went wrong loading sections');
    } finally {
      setEditLoading(false);
    }
  }, [proposalId]);

  const handleSaveAndRerender = useCallback(async () => {
    setSaveLoading(true);
    try {
      // 1. Save edited sections and set status to 'rendering'
      const { error: updateErr } = await supabase
        .from('proposals')
        .update({
          sections: editingSections,
          generation_status: 'rendering',
          updated_at: new Date().toISOString(),
        })
        .eq('id', proposalId);

      if (updateErr) {
        toast.error('Failed to save sections');
        console.error('[ProposalProgressOverlay] Save error:', updateErr);
        return;
      }

      // Reset timer for re-render duration tracking
      startTimeRef.current = Date.now();
      setElapsedSeconds(null);

      // Update local status so the stepper shows rendering progress
      setStatus('rendering');
      setEditMode(false);

      // 2. Invoke Gotenberg render (stages 3-4 only — skip assemble + compose)
      const { data: renderData, error: renderErr } = await supabase.functions.invoke(
        'proposal-render-gotenberg',
        { body: { proposal_id: proposalId } },
      );

      if (renderErr) {
        toast.error('Failed to start re-render');
        console.error('[ProposalProgressOverlay] Render invoke error:', renderErr);
        return;
      }

      // 3. Set generation_status to 'ready' (pipeline orchestrator does this
      //    normally, but for re-render we skip the full pipeline)
      const pdfUrl = typeof renderData?.pdf_url === 'string' ? renderData.pdf_url : null;
      const { error: readyErr } = await supabase
        .from('proposals')
        .update({
          generation_status: 'ready',
          ...(pdfUrl ? { pdf_url: pdfUrl } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', proposalId);

      if (readyErr) {
        console.error('[ProposalProgressOverlay] Failed to set ready status:', readyErr);
      }

      toast.success('Sections saved — PDF re-rendered');
    } catch (err) {
      console.error('[ProposalProgressOverlay] Unexpected save error:', err);
      toast.error('Something went wrong saving sections');
    } finally {
      setSaveLoading(false);
    }
  }, [proposalId, editingSections]);

  const handleCancelEdit = useCallback(() => {
    setEditMode(false);
    setEditingSections([]);
  }, []);

  const updateSection = useCallback(
    (index: number, field: 'title' | 'content', value: string) => {
      setEditingSections((prev) =>
        prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
      );
    },
    [],
  );

  // -------------------------------------------------------------------
  // AUT-002: Record autopilot signal when proposal is sent
  // -------------------------------------------------------------------
  const recordSendSignal = useCallback(async (currentProposal: ProposalRow) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return;

      const editMetrics = (currentProposal.style_config as Record<string, unknown> | null)
        ?._edit_metrics as Record<string, unknown> | undefined;
      const editDistance = typeof editMetrics?.overall_distance === 'number'
        ? editMetrics.overall_distance
        : 0;

      // Determine signal and weight based on edit distance
      let signal: string;
      if (editDistance === 0) {
        signal = 'approved';      // sent as-is — strong positive
      } else if (editDistance < 0.2) {
        signal = 'approved_edited'; // minor edits — weak positive
      } else {
        signal = 'approved_edited'; // major edits — still approved_edited, lower weight handled by edit_distance
      }

      await supabase.functions.invoke('autopilot-record-signal', {
        method: 'POST',
        body: {
          action_type: 'proposal.generate',
          agent_name: 'proposal_pipeline',
          signal,
          edit_distance: editDistance,
          autonomy_tier_at_time: 'suggest',
        },
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      // Fire-and-forget — do not surface errors to user
      console.error('[ProposalProgressOverlay] recordSendSignal error:', err);
    }
  }, []);

  // -------------------------------------------------------------------
  // Realtime subscription + polling fallback
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

    // Polling fallback — catches updates if Realtime is flaky
    const pollInterval = setInterval(() => {
      fetchProposal();
    }, 3000);

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      clearInterval(pollInterval);
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

  // Thumbnail is written to brand_config by proposal-render-gotenberg; fall back to metadata
  const thumbnailUrl =
    ((proposal?.brand_config as Record<string, unknown> | null)?.thumbnail_url as string | undefined) ||
    ((proposal?.metadata as Record<string, unknown> | null)?.thumbnail_url as string | undefined);

  // -------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------
  const dialogTitle = editMode
    ? 'Edit Proposal Sections'
    : isDone
      ? 'Proposal Ready'
      : isFailed
        ? 'Generation Failed'
        : 'Generating Proposal';

  const dialogDescription = editMode
    ? 'Edit section titles and content below, then save to re-render the PDF.'
    : isDone
      ? 'Your proposal has been generated and is ready to review.'
      : isFailed
        ? 'Something went wrong during generation.'
        : 'Sit tight — this usually takes under a minute.';

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
        'max-h-[90vh] flex flex-col overflow-hidden',
        editMode ? 'sm:max-w-lg' : 'sm:max-w-4xl',
      )}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {editMode ? <Pencil className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
            {dialogTitle}
          </DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {/* ---- Edit Mode ---- */}
          {editMode && (
            <motion.div
              key="edit"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-col gap-4 py-2 flex-1 min-h-0"
            >
              <div className="flex-1 min-h-0 overflow-y-auto pr-3 space-y-4">
                {editingSections.map((section, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-gray-200 bg-gray-50/50 p-3 dark:border-gray-700 dark:bg-gray-800/30"
                  >
                    <div className="mb-1">
                      <Badge variant="outline" className="text-xs mb-2">
                        {section.type}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <Label htmlFor={`section-title-${idx}`} className="text-xs text-muted-foreground">
                          Title
                        </Label>
                        <Input
                          id={`section-title-${idx}`}
                          value={section.title}
                          onChange={(e) => updateSection(idx, 'title', e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`section-content-${idx}`} className="text-xs text-muted-foreground">
                          Content
                        </Label>
                        <Textarea
                          id={`section-content-${idx}`}
                          value={section.content}
                          onChange={(e) => updateSection(idx, 'content', e.target.value)}
                          rows={4}
                          className="mt-1 resize-y"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-1 shrink-0">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleCancelEdit}
                  disabled={saveLoading}
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleSaveAndRerender}
                  disabled={saveLoading}
                >
                  {saveLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save & Re-render
                </Button>
              </div>
            </motion.div>
          )}

          {/* ---- Error State ---- */}
          {!editMode && isFailed && (
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
          {!editMode && isDone && (
            <motion.div
              key="done"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-col gap-3 py-2 min-h-0 flex-1 overflow-hidden"
            >
              {/* Success header */}
              <div className="flex items-center gap-3 shrink-0">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/20"
                >
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
                </motion.div>
                <div className="min-w-0 flex-1">
                  {proposal?.title && (
                    <p className="text-sm font-medium text-[#1E293B] dark:text-white truncate">
                      {proposal.title}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
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
                </div>
              </div>

              {/* Inline preview — show only first page (cover) */}
              {proposal?.rendered_html ? (
                <div className="flex-1 min-h-0 w-full px-8 sm:px-16 py-4">
                  <div className="w-full h-full rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 overflow-hidden shadow-sm">
                    <iframe
                      srcDoc={proposal.rendered_html}
                      title="Proposal preview"
                      className="w-full h-full border-0"
                      sandbox="allow-same-origin"
                      style={{ pointerEvents: 'none' }}
                    />
                  </div>
                </div>
              ) : thumbnailUrl ? (
                <div className="flex justify-center">
                  <div className="flex h-36 w-28 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 shadow-sm dark:border-gray-700 dark:bg-gray-800/50 overflow-hidden">
                    <img
                      src={thumbnailUrl}
                      alt="Proposal thumbnail"
                      className="h-full w-full object-cover"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex justify-center">
                  <div className="flex h-36 w-28 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 shadow-sm dark:border-gray-700 dark:bg-gray-800/50">
                    <FileText className="h-10 w-10 text-[#64748B] dark:text-gray-500" />
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-col w-full gap-2 shrink-0">
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
                    onClick={handleEnterEditMode}
                    disabled={editLoading}
                  >
                    {editLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Pencil className="mr-2 h-4 w-4" />
                    )}
                    Edit Sections
                  </Button>

                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      if (proposal) {
                        recordSendSignal(proposal);
                      }
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
          {!editMode && !isDone && !isFailed && (
            <motion.div
              key="progress"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-2 flex-1 min-h-0 flex flex-col"
            >
              <div className="flex gap-4 flex-1 min-h-0" style={{ minHeight: '50vh' }}>
                <div className="w-48 shrink-0">
                  <ProgressStepper status={status} isFailed={false} />
                </div>
                <div className="flex-1 min-h-0 rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 overflow-hidden relative">
                  <DocumentAssemblyAnimation status={status} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// DocumentAssemblyAnimation — animated page build tied to pipeline stages
// ---------------------------------------------------------------------------

/**
 * A 4-page miniature document that visually assembles as pipeline stages
 * complete. White pages with dark skeleton lines for text, tables, and
 * timeline sections. Designed to fill ~60s of wait time.
 */
// Pre-computed bullet widths so they don't change on re-render
const BULLET_WIDTHS = [72, 85, 63, 78, 90, 68, 82, 75] as const;

// Skeleton line — animates width from 0
function SkeletonLine({ w, delay, dark = false }: { w: string; delay: number; dark?: boolean }) {
  return (
    <motion.div
      initial={{ width: 0 }}
      animate={{ width: w }}
      transition={{ delay, duration: 0.35, ease: 'easeOut' }}
      className={cn('h-[2px] rounded-full', dark ? 'bg-gray-600' : 'bg-gray-300')}
    />
  );
}

// Section heading bar + title line
function SectionHead({ titleW, delay }: { titleW: string; delay: number }) {
  return (
    <div className="flex items-center gap-1 mb-1">
      <motion.div
        initial={{ height: 0 }}
        animate={{ height: 8 }}
        transition={{ delay, duration: 0.3 }}
        className="w-[2px] rounded-full bg-[#1e3a5f] shrink-0"
      />
      <SkeletonLine w={titleW} delay={delay + 0.1} dark />
    </div>
  );
}

// Paragraph block (staggered lines)
function SkeletonParagraph({ widths, baseDelay }: { widths: string[]; baseDelay: number }) {
  return (
    <div className="space-y-[2px]">
      {widths.map((w, i) => (
        <div key={i}><SkeletonLine w={w} delay={baseDelay + i * 0.12} /></div>
      ))}
    </div>
  );
}

// Table skeleton
function TableSkeleton({ rows, delay }: { rows: number; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay, duration: 0.4 }}
      className="border border-gray-200 rounded-[2px] overflow-hidden"
    >
      <div className="bg-[#1e3a5f] h-[5px]" />
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={cn('flex gap-1 px-1 py-[2px]', i % 2 === 0 ? 'bg-white' : 'bg-gray-50')}
        >
          <div className="h-[2px] rounded-full bg-gray-300 flex-[2]" />
          <div className="h-[2px] rounded-full bg-gray-200 flex-[3]" />
          <div className="h-[2px] rounded-full bg-gray-300 flex-1" />
        </div>
      ))}
      <div className="flex gap-1 px-1 py-[2px] border-t border-gray-200 bg-gray-50">
        <div className="h-[2px] rounded-full bg-gray-600 flex-[2]" />
        <div className="flex-[3]" />
        <div className="h-[2px] rounded-full bg-gray-600 flex-1" />
      </div>
    </motion.div>
  );
}

// Bullet list with stable widths
function BulletList({ count, delay }: { count: number; delay: number }) {
  return (
    <div className="space-y-[3px] pl-2">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: delay + i * 0.15, duration: 0.3 }}
          className="flex items-center gap-1"
        >
          <div className="w-[3px] h-[3px] rounded-full bg-gray-400 shrink-0" />
          <div
            className="h-[2px] rounded-full bg-gray-300"
            style={{ width: `${BULLET_WIDTHS[i % BULLET_WIDTHS.length]}%` }}
          />
        </motion.div>
      ))}
    </div>
  );
}

// Single mini-page
function MiniPage({ children, show, delay }: { children: React.ReactNode; show: boolean; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
      transition={{ delay, duration: 0.5, ease: 'easeOut' }}
      className="rounded-[3px] border border-gray-200 shadow-sm overflow-hidden shrink-0"
      style={{ width: '100%', aspectRatio: '210 / 297', background: '#ffffff' }}
    >
      {children}
    </motion.div>
  );
}

function DocumentAssemblyAnimation({ status }: { status: PipelineStatus | null }) {
  const activeIdx = getActiveStageIndex(status);

  // Use ref for elapsed so ticking doesn't cause re-renders.
  // Only the page-visibility flags need to trigger renders.
  const elapsedRef = useRef(0);
  const [visiblePages, setVisiblePages] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t0 = Date.now();
    const tick = setInterval(() => {
      elapsedRef.current = (Date.now() - t0) / 1000;
      // Evenly distribute page reveals across the wait
      let pages = 1;
      if (elapsedRef.current > 3) pages = 2;
      if (elapsedRef.current > 14) pages = 3;
      if (elapsedRef.current > 28) pages = 4;
      setVisiblePages((prev) => Math.max(prev, pages));
    }, 500);
    return () => clearInterval(tick);
  }, []);

  // Auto-scroll down when the bottom row (pages 3 & 4) appears
  useEffect(() => {
    if (visiblePages >= 3 && scrollRef.current) {
      // Small delay to let framer-motion start the page entrance animation
      const timer = setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [visiblePages]);

  // Combine stage progress with time-based reveals
  const showPage1 = activeIdx >= 0;
  const showPage2 = activeIdx >= 1 || visiblePages >= 2;
  const showPage3 = activeIdx >= 2 || visiblePages >= 3;
  const showPage4 = activeIdx >= 3 || visiblePages >= 4;

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Scrollable pages area */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 pt-4 pb-2">
        <div className="grid grid-cols-2 gap-3 max-w-[520px] mx-auto">

          {/* ─── PAGE 1: Cover ─── */}
          <MiniPage show={showPage1} delay={0}>
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.4 }}
              style={{ transformOrigin: 'left' }}
              className="h-[3%] bg-[#1e3a5f]"
            />
            <div className="flex flex-col items-center justify-center h-[90%] gap-2 px-4">
              <SkeletonLine w="35%" delay={0.3} />
              <SkeletonLine w="65%" delay={0.5} dark />
              <SkeletonLine w="25%" delay={0.7} />
              <div className="mt-2 flex flex-col items-center gap-1">
                <SkeletonLine w="50%" delay={0.9} />
                <SkeletonLine w="35%" delay={1.1} />
                <SkeletonLine w="25%" delay={1.3} />
              </div>
            </div>
            <div className="h-[1.5%] bg-[#4a90d9]" />
          </MiniPage>

          {/* ─── PAGE 2: TOC + Exec Summary + Challenge ─── */}
          <MiniPage show={showPage2} delay={0.3}>
            <div className="p-2.5 space-y-2">
              {/* TOC — compact */}
              <div className="space-y-[2px]">
                <SkeletonLine w="32%" delay={0.3} dark />
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.5, duration: 0.3 }}
                  style={{ transformOrigin: 'left' }}
                  className="h-[1px] bg-gray-200"
                />
                {['55%', '45%', '60%', '50%', '40%', '55%', '45%'].map((w, i) => (
                  <div key={i} className="flex items-center gap-[2px]">
                    <SkeletonLine w="6%" delay={0.6 + i * 0.08} dark />
                    <SkeletonLine w={w} delay={0.6 + i * 0.08} />
                  </div>
                ))}
              </div>
              {/* Exec Summary */}
              <SectionHead titleW="55%" delay={1.8} />
              <SkeletonParagraph widths={['90%', '95%', '85%', '92%', '78%', '88%', '82%', '90%']} baseDelay={2.0} />
              {/* Challenge */}
              <SectionHead titleW="45%" delay={3.8} />
              <SkeletonParagraph widths={['88%', '92%', '80%', '95%', '85%', '90%']} baseDelay={4.0} />
              {/* Solution intro */}
              <SectionHead titleW="50%" delay={5.5} />
              <SkeletonParagraph widths={['92%', '88%', '95%', '80%']} baseDelay={5.7} />
            </div>
          </MiniPage>

          {/* ─── PAGE 3: Approach + Phases ─── */}
          <MiniPage show={showPage3} delay={0.3}>
            <div className="p-2.5 space-y-2">
              <SectionHead titleW="48%" delay={0.2} />
              <div className="space-y-1">
                <SkeletonLine w="40%" delay={0.4} dark />
                <SkeletonParagraph widths={['92%', '85%', '90%', '88%']} baseDelay={0.5} />
                <SkeletonLine w="35%" delay={1.2} dark />
                <SkeletonParagraph widths={['88%', '95%', '82%', '90%']} baseDelay={1.3} />
              </div>
              <SectionHead titleW="50%" delay={2.2} />
              <div className="space-y-1">
                <SkeletonLine w="55%" delay={2.4} dark />
                <SkeletonParagraph widths={['90%', '88%', '82%']} baseDelay={2.5} />
                <SkeletonLine w="50%" delay={3.2} dark />
                <SkeletonParagraph widths={['85%', '92%', '78%']} baseDelay={3.3} />
                <SkeletonLine w="48%" delay={4.0} dark />
                <SkeletonParagraph widths={['90%', '80%', '88%']} baseDelay={4.1} />
              </div>
            </div>
          </MiniPage>

          {/* ─── PAGE 4: Timeline Table + Pricing + Terms ─── */}
          <MiniPage show={showPage4} delay={0.3}>
            <div className="p-2.5 space-y-2">
              <SectionHead titleW="60%" delay={0.2} />
              <TableSkeleton rows={5} delay={0.4} />
              <SectionHead titleW="42%" delay={1.5} />
              <TableSkeleton rows={4} delay={1.7} />
              <SectionHead titleW="55%" delay={2.8} />
              <BulletList count={5} delay={3.0} />
            </div>
          </MiniPage>
        </div>
      </div>

      {/* Status label */}
      <motion.p
        key={status}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="shrink-0 py-2 text-center text-xs text-gray-400 dark:text-gray-500"
      >
        {status === 'assembling' && 'Gathering context...'}
        {(status === 'context_assembled' || status === 'composing') && 'Writing sections...'}
        {(status === 'composed' || status === 'rendering') && 'Applying your brand...'}
        {status === 'rendered' && 'Rendering PDF...'}
        {status === 'delivering' && 'Almost there...'}
        {!status && 'Starting...'}
      </motion.p>
    </div>
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
