/**
 * EngagementDashboard - Smart Engagement Algorithm Admin View
 *
 * Shows user engagement metrics, notification interaction stats, and user segments.
 * Design: Premium glassmorphic dark mode per design_system.md
 */

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  Bell,
  Activity,
  TrendingUp,
  TrendingDown,
  Clock,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  Filter,
  BarChart3,
  Zap,
  AlertTriangle,
  UserCheck,
  UserX,
  Sparkles,
} from 'lucide-react';
import { BackToPlatform } from '@/components/platform/BackToPlatform';
import { supabase } from '@/lib/supabase/clientV2';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { format, formatDistanceToNow, subDays } from 'date-fns';
import { cn } from '@/lib/utils';

interface EngagementMetrics {
  total_users: number;
  active_users_24h: number;
  active_users_7d: number;
  avg_engagement_score: number;
  notifications_sent_today: number;
  notifications_clicked_today: number;
  click_rate: number;
}

interface SegmentData {
  segment: string;
  count: number;
  percentage: number;
}

interface FeedbackSummary {
  want_more: number;
  just_right: number;
  too_many: number;
}

interface TopUser {
  user_id: string;
  email: string;
  full_name: string | null;
  overall_engagement_score: number;
  user_segment: string;
  last_app_active_at: string | null;
  preferred_notification_frequency: string;
}

interface NotificationTypeStats {
  notification_type: string;
  sent_count: number;
  clicked_count: number;
  click_rate: number;
}

const SEGMENT_CONFIG: Record<string, { label: string; color: string; icon: typeof Users }> = {
  power_user: { label: 'Power Users', color: 'bg-emerald-500', icon: Zap },
  regular: { label: 'Regular', color: 'bg-blue-500', icon: UserCheck },
  casual: { label: 'Casual', color: 'bg-amber-500', icon: Users },
  at_risk: { label: 'At Risk', color: 'bg-orange-500', icon: AlertTriangle },
  dormant: { label: 'Dormant', color: 'bg-red-500', icon: UserX },
  churned: { label: 'Churned', color: 'bg-slate-500', icon: UserX },
};

export default function EngagementDashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [metrics, setMetrics] = useState<EngagementMetrics | null>(null);
  const [segments, setSegments] = useState<SegmentData[]>([]);
  const [feedback, setFeedback] = useState<FeedbackSummary>({ want_more: 0, just_right: 0, too_many: 0 });
  const [topUsers, setTopUsers] = useState<TopUser[]>([]);
  const [notificationStats, setNotificationStats] = useState<NotificationTypeStats[]>([]);

  const fetchData = useCallback(async () => {
    try {
      // Fetch overall metrics
      const { data: metricsData, error: metricsError } = await supabase.rpc('get_engagement_overview');
      if (!metricsError && metricsData) {
        setMetrics(metricsData);
      }

      // Fetch segment distribution
      const { data: segmentData, error: segmentError } = await supabase
        .from('user_engagement_metrics')
        .select('user_segment');

      if (!segmentError && segmentData) {
        const segmentCounts: Record<string, number> = {};
        segmentData.forEach(row => {
          const seg = row.user_segment || 'regular';
          segmentCounts[seg] = (segmentCounts[seg] || 0) + 1;
        });

        const total = segmentData.length || 1;
        const segmentArray = Object.entries(segmentCounts).map(([segment, count]) => ({
          segment,
          count,
          percentage: Math.round((count / total) * 100),
        }));
        setSegments(segmentArray);
      }

      // Fetch recent feedback
      const thirtyDaysAgo = subDays(new Date(), 30).toISOString();
      const { data: feedbackData, error: feedbackError } = await supabase
        .from('notification_feedback')
        .select('feedback_value')
        .eq('feedback_type', 'frequency_preference')
        .gte('created_at', thirtyDaysAgo);

      if (!feedbackError && feedbackData) {
        const summary = { want_more: 0, just_right: 0, too_many: 0 };
        feedbackData.forEach(row => {
          if (row.feedback_value === 'more') summary.want_more++;
          else if (row.feedback_value === 'just_right') summary.just_right++;
          else if (row.feedback_value === 'less') summary.too_many++;
        });
        setFeedback(summary);
      }

      // Fetch top engaged users
      const { data: topUsersData, error: topUsersError } = await supabase
        .from('user_engagement_metrics')
        .select(`
          user_id,
          overall_engagement_score,
          user_segment,
          last_app_active_at,
          preferred_notification_frequency,
          profiles:user_id (email, first_name, last_name)
        `)
        .order('overall_engagement_score', { ascending: false })
        .limit(10);

      if (!topUsersError && topUsersData) {
        const formattedUsers = topUsersData.map(row => ({
          user_id: row.user_id,
          email: (row.profiles as any)?.email || 'Unknown',
          full_name: [(row.profiles as any)?.first_name, (row.profiles as any)?.last_name].filter(Boolean).join(' ') || null,
          overall_engagement_score: row.overall_engagement_score,
          user_segment: row.user_segment,
          last_app_active_at: row.last_app_active_at,
          preferred_notification_frequency: row.preferred_notification_frequency,
        }));
        setTopUsers(formattedUsers);
      }

      // Fetch notification type stats (last 7 days)
      const sevenDaysAgo = subDays(new Date(), 7).toISOString();
      const { data: notifStatsData, error: notifStatsError } = await supabase
        .from('notification_interactions')
        .select('notification_type, clicked_at')
        .gte('delivered_at', sevenDaysAgo);

      if (!notifStatsError && notifStatsData) {
        const typeCounts: Record<string, { sent: number; clicked: number }> = {};
        notifStatsData.forEach(row => {
          const type = row.notification_type;
          if (!typeCounts[type]) typeCounts[type] = { sent: 0, clicked: 0 };
          typeCounts[type].sent++;
          if (row.clicked_at) typeCounts[type].clicked++;
        });

        const stats = Object.entries(typeCounts).map(([type, counts]) => ({
          notification_type: type,
          sent_count: counts.sent,
          clicked_count: counts.clicked,
          click_rate: counts.sent > 0 ? Math.round((counts.clicked / counts.sent) * 100) : 0,
        }));
        setNotificationStats(stats);
      }
    } catch (err) {
      console.error('Failed to fetch engagement data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalFeedback = feedback.want_more + feedback.just_right + feedback.too_many;

  return (
    <div className="space-y-6 p-6">
      {/* Back Button */}
      <BackToPlatform />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Engagement Dashboard</h1>
          <p className="text-muted-foreground">
            Smart Engagement Algorithm - User activity and notification performance
          </p>
        </div>
        <Button onClick={handleRefresh} variant="outline" disabled={refreshing}>
          <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Overview Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users (24h)</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.active_users_24h ?? '-'}</div>
            <p className="text-xs text-muted-foreground">
              of {metrics?.total_users ?? '-'} total users
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Engagement Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.avg_engagement_score ?? '-'}</div>
            <p className="text-xs text-muted-foreground">
              out of 100
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Notifications Today</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.notifications_sent_today ?? '-'}</div>
            <p className="text-xs text-muted-foreground">
              {metrics?.notifications_clicked_today ?? 0} clicked ({metrics?.click_rate ?? 0}%)
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">7-Day Active</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.active_users_7d ?? '-'}</div>
            <p className="text-xs text-muted-foreground">
              users active this week
            </p>
          </CardContent>
        </Card>
      </div>

      {/* User Segments & Feedback */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* User Segments */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              User Segments
            </CardTitle>
            <CardDescription>Distribution of users by engagement level</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {segments.map((seg) => {
                const config = SEGMENT_CONFIG[seg.segment] || SEGMENT_CONFIG.regular;
                const Icon = config.icon;
                return (
                  <div key={seg.segment} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-2 h-2 rounded-full", config.color)} />
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{config.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{seg.count}</Badge>
                      <span className="text-xs text-muted-foreground w-12 text-right">{seg.percentage}%</span>
                    </div>
                  </div>
                );
              })}
              {segments.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No segment data available yet
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Notification Feedback */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Notification Feedback (30 days)
            </CardTitle>
            <CardDescription>User preferences from bi-weekly surveys</CardDescription>
          </CardHeader>
          <CardContent>
            {totalFeedback > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ThumbsUp className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm">Want more</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${(feedback.want_more / totalFeedback) * 100}%` }}
                      />
                    </div>
                    <Badge variant="secondary">{feedback.want_more}</Badge>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-blue-500" />
                    <span className="text-sm">Just right</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${(feedback.just_right / totalFeedback) * 100}%` }}
                      />
                    </div>
                    <Badge variant="secondary">{feedback.just_right}</Badge>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ThumbsDown className="h-4 w-4 text-red-500" />
                    <span className="text-sm">Too many</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-500 rounded-full"
                        style={{ width: `${(feedback.too_many / totalFeedback) * 100}%` }}
                      />
                    </div>
                    <Badge variant="secondary">{feedback.too_many}</Badge>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground text-center pt-2">
                  {totalFeedback} responses collected
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No feedback collected yet. Feedback requests are sent every 2 weeks.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Notification Performance by Type */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Notification Performance (7 days)
          </CardTitle>
          <CardDescription>Click rates by notification type</CardDescription>
        </CardHeader>
        <CardContent>
          {notificationStats.length > 0 ? (
            <div className="space-y-3">
              {notificationStats.map((stat) => (
                <div key={stat.notification_type} className="flex items-center justify-between">
                  <span className="text-sm font-medium capitalize">
                    {stat.notification_type.replace(/_/g, ' ')}
                  </span>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground">
                      {stat.sent_count} sent
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {stat.clicked_count} clicked
                    </span>
                    <Badge
                      variant={stat.click_rate >= 30 ? 'default' : stat.click_rate >= 15 ? 'secondary' : 'destructive'}
                    >
                      {stat.click_rate}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No notification data available yet
            </p>
          )}
        </CardContent>
      </Card>

      {/* Top Engaged Users */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Top Engaged Users
          </CardTitle>
          <CardDescription>Users with highest engagement scores</CardDescription>
        </CardHeader>
        <CardContent>
          {topUsers.length > 0 ? (
            <div className="space-y-2">
              {topUsers.map((user, index) => {
                const config = SEGMENT_CONFIG[user.user_segment] || SEGMENT_CONFIG.regular;
                return (
                  <div
                    key={user.user_id}
                    className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground w-6">{index + 1}.</span>
                      <div>
                        <p className="text-sm font-medium">{user.full_name || user.email}</p>
                        {user.full_name && (
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className={cn("text-xs", config.color.replace('bg-', 'text-'))}>
                        {config.label}
                      </Badge>
                      <div className="text-right">
                        <p className="text-sm font-bold">{user.overall_engagement_score}</p>
                        <p className="text-xs text-muted-foreground">
                          {user.last_app_active_at
                            ? formatDistanceToNow(new Date(user.last_app_active_at), { addSuffix: true })
                            : 'Never active'
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No user engagement data available yet
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
