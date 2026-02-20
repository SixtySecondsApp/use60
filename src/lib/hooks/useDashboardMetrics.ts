// Cached dashboard metrics with progressive loading and comparison calculations
// Avoids recomputation until user activities change

import { useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDate, endOfMonth } from 'date-fns';
import { useProgressiveDashboardData } from './useLazyActivities';
import logger from '@/lib/utils/logger';
import { useViewMode } from '@/contexts/ViewModeContext';
import { useAuthUser } from './useAuthUser';
import { useTableSubscription } from './useRealtimeHub';

interface DashboardMetrics {
  revenue: number;
  outbound: number;
  meetings: number;
  proposals: number;
}

interface DashboardComparisons {
  current: DashboardMetrics;
  previousToDate: DashboardMetrics;
  previousTotal: DashboardMetrics;
  trends: {
    revenue: number;
    outbound: number;
    meetings: number;
    proposals: number;
  };
  totalTrends: {
    revenue: number;
    outbound: number;
    meetings: number;
    proposals: number;
  };
}

// Calculate metrics from activities array
function calculateMetrics(activities: any[]): DashboardMetrics {
  if (!Array.isArray(activities)) {
    logger.warn('calculateMetrics: activities is not an array', activities);
    return { revenue: 0, outbound: 0, meetings: 0, proposals: 0 };
  }
  
  try {
    // Remove logging to prevent re-renders
    
    const salesActivities = activities.filter(a => a.type === 'sale');
    const outboundActivities = activities.filter(a => a.type === 'outbound');
    
    const metrics = {
      revenue: salesActivities.reduce((sum, a) => sum + (a.amount || 0), 0),
      outbound: outboundActivities.reduce((sum, a) => sum + (a.quantity || 1), 0),
      meetings: activities
        .filter(a => a.type === 'meeting')
        .reduce((sum, a) => sum + (a.quantity || 1), 0),
      proposals: activities
        .filter(a => a.type === 'proposal')
        .reduce((sum, a) => sum + (a.quantity || 1), 0),
    };
    
    // Remove logging to prevent re-renders
    
    return metrics;
  } catch (error) {
    logger.error('Error calculating metrics:', error);
    return { revenue: 0, outbound: 0, meetings: 0, proposals: 0 };
  }
}

// Calculate trend percentage
function calculateTrend(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export function useDashboardMetrics(selectedMonth: Date, enabled: boolean = true) {
  const queryClient = useQueryClient();
  const { isViewMode, viewedUser } = useViewMode();
  const { data: authUser } = useAuthUser(); // Get cached auth user from React Query
  const authUserId = authUser?.id;
  
  // Progressive data loading
  const { 
    currentMonth, 
    previousMonth, 
    isInitialLoad, 
    isLoadingComparisons,
    hasComparisons 
  } = useProgressiveDashboardData(selectedMonth, enabled);

  // Current day of month for same-day comparisons
  const currentDayOfMonth = useMemo(() => {
    try {
      const now = new Date();
      const isCurrentMonth = selectedMonth.getFullYear() === now.getFullYear() && selectedMonth.getMonth() === now.getMonth();
      if (isCurrentMonth) {
        return getDate(now); // Today's day for current month
      }
      // For past months, use the last day (include all days for full month comparison)
      return getDate(endOfMonth(selectedMonth));
    } catch (error) {
      logger.error('Error getting current day of month:', error);
      return 1;
    }
  }, [selectedMonth]);

  // Cache key for metrics - includes timestamp to ensure invalidation works
  const cacheKey = [
    'dashboard-metrics', 
    selectedMonth.getFullYear(), 
    selectedMonth.getMonth(),
    currentMonth.activities?.length ?? 'loading',
    previousMonth.activities?.length ?? 'loading',
    currentDayOfMonth,
    // Add ViewMode user to cache key
    isViewMode && viewedUser ? `view-${viewedUser.id}` : 'own',
    // Add a timestamp component that changes when activities change
    currentMonth.activities ? `${currentMonth.activities.length}-${currentMonth.activities[0]?.id || 'empty'}` : 'no-data'
  ];

  // Cached calculations - only recomputes when activities change
  const metricsQuery = useQuery({
    queryKey: cacheKey,
    queryFn: (): DashboardComparisons => {
      // Remove logging to prevent re-renders
      
      // Current month metrics
      const current = calculateMetrics(currentMonth.activities || []);
      
      // Previous month activities (full month)
      const previousTotal = calculateMetrics(previousMonth.activities || []);
      
      // Previous month up to same date (for fair comparison)
      const previousToDate = calculateMetrics(
        (previousMonth.activities || []).filter(activity => {
          try {
            if (!activity?.date) return false;
            const activityDate = new Date(activity.date);
            const dayOfActivity = getDate(activityDate);
            return dayOfActivity <= currentDayOfMonth;
          } catch {
            return false;
          }
        })
      );

      // Calculate trends
      const trends = {
        revenue: calculateTrend(current.revenue, previousToDate.revenue),
        outbound: calculateTrend(current.outbound, previousToDate.outbound),
        meetings: calculateTrend(current.meetings, previousToDate.meetings),
        proposals: calculateTrend(current.proposals, previousToDate.proposals),
      };

      const totalTrends = {
        revenue: calculateTrend(current.revenue, previousTotal.revenue),
        outbound: calculateTrend(current.outbound, previousTotal.outbound),
        meetings: calculateTrend(current.meetings, previousTotal.meetings),
        proposals: calculateTrend(current.proposals, previousTotal.proposals),
      };

      return {
        current,
        previousToDate,
        previousTotal,
        trends,
        totalTrends,
      };
    },
    enabled: Boolean(enabled && currentMonth.activities !== undefined),
    staleTime: 5 * 60 * 1000, // 5 minutes - prevent excessive recalculation
    gcTime: 10 * 60 * 1000, // 10 minutes - keep cache longer
    refetchOnWindowFocus: false, // Don't refetch on window focus to prevent flicker
    refetchOnMount: false, // Don't refetch on mount if we have cached data
    placeholderData: previousData => previousData, // Use previous data as placeholder
  });

  // Invalidate cache when activities change
  const invalidateMetrics = useCallback(() => {
    logger.log('🔄 Invalidating dashboard metrics and activities cache');
    queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
    queryClient.invalidateQueries({ queryKey: ['activities-lazy'] });
  }, [queryClient]);

  // Use centralized realtime hub instead of creating separate channel
  // This reduces WebSocket connections by sharing with other subscriptions
  const targetUserId = isViewMode && viewedUser ? viewedUser.id : authUserId;
  
  useTableSubscription(
    'activities',
    useCallback((payload: any) => {
      // Filter by user_id in callback since hub doesn't support complex filters
      const payloadUserId = payload.new?.user_id || payload.old?.user_id;
      if (payloadUserId !== targetUserId) {
        return;
      }

      logger.log('🔄 Real-time activity update received:', payload);

      // Log the type of change for debugging
      if (payload.eventType === 'INSERT') {
        logger.log('✅ New activity added:', {
          type: payload.new?.type,
          date: payload.new?.date,
          amount: payload.new?.amount,
          client: payload.new?.client_name
        });
      } else if (payload.eventType === 'UPDATE') {
        logger.log('📝 Activity updated:', payload.new);
      } else if (payload.eventType === 'DELETE') {
        logger.log('🗑️ Activity deleted:', payload.old);
      }

      // Invalidate queries to trigger refetch
      // Use setTimeout to ensure the database has processed the change
      setTimeout(() => {
        invalidateMetrics();
        logger.log('🔄 Invalidated metrics cache after real-time update');
      }, 100);
    }, [targetUserId, invalidateMetrics]),
    { enabled: enabled && !!authUserId }
  );

  // Force refresh function for manual data reload
  const refreshDashboard = useCallback(() => {
    logger.log('🔄 Dashboard refresh triggered');
    
    // Just invalidate queries to trigger refetch - don't remove them
    queryClient.invalidateQueries({ queryKey: ['activities-lazy'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
    
    logger.log('✅ Queries invalidated, refetching data');
  }, [queryClient]);

  return {
    // Metrics data
    metrics: metricsQuery.data?.current || { revenue: 0, outbound: 0, meetings: 0, proposals: 0 },
    trends: metricsQuery.data?.trends || { revenue: 0, outbound: 0, meetings: 0, proposals: 0 },
    totalTrends: metricsQuery.data?.totalTrends || { revenue: 0, outbound: 0, meetings: 0, proposals: 0 },
    previousMonthTotals: metricsQuery.data?.previousTotal || { revenue: 0, outbound: 0, meetings: 0, proposals: 0 },
    
    // Loading states
    isInitialLoad, // Loading current month data
    isLoadingComparisons, // Loading previous month for comparisons
    isCalculating: metricsQuery.isLoading,
    
    // Status flags
    hasComparisons, // Whether we have previous month data
    hasMetrics: !!metricsQuery.data,
    
    // Utilities
    invalidateMetrics,
    refreshDashboard,
    
    // Raw data access (for other components)
    currentMonthActivities: currentMonth.activities || [],
  };
}