/**
 * ActivationDashboard - Platform Admin view for user activation metrics
 * 
 * Shows the activation funnel with North Star metric prominently displayed.
 * Design: Premium glassmorphic dark mode per design_system.md
 */

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  Zap,
  Play,
  FileText,
  Star,
  TrendingUp,
  Calendar,
  RefreshCw,
  ChevronRight,
  Sparkles,
  Target,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  BarChart3,
  Mail,
} from 'lucide-react';
import { BackToPlatform } from '@/components/platform/BackToPlatform';
import { supabase } from '@/lib/supabase/clientV2';
import { Button } from '@/components/ui/button';
import { format, subDays } from 'date-fns';

interface FunnelStep {
  step_name: string;
  step_order: number;
  user_count: number;
  percentage: number;
  avg_time_to_step: string | null;
}

interface ActivationMetrics {
  total_users: number;
  fathom_connected_count: number;
  first_meeting_synced_count: number;
  first_summary_viewed_count: number;
  first_proposal_generated_count: number;
  fully_activated_count: number;
  activations_today: number;
  activations_this_week: number;
}

interface RecentEvent {
  id: string;
  user_id: string;
  event_type: string;
  created_at: string;
  user_email?: string;
}

interface CohortData {
  cohort_week: string;
  week_label: string;
  total_users: number;
  fathom_connected: number;
  first_meeting_synced: number;
  first_summary_viewed: number;
  fully_activated: number;
  activation_rate: number;
}

interface AtRiskUser {
  user_id: string;
  email: string;
  full_name: string | null;
  signup_date: string;
  hours_since_signup: number;
  fathom_connected: boolean;
  first_meeting_synced: boolean;
  first_summary_viewed: boolean;
  risk_level: 'high' | 'medium' | 'low';
  suggested_action: string;
  org_name: string | null;
}

interface AtRiskSummary {
  risk_level: string;
  user_count: number;
  percentage: number;
}

export default function ActivationDashboard() {
  const [metrics, setMetrics] = useState<ActivationMetrics | null>(null);
  const [funnelData, setFunnelData] = useState<FunnelStep[]>([]);
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([]);
  const [cohortData, setCohortData] = useState<CohortData[]>([]);
  const [atRiskUsers, setAtRiskUsers] = useState<AtRiskUser[]>([]);
  const [atRiskSummary, setAtRiskSummary] = useState<AtRiskSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [activeTab, setActiveTab] = useState<'funnel' | 'cohorts' | 'at-risk'>('funnel');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load funnel metrics from view
      const { data: metricsData } = await supabase
        .from('activation_funnel_metrics')
        .select('*')
        .single();

      if (metricsData) {
        setMetrics(metricsData);
      }

      // Load funnel data from function
      const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
      const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');
      const endDate = format(new Date(), 'yyyy-MM-dd');

      const { data: funnelResult } = await supabase.rpc('get_activation_funnel', {
        p_start_date: startDate,
        p_end_date: endDate,
      });

      if (funnelResult) {
        setFunnelData(funnelResult);
      }

      // Load recent events
      const { data: eventsData } = await supabase
        .from('user_activation_events')
        .select(`
          id,
          user_id,
          event_type,
          created_at
        `)
        .order('created_at', { ascending: false })
        .limit(20);

      if (eventsData) {
        setRecentEvents(eventsData);
      }

      // Load cohort data
      const weeks = dateRange === '7d' ? 4 : dateRange === '30d' ? 8 : 12;
      const { data: cohortResult } = await supabase.rpc('get_cohort_analysis', {
        p_weeks: weeks,
      });

      if (cohortResult) {
        setCohortData(cohortResult);
      }

      // Load at-risk users
      const { data: atRiskResult } = await supabase.rpc('get_at_risk_users', {
        p_risk_level: 'all',
        p_limit: 20,
      });

      if (atRiskResult) {
        setAtRiskUsers(atRiskResult);
      }

      // Load at-risk summary
      const { data: summaryResult } = await supabase.rpc('get_at_risk_summary');

      if (summaryResult) {
        setAtRiskSummary(summaryResult);
      }
    } catch (err) {
      console.error('[ActivationDashboard] Error loading data:', err);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'fathom_connected':
        return <Play className="w-4 h-4 text-blue-400" />;
      case 'first_meeting_synced':
        return <FileText className="w-4 h-4 text-purple-400" />;
      case 'first_summary_viewed':
        return <Star className="w-4 h-4 text-yellow-400" />;
      case 'first_proposal_generated':
        return <Sparkles className="w-4 h-4 text-emerald-400" />;
      default:
        return <Zap className="w-4 h-4 text-gray-400" />;
    }
  };

  const getNorthStarConversion = () => {
    if (!metrics || metrics.total_users === 0) return 0;
    return Math.round((metrics.first_summary_viewed_count / metrics.total_users) * 100);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Back Button */}
        <BackToPlatform />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              Activation Dashboard
            </h1>
            <p className="text-gray-700 dark:text-gray-300 mt-1">
              Track user activation milestones and North Star metric
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as '7d' | '30d' | '90d')}
              className="px-4 py-2 bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-lg text-gray-900 dark:text-gray-100"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
            <Button onClick={loadData} variant="outline" size="icon">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* North Star Metric - Hero Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden bg-gradient-to-br from-yellow-500/20 via-amber-500/10 to-orange-500/20 
                     dark:from-yellow-500/10 dark:via-amber-500/5 dark:to-orange-500/10
                     backdrop-blur-xl rounded-2xl p-8 border border-yellow-500/30 dark:border-yellow-500/20"
        >
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-yellow-400/20 rounded-full blur-3xl" />
          <div className="relative flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Star className="w-6 h-6 text-yellow-500" />
                <span className="text-sm font-semibold text-yellow-600 dark:text-yellow-400 uppercase tracking-wide">
                  North Star Metric
                </span>
              </div>
              <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
                First Summary Viewed
              </h2>
              <p className="text-gray-700 dark:text-gray-300">
                Users who have viewed at least one meeting summary
              </p>
            </div>
            <div className="text-right">
              <div className="text-6xl font-bold text-yellow-600 dark:text-yellow-400">
                {metrics?.first_summary_viewed_count || 0}
              </div>
              <div className="text-lg text-gray-600 dark:text-gray-400">
                {getNorthStarConversion()}% conversion
              </div>
            </div>
          </div>
        </motion.div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Total Users */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 rounded-xl p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-100 dark:bg-blue-500/10 rounded-lg">
                <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Users</span>
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {metrics?.total_users || 0}
            </div>
          </motion.div>

          {/* Fathom Connected */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 rounded-xl p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-purple-100 dark:bg-purple-500/10 rounded-lg">
                <Play className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Fathom Connected</span>
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {metrics?.fathom_connected_count || 0}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {metrics && metrics.total_users > 0
                ? `${Math.round((metrics.fathom_connected_count / metrics.total_users) * 100)}%`
                : '0%'}
            </div>
          </motion.div>

          {/* First Meeting Synced */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 rounded-xl p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-500/10 rounded-lg">
                <FileText className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Meeting Synced</span>
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {metrics?.first_meeting_synced_count || 0}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {metrics && metrics.total_users > 0
                ? `${Math.round((metrics.first_meeting_synced_count / metrics.total_users) * 100)}%`
                : '0%'}
            </div>
          </motion.div>

          {/* Fully Activated */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 rounded-xl p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-green-100 dark:bg-green-500/10 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Fully Activated</span>
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {metrics?.fully_activated_count || 0}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {metrics && metrics.total_users > 0
                ? `${Math.round((metrics.fully_activated_count / metrics.total_users) * 100)}%`
                : '0%'}
            </div>
          </motion.div>
        </div>

        {/* Funnel Visualization */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Funnel Chart */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-white dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 rounded-xl p-6"
          >
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
              <Target className="w-5 h-5 text-emerald-500" />
              Activation Funnel
            </h3>
            <div className="space-y-4">
              {funnelData.map((step, index) => {
                const isNorthStar = step.step_name.includes('North Star');
                const maxCount = funnelData[0]?.user_count || 1;
                const widthPercent = Math.max(20, (step.user_count / maxCount) * 100);

                return (
                  <div key={step.step_order} className="relative">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-medium ${
                        isNorthStar 
                          ? 'text-yellow-600 dark:text-yellow-400' 
                          : 'text-gray-700 dark:text-gray-300'
                      }`}>
                        {isNorthStar && <Star className="w-4 h-4 inline mr-1" />}
                        {step.step_name}
                      </span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {step.user_count} ({step.percentage}%)
                      </span>
                    </div>
                    <div className="h-8 bg-gray-100 dark:bg-gray-800/50 rounded-lg overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${widthPercent}%` }}
                        transition={{ duration: 0.5, delay: 0.1 * index }}
                        className={`h-full rounded-lg ${
                          isNorthStar
                            ? 'bg-gradient-to-r from-yellow-500 to-amber-500'
                            : 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                        }`}
                      />
                    </div>
                    {step.avg_time_to_step && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Avg time: {step.avg_time_to_step}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>

          {/* Recent Events */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 }}
            className="bg-white dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 rounded-xl p-6"
          >
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              Recent Activations
            </h3>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {recentEvents.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                  No activation events yet
                </p>
              ) : (
                recentEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/30 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {getEventIcon(event.event_type)}
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {event.event_type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          User: {event.user_id.slice(0, 8)}...
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {format(new Date(event.created_at), 'MMM d, h:mm a')}
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </div>

        {/* Activity Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="bg-white dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 rounded-xl p-6"
          >
            <div className="flex items-center gap-3 mb-2">
              <Calendar className="w-5 h-5 text-blue-500" />
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Today</span>
            </div>
            <div className="text-4xl font-bold text-gray-900 dark:text-white">
              {metrics?.activations_today || 0}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">activation events</div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="bg-white dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 rounded-xl p-6"
          >
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">This Week</span>
            </div>
            <div className="text-4xl font-bold text-gray-900 dark:text-white">
              {metrics?.activations_this_week || 0}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">activation events</div>
          </motion.div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('cohorts')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'cohorts'
                ? 'text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-500'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <BarChart3 className="w-4 h-4 inline mr-2" />
            Weekly Cohorts
          </button>
          <button
            onClick={() => setActiveTab('at-risk')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'at-risk'
                ? 'text-amber-600 dark:text-amber-400 border-b-2 border-amber-500'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <AlertTriangle className="w-4 h-4 inline mr-2" />
            At-Risk Users ({atRiskUsers.length})
          </button>
        </div>

        {/* Cohorts Tab */}
        {activeTab === 'cohorts' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 rounded-xl p-6"
          >
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-emerald-500" />
              Weekly Cohort Analysis
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Cohort</th>
                    <th className="text-right py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Users</th>
                    <th className="text-right py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Fathom</th>
                    <th className="text-right py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Meeting</th>
                    <th className="text-right py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Summary ⭐</th>
                    <th className="text-right py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Activated</th>
                    <th className="text-right py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {cohortData.map((cohort, index) => (
                    <tr 
                      key={cohort.cohort_week} 
                      className={index % 2 === 0 ? 'bg-gray-50 dark:bg-gray-800/30' : ''}
                    >
                      <td className="py-3 px-4 text-gray-900 dark:text-white font-medium">
                        {cohort.week_label}
                      </td>
                      <td className="text-right py-3 px-4 text-gray-700 dark:text-gray-300">
                        {cohort.total_users}
                      </td>
                      <td className="text-right py-3 px-4 text-gray-700 dark:text-gray-300">
                        {cohort.fathom_connected}
                      </td>
                      <td className="text-right py-3 px-4 text-gray-700 dark:text-gray-300">
                        {cohort.first_meeting_synced}
                      </td>
                      <td className="text-right py-3 px-4 text-yellow-600 dark:text-yellow-400 font-medium">
                        {cohort.first_summary_viewed}
                      </td>
                      <td className="text-right py-3 px-4 text-emerald-600 dark:text-emerald-400 font-medium">
                        {cohort.fully_activated}
                      </td>
                      <td className="text-right py-3 px-4">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          cohort.activation_rate >= 30 
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : cohort.activation_rate >= 15
                            ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                          {cohort.activation_rate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {cohortData.length === 0 && (
                <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                  No cohort data available yet
                </p>
              )}
            </div>
          </motion.div>
        )}

        {/* At-Risk Users Tab */}
        {activeTab === 'at-risk' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* At-Risk Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {['high', 'medium', 'low'].map((level) => {
                const summary = atRiskSummary.find(s => s.risk_level === level);
                const colors = {
                  high: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-500', icon: AlertCircle },
                  medium: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-500', icon: AlertTriangle },
                  low: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-500', icon: AlertTriangle },
                };
                const c = colors[level as keyof typeof colors];
                const Icon = c.icon;

                return (
                  <div
                    key={level}
                    className={`${c.bg} border ${c.border} rounded-xl p-4`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className={`w-5 h-5 ${c.text}`} />
                      <span className={`text-sm font-medium ${c.text} capitalize`}>
                        {level} Risk
                      </span>
                    </div>
                    <div className={`text-3xl font-bold ${c.text}`}>
                      {summary?.user_count || 0}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {summary?.percentage || 0}% of at-risk users
                    </div>
                  </div>
                );
              })}
            </div>

            {/* At-Risk User List */}
            <div className="bg-white dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 rounded-xl p-6">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Users Needing Attention
              </h3>
              <div className="space-y-3">
                {atRiskUsers.map((user) => {
                  const riskColors = {
                    high: 'border-red-500/30 bg-red-500/5',
                    medium: 'border-amber-500/30 bg-amber-500/5',
                    low: 'border-yellow-500/30 bg-yellow-500/5',
                  };

                  return (
                    <div
                      key={user.user_id}
                      className={`p-4 rounded-lg border ${riskColors[user.risk_level]}`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">
                            {user.full_name || user.email}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {user.email}
                          </div>
                          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            Signed up {Math.round(user.hours_since_signup)} hours ago
                            {user.org_name && ` • ${user.org_name}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            user.risk_level === 'high' 
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                              : user.risk_level === 'medium'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                              : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                          }`}>
                            {user.risk_level.toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-4 text-xs">
                        <div className={`flex items-center gap-1 ${user.fathom_connected ? 'text-emerald-500' : 'text-gray-400'}`}>
                          {user.fathom_connected ? <CheckCircle2 className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
                          Fathom
                        </div>
                        <div className={`flex items-center gap-1 ${user.first_meeting_synced ? 'text-emerald-500' : 'text-gray-400'}`}>
                          {user.first_meeting_synced ? <CheckCircle2 className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                          Meeting
                        </div>
                        <div className={`flex items-center gap-1 ${user.first_summary_viewed ? 'text-emerald-500' : 'text-gray-400'}`}>
                          {user.first_summary_viewed ? <CheckCircle2 className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                          Summary
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <Mail className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {user.suggested_action}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {atRiskUsers.length === 0 && (
                  <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                    🎉 No at-risk users! Everyone is on track.
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
