/**
 * ForecastPage (PRD-116)
 * AI Command Center — Forecast Dashboard
 * Stories: FORE-001 through FORE-007
 */

import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { CalendarRange } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/clientV2';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { toast } from 'sonner';

import { ForecastSummaryCards } from '@/components/forecast/ForecastSummaryCards';
import { ForecastVsActualChart } from '@/components/forecast/ForecastVsActualChart';
import { RepCalibrationCards } from '@/components/forecast/RepCalibrationCards';
import { PipelineWaterfallChart } from '@/components/forecast/PipelineWaterfallChart';
import { WeightedPipelineChart } from '@/components/forecast/WeightedPipelineChart';

type Period = 'month' | 'quarter';

interface ForecastTotals {
  commit_total: number;
  best_case_total: number;
  pipeline_total: number;
  period: string;
}

export function ForecastPage() {
  const [period, setPeriod] = useState<Period>('quarter');
  const orgId = useActiveOrgId();

  const { data: totals, isLoading: totalsLoading } = useQuery({
    queryKey: ['forecast-totals', orgId, period],
    queryFn: async () => {
      if (!orgId) return null;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase.rpc('get_forecast_totals', {
        p_org_id: orgId,
        p_user_id: user.id,
        p_period: period,
      });
      if (error) {
        toast.error('Failed to load forecast totals');
        throw error;
      }
      return data as ForecastTotals;
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <>
      <Helmet>
        <title>Forecast — 60</title>
      </Helmet>

      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Forecast</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {period === 'quarter' ? 'This quarter' : 'This month'} — pipeline health and revenue forecast
            </p>
          </div>

          {/* Period selector */}
          <div className="flex items-center gap-1 rounded-lg border border-white/20 dark:border-white/10 bg-white/50 dark:bg-white/5 p-1">
            <Button
              variant={period === 'month' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => setPeriod('month')}
            >
              <CalendarRange className="h-3.5 w-3.5 mr-1.5" />
              Month
            </Button>
            <Button
              variant={period === 'quarter' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => setPeriod('quarter')}
            >
              <CalendarRange className="h-3.5 w-3.5 mr-1.5" />
              Quarter
            </Button>
          </div>
        </div>

        {/* FORE-001: Summary cards */}
        <ForecastSummaryCards data={totals} isLoading={totalsLoading} />

        {/* Row: Forecast vs Actual + Rep Calibration */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* FORE-002: Forecast vs Actual chart (2/3 width) */}
          <div className="lg:col-span-2">
            <ForecastVsActualChart />
          </div>

          {/* FORE-003: Rep calibration (1/3 width) */}
          <div>
            <RepCalibrationCards />
          </div>
        </div>

        {/* Row: Pipeline Waterfall + Weighted Pipeline */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* FORE-004: Pipeline waterfall */}
          <PipelineWaterfallChart />

          {/* FORE-005: Weighted pipeline by stage */}
          <WeightedPipelineChart />
        </div>
      </div>
    </>
  );
}

export default ForecastPage;
