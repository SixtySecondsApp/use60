/**
 * Team Analytics Page - Enhanced team performance dashboard
 * Features: KPIs with trends, performance charts, team comparison matrix, drill-down modal
 */

import React, { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, Calendar } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useActiveOrg } from '@/lib/stores/orgStore';

// New team analytics components
import { TeamKPIGrid, TeamKPIGridSkeleton } from '@/components/insights/TeamKPIGrid';
import { TeamTrendsChart, TeamTrendsChartSkeleton } from '@/components/insights/TeamTrendsChart';
import { TeamComparisonMatrix, TeamComparisonMatrixSkeleton } from '@/components/insights/TeamComparisonMatrix';
import { MetricDrillDownModal } from '@/components/insights/MetricDrillDownModal';
import { HelpPanel } from '@/components/docs/HelpPanel';

// Types
import type { TimePeriod, DrillDownMetricType } from '@/lib/hooks/useTeamAnalytics';

// Period options configuration
const periodOptions: { value: TimePeriod; label: string }[] = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
];

// Map metric types to human-readable titles
const metricTitles: Record<DrillDownMetricType, string> = {
  all: 'All Meetings',
  positive_sentiment: 'Positive Sentiment Meetings',
  negative_sentiment: 'Negative Sentiment Meetings',
  forward_movement: 'Forward Movement Meetings',
  objection: 'Meetings with Objections',
  positive_outcome: 'Positive Outcome Meetings',
  negative_outcome: 'Negative Outcome Meetings',
  sentiment_extremes: 'Sentiment Highlights',
  talk_time_extremes: 'Talk Time Distribution',
  coach_rating_summary: 'Coaching Guidance',
  objection_details: 'Objections Analysis',
};

export default function TeamAnalytics() {
  const { user } = useAuth();
  const activeOrg = useActiveOrg();
  const [searchParams, setSearchParams] = useSearchParams();

  // Get period from URL or default to 30
  const periodParam = searchParams.get('period');
  const period: TimePeriod = periodParam === '7' ? 7 : periodParam === '90' ? 90 : 30;

  // Drill-down modal state
  const [drillDownState, setDrillDownState] = useState<{
    isOpen: boolean;
    metricType: DrillDownMetricType;
    userId?: string;
    repName?: string;
  }>({
    isOpen: false,
    metricType: 'all',
  });

  // Handle period change
  const handlePeriodChange = useCallback(
    (value: string) => {
      const newPeriod = parseInt(value, 10) as TimePeriod;
      setSearchParams({ period: newPeriod.toString() });
    },
    [setSearchParams]
  );

  // Handle KPI card click for drill-down
  const handleKPICardClick = useCallback((metricType: DrillDownMetricType) => {
    setDrillDownState({
      isOpen: true,
      metricType,
      userId: undefined,
      repName: undefined,
    });
  }, []);

  // Handle comparison matrix row click for drill-down
  const handleRepClick = useCallback((userId: string, repName: string) => {
    setDrillDownState({
      isOpen: true,
      metricType: 'all',
      userId,
      repName,
    });
  }, []);

  // Close drill-down modal
  const closeDrillDown = useCallback(() => {
    setDrillDownState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // Check if we have required data
  const hasOrg = Boolean(activeOrg?.id);

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-gradient-to-br dark:from-gray-950 dark:to-gray-900 text-gray-900 dark:text-gray-100">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Header with Period Selector */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            {/* Title Section */}
            <div className="flex items-center gap-4">
              {/* Glassmorphic icon */}
              <div className="w-14 h-14 rounded-2xl bg-gray-800 border border-gray-700/50 flex items-center justify-center">
                <Users className="w-7 h-7 text-blue-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl sm:text-3xl font-bold">
                    <span className="text-gray-900 dark:bg-gradient-to-r dark:from-white dark:via-gray-100 dark:to-white dark:bg-clip-text dark:text-transparent">
                      Team
                    </span>{' '}
                    <span className="bg-gradient-to-r from-blue-600 via-indigo-500 to-violet-500 bg-clip-text text-transparent">
                      Analytics
                    </span>
                  </h1>
                  <HelpPanel docSlug="customer-team-analytics" tooltip="Team Analytics help" />
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Track team performance and meeting metrics
                  </p>
                </div>
              </div>
            </div>

            {/* Period Selector */}
            <Tabs value={period.toString()} onValueChange={handlePeriodChange}>
              <TabsList className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/30 p-1 rounded-xl shadow-sm">
                {periodOptions.map((opt) => (
                  <TabsTrigger
                    key={opt.value}
                    value={opt.value.toString()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg data-[state=active]:bg-blue-50 dark:data-[state=active]:bg-blue-900/30 data-[state=active]:text-blue-700 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm transition-all"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    {opt.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </motion.div>

        {!hasOrg ? (
          // No organization selected state
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-gray-400" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              No Organization Selected
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-center max-w-md">
              Please select an organization from the sidebar to view team analytics.
            </p>
          </div>
        ) : (
          // Main content
          <div className="space-y-8">
            {/* KPI Cards Grid */}
            <section>
              <TeamKPIGrid
                period={period}
                onCardClick={handleKPICardClick}
              />
            </section>

            {/* Performance Trends & Team Comparison */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Trend Charts */}
              <section>
                <TeamTrendsChart period={period} />
              </section>

              {/* Team Comparison Matrix */}
              <section>
                <TeamComparisonMatrix
                  period={period}
                  onRepClick={handleRepClick}
                />
              </section>
            </div>
          </div>
        )}

        {/* Drill-Down Modal */}
        <MetricDrillDownModal
          isOpen={drillDownState.isOpen}
          onClose={closeDrillDown}
          metricType={drillDownState.metricType}
          period={period}
          userId={drillDownState.userId}
          metricTitle={metricTitles[drillDownState.metricType]}
          repName={drillDownState.repName}
        />
      </div>
    </div>
  );
}
