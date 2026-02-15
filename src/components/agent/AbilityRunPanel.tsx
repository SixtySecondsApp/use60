import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';
import { useOrchestratorJob } from '@/hooks/useOrchestratorJob';
import { LiveStepVisualizer } from '@/components/agent/LiveStepVisualizer';
import { LiveOutputPanel } from '@/components/agent/LiveOutputPanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Play, Loader2, RotateCcw, Zap, Send, MessageSquare, Mail, Bell, ChevronDown, ChevronUp, Code } from 'lucide-react';
import type { AbilityDefinition, DeliveryChannel } from '@/lib/agent/abilityRegistry';

interface AbilityRunPanelProps {
  ability: AbilityDefinition;
  activeChannels: DeliveryChannel[];
  isEnabled: boolean;
}

export function AbilityRunPanel({ ability, activeChannels, isEnabled }: AbilityRunPanelProps) {
  const { user } = useAuth();
  const orgId = useOrgStore(s => s.activeOrgId);

  // Channel icon helper
  const getChannelIcon = (channel: DeliveryChannel) => {
    switch (channel) {
      case 'slack':
        return MessageSquare;
      case 'email':
        return Mail;
      case 'in-app':
        return Bell;
    }
  };

  const getChannelColor = (channel: DeliveryChannel) => {
    switch (channel) {
      case 'slack':
        return 'text-purple-600 dark:text-purple-400';
      case 'email':
        return 'text-blue-600 dark:text-blue-400';
      case 'in-app':
        return 'text-green-600 dark:text-green-400';
    }
  };

  const [selectedMeetingId, setSelectedMeetingId] = useState<string>('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // V1 simulate state (delivery channels now controlled by card toggles)
  const [v1UseRealData, setV1UseRealData] = useState(true);
  const [v1DryRun, setV1DryRun] = useState(false);
  const [v1Result, setV1Result] = useState<Record<string, unknown> | null>(null);

  // Fetch recent meetings — available for all abilities as optional context
  const shouldFetchMeetings =
    ability.backendType === 'orchestrator' || ability.backendType === 'v1-simulate';

  // Meeting required only for orchestrator meeting-triggered abilities
  const meetingRequired =
    ability.backendType === 'orchestrator' &&
    (ability.eventType === 'meeting_ended' || ability.eventType === 'pre_meeting_90min');

  const { data: meetings, isLoading: loadingMeetings } = useQuery({
    queryKey: ['recent-meetings', orgId, user?.id],
    queryFn: async () => {
      if (!user?.id || !orgId) return [];

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error } = await supabase
        .from('meetings')
        .select('id, title, meeting_start, org_id')
        .eq('owner_user_id', user.id)
        .not('transcript_text', 'is', null)
        .gte('meeting_start', thirtyDaysAgo.toISOString())
        .order('meeting_start', { ascending: false })
        .limit(15);

      if (error) throw error;
      return data || [];
    },
    enabled: shouldFetchMeetings && !!user?.id && !!orgId,
  });

  // Track orchestrator job
  const { stepResults, jobStatus, reset: resetJob } = useOrchestratorJob(jobId);

  const handleRunOrchestrator = async () => {
    if (!user?.id || !orgId) {
      toast.error('Missing user or organization');
      return;
    }

    if (!isEnabled) {
      toast.error('This ability is paused. Enable it first.');
      return;
    }

    if (meetingRequired && !selectedMeetingId) {
      toast.error('Please select a meeting');
      return;
    }

    setIsRunning(true);

    try {
      const selectedMeeting = meetings?.find(m => m.id === selectedMeetingId);

      const { data, error } = await supabase.functions.invoke('agent-orchestrator', {
        body: {
          type: ability.eventType,
          source: 'manual',
          org_id: selectedMeeting?.org_id || orgId,
          user_id: user.id,
          channels: activeChannels, // Include selected delivery channels
          payload: meetingRequired
            ? {
                meeting_id: selectedMeetingId,
                title: selectedMeeting?.title,
                transcript_available: true,
              }
            : {},
        },
      });

      if (error) {
        let errorMsg = error.message || 'Unknown error';
        try {
          if (error.context && typeof error.context.json === 'function') {
            const body = await error.context.json();
            errorMsg = body?.error || errorMsg;
          }
        } catch { /* ignore parse errors */ }
        throw new Error(errorMsg);
      }

      if (data?.job_id) {
        setJobId(data.job_id);
        toast.success('Orchestrator started', {
          description: `Job ID: ${data.job_id.slice(0, 8)}...`,
        });
      } else {
        toast.error('No job ID returned');
        setIsRunning(false);
      }
    } catch (error) {
      console.error('Error running orchestrator:', error);
      toast.error('Failed to start orchestrator', {
        description: error instanceof Error ? error.message : undefined,
      });
      setIsRunning(false);
    }
  };

  const handleReset = () => {
    setJobId(null);
    setIsRunning(false);
    setSelectedMeetingId('');
    resetJob();
  };

  // Auto-reset when job reaches terminal state
  useEffect(() => {
    if (jobStatus === 'completed') {
      setIsRunning(false);
      toast.success('Orchestrator completed', {
        description: `${stepResults.filter(s => s.status === 'completed').length} steps completed`,
      });
    } else if (jobStatus === 'failed') {
      setIsRunning(false);
      toast.error('Orchestrator failed');
    }
  }, [jobStatus, stepResults]);

  const Icon = ability.icon;

  const renderOrchestratorPanel = () => (
    <div className="space-y-4">
      {/* Channel delivery info */}
      {activeChannels.length > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Delivering to:</span>
          <div className="flex items-center gap-2">
            {activeChannels.map((channel) => {
              const ChannelIcon = getChannelIcon(channel);
              return (
                <Badge key={channel} variant="outline" className="gap-1">
                  <ChannelIcon className={`w-3 h-3 ${getChannelColor(channel)}`} />
                  {channel === 'in-app' ? 'In-App' : channel.charAt(0).toUpperCase() + channel.slice(1)}
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Left column: Controls + Visualizer */}
        <div className="space-y-4">
          {/* Meeting picker for meeting-triggered abilities */}
          {meetingRequired && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Meeting</label>
            <select
              value={selectedMeetingId}
              onChange={(e) => setSelectedMeetingId(e.target.value)}
              disabled={isRunning || loadingMeetings}
              className="w-full px-3 py-2 border rounded-md bg-background"
            >
              <option value="">Choose a meeting...</option>
              {meetings?.map((meeting) => (
                <option key={meeting.id} value={meeting.id}>
                  {meeting.title} ({new Date(meeting.meeting_start).toLocaleDateString()})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Run button */}
        <div className="flex gap-2">
          <Button
            onClick={handleRunOrchestrator}
            disabled={!isEnabled || isRunning || (meetingRequired && !selectedMeetingId)}
            className="flex-1"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Run Orchestrator
              </>
            )}
          </Button>

          {jobId && (
            <Button
              onClick={handleReset}
              variant="outline"
              disabled={isRunning}
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Disabled overlay message */}
        {!isEnabled && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
            <p className="text-sm text-amber-800 dark:text-amber-400">
              This ability is paused. Enable it from the ability card to run it.
            </p>
          </div>
        )}

        {/* Step visualizer */}
        {jobId && (
          <div className="mt-6">
            <h3 className="text-sm font-medium mb-3">Execution Steps</h3>
            <LiveStepVisualizer stepResults={stepResults} jobStatus={jobStatus} eventType={ability.eventType} />
          </div>
        )}
      </div>

      {/* Right column: Output panel */}
      <div>
        {jobId && (
          <>
            <h3 className="text-sm font-medium mb-3">Output</h3>
            <LiveOutputPanel stepResults={stepResults} jobStatus={jobStatus} jobId={jobId} eventType={ability.eventType} />
          </>
        )}
        </div>
      </div>
    </div>
  );

  const handleRunV1Simulate = async () => {
    if (!user?.id || !orgId) {
      toast.error('Missing user or organization');
      return;
    }

    if (!isEnabled) {
      toast.error('This ability is paused. Enable it first.');
      return;
    }

    setIsRunning(true);
    setV1Result(null);

    try {
      // Use active channels to determine delivery targets
      const sendSlack = activeChannels.includes('slack');
      const createInApp = activeChannels.includes('in-app');

      const { data, error } = await supabase.functions.invoke('proactive-simulate', {
        body: {
          orgId,
          feature: ability.eventType,
          targetUserId: user.id,
          sendSlack,
          createInApp,
          sendEmail: activeChannels.includes('email'),
          dryRun: v1DryRun,
          simulationMode: !v1UseRealData,
          entityIds: {
            ...(selectedMeetingId ? { meetingId: selectedMeetingId } : {}),
          },
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Simulation failed');

      setV1Result(data as Record<string, unknown>);
      toast.success('Simulation executed', {
        description: v1DryRun ? 'Dry run — nothing was sent' : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to run simulation';
      toast.error(msg);
    } finally {
      setIsRunning(false);
    }
  };

  const renderV1SimulatePanel = () => (
    <div className="space-y-4">
      {/* Linked skill badge */}
      {ability.skillKey && (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Zap className="w-3.5 h-3.5" />
          <span>Powered by skill:</span>
          <Badge variant="outline" className="text-[11px] font-mono">{ability.skillKey}</Badge>
        </div>
      )}

      {/* Channel delivery info */}
      {activeChannels.length > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Delivering to:</span>
          <div className="flex items-center gap-2">
            {activeChannels.map((channel) => {
              const ChannelIcon = getChannelIcon(channel);
              return (
                <Badge key={channel} variant="outline" className="gap-1">
                  <ChannelIcon className={`w-3 h-3 ${getChannelColor(channel)}`} />
                  {channel === 'in-app' ? 'In-App' : channel.charAt(0).toUpperCase() + channel.slice(1)}
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      {/* Optional meeting context picker */}
      {meetings && meetings.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Meeting Context <span className="text-muted-foreground font-normal">(optional)</span></label>
          <select
            value={selectedMeetingId}
            onChange={(e) => setSelectedMeetingId(e.target.value)}
            disabled={isRunning || loadingMeetings}
            className="w-full px-3 py-2 border rounded-md bg-background text-sm"
          >
            <option value="">No meeting selected</option>
            {meetings.map((meeting) => (
              <option key={meeting.id} value={meeting.id}>
                {meeting.title} ({new Date(meeting.meeting_start).toLocaleDateString()})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Data mode + dry run options */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2">
          <Switch id="v1-real" checked={v1UseRealData} onCheckedChange={setV1UseRealData} disabled={!isEnabled || isRunning} />
          <Label htmlFor="v1-real" className="text-sm">Live data</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="v1-dry" checked={v1DryRun} onCheckedChange={setV1DryRun} disabled={!isEnabled || isRunning} />
          <Label htmlFor="v1-dry" className="text-sm">Dry run</Label>
        </div>
      </div>

      {!v1UseRealData && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          Using demo data. Toggle Live data on to use your real meetings, deals, and contacts.
        </p>
      )}

      {/* Disabled overlay message */}
      {!isEnabled && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
          <p className="text-sm text-amber-800 dark:text-amber-400">
            This ability is paused. Enable it from the ability card to run it.
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <Button onClick={handleRunV1Simulate} disabled={!isEnabled || isRunning} className="gap-2">
          {isRunning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Run with {v1UseRealData ? 'live' : 'demo'} data
            </>
          )}
        </Button>
        {v1Result && (
          <Button
            variant="outline"
            onClick={() => setV1Result(null)}
            disabled={isRunning}
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Result */}
      {v1Result && (
        <V1ResultPreview result={v1Result} v1UseRealData={v1UseRealData} />
      )}
    </div>
  );

  const renderCronJobPanel = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Schedule</label>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            <Zap className="w-3 h-3 mr-1" />
            Cron schedule not configured
          </Badge>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button disabled variant="outline">
          <Play className="w-4 h-4 mr-2" />
          Run Now
        </Button>

        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Enable</label>
          <input
            type="checkbox"
            disabled
            className="w-4 h-4 rounded border-input"
          />
        </div>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle>{ability.name}</CardTitle>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-xs">
                {ability.backendType}
              </Badge>
              {ability.eventType && (
                <Badge variant="secondary" className="text-xs">
                  {ability.eventType}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {ability.backendType === 'orchestrator' && renderOrchestratorPanel()}
        {ability.backendType === 'v1-simulate' && renderV1SimulatePanel()}
        {ability.backendType === 'cron-job' && renderCronJobPanel()}
      </CardContent>
    </Card>
  );
}

// ─── Rich V1 Result Preview ──────────────────────────────────────────────

function V1ResultPreview({ result, v1UseRealData }: { result: Record<string, unknown>; v1UseRealData: boolean }) {
  const [showRaw, setShowRaw] = useState(false);
  const r = result as any;

  // Extract common fields from proactive-simulate responses
  const slackSent = r.slack?.sent || r.slackSent;
  const inAppCreated = r.inApp?.created || r.inAppCreated;
  const emailSent = r.email?.sent || r.emailSent;

  // Try to extract structured content from various response shapes
  const slackBlocks = r.slack?.blocks || r.blocks;
  const slackText = r.slack?.text || r.text || r.message;
  const emailSubject = r.email?.subject || r.subject;
  const emailBody = r.email?.body || r.body;
  const title = r.title || r.meetingTitle || r.dealName;
  const summary = r.summary || r.brief || r.digest;
  const actionItems = r.actionItems || r.action_items || r.tasks || [];
  const insights = r.insights || r.recommendations || r.coaching || [];

  return (
    <div className="space-y-3">
      {/* Status badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium">Result</span>
        {slackSent && <Badge variant="default" className="text-[10px] bg-purple-600">Slack sent</Badge>}
        {emailSent && <Badge variant="default" className="text-[10px] bg-blue-600">Email sent</Badge>}
        {inAppCreated && <Badge variant="secondary" className="text-[10px]">In-app created</Badge>}
        {v1UseRealData && <Badge variant="outline" className="text-[10px] text-emerald-600">Live data</Badge>}
      </div>

      {/* Rich preview card */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        {/* Title */}
        {title && (
          <h4 className="font-medium text-sm">{title}</h4>
        )}

        {/* Summary / main content */}
        {summary && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{typeof summary === 'string' ? summary.slice(0, 500) : JSON.stringify(summary)}</p>
        )}

        {/* Slack text preview */}
        {slackText && !summary && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-purple-600 dark:text-purple-400 font-medium">
              <MessageSquare className="w-3 h-3" />
              Slack Message
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap border-l-2 border-purple-300 dark:border-purple-700 pl-3">
              {typeof slackText === 'string' ? slackText.slice(0, 500) : JSON.stringify(slackText)}
            </p>
          </div>
        )}

        {/* Email preview */}
        {emailSubject && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 font-medium">
              <Mail className="w-3 h-3" />
              Email Draft
            </div>
            <div className="text-sm border-l-2 border-blue-300 dark:border-blue-700 pl-3">
              <div className="font-medium">{emailSubject}</div>
              {emailBody && <p className="text-muted-foreground mt-1 whitespace-pre-wrap">{typeof emailBody === 'string' ? emailBody.slice(0, 400) : ''}</p>}
            </div>
          </div>
        )}

        {/* Action items */}
        {Array.isArray(actionItems) && actionItems.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">Action Items ({actionItems.length})</div>
            <ul className="space-y-1">
              {actionItems.slice(0, 5).map((item: any, i: number) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                  <span className="text-emerald-500 mt-0.5">&#10003;</span>
                  <span>{typeof item === 'string' ? item : item.title || item.task || item.text || JSON.stringify(item)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Insights / recommendations */}
        {Array.isArray(insights) && insights.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">Insights ({insights.length})</div>
            <ul className="space-y-1">
              {insights.slice(0, 3).map((item: any, i: number) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5">&#9679;</span>
                  <span>{typeof item === 'string' ? item : item.action || item.text || item.recommendation || JSON.stringify(item)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Slack Block Kit sections preview */}
        {Array.isArray(slackBlocks) && slackBlocks.length > 0 && !slackText && !summary && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-purple-600 dark:text-purple-400 font-medium">
              <MessageSquare className="w-3 h-3" />
              Slack Blocks ({slackBlocks.length})
            </div>
            {slackBlocks.slice(0, 4).map((block: any, i: number) => (
              <div key={i} className="text-xs text-muted-foreground border-l-2 border-purple-200 dark:border-purple-800 pl-3">
                {block.text?.text || block.text || (block.type === 'divider' ? '---' : block.type)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Raw JSON toggle */}
      <button
        onClick={() => setShowRaw(!showRaw)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Code className="w-3 h-3" />
        {showRaw ? 'Hide' : 'Show'} Raw JSON
        {showRaw ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {showRaw && (
        <Textarea
          value={JSON.stringify(result, null, 2)}
          readOnly
          className="min-h-[180px] font-mono text-xs"
        />
      )}
    </div>
  );
}
