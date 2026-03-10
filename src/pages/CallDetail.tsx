import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgId } from '@/lib/contexts/OrgContext';
import { AudioWaveform } from '@/components/calls/AudioWaveform';
import { ArrowLeft, Loader2, PhoneCall, AudioLines, FileText, Clock, Sparkles } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
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
  ended_at: string | null;
  duration_seconds: number | null;
  from_number: string | null;
  to_number: string | null;
  owner_email: string | null;
  has_recording: boolean;
  recording_mime: string | null;
  transcript_status: 'missing' | 'queued' | 'processing' | 'ready' | 'failed';
  transcript_text: string | null;
  company_id?: string | null;
  contact_id?: string | null;
  deal_id?: string | null;
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

export default function CallDetail() {
  const { id } = useParams<{ id: string }>();
  const orgId = useOrgId();
  const navigate = useNavigate();

  const [call, setCall] = useState<CallRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [callActionItems, setCallActionItems] = useState<any[]>([]);
  const [loadingActionItems, setLoadingActionItems] = useState(false);
  const [extracting, setExtracting] = useState(false);

  const {
    suggestions,
    loading: suggestionsLoading,
    refetch: refetchSuggestions,
    pendingCount,
  } = useNextActionSuggestions(id || '', 'call');

  useEffect(() => {
    let mounted = true;
    async function run() {
      try {
        setLoading(true);
        setError(null);

        if (!id || !orgId) return;

        const { data, error } = await supabase
          .from('calls')
          .select(
            'id, org_id, provider, external_id, direction, status, started_at, ended_at, duration_seconds, from_number, to_number, owner_email, has_recording, recording_mime, transcript_status, transcript_text'
          )
          .eq('org_id', orgId)
          .eq('id', id)
          .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error('Call not found');

        if (!mounted) return;
        setCall(data as CallRow);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load call');
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }
    run();
    return () => {
      mounted = false;
    };
  }, [id, orgId]);

  useEffect(() => {
    let cancelled = false;
    async function buildAudioUrl() {
      try {
        if (!call?.has_recording) {
          setAudioSrc(null);
          return;
        }
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          setAudioSrc(null);
          return;
        }
        const base = import.meta.env.VITE_SUPABASE_URL;
        const url = `${base}/functions/v1/proxy-justcall-recording?call_id=${encodeURIComponent(call.id)}&token=${encodeURIComponent(token)}`;
        if (!cancelled) setAudioSrc(url);
      } catch {
        if (!cancelled) setAudioSrc(null);
      }
    }
    buildAudioUrl();
    return () => {
      cancelled = true;
    };
  }, [call?.id, call?.has_recording]);

  useEffect(() => {
    let cancelled = false;
    async function loadActionItems() {
      if (!id || !orgId) return;
      setLoadingActionItems(true);
      try {
        const { data, error } = await supabase
          .from('call_action_items')
          .select('*')
          .eq('org_id', orgId)
          .eq('call_id', id)
          .order('deadline_at', { ascending: true });
        if (error) throw error;
        if (!cancelled) setCallActionItems((data || []) as any[]);
      } catch {
        if (!cancelled) setCallActionItems([]);
      } finally {
        if (!cancelled) setLoadingActionItems(false);
      }
    }
    loadActionItems();
    return () => {
      cancelled = true;
    };
  }, [id, orgId]);

  const handleExtractActionItems = async () => {
    if (!id) return;
    setExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke('extract-router', {
        body: { action: 'call_action_items', callId: id },
      });
      if (error) throw error;

      const created = Number((data as any)?.itemsCreated || 0);
      if (created === 0) {
        // keep message helpful: transcript might not be ready yet
        // (function returns 202 with message; invoke still returns data)
      }

      // Refresh list
      if (orgId) {
        const { data: refreshed } = await supabase
          .from('call_action_items')
          .select('*')
          .eq('org_id', orgId)
          .eq('call_id', id)
          .order('deadline_at', { ascending: true });
        setCallActionItems((refreshed || []) as any[]);
      }
    } finally {
      setExtracting(false);
    }
  };

  const seed = useMemo(() => {
    if (!call) return '';
    return `${call.id}:${call.duration_seconds || 0}:${call.direction}`;
  }, [call]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading call…
        </div>
      </div>
    );
  }

  if (error || !call) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <button
          onClick={() => navigate('/calls')}
          className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Calls
        </button>
        <div className="mt-6 rounded-xl border border-rose-200/60 dark:border-rose-500/20 bg-rose-50/60 dark:bg-rose-950/30 p-4 text-rose-700 dark:text-rose-300">
          {error || 'Call not found'}
        </div>
      </div>
    );
  }

  const started = call.started_at ? new Date(call.started_at) : null;

  const transcriptBadge =
    call.transcript_status === 'ready'
      ? { label: 'Transcript ready', cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20' }
      : call.transcript_status === 'queued' || call.transcript_status === 'processing'
        ? { label: 'Transcribing', cls: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20' }
        : call.transcript_status === 'failed'
          ? { label: 'Transcript failed', cls: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20' }
          : { label: 'No transcript', cls: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20' };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between gap-4">
        <Link
          to="/calls"
          className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Calls
        </Link>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-gray-900/40 p-6">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <PhoneCall className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-xl font-semibold text-slate-900 dark:text-white">
                {call.direction === 'inbound' ? 'Inbound call' : call.direction === 'outbound' ? 'Outbound call' : 'Call'}
              </div>
              {call.has_recording && (
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
              <span className="inline-flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {started ? started.toLocaleString() : '—'}
              </span>
              <span className="text-slate-400 dark:text-slate-600">·</span>
              <span>Duration: {formatDuration(call.duration_seconds)}</span>
              {call.owner_email && (
                <>
                  <span className="text-slate-400 dark:text-slate-600">·</span>
                  <span className="truncate">Owner: {call.owner_email}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5">
          <AudioWaveform seed={seed} height={56} />
        </div>

        {audioSrc ? (
          <div className="mt-4">
            <audio controls preload="metadata" className="w-full">
              <source src={audioSrc} type={call.recording_mime || 'audio/mpeg'} />
            </audio>
          </div>
        ) : (
          <div className="mt-4 text-sm text-slate-600 dark:text-slate-400">
            {call.has_recording ? 'Recording is available, but playback could not be initialized.' : 'No recording available for this call.'}
          </div>
        )}
      </div>

      <div className="mt-6">
        <Tabs defaultValue="tasks">
          <TabsList>
            <TabsTrigger value="transcript">Transcript</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="tasks">
              Tasks
              {pendingCount > 0 ? (
                <span className="ml-2 inline-flex items-center justify-center rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20 px-2 py-0.5 text-xs">
                  {pendingCount}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tasks" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-gray-900/40 p-6">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">AI Suggestions</div>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    {suggestionsLoading ? 'Loading…' : `${pendingCount} pending`}
                  </div>
                </div>

                <NextActionSuggestions
                  activityId={call.id}
                  activityType="call"
                  suggestions={suggestions}
                  onSuggestionUpdate={async () => {
                    await refetchSuggestions();
                  }}
                  showPendingCount
                />
              </div>

              <div className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-gray-900/40 p-6">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">Action Items</div>
                  <Button size="sm" variant="outline" onClick={handleExtractActionItems} disabled={extracting || call.transcript_status !== 'ready'}>
                    {extracting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Extracting…
                      </>
                    ) : (
                      'Extract from Transcript'
                    )}
                  </Button>
                </div>

                {loadingActionItems ? (
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading action items…
                  </div>
                ) : (
                  <CallActionItemsList
                    callId={call.id}
                    actionItems={callActionItems as any}
                    onTasksCreated={async () => {
                      if (!orgId) return;
                      const { data } = await supabase
                        .from('call_action_items')
                        .select('*')
                        .eq('org_id', orgId)
                        .eq('call_id', call.id)
                        .order('deadline_at', { ascending: true });
                      setCallActionItems((data || []) as any[]);
                    }}
                  />
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="transcript" className="mt-4">
            <div className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-gray-900/40 p-6">
              {call.transcript_text ? (
                <div className="whitespace-pre-wrap text-sm leading-6 text-slate-800 dark:text-slate-200">
                  {call.transcript_text}
                </div>
              ) : (
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  {call.transcript_status === 'queued' || call.transcript_status === 'processing'
                    ? 'Transcript is being generated. It should appear here shortly.'
                    : 'No transcript available yet.'}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="details" className="mt-4">
            <div className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-gray-900/40 p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-slate-500 dark:text-slate-400">From</div>
                  <div className="text-slate-900 dark:text-white">{call.from_number || '—'}</div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">To</div>
                  <div className="text-slate-900 dark:text-white">{call.to_number || '—'}</div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Status</div>
                  <div className="text-slate-900 dark:text-white">{call.status || '—'}</div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Provider</div>
                  <div className="text-slate-900 dark:text-white">{call.provider}</div>
                </div>
                <div className="sm:col-span-2">
                  <div className="text-slate-500 dark:text-slate-400">External ID</div>
                  <div className="text-slate-900 dark:text-white break-all">{call.external_id}</div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}













