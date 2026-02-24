import React, { useState, useMemo, useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';
import { useUser } from '@/lib/hooks/useUser';
import { useSalesData } from '@/lib/hooks/useSalesData';
import { useTargets } from '@/lib/hooks/useTargets';
import { Users, Phone, FileText, PoundSterling, TrendingUp } from 'lucide-react';
import { useActivityFilters } from '@/lib/hooks/useActivityFilters';
import { useNavigate } from 'react-router-dom';
import { useActivities } from '@/lib/hooks/useActivities';
import { startOfMonth, endOfMonth } from 'date-fns';
import { useDateRangeFilter, DateRangeFilter } from '@/components/ui/DateRangeFilter';
import { useOrgMoney } from '@/lib/hooks/useOrgMoney';
import { cn } from '@/lib/utils';

// Separate loading skeleton component for better code splitting
function FunnelSkeleton() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 mt-12 lg:mt-0">
      <div className="max-w-7xl mx-auto">
        {/* Header — matches icon + title/subtitle row + date filter pill */}
        <div className="mb-6 sm:mb-8 lg:mb-12">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <Skeleton className="w-12 h-12 rounded-2xl" />
              <div>
                <Skeleton className="h-7 w-36 mb-1.5" />
                <Skeleton className="h-4 w-64" />
              </div>
            </div>
            <Skeleton className="h-10 w-44 rounded-xl" />
          </div>
        </div>

        {/* 4 metric cards — matches grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8 lg:mb-12">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-900/80 backdrop-blur-sm rounded-xl p-4 sm:p-6 border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none">
              <Skeleton className="h-4 w-28 mb-2" />
              <Skeleton className="h-9 w-20 mb-1" />
              <Skeleton className="h-3 w-36" />
            </div>
          ))}
        </div>

        {/* Funnel bars — 4 stages tapering from 100% to ~36% */}
        <div className="flex flex-col items-center max-w-2xl mx-auto w-full gap-1">
          {[100, 78, 56, 36].map((width, i) => (
            <React.Fragment key={i}>
              {i > 0 && <Skeleton className="h-4 w-32 rounded-full my-0.5" />}
              <Skeleton
                className="h-16 rounded-xl"
                style={{ width: `${width}%` }}
              />
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

// Separate metrics calculation for better memoization
function useFunnelMetrics(activities: any[] | undefined, selectedMonth: Date) {
  return useMemo(() => {
    if (!activities) return {
      outbound: 0,
      meetings: 0,
      meetingsBooked: 0,
      proposals: 0,
      closed: 0,
      meetingToProposalRate: 0,
      proposalWinRate: 0,
      avgDealSize: 0,
      avgSalesVelocity: 0
    };

    const monthStart = startOfMonth(selectedMonth);
    const monthEnd = endOfMonth(selectedMonth);
    const now = new Date();
    // If selected month is current month, cap at today; otherwise use end of month
    const effectiveEnd = monthEnd > now ? now : monthEnd;

    const monthActivities = activities.filter(activity => {
      const activityDate = new Date(activity.date);
      return activityDate >= monthStart && activityDate <= effectiveEnd;
    });

    const outboundCount = monthActivities
      .filter(a => a.type === 'outbound')
      .reduce((sum, a) => sum + (Number(a.quantity) || 1), 0);

    // Meetings held (completed status only)
    const meetingsHeld = monthActivities
      .filter(a => a.type === 'meeting' && a.status === 'completed')
      .reduce((sum, a) => sum + (Number(a.quantity) || 1), 0);

    // Total meetings booked (including no-shows and cancellations)
    const meetingsBooked = monthActivities
      .filter(a => a.type === 'meeting')
      .reduce((sum, a) => sum + (Number(a.quantity) || 1), 0);

    const proposalsCount = monthActivities
      .filter(a => a.type === 'proposal')
      .reduce((sum, a) => sum + (Number(a.quantity) || 1), 0);
    const closedCount = monthActivities
      .filter(a => a.type === 'sale')
      .reduce((sum, a) => sum + (Number(a.quantity) || 1), 0);

    const meetingToProposalRate = meetingsHeld > 0
        ? Math.round((proposalsCount / meetingsHeld) * 100)
        : 0;

    const proposalWinRate = proposalsCount > 0
        ? Math.round((closedCount / proposalsCount) * 100)
        : 0;

    const totalRevenue = monthActivities
      .filter(a => a.type === 'sale')
      .reduce((sum, a) => sum + (a.amount || 0), 0);
    const avgDealSize = closedCount > 0 ? Math.round(totalRevenue / closedCount) : 0;

    // Calculate actual sales velocity: average days from first activity to deal close
    const calculateSalesVelocity = () => {
      const closedSales = monthActivities.filter(a => a.type === 'sale' && a.deal_id);
      if (closedSales.length === 0) return 0;

      const velocities = [];

      for (const sale of closedSales) {
        // Find the first activity for this deal (using deal_id for accurate linking)
        const firstActivity = activities
          .filter(a =>
            a.deal_id === sale.deal_id &&
            (a.type === 'meeting' || a.type === 'outbound' || a.type === 'proposal')
          )
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];

        if (firstActivity) {
          const firstActivityDate = new Date(firstActivity.date);
          const closeDate = new Date(sale.date);
          const daysDiff = Math.ceil((closeDate.getTime() - firstActivityDate.getTime()) / (1000 * 60 * 60 * 24));

          if (daysDiff >= 0) {
            velocities.push(daysDiff);
          }
        }
      }

      // Fallback to client name matching for deals without proper linking
      if (velocities.length === 0) {
        const unlinkedSales = monthActivities.filter(a => a.type === 'sale' && !a.deal_id);

        for (const sale of unlinkedSales) {
          const firstMeeting = activities
            .filter(a =>
              a.type === 'meeting' &&
              a.client_name === sale.client_name
            )
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];

          if (firstMeeting) {
            const meetingDate = new Date(firstMeeting.date);
            const closeDate = new Date(sale.date);
            const daysDiff = Math.ceil((closeDate.getTime() - meetingDate.getTime()) / (1000 * 60 * 60 * 24));

            if (daysDiff >= 0) {
              velocities.push(daysDiff);
            }
          }
        }
      }

      return velocities.length > 0
        ? Math.round(velocities.reduce((sum, v) => sum + v, 0) / velocities.length)
        : 0;
    };

    const avgSalesVelocity = calculateSalesVelocity();

    return {
      outbound: outboundCount,
      meetings: meetingsHeld,
      meetingsBooked: meetingsBooked,
      proposals: proposalsCount,
      closed: closedCount,
      meetingToProposalRate,
      proposalWinRate,
      avgDealSize,
      avgSalesVelocity
    };
  }, [activities, selectedMonth]);
}

const FUNNEL_COLORS = {
  blue:    { bar: 'bg-blue-500/10 border-blue-500/25 hover:bg-blue-500/20 hover:border-blue-500/40',   icon: 'bg-blue-500/10 border-blue-500/20',   text: 'text-blue-500 dark:text-blue-400' },
  violet:  { bar: 'bg-violet-500/10 border-violet-500/25 hover:bg-violet-500/20 hover:border-violet-500/40', icon: 'bg-violet-500/10 border-violet-500/20', text: 'text-violet-500 dark:text-violet-400' },
  orange:  { bar: 'bg-orange-500/10 border-orange-500/25 hover:bg-orange-500/20 hover:border-orange-500/40', icon: 'bg-orange-500/10 border-orange-500/20', text: 'text-orange-500 dark:text-orange-400' },
  emerald: { bar: 'bg-emerald-500/10 border-emerald-500/25 hover:bg-emerald-500/20 hover:border-emerald-500/40', icon: 'bg-emerald-500/10 border-emerald-500/20', text: 'text-emerald-500 dark:text-emerald-400' },
} as const;

export default function SalesFunnel() {
  const { userData } = useUser();
  const navigate = useNavigate();
  const { symbol } = useOrgMoney();
  const dateFilter = useDateRangeFilter();

  const { setFilters } = useActivityFilters();
  const { activities, isLoading: isLoadingActivities } = useActivities();
  const { data: salesData, isLoading: isLoadingSales } = useSalesData(
    dateFilter.dateRange?.start ?? startOfMonth(new Date()),
    dateFilter.dateRange?.end ?? new Date(),
  );
  const { data: targets, isLoading: isLoadingTargets } = useTargets(userData?.id);
  const [showContent, setShowContent] = useState(false);

  // Check if any data is loading
  const isAnyLoading = isLoadingActivities || isLoadingSales || isLoadingTargets || !userData;

  // Use effect to handle stable loading state
  useEffect(() => {
    let timeout: number;
    if (!isAnyLoading && !showContent) {
      // Add a longer delay before showing content
      timeout = window.setTimeout(() => {
        setShowContent(true);
      }, 500);
    }
    return () => {
      if (timeout) {
        window.clearTimeout(timeout);
      }
    };
  }, [isAnyLoading]);

  // Use the separated metrics hook
  const funnelMetrics = useFunnelMetrics(activities, dateFilter.currentMonth);

  // Define funnel stages with memoization
  const funnelStages = useMemo(() => [
    {
      id: 'outbound',
      label: 'Outbound',
      value: funnelMetrics.outbound,
      icon: Phone,
      color: 'blue',
      description: 'Initial outreach attempts'
    },
    {
      id: 'meetings',
      label: 'Meetings',
      value: funnelMetrics.meetings,
      totalBooked: funnelMetrics.meetingsBooked,
      icon: Users,
      color: 'violet',
      description: 'Meetings held vs booked'
    },
    {
      id: 'proposals',
      label: 'Proposals',
      value: funnelMetrics.proposals,
      icon: FileText,
      color: 'orange',
      description: 'Proposals sent'
    },
    {
      id: 'closed',
      label: 'Signed',
      value: funnelMetrics.closed,
      icon: PoundSterling,
      color: 'emerald',
      description: 'Deals signed'
    },
  ], [funnelMetrics]);

  // Show loading skeleton until content is ready
  if (!showContent) {
    return <FunnelSkeleton />;
  }

  // Show error state if any required data is missing
  if (!targets) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] gap-4">
        <p className="text-lg text-gray-600 dark:text-gray-400">Unable to load sales funnel data</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 text-sm font-medium text-white bg-[#37bd7e] rounded-lg hover:bg-[#2da76c] transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="p-4 sm:p-6 lg:p-8 mt-12 lg:mt-0"
    >
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8 lg:mb-12">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-600/10 dark:bg-emerald-500/20 border border-emerald-600/20 dark:border-emerald-500/30 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Sales Funnel</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">Visualise your sales pipeline conversion rates</p>
                </div>
              </div>
            </div>

            {/* Date Range Filter — month navigator + calendar popover */}
            <div className="bg-white/60 dark:bg-gray-900/40 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/30 rounded-xl px-4 py-2.5 shadow-sm">
              <DateRangeFilter {...dateFilter} />
            </div>
          </div>
        </div>

        {/* Key Metrics Display — above the funnel */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8 lg:mb-12">
          {/* Meeting Conversion Rate Card */}
          <div className="bg-white dark:bg-gray-900/80 backdrop-blur-sm rounded-xl p-4 sm:p-6 border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Meeting Conversion</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{funnelMetrics.meetingToProposalRate}%</p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">Meetings to Proposals</p>
          </div>
          {/* Proposal Win Rate Card */}
          <div className="bg-white dark:bg-gray-900/80 backdrop-blur-sm rounded-xl p-4 sm:p-6 border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Proposal Win Rate</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{funnelMetrics.proposalWinRate}%</p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">Proposals to Signed</p>
          </div>
          {/* Average Deal Size Card */}
          <div className="bg-white dark:bg-gray-900/80 backdrop-blur-sm rounded-xl p-4 sm:p-6 border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Avg. Deal Size</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{symbol}{funnelMetrics.avgDealSize?.toLocaleString() || 0}</p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">Average value of signed deals</p>
          </div>
          {/* Sales Velocity Card */}
          <div className="bg-white dark:bg-gray-900/80 backdrop-blur-sm rounded-xl p-4 sm:p-6 border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Sales Velocity</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{funnelMetrics.avgSalesVelocity || '-'} Days</p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">Average time to close deal</p>
          </div>
        </div>

        {/* Funnel Visualization */}
        <div className="flex flex-col items-center max-w-2xl mx-auto w-full">
          {funnelStages.map((stage, index) => {
            const topValue = funnelStages[0].value;
            // Minimum visual widths ensure a tapered funnel shape even with zero data
            const minWidths = [100, 78, 56, 36];
            const dataWidth = topValue > 0 ? (stage.value / topValue) * 100 : 0;
            const widthPct = Math.max(dataWidth, minWidths[index]);

            const prevStage = index > 0 ? funnelStages[index - 1] : null;
            const conversionRate = prevStage && prevStage.value > 0
              ? Math.round((stage.value / prevStage.value) * 100)
              : null;

            const colors = FUNNEL_COLORS[stage.color as keyof typeof FUNNEL_COLORS];

            return (
              <React.Fragment key={stage.id}>
                {/* Conversion rate connector between stages */}
                {index > 0 && (
                  <div className="flex items-center gap-3 py-1.5">
                    <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
                    <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                      {conversionRate !== null ? `${conversionRate}% converted` : '—'}
                    </span>
                    <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
                  </div>
                )}

                {/* Stage bar — centered and tapering */}
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: 'easeOut', delay: index * 0.07 }}
                  style={{ width: `${widthPct}%` }}
                  onClick={() => {
                    setFilters({
                      type: stage.id === 'closed' ? 'sale' : stage.id,
                      dateRange: dateFilter.dateRange,
                    });
                    navigate('/dashboard?tab=activity');
                  }}
                  className={cn(
                    'relative rounded-xl border px-5 py-4 cursor-pointer transition-all duration-200 hover:shadow-md backdrop-blur-sm',
                    colors.bar
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn('p-2 rounded-lg border shrink-0', colors.icon)}>
                        <stage.icon className={cn('w-4 h-4', colors.text)} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight">{stage.label}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{stage.description}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-2xl font-bold text-gray-900 dark:text-white leading-none">{stage.value}</p>
                      {stage.id === 'meetings' && (stage.totalBooked ?? 0) > 0 && stage.totalBooked !== stage.value && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">/ {stage.totalBooked} booked</p>
                      )}
                    </div>
                  </div>
                </motion.div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
