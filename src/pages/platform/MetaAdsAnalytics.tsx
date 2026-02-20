import { useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  Calendar,
  RefreshCw,
  ArrowLeft,
  Users,
  Target,
  Megaphone,
  AlertCircle,
  ExternalLink,
  Eye,
  MousePointerClick,
} from 'lucide-react';
import { BackToPlatform } from '@/components/platform/BackToPlatform';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { useDateRangeFilter, DateRangeFilter } from '@/components/ui/DateRangeFilter';
import {
  useMetaAdsAnalytics,
  getSourceStyle,
  formatLandingPage,
  MetaAdPerformance,
} from '@/lib/hooks/useMetaAdsAnalytics';

// Source icons
const SourceIcon: React.FC<{ source: string; className?: string }> = ({ source, className }) => {
  switch (source) {
    case 'Facebook':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      );
    case 'Instagram':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
        </svg>
      );
    case 'Messenger':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.373 0 0 4.974 0 11.111c0 3.498 1.744 6.614 4.469 8.654V24l4.088-2.242c1.092.301 2.246.464 3.443.464 6.627 0 12-4.974 12-11.111S18.627 0 12 0zm1.191 14.963l-3.055-3.26-5.963 3.26L10.732 8l3.131 3.259L19.752 8l-6.561 6.963z" />
        </svg>
      );
    default:
      return <Target className={className} />;
  }
};

export function MetaAdsAnalytics() {
  const dateFilter = useDateRangeFilter('30d');

  const {
    loading,
    error,
    isAdmin,
    userLoading,
    adPerformance,
    dailySummary,
    stats,
    dateRange,
    setDateRange,
    refresh,
  } = useMetaAdsAnalytics();

  useEffect(() => {
    if (dateFilter.dateRange) {
      setDateRange({ startDate: dateFilter.dateRange.start, endDate: dateFilter.dateRange.end });
    }
  }, [dateFilter.dateRange]);

  // Show loading state while checking user permissions
  if (userLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-brand-violet animate-spin" />
          <p className="text-gray-400">Loading...</p>
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
            Meta Ads Analytics is only available to administrators.
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
                <Megaphone className="w-7 h-7 text-blue-500" />
                Meta Ads Analytics
              </h1>
            </div>
            <p className="text-gray-400 text-sm">
              Track Facebook & Instagram ad performance and conversions
            </p>
          </div>

          <div className="flex items-center gap-3">
            <DateRangeFilter {...dateFilter} variant="dark" />

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

        {/* Summary Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8"
        >
          <div className="bg-gray-800/30 rounded-lg p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-green-500/10">
              <Users className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-gray-400 text-sm">Total Conversions</p>
              <p className="text-2xl font-bold text-white">
                {stats.totalConversions.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="bg-gray-800/30 rounded-lg p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-blue-500/10">
              <SourceIcon source="Facebook" className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-gray-400 text-sm">Sources</p>
              <p className="text-2xl font-bold text-white">
                {Object.keys(stats.bySource).length}
              </p>
            </div>
          </div>

          <div className="bg-gray-800/30 rounded-lg p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-violet-500/10">
              <Target className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <p className="text-gray-400 text-sm">Campaigns</p>
              <p className="text-2xl font-bold text-white">
                {Object.keys(stats.byCampaign).length}
              </p>
            </div>
          </div>

          <div className="bg-gray-800/30 rounded-lg p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-pink-500/10">
              <Eye className="w-5 h-5 text-pink-400" />
            </div>
            <div>
              <p className="text-gray-400 text-sm">Creatives</p>
              <p className="text-2xl font-bold text-white">
                {Object.keys(stats.byCreative).length}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Performance by Source */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-brand-violet" />
            Performance by Source
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(stats.bySource).map(([source, conversions]) => {
              const style = getSourceStyle(source);
              return (
                <motion.div
                  key={source}
                  whileHover={{ scale: 1.02 }}
                  className={`${style.bgColor} border border-gray-700/50 rounded-lg p-4`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <SourceIcon source={source} className="w-6 h-6" style={{ color: style.color }} />
                    <span className="text-white font-medium">{source}</span>
                  </div>
                  <p className="text-3xl font-bold text-white">{conversions}</p>
                  <p className="text-gray-400 text-sm">conversions</p>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Performance by Landing Page */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-8"
        >
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <MousePointerClick className="w-5 h-5 text-brand-teal" />
            Performance by Landing Page
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(stats.byLandingPage).map(([page, conversions]) => (
              <motion.div
                key={page}
                whileHover={{ scale: 1.02 }}
                className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-4"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-teal-500/10">
                    <ExternalLink className="w-4 h-4 text-teal-400" />
                  </div>
                  <span className="text-white font-medium">{formatLandingPage(page)}</span>
                </div>
                <p className="text-3xl font-bold text-white">{conversions}</p>
                <p className="text-gray-400 text-sm">conversions</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Top Performers Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-8"
        >
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-brand-blue" />
            Top Performing Ads
          </h2>
          <div className="bg-gray-800/30 rounded-lg border border-gray-700/50 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700/50">
                  <th className="text-left p-4 text-gray-400 font-medium text-sm">Source</th>
                  <th className="text-left p-4 text-gray-400 font-medium text-sm">Landing Page</th>
                  <th className="text-left p-4 text-gray-400 font-medium text-sm">Campaign</th>
                  <th className="text-left p-4 text-gray-400 font-medium text-sm">Creative</th>
                  <th className="text-right p-4 text-gray-400 font-medium text-sm">Conversions</th>
                </tr>
              </thead>
              <tbody>
                {stats.topPerformers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500">
                      No ad data available yet. Conversions from Meta ads will appear here.
                    </td>
                  </tr>
                ) : (
                  stats.topPerformers.map((ad: MetaAdPerformance, index: number) => (
                    <tr
                      key={`${ad.source}-${ad.campaign_id}-${ad.creative_id}-${index}`}
                      className="border-b border-gray-700/30 hover:bg-gray-700/20 transition-colors"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <SourceIcon
                            source={ad.source_name}
                            className="w-5 h-5"
                            style={{ color: getSourceStyle(ad.source_name).color }}
                          />
                          <span className="text-white">{ad.source_name}</span>
                        </div>
                      </td>
                      <td className="p-4 text-gray-300">{formatLandingPage(ad.landing_page)}</td>
                      <td className="p-4 text-gray-400 font-mono text-sm">
                        {ad.meta_campaign_id || ad.campaign_id || '-'}
                      </td>
                      <td className="p-4 text-gray-400 font-mono text-sm">
                        {ad.creative_id || '-'}
                      </td>
                      <td className="p-4 text-right">
                        <span className="text-white font-semibold">{ad.conversions}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Daily Summary */}
        {dailySummary.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-gray-400" />
              Daily Summary
            </h2>
            <div className="bg-gray-800/30 rounded-lg border border-gray-700/50 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-700/50">
                    <th className="text-left p-4 text-gray-400 font-medium text-sm">Date</th>
                    <th className="text-left p-4 text-gray-400 font-medium text-sm">Source</th>
                    <th className="text-left p-4 text-gray-400 font-medium text-sm">Landing Page</th>
                    <th className="text-right p-4 text-gray-400 font-medium text-sm">Conversions</th>
                    <th className="text-right p-4 text-gray-400 font-medium text-sm">Campaigns</th>
                    <th className="text-right p-4 text-gray-400 font-medium text-sm">Creatives</th>
                  </tr>
                </thead>
                <tbody>
                  {dailySummary.slice(0, 20).map((day, index) => (
                    <tr
                      key={`${day.date}-${day.source}-${day.landing_page}-${index}`}
                      className="border-b border-gray-700/30 hover:bg-gray-700/20 transition-colors"
                    >
                      <td className="p-4 text-white">
                        {format(new Date(day.date), 'MMM d, yyyy')}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <SourceIcon
                            source={day.source === 'facebook' ? 'Facebook' : day.source}
                            className="w-4 h-4"
                            style={{ color: getSourceStyle(day.source === 'facebook' ? 'Facebook' : day.source).color }}
                          />
                          <span className="text-gray-300">{day.source}</span>
                        </div>
                      </td>
                      <td className="p-4 text-gray-400">{formatLandingPage(day.landing_page)}</td>
                      <td className="p-4 text-right text-white font-semibold">{day.conversions}</td>
                      <td className="p-4 text-right text-gray-400">{day.campaigns}</td>
                      <td className="p-4 text-right text-gray-400">{day.creatives}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {/* No Data State */}
        {!loading && stats.totalConversions === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <Megaphone className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No Meta Ads Data Yet</h3>
            <p className="text-gray-400 max-w-md mx-auto">
              When users sign up through your Facebook or Instagram ads with UTM parameters,
              their conversion data will appear here.
            </p>
            <div className="mt-6 p-4 bg-gray-800/30 rounded-lg inline-block text-left">
              <p className="text-sm text-gray-400 mb-2">Example UTM-tagged URL:</p>
              <code className="text-xs text-gray-300 font-mono">
                use60.com/waitlist?utm_source=fb&utm_campaign=launch&utm_content=creative1
              </code>
            </div>
          </motion.div>
        )}

        {/* Raw Data Toggle (for debugging) */}
        {stats.totalConversions > 0 && process.env.NODE_ENV === 'development' && (
          <details className="mt-8">
            <summary className="text-gray-500 text-sm cursor-pointer hover:text-gray-300">
              View Raw Data (Debug)
            </summary>
            <pre className="mt-4 p-4 bg-gray-900 rounded-lg text-xs text-gray-400 overflow-x-auto">
              {JSON.stringify({ adPerformance, dailySummary, stats }, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

export default MetaAdsAnalytics;
