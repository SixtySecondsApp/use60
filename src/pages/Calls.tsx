import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PhoneCall, ArrowRight, Loader2, AudioLines, FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgId } from '@/lib/contexts/OrgContext';
import { cn } from '@/lib/utils';
import { AudioWaveform } from '@/components/calls/AudioWaveform';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { NextActionSuggestions } from '@/components/meetings/NextActionSuggestions';
import { useNextActionSuggestions } from '@/lib/hooks/useNextActionSuggestions';
import { CallActionItemsList } from '@/components/calls/CallActionItemsList';

type CallRow = {
  id: string;
  org_id: string;
  provider: string;
  external_id: string;
  direction: 'inbound' | 'outbound' | 'internal' | 'unknown';
  status: string | null;
  started_at: string | null;
  duration_seconds: number | null;
  from_number: string | null;
  to_number: string | null;
  owner_email: string | null;
  transcript_status: 'missing' | 'queued' | 'processing' | 'ready' | 'failed';
  has_recording: boolean;
};

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}:${mm.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatCallTitle(c: CallRow): string {
  const to = c.to_number || 'Unknown';
  const from = c.from_number || 'Unknown';
  if (c.direction === 'inbound') return `Inbound · ${from}`;
  if (c.direction === 'outbound') return `Outbound · ${to}`;
  return `${c.direction} · ${to}`;
}

export default function Calls() {
  const orgId = useOrgId();
  const navigate = useNavigate();
  const [reviewCall, setReviewCall] = useState<CallRow | null>(null);
  const [actionItems, setActionItems] = useState<any[]>([]);
  const [loadingActionItems, setLoadingActionItems] = useState(false);
  const [extracting, setExtracting] = useState(false);

  const {
    suggestions,
    loading: suggestionsLoading,
    refetch: refetchSuggestions,
    pendingCount,
  } = useNextActionSuggestions(reviewCall?.id || '', 'call');

  const { data, isLoading, error } = useQuery({
    queryKey: ['calls', orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calls')
        .select(
          'id, org_id, provider, external_id, direction, status, started_at, duration_seconds, from_number, to_number, owner_email, transcript_status, has_recording'
        )
        .eq('org_id', orgId!)
        .order('started_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      return (data || []) as CallRow[];
    },
  });

  const calls = useMemo(() => data || [], [data]);

  const openReview = async (c: CallRow) => {
    setReviewCall(c);
    if (!orgId) return;
    setLoadingActionItems(true);
    try {
      const { data, error } = await supabase
        .from('call_action_items')
        .select('*')
        .eq('org_id', orgId)
        .eq('call_id', c.id)
        .order('deadline_at', { ascending: true });
      if (error) throw error;
      setActionItems((data || []) as any[]);
    } catch {
      setActionItems([]);
    } finally {
      setLoadingActionItems(false);
    }
  };

  const closeReview = () => {
    setReviewCall(null);
    setActionItems([]);
  };

  const extractForReviewCall = async () => {
    if (!reviewCall?.id) return;
    setExtracting(true);
    try {
      await supabase.functions.invoke('extract-call-action-items', { body: { callId: reviewCall.id } });
      if (orgId) {
        const { data } = await supabase
          .from('call_action_items')
          .select('*')
          .eq('org_id', orgId)
          .eq('call_id', reviewCall.id)
          .order('deadline_at', { ascending: true });
        setActionItems((data || []) as any[]);
      }
    } finally {
      setExtracting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-start justify-between gap-6 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 dark:border-zinc-800/60 bg-gradient-to-br from-emerald-500/20 to-blue-500/20">
              <PhoneCall className="h-6 w-6 text-emerald-500 dark:text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Calls</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Team-wide call recordings and transcripts (JustCall).
              </p>
            </div>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading calls…
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200/60 dark:border-rose-500/20 bg-rose-50/60 dark:bg-rose-950/30 p-4 text-rose-700 dark:text-rose-300">
          Failed to load calls.
        </div>
      )}

      {!isLoading && !error && calls.length === 0 && (
        <div className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white/60 dark:bg-gray-900/40 p-8">
          <div className="flex items-center gap-3 mb-2">
            <AudioLines className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            <div className="text-lg font-semibold text-slate-900 dark:text-white">No calls yet</div>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Once JustCall is connected, calls will start appearing here with recordings and transcripts.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {calls.map((c) => {
          const started = c.started_at ? new Date(c.started_at) : null;
          const subtitle = started ? started.toLocaleString() : '—';
          const title = formatCallTitle(c);
          const seed = `${c.id}:${c.duration_seconds || 0}:${c.direction}`;

          const transcriptBadge =
            c.transcript_status === 'ready'
              ? { label: 'Transcript', cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20' }
              : c.transcript_status === 'queued' || c.transcript_status === 'processing'
                ? { label: 'Transcribing', cls: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20' }
                : { label: 'No transcript', cls: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20' };

          return (
            <button
              key={c.id}
              onClick={() => navigate(`/calls/${c.id}`)}
              className={cn(
                'text-left rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-gray-900/40 hover:bg-white dark:hover:bg-gray-900/60 transition-colors',
                'px-5 py-4 flex flex-col md:flex-row md:items-center gap-4'
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-base font-semibold text-slate-900 dark:text-white truncate">{title}</div>
                  {c.has_recording && (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                      <AudioLines className="w-3 h-3" />
                      Recording
                    </span>
                  )}
                  <span className={cn('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border', transcriptBadge.cls)}>
                    <FileText className="w-3 h-3" />
                    {transcriptBadge.label}
                  </span>
                </div>
                <div className="mt-1 text-sm text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>{subtitle}</span>
                  <span className="text-slate-400 dark:text-slate-600">·</span>
                  <span>Duration: {formatDuration(c.duration_seconds)}</span>
                  {c.owner_email && (
                    <>
                      <span className="text-slate-400 dark:text-slate-600">·</span>
                      <span className="truncate">Owner: {c.owner_email}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto">
                <div className="flex-1 md:flex-none">
                  <AudioWaveform seed={seed} />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openReview(c);
                  }}
                >
                  Review tasks
                </Button>
                <div className="shrink-0 w-9 h-9 rounded-xl bg-slate-900/5 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 flex items-center justify-center">
                  <ArrowRight className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <Dialog open={Boolean(reviewCall)} onOpenChange={(open) => (!open ? closeReview() : undefined)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Review tasks</DialogTitle>
          </DialogHeader>

          {reviewCall ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-gray-900/40 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">AI Suggestions</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    {suggestionsLoading ? 'Loading…' : `${pendingCount} pending`}
                  </div>
                </div>
                <NextActionSuggestions
                  activityId={reviewCall.id}
                  activityType="call"
                  suggestions={suggestions}
                  onSuggestionUpdate={async () => {
                    await refetchSuggestions();
                  }}
                  showPendingCount
                />
              </div>

              <div className="rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-gray-900/40 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">Action Items</div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={extractForReviewCall}
                    disabled={extracting || reviewCall.transcript_status !== 'ready'}
                  >
                    {extracting ? 'Extracting…' : 'Extract from transcript'}
                  </Button>
                </div>

                {loadingActionItems ? (
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading action items…
                  </div>
                ) : (
                  <CallActionItemsList
                    callId={reviewCall.id}
                    actionItems={actionItems as any}
                    onTasksCreated={async () => {
                      if (!orgId) return;
                      const { data } = await supabase
                        .from('call_action_items')
                        .select('*')
                        .eq('org_id', orgId)
                        .eq('call_id', reviewCall.id)
                        .order('deadline_at', { ascending: true });
                      setActionItems((data || []) as any[]);
                    }}
                  />
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}













