import React, { useEffect, useMemo, useCallback } from 'react';
import { Building2, Users, TrendingUp, DollarSign } from 'lucide-react';
import { EnhancedStatCard } from '@/components/ui/enhanced-stat-card';
import { useMRR, MRRSummary, MRRTrends } from '@/lib/hooks/useClients';
import { useUser } from '@/lib/hooks/useUser';
import { safeParseFinancial } from '@/lib/utils/financialValidation';

interface SubscriptionStatsProps {
  className?: string;
  onClick?: (cardTitle: string) => void;
}

const SubscriptionStatsComponent = ({ className, onClick }: SubscriptionStatsProps) => {
  const { userData } = useUser();
  const { mrrSummary, mrrTrends, isLoading, error, fetchMRRSummary, fetchMRRTrends } = useMRR(userData?.id);

  // Memoize fetch function to prevent unnecessary re-renders
  const fetchData = useCallback(() => {
    if (userData?.id) {
      fetchMRRSummary();
      fetchMRRTrends(); // Fetch personal user trends
    }
  }, [userData?.id, fetchMRRSummary, fetchMRRTrends]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Memoize default values
  const defaultMRR = useMemo((): MRRSummary => ({
    total_clients: 0,
    active_clients: 0,
    churned_clients: 0,
    paused_clients: 0,
    total_mrr: 0,
    avg_mrr: 0,
    min_mrr: 0,
    max_mrr: 0,
    churn_rate: 0,
    active_rate: 100
  }), []);

  // SECURITY: Validate all financial data before display - memoized for performance
  const stats = useMemo(() => {
    const rawStats = mrrSummary || defaultMRR;
    return {
      total_clients: Math.max(0, Math.floor(rawStats.total_clients || 0)),
      active_clients: Math.max(0, Math.floor(rawStats.active_clients || 0)),
      churned_clients: Math.max(0, Math.floor(rawStats.churned_clients || 0)),
      paused_clients: Math.max(0, Math.floor(rawStats.paused_clients || 0)),
      total_mrr: safeParseFinancial(rawStats.total_mrr || 0, 0, { fieldName: 'total_mrr', allowZero: true }),
      avg_mrr: safeParseFinancial(rawStats.avg_mrr || 0, 0, { fieldName: 'avg_mrr', allowZero: true }),
      min_mrr: safeParseFinancial(rawStats.min_mrr || 0, 0, { fieldName: 'min_mrr', allowZero: true }),
      max_mrr: safeParseFinancial(rawStats.max_mrr || 0, 0, { fieldName: 'max_mrr', allowZero: true }),
      churn_rate: Math.max(0, Math.min(100, safeParseFinancial(rawStats.churn_rate || 0, 0, { fieldName: 'churn_rate', allowZero: true }))),
      active_rate: Math.max(0, Math.min(100, safeParseFinancial(rawStats.active_rate || 100, 100, { fieldName: 'active_rate', allowZero: false })))
    };
  }, [mrrSummary, defaultMRR]);

  // Use fetched trends or return null if no historical data
  const trends = useMemo(() => ({
    mrrTrend: mrrTrends?.mrrTrend ?? undefined,
    clientTrend: mrrTrends?.clientTrend ?? undefined,
    churnTrend: mrrTrends?.churnTrend ?? undefined,
    avgTrend: mrrTrends?.avgTrend ?? undefined
  }), [mrrTrends]);

  // Memoize currency formatter
  const formatCurrency = useCallback((value: number) => {
    return new Intl.NumberFormat('en-GB', { 
      style: 'currency', 
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }, []);

  if (isLoading) {
    return (
      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-gray-900/50 backdrop-blur-xl rounded-xl p-5 border border-gray-800/50 animate-pulse">
            <div className="h-4 bg-gray-700 rounded w-3/4 mb-3"></div>
            <div className="h-8 bg-gray-700 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-red-500/10 border border-red-500/20 rounded-xl p-4 ${className}`}>
        <p className="text-red-400 text-sm">Error loading subscription stats: {error}</p>
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
      <EnhancedStatCard
        title="Total MRR"
        primaryValue={formatCurrency(stats.total_mrr)}
        trendPercentage={trends.mrrTrend}
        periodContext={trends.mrrTrend !== undefined ? "vs last month" : undefined}
        icon={DollarSign}
        color="emerald"
        onClick={() => onClick?.('Total MRR')}
      />

      <EnhancedStatCard
        title="Active Clients"
        primaryValue={stats.active_clients}
        secondaryValue={`${stats.total_clients} total clients`}
        percentageValue={stats.active_rate}
        trendPercentage={trends.clientTrend}
        periodContext={trends.clientTrend !== undefined ? "vs last month" : undefined}
        icon={Users}
        color="blue"
        onClick={() => onClick?.('Active Clients')}
      />

      <EnhancedStatCard
        title="Avg Client Value"
        primaryValue={formatCurrency(stats.avg_mrr)}
        secondaryValue={`Range: ${formatCurrency(stats.min_mrr)} - ${formatCurrency(stats.max_mrr)}`}
        trendPercentage={trends.avgTrend}
        periodContext={trends.avgTrend !== undefined ? "vs last month" : undefined}
        icon={TrendingUp}
        color="violet"
        onClick={() => onClick?.('Avg Client Value')}
      />

      <EnhancedStatCard
        title="Monthly Churn"
        primaryValue={`${stats.churn_rate.toFixed(1)}%`}
        secondaryValue={`${stats.churned_clients} churned clients`}
        trendPercentage={trends.churnTrend}
        periodContext={trends.churnTrend !== undefined ? "vs last month" : undefined}
        icon={Building2}
        color="orange"
        variant="no-show"
        onClick={() => onClick?.('Monthly Churn')}
      />
    </div>
  );
}

// Export memoized component for performance optimization
export const SubscriptionStats = React.memo(SubscriptionStatsComponent);
export default SubscriptionStats;