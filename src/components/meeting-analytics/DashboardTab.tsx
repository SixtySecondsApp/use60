/**
 * DashboardTab - Meeting-specific dashboard showing Team Comparison, Pipeline Health, and Alerts.
 * KPI Grid and Trends Chart have been moved to the main Dashboard page.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Flame,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useActiveOrg } from '@/lib/stores/orgStore';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useMaDashboard, useMaAlerts } from '@/lib/hooks/useMeetingAnalytics';

// Team analytics components
import { TeamTrendsChart, TeamTrendsChartSkeleton } from '@/components/insights/TeamTrendsChart';

import type { TimePeriod } from '@/lib/hooks/useTeamAnalytics';
import type { DateRange } from '@/lib/services/teamAnalyticsService';

const GLASS_CARD =
  'bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10';

function getPipelineStatusBadge(status: 'hot' | 'warm' | 'cold') {
  switch (status) {
    case 'hot':
      return (
        <Badge
          variant="outline"
          className="bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20"
        >
          Hot
        </Badge>
      );
    case 'warm':
      return (
        <Badge
          variant="outline"
          className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20"
        >
          Warm
        </Badge>
      );
    case 'cold':
      return (
        <Badge
          variant="outline"
          className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20"
        >
          Cold
        </Badge>
      );
  }
}

function getPipelineBorderColor(status: 'hot' | 'warm' | 'cold'): string {
  switch (status) {
    case 'hot':
      return 'border-l-red-500';
    case 'warm':
      return 'border-l-amber-500';
    case 'cold':
      return 'border-l-blue-500';
  }
}

function getSeverityIcon(severity: 'info' | 'warning' | 'critical') {
  switch (severity) {
    case 'critical':
      return <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />;
    case 'warning':
      return <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />;
    case 'info':
      return <AlertCircle className="h-4 w-4 text-blue-500 flex-shrink-0" />;
  }
}

function getSeverityGradient(severity: 'info' | 'warning' | 'critical'): string {
  switch (severity) {
    case 'critical':
      return 'bg-gradient-to-r from-red-500/10 via-red-600/5 to-transparent border-red-200/50 dark:border-red-500/20';
    case 'warning':
      return 'bg-gradient-to-r from-amber-500/10 via-amber-600/5 to-transparent border-amber-200/50 dark:border-amber-500/20';
    case 'info':
      return 'bg-gradient-to-r from-blue-500/10 via-blue-600/5 to-transparent border-blue-200/50 dark:border-blue-500/20';
  }
}

interface DashboardTabProps {
  className?: string;
  period: TimePeriod;
  dateRange?: DateRange;
}

export function DashboardTab({ className, period, dateRange }: DashboardTabProps) {
  const { user } = useAuth();
  const activeOrg = useActiveOrg();

  // Alerts section collapsed state
  const [alertsExpanded, setAlertsExpanded] = useState(true);

  // Meeting analytics hooks for pipeline and alerts
  const { data: dashboard } = useMaDashboard();
  const { data: alerts } = useMaAlerts();

  const pipelineHealth = dashboard?.pipelineHealth ?? [];
  const dashboardAlerts = alerts ?? dashboard?.alerts ?? [];

  const hasOrg = Boolean(activeOrg?.id);

  // Guard: user not yet loaded → TanStack Query v5 disabled queries return
  // isLoading=false + data=undefined, which would trigger the error state in TeamTrendsChart
  if (!user) {
    return <TeamTrendsChartSkeleton />;
  }

  if (!hasOrg) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="p-5 bg-gray-100 dark:bg-gray-800/50 rounded-2xl mb-5">
          <Activity className="h-14 w-14 text-gray-400 dark:text-gray-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          No Organization Selected
        </h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Please select an organization from the sidebar to view the dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* ---------------------------------------------------------- */}
      {/* Team Comparison Matrix (full width)                        */}
      {/* ---------------------------------------------------------- */}
      <div className={cn(GLASS_CARD, 'p-5')}>
        <TeamTrendsChart period={period} dateRange={dateRange} />
      </div>

      {/* ---------------------------------------------------------- */}
      {/* Pipeline Health                                             */}
      {/* ---------------------------------------------------------- */}
      {pipelineHealth.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className={GLASS_CARD}
        >
          <div className="p-6 pb-4">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500" />
              <h3 className="text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Pipeline Health
              </h3>
            </div>
          </div>
          <div className="px-6 pb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {pipelineHealth.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className={cn(
                    'rounded-2xl border-l-4 border border-gray-200/50 dark:border-gray-700/30 p-4 bg-white/60 dark:bg-gray-800/20 hover:border-gray-300/50 dark:hover:border-gray-600/40 transition-all duration-300',
                    getPipelineBorderColor(item.status)
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate pr-2">
                      {item.title || 'Untitled'}
                    </h4>
                    {getPipelineStatusBadge(item.status)}
                  </div>
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
                    {item.conversionScore}/100
                  </p>
                  <p className="text-xs text-muted-foreground">Conversion score</p>
                  {item.blockerCount > 0 && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                      <AlertCircle className="h-3 w-3" />
                      {item.blockerCount} blocker{item.blockerCount !== 1 ? 's' : ''}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* ---------------------------------------------------------- */}
      {/* Active Alerts (collapsible)                                 */}
      {/* ---------------------------------------------------------- */}
      {dashboardAlerts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className={GLASS_CARD}
        >
          <button
            onClick={() => setAlertsExpanded((prev) => !prev)}
            className="w-full p-6 pb-4 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Active Alerts
              </h3>
              <Badge
                variant="outline"
                className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 text-xs"
              >
                {dashboardAlerts.length}
              </Badge>
            </div>
            {alertsExpanded ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </button>
          {alertsExpanded && (
            <div className="px-6 pb-6 space-y-3">
              {dashboardAlerts.map((alert, index) => (
                <div
                  key={`${alert.type}-${alert.transcriptId ?? index}`}
                  className={cn(
                    'flex items-start gap-3 rounded-2xl border p-4',
                    getSeverityGradient(alert.severity)
                  )}
                >
                  {getSeverityIcon(alert.severity)}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-900 dark:text-gray-100">{alert.message}</p>
                    {alert.transcriptTitle && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Related meeting: {alert.transcriptTitle}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      alert.severity === 'critical'
                        ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20'
                        : alert.severity === 'warning'
                          ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
                          : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20'
                    }
                  >
                    {alert.severity}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

    </div>
  );
}
