/**
 * MEDDICPanel — MEDDIC-001, MEDDIC-004, MEDDIC-005
 *
 * 7-field MEDDIC panel for a deal:
 *   - Metrics, Economic Buyer, Decision Criteria, Decision Process,
 *     Identify Pain, Champion, Competition
 *
 * Each field shows:
 *   - Score (0-4) with colour coding
 *   - Current evidence text (auto-populated from transcripts, editable)
 *   - Source meeting indicator ("Last updated from: …")
 *   - AI badge on auto-populated fields
 *
 * Reads from `meddic_scores` table via useMEDDICScores hook.
 * Saves edits back to `meddic_scores` table.
 *
 * Light + dark mode. Lucide icons only. Toast errors.
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Edit3,
  Save,
  X,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { MEDDICScoringMatrix } from './MEDDICScoringMatrix';
import { MEDDICHealthTrendChart } from './MEDDICHealthTrendChart';

// =============================================================================
// Types
// =============================================================================

export type MEDDICField =
  | 'metrics'
  | 'economic_buyer'
  | 'decision_criteria'
  | 'decision_process'
  | 'identify_pain'
  | 'champion'
  | 'competition';

export interface MEDDICScore {
  id?: string;
  deal_id: string;
  field: MEDDICField;
  score: number; // 0-4
  evidence: string | null;
  source_meeting_id: string | null;
  source_meeting_title: string | null;
  updated_by: 'ai' | 'user';
  updated_at: string;
}

// =============================================================================
// Field metadata
// =============================================================================

export const MEDDIC_FIELDS: Array<{
  field: MEDDICField;
  label: string;
  description: string;
  placeholder: string;
}> = [
  {
    field: 'metrics',
    label: 'Metrics',
    description: 'Quantifiable value and ROI the buyer expects',
    placeholder: 'e.g. Reduce onboarding time by 40%, save 5 hrs/rep/week',
  },
  {
    field: 'economic_buyer',
    label: 'Economic Buyer',
    description: 'Person with budget authority who signs the contract',
    placeholder: 'e.g. CFO Sarah Chen — met 3 Apr, aligned on budget',
  },
  {
    field: 'decision_criteria',
    label: 'Decision Criteria',
    description: 'Formal criteria used to evaluate and select a vendor',
    placeholder: 'e.g. Security compliance, Salesforce integration, price',
  },
  {
    field: 'decision_process',
    label: 'Decision Process',
    description: 'Steps and stakeholders involved in reaching a decision',
    placeholder: 'e.g. Pilot → Legal review → Board sign-off (Q2)',
  },
  {
    field: 'identify_pain',
    label: 'Identify Pain',
    description: 'Business problem or pain that makes this purchase urgent',
    placeholder: 'e.g. Manual reporting costs 20hrs/month, losing deals to faster competitors',
  },
  {
    field: 'champion',
    label: 'Champion',
    description: 'Internal advocate who sells on your behalf',
    placeholder: 'e.g. VP Sales Mark Lee — actively lobbying exec team',
  },
  {
    field: 'competition',
    label: 'Competition',
    description: 'Competing vendors and your differentiation',
    placeholder: 'e.g. Evaluating Salesforce & HubSpot; our edge: AI notes',
  },
];

// =============================================================================
// Score labels + colours
// Scoring: 0=Unknown, 1=Identified, 2=Developing, 3=Confirmed, 4=Locked
// Colours: 0=grey, 1=red, 2=amber, 3=green, 4=blue
// =============================================================================

export const SCORE_CONFIG: Array<{
  score: number;
  label: string;
  shortLabel: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
}> = [
  {
    score: 0,
    label: 'Unknown',
    shortLabel: '0',
    textColor: 'text-gray-500 dark:text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-800/50',
    borderColor: 'border-gray-200 dark:border-gray-700',
  },
  {
    score: 1,
    label: 'Identified',
    shortLabel: '1',
    textColor: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    borderColor: 'border-red-200 dark:border-red-800/40',
  },
  {
    score: 2,
    label: 'Developing',
    shortLabel: '2',
    textColor: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    borderColor: 'border-amber-200 dark:border-amber-800/40',
  },
  {
    score: 3,
    label: 'Confirmed',
    shortLabel: '3',
    textColor: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    borderColor: 'border-emerald-200 dark:border-emerald-800/40',
  },
  {
    score: 4,
    label: 'Locked',
    shortLabel: '4',
    textColor: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    borderColor: 'border-blue-200 dark:border-blue-800/40',
  },
];

export function getScoreConfig(score: number) {
  return SCORE_CONFIG[Math.max(0, Math.min(4, Math.round(score)))] ?? SCORE_CONFIG[0];
}

// =============================================================================
// Query keys
// =============================================================================

export const MEDDIC_KEYS = {
  all: ['meddic'] as const,
  byDeal: (dealId: string) => ['meddic', 'deal', dealId] as const,
};

// =============================================================================
// Hook: useMEDDICScores
// =============================================================================

export function useMEDDICScores(dealId: string) {
  return useQuery({
    queryKey: MEDDIC_KEYS.byDeal(dealId),
    queryFn: async (): Promise<MEDDICScore[]> => {
      const { data, error } = await supabase
        .from('meddic_scores')
        .select(
          'id, deal_id, field, score, evidence, source_meeting_id, source_meeting_title, updated_by, updated_at'
        )
        .eq('deal_id', dealId)
        .order('field', { ascending: true });
      if (error) throw error;
      return (data ?? []) as MEDDICScore[];
    },
    enabled: !!dealId,
    staleTime: 2 * 60 * 1000,
  });
}

// =============================================================================
// Hook: useSaveMEDDICScore
// =============================================================================

export function useSaveMEDDICScore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (row: Omit<MEDDICScore, 'id' | 'updated_at'>) => {
      const { error } = await supabase.from('meddic_scores').upsert(
        {
          ...row,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'deal_id,field' }
      );
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: MEDDIC_KEYS.byDeal(variables.deal_id) });
    },
    onError: (err: Error) => {
      toast.error(`Failed to save MEDDIC field: ${err.message}`);
    },
  });
}

// =============================================================================
// FieldRow
// =============================================================================

interface FieldRowProps {
  dealId: string;
  fieldDef: (typeof MEDDIC_FIELDS)[number];
  score: MEDDICScore | undefined;
}

function FieldRow({ dealId, fieldDef, score }: FieldRowProps) {
  const [editing, setEditing] = useState(false);
  const [draftEvidence, setDraftEvidence] = useState('');
  const [draftScore, setDraftScore] = useState(0);
  const { mutateAsync: save, isPending } = useSaveMEDDICScore();

  const currentScore = score?.score ?? 0;
  const currentEvidence = score?.evidence ?? '';
  const cfg = getScoreConfig(currentScore);

  function startEdit() {
    setDraftEvidence(currentEvidence);
    setDraftScore(currentScore);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
  }

  async function handleSave() {
    await save({
      deal_id: dealId,
      field: fieldDef.field,
      score: draftScore,
      evidence: draftEvidence.trim() || null,
      source_meeting_id: score?.source_meeting_id ?? null,
      source_meeting_title: score?.source_meeting_title ?? null,
      updated_by: 'user',
    });
    setEditing(false);
    toast.success(`${fieldDef.label} saved`);
  }

  return (
    <div
      className={cn(
        'rounded-xl border p-3 transition-colors',
        editing ? 'border-violet-300 dark:border-violet-700/50 bg-violet-50/30 dark:bg-violet-900/10' : `${cfg.bgColor} ${cfg.borderColor}`
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-200">
              {fieldDef.label}
            </span>
            {/* Score badge */}
            <Badge
              className={cn(
                'text-[10px] border-0 px-1.5 shrink-0',
                cfg.bgColor,
                cfg.textColor
              )}
            >
              {currentScore} — {cfg.label}
            </Badge>
            {/* AI badge */}
            {score?.updated_by === 'ai' && (
              <Badge className="text-[10px] border-0 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 px-1.5">
                <Bot className="w-2.5 h-2.5 mr-0.5" />
                AI
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{fieldDef.description}</p>
        </div>

        {!editing && (
          <button
            onClick={startEdit}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors shrink-0"
            title="Edit"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Evidence text */}
      {!editing && (
        <div className="mt-2">
          {currentEvidence ? (
            <p className="text-[12.5px] text-gray-700 dark:text-gray-300 leading-relaxed">
              {currentEvidence}
            </p>
          ) : (
            <p className="text-[12px] text-gray-400 dark:text-gray-500 italic">
              {fieldDef.placeholder}
            </p>
          )}
          {score?.source_meeting_title && (
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
              Last updated from: {score.source_meeting_title}
            </p>
          )}
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="mt-2 space-y-2">
          {/* Score selector */}
          <div className="flex items-center gap-1 flex-wrap">
            {SCORE_CONFIG.map((s) => (
              <button
                key={s.score}
                onClick={() => setDraftScore(s.score)}
                className={cn(
                  'px-2 py-0.5 rounded-full text-[11px] font-medium transition-all border',
                  draftScore === s.score
                    ? `${s.bgColor} ${s.textColor} ${s.borderColor} shadow-sm`
                    : 'text-gray-400 dark:text-gray-500 border-transparent hover:bg-gray-100 dark:hover:bg-white/[0.04]'
                )}
              >
                {s.score} {s.label}
              </button>
            ))}
          </div>

          <Textarea
            value={draftEvidence}
            onChange={(e) => setDraftEvidence(e.target.value)}
            placeholder={fieldDef.placeholder}
            className="min-h-[80px] text-[12.5px] resize-none bg-white dark:bg-gray-900/50"
            autoFocus
          />

          <div className="flex items-center gap-2 justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={cancelEdit}
              disabled={isPending}
            >
              <X className="w-3 h-3 mr-1" />
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={handleSave}
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : (
                <Save className="w-3 h-3 mr-1" />
              )}
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MEDDICPanel (main export)
// =============================================================================

interface MEDDICPanelProps {
  dealId: string;
}

export function MEDDICPanel({ dealId }: MEDDICPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [showMatrix, setShowMatrix] = useState(false);
  const { data: scores = [], isLoading } = useMEDDICScores(dealId);

  // Build score map
  const scoreMap = new Map<string, MEDDICScore>();
  for (const s of scores) {
    scoreMap.set(s.field, s);
  }

  // Overall score
  const totalScore = MEDDIC_FIELDS.reduce((sum, f) => sum + (scoreMap.get(f.field)?.score ?? 0), 0);
  const maxScore = MEDDIC_FIELDS.length * 4; // 28

  function getOverallAssessment(score: number): { label: string; color: string } {
    if (score <= 7) return { label: 'Critical', color: 'text-red-600 dark:text-red-400' };
    if (score <= 14) return { label: 'At Risk', color: 'text-amber-600 dark:text-amber-400' };
    if (score <= 21) return { label: 'Healthy', color: 'text-emerald-600 dark:text-emerald-400' };
    return { label: 'Strong', color: 'text-blue-600 dark:text-blue-400' };
  }

  const assessment = getOverallAssessment(totalScore);

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          className="flex items-center gap-2 text-left flex-1"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="flex items-center gap-2">
            {expanded
              ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
            }
            <span className={cn('text-[20px] font-bold tabular-nums', assessment.color)}>
              {totalScore}
            </span>
            <span className="text-[10px] text-gray-400 dark:text-gray-500">/ {maxScore}</span>
          </div>
          <Badge
            className={cn(
              'text-[10px] border-0',
              assessment.label === 'Critical'
                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                : assessment.label === 'At Risk'
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                : assessment.label === 'Healthy'
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
            )}
          >
            {assessment.label}
          </Badge>
        </button>

        <button
          onClick={() => setShowMatrix((v) => !v)}
          className="text-[11px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors ml-2"
        >
          {showMatrix ? 'Hide matrix' : 'Show matrix'}
        </button>
      </div>

      {/* Scoring matrix */}
      {showMatrix && (
        <MEDDICScoringMatrix scores={scores} totalScore={totalScore} />
      )}

      {/* Health trend sparkline */}
      <MEDDICHealthTrendChart dealId={dealId} />

      {/* Field list */}
      {expanded && (
        <div className="space-y-2">
          {isLoading ? (
            <div className="space-y-2">
              {MEDDIC_FIELDS.map((f) => (
                <div key={f.field} className="h-16 rounded-xl bg-gray-100 dark:bg-white/[0.025] animate-pulse" />
              ))}
            </div>
          ) : (
            MEDDIC_FIELDS.map((fieldDef) => (
              <FieldRow
                key={fieldDef.field}
                dealId={dealId}
                fieldDef={fieldDef}
                score={scoreMap.get(fieldDef.field)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
