import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase/clientV2';
import { ProcessMapButton, ProcessMapDisplay } from '@/components/process-maps';
import { useOrgId } from '@/lib/contexts/OrgContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  ArrowUpRight,
  Calendar,
  Clock,
  Loader2,
  RefreshCw,
  Sparkles,
  Wand2,
  ListChecks,
  Check,
  X,
} from 'lucide-react';
import { useNextActionSuggestions } from '@/lib/hooks/useNextActionSuggestions';
import { nextActionsService } from '@/lib/services/nextActionsService';
import { ActionItemsList } from '@/components/meetings/ActionItemsList';
import { CallActionItemsList } from '@/components/calls/CallActionItemsList';
import { TaskQuickView } from '@/components/TaskQuickView';
import type { Task } from '@/lib/database/models';

type ActivityType = 'meeting' | 'call';

type SmartTaskTemplateRow = {
  id: string;
  trigger_activity_type: string;
  task_title: string;
  task_description: string | null;
  days_after_trigger: number;
  task_type: string;
  priority: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  clerk_org_id?: string | null;
};

type MeetingRow = {
  id: string;
  title: string | null;
  meeting_start: string | null;
  meeting_end: string | null;
  duration_minutes: number | null;
  share_url: string | null;
  fathom_recording_id: string | null;
  owner_email: string | null;
  transcript_text: string | null;
};

type CallRow = {
  id: string;
  started_at: string | null;
  duration_seconds: number | null;
  direction: string | null;
  from_number: string | null;
  to_number: string | null;
  owner_email: string | null;
  transcript_status: string | null;
  transcript_text: string | null;
};

function safeDateLabel(iso: string | null | undefined) {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '—';
  return format(dt, 'dd MMM yyyy, HH:mm');
}

function formatCallLabel(c: CallRow) {
  const dir = c.direction || 'call';
  const from = c.from_number || '—';
  const to = c.to_number || '—';
  const start = safeDateLabel(c.started_at);
  return `${start} · ${dir} · ${from} → ${to}`;
}

function formatMeetingLabel(m: MeetingRow) {
  const title = (m.title || 'Meeting').trim();
  const start = safeDateLabel(m.meeting_start);
  return `${start} · ${title}`;
}

function getNowUtcIso() {
  // Always show seconds for debugging timezone drift
  return new Date().toISOString();
}

function getNowLocalLabel() {
  return new Date().toLocaleString();
}

function getDueDeltaLabel(due?: string) {
  if (!due) return 'No due date';
  const dt = new Date(due);
  if (Number.isNaN(dt.getTime())) return 'Invalid due date';
  const now = new Date();
  const diffMs = dt.getTime() - now.getTime();
  const diffDays = Math.round(Math.abs(diffMs) / (1000 * 60 * 60 * 24));
  if (diffMs < 0) return `${diffDays} day(s) overdue`;
  if (diffDays === 0) return 'Due today';
  return `Due in ${diffDays} day(s)`;
}

export default function TasksDemo() {
  const orgId = useOrgId();
  const navigate = useNavigate();
  // Supabase generated types can drift vs migrations and cause noisy TS errors.
  // Use an untyped alias here (runtime behavior unchanged).
  const sb: any = supabase;

  const [activityType, setActivityType] = useState<ActivityType>('meeting');
  const [activityId, setActivityId] = useState<string>('');
  const [manualId, setManualId] = useState<string>('');

  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [calls, setCalls] = useState<CallRow[]>([]);

  const [isLoadingActivityList, setIsLoadingActivityList] = useState(false);
  const [activityListError, setActivityListError] = useState<string | null>(null);

  const [meetingDetail, setMeetingDetail] = useState<MeetingRow | null>(null);
  const [callDetail, setCallDetail] = useState<CallRow | null>(null);
  const selectedActivity = activityType === 'meeting' ? meetingDetail : callDetail;

  const [meetingActionItems, setMeetingActionItems] = useState<any[]>([]);
  const [callActionItems, setCallActionItems] = useState<any[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const [loadingActionItems, setLoadingActionItems] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [generatingSuggestions, setGeneratingSuggestions] = useState(false);

  const [quickViewTask, setQuickViewTask] = useState<Task | null>(null);

  const [smartTaskTemplates, setSmartTaskTemplates] = useState<SmartTaskTemplateRow[]>([]);
  const [loadingSmartTasks, setLoadingSmartTasks] = useState(false);
  const [smartTasksError, setSmartTasksError] = useState<string | null>(null);

  const {
    suggestions,
    loading: suggestionsLoading,
    refetch: refetchSuggestions,
    pendingCount,
  } = useNextActionSuggestions(activityId, activityType);

  const tasksById = useMemo(() => {
    const map = new Map<string, Task>();
    for (const t of tasks) map.set(t.id, t);
    return map;
  }, [tasks]);

  const loadActivityLists = useCallback(async () => {
    if (!orgId) return;
    setIsLoadingActivityList(true);
    setActivityListError(null);
    try {
      const [meetingsRes, callsRes] = await Promise.all([
        sb
          .from('meetings')
          .select('id, title, meeting_start, meeting_end, duration_minutes, share_url, fathom_recording_id, owner_email, transcript_text')
          .eq('org_id', orgId)
          .order('meeting_start', { ascending: false })
          .limit(50),
        sb
          .from('calls')
          .select('id, started_at, duration_seconds, direction, from_number, to_number, owner_email, transcript_status, transcript_text')
          .eq('org_id', orgId)
          .order('started_at', { ascending: false })
          .limit(50),
      ]);

      if (meetingsRes.error) throw meetingsRes.error;
      if (callsRes.error) throw callsRes.error;

      setMeetings((meetingsRes.data || []) as MeetingRow[]);
      setCalls((callsRes.data || []) as CallRow[]);

      // Default-select most recent meeting once
      if (!activityId && (meetingsRes.data || []).length > 0) {
        const first = (meetingsRes.data || [])[0] as MeetingRow;
        setActivityType('meeting');
        setActivityId(first.id);
        setManualId(first.id);
      }
    } catch (e: any) {
      setActivityListError(e?.message || 'Failed to load meetings/calls list');
    } finally {
      setIsLoadingActivityList(false);
    }
  }, [orgId, activityId]);

  const loadActivityDetail = useCallback(async () => {
    if (!orgId || !activityId) {
      setMeetingDetail(null);
      setCallDetail(null);
      return;
    }

    try {
      if (activityType === 'meeting') {
        const { data, error } = await sb
          .from('meetings')
          .select('id, title, meeting_start, meeting_end, duration_minutes, share_url, fathom_recording_id, owner_email, transcript_text')
          .eq('org_id', orgId)
          .eq('id', activityId)
          .maybeSingle();
        if (error) throw error;
        setMeetingDetail((data || null) as MeetingRow | null);
        setCallDetail(null);
      } else {
        const { data, error } = await sb
          .from('calls')
          .select('id, started_at, duration_seconds, direction, from_number, to_number, owner_email, transcript_status, transcript_text')
          .eq('org_id', orgId)
          .eq('id', activityId)
          .maybeSingle();
        if (error) throw error;
        setCallDetail((data || null) as CallRow | null);
        setMeetingDetail(null);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load activity');
      setMeetingDetail(null);
      setCallDetail(null);
    }
  }, [orgId, activityId, activityType]);

  const loadActionItems = useCallback(async () => {
    if (!orgId || !activityId) return;
    setLoadingActionItems(true);
    try {
      if (activityType === 'meeting') {
        const { data, error } = await sb
          .from('meeting_action_items')
          .select('*')
          .eq('meeting_id', activityId)
          .order('deadline_at', { ascending: true });
        if (error) throw error;
        setMeetingActionItems((data || []) as any[]);
        setCallActionItems([]);
      } else {
        const { data, error } = await sb
          .from('call_action_items')
          .select('*')
          .eq('org_id', orgId)
          .eq('call_id', activityId)
          .order('deadline_at', { ascending: true });
        if (error) throw error;
        setCallActionItems((data || []) as any[]);
        setMeetingActionItems([]);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load action items');
      setMeetingActionItems([]);
      setCallActionItems([]);
    } finally {
      setLoadingActionItems(false);
    }
  }, [orgId, activityId, activityType]);

  const loadTasks = useCallback(async () => {
    if (!orgId || !activityId) return;
    setLoadingTasks(true);
    try {
      let query = sb
        .from('tasks')
        .select('id, title, description, due_date, completed, completed_at, priority, status, task_type, assigned_to, created_by, metadata, created_at, updated_at, meeting_id, call_id')
        .order('created_at', { ascending: false })
        .limit(200);

      if (activityType === 'meeting') query = query.eq('meeting_id', activityId);
      else query = query.eq('call_id', activityId);

      const { data, error } = await query;
      if (error) throw error;
      setTasks((data || []) as Task[]);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load tasks');
      setTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  }, [orgId, activityId, activityType]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadActivityDetail(), loadActionItems(), loadTasks(), refetchSuggestions()]);
  }, [loadActivityDetail, loadActionItems, loadTasks, refetchSuggestions]);

  const loadSmartTaskTemplates = useCallback(async () => {
    setLoadingSmartTasks(true);
    setSmartTasksError(null);
    try {
      // Current DB schema stores scoping via clerk_org_id (TEXT) and also supports global
      // templates (NULL/empty clerk_org_id). For this demo page, we load all templates.
      const { data, error } = await sb
        .from('smart_task_templates')
        .select('id, trigger_activity_type, task_title, task_description, days_after_trigger, task_type, priority, is_active, created_at, updated_at, clerk_org_id')
        .order('trigger_activity_type', { ascending: true })
        .order('days_after_trigger', { ascending: true })
        .order('task_title', { ascending: true });

      if (error) throw error;
      setSmartTaskTemplates((data || []) as SmartTaskTemplateRow[]);
    } catch (e: any) {
      setSmartTaskTemplates([]);
      setSmartTasksError(e?.message || 'Failed to load smart task templates');
    } finally {
      setLoadingSmartTasks(false);
    }
  }, [sb]);

  useEffect(() => {
    loadActivityLists();
  }, [loadActivityLists]);

  useEffect(() => {
    if (!orgId || !activityId) return;
    refreshAll();
  }, [orgId, activityId, activityType]);

  useEffect(() => {
    loadSmartTaskTemplates();
  }, [loadSmartTaskTemplates]);

  const handleExtractActionItems = async () => {
    if (!activityId) return;
    setExtracting(true);
    try {
      if (activityType === 'meeting') {
        const res = await sb.functions.invoke('extract-router', {
          body: { action: 'action_items', meetingId: activityId },
        });
        if (res.error) throw res.error;
        const created = Number((res.data as any)?.itemsCreated || 0);
        toast.success(created > 0 ? `Extracted ${created} meeting action item(s)` : 'No action items extracted');
      } else {
        const res = await sb.functions.invoke('extract-router', {
          body: { action: 'call_action_items', callId: activityId },
        });
        if (res.error) throw res.error;
        const created = Number((res.data as any)?.itemsCreated || 0);
        toast.success(created > 0 ? `Extracted ${created} call action item(s)` : 'No action items extracted');
      }

      await loadActionItems();
    } catch (e: any) {
      toast.error(e?.message || 'Extraction failed');
    } finally {
      setExtracting(false);
    }
  };

  const handleGenerateSuggestions = async () => {
    if (!activityId) return;
    setGeneratingSuggestions(true);
    try {
      const result = await nextActionsService.generateSuggestions(activityId, activityType, true);
      toast.success(`Generated ${result.count} suggestion(s)`);
      await refetchSuggestions();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to generate suggestions');
    } finally {
      setGeneratingSuggestions(false);
    }
  };

  const handleAcceptSuggestion = async (suggestionId: string) => {
    try {
      const { error } = await (sb.rpc as any)('accept_next_action_suggestion', {
        p_suggestion_id: suggestionId,
        p_task_data: null,
      });
      if (error) throw error;
      toast.success('Created task from suggestion');
      await Promise.all([refetchSuggestions(), loadTasks()]);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to accept suggestion');
    }
  };

  const handleDismissSuggestion = async (suggestionId: string) => {
    try {
      const { error } = await (sb.rpc as any)('dismiss_next_action_suggestion', {
        p_suggestion_id: suggestionId,
        p_feedback: null,
      });
      if (error) throw error;
      toast.success('Dismissed suggestion');
      await refetchSuggestions();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to dismiss suggestion');
    }
  };

  const onSelectFromDropdown = (id: string) => {
    setActivityId(id);
    setManualId(id);
  };

  const applyManualId = () => {
    const trimmed = manualId.trim();
    if (!trimmed) return;
    setActivityId(trimmed);
  };

  const openInDetail = () => {
    if (!activityId) return;
    navigate(activityType === 'meeting' ? `/meetings/${activityId}` : `/calls/${activityId}`);
  };

  const statusBadges = useMemo(() => {
    const items: Array<{ label: string; value: string }> = [];
    items.push({ label: 'Local now', value: getNowLocalLabel() });
    items.push({ label: 'UTC now', value: getNowUtcIso() });

    if (activityType === 'meeting' && meetingDetail) {
      items.push({ label: 'Meeting start', value: safeDateLabel(meetingDetail.meeting_start) });
      items.push({ label: 'Transcript', value: meetingDetail.transcript_text ? 'present' : 'missing' });
      items.push({ label: 'Fathom recording', value: meetingDetail.fathom_recording_id ? 'present' : 'missing' });
    }

    if (activityType === 'call' && callDetail) {
      items.push({ label: 'Call start', value: safeDateLabel(callDetail.started_at) });
      items.push({ label: 'Transcript status', value: callDetail.transcript_status || '—' });
      items.push({ label: 'Transcript', value: callDetail.transcript_text ? 'present' : 'missing' });
    }

    return items;
  }, [activityType, meetingDetail, callDetail]);

  const suggestionsList = useMemo(() => {
    return [...suggestions].sort((a: any, b: any) => {
      const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
      return (order[a.urgency] ?? 9) - (order[b.urgency] ?? 9);
    });
  }, [suggestions]);

  const actionItemsForDisplay = activityType === 'meeting' ? meetingActionItems : callActionItems;

  const smartTemplatesSummary = useMemo(() => {
    const active = smartTaskTemplates.filter((t) => t.is_active !== false);
    const byTrigger = new Map<string, number>();
    for (const t of active) {
      const key = t.trigger_activity_type || 'unknown';
      byTrigger.set(key, (byTrigger.get(key) || 0) + 1);
    }
    return {
      total: smartTaskTemplates.length,
      active: active.length,
      byTrigger: Array.from(byTrigger.entries()).sort((a, b) => a[0].localeCompare(b[0])),
    };
  }, [smartTaskTemplates]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Tasks Demo</h1>
          <p className="text-sm text-muted-foreground">
            Meeting-first lab to test extraction → suggestions → tasks, with a toggle to calls.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ProcessMapButton
            processType="workflow"
            processName="task_extraction"
            variant="outline"
            size="sm"
            label="Process Map"
          />
          <Button variant="outline" size="sm" onClick={openInDetail} disabled={!activityId}>
            <ArrowUpRight className="w-4 h-4 mr-1.5" />
            Open detail
          </Button>
          <Button variant="outline" size="sm" onClick={refreshAll} disabled={!activityId}>
            <RefreshCw className="w-4 h-4 mr-1.5" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>What’s automatic vs manual?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3">
              <div className="font-medium mb-1">Automatic</div>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>
                  <span className="text-foreground font-medium">Meetings → AI Suggestions</span>: when a meeting gets a transcript/summary, a DB trigger
                  queues <span className="text-foreground">suggest-next-actions</span> (via pg_net). Suggestions then show up in this page automatically.
                </li>
                <li>
                  <span className="text-foreground font-medium">Smart Tasks</span>: when an <span className="text-foreground">activity</span> is inserted with a <span className="text-foreground">deal_id</span>,
                  DB triggers create follow-up tasks from <span className="text-foreground">smart_task_templates</span> (org-scoped).
                </li>
                <li>
                  <span className="text-foreground font-medium">Overdue notifications</span>: cron checks overdue tasks (guardrailed to avoid “wrong year” floods).
                </li>
              </ul>
            </div>

            <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3">
              <div className="font-medium mb-1">Manual</div>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>
                  <span className="text-foreground font-medium">Calls → AI Suggestions</span>: currently generated when you click <span className="text-foreground">Generate suggestions</span> (no calls-table trigger yet).
                </li>
                <li>
                  <span className="text-foreground font-medium">Action items extraction</span>: click <span className="text-foreground">Extract action items</span> to run the extraction edge function.
                </li>
                <li>
                  <span className="text-foreground font-medium">Task creation from AI</span>: Accepting a suggestion and converting action items are user actions (manual) that write tasks.
                </li>
              </ul>
            </div>

            <div className="text-xs text-muted-foreground">
              Deadline safety: AI prompts include today’s date, and task creation clamps past due dates and records metadata for auditability.
            </div>
          </CardContent>
        </Card>

        <ProcessMapDisplay
          processType="workflow"
          processName="task_extraction"
          title="Task Extraction Flow"
          description="Visual diagram showing how tasks are extracted from meetings and calls"
          showControls={true}
          showCode={true}
          showDirectionToggle={true}
          defaultDirection="vertical"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3 flex-wrap">
            <span>Smart Tasks configuration (auto-created follow-ups)</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={loadSmartTaskTemplates} disabled={loadingSmartTasks}>
                {loadingSmartTasks ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                <span className="ml-2">Refresh</span>
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigate('/platform/crm/smart-tasks')}>
                Open settings
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {smartTasksError && (
            <div className="text-sm text-amber-700 dark:text-amber-300">
              {smartTasksError}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              total: {smartTemplatesSummary.total}
            </Badge>
            <Badge variant="outline">
              active: {smartTemplatesSummary.active}
            </Badge>
            {smartTemplatesSummary.byTrigger.map(([trigger, count]) => (
              <Badge key={trigger} variant="outline" className="capitalize">
                {trigger}: {count}
              </Badge>
            ))}
          </div>

          <div className="text-xs text-muted-foreground">
            These templates run automatically when an <span className="text-foreground">activity</span> is created with a <span className="text-foreground">deal_id</span> and its type matches <span className="text-foreground">trigger_activity_type</span>.
            They do not depend on meeting/call transcripts; they’re triggered by CRM activities.
          </div>

          <div className="overflow-auto rounded-lg border border-gray-200 dark:border-gray-800">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/70 dark:bg-gray-900/30 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left p-2">Trigger</th>
                  <th className="text-left p-2">Title</th>
                  <th className="text-left p-2">Days</th>
                  <th className="text-left p-2">Type</th>
                  <th className="text-left p-2">Priority</th>
                  <th className="text-left p-2">Active</th>
                </tr>
              </thead>
              <tbody>
                {smartTaskTemplates.length === 0 && !loadingSmartTasks ? (
                  <tr>
                    <td className="p-3 text-sm text-muted-foreground" colSpan={6}>
                      No templates found for this org.
                    </td>
                  </tr>
                ) : (
                  smartTaskTemplates.map((t) => (
                    <tr key={t.id} className="border-t border-gray-200 dark:border-gray-800">
                      <td className="p-2 capitalize">{t.trigger_activity_type}</td>
                      <td className="p-2">{t.task_title}</td>
                      <td className="p-2">{t.days_after_trigger}</td>
                      <td className="p-2 capitalize">{t.task_type}</td>
                      <td className="p-2 capitalize">{t.priority || '—'}</td>
                      <td className="p-2">{t.is_active === false ? 'No' : 'Yes'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between flex-wrap gap-3">
            <span>Activity selector</span>
            {isLoadingActivityList && (
              <span className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading…
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {activityListError && (
            <div className="text-sm text-red-600 dark:text-red-400">{activityListError}</div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Type (meeting-first)</div>
              <Select
                value={activityType}
                onValueChange={(v) => {
                  const next = v as ActivityType;
                  setActivityType(next);
                  // Default to most recent in that bucket, but don’t clobber manual ID if we have one
                  const list = next === 'meeting' ? meetings : calls;
                  const first = list[0];
                  if (first && !manualId.trim()) {
                    const id = (first as any).id as string;
                    setActivityId(id);
                    setManualId(id);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="call">Call</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Recent {activityType}s</div>
              <Select value={activityId || ''} onValueChange={onSelectFromDropdown}>
                <SelectTrigger>
                  <SelectValue placeholder={`Select a ${activityType}…`} />
                </SelectTrigger>
                <SelectContent>
                  {(activityType === 'meeting' ? meetings : calls).map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {activityType === 'meeting'
                        ? formatMeetingLabel(row as MeetingRow)
                        : formatCallLabel(row as CallRow)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Or paste ID</div>
              <div className="flex gap-2">
                <Input
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                  placeholder={`${activityType} id`}
                />
                <Button variant="outline" onClick={applyManualId} disabled={!manualId.trim()}>
                  Apply
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {statusBadges.map((b) => (
              <Badge key={b.label} variant="outline" className="gap-2">
                <span className="text-muted-foreground">{b.label}:</span>
                <span>{b.value}</span>
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="actions">
        <TabsList>
          <TabsTrigger value="actions">Extraction</TabsTrigger>
          <TabsTrigger value="suggestions">
            Suggestions
            {pendingCount > 0 ? (
              <span className="ml-2 inline-flex items-center justify-center rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20 px-2 py-0.5 text-xs">
                {pendingCount}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="items">Action items</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
        </TabsList>

        <TabsContent value="actions" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ListChecks className="w-5 h-5" />
                  Extraction controls
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleExtractActionItems} disabled={!activityId || extracting}>
                    {extracting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Extracting…
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4 mr-2" />
                        Extract action items
                      </>
                    )}
                  </Button>

                  <Button
                    variant="outline"
                    onClick={handleGenerateSuggestions}
                    disabled={!activityId || generatingSuggestions}
                  >
                    {generatingSuggestions ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating…
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generate suggestions
                      </>
                    )}
                  </Button>

                  <Button variant="outline" onClick={refreshAll} disabled={!activityId}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh all
                  </Button>
                </div>

                <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 text-sm">
                  <div className="font-medium mb-1">Selected</div>
                  <div className="text-muted-foreground">
                    {activityType === 'meeting'
                      ? meetingDetail
                        ? formatMeetingLabel(meetingDetail)
                        : activityId
                      : callDetail
                        ? formatCallLabel(callDetail)
                        : activityId}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Debug
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Suggestions</span>
                  <span>{suggestionsLoading ? 'Loading…' : `${suggestions.length} total`}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Action items</span>
                  <span>{loadingActionItems ? 'Loading…' : `${actionItemsForDisplay.length} total`}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Tasks</span>
                  <span>{loadingTasks ? 'Loading…' : `${tasks.length} total`}</span>
                </div>
                <div className="pt-2 border-t border-gray-200 dark:border-gray-800 text-xs text-muted-foreground">
                  The AI prompts are date-hardened (today injected). This page helps validate deadlines and any clamping/repair metadata.
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="suggestions" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between flex-wrap gap-3">
                <span className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  Suggestions
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{pendingCount} pending</Badge>
                  <Button variant="outline" size="sm" onClick={refetchSuggestions} disabled={!activityId}>
                    <RefreshCw className="w-4 h-4 mr-1.5" />
                    Refresh
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!activityId ? (
                <div className="text-sm text-muted-foreground">Select a meeting (or toggle to calls).</div>
              ) : suggestionsLoading ? (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading suggestions…
                </div>
              ) : suggestionsList.length === 0 ? (
                <div className="text-sm text-muted-foreground">No suggestions yet. Click “Generate suggestions”.</div>
              ) : (
                <div className="space-y-2">
                  {suggestionsList.map((s: any) => {
                    const createdTask = s.created_task_id ? tasksById.get(s.created_task_id) : undefined;
                    const recommended = s.recommended_deadline ? new Date(s.recommended_deadline) : null;
                    const isRecommendedPast = recommended ? recommended.getTime() < Date.now() : false;
                    const meta = (createdTask as any)?.metadata || {};
                    const wasClamped = Boolean(meta?.due_date_was_clamped);
                    const originalDue = meta?.original_due_date;

                    return (
                      <div key={s.id} className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-gray-900 dark:text-gray-100 break-words">{s.title}</div>
                            <div className="mt-1 flex flex-wrap gap-2 text-xs">
                              <Badge variant="outline" className="capitalize">{s.activity_type}</Badge>
                              <Badge variant="outline" className="capitalize">{s.urgency}</Badge>
                              <Badge variant="outline" className="capitalize">{s.action_type}</Badge>
                              <Badge variant={s.status === 'pending' ? 'destructive' : 'secondary'} className="capitalize">
                                {s.status}
                              </Badge>
                              {s.recommended_deadline && (
                                <Badge variant="outline" className={isRecommendedPast ? 'border-red-400 text-red-600 dark:text-red-400' : ''}>
                                  <Calendar className="w-3.5 h-3.5 mr-1" />
                                  rec: {new Date(s.recommended_deadline).toLocaleDateString()} {isRecommendedPast ? '(past)' : ''}
                                </Badge>
                              )}
                              {createdTask?.due_date && (
                                <Badge variant="outline">
                                  due: {new Date(createdTask.due_date).toLocaleDateString()} ({getDueDeltaLabel(createdTask.due_date)})
                                </Badge>
                              )}
                              {wasClamped && (
                                <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">
                                  clamped
                                </Badge>
                              )}
                              {originalDue && (
                                <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-300">
                                  original: {String(originalDue).slice(0, 10)}
                                </Badge>
                              )}
                            </div>
                            {s.reasoning && (
                              <div className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
                                {s.reasoning}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {s.status === 'pending' && (
                              <>
                                <Button size="sm" onClick={() => handleAcceptSuggestion(s.id)}>
                                  <Check className="w-4 h-4 mr-1.5" />
                                  Accept
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => handleDismissSuggestion(s.id)}>
                                  <X className="w-4 h-4 mr-1.5" />
                                  Dismiss
                                </Button>
                              </>
                            )}
                            {createdTask && (
                              <Button size="sm" variant="outline" onClick={() => setQuickViewTask(createdTask)}>
                                View task
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="items" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Action items</span>
                  <Button size="sm" variant="outline" onClick={loadActionItems} disabled={!activityId || loadingActionItems}>
                    <RefreshCw className="w-4 h-4 mr-1.5" />
                    Refresh
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingActionItems ? (
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading action items…
                  </div>
                ) : !activityId ? (
                  <div className="text-sm text-muted-foreground">Select an activity first.</div>
                ) : activityType === 'meeting' ? (
                  <ActionItemsList
                    meetingId={activityId}
                    actionItems={meetingActionItems}
                    onTasksCreated={async () => {
                      await Promise.all([loadActionItems(), loadTasks(), refetchSuggestions()]);
                    }}
                  />
                ) : (
                  <CallActionItemsList
                    callId={activityId}
                    actionItems={callActionItems as any}
                    onTasksCreated={async () => {
                      await Promise.all([loadActionItems(), loadTasks(), refetchSuggestions()]);
                    }}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Raw counts</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total</span>
                  <span>{actionItemsForDisplay.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Synced to task</span>
                  <span>{actionItemsForDisplay.filter((i: any) => Boolean(i.synced_to_task)).length}</span>
                </div>
                <div className="text-xs text-muted-foreground pt-2 border-t border-gray-200 dark:border-gray-800">
                  Use this panel to confirm extraction runs, and then “Convert to Tasks” results in `synced_to_task=true`.
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="tasks" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between flex-wrap gap-3">
                <span>Tasks created from this {activityType}</span>
                <Button size="sm" variant="outline" onClick={loadTasks} disabled={!activityId || loadingTasks}>
                  <RefreshCw className="w-4 h-4 mr-1.5" />
                  Refresh
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingTasks ? (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading tasks…
                </div>
              ) : !activityId ? (
                <div className="text-sm text-muted-foreground">Select an activity first.</div>
              ) : tasks.length === 0 ? (
                <div className="text-sm text-muted-foreground">No tasks yet. Accept a suggestion or convert action items.</div>
              ) : (
                <div className="space-y-2">
                  {tasks.map((t) => {
                    const meta = (t as any).metadata || {};
                    const clamped = Boolean(meta?.due_date_was_clamped);
                    const originalDue = meta?.original_due_date;
                    const repaired = meta?.due_date_repair;

                    return (
                      <div
                        key={t.id}
                        className="rounded-xl border border-gray-200 dark:border-gray-800 p-3 cursor-pointer hover:bg-gray-50/60 dark:hover:bg-gray-900/30 transition-colors"
                        onClick={() => setQuickViewTask(t)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-gray-900 dark:text-gray-100 break-words">{t.title}</div>
                            <div className="mt-1 flex flex-wrap gap-2 text-xs">
                              <Badge variant="outline" className="capitalize">{t.task_type}</Badge>
                              <Badge variant="outline" className="capitalize">{t.priority}</Badge>
                              <Badge variant="outline" className="capitalize">{t.status}</Badge>
                              {t.due_date && (
                                <Badge variant="outline">
                                  due: {new Date(t.due_date).toLocaleDateString()} ({getDueDeltaLabel(t.due_date)})
                                </Badge>
                              )}
                              {clamped && (
                                <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">
                                  clamped
                                </Badge>
                              )}
                              {originalDue && (
                                <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-300">
                                  original: {String(originalDue).slice(0, 10)}
                                </Badge>
                              )}
                              {repaired?.repaired_at && (
                                <Badge variant="outline" className="border-emerald-400 text-emerald-700 dark:text-emerald-300">
                                  repaired
                                </Badge>
                              )}
                            </div>
                            {repaired?.repaired_at && (
                              <div className="mt-2 text-xs text-muted-foreground">
                                repaired_at: {String(repaired.repaired_at)} · reason: {String(repaired.reason || '—')}
                              </div>
                            )}
                          </div>

                          <div className="text-xs text-muted-foreground whitespace-nowrap">
                            created {t.created_at ? new Date(t.created_at).toLocaleString() : '—'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <TaskQuickView
        open={Boolean(quickViewTask)}
        onOpenChange={(open) => {
          if (!open) setQuickViewTask(null);
        }}
        task={quickViewTask}
      />
    </div>
  );
}
