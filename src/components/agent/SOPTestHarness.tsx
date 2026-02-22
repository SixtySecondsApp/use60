/**
 * SOPTestHarness
 * SOP-006: Dry-run SOP trigger evaluation against historical meeting transcripts.
 */

import { useState } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  FlaskConical,
  CheckCircle,
  XCircle,
  ChevronRight,
  MessageSquare,
  Database,
  Mail,
  Clock,
  Hand,
  AlertCircle,
} from 'lucide-react';
import type { CustomSOP } from '@/lib/hooks/useCustomSOPs';
import type { TriggerType } from './TriggerConditionSelector';

// ============================================================
// Types
// ============================================================

interface Meeting {
  id: string;
  title: string;
  start_time: string;
  transcript_text?: string | null;
}

interface DryRunResult {
  triggered: boolean;
  trigger_reason: string;
  matched_phrases?: string[];
  steps_preview: Array<{
    step_order: number;
    action_type: string;
    description: string;
    requires_approval: boolean;
    estimated_credits: number;
  }>;
  total_credits: number;
}

// ============================================================
// Trigger evaluation (client-side dry run)
// ============================================================

function evaluateTrigger(
  triggerType: TriggerType,
  triggerConfig: Record<string, unknown>,
  transcript: string | null | undefined,
): { triggered: boolean; reason: string; matchedPhrases?: string[] } {
  if (!transcript) {
    return { triggered: false, reason: 'No transcript available for this meeting' };
  }

  switch (triggerType) {
    case 'transcript_phrase': {
      const phrases = (triggerConfig.phrases as string[]) ?? [];
      const caseSensitive = (triggerConfig.case_sensitive as boolean) ?? false;
      const matchMode = (triggerConfig.match_mode as string) ?? 'any';
      const text = caseSensitive ? transcript : transcript.toLowerCase();

      const matched = phrases.filter((p) => {
        const phrase = caseSensitive ? p : p.toLowerCase();
        return text.includes(phrase);
      });

      if (matchMode === 'any' && matched.length > 0) {
        return { triggered: true, reason: `Matched ${matched.length} phrase(s)`, matchedPhrases: matched };
      }
      if (matchMode === 'all' && matched.length === phrases.length) {
        return { triggered: true, reason: 'All required phrases matched', matchedPhrases: matched };
      }
      const missing = phrases.filter((p) => !matched.includes(p));
      return { triggered: false, reason: `No phrase matches found. Missing: ${missing.slice(0, 3).join(', ')}` };
    }

    case 'time_based':
      return {
        triggered: true,
        reason: 'Time-based triggers are evaluated by the scheduler at runtime — simulated as triggered for preview',
      };

    case 'crm_field_change':
      return {
        triggered: true,
        reason: 'CRM field change triggers fire on real-time DB events — simulated as triggered for preview',
      };

    case 'email_pattern': {
      const keywords = ((triggerConfig.keywords as string) ?? '')
        .split(',')
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);
      const matchField = (triggerConfig.match_field as string) ?? 'both';
      const text = matchField !== 'subject' ? transcript.toLowerCase() : '';
      const matched = keywords.filter((k) => text.includes(k));
      if (matched.length > 0) {
        return { triggered: true, reason: `Email keyword matched: ${matched.slice(0, 3).join(', ')}` };
      }
      return { triggered: false, reason: 'No email keywords found in transcript' };
    }

    case 'manual':
      return { triggered: true, reason: 'Manual trigger — fires on demand' };

    default:
      return { triggered: false, reason: 'Unknown trigger type' };
  }
}

const STEP_CREDIT_COSTS: Record<string, number> = {
  crm_action: 0.5,
  draft_email: 1.0,
  alert_rep: 0.2,
  alert_manager: 0.2,
  enrich_contact: 2.0,
  create_task: 0.3,
  custom: 1.0,
};

function buildStepsPreview(sop: CustomSOP): DryRunResult['steps_preview'] {
  return (sop.steps ?? []).map((step) => ({
    step_order: step.step_order,
    action_type: step.action_type,
    description: (step.action_config as Record<string, string>).description
      || step.action_type.replace(/_/g, ' '),
    requires_approval: step.requires_approval,
    estimated_credits: STEP_CREDIT_COSTS[step.action_type] ?? 0,
  }));
}

// ============================================================
// Component
// ============================================================

interface Props {
  sop: CustomSOP;
  open: boolean;
  onClose: () => void;
}

export default function SOPTestHarness({ sop, open, onClose }: Props) {
  const orgId = useActiveOrgId();
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>('');
  const [result, setResult] = useState<DryRunResult | null>(null);
  const [running, setRunning] = useState(false);

  // Load recent meetings with transcripts
  const { data: meetings, isLoading: loadingMeetings } = useQuery({
    queryKey: ['sop-test-meetings', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meetings')
        .select('id, title, start_time, transcript_text')
        .eq('owner_user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
        .not('transcript_text', 'is', null)
        .order('start_time', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Meeting[];
    },
    enabled: open && !!orgId,
  });

  function runDryRun() {
    const meeting = meetings?.find((m) => m.id === selectedMeetingId);
    if (!meeting) return;

    setRunning(true);

    // Simulate a short async delay for UX
    setTimeout(() => {
      const evalResult = evaluateTrigger(
        sop.trigger_type,
        sop.trigger_config as Record<string, unknown>,
        meeting.transcript_text,
      );

      const stepsPreview = buildStepsPreview(sop);
      const totalCredits = stepsPreview.reduce((sum, s) => sum + s.estimated_credits, 0);

      setResult({
        triggered: evalResult.triggered,
        trigger_reason: evalResult.reason,
        matched_phrases: evalResult.matchedPhrases,
        steps_preview: evalResult.triggered ? stepsPreview : [],
        total_credits: evalResult.triggered ? totalCredits : 0,
      });
      setRunning(false);
    }, 600);
  }

  const TRIGGER_ICONS: Record<TriggerType, React.ElementType> = {
    transcript_phrase: MessageSquare,
    crm_field_change: Database,
    email_pattern: Mail,
    time_based: Clock,
    manual: Hand,
  };
  const TriggerIcon = TRIGGER_ICONS[sop.trigger_type] ?? Hand;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-[#37bd7e]" />
            Test Playbook: {sop.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* SOP summary */}
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2">
            <TriggerIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span>Trigger: <strong>{sop.trigger_type.replace(/_/g, ' ')}</strong></span>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <span>{(sop.steps ?? []).length} steps</span>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <span>{sop.credit_cost_estimate.toFixed(1)} cr / run</span>
          </div>

          {/* Meeting selector */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Select a meeting transcript</p>
            {loadingMeetings ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading meetings...
              </div>
            ) : (meetings ?? []).length === 0 ? (
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                No meetings with transcripts found.
              </div>
            ) : (
              <Select value={selectedMeetingId} onValueChange={setSelectedMeetingId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a past meeting..." />
                </SelectTrigger>
                <SelectContent>
                  {(meetings ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <span className="truncate">{m.title || 'Untitled Meeting'}</span>
                      <span className="text-gray-400 ml-2 text-xs">
                        {new Date(m.start_time).toLocaleDateString()}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Run button */}
          <Button
            className="w-full bg-[#37bd7e] hover:bg-[#2da06a] gap-2"
            disabled={!selectedMeetingId || running}
            onClick={runDryRun}
          >
            {running ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Running dry-run...
              </>
            ) : (
              <>
                <FlaskConical className="w-4 h-4" />
                Run Test
              </>
            )}
          </Button>

          {/* Results */}
          {result && (
            <div className="space-y-3">
              {/* Trigger result */}
              <div className={`flex items-start gap-3 rounded-xl p-3 border ${
                result.triggered
                  ? 'border-green-200 dark:border-green-800/50 bg-green-50 dark:bg-green-900/20'
                  : 'border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20'
              }`}>
                {result.triggered ? (
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <p className={`text-sm font-semibold ${result.triggered ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                    {result.triggered ? 'Trigger Would Fire' : 'Trigger Would NOT Fire'}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{result.trigger_reason}</p>
                  {result.matched_phrases && result.matched_phrases.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {result.matched_phrases.map((p) => (
                        <Badge key={p} variant="secondary" className="text-[10px]">{p}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Steps preview */}
              {result.triggered && result.steps_preview.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Steps that would execute
                  </p>
                  {result.steps_preview.map((step) => (
                    <div
                      key={step.step_order}
                      className="flex items-center gap-2 border border-gray-100 dark:border-gray-800 rounded-lg px-3 py-2"
                    >
                      <span className="w-5 h-5 rounded-full bg-[#37bd7e]/10 flex items-center justify-center text-[10px] font-semibold text-[#37bd7e] flex-shrink-0">
                        {step.step_order}
                      </span>
                      <ChevronRight className="w-3 h-3 text-gray-300 flex-shrink-0" />
                      <span className="text-xs text-gray-700 dark:text-gray-300 flex-1 truncate">
                        {step.description}
                      </span>
                      {step.requires_approval && (
                        <Badge variant="outline" className="text-[9px] py-0 px-1 border-amber-400/50 text-amber-600 flex-shrink-0">
                          approval
                        </Badge>
                      )}
                      <span className="text-[10px] text-gray-400 flex-shrink-0">{step.estimated_credits}cr</span>
                    </div>
                  ))}

                  {/* Total */}
                  <div className="flex items-center justify-end gap-2 text-xs text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-800">
                    <span>Estimated total:</span>
                    <span className="font-semibold text-[#37bd7e]">{result.total_credits.toFixed(1)} credits</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
