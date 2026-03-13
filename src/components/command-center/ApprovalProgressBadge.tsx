/**
 * ApprovalProgressBadge (US-017)
 *
 * Shows approval progress toward auto-execute on CC item cards.
 * Displays: "Approved X of these . Y more to auto-execute"
 * When promotion_eligible=true, shows highlighted "Ready to level up" nudge.
 * Hidden when never_promote=true or no confidence data exists.
 */

import { useState } from 'react';
import { TrendingUp, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useAutopilotConfidence,
  useTriggerAutopilotEvaluate,
} from '@/lib/hooks/useAutopilotConfidence';
import { toast } from 'sonner';

// ============================================================================
// Constants
// ============================================================================

/** Default threshold for auto-execute promotion (signals needed) */
const DEFAULT_AUTO_THRESHOLD = 10;

// ============================================================================
// Component
// ============================================================================

interface ApprovalProgressBadgeProps {
  /** The action_type derived from the CC item's drafted_action.type */
  actionType: string | undefined;
  /** Optional className for positioning */
  className?: string;
}

export function ApprovalProgressBadge({
  actionType,
  className,
}: ApprovalProgressBadgeProps) {
  const { data: confidence, isLoading } = useAutopilotConfidence(actionType);
  const triggerEvaluate = useTriggerAutopilotEvaluate();
  const [evaluating, setEvaluating] = useState(false);

  // Don't render if no action type, loading, no data, or never_promote
  if (!actionType || isLoading) return null;
  if (!confidence) return null;
  if (confidence.never_promote) return null;

  // Already at auto tier -- no badge needed
  if (confidence.current_tier === 'auto') return null;

  const totalSignals = confidence.total_signals;
  const remaining = Math.max(0, DEFAULT_AUTO_THRESHOLD - totalSignals);
  const isEligible = confidence.promotion_eligible;

  const handlePromote = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!actionType) return;
    setEvaluating(true);
    try {
      await triggerEvaluate.mutateAsync({ actionType });
      toast.success('Promotion evaluated successfully');
    } catch {
      toast.error('Failed to evaluate promotion');
    } finally {
      setEvaluating(false);
    }
  };

  // Ready to level up -- highlighted nudge
  if (isEligible) {
    return (
      <button
        type="button"
        onClick={handlePromote}
        disabled={evaluating}
        className={cn(
          'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-medium',
          'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25',
          'hover:bg-emerald-500/25 transition-colors cursor-pointer',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          className,
        )}
      >
        {evaluating ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Sparkles className="w-3 h-3" />
        )}
        Ready to level up
      </button>
    );
  }

  // In-progress badge
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px]',
        'bg-gray-800/60 text-gray-500',
        className,
      )}
    >
      <TrendingUp className="w-3 h-3" />
      <span>
        Approved {totalSignals} of these
        {remaining > 0 && (
          <span className="text-gray-400">
            {' '}· {remaining} more to auto-execute
          </span>
        )}
      </span>
    </div>
  );
}
