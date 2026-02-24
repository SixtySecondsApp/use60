import React, { useState, useMemo, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';
import { useUser } from '@/lib/hooks/useUser';
import { useTargets } from '@/lib/hooks/useTargets';
import { useActivityFilters } from '@/lib/hooks/useActivityFilters';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDashboardMetrics } from '@/lib/hooks/useDashboardMetrics';
import {
  PoundSterling,
  Phone,
  Users,
  FileText,
  ArrowUp,
  ArrowDown,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart2,
  LayoutDashboard,
  Activity as ActivityIcon,
  LineChart,
  Grid3X3,
  Sparkles,
  Bot,
} from 'lucide-react';
import ReactDOM from 'react-dom';
import { PendingJoinRequestBanner } from '@/components/PendingJoinRequestBanner';
import { useDateRangeFilter, DateRangeFilter } from '@/components/ui/DateRangeFilter';
import { HelpPanel } from '@/components/docs/HelpPanel';
import logger from '@/lib/utils/logger';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import { TeamKPIGrid } from '@/components/insights/TeamKPIGrid';
import { TeamComparisonMatrix } from '@/components/insights/TeamComparisonMatrix';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ActivationChecklist } from '@/components/dashboard/ActivationChecklist';
import { useOrgMoney } from '@/lib/hooks/useOrgMoney';

const LazyActivityLog = lazy(() => import('@/pages/ActivityLog'));
const LazyAgentDashboardTab = lazy(() => import('@/components/dashboard/AgentDashboardTab'));
const LazySalesFunnel = lazy(() => import('@/pages/SalesFunnel'));
const LazyHeatmap = lazy(() => import('@/pages/Heatmap'));
const LazyLeadAnalytics = lazy(() => import('@/components/leads/LeadAnalyticsCard').then(m => ({ default: m.LeadAnalyticsCard })));

interface MetricCardProps {
  title: string;
  value: number;
  target: number;
  trend: number | null;
  icon: React.ElementType;
  type?: string;
  metricKey?: string;
  dateRange: {
    start: Date;
    end: Date;
  };
  previousMonthTotal?: number;
  totalTrend?: number | null;
  isLoadingComparisons?: boolean;
  hasComparisons?: boolean;
  isInitialLoad?: boolean;
  onNavigateToActivity?: () => void;
}

interface TooltipProps {
  show: boolean;
  content: {
    title: string;
    message: string;
    positive: boolean;
  };
  position: {
    x: number;
    y: number;
  };
}

export interface Deal {
  id: string;
  date: string;
  client_name: string;
  amount: number;
  details: string;
}

// Tooltip component that uses Portal
const Tooltip = ({ show, content, position }: TooltipProps) => {
  if (!show) return null;
  
  return ReactDOM.createPortal(
    <div 
      style={{
        position: 'fixed',
        top: position.y - 10,
        left: position.x,
        transform: 'translate(-50%, -100%)',
        zIndex: 9999,
      }}
      className="bg-white/95 dark:bg-gray-900/95 text-[#1E293B] dark:text-white text-xs rounded-lg p-2.5 w-48 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] dark:shadow-xl border border-[#E2E8F0] dark:border-gray-700"
    >
      <div className="text-center font-medium mb-2">{content.title}</div>
      <div className="flex justify-center items-center gap-1">
        <span className={content.positive ? "text-emerald-400" : "text-red-400"}>
          {content.message}
        </span>
      </div>
      <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-white dark:bg-gray-900 border-r border-b border-[#E2E8F0] dark:border-gray-700"></div>
    </div>,
    document.body
  );
};

const MetricCard = React.memo(({ title, value, target, trend, icon: Icon, type, metricKey, dateRange, previousMonthTotal, totalTrend: totalTrendProp, isLoadingComparisons, hasComparisons, isInitialLoad = false, onNavigateToActivity }: MetricCardProps) => {
  const { setFilters } = useActivityFilters();
  const navigate = useNavigate();
  const { symbol } = useOrgMoney();
  const [showTrendTooltip, setShowTrendTooltip] = useState(false);
  const [showTotalTooltip, setShowTotalTooltip] = useState(false);
  const [trendPosition, setTrendPosition] = useState({ x: 0, y: 0 });
  const [totalPosition, setTotalPosition] = useState({ x: 0, y: 0 });
  const trendRef = useRef<HTMLDivElement>(null);
  const totalRef = useRef<HTMLDivElement>(null);

  const handleClick = () => {
    try {
      if (metricKey) {
        navigate(`/settings/goals?metric=${metricKey}`);
      } else if (type) {
        setFilters({ type, dateRange });
        if (onNavigateToActivity) {
          onNavigateToActivity();
        }
      }
    } catch (error) {
      logger.error('Navigation error:', error);
    }
  };

  const getIconColor = (title: string) => {
    switch (title) {
      case 'New Business':
        return 'emerald';
      case 'Outbound':
        return 'blue';
      case 'Meetings':
        return 'violet';
      case 'Proposals':
        return 'orange';
      default:
        return 'gray';
    }
  };

  // Use totalTrend from props (computed by useDashboardMetrics hook) for consistency
  const totalTrend = totalTrendProp === undefined ? 0 : totalTrendProp;

  // Helper function for arrow styling
  const getArrowClass = (trendValue: number | null) => {
    if (trendValue === null || trendValue === 0) return 'text-gray-500';
    return trendValue > 0 ? 'text-emerald-500' : 'text-red-500';
  };

  // Get background colors based on trend values
  const getTrendBg = (trendValue: number | null) => {
    if (trendValue === null || trendValue === 0) return 'bg-gray-500/10 border-gray-500/30';
    return trendValue > 0
      ? 'bg-emerald-500/10 border-emerald-500/30'
      : 'bg-red-500/10 border-red-500/30';
  };

  // Handle mouse enter for trend tooltip
  const handleTrendMouseEnter = () => {
    try {
      if (trendRef.current) {
        const rect = trendRef.current.getBoundingClientRect();
        setTrendPosition({ 
          x: rect.left + rect.width / 2, 
          y: rect.top 
        });
        setShowTrendTooltip(true);
      }
    } catch (error) {
      logger.error('Error showing trend tooltip:', error);
    }
  };

  // Handle mouse enter for total tooltip
  const handleTotalMouseEnter = () => {
    try {
      if (totalRef.current) {
        const rect = totalRef.current.getBoundingClientRect();
        setTotalPosition({ 
          x: rect.left + rect.width / 2, 
          y: rect.top 
        });
        setShowTotalTooltip(true);
      }
    } catch (error) {
      logger.error('Error showing total tooltip:', error);
    }
  };

  return (
    <div
      onClick={handleClick}
      className="relative overflow-visible rounded-3xl p-6 sm:p-7 border cursor-pointer shadow-sm dark:shadow-none bg-white dark:bg-transparent dark:bg-gradient-to-br dark:from-gray-900/80 dark:to-gray-900/40 dark:backdrop-blur-xl border-transparent dark:border-gray-800/50 flex flex-col"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${
            title === 'Outbound'
              ? 'bg-blue-500/5 border-blue-500/50'
              : `bg-${getIconColor(title)}-500/10 border border-${getIconColor(title)}-500/20`
          }`}>
            <Icon className={`w-5 h-5 ${
              title === 'Outbound'
                ? 'text-blue-400'
                : `text-${getIconColor(title)}-500`
            }`} />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-[#1E293B] dark:text-white">{title}</span>
            <span className="text-xs text-[#64748B] dark:text-gray-500">Current period</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Arrow for same time in previous month comparison */}
          <div 
            ref={trendRef}
            className={`p-2 rounded-lg ${isLoadingComparisons ? 'bg-gray-500/10 border-gray-500/30' : getTrendBg(trend)} backdrop-blur-sm relative transition-all duration-300 hover:scale-105 shadow-lg`}
            onMouseEnter={handleTrendMouseEnter}
            onMouseLeave={() => setShowTrendTooltip(false)}
          >
            <div className="flex items-center gap-1.5">
              {isLoadingComparisons ? (
                <>
                  <div className="w-4 h-4 animate-pulse bg-gray-400 rounded-full"></div>
                  <span className="text-xs font-semibold text-gray-400">--%</span>
                </>
              ) : !hasComparisons ? (
                <>
                  <div className="w-4 h-4 text-gray-400">-</div>
                  <span className="text-xs font-semibold text-gray-400">--%</span>
                </>
              ) : (
                <>
                  {trend === null ? (
                    <>
                      <Minus className="w-4 h-4 text-gray-500" />
                      <span className="text-xs font-semibold text-gray-500">New</span>
                    </>
                  ) : trend === 0 ? (
                    <>
                      <Minus className="w-4 h-4 text-gray-500" />
                      <span className="text-xs font-semibold text-gray-500">0%</span>
                    </>
                  ) : trend > 0 ? (
                    <>
                      <TrendingUp className={`w-4 h-4 ${getArrowClass(trend)}`} />
                      <span className={`text-xs font-semibold ${getArrowClass(trend)}`}>+{trend}%</span>
                    </>
                  ) : (
                    <>
                      <TrendingDown className={`w-4 h-4 ${getArrowClass(trend)}`} />
                      <span className={`text-xs font-semibold ${getArrowClass(trend)}`}>{trend}%</span>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Arrow for total previous month comparison */}
          <div 
            ref={totalRef}
            className={`p-2 rounded-lg ${isLoadingComparisons ? 'bg-gray-500/10 border-gray-500/30' : getTrendBg(totalTrend)} backdrop-blur-sm relative transition-all duration-300 hover:scale-105 shadow-lg`}
            onMouseEnter={handleTotalMouseEnter}
            onMouseLeave={() => setShowTotalTooltip(false)}
          >
            <div className="flex items-center gap-1.5">
              {isLoadingComparisons ? (
                <>
                  <div className="w-4 h-4 animate-pulse bg-gray-400 rounded-full"></div>
                  <span className="text-xs font-semibold text-gray-400">--%</span>
                </>
              ) : !hasComparisons ? (
                <>
                  <div className="w-4 h-4 text-gray-400">-</div>
                  <span className="text-xs font-semibold text-gray-400">--%</span>
                </>
              ) : (
                <>
                  {totalTrend === null ? (
                    <>
                      <Minus className="w-4 h-4 text-gray-500" />
                      <span className="text-xs font-semibold text-gray-500">New</span>
                    </>
                  ) : totalTrend === 0 ? (
                    <>
                      <Minus className="w-4 h-4 text-gray-500" />
                      <span className="text-xs font-semibold text-gray-500">0%</span>
                    </>
                  ) : totalTrend > 0 ? (
                    <>
                      <ArrowUp className={`w-4 h-4 ${getArrowClass(totalTrend)}`} />
                      <span className={`text-xs font-semibold ${getArrowClass(totalTrend)}`}>+{totalTrend}%</span>
                    </>
                  ) : (
                    <>
                      <ArrowDown className={`w-4 h-4 ${getArrowClass(totalTrend)}`} />
                      <span className={`text-xs font-semibold ${getArrowClass(totalTrend)}`}>{totalTrend}%</span>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Tooltips using Portal */}
          <Tooltip
            show={showTrendTooltip}
            position={trendPosition}
            content={{
              title: "Vs. same point last period",
              message: trend === null ? "No prior data to compare" : trend > 0 ? "Ahead of last period's pace" : trend < 0 ? "Behind last period's pace" : "Same as last period's pace",
              positive: trend !== null && trend > 0
            }}
          />

          <Tooltip
            show={showTotalTooltip}
            position={totalPosition}
            content={{
              title: "Vs. previous period's total",
              message: totalTrend === null ? "No prior data to compare" : totalTrend > 0 ? "Already ahead of last period" : totalTrend < 0 ? "Behind last period's total" : "Matching last period's total",
              positive: totalTrend !== null && totalTrend > 0
            }}
          />
        </div>
      </div>
      
      <div className="space-y-3 flex-1">
        {/* TODO: Currency symbol should come from organization settings */}
        <div className="flex items-baseline gap-2 flex-wrap">
          {isInitialLoad ? (
            <div className="flex items-baseline gap-2">
              <div className="w-24 h-9 bg-slate-200 dark:bg-gray-800/50 rounded animate-pulse" />
              <span className="text-xs sm:text-sm text-[#64748B] dark:text-gray-500 font-medium">
                / {title === 'New Business' ? `${symbol}${target.toLocaleString()}` : target}
              </span>
            </div>
          ) : (
            <>
              <span className="text-2xl sm:text-3xl font-bold text-[#1E293B] dark:text-white transition-none" suppressHydrationWarning>
                {title === 'New Business' ? `${symbol}${value.toLocaleString()}` : value}
              </span>
              <span className="text-xs sm:text-sm text-[#64748B] dark:text-gray-500 font-medium">
                / {title === 'New Business' ? `${symbol}${target.toLocaleString()}` : target}
              </span>
            </>
          )}
        </div>
        
        <div className="space-y-2 pt-1">
          <div className="h-2 sm:h-2.5 bg-slate-200 dark:bg-gray-900/80 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-none ${
                title === 'New Business'
                  ? 'bg-emerald-500/80'
                  : title === 'Outbound'
                  ? 'bg-blue-500/80'
                  : title === 'Meetings'
                  ? 'bg-violet-500/80'
                  : 'bg-orange-500/80'
              }`}
              style={{ width: `${target > 0 ? Math.min(100, (value / target) * 100) : 0}%` }}
            ></div>
          </div>
          <div className="text-xs text-[#64748B] dark:text-gray-400 flex justify-between items-center gap-2">
            <span>Progress</span>
            {target > 0
              ? <span className="font-medium">{Math.round((value / target) * 100)}%</span>
              : <span className="font-medium text-[#64748B]/60 dark:text-gray-500">Set goal →</span>
            }
          </div>
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison to prevent re-renders
  return (
    prevProps.title === nextProps.title &&
    prevProps.value === nextProps.value &&
    prevProps.target === nextProps.target &&
    prevProps.trend === nextProps.trend &&
    prevProps.previousMonthTotal === nextProps.previousMonthTotal &&
    prevProps.totalTrend === nextProps.totalTrend &&
    prevProps.isLoadingComparisons === nextProps.isLoadingComparisons &&
    prevProps.hasComparisons === nextProps.hasComparisons &&
    prevProps.isInitialLoad === nextProps.isInitialLoad &&
    prevProps.onNavigateToActivity === nextProps.onNavigateToActivity &&
    prevProps.dateRange?.start?.getTime() === nextProps.dateRange?.start?.getTime() &&
    prevProps.dateRange?.end?.getTime() === nextProps.dateRange?.end?.getTime()
  );
});

// Skeleton loader component for the dashboard
function DashboardSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 mt-12 lg:mt-0">
      {/* Header skeleton — matches "Welcome back, [name]" + subtitle + date picker row */}
      <div className="space-y-1 mb-6 sm:mb-8">
        <Skeleton className="h-9 w-56" />
        <div className="flex items-center justify-between mt-2">
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-9 w-44 rounded-xl" />
        </div>
      </div>

      {/* Tab bar skeleton — 5 tabs: Overview / Activity / Funnel / Heatmap / Lead Analytics */}
      <div className="mb-6 flex gap-1 bg-white dark:bg-gray-900/50 border border-transparent dark:border-gray-800/50 rounded-lg p-1 w-fit shadow-sm">
        {[96, 80, 72, 84, 112].map((w, i) => (
          <Skeleton key={i} className="h-8 rounded-md" style={{ width: w }} />
        ))}
      </div>

      {/* KPI metric cards grid — 2-col matching real grid-cols-1 sm:grid-cols-2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-8">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-3xl p-6 sm:p-7 border border-transparent dark:border-gray-800/50 bg-white dark:bg-gray-900/50 shadow-sm dark:shadow-none flex flex-col"
          >
            {/* Card header: icon + title/subtitle + two trend badges */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-xl" />
                <div>
                  <Skeleton className="h-4 w-24 mb-1" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-8 w-14 rounded-lg" />
                <Skeleton className="h-8 w-14 rounded-lg" />
              </div>
            </div>
            {/* Value + target */}
            <div className="flex items-baseline gap-2 mb-3">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
            {/* Progress bar + label row */}
            <Skeleton className="h-2.5 w-full rounded-full mb-2" />
            <div className="flex justify-between">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-8" />
            </div>
          </div>
        ))}
      </div>

      {/* Team Performance section placeholder */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Skeleton className="w-5 h-5 rounded" />
          <Skeleton className="h-6 w-44" />
        </div>
        {/* KPI grid row placeholder */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl p-4 bg-white dark:bg-gray-900/50 border border-transparent dark:border-gray-800/50 shadow-sm">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-7 w-16 mb-1" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
        {/* Comparison matrix placeholder */}
        <div className="rounded-3xl border border-transparent dark:border-gray-800/50 bg-white dark:bg-gray-900/50 shadow-sm p-6">
          <Skeleton className="h-5 w-40 mb-4" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

function TeamPerformanceSection({ dateRange, period }: { dateRange: { start: Date; end: Date }; period: number }) {

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-violet-500" />
            <h2 className="text-xl font-semibold text-[#1E293B] dark:text-white">Team Performance</h2>
          </div>
          <p className="text-sm text-[#64748B] dark:text-gray-400 mt-0.5">
            Meeting analytics and rep performance metrics
          </p>
        </div>
        {/* Date label removed - redundant with date picker */}
      </div>

      {/* KPI Grid */}
      <div className="mb-4">
        <TeamKPIGrid period={period} dateRange={dateRange} onCardClick={() => {}} />
      </div>

      {/* Trends Chart */}
      <div className="bg-white dark:bg-gray-900/50 backdrop-blur-xl rounded-3xl border border-transparent dark:border-gray-800/50 shadow-sm dark:shadow-none p-6">
        <TeamComparisonMatrix period={period} dateRange={dateRange} onRepClick={() => {}} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  // Move all hooks to the top
  const [showContent, setShowContent] = useState(false);
  const dateFilter = useDateRangeFilter();

  // Derive the active dateRange from the filter (always defined for presets)
  const activeDateRange = useMemo(() => {
    if (dateFilter.dateRange) {
      return dateFilter.dateRange;
    }
    // Fallback: last 30 days
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return { start, end };
  }, [dateFilter.dateRange]);

  const { userData, isLoading: isLoadingUser, session } = useUser();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setFilters } = useActivityFilters();

  // Tab state from URL
  const activeTab = searchParams.get('tab') || 'overview';
  const setTab = useCallback((tab: string) => {
    if (tab === 'overview') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab }, { replace: true });
    }
  }, [setSearchParams]);

  const navigateToActivityTab = useCallback(() => {
    setTab('activity');
  }, [setTab]);

  // Check for Fathom connection success notification
  useEffect(() => {
    const fathomStatus = searchParams.get('fathom');
    if (fathomStatus === 'connected') {
      toast.success('Fathom connected successfully!', {
        description: 'Your Fathom account has been connected. Starting initial sync...',
      });
      // Clean up the query parameter from the URL
      window.history.replaceState({}, '', '/dashboard');
    }
  }, [searchParams]);

  // Log current auth state for debugging
  useEffect(() => {
    logger.log('📊 Dashboard auth state:', {
      hasSession: !!session,
      hasUserData: !!userData,
      userId: userData?.id,
      isLoadingUser
    });
  }, [session, userData, isLoadingUser]);

  // Check if user just joined an existing organization and show success message
  useEffect(() => {
    const checkJoinedExistingOrg = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.user_metadata?.joined_existing_org) {
          toast.success('Organization found! You\'ve joined your team.', {
            description: 'Welcome to the team! You can now see all your organization\'s data.',
          });

          // Clear the flag so we don't show it again
          await supabase.auth.updateUser({
            data: { joined_existing_org: false }
          });
        }
      } catch (err) {
        logger.error('Error checking joined_existing_org flag:', err);
      }
    };

    checkJoinedExistingOrg();
  }, []);

  // Mark waitlist entry as converted after user completes onboarding
  useEffect(() => {
    const markWaitlistConverted = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        // Check if user has waitlist_entry_id in metadata
        const waitlistEntryId = session.user.user_metadata?.waitlist_entry_id;
        if (!waitlistEntryId) return;

        // Check if user has completed onboarding
        const { data: progress, error: progressError } = await supabase
          .from('user_onboarding_progress')
          .select('onboarding_completed_at, skipped_onboarding')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (progressError) {
          logger.warn('Error checking onboarding progress:', progressError);
          return;
        }

        const hasCompletedOnboarding = progress?.onboarding_completed_at || progress?.skipped_onboarding;

        if (hasCompletedOnboarding) {
          // Check current status of waitlist entry
          const { data: waitlistEntry, error: entryError } = await supabase
            .from('meetings_waitlist')
            .select('status, converted_at')
            .eq('id', waitlistEntryId)
            .maybeSingle();

          if (entryError) {
            logger.warn('Error checking waitlist entry:', entryError);
            return;
          }

          // Only update if not already converted
          if (waitlistEntry && waitlistEntry.status !== 'converted') {
            const { error: updateError } = await supabase
              .from('meetings_waitlist')
              .update({
                status: 'converted',
                converted_at: new Date().toISOString()
              })
              .eq('id', waitlistEntryId);

            if (updateError) {
              logger.error('Error marking waitlist as converted:', updateError);
            } else {
              logger.log('✅ Waitlist entry marked as converted:', waitlistEntryId);
              // Clear the flag from user metadata
              await supabase.auth.updateUser({
                data: { waitlist_entry_id: null }
              });
            }
          }
        }
      } catch (err) {
        logger.error('Error in markWaitlistConverted:', err);
      }
    };

    markWaitlistConverted();
  }, []);
  
  // Get targets first - use session.user.id if userData is not yet loaded
  const userId = userData?.id || session?.user?.id;
  const { data: targets, isLoading: isLoadingSales } = useTargets(userId);
  
  // Progressive dashboard metrics with caching - only enable when ready
  const {
    metrics,
    trends,
    totalTrends,
    previousMonthTotals,
    isInitialLoad,
    isLoadingComparisons,
    hasComparisons,
    currentMonthActivities,
    refreshDashboard
  } = useDashboardMetrics(activeDateRange, showContent && !!userId && !isLoadingSales);
  
  const selectedMonthRange = activeDateRange;

  // Check if any data is loading - include metrics check
  // Note: targets can be null (user has no targets set) — that's not a loading state
  const isAnyLoading = isInitialLoad || isLoadingSales || isLoadingUser || (!userData && !session);

  // Remove logging to prevent re-renders

  // Use effect to handle initial loading state only
  useEffect(() => {
    // Immediately show content if data is ready
    if (!isAnyLoading && !showContent) {
      setShowContent(true);
    }
  }, [isAnyLoading, showContent]); // Added showContent to deps to prevent re-running

  // Single loading check to prevent flicker
  if (!showContent || isAnyLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
      {/* Header with Month Selection */}
      <div className="space-y-1 mt-12 lg:mt-0 mb-6 sm:mb-8">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold text-[#1E293B] dark:text-white">Welcome back{userData?.first_name ? `, ${userData.first_name}` : ''}</h1>
          <HelpPanel docSlug="customer-dashboard" tooltip="Dashboard help" />
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-[#64748B] dark:text-gray-400">Here's how your sales performance is tracking</p>
          <div className={activeTab !== 'overview' ? 'invisible' : ''}>
            <DateRangeFilter {...dateFilter} />
          </div>
        </div>
      </div>

      {/* Dashboard Tabs */}
      <Tabs value={activeTab} onValueChange={setTab} className="mb-6">
        <TabsList className="bg-white border border-transparent shadow-sm dark:bg-gray-900/50 dark:backdrop-blur-xl dark:border-gray-800/50">
          <TabsTrigger
            value="overview"
            className="flex items-center gap-2 data-[state=active]:bg-emerald-600/10 dark:data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400"
          >
            <LayoutDashboard className="w-4 h-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="agent"
            className="flex items-center gap-2 data-[state=active]:bg-emerald-600/10 dark:data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400"
          >
            <Bot className="w-4 h-4" />
            AI Agent
          </TabsTrigger>
          <TabsTrigger
            value="activity"
            className="flex items-center gap-2 data-[state=active]:bg-emerald-600/10 dark:data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400"
          >
            <ActivityIcon className="w-4 h-4" />
            Activity
          </TabsTrigger>
          <TabsTrigger
            value="funnel"
            className="flex items-center gap-2 data-[state=active]:bg-emerald-600/10 dark:data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400"
          >
            <LineChart className="w-4 h-4" />
            Funnel
          </TabsTrigger>
          <TabsTrigger
            value="heatmap"
            className="flex items-center gap-2 data-[state=active]:bg-emerald-600/10 dark:data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400"
          >
            <Grid3X3 className="w-4 h-4" />
            Heatmap
          </TabsTrigger>
          <TabsTrigger
            value="leads"
            className="flex items-center gap-2 data-[state=active]:bg-emerald-600/10 dark:data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400"
          >
            <Sparkles className="w-4 h-4" />
            Lead Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">

      {/* Activation Checklist for new users */}
      <ActivationChecklist />

      {/* Pending Join Request Banner */}
      <div className="mb-6">
        <PendingJoinRequestBanner />
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-8">
        <MetricCard
          key="revenue-metric"
          title="New Business"
          value={metrics.revenue}
          target={targets?.revenue_target ?? 0}
          trend={trends.revenue}
          totalTrend={totalTrends.revenue}
          icon={PoundSterling}
          type="sale"
          metricKey="new-business"
          dateRange={selectedMonthRange}
          previousMonthTotal={previousMonthTotals.revenue}
          isLoadingComparisons={isLoadingComparisons}
          hasComparisons={hasComparisons}
          isInitialLoad={false}
          onNavigateToActivity={navigateToActivityTab}
        />
        <MetricCard
          key="outbound-metric"
          title="Outbound"
          value={metrics.outbound}
          target={targets?.outbound_target ?? 0}
          trend={trends.outbound}
          totalTrend={totalTrends.outbound}
          icon={Phone}
          type="outbound"
          metricKey="outbound"
          dateRange={selectedMonthRange}
          previousMonthTotal={previousMonthTotals.outbound}
          isLoadingComparisons={isLoadingComparisons}
          hasComparisons={hasComparisons}
          isInitialLoad={false}
          onNavigateToActivity={navigateToActivityTab}
        />
        <MetricCard
          key="meetings-metric"
          title="Meetings"
          value={metrics.meetings}
          target={targets?.meetings_target ?? 0}
          trend={trends.meetings}
          totalTrend={totalTrends.meetings}
          icon={Users}
          type="meeting"
          metricKey="meetings"
          dateRange={selectedMonthRange}
          previousMonthTotal={previousMonthTotals.meetings}
          isLoadingComparisons={isLoadingComparisons}
          hasComparisons={hasComparisons}
          isInitialLoad={false}
          onNavigateToActivity={navigateToActivityTab}
        />
        <MetricCard
          key="proposals-metric"
          title="Proposals"
          value={metrics.proposals}
          target={targets?.proposal_target ?? 0}
          trend={trends.proposals}
          totalTrend={totalTrends.proposals}
          icon={FileText}
          type="proposal"
          metricKey="proposals"
          dateRange={selectedMonthRange}
          previousMonthTotal={previousMonthTotals.proposals}
          isLoadingComparisons={isLoadingComparisons}
          hasComparisons={hasComparisons}
          isInitialLoad={false}
          onNavigateToActivity={navigateToActivityTab}
        />
      </div>

      {/* Team Performance Section */}
      <TeamPerformanceSection dateRange={selectedMonthRange} period={dateFilter.period} />
        </TabsContent>

        <TabsContent value="agent">
          <Suspense fallback={
            <div className="space-y-4 pt-4">
              <Skeleton className="h-20 w-full rounded-xl" />
              <div className="flex flex-col lg:flex-row gap-6">
                <div className="lg:w-3/5 space-y-3">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3 rounded-xl p-4 bg-white dark:bg-gray-900/50 border border-transparent dark:border-gray-800/50">
                      <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
                      <div className="flex-1">
                        <Skeleton className="h-4 w-40 mb-1.5" />
                        <Skeleton className="h-3 w-56" />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="lg:w-2/5 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {[0, 1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-20 rounded-xl" />
                    ))}
                  </div>
                  <Skeleton className="h-40 rounded-xl" />
                </div>
              </div>
            </div>
          }>
            <LazyAgentDashboardTab />
          </Suspense>
        </TabsContent>

        <TabsContent value="activity">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Suspense fallback={
              <div className="space-y-3 pt-4">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-4 rounded-xl p-4 bg-white dark:bg-gray-900/50 border border-transparent dark:border-gray-800/50">
                    <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-40 mb-1.5" />
                      <Skeleton className="h-3 w-56" />
                    </div>
                    <Skeleton className="h-6 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            }>
              <LazyActivityLog />
            </Suspense>
          </motion.div>
        </TabsContent>

        <TabsContent value="funnel">
          <Suspense fallback={
            <div className="pt-4 space-y-4 max-w-2xl mx-auto">
              {[100, 78, 56, 36].map((w, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" style={{ width: `${w}%` }} />
              ))}
            </div>
          }>
            <LazySalesFunnel />
          </Suspense>
        </TabsContent>

        <TabsContent value="heatmap">
          <Suspense fallback={
            <div className="pt-4 rounded-xl bg-white dark:bg-gray-900/50 border border-transparent dark:border-gray-800/50 p-4">
              <div className="grid grid-cols-[30px_repeat(7,1fr)] gap-1">
                {/* day labels */}
                <div />
                {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d) => (
                  <Skeleton key={d} className="h-5 w-full rounded" />
                ))}
                {/* 5 weeks of cells */}
                {Array.from({ length: 5 }).map((_, w) => (
                  <React.Fragment key={w}>
                    <Skeleton className="h-8 w-full rounded" />
                    {Array.from({ length: 7 }).map((_, d) => (
                      <Skeleton key={d} className="aspect-square w-full rounded" />
                    ))}
                  </React.Fragment>
                ))}
              </div>
            </div>
          }>
            <LazyHeatmap />
          </Suspense>
        </TabsContent>

        <TabsContent value="leads">
          <Suspense fallback={
            <div className="pt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="rounded-xl p-5 bg-white dark:bg-gray-900/50 border border-transparent dark:border-gray-800/50">
                    <Skeleton className="h-4 w-24 mb-2" />
                    <Skeleton className="h-8 w-16 mb-1" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                ))}
              </div>
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          }>
            <LazyLeadAnalytics />
          </Suspense>
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}