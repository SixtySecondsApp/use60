import { useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Play,
  RefreshCw,
  ArrowLeft,
  Users,
  Clock,
  TrendingUp,
  AlertCircle,
  UserPlus,
  Video,
  FileText,
  Mail,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { BackToPlatform } from '@/components/platform/BackToPlatform';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDateRangeFilter, DateRangeFilter } from '@/components/ui/DateRangeFilter';
import { VSLComparisonCards, VSLTrendChart, VSLRetentionGraph } from '@/components/vsl-analytics';
import {
  useVSLAnalytics,
  formatWatchTime,
  formatPercentage,
} from '@/lib/hooks/useVSLAnalytics';
import {
  useLandingPageAnalytics,
  formatLandingPageName,
} from '@/lib/hooks/useLandingPageAnalytics';

export function VSLAnalytics() {
  const dateFilter = useDateRangeFilter();

  const {
    loading,
    error,
    data,
    isAdmin,
    userLoading,
    variants,
    comparison,
    hasData,
    refresh,
    updateDateRange,
  } = useVSLAnalytics();

  // Landing page analytics for video vs non-video comparison
  const {
    loading: landingLoading,
    stats: landingStats,
    refresh: refreshLanding,
  } = useLandingPageAnalytics();

  // Sync date filter state with the VSL analytics hook
  useEffect(() => {
    if (dateFilter.dateRange?.start && dateFilter.dateRange?.end) {
      updateDateRange({
        startDate: dateFilter.dateRange.start,
        endDate: dateFilter.dateRange.end,
      });
    }
  }, [dateFilter.dateRange]);

  // Show loading state while checking user permissions
  if (userLoading) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header skeleton */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-8 w-64 rounded" />
              </div>
              <Skeleton className="h-4 w-80 rounded mt-1" />
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-36 rounded" />
              <Skeleton className="h-9 w-9 rounded" />
            </div>
          </div>
          {/* Summary stats skeleton — 4 columns */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-gray-800/30 rounded-lg p-4 flex items-center gap-4">
                <Skeleton className="h-11 w-11 rounded-lg flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-24 rounded" />
                  <Skeleton className="h-7 w-20 rounded" />
                </div>
              </div>
            ))}
          </div>
          {/* VSLComparisonCards skeleton */}
          <div className="mb-8">
            <Skeleton className="h-6 w-44 rounded mb-4" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-5 w-28 rounded" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map((j) => (
                      <div key={j} className="flex justify-between">
                        <Skeleton className="h-4 w-28 rounded" />
                        <Skeleton className="h-4 w-16 rounded" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* VSLTrendChart skeleton */}
          <div className="mb-8">
            <Skeleton className="h-6 w-36 rounded mb-4" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
          {/* VSLRetentionGraph skeleton */}
          <div className="mb-8">
            <Skeleton className="h-6 w-40 rounded mb-4" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-xl p-8 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Access Denied</h2>
          <p className="text-gray-400 mb-6">
            VSL Analytics is only available to administrators.
          </p>
          <Link to="/platform">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Platform
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <BackToPlatform />
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Link
                to="/platform"
                className="text-gray-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                <Play className="w-7 h-7 text-brand-violet" />
                VSL Split Test Analytics
              </h1>
            </div>
            <p className="text-gray-400 text-sm">
              Compare performance across your video sales letter variants
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Date Range Selector */}
            <DateRangeFilter
              {...dateFilter}
              variant="dark"
            />

            {/* Refresh Button */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => refresh()}
              disabled={loading}
              className="border-gray-700 hover:bg-gray-800"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div>
              <p className="text-red-400 font-medium">Error loading analytics</p>
              <p className="text-red-400/70 text-sm">{error}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refresh()}
              className="ml-auto border-red-500/30 text-red-400 hover:bg-red-500/10"
            >
              Retry
            </Button>
          </motion.div>
        )}

        {/* Summary Stats (when data exists) */}
        {hasData && comparison && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8"
          >
            <div className="bg-gray-800/30 rounded-lg p-4 flex items-center gap-4">
              <div className="p-3 rounded-lg bg-brand-violet/10">
                <Users className="w-5 h-5 text-brand-violet" />
              </div>
              <div>
                <p className="text-gray-400 text-sm">Total Views</p>
                <p className="text-2xl font-bold text-white">
                  {comparison.totalViewsAcrossAll.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="bg-gray-800/30 rounded-lg p-4 flex items-center gap-4">
              <div className="p-3 rounded-lg bg-green-500/10">
                <UserPlus className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-gray-400 text-sm">Total Conversions</p>
                <p className="text-2xl font-bold text-white">
                  {comparison.totalConversions.toLocaleString()}
                  <span className="text-sm font-normal text-gray-400 ml-1">
                    ({formatPercentage(comparison.avgConversionRate)})
                  </span>
                </p>
              </div>
            </div>

            <div className="bg-gray-800/30 rounded-lg p-4 flex items-center gap-4">
              <div className="p-3 rounded-lg bg-brand-blue/10">
                <TrendingUp className="w-5 h-5 text-brand-blue" />
              </div>
              <div>
                <p className="text-gray-400 text-sm">Avg Completion Rate</p>
                <p className="text-2xl font-bold text-white">
                  {formatPercentage(comparison.avgCompletionRate)}
                </p>
              </div>
            </div>

            <div className="bg-gray-800/30 rounded-lg p-4 flex items-center gap-4">
              <div className="p-3 rounded-lg bg-brand-teal/10">
                <Clock className="w-5 h-5 text-brand-teal" />
              </div>
              <div>
                <p className="text-gray-400 text-sm">Best by Conversions</p>
                <p className="text-2xl font-bold text-white">
                  {variants.find((v) => v.variantId === comparison.bestByConversions)?.name ||
                    'N/A'}
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Comparison Cards */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">Variant Comparison</h2>
          <VSLComparisonCards
            variants={variants}
            bestPerformer={comparison?.bestByConversions || comparison?.bestByCompletionRate || null}
            isLoading={loading}
          />
        </div>

        {/* Video vs Non-Video Landing Page Comparison */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-brand-teal" />
            Landing Page Comparison (Video vs Non-Video)
          </h2>

          {landingLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {[1, 2].map((i) => (
                <div key={i} className="bg-gray-800/30 rounded-lg p-5 border border-gray-700/50 space-y-3">
                  <div className="flex items-center gap-2 mb-4">
                    <Skeleton className="h-9 w-9 rounded-lg" />
                    <Skeleton className="h-5 w-36 rounded" />
                  </div>
                  {[1, 2, 3].map((j) => (
                    <div key={j} className="bg-gray-900/50 rounded-lg p-3 space-y-2">
                      <Skeleton className="h-4 w-full rounded" />
                      <div className="grid grid-cols-3 gap-2">
                        <Skeleton className="h-8 rounded" />
                        <Skeleton className="h-8 rounded" />
                        <Skeleton className="h-8 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : Object.keys(landingStats.byLandingPage).length === 0 ? (
            <div className="bg-gray-800/30 rounded-lg p-6 text-center">
              <p className="text-gray-400">No landing page data available yet.</p>
              <p className="text-gray-500 text-sm mt-1">
                Page views are tracked automatically on landing pages.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Video Pages */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gray-800/30 rounded-lg p-5 border border-gray-700/50"
              >
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 rounded-lg bg-brand-violet/10">
                    <Video className="w-5 h-5 text-brand-violet" />
                  </div>
                  <h3 className="text-white font-medium">With Video (VSL)</h3>
                </div>
                <div className="space-y-3">
                  {Object.entries(landingStats.byLandingPage)
                    .filter(([_, stats]) => stats.has_video)
                    .map(([page, stats]) => (
                      <div key={page} className="bg-gray-900/50 rounded-lg p-3">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-gray-300 font-medium">
                            {formatLandingPageName(page)}
                          </span>
                          <span className="text-xs text-gray-500">{page}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <span className="text-gray-500 block text-xs">Views</span>
                            <span className="text-white font-medium">
                              {stats.page_views.toLocaleString()}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500 block text-xs">Conversions</span>
                            <span className="text-green-400 font-medium">
                              {stats.conversions.toLocaleString()}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500 block text-xs">Conv. Rate</span>
                            <span className="text-brand-violet font-medium">
                              {stats.conversion_rate}%
                            </span>
                          </div>
                        </div>
                        {stats.partial_signups > 0 && (
                          <div className="mt-2 pt-2 border-t border-gray-700/50 flex items-center gap-2">
                            <Mail className="w-3 h-3 text-amber-400" />
                            <span className="text-xs text-gray-400">
                              {stats.partial_signups} leads captured ({stats.lead_capture_rate}%)
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  {Object.entries(landingStats.byLandingPage).filter(([_, s]) => s.has_video).length === 0 && (
                    <p className="text-gray-500 text-sm text-center py-4">
                      No video page data available
                    </p>
                  )}
                </div>
              </motion.div>

              {/* Non-Video Pages */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-gray-800/30 rounded-lg p-5 border border-gray-700/50"
              >
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 rounded-lg bg-brand-teal/10">
                    <FileText className="w-5 h-5 text-brand-teal" />
                  </div>
                  <h3 className="text-white font-medium">Without Video</h3>
                </div>
                <div className="space-y-3">
                  {Object.entries(landingStats.byLandingPage)
                    .filter(([_, stats]) => !stats.has_video)
                    .map(([page, stats]) => (
                      <div key={page} className="bg-gray-900/50 rounded-lg p-3">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-gray-300 font-medium">
                            {formatLandingPageName(page)}
                          </span>
                          <span className="text-xs text-gray-500">{page}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <span className="text-gray-500 block text-xs">Views</span>
                            <span className="text-white font-medium">
                              {stats.page_views.toLocaleString()}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500 block text-xs">Conversions</span>
                            <span className="text-green-400 font-medium">
                              {stats.conversions.toLocaleString()}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500 block text-xs">Conv. Rate</span>
                            <span className="text-brand-teal font-medium">
                              {stats.conversion_rate}%
                            </span>
                          </div>
                        </div>
                        {stats.partial_signups > 0 && (
                          <div className="mt-2 pt-2 border-t border-gray-700/50 flex items-center gap-2">
                            <Mail className="w-3 h-3 text-amber-400" />
                            <span className="text-xs text-gray-400">
                              {stats.partial_signups} leads captured ({stats.lead_capture_rate}%)
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  {Object.entries(landingStats.byLandingPage).filter(([_, s]) => !s.has_video).length === 0 && (
                    <p className="text-gray-500 text-sm text-center py-4">
                      No non-video page data available
                    </p>
                  )}
                </div>
              </motion.div>
            </div>
          )}

          {/* Summary Comparison */}
          {Object.keys(landingStats.byLandingPage).length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-4 bg-gray-800/20 rounded-lg p-4 border border-gray-700/30"
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-gray-500 text-xs mb-1">Total Page Views</p>
                  <p className="text-xl font-bold text-white">
                    {landingStats.totalPageViews.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-1">Unique Visitors</p>
                  <p className="text-xl font-bold text-white">
                    {landingStats.totalUniqueVisitors.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-1">Leads Captured</p>
                  <p className="text-xl font-bold text-amber-400">
                    {landingStats.totalPartialSignups.toLocaleString()}
                    <span className="text-sm font-normal text-gray-500 ml-1">
                      ({landingStats.overallLeadCaptureRate}%)
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-1">Full Conversions</p>
                  <p className="text-xl font-bold text-green-400">
                    {landingStats.totalConversions.toLocaleString()}
                    <span className="text-sm font-normal text-gray-500 ml-1">
                      ({landingStats.overallConversionRate}%)
                    </span>
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-1 gap-8">
          {/* Trend Chart */}
          <VSLTrendChart variants={variants} isLoading={loading} />

          {/* Retention Graph */}
          <VSLRetentionGraph variants={variants} isLoading={loading} />
        </div>

        {/* Raw Data Toggle (for debugging) */}
        {hasData && process.env.NODE_ENV === 'development' && (
          <details className="mt-8">
            <summary className="text-gray-500 text-sm cursor-pointer hover:text-gray-300">
              View Raw Data (Debug)
            </summary>
            <pre className="mt-4 p-4 bg-gray-900 rounded-lg text-xs text-gray-400 overflow-x-auto">
              {JSON.stringify(data, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

export default VSLAnalytics;
