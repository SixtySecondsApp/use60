/**
 * RepCalibrationCards (FORE-003)
 * Card per rep showing forecast accuracy % and over/under-forecast bias.
 * Data from get_team_forecast_accuracy RPC (org-level) or get_rep_calibration (user-level).
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { User, TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/clientV2';
import { useActiveOrgId } from '@/lib/stores/orgStore';

interface RepAccuracy {
  user_id: string;
  avg_forecast_accuracy: number;
  weeks_tracked: number;
  latest_calibration: {
    bias?: 'over' | 'under' | 'neutral';
    avg_error_pct?: number;
    display_name?: string;
  };
}

function BiasIcon({ bias }: { bias?: string }) {
  if (bias === 'over') return <TrendingUp className="h-4 w-4 text-amber-500" />;
  if (bias === 'under') return <TrendingDown className="h-4 w-4 text-blue-500" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

function accuracyColor(pct: number) {
  if (pct >= 0.85) return 'text-emerald-500';
  if (pct >= 0.65) return 'text-amber-500';
  return 'text-red-500';
}

function biasBadge(bias?: string) {
  if (bias === 'over') return { variant: 'secondary' as const, label: 'Over-forecast' };
  if (bias === 'under') return { variant: 'outline' as const, label: 'Under-forecast' };
  return { variant: 'outline' as const, label: 'On target' };
}

export function RepCalibrationCards() {
  const orgId = useActiveOrgId();

  const { data: reps, isLoading } = useQuery({
    queryKey: ['team-forecast-accuracy', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase.rpc('get_team_forecast_accuracy', {
        p_org_id: orgId,
        p_weeks: 8,
      });
      if (error) throw error;
      return (data || []) as RepAccuracy[];
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <Card className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl border-white/20 dark:border-white/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <User className="h-4 w-4 text-purple-500" />
          Rep Calibration
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !reps?.length ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No calibration data yet. Available after 2+ weeks of pipeline snapshots.
          </p>
        ) : (
          <div className="space-y-3">
            {reps.map((rep) => {
              const accuracyPct = Math.round((rep.avg_forecast_accuracy ?? 0) * 100);
              const bias = rep.latest_calibration?.bias;
              const badge = biasBadge(bias);
              const name = rep.latest_calibration?.display_name || rep.user_id.slice(0, 8);

              return (
                <div
                  key={rep.user_id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-white/50 dark:bg-white/5 border border-white/20 dark:border-white/10"
                >
                  <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium truncate">{name}</span>
                      <Badge variant={badge.variant} className="text-[10px] px-1 py-0">
                        {badge.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {rep.weeks_tracked} week{rep.weeks_tracked !== 1 ? 's' : ''} tracked
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <BiasIcon bias={bias} />
                    <span className={`text-lg font-bold tabular-nums ${accuracyColor(rep.avg_forecast_accuracy ?? 0)}`}>
                      {accuracyPct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
