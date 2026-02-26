/**
 * SlackDemo Page
 *
 * Admin demo page for testing all Slack integration events.
 * Allows manually triggering each notification type with sample data.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2,
  MessageSquare,
  Calendar,
  Bell,
  Mail,
  Building2,
  Play,
  CheckCircle,
  XCircle,
  RefreshCw,
  ArrowRight,
  Trophy,
  AlertTriangle,
  Activity,
  Send,
  Bot,
  Code2,
  Layers,
  AtSign,
  Link2,
  BarChart3,
} from 'lucide-react';

import { supabase } from '@/lib/supabase/clientV2';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useSlackOrgSettings } from '@/lib/hooks/useSlackSettings';
import { slackOAuthService } from '@/lib/services/slackOAuthService';
import { notificationService } from '@/lib/services/notificationService';
import { SlackSelfMapping } from '@/components/settings/SlackSelfMapping';
import { toast } from 'sonner';

interface TestResult {
  success: boolean;
  message: string;
  data?: unknown;
  timestamp: Date;
}

type MeetingPickerItem = {
  id: string;
  title: string | null;
  meeting_start: string | null;
  owner_email: string | null;
  company?: { name?: string | null } | null;
};

type DealPickerItem = {
  id: string;
  title: string | null;
  stage: string | null;
  value: number | null;
  company?: { name?: string | null } | null;
};

function TestCard({
  title,
  description,
  icon: Icon,
  children,
  onTest,
  isLoading,
  lastResult,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  onTest: () => Promise<void>;
  isLoading: boolean;
  lastResult: TestResult | null;
}) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription className="text-sm">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}

        <div className="flex items-center gap-4 pt-2">
          <Button onClick={onTest} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send Test
              </>
            )}
          </Button>

          {lastResult && (
            <div className="flex items-center gap-2 text-sm">
              {lastResult.success ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              <span className={lastResult.success ? 'text-green-600' : 'text-red-600'}>
                {lastResult.message}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function SlackDemo() {
  const { activeOrgId, activeOrg } = useOrg();
  const { user } = useAuth();
  const { data: slackSettings, isLoading: settingsLoading } = useSlackOrgSettings();
  const [sendToSlack, setSendToSlack] = useState(true);
  const [mirrorToInApp, setMirrorToInApp] = useState(true);

  const handleConnectSlack = () => {
    if (!user?.id) {
      toast.error('You must be logged in to connect Slack');
      return;
    }
    if (!activeOrgId) {
      toast.error('No organization selected');
      return;
    }
    try {
      const oauthUrl = slackOAuthService.initiateOAuth(user.id, activeOrgId);
      window.location.href = oauthUrl;
    } catch (e: any) {
      toast.error(e?.message || 'Slack OAuth is not configured');
    }
  };

  // Test states
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, TestResult>>({});

  // Meeting Debrief form state
  const [meetingDebriefData, setMeetingDebriefData] = useState({
    meetingId: '',
  });

  // Daily Digest form state
  const [dailyDigestData, setDailyDigestData] = useState({
    date: new Date().toISOString().split('T')[0],
  });
  const [recentDailyDigests, setRecentDailyDigests] = useState<Array<{ created_at: string; slack_channel_id?: string | null; slack_ts?: string | null }>>([]);
  
  // Stored digest analyses (new table)
  const [storedDigests, setStoredDigests] = useState<Array<{
    id: string;
    digest_date: string;
    digest_type: 'org' | 'user';
    user_id: string | null;
    timezone: string;
    created_at: string;
    highlights: { summary?: string; insights?: string[] };
    delivery: { channelId?: string; status?: string } | null;
  }>>([]);
  const [digestViewType, setDigestViewType] = useState<'org' | 'user'>('org');

  // Meeting Prep form state
  const [meetingPrepData, setMeetingPrepData] = useState({
    meetingId: '',
    minutesBefore: '30',
  });
  const NONE_SELECT_VALUE = '__none__';

  // Deal Room form state
  const [dealRoomData, setDealRoomData] = useState({
    dealId: '',
    action: 'create' as 'create' | 'stage_change' | 'activity' | 'win_probability' | 'deal_won' | 'deal_lost',
    previousStage: 'sql',
    newStage: 'opportunity',
    activityType: 'call',
    activityDescription: 'Discussed pricing and timeline',
    previousProbability: '65',
    newProbability: '45',
    // Optional: invite extra Slack users (e.g. manager) to the deal room.
    inviteSlackUserIdsCsv: '',
  });

  // Quick testing + meeting selection helpers
  const [connectionTestLoading, setConnectionTestLoading] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<TestResult | null>(null);

  const [meetingsLoading, setMeetingsLoading] = useState(false);
  const [meetingSearch, setMeetingSearch] = useState('');
  const [recentMeetings, setRecentMeetings] = useState<MeetingPickerItem[]>([]);

  // Deal selection helpers
  const [dealsLoading, setDealsLoading] = useState(false);
  const [dealSearch, setDealSearch] = useState('');
  const [recentDeals, setRecentDeals] = useState<DealPickerItem[]>([]);

  // Sales Assistant preview state
  const [assistantMode, setAssistantMode] = useState<'live' | 'sample'>('live');
  const [assistantPreview, setAssistantPreview] = useState<any>(null);
  const [assistantPreviewLoading, setAssistantPreviewLoading] = useState(false);

  const setLoadingState = (key: string, value: boolean) => {
    setLoading((prev) => ({ ...prev, [key]: value }));
  };

  const setResult = (key: string, result: TestResult) => {
    setResults((prev) => ({ ...prev, [key]: result }));
  };

  const invokeFunction = async (functionName: string, body: unknown) => {
    const { data, error } = await supabase.functions.invoke(functionName, { body });

    if (error) {
      const anyErr = error as any;
      const status = anyErr?.context?.status ?? anyErr?.status;

      // Supabase can return 404 for:
      // - truly missing function ("Function not found")
      // - an actual 404 returned by the edge function (e.g., entity missing)
      const rawBody =
        anyErr?.context?.body ??
        anyErr?.context?.responseBody ??
        anyErr?.context?.data ??
        anyErr?.context?.text ??
        null;

      const bodyText =
        typeof rawBody === 'string'
          ? rawBody
          : rawBody && typeof rawBody === 'object'
            ? JSON.stringify(rawBody)
            : '';

      let bodyJson: any = null;
      if (typeof rawBody === 'string') {
        try {
          bodyJson = JSON.parse(rawBody);
        } catch {
          bodyJson = null;
        }
      } else if (rawBody && typeof rawBody === 'object') {
        bodyJson = rawBody;
      }

      const messageFromBody = bodyJson?.error || bodyJson?.message;
      const message = messageFromBody || anyErr?.message || 'Failed to send a request to the Edge Function';

      if (status === 404 && (bodyText.includes('Function not found') || message.includes('Function not found'))) {
        throw new Error(
          `Edge Function "${functionName}" is not deployed for this Supabase project (HTTP 404). ` +
            `Deploy it via: supabase functions deploy ${functionName} --project-ref <your_project_ref>`
        );
      }

      throw new Error(status ? `Edge Function "${functionName}" failed (HTTP ${status}): ${message}` : message);
    }

    return data;
  };

  const createInAppMirror = useCallback(
    async (params: {
      title: string;
      message: string;
      category?: 'workflow' | 'deal' | 'task' | 'meeting' | 'system' | 'team';
      entity_type?: string;
      entity_id?: string;
      action_url?: string;
      metadata?: Record<string, unknown>;
      type?: 'info' | 'success' | 'warning' | 'error';
    }) => {
      if (!mirrorToInApp) return null;
      if (!user?.id) {
        toast.error('Not logged in');
        return null;
      }

      const created = await notificationService.create({
        user_id: user.id,
        title: params.title,
        message: params.message,
        type: params.type ?? 'info',
        category: params.category,
        entity_type: params.entity_type,
        entity_id: params.entity_id,
        action_url: params.action_url,
        metadata: params.metadata,
      });

      if (!created) {
        toast.error('Failed to create in-app notification');
        return null;
      }
      toast.success('Created in-app notification');
      return created;
    },
    [mirrorToInApp, user?.id]
  );

  const previewSalesAssistant = async () => {
    if (!activeOrgId) {
      toast.error('No organization selected');
      return;
    }
    setAssistantPreviewLoading(true);
    try {
      const result = await invokeFunction('slack-test-message', {
        orgId: activeOrgId,
        action: 'preview_sales_assistant',
        mode: assistantMode,
      });
      setAssistantPreview(result);
      toast.success('Generated Sales Assistant preview');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to preview Sales Assistant');
    } finally {
      setAssistantPreviewLoading(false);
    }
  };

  const sendSalesAssistantDm = async () => {
    if (!activeOrgId) {
      toast.error('No organization selected');
      return;
    }
    setLoadingState('salesAssistant', true);
    try {
      const result = sendToSlack
        ? await invokeFunction('slack-test-message', {
            orgId: activeOrgId,
            action: 'send_sales_assistant_dm',
            mode: assistantMode,
          })
        : { success: true, mode: assistantMode, digest: assistantPreview?.digest, blocks: assistantPreview?.blocks };
      setResult('salesAssistant', {
        success: result.success,
        message: result.success ? 'Sales Assistant DM sent to you!' : result.error || 'Failed',
        data: result,
        timestamp: new Date(),
      });
      setAssistantPreview(result);
      await createInAppMirror({
        title: 'Sales Assistant: Action Items',
        message: `Sales Assistant digest generated${result?.digest?.actionItems ? ` (${result.digest.actionItems.length} items)` : ''}.`,
        category: 'team',
        entity_type: 'sales_assistant_digest',
        metadata: {
          source: 'proactive_simulator',
          mode: assistantMode,
          slack: sendToSlack ? { ts: result?.ts, channelId: result?.channelId } : { skipped: true },
        },
      });
      toast.success('Sales Assistant DM sent');
    } catch (e: any) {
      setResult('salesAssistant', {
        success: false,
        message: e?.message || 'Failed to send Sales Assistant DM',
        data: e,
        timestamp: new Date(),
      });
      toast.error(e?.message || 'Failed to send Sales Assistant DM');
    } finally {
      setLoadingState('salesAssistant', false);
    }
  };

  const loadRecentMeetings = async () => {
    if (!user?.id) return;
    setMeetingsLoading(true);
    try {
      const userEmail = (user as any)?.email as string | undefined;

      // 1) Prefer org-scoped query (fast + correct when org_id is populated)
      // 2) If it returns 0 rows, fall back to owner_user_id / owner_email matching (older data may have org_id null)
      const runQuery = async (useOrgFilter: boolean) => {
        // Some environments may not have a relationship between meetings -> companies; if so, we retry without the join.
        const baseSelect = 'id, title, meeting_start, owner_email, company:companies!meetings_company_id_fkey(name)';
        const fallbackSelect = 'id, title, meeting_start, owner_email';

        const build = (selectStr: string) => {
          // Use `any` to avoid TS deep instantiation on dynamic selects.
          let q: any = (supabase as any)
            .from('meetings')
            .select(selectStr)
            .order('meeting_start', { ascending: false })
            .limit(75);

          if (useOrgFilter && activeOrgId) {
            q = q.eq('org_id', activeOrgId);
          } else if (userEmail) {
            // IMPORTANT: meetings table uses owner_user_id (not user_id)
            q = q.or(`owner_user_id.eq.${user.id},owner_email.eq.${userEmail}`);
          } else {
            q = q.eq('owner_user_id', user.id);
          }
          return q;
        };

        // Try with join first
        let { data, error }: any = await build(baseSelect);
        if (error) {
          // Retry without join if relationship isn't defined
          ({ data, error } = (await build(fallbackSelect)) as any);
        }
        if (error) throw error;
        return (data as any[]) || [];
      };

      const primary = await runQuery(true);
      if (primary.length > 0) {
        setRecentMeetings(primary);
      } else {
        const fallback = await runQuery(false);
        setRecentMeetings(fallback);
      }
    } catch (e: any) {
      // Non-fatal: meeting picker is just a convenience
      setRecentMeetings([]);
      toast.error(e?.message || 'Failed to load meetings');
    } finally {
      setMeetingsLoading(false);
    }
  };

  const loadRecentDeals = async () => {
    if (!user?.id) return;
    setDealsLoading(true);
    try {
      // deals table: name (not title), stage_id FK, owner_id, clerk_org_id
      const selectWithJoin = 'id, name, value, updated_at, company, deal_stages:stage_id(name)';
      const selectFallback = 'id, name, value, updated_at, company, stage_id';

      const build = (selectStr: string) => {
        let q: any = (supabase as any)
          .from('deals')
          .select(selectStr)
          .order('updated_at', { ascending: false })
          .limit(50)
          .eq('owner_id', user.id);
        return q;
      };

      let { data, error }: any = await build(selectWithJoin);
      if (error) ({ data, error } = (await build(selectFallback)) as any);
      if (error) throw error;

      setRecentDeals(
        ((data as any[]) || []).map((d) => ({
          id: d.id,
          title: d.name ?? null,
          stage: d.deal_stages?.name ?? (d.stage_id ?? null),
          value: d.value ?? null,
          company: d.company ? { name: d.company } : null,
        })) as DealPickerItem[],
      );
    } catch (e: any) {
      setRecentDeals([]);
      toast.error(e?.message || 'Failed to load deals');
    } finally {
      setDealsLoading(false);
    }
  };

  useEffect(() => {
    // Meeting picker should work even if Slack isn't connected
    void loadRecentMeetings();
    void loadRecentDeals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId, user?.id]);

  const filteredMeetings = useMemo(() => {
    const q = meetingSearch.trim().toLowerCase();
    if (!q) return recentMeetings;
    return recentMeetings.filter((m) => {
      const title = (m.title || '').toLowerCase();
      const company = (m.company?.name || '').toLowerCase();
      const email = (m.owner_email || '').toLowerCase();
      return title.includes(q) || company.includes(q) || email.includes(q) || m.id.toLowerCase().includes(q);
    });
  }, [meetingSearch, recentMeetings]);

  const filteredDeals = useMemo(() => {
    const q = dealSearch.trim().toLowerCase();
    if (!q) return recentDeals;
    return recentDeals.filter((d) => {
      const title = (d.title || '').toLowerCase();
      const company = (d.company?.name || '').toLowerCase();
      const stage = (d.stage || '').toLowerCase();
      return title.includes(q) || company.includes(q) || stage.includes(q) || d.id.toLowerCase().includes(q);
    });
  }, [dealSearch, recentDeals]);

  const testSlackConnectionQuick = async () => {
    if (!user?.id) {
      toast.error('You must be logged in');
      return;
    }
    if (!activeOrgId) {
      toast.error('No organization selected');
      return;
    }
    if (!slackSettings?.is_connected) {
      toast.error('Slack is not connected for this org');
      return;
    }

    setConnectionTestLoading(true);
    try {
      const apiResult = await invokeFunction('slack-test-message', { orgId: activeOrgId });
      const result: TestResult = {
        success: true,
        message: `Test message sent${(apiResult as any)?.channelName ? ` to #${(apiResult as any).channelName}` : ''}`,
        data: apiResult,
        timestamp: new Date(),
      };
      setConnectionTestResult(result);
      toast.success(result.message);
    } catch (e: any) {
      const result: TestResult = {
        success: false,
        message: e?.message || 'Slack connection test failed',
        timestamp: new Date(),
      };
      setConnectionTestResult(result);
      toast.error(result.message);
    } finally {
      setConnectionTestLoading(false);
    }
  };

  // Test handlers
  const testMeetingDebrief = async () => {
    setLoadingState('meetingDebrief', true);
    try {
      const result = sendToSlack
        ? await invokeFunction('slack-post-meeting', {
            meetingId: meetingDebriefData.meetingId || null,
            orgId: activeOrgId,
            isTest: true,
          })
        : { success: true, skippedSlack: true };

      const deliveryInfo = result.deliveryMethod === 'dm' 
        ? 'via DM' 
        : result.channelId 
          ? `to channel ${result.channelId}` 
          : 'to Slack';
      
      setResult('meetingDebrief', {
        success: result.success,
        message: result.success ? `Meeting debrief sent ${deliveryInfo}!` : result.error || 'Failed',
        data: result,
        timestamp: new Date(),
      });
      await createInAppMirror({
        title: 'Post-call summary ready',
        message: 'A meeting debrief was generated (simulated).',
        category: 'meeting',
        entity_type: 'meeting',
        entity_id: meetingDebriefData.meetingId || undefined,
        action_url: meetingDebriefData.meetingId ? `/meetings/${meetingDebriefData.meetingId}` : undefined,
        metadata: {
          source: 'proactive_simulator',
          slack: sendToSlack ? { ts: result?.ts, channelId: result?.channelId } : { skipped: true },
        },
      });
      if (result?.success) {
        toast.success(`Meeting debrief sent ${deliveryInfo}`);
      } else {
        toast.error(result?.error || result?.message || 'Meeting debrief failed');
      }
    } catch (error: any) {
      setResult('meetingDebrief', {
        success: false,
        message: error.message,
        timestamp: new Date(),
      });
      toast.error(`Failed: ${error.message}`);
    } finally {
      setLoadingState('meetingDebrief', false);
    }
  };

  const testDailyDigest = async () => {
    setLoadingState('dailyDigest', true);
    try {
      const result = sendToSlack
        ? await invokeFunction('slack-daily-digest', {
            orgId: activeOrgId,
            date: dailyDigestData.date,
            isTest: true,
          })
        : { success: true, skippedSlack: true };

      setResult('dailyDigest', {
        success: result.success,
        message: (() => {
          const firstOk = Array.isArray(result?.results) ? result.results.find((r: any) => r?.success) : null;
          const channelId = firstOk?.channelId;
          return result.success
            ? `Daily digest sent${channelId ? ` to channel ${channelId}` : ''}!`
            : result.error || 'Failed';
        })(),
        data: result,
        timestamp: new Date(),
      });
      await createInAppMirror({
        title: 'Morning Brief (simulated)',
        message: `Generated a morning brief for ${dailyDigestData.date}.`,
        category: 'team',
        entity_type: 'morning_brief',
        metadata: {
          source: 'proactive_simulator',
          date: dailyDigestData.date,
          slack: sendToSlack ? { results: result?.results } : { skipped: true },
        },
      });
      const firstOk = Array.isArray(result?.results) ? result.results.find((r: any) => r?.success) : null;
      toast.success(`Daily digest test sent${firstOk?.channelId ? ` to ${firstOk.channelId}` : ''}`);
    } catch (error: any) {
      setResult('dailyDigest', {
        success: false,
        message: error.message,
        timestamp: new Date(),
      });
      toast.error(`Failed: ${error.message}`);
    } finally {
      setLoadingState('dailyDigest', false);
    }
  };

  const loadRecentDailyDigests = useCallback(async () => {
    if (!activeOrgId) return;
    try {
      const { data, error } = await (supabase as any)
        .from('slack_notifications_sent')
        .select('created_at, slack_channel_id, slack_ts')
        .eq('org_id', activeOrgId)
        .eq('feature', 'daily_digest')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) return;
      setRecentDailyDigests((data as any[]) || []);
    } catch {
      // Ignore if table isn't accessible under RLS in this environment
    }
  }, [activeOrgId]);

  const loadStoredDigests = useCallback(async () => {
    if (!activeOrgId) return;
    try {
      const { data, error } = await (supabase as any)
        .from('daily_digest_analyses')
        .select('id, digest_date, digest_type, user_id, timezone, created_at, highlights, delivery')
        .eq('org_id', activeOrgId)
        .eq('digest_type', digestViewType)
        .order('digest_date', { ascending: false })
        .limit(20);
      if (error) {
        return;
      }
      const digests = (data as any[]) || [];
      setStoredDigests(digests);
      
      // Default date picker to most recent stored digest date
      if (digests.length > 0 && digests[0].digest_date) {
        setDailyDigestData((prev) => ({ ...prev, date: digests[0].digest_date }));
      }
    } catch {
      // Table may not exist yet if migration hasn't run
    }
  }, [activeOrgId, digestViewType]);

  // NOTE: We intentionally do not auto-load digest history on page load.
  // These tables are optional / migration-gated across environments and can cause noisy 400/404 REST calls.

  const testMeetingPrep = async () => {
    setLoadingState('meetingPrep', true);
    try {
      const result = sendToSlack
        ? await invokeFunction('slack-meeting-prep', {
            meetingId: meetingPrepData.meetingId || 'test-meeting-id',
            orgId: activeOrgId,
            minutesBefore: parseInt(meetingPrepData.minutesBefore),
            isTest: true,
          })
        : { success: true, skippedSlack: true };

      setResult('meetingPrep', {
        success: result.success,
        message: result.success ? 'Meeting prep sent!' : result.error || 'Failed',
        data: result,
        timestamp: new Date(),
      });
      await createInAppMirror({
        title: 'Pre-meeting nudge (simulated)',
        message: `Prep card generated${meetingPrepData.meetingId ? ' for selected meeting' : ''}.`,
        category: 'meeting',
        entity_type: 'meeting',
        entity_id: meetingPrepData.meetingId || undefined,
        action_url: meetingPrepData.meetingId ? `/meetings/${meetingPrepData.meetingId}` : undefined,
        metadata: {
          source: 'proactive_simulator',
          minutesBefore: parseInt(meetingPrepData.minutesBefore),
          slack: sendToSlack ? { ts: result?.ts, channelId: result?.channelId } : { skipped: true },
        },
      });
      toast.success('Meeting prep test sent');
    } catch (error: any) {
      setResult('meetingPrep', {
        success: false,
        message: error.message,
        timestamp: new Date(),
      });
      toast.error(`Failed: ${error.message}`);
    } finally {
      setLoadingState('meetingPrep', false);
    }
  };

  const testDealRoom = async () => {
    setLoadingState('dealRoom', true);
    try {
      let result;

      if (dealRoomData.action === 'create') {
        const inviteSlackUserIds = dealRoomData.inviteSlackUserIdsCsv
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        result = await invokeFunction('slack-deal-room', {
          dealId: dealRoomData.dealId || 'test-deal-id',
          orgId: activeOrgId,
          isTest: true,
          inviteSlackUserIds,
        });
      } else {
        const updateData: Record<string, unknown> = {
          dealId: dealRoomData.dealId || 'test-deal-id',
          orgId: activeOrgId,
          updateType: dealRoomData.action,
          isTest: true,
          data: {},
        };

        switch (dealRoomData.action) {
          case 'stage_change':
            updateData.data = {
              dealName: 'Test Deal',
              previousStage: dealRoomData.previousStage,
              newStage: dealRoomData.newStage,
              updatedBy: 'Test User',
            };
            break;
          case 'activity':
            updateData.data = {
              dealName: 'Test Deal',
              activityType: dealRoomData.activityType,
              description: dealRoomData.activityDescription,
              createdBy: 'Test User',
            };
            break;
          case 'win_probability':
            updateData.data = {
              dealName: 'Test Deal',
              previousProbability: parseInt(dealRoomData.previousProbability),
              newProbability: parseInt(dealRoomData.newProbability),
              factors: ['No recent activity', 'Competitor mentioned'],
              suggestedActions: ['Schedule follow-up call', 'Send case study'],
            };
            break;
          case 'deal_won':
            updateData.data = {
              dealName: 'Test Deal',
              dealValue: 50000,
              companyName: 'Test Company',
              closedBy: 'Test User',
              daysInPipeline: 30,
            };
            break;
          case 'deal_lost':
            updateData.data = {
              dealName: 'Test Deal',
              dealValue: 50000,
              companyName: 'Test Company',
              lostReason: 'Budget constraints',
              closedBy: 'Test User',
            };
            break;
        }

        result = await invokeFunction('slack-deal-room-update', updateData);
      }

      setResult('dealRoom', {
        success: result.success,
        message: result.success
          ? dealRoomData.action === 'create'
            ? 'Deal room created!'
            : 'Update sent!'
          : result.error || result.message || 'Failed',
        data: result,
        timestamp: new Date(),
      });
      if (result?.success) {
        toast.success('Deal room test sent');
      } else {
        toast.error(result?.error || result?.message || 'Deal room failed');
      }
    } catch (error: any) {
      setResult('dealRoom', {
        success: false,
        message: error.message,
        timestamp: new Date(),
      });
      toast.error(`Failed: ${error.message}`);
    } finally {
      setLoadingState('dealRoom', false);
    }
  };

  // Proactive simulator (sample-only) — these use slack-test-message DM actions so we can iterate quickly
  const testMorningBriefDm = async () => {
    if (!activeOrgId) {
      toast.error('No organization selected');
      return;
    }
    setLoadingState('morningBrief', true);
    try {
      const result = sendToSlack
        ? await invokeFunction('slack-test-message', { orgId: activeOrgId, action: 'send_morning_brief_dm' })
        : { success: true, skippedSlack: true };

      setResult('morningBrief', {
        success: result.success,
        message: result.success ? 'Morning Brief sent to you!' : result.error || 'Failed',
        data: result,
        timestamp: new Date(),
      });

      await createInAppMirror({
        title: 'Morning Brief (simulated)',
        message: 'Your daily priorities and next steps are ready.',
        category: 'team',
        entity_type: 'morning_brief',
        metadata: { source: 'proactive_simulator', slack: sendToSlack ? { ts: result?.ts, channelId: result?.channelId } : { skipped: true } },
      });
    } catch (e: any) {
      setResult('morningBrief', { success: false, message: e?.message || 'Failed', data: e, timestamp: new Date() });
      toast.error(e?.message || 'Failed to send Morning Brief');
    } finally {
      setLoadingState('morningBrief', false);
    }
  };

  const testStaleDealAlertDm = async () => {
    if (!activeOrgId) {
      toast.error('No organization selected');
      return;
    }
    setLoadingState('staleDeal', true);
    try {
      const result = sendToSlack
        ? await invokeFunction('slack-test-message', {
            orgId: activeOrgId,
            action: 'send_stale_deal_alert_dm',
            dealId: dealRoomData.dealId || null,
          })
        : { success: true, skippedSlack: true };

      setResult('staleDeal', {
        success: result.success,
        message: result.success ? 'Stale deal alert sent to you!' : result.error || 'Failed',
        data: result,
        timestamp: new Date(),
      });

      await createInAppMirror({
        title: 'Stale deal alert (simulated)',
        message: 'A deal looks stale — suggested follow-up is ready.',
        category: 'deal',
        entity_type: 'deal',
        entity_id: dealRoomData.dealId || undefined,
        action_url: dealRoomData.dealId ? `/deals/${dealRoomData.dealId}` : undefined,
        metadata: { source: 'proactive_simulator' },
      });
    } catch (e: any) {
      setResult('staleDeal', { success: false, message: e?.message || 'Failed', data: e, timestamp: new Date() });
      toast.error(e?.message || 'Failed to send stale deal alert');
    } finally {
      setLoadingState('staleDeal', false);
    }
  };

  const testEmailReplyAlertDm = async () => {
    if (!activeOrgId) {
      toast.error('No organization selected');
      return;
    }
    setLoadingState('emailReply', true);
    try {
      const result = sendToSlack
        ? await invokeFunction('slack-test-message', { orgId: activeOrgId, action: 'send_email_reply_alert_dm' })
        : { success: true, skippedSlack: true };

      setResult('emailReply', {
        success: result.success,
        message: result.success ? 'Email reply alert sent to you!' : result.error || 'Failed',
        data: result,
        timestamp: new Date(),
      });

      await createInAppMirror({
        title: 'Email reply received (simulated)',
        message: 'A prospect replied — suggested response is ready.',
        category: 'team',
        entity_type: 'email',
        action_url: '/email-actions',
        metadata: { source: 'proactive_simulator' },
      });
    } catch (e: any) {
      setResult('emailReply', { success: false, message: e?.message || 'Failed', data: e, timestamp: new Date() });
      toast.error(e?.message || 'Failed to send email reply alert');
    } finally {
      setLoadingState('emailReply', false);
    }
  };

  const testCompactNotificationDm = async () => {
    if (!activeOrgId) {
      toast.error('No organization selected');
      return;
    }
    setLoadingState('compactNotification', true);
    try {
      const result = sendToSlack
        ? await invokeFunction('slack-test-message', { orgId: activeOrgId, action: 'send_compact_notification_dm' })
        : { success: true, skippedSlack: true };

      setResult('compactNotification', {
        success: result.success,
        message: result.success ? 'Compact notification sent!' : result.error || 'Failed',
        data: result,
        timestamp: new Date(),
      });

      await createInAppMirror({
        title: 'Compact notification (simulated)',
        message: 'This is what lower-priority updates look like — a single line.',
        category: 'deal',
        entity_type: 'deal',
        metadata: { source: 'proactive_simulator' },
      });
    } catch (e: any) {
      setResult('compactNotification', { success: false, message: e?.message || 'Failed', data: e, timestamp: new Date() });
      toast.error(e?.message || 'Failed to send compact notification');
    } finally {
      setLoadingState('compactNotification', false);
    }
  };

  const testSilentThreadDm = async () => {
    if (!activeOrgId) {
      toast.error('No organization selected');
      return;
    }
    setLoadingState('silentThread', true);
    try {
      const result = sendToSlack
        ? await invokeFunction('slack-test-message', { orgId: activeOrgId, action: 'send_silent_thread_dm' })
        : { success: true, skippedSlack: true };

      setResult('silentThread', {
        success: result.success,
        message: result.success ? 'Signal posted to daily thread!' : result.error || 'Failed',
        data: result,
        timestamp: new Date(),
      });

      await createInAppMirror({
        title: 'Silent thread signal (simulated)',
        message: 'Low-priority signals accumulate in a daily thread instead of separate DMs.',
        category: 'deal',
        entity_type: 'deal',
        metadata: { source: 'proactive_simulator' },
      });
    } catch (e: any) {
      setResult('silentThread', { success: false, message: e?.message || 'Failed', data: e, timestamp: new Date() });
      toast.error(e?.message || 'Failed to send silent thread signal');
    } finally {
      setLoadingState('silentThread', false);
    }
  };

  const testWeeklyScorecardDm = async () => {
    if (!activeOrgId) {
      toast.error('No organization selected');
      return;
    }
    setLoadingState('weeklyScorecard', true);
    try {
      const result = sendToSlack
        ? await invokeFunction('slack-test-message', { orgId: activeOrgId, action: 'send_weekly_scorecard_dm' })
        : { success: true, skippedSlack: true };

      setResult('weeklyScorecard', {
        success: result.success,
        message: result.success ? 'Weekly scorecard sent!' : result.error || 'Failed',
        data: result,
        timestamp: new Date(),
      });

      await createInAppMirror({
        title: 'Weekly agent scorecard (simulated)',
        message: '12 emails drafted, 5 meetings prepped, ~2.4h saved this week.',
        category: 'team',
        entity_type: 'weekly_scorecard',
        metadata: { source: 'proactive_simulator' },
      });
    } catch (e: any) {
      setResult('weeklyScorecard', { success: false, message: e?.message || 'Failed', data: e, timestamp: new Date() });
      toast.error(e?.message || 'Failed to send weekly scorecard');
    } finally {
      setLoadingState('weeklyScorecard', false);
    }
  };

  if (settingsLoading) {
    return (
      <div className="container max-w-4xl py-8 px-4 sm:px-6">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8 px-4 sm:px-6 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Slack Demo (Notifications + HITL)</h1>
          <p className="text-muted-foreground mt-1">
            Simulate proactive features end-to-end on your account: send a Slack DM, mirror into in-app notifications, and validate interactive buttons.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void loadRecentMeetings()} disabled={meetingsLoading}>
            {meetingsLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading meetings…
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh meetings
              </>
            )}
          </Button>
          <Button onClick={() => void testSlackConnectionQuick()} disabled={connectionTestLoading}>
            {connectionTestLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Testing…
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Test Slack connection
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Connection Status */}
      {slackSettings?.is_connected ? (
        <Alert>
          <CheckCircle className="h-4 w-4 text-green-500" />
          <AlertDescription className="flex items-center gap-2">
            Connected to <Badge variant="secondary">{slackSettings.slack_team_name}</Badge>
            {activeOrg && (
              <>
                <span className="text-muted-foreground">•</span>
                <span>Org: {activeOrg.name}</span>
              </>
            )}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>Slack is not connected for this org. You can still simulate in-app notifications.</span>
            <Button onClick={handleConnectSlack} size="sm">
              <MessageSquare className="mr-2 h-4 w-4" />
              Connect Slack
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Simulation Controls</CardTitle>
            <CardDescription>Choose where to deliver the simulated notification.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-medium">Send to Slack</div>
                <div className="text-xs text-muted-foreground">Posts real Slack DMs using the org bot</div>
              </div>
              <Switch checked={sendToSlack} onCheckedChange={setSendToSlack} disabled={!slackSettings?.is_connected} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-medium">Mirror to In-app</div>
                <div className="text-xs text-muted-foreground">Creates a `notifications` row for your user</div>
              </div>
              <Switch checked={mirrorToInApp} onCheckedChange={setMirrorToInApp} />
            </div>
          </CardContent>
        </Card>

        <div className="md:col-span-1">
          <SlackSelfMapping />
        </div>
      </div>

      {connectionTestResult && (
        <Alert variant={connectionTestResult.success ? 'default' : 'destructive'}>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>
              <span className="font-medium">Connection test:</span> {connectionTestResult.message}
            </span>
            <span className="text-xs text-muted-foreground">
              {connectionTestResult.timestamp.toLocaleTimeString()}
            </span>
          </AlertDescription>
        </Alert>
      )}

      {/* Test Cards */}
      <div className="grid gap-6">
        {/* Proactive: Morning Brief */}
        <TestCard
          title="Morning Brief (DM)"
          description="Send a sample morning brief to yourself (Slack DM) and mirror it into in-app notifications."
          icon={Calendar}
          onTest={testMorningBriefDm}
          isLoading={loading.morningBrief}
          lastResult={results.morningBrief || null}
        >
          <p className="text-xs text-muted-foreground">
            This uses the dedicated simulator action in `slack-test-message` so we can iterate on Block Kit quickly.
          </p>
        </TestCard>

        {/* Meeting Debrief */}
        <TestCard
          title="AI Meeting Debrief"
          description="Test the post-meeting summary with AI analysis, action items, and coaching insights."
          icon={MessageSquare}
          onTest={testMeetingDebrief}
          isLoading={loading.meetingDebrief}
          lastResult={results.meetingDebrief}
        >
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Meeting (optional)</Label>
              <Input
                placeholder="Search recent meetings by title/company/email/id…"
                value={meetingSearch}
                onChange={(e) => setMeetingSearch(e.target.value)}
              />
              <Select
                value={meetingDebriefData.meetingId ? meetingDebriefData.meetingId : NONE_SELECT_VALUE}
                onValueChange={(value) =>
                  setMeetingDebriefData({ ...meetingDebriefData, meetingId: value === NONE_SELECT_VALUE ? '' : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={meetingsLoading ? 'Loading meetings…' : 'Select a meeting (optional)'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_SELECT_VALUE}>None</SelectItem>
                  {filteredMeetings.slice(0, 75).map((m) => {
                    const dt = m.meeting_start ? new Date(m.meeting_start).toLocaleString() : '';
                    const company = m.company?.name ? ` • ${m.company.name}` : '';
                    return (
                      <SelectItem key={m.id} value={m.id}>
                        {(m.title || 'Untitled meeting') + company + (dt ? ` • ${dt}` : '')}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Or paste meeting ID</Label>
                <Input
                  placeholder="Leave empty for test data"
                  value={meetingDebriefData.meetingId}
                  onChange={(e) => setMeetingDebriefData({ ...meetingDebriefData, meetingId: e.target.value })}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Pick a real meeting to use transcript data (best), or leave empty for sample data.
              </p>
            </div>
          </div>
        </TestCard>

        {/* Daily Digest */}
        <TestCard
          title="Daily Standup Digest"
          description="Analyzes the selected day and posts a digest to Slack. Digests are stored for historical browsing and future RAG/analysis workflows."
          icon={Calendar}
          onTest={testDailyDigest}
          isLoading={loading.dailyDigest}
          lastResult={results.dailyDigest}
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Analyze date</Label>
              <Input
                type="date"
                value={dailyDigestData.date}
                onChange={(e) => setDailyDigestData({ ...dailyDigestData, date: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Pick any day to analyze. Digests are stored in the database for historical lookup and RAG.
              </p>
            </div>

            {/* Stored Digests Section */}
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Stored Digests</Label>
                <div className="flex items-center gap-2">
                  <Button
                    variant={digestViewType === 'org' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setDigestViewType('org')}
                  >
                    Org
                  </Button>
                  <Button
                    variant={digestViewType === 'user' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setDigestViewType('user')}
                  >
                    Per-User
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void loadStoredDigests()}>
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {storedDigests.length > 0 ? (
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {storedDigests.map((d) => {
                    const summary = d.highlights?.summary || 'No summary';
                    const channelInfo = d.delivery?.channelId ? ` - ${d.delivery.channelId}` : '';
                    const statusBadge = d.delivery?.status === 'sent' 
                      ? <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">Sent</Badge>
                      : d.delivery?.status === 'failed'
                        ? <Badge variant="destructive" className="text-xs">Failed</Badge>
                        : <Badge variant="outline" className="text-xs">Stored</Badge>;
                    
                    return (
                      <button
                        key={d.id}
                        type="button"
                        className={`w-full text-left p-2 rounded-md border transition-colors hover:bg-muted/50 ${
                          dailyDigestData.date === d.digest_date ? 'border-primary bg-primary/5' : 'border-border'
                        }`}
                        onClick={() => setDailyDigestData({ ...dailyDigestData, date: d.digest_date })}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-sm">{d.digest_date}</span>
                          <div className="flex items-center gap-1">
                            {statusBadge}
                            {d.digest_type === 'user' && (
                              <Badge variant="outline" className="text-xs">User</Badge>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          {summary}{channelInfo}
                        </p>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground py-2">
                  No stored {digestViewType} digests found. Run a test to generate one!
                </p>
              )}
            </div>

            {/* Legacy send history (kept for reference) */}
            {recentDailyDigests.length > 0 && (
              <div className="space-y-2 pt-2 border-t">
                <Label className="text-xs text-muted-foreground">Legacy send history</Label>
                <div className="space-y-1">
                  {recentDailyDigests.slice(0, 3).map((d, idx) => {
                    const date = d.created_at ? new Date(d.created_at).toISOString().split('T')[0] : '';
                    const channel = d.slack_channel_id ? ` - ${d.slack_channel_id}` : '';
                    return (
                      <button
                        key={`${d.created_at}-${idx}`}
                        type="button"
                        className="w-full text-left text-xs text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => date && setDailyDigestData({ ...dailyDigestData, date })}
                      >
                        {date}{channel}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </TestCard>

        {/* Meeting Prep */}
        <TestCard
          title="Pre-Meeting Prep Cards"
          description="Test the meeting prep notification with attendee info and talking points."
          icon={Bell}
          onTest={testMeetingPrep}
          isLoading={loading.meetingPrep}
          lastResult={results.meetingPrep}
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Meeting (optional)</Label>
              <Select
                value={meetingPrepData.meetingId ? meetingPrepData.meetingId : NONE_SELECT_VALUE}
                onValueChange={(value) =>
                  setMeetingPrepData({ ...meetingPrepData, meetingId: value === NONE_SELECT_VALUE ? '' : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={meetingsLoading ? 'Loading meetings…' : 'Select a meeting (optional)'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_SELECT_VALUE}>None</SelectItem>
                  {filteredMeetings.slice(0, 75).map((m) => {
                    const dt = m.meeting_start ? new Date(m.meeting_start).toLocaleString() : '';
                    const company = m.company?.name ? ` • ${m.company.name}` : '';
                    return (
                      <SelectItem key={m.id} value={m.id}>
                        {(m.title || 'Untitled meeting') + company + (dt ? ` • ${dt}` : '')}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <Input
                placeholder="Or paste meeting ID"
                value={meetingPrepData.meetingId}
                onChange={(e) => setMeetingPrepData({ ...meetingPrepData, meetingId: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Minutes Before</Label>
              <Select
                value={meetingPrepData.minutesBefore}
                onValueChange={(value) =>
                  setMeetingPrepData({ ...meetingPrepData, minutesBefore: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </TestCard>

        {/* Sales Assistant DM */}
        <TestCard
          title="Sales Assistant DM (Preview + Send)"
          description="Preview the exact Block Kit JSON and send a test Sales Assistant DM to yourself."
          icon={Bot}
          onTest={sendSalesAssistantDm}
          isLoading={loading.salesAssistant}
          lastResult={results.salesAssistant || null}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label>Preview Mode</Label>
                <p className="text-xs text-muted-foreground">
                  Live uses your org data; Sample renders a designed demo message.
                </p>
              </div>
              <Select value={assistantMode} onValueChange={(v) => setAssistantMode(v as any)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="live">Live</SelectItem>
                  <SelectItem value="sample">Sample</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={previewSalesAssistant} disabled={assistantPreviewLoading}>
                {assistantPreviewLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Code2 className="mr-2 h-4 w-4" />
                    Preview Blocks JSON
                  </>
                )}
              </Button>
            </div>

            {assistantPreview?.blocks_prompt && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Code2 className="h-4 w-4" />
                  Block Kit Template (\"prompt\")
                </Label>
                <Textarea value={assistantPreview.blocks_prompt} readOnly className="min-h-[180px] font-mono text-xs" />
              </div>
            )}

            {assistantPreview?.blocks && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Code2 className="h-4 w-4" />
                  Blocks JSON (what we send to Slack)
                </Label>
                <Textarea
                  value={JSON.stringify(assistantPreview.blocks, null, 2)}
                  readOnly
                  className="min-h-[260px] font-mono text-xs"
                />
              </div>
            )}
          </div>
        </TestCard>

        {/* Proactive: Stale Deal Alert */}
        <TestCard
          title="Stale Deal Alert (DM)"
          description="Send a sample stale deal alert to yourself and mirror it into in-app notifications."
          icon={AlertTriangle}
          onTest={testStaleDealAlertDm}
          isLoading={loading.staleDeal}
          lastResult={results.staleDeal || null}
        >
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Optional: select a deal to reference</Label>
            <Select
              value={dealRoomData.dealId ? dealRoomData.dealId : NONE_SELECT_VALUE}
              onValueChange={(value) => setDealRoomData({ ...dealRoomData, dealId: value === NONE_SELECT_VALUE ? '' : value })}
            >
              <SelectTrigger>
                <SelectValue placeholder={dealsLoading ? 'Loading deals…' : 'Select a deal (optional)'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_SELECT_VALUE}>None</SelectItem>
                {filteredDeals.slice(0, 50).map((d) => {
                  const company = d.company?.name ? ` • ${d.company.name}` : '';
                  const stage = d.stage ? ` • ${d.stage}` : '';
                  return (
                    <SelectItem key={d.id} value={d.id}>
                      {(d.title || 'Untitled deal') + company + stage}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </TestCard>

        {/* Proactive: Email Reply Alert */}
        <TestCard
          title="Email Reply Received (DM)"
          description="Send a sample email reply alert to yourself and mirror it into in-app notifications."
          icon={Mail}
          onTest={testEmailReplyAlertDm}
          isLoading={loading.emailReply}
          lastResult={results.emailReply || null}
        >
          <p className="text-xs text-muted-foreground">
            This is a sample alert. The production version will be driven by inbound email events/categorizations.
          </p>
        </TestCard>

        {/* ─── New Slack Experience Features ─── */}
        <Separator />
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Slack Experience Overhaul</h2>
          <p className="text-sm text-muted-foreground">
            New features: notification tiers, @mention copilot, link unfurling, entity detection, weekly scorecard.
          </p>
        </div>

        {/* Compact Notification Tier */}
        <TestCard
          title="Compact Notification (Tier 2)"
          description="Single-line notification for lower-priority updates like stage changes and email replies."
          icon={Layers}
          onTest={testCompactNotificationDm}
          isLoading={loading.compactNotification}
          lastResult={results.compactNotification || null}
        >
          <p className="text-xs text-muted-foreground">
            Instead of a full card, compact notifications show entity + action + deep link on one line.
            Example: &quot;Acme Corp moved to Negotiation &middot; View Deal&quot;
          </p>
        </TestCard>

        {/* Silent Thread Signal */}
        <TestCard
          title="Silent Thread Signal (Tier 3)"
          description="Low-priority signals accumulate in a daily thread instead of separate DMs."
          icon={Layers}
          onTest={testSilentThreadDm}
          isLoading={loading.silentThread}
          lastResult={results.silentThread || null}
        >
          <p className="text-xs text-muted-foreground">
            Creates a &quot;Signals — [date]&quot; thread in your DM. Subsequent signals post as replies.
            This keeps your DM clean while still capturing every insight.
          </p>
        </TestCard>

        {/* Weekly Agent Scorecard */}
        <TestCard
          title="Weekly Agent Scorecard"
          description="End-of-week summary showing emails drafted, meetings prepped, deals flagged, and time saved."
          icon={BarChart3}
          onTest={testWeeklyScorecardDm}
          isLoading={loading.weeklyScorecard}
          lastResult={results.weeklyScorecard || null}
        >
          <p className="text-xs text-muted-foreground">
            Uses sample data. In production, this runs as a Friday cron job with real aggregated stats.
          </p>
        </TestCard>

        {/* @Mention Copilot (info card) */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <AtSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">@Mention Copilot</CardTitle>
                <CardDescription className="text-sm">@mention the bot in any channel to ask questions or request work.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              The bot now responds to @mentions with the full copilot pipeline (same as DMs). It adds a waiting reaction, processes the request, then marks done with a checkmark.
            </p>
            <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
              <p className="font-medium">How to test:</p>
              <ol className="list-decimal list-inside text-muted-foreground space-y-1">
                <li>Go to any Slack channel where the 60 bot is a member</li>
                <li>Type <code className="bg-muted px-1 rounded">@60 what deals are at risk?</code></li>
                <li>Watch the hourglass reaction appear, then get replaced with a checkmark</li>
                <li>The bot replies in-thread with a Block Kit response + deep links</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        {/* Link Unfurling (info card) */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Link2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Link Unfurling</CardTitle>
                <CardDescription className="text-sm">Paste an app.use60.com deal URL and see it expand into a rich card.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              When you paste an <code className="bg-muted px-1 rounded">app.use60.com/deals/[id]</code> link in any channel, the bot automatically unfurls it as a rich deal card showing name, stage, value, and health.
            </p>
            <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
              <p className="font-medium">How to test:</p>
              <ol className="list-decimal list-inside text-muted-foreground space-y-1">
                <li>Copy a deal URL from the app (e.g. from the deals page)</li>
                <li>Paste it in any Slack channel where the bot is present</li>
                <li>The link should expand into a formatted deal summary card</li>
              </ol>
            </div>
            <p className="text-xs text-muted-foreground">
              Note: Slack must have the bot&apos;s app registered for link unfurling on the app.use60.com domain.
            </p>
          </CardContent>
        </Card>

        {/* Entity Detection (info card) */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Activity className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Entity Detection</CardTitle>
                <CardDescription className="text-sm">Mention a deal name in a channel and get automatic context.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              When someone mentions a known deal name in a channel, the bot replies in-thread with a one-line context summary and a View Deal link. Rate-limited to 1 per channel per 5 minutes.
            </p>
            <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
              <p className="font-medium">How to test:</p>
              <ol className="list-decimal list-inside text-muted-foreground space-y-1">
                <li>Create a deal in 60 (or use an existing one)</li>
                <li>In a Slack channel where the bot is present, mention the deal by name</li>
                <li>The bot should reply in-thread with the deal stage, value, and a deep link</li>
              </ol>
            </div>
            <p className="text-xs text-muted-foreground">
              Only triggers for exact deal title matches. Rate-limited to avoid channel spam.
            </p>
          </CardContent>
        </Card>

        {/* Deal Room */}
        <TestCard
          title="Deal Room Events"
          description="Test deal room creation and various update events."
          icon={Building2}
          onTest={testDealRoom}
          isLoading={loading.dealRoom}
          lastResult={results.dealRoom}
        >
          <Tabs
            value={dealRoomData.action}
            onValueChange={(value) =>
              setDealRoomData({ ...dealRoomData, action: value as typeof dealRoomData.action })
            }
          >
            <TabsList className="grid grid-cols-6 w-full">
              <TabsTrigger value="create" className="text-xs">
                Create
              </TabsTrigger>
              <TabsTrigger value="stage_change" className="text-xs">
                Stage
              </TabsTrigger>
              <TabsTrigger value="activity" className="text-xs">
                Activity
              </TabsTrigger>
              <TabsTrigger value="win_probability" className="text-xs">
                Win %
              </TabsTrigger>
              <TabsTrigger value="deal_won" className="text-xs">
                Won
              </TabsTrigger>
              <TabsTrigger value="deal_lost" className="text-xs">
                Lost
              </TabsTrigger>
            </TabsList>

            <div className="mt-4 space-y-4">
              <div className="space-y-3">
                <Label>Deal (optional)</Label>
                <Input
                  placeholder="Search deals by title/company/stage…"
                  value={dealSearch}
                  onChange={(e) => setDealSearch(e.target.value)}
                />
                <Select
                  value={dealRoomData.dealId ? dealRoomData.dealId : NONE_SELECT_VALUE}
                  onValueChange={(value) =>
                    setDealRoomData({ ...dealRoomData, dealId: value === NONE_SELECT_VALUE ? '' : value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={dealsLoading ? 'Loading deals…' : 'Select a deal (optional)'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_SELECT_VALUE}>None (use sample data)</SelectItem>
                    {filteredDeals.slice(0, 50).map((d) => {
                      const company = d.company?.name ? ` • ${d.company.name}` : '';
                      const value = d.value ? ` • $${d.value.toLocaleString()}` : '';
                      const stage = d.stage ? ` (${d.stage})` : '';
                      return (
                        <SelectItem key={d.id} value={d.id}>
                          {(d.title || 'Untitled deal') + company + value + stage}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Or paste deal ID</Label>
                  <Input
                    placeholder="Leave empty for test data"
                    value={dealRoomData.dealId}
                    onChange={(e) => setDealRoomData({ ...dealRoomData, dealId: e.target.value })}
                  />
                </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Invite extra Slack user IDs (optional)
                </Label>
                <Input
                  placeholder="U0123ABC, U0456DEF (e.g. manager)"
                  value={dealRoomData.inviteSlackUserIdsCsv}
                  onChange={(e) =>
                    setDealRoomData({ ...dealRoomData, inviteSlackUserIdsCsv: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  This is the Slack user ID (starts with <code>U</code>). Useful for testing “owner + manager”
                  membership even if we can’t auto-resolve managers yet.
                </p>
              </div>
              </div>

              <TabsContent value="stage_change" className="mt-0 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>From Stage</Label>
                    <Select
                      value={dealRoomData.previousStage}
                      onValueChange={(value) =>
                        setDealRoomData({ ...dealRoomData, previousStage: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sql">SQL</SelectItem>
                        <SelectItem value="opportunity">Opportunity</SelectItem>
                        <SelectItem value="verbal">Verbal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>To Stage</Label>
                    <Select
                      value={dealRoomData.newStage}
                      onValueChange={(value) =>
                        setDealRoomData({ ...dealRoomData, newStage: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="opportunity">Opportunity</SelectItem>
                        <SelectItem value="verbal">Verbal</SelectItem>
                        <SelectItem value="signed">Signed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="activity" className="mt-0 space-y-4">
                <div className="space-y-2">
                  <Label>Activity Type</Label>
                  <Select
                    value={dealRoomData.activityType}
                    onValueChange={(value) =>
                      setDealRoomData({ ...dealRoomData, activityType: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="call">Call</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="meeting">Meeting</SelectItem>
                      <SelectItem value="proposal">Proposal</SelectItem>
                      <SelectItem value="note">Note</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    placeholder="Activity description..."
                    value={dealRoomData.activityDescription}
                    onChange={(e) =>
                      setDealRoomData({ ...dealRoomData, activityDescription: e.target.value })
                    }
                  />
                </div>
              </TabsContent>

              <TabsContent value="win_probability" className="mt-0 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Previous Probability (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={dealRoomData.previousProbability}
                      onChange={(e) =>
                        setDealRoomData({ ...dealRoomData, previousProbability: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>New Probability (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={dealRoomData.newProbability}
                      onChange={(e) =>
                        setDealRoomData({ ...dealRoomData, newProbability: e.target.value })
                      }
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="deal_won" className="mt-0">
                <Alert className="bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800">
                  <Trophy className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-700 dark:text-green-400">
                    This will post a "Deal Won" celebration message and mark the channel for
                    archiving.
                  </AlertDescription>
                </Alert>
              </TabsContent>

              <TabsContent value="deal_lost" className="mt-0">
                <Alert className="bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-700 dark:text-red-400">
                    This will post a "Deal Lost" message and mark the channel for archiving.
                  </AlertDescription>
                </Alert>
              </TabsContent>
            </div>
          </Tabs>
        </TestCard>
      </div>

      {/* Recent Results */}
      {Object.keys(results).length > 0 && (
        <>
          <Separator />

          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Recent Test Results</h2>
            <div className="space-y-2">
              {Object.entries(results)
                .sort((a, b) => b[1].timestamp.getTime() - a[1].timestamp.getTime())
                .map(([key, result]) => (
                  <div
                    key={key}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      result.success
                        ? 'bg-green-50 dark:bg-green-950/30'
                        : 'bg-red-50 dark:bg-red-950/30'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {result.success ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                      <div>
                        <span className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                        <span className="mx-2 text-muted-foreground">•</span>
                        <span
                          className={result.success ? 'text-green-600' : 'text-red-600'}
                        >
                          {result.message}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {result.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
