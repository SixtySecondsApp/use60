// src/pages/admin/BillingAnalytics.tsx
// RevenueCat-inspired subscription analytics dashboard

import React, { useState, useMemo, useEffect } from 'react';
import { format, subDays, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  RefreshCw,
  Calendar,
  Loader2,
  BarChart3,
  PieChart,
  LineChart,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import { toast } from 'sonner';
import { useDateRangeFilter, DateRangeFilter } from '@/components/ui/DateRangeFilter';
import { cn } from '@/lib/utils';
import {
  useCurrentMRR,
  useMRRByDateRange,
  useChurnRate,
  useRetentionCohorts,
  useRealizedLTV,
  useTrialConversionRate,
  useMRRMovement,
} from '@/lib/hooks/useBillingAnalytics';

// Format currency helper
function formatCurrency(cents: number, currency: string = 'GBP'): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

// Format percentage
function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export default function BillingAnalytics() {
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>({
    start: subMonths(new Date(), 3),
    end: new Date(),
  });
  const [selectedCurrency, setSelectedCurrency] = useState<string | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);
  const dateFilter = useDateRangeFilter('90d');

  useEffect(() => {
    if (dateFilter.dateRange) {
      setDateRange({ start: dateFilter.dateRange.start, end: dateFilter.dateRange.end });
    }
  }, [dateFilter.dateRange]);

  // Fetch metrics
  const { data: currentMRR, isLoading: mrrLoading } = useCurrentMRR();
  const { data: mrrByDate, isLoading: mrrByDateLoading } = useMRRByDateRange(
    dateRange.start,
    dateRange.end,
    selectedCurrency
  );
  const { data: churnRate, isLoading: churnLoading } = useChurnRate(
    dateRange.start,
    dateRange.end,
    selectedCurrency
  );
  const { data: retentionCohorts, isLoading: retentionLoading } = useRetentionCohorts(
    subMonths(new Date(), 12),
    new Date(),
    [1, 3, 6, 12]
  );
  const { data: trialConversion, isLoading: trialLoading } = useTrialConversionRate(
    dateRange.start,
    dateRange.end
  );
  const { data: mrrMovement, isLoading: movementLoading } = useMRRMovement(30);
  const { data: realizedLTV, isLoading: ltvLoading } = useRealizedLTV(
    subMonths(new Date(), 12),
    new Date(),
    selectedCurrency
  );

  // Calculate totals from current MRR
  const totalMRR = useMemo(() => {
    if (!currentMRR) return { cents: 0, currency: 'GBP' };
    const primary = currentMRR[0] || currentMRR.find((m) => m.currency === selectedCurrency);
    return {
      cents: primary?.total_mrr_cents || 0,
      currency: primary?.currency || 'GBP',
    };
  }, [currentMRR, selectedCurrency]);

  const handleRefresh = async () => {
    setRefreshing(true);
    // React Query will refetch automatically
    setTimeout(() => setRefreshing(false), 1000);
    toast.success('Refreshed analytics');
  };

  const isLoading = mrrLoading || mrrByDateLoading || churnLoading || retentionLoading;

  // Prepare chart data
  const mrrChartData = useMemo(() => {
    if (!mrrByDate) return [];
    return mrrByDate.map((d) => ({
      date: format(new Date(d.date), 'MMM dd'),
      mrr: d.mrr_cents / 100,
      active: d.active_subscriptions,
      trialing: d.trialing_subscriptions,
    }));
  }, [mrrByDate]);

  const retentionChartData = useMemo(() => {
    if (!retentionCohorts) return [];
    const byCohort = retentionCohorts.reduce((acc, cohort) => {
      const key = cohort.cohort_month;
      if (!acc[key]) {
        acc[key] = { cohort: format(new Date(key), 'MMM yyyy'), ...cohort };
      }
      acc[key][`month_${cohort.retention_month}`] = cohort.retention_rate;
      return acc;
    }, {} as Record<string, any>);
    return Object.values(byCohort);
  }, [retentionCohorts]);

  const ltvChartData = useMemo(() => {
    if (!realizedLTV) return [];
    return realizedLTV
      .filter((ltv) => ltv.total_paid_cents > 0)
      .map((ltv) => ({
        cohort: format(new Date(ltv.cohort_month), 'MMM yyyy'),
        ltv: ltv.total_paid_cents / 100,
        months: ltv.subscription_months,
        avgMonthly: ltv.avg_monthly_revenue_cents / 100,
      }))
      .slice(0, 20); // Limit to last 20 cohorts
  }, [realizedLTV]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen bg-white dark:bg-gray-950">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Billing Analytics
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              RevenueCat-inspired subscription metrics (MRR, churn, retention, LTV)
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select
              value={selectedCurrency || 'all'}
              onValueChange={(value) => setSelectedCurrency(value === 'all' ? undefined : value)}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Currency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Currencies</SelectItem>
                <SelectItem value="GBP">GBP</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
              </SelectContent>
            </Select>
            <DateRangeFilter {...dateFilter} />
            <Button onClick={handleRefresh} variant="outline" disabled={refreshing}>
              <RefreshCw className={cn('h-4 w-4 mr-2', refreshing && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total MRR</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {mrrLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  formatCurrency(totalMRR.cents, totalMRR.currency)
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {currentMRR?.[0]?.active_subscriptions || 0} active subscriptions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Trialing</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {mrrLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  currentMRR?.[0]?.trialing_subscriptions || 0
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Active trials</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Churn Rate</CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {churnLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : churnRate && churnRate.length > 0 ? (
                  formatPercent(churnRate[0].subscriber_churn_rate)
                ) : (
                  '0%'
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {churnRate?.[0]?.subscribers_canceled || 0} canceled
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Trial Conversion</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {trialLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : trialConversion && trialConversion.length > 0 ? (
                  formatPercent(trialConversion[0].conversion_rate)
                ) : (
                  '0%'
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {trialConversion?.[0]?.trials_converted || 0} converted
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <Tabs defaultValue="mrr" className="space-y-4">
          <TabsList>
            <TabsTrigger value="mrr">MRR Trend</TabsTrigger>
            <TabsTrigger value="retention">Retention</TabsTrigger>
            <TabsTrigger value="ltv">Lifetime Value</TabsTrigger>
            <TabsTrigger value="churn">Churn</TabsTrigger>
          </TabsList>

          <TabsContent value="mrr" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Monthly Recurring Revenue Trend</CardTitle>
                <CardDescription>
                  MRR over time (normalized to monthly)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {mrrByDateLoading ? (
                  <div className="flex items-center justify-center h-[400px]">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : mrrChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <AreaChart data={mrrChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value * 100, totalMRR.currency)}
                      />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="mrr"
                        stroke="#8884d8"
                        fill="#8884d8"
                        fillOpacity={0.6}
                        name="MRR"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                    No data available
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="retention" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Subscription Retention by Cohort</CardTitle>
                <CardDescription>
                  Retention rates at 1, 3, 6, and 12 months
                </CardDescription>
              </CardHeader>
              <CardContent>
                {retentionLoading ? (
                  <div className="flex items-center justify-center h-[400px]">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : retentionChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={retentionChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="cohort" />
                      <YAxis />
                      <Tooltip formatter={(value: number) => formatPercent(value)} />
                      <Legend />
                      <Bar dataKey="month_1" fill="#8884d8" name="1 Month" />
                      <Bar dataKey="month_3" fill="#82ca9d" name="3 Months" />
                      <Bar dataKey="month_6" fill="#ffc658" name="6 Months" />
                      <Bar dataKey="month_12" fill="#ff7300" name="12 Months" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                    No retention data available
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ltv" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Realized Lifetime Value</CardTitle>
                <CardDescription>
                  Total revenue per customer by cohort (based on actual payments)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {ltvLoading ? (
                  <div className="flex items-center justify-center h-[400px]">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : ltvChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={ltvChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="cohort" />
                      <YAxis />
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value * 100, totalMRR.currency)}
                      />
                      <Legend />
                      <Bar dataKey="ltv" fill="#8884d8" name="Total LTV" />
                      <Bar dataKey="avgMonthly" fill="#82ca9d" name="Avg Monthly" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                    No LTV data available
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="churn" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Churn Analysis</CardTitle>
                <CardDescription>
                  Subscriber and MRR churn rates
                </CardDescription>
              </CardHeader>
              <CardContent>
                {churnLoading ? (
                  <div className="flex items-center justify-center h-[400px]">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : churnRate && churnRate.length > 0 ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 rounded-lg bg-muted">
                        <div className="text-sm text-muted-foreground">Subscriber Churn</div>
                        <div className="text-2xl font-bold">
                          {formatPercent(churnRate[0].subscriber_churn_rate)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {churnRate[0].subscribers_canceled} of {churnRate[0].active_subscriptions_start}
                        </div>
                      </div>
                      <div className="p-4 rounded-lg bg-muted">
                        <div className="text-sm text-muted-foreground">MRR Churn</div>
                        <div className="text-2xl font-bold">
                          {formatPercent(churnRate[0].mrr_churn_rate)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {formatCurrency(churnRate[0].mrr_lost_cents, churnRate[0].currency)} lost
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                    No churn data available
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
