/**
 * ProactiveSimulator
 *
 * Platform admin tool to simulate Proactive 60 notifications end-to-end:
 * - Sends a Slack DM (via edge function using org bot token + slack user mapping)
 * - Mirrors into in-app notifications (public.notifications)
 *
 * This is designed for fast demo/QA on internal accounts.
 */

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Send, Bell, MessageSquare, CheckSquare, Mail, Activity, ShieldAlert, Sparkles } from 'lucide-react';

import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrg } from '@/lib/contexts/OrgContext';

import { BackToPlatform } from '@/components/platform/BackToPlatform';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { SlackSelfMapping } from '@/components/settings/SlackSelfMapping';

type ProactiveSimulateFeature =
  | 'morning_brief'
  | 'sales_assistant_digest'
  | 'pre_meeting_nudge'
  | 'post_call_summary'
  | 'stale_deal_alert'
  | 'email_reply_alert'
  | 'hitl_followup_email'
  | 'ai_smart_suggestion';

const FEATURE_META: Array<{
  key: ProactiveSimulateFeature;
  title: string;
  description: string;
  icon: typeof Bell;
}> = [
  {
    key: 'morning_brief',
    title: 'Morning Brief (daily)',
    description: 'Start-of-day priorities: meetings, tasks, pipeline, and next steps.',
    icon: Bell,
  },
  {
    key: 'sales_assistant_digest',
    title: 'Sales Assistant Digest (15‑min)',
    description: 'Action items: emails to respond, ghost risks, upcoming meetings, deal risks.',
    icon: Activity,
  },
  {
    key: 'pre_meeting_nudge',
    title: 'Pre‑Meeting Nudge (10‑min)',
    description: 'Talking points and context right before a meeting starts.',
    icon: MessageSquare,
  },
  {
    key: 'post_call_summary',
    title: 'Post‑Call Summary',
    description: 'Meeting summary + action items + follow-up draft teaser.',
    icon: CheckSquare,
  },
  {
    key: 'hitl_followup_email',
    title: 'HITL Follow‑up Email (approve/edit/reject)',
    description: 'Creates a HITL approval record and sends Slack buttons that drive the full HITL flow.',
    icon: Mail,
  },
  {
    key: 'stale_deal_alert',
    title: 'Stale Deal Alert',
    description: 'No-activity deal alert with suggested next steps.',
    icon: ShieldAlert,
  },
  {
    key: 'email_reply_alert',
    title: 'Email Reply Received',
    description: 'High urgency inbound reply summary + suggested next action.',
    icon: Mail,
  },
  {
    key: 'ai_smart_suggestion',
    title: '60 Smart Suggestion (AI)',
    description: 'Dynamic AI-powered suggestion, encouragement, or insight based on user activity.',
    icon: Sparkles,
  },
];

interface ProactiveSimulateResponse {
  success: boolean;
  feature: ProactiveSimulateFeature;
  orgId: string;
  targetUserId: string;
  slack?: {
    attempted: boolean;
    sent: boolean;
    channelId?: string;
    ts?: string;
    error?: string;
  };
  inApp?: {
    attempted: boolean;
    created: boolean;
    notificationId?: string;
    error?: string;
  };
  hitl?: {
    approvalId?: string;
  };
  debug?: Record<string, unknown>;
}

const PROACTIVE_SIMULATE_RESPONSE_FORMAT = {
  responseFormat: 'json' as const,
  fields: {
    success: 'boolean',
    feature: 'string',
    orgId: 'string',
    targetUserId: 'string',
    slack: {
      attempted: 'boolean',
      sent: 'boolean',
      channelId: 'string?',
      ts: 'string?',
      error: 'string?',
    },
    inApp: {
      attempted: 'boolean',
      created: 'boolean',
      notificationId: 'string?',
      error: 'string?',
    },
    hitl: {
      approvalId: 'string?',
    },
    debug: 'object?',
  },
};

export default function ProactiveSimulator() {
  const { user } = useAuth();
  const { activeOrgId } = useOrg();

  const [sendSlack, setSendSlack] = useState(true);
  const [createInApp, setCreateInApp] = useState(true);
  const [dryRun, setDryRun] = useState(false);
  const [useRealData, setUseRealData] = useState(false);
  const [selected, setSelected] = useState<ProactiveSimulateFeature>('morning_brief');
  const [isSending, setIsSending] = useState(false);
  const [lastResult, setLastResult] = useState<ProactiveSimulateResponse | null>(null);

  const email = (user as any)?.email as string | undefined;

  const canRun = useMemo(() => {
    return Boolean(activeOrgId && user?.id);
  }, [activeOrgId, user?.id]);

  const runSimulation = async () => {
    if (!activeOrgId || !user?.id) return;

    setIsSending(true);
    setLastResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('proactive-simulate', {
        body: {
          orgId: activeOrgId,
          feature: selected,
          targetUserId: user.id,
          sendSlack,
          createInApp,
          dryRun,
          simulationMode: !useRealData, // false = real data mode
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Simulation failed');

      setLastResult(data as ProactiveSimulateResponse);
      toast.success('Simulation executed');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to run simulation';
      toast.error(msg);
    } finally {
      setIsSending(false);
    }
  };

  const copyResponseFormatJson = async () => {
    try {
      const example: ProactiveSimulateResponse =
        lastResult ??
        ({
          success: true,
          feature: selected,
          orgId: activeOrgId || 'org_example',
          targetUserId: user?.id || 'user_example',
          slack: { attempted: true, sent: true, channelId: 'D123', ts: '1700000000.000000' },
          inApp: { attempted: true, created: true, notificationId: 'notif_example' },
        } as ProactiveSimulateResponse);

      await navigator.clipboard.writeText(
        JSON.stringify(
          {
            kind: 'agent-simulation-response-format',
            generatedAt: new Date().toISOString(),
            tool: 'proactive-simulate',
            features: FEATURE_META.map((f) => ({
              key: f.key,
              title: f.title,
              description: f.description,
            })),
            response: PROACTIVE_SIMULATE_RESPONSE_FORMAT,
            examples: [example],
          },
          null,
          2
        )
      );
      toast.success('Copied response format JSON');
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <BackToPlatform />
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
              Agent Simulator
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Simulate agent-driven Slack notifications and mirrored in-app notifications for the currently signed-in user.
            </p>
          </div>
          <Badge variant="secondary">Platform Admin</Badge>
        </div>

        <Alert>
          <AlertDescription className="text-sm">
            This tool sends real Slack messages (unless Dry run is enabled). It targets your current account
            {email ? (
              <>
                {' '}(<span className="font-medium">{email}</span>)
              </>
            ) : null}
            {' '}and the currently selected org.
          </AlertDescription>
        </Alert>

        {!activeOrgId ? (
          <Alert variant="destructive">
            <AlertDescription>
              No active organization selected. Select an org in the app first.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: delivery settings + mapping */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Delivery</CardTitle>
                <CardDescription>
                  Control which channels this simulation triggers.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Send Slack DM</Label>
                  <Switch checked={sendSlack} onCheckedChange={setSendSlack} />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Create in-app notification</Label>
                  <Switch checked={createInApp} onCheckedChange={setCreateInApp} />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <Label>Dry run (no send/write)</Label>
                  <Switch checked={dryRun} onCheckedChange={setDryRun} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Dry run returns the payload and checks configuration, but does not post to Slack or create notifications.
                </p>
                <Separator />
                <div className="flex items-center justify-between">
                  <Label>Use real data</Label>
                  <Switch checked={useRealData} onCheckedChange={setUseRealData} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Fetch your actual meetings, tasks, deals, and contacts instead of demo data. Deep links will work!
                </p>
              </CardContent>
            </Card>

            <SlackSelfMapping />
          </div>

          {/* Right: feature selection + run */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Choose a proactive feature</CardTitle>
                <CardDescription>
                  These simulations aim to mimic real Proactive 60 notifications without waiting for cron triggers.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {FEATURE_META.map((f) => {
                    const Icon = f.icon;
                    const isActive = selected === f.key;
                    return (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => setSelected(f.key)}
                        className={[
                          'text-left rounded-lg border p-3 transition-colors',
                          isActive
                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                            : 'border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/40',
                        ].join(' ')}
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 p-2 rounded-md bg-gray-100 dark:bg-gray-800">
                            <Icon className="h-4 w-4 text-gray-700 dark:text-gray-200" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-sm text-gray-900 dark:text-gray-100">
                              {f.title}
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                              {f.description}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="pt-2 flex items-center gap-3">
                  <Button onClick={runSimulation} disabled={!canRun || isSending} className="gap-2">
                    {isSending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Running…
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Run simulation
                      </>
                    )}
                  </Button>
                  <div className="text-xs text-muted-foreground">
                    Org: <span className="font-mono">{activeOrgId || '—'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Latest result</CardTitle>
                <CardDescription>
                  Copy this into feedback notes when something looks off.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={lastResult ? JSON.stringify(lastResult, null, 2) : ''}
                  placeholder="Run a simulation to see the response payload here…"
                  readOnly
                  className="min-h-[260px] font-mono text-xs"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={copyResponseFormatJson}>
                    Copy format + example JSON
                  </Button>
                  {lastResult ? (
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(JSON.stringify(lastResult, null, 2));
                          toast.success('Copied');
                        } catch {
                          toast.error('Failed to copy');
                        }
                      }}
                    >
                      Copy latest result JSON
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

