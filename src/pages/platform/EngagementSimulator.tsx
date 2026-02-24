/**
 * EngagementSimulator - Smart Engagement Algorithm Testing Tool
 *
 * Platform admin tool to test all aspects of the Smart Engagement Algorithm:
 * - User segmentation and scoring
 * - Optimal send time calculation
 * - Frequency limiting
 * - Notification queue simulation
 * - Feedback handling
 * - Re-engagement campaigns
 *
 * Supports both mock data and live data from actual engagement tables.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Loader2,
  Play,
  RefreshCw,
  Users,
  Clock,
  Bell,
  MessageSquare,
  Zap,
  AlertTriangle,
  UserX,
  UserCheck,
  TrendingUp,
  Calendar,
  Mail,
  Settings,
  Activity,
  Target,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  Timer,
  Filter,
  Database,
  TestTube,
  Send,
  ArrowRight,
} from 'lucide-react';
import { BackToPlatform } from '@/components/platform/BackToPlatform';

import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrg } from '@/lib/contexts/OrgContext';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// =====================================================
// Types
// =====================================================

type UserSegment = 'power_user' | 'regular' | 'casual' | 'at_risk' | 'dormant' | 'churned';
type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';
type NotificationFrequency = 'low' | 'moderate' | 'high';
type ReengagementType =
  | 'gentle_nudge'
  | 'activity_summary'
  | 'upcoming_meeting'
  | 'deal_update'
  | 'value_reminder'
  | 'win_back'
  | 'product_update'
  | 'champion_alert'
  | 'new_email_summary';

interface MockUserMetrics {
  userId: string;
  segment: UserSegment;
  appEngagementScore: number;
  slackEngagementScore: number;
  notificationEngagementScore: number;
  overallEngagementScore: number;
  preferredFrequency: NotificationFrequency;
  fatigueLevel: number;
  typicalActiveHours: number[];
  peakActivityHour: number;
  daysInactive: number;
  lastAppActiveAt: string | null;
  lastSlackActiveAt: string | null;
  notificationsSentToday: number;
  notificationsSentThisHour: number;
}

interface SimulationResult {
  type: 'timing' | 'frequency' | 'segment' | 'reengagement' | 'feedback' | 'queue';
  success: boolean;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  reasoning?: string;
  timestamp: string;
}

interface LiveUser {
  user_id: string;
  email: string;
  full_name: string | null;
  user_segment: UserSegment;
  overall_engagement_score: number;
  preferred_notification_frequency: NotificationFrequency;
  notification_fatigue_level: number;
  last_app_active_at: string | null;
}

// =====================================================
// Constants
// =====================================================

const SEGMENT_CONFIG: Record<UserSegment, { label: string; color: string; icon: typeof Users; description: string }> = {
  power_user: {
    label: 'Power User',
    color: 'bg-emerald-500',
    icon: Zap,
    description: '>5 sessions/week, high engagement'
  },
  regular: {
    label: 'Regular',
    color: 'bg-blue-500',
    icon: UserCheck,
    description: '2-5 sessions/week'
  },
  casual: {
    label: 'Casual',
    color: 'bg-amber-500',
    icon: Users,
    description: '<2 sessions/week'
  },
  at_risk: {
    label: 'At Risk',
    color: 'bg-orange-500',
    icon: AlertTriangle,
    description: 'Declining engagement'
  },
  dormant: {
    label: 'Dormant',
    color: 'bg-red-500',
    icon: UserX,
    description: 'No activity 7+ days'
  },
  churned: {
    label: 'Churned',
    color: 'bg-slate-500',
    icon: UserX,
    description: 'No activity 30+ days'
  },
};

const REENGAGEMENT_TYPES: Record<ReengagementType, { label: string; description: string; icon: typeof Bell }> = {
  gentle_nudge: { label: 'Gentle Nudge', description: 'Soft check-in message', icon: Bell },
  activity_summary: { label: 'Activity Summary', description: 'What you missed while away', icon: Activity },
  upcoming_meeting: { label: 'Upcoming Meeting', description: 'Meeting prep notification', icon: Calendar },
  deal_update: { label: 'Deal Update', description: 'Important deal changes', icon: TrendingUp },
  value_reminder: { label: 'Value Reminder', description: 'Feature value highlight', icon: Sparkles },
  win_back: { label: 'Win Back', description: 'Re-activation campaign', icon: Target },
  product_update: { label: 'Product Update', description: 'New features announcement', icon: Zap },
  champion_alert: { label: 'Champion Alert', description: 'Contact job change alert', icon: Users },
  new_email_summary: { label: 'Email Summary', description: 'Important emails received', icon: Mail },
};

const FREQUENCY_LIMITS = {
  low: { maxPerHour: 1, maxPerDay: 3, minTimeBetween: 120 },
  moderate: { maxPerHour: 2, maxPerDay: 8, minTimeBetween: 45 },
  high: { maxPerHour: 4, maxPerDay: 15, minTimeBetween: 15 },
};

// =====================================================
// Mock Data Generator
// =====================================================

function generateMockUser(segment: UserSegment): MockUserMetrics {
  const now = new Date();
  const baseScores: Record<UserSegment, { app: number; slack: number; notif: number; fatigue: number; daysInactive: number }> = {
    power_user: { app: 85, slack: 80, notif: 75, fatigue: 10, daysInactive: 0 },
    regular: { app: 65, slack: 60, notif: 55, fatigue: 25, daysInactive: 1 },
    casual: { app: 45, slack: 40, notif: 35, fatigue: 40, daysInactive: 3 },
    at_risk: { app: 35, slack: 30, notif: 25, fatigue: 55, daysInactive: 5 },
    dormant: { app: 20, slack: 15, notif: 10, fatigue: 70, daysInactive: 10 },
    churned: { app: 5, slack: 5, notif: 5, fatigue: 85, daysInactive: 35 },
  };

  const base = baseScores[segment];
  const variance = () => Math.floor(Math.random() * 10) - 5;

  const appScore = Math.min(100, Math.max(0, base.app + variance()));
  const slackScore = Math.min(100, Math.max(0, base.slack + variance()));
  const notifScore = Math.min(100, Math.max(0, base.notif + variance()));

  const lastActiveDate = new Date(now);
  lastActiveDate.setDate(lastActiveDate.getDate() - base.daysInactive);

  return {
    userId: `mock-${segment}-${Date.now()}`,
    segment,
    appEngagementScore: appScore,
    slackEngagementScore: slackScore,
    notificationEngagementScore: notifScore,
    overallEngagementScore: Math.round(appScore * 0.4 + slackScore * 0.3 + notifScore * 0.3),
    preferredFrequency: segment === 'power_user' ? 'high' : segment === 'churned' || segment === 'dormant' ? 'low' : 'moderate',
    fatigueLevel: Math.min(100, Math.max(0, base.fatigue + variance())),
    typicalActiveHours: [9, 10, 11, 14, 15, 16],
    peakActivityHour: 10,
    daysInactive: base.daysInactive,
    lastAppActiveAt: base.daysInactive > 0 ? lastActiveDate.toISOString() : now.toISOString(),
    lastSlackActiveAt: base.daysInactive > 0 ? lastActiveDate.toISOString() : now.toISOString(),
    notificationsSentToday: segment === 'power_user' ? 5 : segment === 'dormant' ? 0 : 2,
    notificationsSentThisHour: segment === 'power_user' ? 1 : 0,
  };
}

// =====================================================
// Simulation Logic (mirrors edge function logic)
// =====================================================

function calculateOptimalSendTime(
  metrics: MockUserMetrics,
  priority: NotificationPriority
): { recommendedTime: Date; confidence: number; reasoning: string } {
  const now = new Date();
  const currentHour = now.getHours();

  // Urgent: send immediately
  if (priority === 'urgent') {
    return {
      recommendedTime: now,
      confidence: 1.0,
      reasoning: 'Priority is urgent - sending immediately',
    };
  }

  // Check if current hour is in active window
  const isActiveNow = metrics.typicalActiveHours.includes(currentHour);

  if (isActiveNow && priority === 'high') {
    return {
      recommendedTime: now,
      confidence: 0.85,
      reasoning: `User typically active at hour ${currentHour}, high priority`,
    };
  }

  // Find next active hour
  const nextActiveHour = metrics.typicalActiveHours.find(h => h > currentHour)
    || metrics.typicalActiveHours[0];

  const nextActiveTime = new Date(now);
  if (nextActiveHour <= currentHour) {
    nextActiveTime.setDate(nextActiveTime.getDate() + 1);
  }
  nextActiveTime.setHours(nextActiveHour, 0, 0, 0);

  // For medium priority, wait for optimal time within 8 hours
  const hoursUntilActive = (nextActiveTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (priority === 'medium' && hoursUntilActive <= 8) {
    return {
      recommendedTime: nextActiveTime,
      confidence: 0.75,
      reasoning: `Scheduling for peak activity hour ${nextActiveHour} (${hoursUntilActive.toFixed(1)}h from now)`,
    };
  }

  // Low priority: use peak hour
  const peakTime = new Date(now);
  if (metrics.peakActivityHour <= currentHour) {
    peakTime.setDate(peakTime.getDate() + 1);
  }
  peakTime.setHours(metrics.peakActivityHour, 0, 0, 0);

  return {
    recommendedTime: peakTime,
    confidence: 0.6,
    reasoning: `Low priority - scheduling for user's peak hour ${metrics.peakActivityHour}`,
  };
}

function checkFrequencyLimit(
  metrics: MockUserMetrics,
  priority: NotificationPriority
): { allowed: boolean; reason: string; delayMinutes?: number } {
  const limits = FREQUENCY_LIMITS[metrics.preferredFrequency];

  // Fatigue check
  if (metrics.fatigueLevel > 70 && priority !== 'urgent') {
    return {
      allowed: false,
      reason: `High fatigue level (${metrics.fatigueLevel}%) - suppressing non-urgent notifications`,
      delayMinutes: 120,
    };
  }

  // Hourly limit
  if (metrics.notificationsSentThisHour >= limits.maxPerHour && priority !== 'urgent') {
    return {
      allowed: false,
      reason: `Hourly limit reached (${metrics.notificationsSentThisHour}/${limits.maxPerHour})`,
      delayMinutes: 60,
    };
  }

  // Daily limit
  if (metrics.notificationsSentToday >= limits.maxPerDay && priority !== 'urgent') {
    return {
      allowed: false,
      reason: `Daily limit reached (${metrics.notificationsSentToday}/${limits.maxPerDay})`,
      delayMinutes: 1440, // Next day
    };
  }

  return {
    allowed: true,
    reason: `Within limits: ${metrics.notificationsSentThisHour}/${limits.maxPerHour} hourly, ${metrics.notificationsSentToday}/${limits.maxPerDay} daily`,
  };
}

function selectReengagementType(
  segment: UserSegment,
  hasUpcomingMeetings: boolean,
  hasDealUpdates: boolean,
  hasNewEmails: boolean
): { type: ReengagementType; reason: string } {
  // Content-driven triggers take priority
  if (hasUpcomingMeetings) {
    return { type: 'upcoming_meeting', reason: 'User has upcoming meetings - prep nudge' };
  }
  if (hasDealUpdates) {
    return { type: 'deal_update', reason: 'Deals have updates requiring attention' };
  }
  if (hasNewEmails) {
    return { type: 'new_email_summary', reason: 'Important emails received' };
  }

  // Segment-based fallback
  switch (segment) {
    case 'at_risk':
      return { type: 'value_reminder', reason: 'At-risk user - remind of platform value' };
    case 'dormant':
      return { type: 'gentle_nudge', reason: 'Dormant user - soft re-engagement' };
    case 'churned':
      return { type: 'win_back', reason: 'Churned user - win-back campaign' };
    default:
      return { type: 'activity_summary', reason: 'Default re-engagement type' };
  }
}

// =====================================================
// Component
// =====================================================

export default function EngagementSimulator() {
  const { user } = useAuth();
  const { activeOrgId } = useOrg();

  // Mode
  const [useLiveData, setUseLiveData] = useState(false);
  const [dryRun, setDryRun] = useState(true);

  // Mock user state
  const [selectedSegment, setSelectedSegment] = useState<UserSegment>('regular');
  const [mockUser, setMockUser] = useState<MockUserMetrics>(() => generateMockUser('regular'));

  // Live data state
  const [liveUsers, setLiveUsers] = useState<LiveUser[]>([]);
  const [selectedLiveUser, setSelectedLiveUser] = useState<string | null>(null);
  const [loadingLiveUsers, setLoadingLiveUsers] = useState(false);

  // Simulation inputs
  const [notificationPriority, setNotificationPriority] = useState<NotificationPriority>('medium');
  const [hasUpcomingMeetings, setHasUpcomingMeetings] = useState(false);
  const [hasDealUpdates, setHasDealUpdates] = useState(false);
  const [hasNewEmails, setHasNewEmails] = useState(false);

  // Results
  const [results, setResults] = useState<SimulationResult[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);

  // Fetch live users
  const fetchLiveUsers = useCallback(async () => {
    if (!activeOrgId) return;
    setLoadingLiveUsers(true);

    try {
      const { data, error } = await supabase
        .from('user_engagement_metrics')
        .select(`
          user_id,
          user_segment,
          overall_engagement_score,
          preferred_notification_frequency,
          notification_fatigue_level,
          last_app_active_at,
          profiles:user_id (email, first_name, last_name)
        `)
        .eq('org_id', activeOrgId)
        .limit(50);

      if (error) throw error;

      const formatted = (data || []).map(row => ({
        user_id: row.user_id,
        email: (row.profiles as any)?.email || 'Unknown',
        full_name: [(row.profiles as any)?.first_name, (row.profiles as any)?.last_name].filter(Boolean).join(' ') || null,
        user_segment: (row.user_segment || 'regular') as UserSegment,
        overall_engagement_score: row.overall_engagement_score || 50,
        preferred_notification_frequency: (row.preferred_notification_frequency || 'moderate') as NotificationFrequency,
        notification_fatigue_level: row.notification_fatigue_level || 0,
        last_app_active_at: row.last_app_active_at,
      }));

      setLiveUsers(formatted);
      if (formatted.length > 0 && !selectedLiveUser) {
        setSelectedLiveUser(formatted[0].user_id);
      }
    } catch (err) {
      console.error('Failed to fetch live users:', err);
      toast.error('Failed to load live users');
    } finally {
      setLoadingLiveUsers(false);
    }
  }, [activeOrgId, selectedLiveUser]);

  useEffect(() => {
    if (useLiveData) {
      fetchLiveUsers();
    }
  }, [useLiveData, fetchLiveUsers]);

  // Regenerate mock user when segment changes
  useEffect(() => {
    if (!useLiveData) {
      setMockUser(generateMockUser(selectedSegment));
    }
  }, [selectedSegment, useLiveData]);

  // Get current user metrics (mock or live)
  const currentMetrics = useMemo((): MockUserMetrics => {
    if (useLiveData && selectedLiveUser) {
      const liveUser = liveUsers.find(u => u.user_id === selectedLiveUser);
      if (liveUser) {
        const daysInactive = liveUser.last_app_active_at
          ? Math.floor((Date.now() - new Date(liveUser.last_app_active_at).getTime()) / (1000 * 60 * 60 * 24))
          : 30;

        return {
          userId: liveUser.user_id,
          segment: liveUser.user_segment,
          appEngagementScore: liveUser.overall_engagement_score,
          slackEngagementScore: liveUser.overall_engagement_score - 10,
          notificationEngagementScore: liveUser.overall_engagement_score - 15,
          overallEngagementScore: liveUser.overall_engagement_score,
          preferredFrequency: liveUser.preferred_notification_frequency,
          fatigueLevel: liveUser.notification_fatigue_level,
          typicalActiveHours: [9, 10, 11, 14, 15, 16], // Would fetch from actual data
          peakActivityHour: 10,
          daysInactive,
          lastAppActiveAt: liveUser.last_app_active_at,
          lastSlackActiveAt: liveUser.last_app_active_at,
          notificationsSentToday: 3, // Would fetch from actual data
          notificationsSentThisHour: 0,
        };
      }
    }
    return mockUser;
  }, [useLiveData, selectedLiveUser, liveUsers, mockUser]);

  // Run all simulations
  const runSimulations = async () => {
    setIsSimulating(true);
    const newResults: SimulationResult[] = [];

    try {
      // 1. Segment Classification
      newResults.push({
        type: 'segment',
        success: true,
        input: {
          overallScore: currentMetrics.overallEngagementScore,
          daysInactive: currentMetrics.daysInactive,
          fatigueLevel: currentMetrics.fatigueLevel,
        },
        output: {
          segment: currentMetrics.segment,
          segmentLabel: SEGMENT_CONFIG[currentMetrics.segment].label,
        },
        reasoning: SEGMENT_CONFIG[currentMetrics.segment].description,
        timestamp: new Date().toISOString(),
      });

      // 2. Optimal Timing
      const timing = calculateOptimalSendTime(currentMetrics, notificationPriority);
      newResults.push({
        type: 'timing',
        success: true,
        input: {
          priority: notificationPriority,
          typicalActiveHours: currentMetrics.typicalActiveHours,
          peakHour: currentMetrics.peakActivityHour,
        },
        output: {
          recommendedTime: timing.recommendedTime.toISOString(),
          confidence: timing.confidence,
          sendNow: timing.recommendedTime.getTime() - Date.now() < 60000,
        },
        reasoning: timing.reasoning,
        timestamp: new Date().toISOString(),
      });

      // 3. Frequency Check
      const frequency = checkFrequencyLimit(currentMetrics, notificationPriority);
      newResults.push({
        type: 'frequency',
        success: frequency.allowed,
        input: {
          priority: notificationPriority,
          preferredFrequency: currentMetrics.preferredFrequency,
          sentToday: currentMetrics.notificationsSentToday,
          sentThisHour: currentMetrics.notificationsSentThisHour,
          fatigueLevel: currentMetrics.fatigueLevel,
        },
        output: {
          allowed: frequency.allowed,
          delayMinutes: frequency.delayMinutes,
        },
        reasoning: frequency.reason,
        timestamp: new Date().toISOString(),
      });

      // 4. Re-engagement Selection (for at_risk, dormant, churned)
      if (['at_risk', 'dormant', 'churned'].includes(currentMetrics.segment)) {
        const reengagement = selectReengagementType(
          currentMetrics.segment,
          hasUpcomingMeetings,
          hasDealUpdates,
          hasNewEmails
        );
        newResults.push({
          type: 'reengagement',
          success: true,
          input: {
            segment: currentMetrics.segment,
            hasUpcomingMeetings,
            hasDealUpdates,
            hasNewEmails,
          },
          output: {
            type: reengagement.type,
            typeLabel: REENGAGEMENT_TYPES[reengagement.type].label,
          },
          reasoning: reengagement.reason,
          timestamp: new Date().toISOString(),
        });
      }

      // 5. Queue Simulation
      const shouldQueue = !frequency.allowed || timing.recommendedTime.getTime() - Date.now() > 60000;
      newResults.push({
        type: 'queue',
        success: true,
        input: {
          frequencyAllowed: frequency.allowed,
          sendNow: timing.recommendedTime.getTime() - Date.now() < 60000,
        },
        output: {
          queued: shouldQueue,
          scheduledFor: shouldQueue ? timing.recommendedTime.toISOString() : 'immediate',
          status: shouldQueue ? 'pending' : 'ready_to_send',
        },
        reasoning: shouldQueue
          ? `Notification queued for optimal delivery at ${timing.recommendedTime.toLocaleTimeString()}`
          : 'Ready for immediate delivery',
        timestamp: new Date().toISOString(),
      });

      // If not dry run and has real edge function, call it
      if (!dryRun && useLiveData && selectedLiveUser) {
        try {
          const { data, error } = await supabase.functions.invoke('process-notification-queue', {
            body: {
              user_id: selectedLiveUser,
              dry_run: true, // Still use dry run on backend for safety
            },
          });

          if (!error && data) {
            newResults.push({
              type: 'queue',
              success: data.success,
              input: { userId: selectedLiveUser, source: 'live_edge_function' },
              output: data,
              reasoning: 'Live edge function response',
              timestamp: new Date().toISOString(),
            });
          }
        } catch (err) {
          console.error('Edge function call failed:', err);
        }
      }

      setResults(newResults);
      toast.success('Simulation complete');
    } catch (err) {
      console.error('Simulation error:', err);
      toast.error('Simulation failed');
    } finally {
      setIsSimulating(false);
    }
  };

  // Trigger re-engagement via edge function
  const triggerReengagement = async () => {
    if (!activeOrgId) return;
    setIsSimulating(true);

    try {
      const { data, error } = await supabase.functions.invoke('process-reengagement', {
        body: {
          org_id: activeOrgId,
          user_id: useLiveData && selectedLiveUser ? selectedLiveUser : undefined,
          segment: useLiveData ? undefined : selectedSegment,
          dry_run: dryRun,
          limit: 1,
        },
      });

      if (error) throw error;

      setResults(prev => [...prev, {
        type: 'reengagement',
        success: data?.success ?? false,
        input: {
          orgId: activeOrgId,
          userId: selectedLiveUser,
          segment: selectedSegment,
          dryRun,
        },
        output: data || {},
        reasoning: data?.message || 'Re-engagement processed',
        timestamp: new Date().toISOString(),
      }]);

      toast.success(dryRun ? 'Re-engagement simulated (dry run)' : 'Re-engagement triggered');
    } catch (err) {
      console.error('Re-engagement error:', err);
      toast.error('Re-engagement failed');
    } finally {
      setIsSimulating(false);
    }
  };

  const clearResults = () => setResults([]);

  const selectedLiveUserData = liveUsers.find(u => u.user_id === selectedLiveUser);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Back Button */}
        <BackToPlatform />

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
              Engagement Simulator
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Test the Smart Engagement Algorithm with mock or live data
            </p>
          </div>
          <Badge variant="secondary">Platform Admin</Badge>
        </div>

        {!activeOrgId && (
          <Alert variant="destructive">
            <AlertDescription>
              No active organization selected. Select an org to use live data.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Configuration */}
          <div className="lg:col-span-1 space-y-6">
            {/* Data Source */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Data Source
                </CardTitle>
                <CardDescription>
                  Toggle between mock and live data
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <TestTube className="h-4 w-4" />
                    Use Live Data
                  </Label>
                  <Switch
                    checked={useLiveData}
                    onCheckedChange={setUseLiveData}
                    disabled={!activeOrgId}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <Label>Dry Run</Label>
                  <Switch checked={dryRun} onCheckedChange={setDryRun} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Dry run shows what would happen without sending real notifications
                </p>
              </CardContent>
            </Card>

            {/* User Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  {useLiveData ? 'Select User' : 'Mock User Segment'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {useLiveData ? (
                  <>
                    {loadingLiveUsers ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin" />
                      </div>
                    ) : liveUsers.length > 0 ? (
                      <Select value={selectedLiveUser || ''} onValueChange={setSelectedLiveUser}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a user" />
                        </SelectTrigger>
                        <SelectContent>
                          {liveUsers.map(user => (
                            <SelectItem key={user.user_id} value={user.user_id}>
                              <div className="flex items-center gap-2">
                                <span>{user.full_name || user.email}</span>
                                <Badge variant="outline" className="text-xs">
                                  {SEGMENT_CONFIG[user.user_segment]?.label || user.user_segment}
                                </Badge>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No users with engagement data found
                      </p>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={fetchLiveUsers}
                      disabled={loadingLiveUsers}
                      className="w-full"
                    >
                      <RefreshCw className={cn("h-4 w-4 mr-2", loadingLiveUsers && "animate-spin")} />
                      Refresh Users
                    </Button>
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(SEGMENT_CONFIG) as UserSegment[]).map(seg => {
                      const config = SEGMENT_CONFIG[seg];
                      const Icon = config.icon;
                      const isActive = selectedSegment === seg;
                      return (
                        <button
                          key={seg}
                          type="button"
                          onClick={() => setSelectedSegment(seg)}
                          className={cn(
                            "text-left rounded-lg border p-2 transition-colors",
                            isActive
                              ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
                              : "border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/40"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <div className={cn("w-2 h-2 rounded-full", config.color)} />
                            <Icon className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs font-medium">{config.label}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Simulation Inputs */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Simulation Inputs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs mb-2 block">Notification Priority</Label>
                  <Select
                    value={notificationPriority}
                    onValueChange={(v) => setNotificationPriority(v as NotificationPriority)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />
                <Label className="text-xs block">Content Triggers</Label>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Upcoming meetings</Label>
                    <Switch checked={hasUpcomingMeetings} onCheckedChange={setHasUpcomingMeetings} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Deal updates</Label>
                    <Switch checked={hasDealUpdates} onCheckedChange={setHasDealUpdates} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">New emails</Label>
                    <Switch checked={hasNewEmails} onCheckedChange={setHasNewEmails} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right: Metrics & Results */}
          <div className="lg:col-span-2 space-y-6">
            {/* Current User Metrics */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Current User Metrics
                  {useLiveData && (
                    <Badge variant="secondary" className="ml-2">Live</Badge>
                  )}
                </CardTitle>
                {useLiveData && selectedLiveUserData && (
                  <CardDescription>
                    {selectedLiveUserData.full_name || selectedLiveUserData.email}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-3 rounded-lg bg-muted/50">
                    <div className="text-2xl font-bold">{currentMetrics.overallEngagementScore}</div>
                    <div className="text-xs text-muted-foreground">Engagement Score</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center justify-center gap-1">
                      <div className={cn("w-2 h-2 rounded-full", SEGMENT_CONFIG[currentMetrics.segment].color)} />
                      <span className="font-medium">{SEGMENT_CONFIG[currentMetrics.segment].label}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">Segment</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/50">
                    <div className="text-2xl font-bold">{currentMetrics.fatigueLevel}%</div>
                    <div className="text-xs text-muted-foreground">Fatigue Level</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/50">
                    <div className="text-2xl font-bold">{currentMetrics.daysInactive}</div>
                    <div className="text-xs text-muted-foreground">Days Inactive</div>
                  </div>
                </div>

                <Separator className="my-4" />

                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Frequency:</span>{' '}
                    <span className="font-medium capitalize">{currentMetrics.preferredFrequency}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Sent today:</span>{' '}
                    <span className="font-medium">{currentMetrics.notificationsSentToday}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Peak hour:</span>{' '}
                    <span className="font-medium">{currentMetrics.peakActivityHour}:00</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Run Buttons */}
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={runSimulations} disabled={isSimulating} className="gap-2">
                {isSimulating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Simulating...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Run Full Simulation
                  </>
                )}
              </Button>

              {['at_risk', 'dormant', 'churned'].includes(currentMetrics.segment) && (
                <Button
                  variant="outline"
                  onClick={triggerReengagement}
                  disabled={isSimulating}
                  className="gap-2"
                >
                  <Send className="h-4 w-4" />
                  Trigger Re-engagement
                </Button>
              )}

              {results.length > 0 && (
                <Button variant="ghost" onClick={clearResults} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Clear Results
                </Button>
              )}
            </div>

            {/* Results */}
            {results.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    Simulation Results
                  </CardTitle>
                  <CardDescription>
                    {results.length} simulation steps completed
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {results.map((result, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "rounded-lg border p-4",
                        result.success
                          ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-900/10"
                          : "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-900/10"
                      )}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={result.success ? 'default' : 'destructive'}>
                            {result.type.toUpperCase()}
                          </Badge>
                          {result.success ? (
                            <ThumbsUp className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <ThumbsDown className="h-4 w-4 text-red-600" />
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(result.timestamp).toLocaleTimeString()}
                        </span>
                      </div>

                      {result.reasoning && (
                        <p className="text-sm mb-3">{result.reasoning}</p>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-xs mb-1 block">Input</Label>
                          <pre className="text-xs bg-black/5 dark:bg-white/5 rounded p-2 overflow-x-auto">
                            {JSON.stringify(result.input, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <Label className="text-xs mb-1 block">Output</Label>
                          <pre className="text-xs bg-black/5 dark:bg-white/5 rounded p-2 overflow-x-auto">
                            {JSON.stringify(result.output, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Empty state */}
            {results.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <TestTube className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-medium mb-2">Ready to simulate</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Configure the user segment and inputs, then click "Run Full Simulation"
                    to see how the Smart Engagement Algorithm would handle notifications.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
