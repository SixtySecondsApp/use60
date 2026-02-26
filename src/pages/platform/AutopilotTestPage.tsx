/**
 * AutopilotTestPage — PRD-AP-001 Test Harness
 *
 * Developer/QA page for testing all Autopilot Engine features with live
 * staging data. Divided into six collapsible panels.
 *
 * Route: /platform/test/autopilot
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TestTube2,
  Signal,
  TrendingUp,
  History,
  Bell,
  Settings,
  RefreshCw,
  Play,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuthUser } from '@/lib/hooks/useAuthUser';
import { useOrg } from '@/lib/contexts/OrgContext';
import { BackToPlatform } from '@/components/platform/BackToPlatform';
import { cn } from '@/lib/utils';

// =============================================================================
// Types
// =============================================================================

type ActionType =
  | 'crm.note_add'
  | 'crm.activity_log'
  | 'crm.contact_enrich'
  | 'crm.next_steps_update'
  | 'crm.deal_field_update'
  | 'crm.deal_stage_change'
  | 'crm.deal_amount_change'
  | 'crm.deal_close_date_change'
  | 'email.draft_save'
  | 'email.send'
  | 'email.follow_up_send'
  | 'email.check_in_send'
  | 'task.create'
  | 'task.assign'
  | 'calendar.create_event'
  | 'calendar.reschedule'
  | 'sequence.start'
  | 'slack.notification_send'
  | 'slack.briefing_send'
  | 'analysis.risk_assessment'
  | 'analysis.coaching_feedback'
  | 'unknown.other';

type SignalType =
  | 'approved'
  | 'approved_edited'
  | 'rejected'
  | 'expired'
  | 'undone'
  | 'auto_executed'
  | 'auto_undone';

interface ConfidenceRow {
  action_type: string;
  current_tier: 'disabled' | 'suggest' | 'approve' | 'auto';
  score: number;
  clean_approval_rate: number | null;
  total_signals: number;
  days_active: number;
  promotion_eligible: boolean;
  rubber_stamp_count: number | null;
  cooldown_until: string | null;
  pending_promotion_nudge: boolean;
  nudge_message: string | null;
}

interface EventRow {
  id: string;
  event_type: string;
  action_type: string;
  from_tier: string;
  to_tier: string;
  confidence_score: number | null;
  trigger_reason: string | null;
  created_at: string;
}

interface ThresholdRow {
  id: string;
  action_type: string;
  from_tier: string;
  to_tier: string;
  min_signals: number;
  min_clean_approval_rate: number;
  max_rejection_rate: number;
  max_undo_rate: number;
  last_n_clean: number;
  min_days_active: number;
}

interface RecordedSignal {
  action_type: string;
  signal: SignalType;
  time_to_respond_ms: number;
  timestamp: string;
  rubber_stamp: boolean;
}

interface NudgeResult {
  nudge: {
    action_type: string;
    message: string;
    from_tier: string;
    to_tier: string;
  } | null;
}

interface EvaluateResult {
  success: boolean;
  evaluated_users: number;
  candidates_found: number;
  proposals_sent: number;
  dry_run: boolean;
  candidates?: Array<{
    user_id: string;
    org_id: string;
    action_type: string;
    from_tier: string;
    to_tier: string;
    confidence_score: number;
  }>;
}

// =============================================================================
// Constants
// =============================================================================

const ALL_ACTION_TYPES: ActionType[] = [
  'crm.note_add',
  'crm.activity_log',
  'crm.contact_enrich',
  'crm.next_steps_update',
  'crm.deal_field_update',
  'crm.deal_stage_change',
  'crm.deal_amount_change',
  'crm.deal_close_date_change',
  'email.draft_save',
  'email.send',
  'email.follow_up_send',
  'email.check_in_send',
  'task.create',
  'task.assign',
  'calendar.create_event',
  'calendar.reschedule',
  'sequence.start',
  'slack.notification_send',
  'slack.briefing_send',
  'analysis.risk_assessment',
  'analysis.coaching_feedback',
  'unknown.other',
];

const ALL_SIGNALS: SignalType[] = [
  'approved',
  'approved_edited',
  'rejected',
  'expired',
  'undone',
  'auto_executed',
  'auto_undone',
];

const RUBBER_STAMP_THRESHOLDS: Record<string, number> = {
  'crm.note_add': 2000,
  'crm.activity_log': 1500,
  'crm.contact_enrich': 2000,
  'crm.next_steps_update': 2000,
  'crm.deal_field_update': 1500,
  'crm.deal_stage_change': 3000,
  'crm.deal_amount_change': 3000,
  'crm.deal_close_date_change': 2000,
  'email.draft_save': 1500,
  'email.send': 5000,
  'email.follow_up_send': 4000,
  'email.check_in_send': 3000,
  'task.create': 1500,
  'task.assign': 1500,
  'calendar.create_event': 2000,
  'calendar.reschedule': 2000,
  'sequence.start': 3000,
  'slack.notification_send': 1500,
  'slack.briefing_send': 2000,
};

const DEFAULT_RUBBER_STAMP_MS = 2000;

function getRubberStampThreshold(actionType: string): number {
  return RUBBER_STAMP_THRESHOLDS[actionType] ?? DEFAULT_RUBBER_STAMP_MS;
}

function isRubberStamp(timeMs: number, actionType: string): boolean {
  return timeMs < getRubberStampThreshold(actionType);
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  promotion_accepted: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  promotion_declined: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  promotion_never: 'bg-red-500/20 text-red-400 border border-red-500/30',
  demotion_auto: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  demotion_emergency: 'bg-red-500/20 text-red-400 border border-red-500/30',
  promotion_proposed: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  demotion_warning: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  manual_override: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
};

// =============================================================================
// Collapsible Panel Wrapper
// =============================================================================

interface PanelProps {
  id: string;
  title: string;
  icon: React.ReactNode;
  status?: 'live' | 'idle' | 'loading';
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function Panel({ title, icon, status = 'idle', isOpen, onToggle, children }: PanelProps) {
  const statusColors = {
    live: 'bg-emerald-500/20 text-emerald-400',
    idle: 'bg-gray-700/50 text-gray-400',
    loading: 'bg-blue-500/20 text-blue-400',
  };

  return (
    <div className="border border-gray-800 rounded-xl overflow-hidden bg-gray-900">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-800/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-indigo-400">{icon}</span>
          <span className="text-sm font-semibold text-white">{title}</span>
          <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', statusColors[status])}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
      </button>
      {isOpen && (
        <div className="px-5 pb-5 border-t border-gray-800">
          <div className="pt-4">{children}</div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Panel 1: Signal Recorder
// =============================================================================

function SignalRecorderPanel({ userId }: { userId: string }) {
  const [actionType, setActionType] = useState<ActionType>('crm.note_add');
  const [signal, setSignal] = useState<SignalType>('approved');
  const [timeToRespond, setTimeToRespond] = useState(3000);
  const [agentName, setAgentName] = useState('test-harness');
  const [recentSignals, setRecentSignals] = useState<RecordedSignal[]>([]);
  const [showTooltip, setShowTooltip] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const body = {
        action_type: actionType,
        agent_name: agentName,
        signal,
        time_to_respond_ms: timeToRespond,
        autonomy_tier_at_time: 'suggest',
      };

      const { data, error } = await supabase.functions.invoke('autopilot-record-signal', {
        method: 'POST',
        body,
        headers: { Authorization: `Bearer ${token}` },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      const stamped = isRubberStamp(timeToRespond, actionType);
      const newEntry: RecordedSignal = {
        action_type: actionType,
        signal,
        time_to_respond_ms: timeToRespond,
        timestamp: new Date().toISOString(),
        rubber_stamp: stamped,
      };
      setRecentSignals((prev) => [newEntry, ...prev].slice(0, 5));
      toast.success(`Signal recorded: ${signal} for ${actionType}${stamped ? ' (rubber stamp!)' : ''}`);
    },
    onError: (err: Error) => {
      toast.error(`Failed to record signal: ${err.message}`);
    },
  });

  const threshold = getRubberStampThreshold(actionType);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Action Type */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Action Type</label>
          <select
            value={actionType}
            onChange={(e) => setActionType(e.target.value as ActionType)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {ALL_ACTION_TYPES.map((at) => (
              <option key={at} value={at}>{at}</option>
            ))}
          </select>
        </div>

        {/* Signal */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Signal</label>
          <select
            value={signal}
            onChange={(e) => setSignal(e.target.value as SignalType)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {ALL_SIGNALS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Time to Respond */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <label className="block text-xs font-medium text-gray-400">
              time_to_respond_ms
            </label>
            <div className="relative">
              <button
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                className="text-gray-500 hover:text-gray-300"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
              {showTooltip && (
                <div className="absolute left-0 bottom-6 z-10 w-64 bg-gray-800 border border-gray-700 rounded-lg p-3 text-xs text-gray-300 shadow-xl">
                  <p className="font-semibold text-white mb-1.5">Rubber-stamp thresholds:</p>
                  <div className="space-y-0.5">
                    <p>email.send = 5000ms</p>
                    <p>email.follow_up_send = 4000ms</p>
                    <p>email.check_in_send = 3000ms</p>
                    <p>crm.deal_stage_change = 3000ms</p>
                    <p>crm.deal_amount_change = 3000ms</p>
                    <p>sequence.start = 3000ms</p>
                    <p>Most others = 1500-2000ms</p>
                  </div>
                </div>
              )}
            </div>
            <span className="text-xs text-gray-500">
              (threshold for {actionType}: {threshold}ms)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={timeToRespond}
              onChange={(e) => setTimeToRespond(parseInt(e.target.value, 10) || 0)}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={() => setTimeToRespond(500)}
              className="px-3 py-2 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors whitespace-nowrap"
            >
              Quick (500ms)
            </button>
            <button
              onClick={() => setTimeToRespond(3000)}
              className="px-3 py-2 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors whitespace-nowrap"
            >
              Normal (3000ms)
            </button>
          </div>
          {timeToRespond < threshold && (signal === 'approved' || signal === 'approved_edited') && (
            <p className="mt-1 text-xs text-amber-400 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Will be flagged as rubber stamp
            </p>
          )}
        </div>

        {/* Agent Name */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">agent_name</label>
          <input
            type="text"
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
      >
        <Play className="h-4 w-4" />
        {mutation.isPending ? 'Recording...' : 'Record Signal'}
      </button>

      {/* Recent Signals */}
      {recentSignals.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-400 mb-2">Last {recentSignals.length} recorded signals</p>
          <div className="space-y-2">
            {recentSignals.map((s, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center justify-between px-3 py-2 rounded-lg text-xs',
                  s.rubber_stamp
                    ? 'bg-amber-500/10 border border-amber-500/20'
                    : 'bg-gray-800 border border-gray-700',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-gray-300 font-mono">{s.action_type}</span>
                  <span className="text-indigo-400">{s.signal}</span>
                  <span className="text-gray-500">{s.time_to_respond_ms}ms</span>
                  {s.rubber_stamp && (
                    <span className="text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      rubber-stamp
                    </span>
                  )}
                </div>
                <span className="text-gray-500">
                  {new Date(s.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Panel 2: Confidence Scores (Live)
// =============================================================================

function ConfidencePanel({ userId }: { userId: string }) {
  const { data, isLoading, refetch, isFetching } = useQuery<ConfidenceRow[]>({
    queryKey: ['autopilot-confidence-live', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('autopilot_confidence')
        .select(
          'action_type, current_tier, score, clean_approval_rate, total_signals, ' +
          'days_active, promotion_eligible, rubber_stamp_count, cooldown_until, ' +
          'pending_promotion_nudge, nudge_message',
        )
        .eq('user_id', userId)
        .order('action_type');
      if (error) throw error;
      return (data ?? []) as ConfidenceRow[];
    },
    enabled: !!userId,
    refetchInterval: 3000,
  });

  const now = new Date();

  const tierBadge = (tier: string) => {
    const colors: Record<string, string> = {
      disabled: 'bg-gray-700 text-gray-400',
      suggest: 'bg-blue-500/20 text-blue-400',
      approve: 'bg-amber-500/20 text-amber-400',
      auto: 'bg-emerald-500/20 text-emerald-400',
    };
    return (
      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', colors[tier] ?? 'bg-gray-700 text-gray-400')}>
        {tier}
      </span>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          Auto-refreshes every 3s. {data?.length ?? 0} rows.
        </p>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors border border-gray-700"
        >
          <RefreshCw className={cn('h-3 w-3', isFetching && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500 py-6 text-center">Loading confidence data...</div>
      ) : !data || data.length === 0 ? (
        <div className="text-sm text-gray-500 py-6 text-center">
          No confidence rows yet. Record some signals first.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-800">
                {['Action Type', 'Tier', 'Score', 'Clean Rate', 'Signals', 'Days', 'Eligible', 'Rubber Stamps', 'Cooldown'].map((h) => (
                  <th key={h} className="text-left py-2 px-2 text-gray-500 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => {
                const hasCooldown = row.cooldown_until != null && new Date(row.cooldown_until) > now;
                return (
                  <tr
                    key={row.action_type}
                    className={cn(
                      'border-b border-gray-800/50 transition-colors',
                      row.promotion_eligible && 'bg-emerald-500/5',
                      hasCooldown && !row.promotion_eligible && 'bg-amber-500/5',
                    )}
                  >
                    <td className="py-2 px-2 font-mono text-gray-300 whitespace-nowrap">{row.action_type}</td>
                    <td className="py-2 px-2">{tierBadge(row.current_tier)}</td>
                    <td className="py-2 px-2 text-gray-300">{typeof row.score === 'number' ? row.score.toFixed(3) : '—'}</td>
                    <td className="py-2 px-2 text-gray-300">
                      {row.clean_approval_rate != null
                        ? `${(row.clean_approval_rate * 100).toFixed(0)}%`
                        : '—'}
                    </td>
                    <td className="py-2 px-2 text-gray-300">{row.total_signals}</td>
                    <td className="py-2 px-2 text-gray-300">{row.days_active}</td>
                    <td className="py-2 px-2">
                      {row.promotion_eligible ? (
                        <CheckCircle className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <XCircle className="h-4 w-4 text-gray-600" />
                      )}
                    </td>
                    <td className="py-2 px-2 text-gray-300">{row.rubber_stamp_count ?? 0}</td>
                    <td className="py-2 px-2 text-gray-300 whitespace-nowrap">
                      {hasCooldown ? (
                        <span className="text-amber-400">
                          {new Date(row.cooldown_until!).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Panel 3: Promotion Evaluator
// =============================================================================

function PromotionEvaluatorPanel({ orgId }: { orgId: string | null }) {
  const [result, setResult] = useState<EvaluateResult | null>(null);
  const [showLiveConfirm, setShowLiveConfirm] = useState(false);

  const runEvaluation = useCallback(async (dryRun: boolean) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('Not authenticated');

    if (!orgId) throw new Error('No active org ID');

    const { data, error } = await supabase.functions.invoke<EvaluateResult>(
      'autopilot-evaluate',
      {
        method: 'POST',
        body: { dry_run: dryRun, org_id: orgId },
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (error) throw error;
    return data;
  }, [orgId]);

  const dryRunMutation = useMutation({
    mutationFn: () => runEvaluation(true),
    onSuccess: (data) => {
      setResult(data);
      toast.success(`Dry-run complete: ${data?.candidates_found ?? 0} candidate(s) found`);
    },
    onError: (err: Error) => {
      toast.error(`Dry-run failed: ${err.message}`);
    },
  });

  const liveMutation = useMutation({
    mutationFn: () => runEvaluation(false),
    onSuccess: (data) => {
      setResult(data);
      setShowLiveConfirm(false);
      toast.success(`Live evaluation complete: ${data?.proposals_sent ?? 0} proposal(s) sent`);
    },
    onError: (err: Error) => {
      setShowLiveConfirm(false);
      toast.error(`Live evaluation failed: ${err.message}`);
    },
  });

  return (
    <div className="space-y-4">
      {!orgId && (
        <div className="flex items-center gap-2 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          No active org ID found. Cannot run evaluation.
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={() => dryRunMutation.mutate()}
          disabled={dryRunMutation.isPending || !orgId}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Play className="h-4 w-4" />
          {dryRunMutation.isPending ? 'Running...' : 'Run Dry-Run Evaluation'}
        </button>

        {!showLiveConfirm ? (
          <button
            onClick={() => setShowLiveConfirm(true)}
            disabled={liveMutation.isPending || !orgId}
            className="flex items-center gap-2 px-4 py-2 bg-red-600/80 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors border border-red-500/30"
          >
            <AlertTriangle className="h-4 w-4" />
            Run Live Evaluation (sends Slack)
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-amber-400">This will send real Slack messages. Confirm?</span>
            <button
              onClick={() => liveMutation.mutate()}
              disabled={liveMutation.isPending}
              className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
            >
              {liveMutation.isPending ? 'Running...' : 'Yes, run live'}
            </button>
            <button
              onClick={() => setShowLiveConfirm(false)}
              className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {result && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Evaluated Users', value: result.evaluated_users },
              { label: 'Candidates Found', value: result.candidates_found },
              { label: 'Proposals Sent', value: result.proposals_sent },
              { label: 'Mode', value: result.dry_run ? 'Dry Run' : 'Live' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-white">{value}</p>
                <p className="text-xs text-gray-400">{label}</p>
              </div>
            ))}
          </div>

          {result.candidates && result.candidates.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-400 mb-2">Candidates</p>
              <div className="space-y-2">
                {result.candidates.map((c, i) => (
                  <div key={i} className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs">
                    <span className="font-mono text-gray-300">{c.action_type}</span>
                    <span className="text-gray-500">{c.from_tier} → {c.to_tier}</span>
                    <span className="text-indigo-400">score: {c.confidence_score.toFixed(3)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Panel 4: Autopilot Events Log
// =============================================================================

function EventsLogPanel({ userId }: { userId: string }) {
  const { data, isLoading, refetch, isFetching } = useQuery<EventRow[]>({
    queryKey: ['autopilot-events-log', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('autopilot_events')
        .select(
          'id, event_type, action_type, from_tier, to_tier, confidence_score, trigger_reason, created_at',
        )
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
    enabled: !!userId,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">Last 20 events for current user.</p>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors border border-gray-700"
        >
          <RefreshCw className={cn('h-3 w-3', isFetching && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500 py-6 text-center">Loading events...</div>
      ) : !data || data.length === 0 ? (
        <div className="text-sm text-gray-500 py-6 text-center">
          No events yet. Confidence milestones and tier changes will appear here.
        </div>
      ) : (
        <div className="space-y-2">
          {data.map((event) => (
            <div
              key={event.id}
              className="flex items-start gap-3 bg-gray-800/50 border border-gray-800 rounded-lg px-3 py-2.5"
            >
              <span
                className={cn(
                  'text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap',
                  EVENT_TYPE_COLORS[event.event_type] ?? 'bg-gray-700 text-gray-400',
                )}
              >
                {event.event_type}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono text-gray-300">{event.action_type}</span>
                  <span className="text-xs text-gray-500">{event.from_tier} → {event.to_tier}</span>
                  {event.confidence_score != null && (
                    <span className="text-xs text-indigo-400">score: {event.confidence_score.toFixed(3)}</span>
                  )}
                </div>
                {event.trigger_reason && (
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{event.trigger_reason}</p>
                )}
              </div>
              <span className="text-xs text-gray-600 whitespace-nowrap">
                {new Date(event.created_at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Panel 5: Nudge Tester
// =============================================================================

function NudgeTesterPanel({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [nudgeResult, setNudgeResult] = useState<NudgeResult | null>(null);
  const [seedResult, setSeedResult] = useState<string | null>(null);

  const { data: confidenceRows } = useQuery<ConfidenceRow[]>({
    queryKey: ['autopilot-confidence-live', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('autopilot_confidence')
        .select('action_type, current_tier, score, clean_approval_rate, total_signals, days_active, promotion_eligible, rubber_stamp_count, cooldown_until, pending_promotion_nudge, nudge_message')
        .eq('user_id', userId)
        .order('action_type');
      if (error) throw error;
      return (data ?? []) as ConfidenceRow[];
    },
    enabled: !!userId,
  });

  // Check for nudge via edge function GET
  const checkNudgeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke<NudgeResult>(
        'autopilot-record-signal',
        { method: 'GET' },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setNudgeResult(data);
      if (data?.nudge) {
        toast.success(`Nudge found: ${data.nudge.action_type} → ${data.nudge.to_tier}`);
        // Invalidate confidence cache since nudge was cleared server-side
        queryClient.invalidateQueries({ queryKey: ['autopilot-confidence-live', userId] });
      } else {
        toast.info('No pending nudge found');
      }
    },
    onError: (err: Error) => {
      toast.error(`Check nudge failed: ${err.message}`);
    },
  });

  // Seed a test nudge directly via Supabase client
  const seedNudgeMutation = useMutation({
    mutationFn: async () => {
      const firstRow = confidenceRows?.[0];
      if (!firstRow) throw new Error('No confidence rows found — record some signals first');

      const testMessage = `Test nudge: you have 10 clean approvals for ${firstRow.action_type} — want to go auto?`;

      const { error } = await supabase
        .from('autopilot_confidence')
        .update({
          pending_promotion_nudge: true,
          nudge_message: testMessage,
        })
        .eq('user_id', userId)
        .eq('action_type', firstRow.action_type);

      if (error) throw error;
      return { action_type: firstRow.action_type, message: testMessage };
    },
    onSuccess: (data) => {
      setSeedResult(`Nudge seeded for: ${data.action_type}`);
      toast.success(`Test nudge seeded for ${data.action_type}`);
      queryClient.invalidateQueries({ queryKey: ['autopilot-confidence-live', userId] });
    },
    onError: (err: Error) => {
      setSeedResult(`Error: ${err.message}`);
      toast.error(`Seed nudge failed: ${err.message}`);
    },
  });

  const hasPendingNudge = confidenceRows?.some((r) => r.pending_promotion_nudge) ?? false;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => checkNudgeMutation.mutate()}
          disabled={checkNudgeMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Bell className="h-4 w-4" />
          {checkNudgeMutation.isPending ? 'Checking...' : 'Check for Pending Nudge'}
        </button>

        <button
          onClick={() => seedNudgeMutation.mutate()}
          disabled={seedNudgeMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-200 text-sm font-medium rounded-lg transition-colors border border-gray-600"
        >
          <Signal className="h-4 w-4" />
          {seedNudgeMutation.isPending ? 'Seeding...' : 'Seed a Test Nudge'}
        </button>
      </div>

      {/* AutopilotNudgeBanner visibility status */}
      <div className={cn(
        'flex items-center gap-2 text-sm px-3 py-2 rounded-lg border',
        hasPendingNudge
          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
          : 'bg-gray-800 border-gray-700 text-gray-500',
      )}>
        {hasPendingNudge ? (
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
        ) : (
          <XCircle className="h-4 w-4 flex-shrink-0" />
        )}
        AutopilotNudgeBanner: {hasPendingNudge ? 'would be visible (pending nudge exists)' : 'not visible (no pending nudge)'}
      </div>

      {/* Nudge check result */}
      {nudgeResult && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
          <p className="text-xs font-medium text-gray-400 mb-2">Last GET /autopilot-record-signal result:</p>
          {nudgeResult.nudge ? (
            <div className="space-y-1 text-xs">
              <p><span className="text-gray-500">action_type:</span> <span className="text-white font-mono">{nudgeResult.nudge.action_type}</span></p>
              <p><span className="text-gray-500">from_tier:</span> <span className="text-gray-300">{nudgeResult.nudge.from_tier}</span></p>
              <p><span className="text-gray-500">to_tier:</span> <span className="text-gray-300">{nudgeResult.nudge.to_tier}</span></p>
              <p><span className="text-gray-500">message:</span> <span className="text-gray-300">{nudgeResult.nudge.message}</span></p>
            </div>
          ) : (
            <p className="text-xs text-gray-500">nudge: null</p>
          )}
        </div>
      )}

      {seedResult && (
        <p className="text-xs text-gray-400 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
          {seedResult}
        </p>
      )}
    </div>
  );
}

// =============================================================================
// Panel 6: Threshold Config (Read-only)
// =============================================================================

function ThresholdConfigPanel() {
  const { data, isLoading, refetch, isFetching } = useQuery<ThresholdRow[]>({
    queryKey: ['autopilot-thresholds-platform'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('autopilot_thresholds')
        .select(
          'id, action_type, from_tier, to_tier, min_signals, min_clean_approval_rate, ' +
          'max_rejection_rate, max_undo_rate, last_n_clean, min_days_active',
        )
        .is('org_id', null)
        .order('action_type')
        .order('from_tier');
      if (error) throw error;
      return (data ?? []) as ThresholdRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">Platform defaults (org_id IS NULL). Read-only.</p>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors border border-gray-700"
        >
          <RefreshCw className={cn('h-3 w-3', isFetching && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500 py-6 text-center">Loading thresholds...</div>
      ) : !data || data.length === 0 ? (
        <div className="text-sm text-gray-500 py-6 text-center">No platform thresholds found.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-800">
                {['Action Type', 'From → To', 'Min Signals', 'Min Clean Rate', 'Max Undo Rate', 'Last N Clean', 'Min Days'].map((h) => (
                  <th key={h} className="text-left py-2 px-2 text-gray-500 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="py-2 px-2 font-mono text-gray-300 whitespace-nowrap">{row.action_type}</td>
                  <td className="py-2 px-2 text-gray-400 whitespace-nowrap">{row.from_tier} → {row.to_tier}</td>
                  <td className="py-2 px-2 text-gray-300">{row.min_signals}</td>
                  <td className="py-2 px-2 text-gray-300">{(row.min_clean_approval_rate * 100).toFixed(0)}%</td>
                  <td className="py-2 px-2 text-gray-300">{(row.max_undo_rate * 100).toFixed(0)}%</td>
                  <td className="py-2 px-2 text-gray-300">{row.last_n_clean}</td>
                  <td className="py-2 px-2 text-gray-300">{row.min_days_active}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Page Root
// =============================================================================

export default function AutopilotTestPage() {
  const { data: user, isLoading: userLoading } = useAuthUser();
  const { activeOrgId } = useOrg();

  const [openPanels, setOpenPanels] = useState<Record<string, boolean>>({
    signals: true,
    confidence: true,
    evaluator: false,
    events: false,
    nudge: false,
    thresholds: false,
  });

  const togglePanel = (id: string) => {
    setOpenPanels((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (userLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-red-400 text-sm">Not authenticated.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <BackToPlatform />

        {/* Page heading */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-indigo-400 mb-3">
            <TestTube2 className="h-3.5 w-3.5" />
            Autopilot Engine — Test Harness
          </div>
          <h1 className="text-2xl font-bold text-white mb-1.5">PRD-AP-001 Test Console</h1>
          <p className="text-sm text-gray-400">
            Developer/QA page for testing Autopilot Engine features with live data.
          </p>
          <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
            <span>User: <span className="font-mono text-gray-400">{user.id.slice(0, 8)}...</span></span>
            <span>Org: <span className="font-mono text-gray-400">{activeOrgId ? activeOrgId.slice(0, 8) + '...' : 'none'}</span></span>
          </div>
        </div>

        {/* Panels */}
        <div className="space-y-3">
          <Panel
            id="signals"
            title="Signal Recorder"
            icon={<Signal className="h-4 w-4" />}
            status="idle"
            isOpen={openPanels.signals}
            onToggle={() => togglePanel('signals')}
          >
            <SignalRecorderPanel userId={user.id} />
          </Panel>

          <Panel
            id="confidence"
            title="Confidence Scores (Live)"
            icon={<TrendingUp className="h-4 w-4" />}
            status="live"
            isOpen={openPanels.confidence}
            onToggle={() => togglePanel('confidence')}
          >
            <ConfidencePanel userId={user.id} />
          </Panel>

          <Panel
            id="evaluator"
            title="Promotion Evaluator"
            icon={<Play className="h-4 w-4" />}
            status="idle"
            isOpen={openPanels.evaluator}
            onToggle={() => togglePanel('evaluator')}
          >
            <PromotionEvaluatorPanel orgId={activeOrgId} />
          </Panel>

          <Panel
            id="events"
            title="Autopilot Events Log"
            icon={<History className="h-4 w-4" />}
            status="idle"
            isOpen={openPanels.events}
            onToggle={() => togglePanel('events')}
          >
            <EventsLogPanel userId={user.id} />
          </Panel>

          <Panel
            id="nudge"
            title="Nudge Tester"
            icon={<Bell className="h-4 w-4" />}
            status="idle"
            isOpen={openPanels.nudge}
            onToggle={() => togglePanel('nudge')}
          >
            <NudgeTesterPanel userId={user.id} />
          </Panel>

          <Panel
            id="thresholds"
            title="Threshold Config (Read-only)"
            icon={<Settings className="h-4 w-4" />}
            status="idle"
            isOpen={openPanels.thresholds}
            onToggle={() => togglePanel('thresholds')}
          >
            <ThresholdConfigPanel />
          </Panel>
        </div>
      </div>
    </div>
  );
}
