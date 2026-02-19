import { useState, useCallback } from 'react';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { LayoutDashboard, FileText, Wand2, ClipboardList, Search, Database, RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMeetingIntelligence } from '@/lib/hooks/useMeetingIntelligence';
import type { TimePeriod } from '@/lib/hooks/useTeamAnalytics';

import { SearchHero } from '@/components/meeting-analytics/SearchHero';
import { DashboardTab } from '@/components/meeting-analytics/DashboardTab';
import { TranscriptsTab } from '@/components/meeting-analytics/TranscriptsTab';
import { InsightsTab } from '@/components/meeting-analytics/InsightsTab';
import { ReportsTab } from '@/components/meeting-analytics/ReportsTab';
import { TranscriptDetailSheet } from '@/components/meeting-analytics/TranscriptDetailSheet';

const tabs = [
  { value: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { value: 'transcripts', label: 'Transcripts', icon: FileText },
  { value: 'insights', label: 'Insights', icon: Wand2 },
  { value: 'reports', label: 'Reports', icon: ClipboardList },
] as const;

export default function MeetingAnalyticsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { transcriptId } = useParams<{ transcriptId?: string }>();
  const navigate = useNavigate();
  const [isIndexing, setIsIndexing] = useState(false);

  const { indexStatus, isLoadingStatus, triggerFullIndex } = useMeetingIntelligence();

  const activeTab = searchParams.get('tab') || 'dashboard';

  // Period selector state (shared across tabs)
  const [period, setPeriod] = useState<TimePeriod>(30);
  const handlePeriodChange = useCallback((value: string) => {
    setPeriod(parseInt(value, 10) as TimePeriod);
  }, []);

  const handleSync = async () => {
    setIsIndexing(true);
    try {
      await triggerFullIndex();
    } finally {
      setIsIndexing(false);
    }
  };

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  const handleTranscriptDetailClose = () => {
    navigate('/meeting-analytics');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="min-h-screen bg-gray-50 dark:bg-[#0a0f1e] text-gray-900 dark:text-gray-100 relative"
    >
      {/* Background gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[200px] -left-[100px] w-[600px] h-[600px] rounded-full bg-emerald-500/[0.04] dark:bg-emerald-500/[0.06] blur-[120px]" />
        <div className="absolute -bottom-[200px] -right-[100px] w-[500px] h-[500px] rounded-full bg-teal-500/[0.04] dark:bg-teal-500/[0.06] blur-[120px]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header - Intelligence page pattern */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-600/10 dark:bg-emerald-500/20 border border-emerald-600/20 dark:border-emerald-500/30 flex items-center justify-center">
              <Search className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">
                <span className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 dark:from-white dark:via-gray-100 dark:to-white bg-clip-text text-transparent">
                  Meeting
                </span>{' '}
                <span className="bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 bg-clip-text text-transparent">
                  Analytics
                </span>
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  AI-powered search and insights across your meetings
                </p>
              </div>
            </div>
          </div>

          {/* Index Status Indicator */}
          {!isLoadingStatus && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 }}
              className="flex items-center gap-3 bg-white/60 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl px-4 py-2.5 border border-gray-200/50 dark:border-gray-700/30 shadow-sm self-start sm:self-auto"
            >
              {/* Circular progress */}
              <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-full bg-gray-100/80 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/30">
                  <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                    <circle
                      cx="18" cy="18" r="14"
                      fill="none"
                      className="stroke-gray-200/50 dark:stroke-gray-700/30"
                      strokeWidth="3"
                    />
                    <circle
                      cx="18" cy="18" r="14"
                      fill="none"
                      className="stroke-emerald-500"
                      strokeWidth="3"
                      strokeDasharray={`${indexStatus.total > 0 ? Math.round((indexStatus.indexed / indexStatus.total) * 100) * 0.88 : 0} 88`}
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Database className="h-4 w-4 text-emerald-500" />
                </div>
              </div>

              {/* Count + label */}
              <div className="flex flex-col">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  {indexStatus.indexed}/{indexStatus.total}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">indexed</span>
              </div>

              {/* Status badge */}
              <div className="flex items-center">
                {indexStatus.indexed === indexStatus.total && indexStatus.total > 0 && (
                  <Badge className="bg-emerald-100/80 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-500/30 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
                    Synced
                  </Badge>
                )}
                {indexStatus.status === 'syncing' && (
                  <Badge className="bg-blue-100/80 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200/50 dark:border-blue-500/30 font-medium">
                    <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                    Syncing
                  </Badge>
                )}
                {indexStatus.status === 'error' && (
                  <Badge className="bg-red-100/80 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200/50 dark:border-red-500/30 font-medium">
                    <AlertCircle className="h-3 w-3 mr-1.5" />
                    Error
                  </Badge>
                )}
              </div>

              {/* Sync button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleSync}
                disabled={isIndexing || indexStatus.status === 'syncing'}
                className="h-9 gap-2 bg-white/80 dark:bg-gray-800/50 border-gray-200/50 dark:border-gray-700/30 hover:bg-emerald-50/80 dark:hover:bg-emerald-900/20 hover:border-emerald-300/50 dark:hover:border-emerald-500/30 hover:text-emerald-700 dark:hover:text-emerald-400 rounded-lg transition-all duration-300 dark:text-gray-200"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', (isIndexing || indexStatus.status === 'syncing') && 'animate-spin')} />
                {isIndexing ? 'Indexing...' : 'Sync'}
              </Button>
            </motion.div>
          )}
        </motion.div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <div className="mb-4 sm:mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <TabsList className="bg-white/60 dark:bg-gray-900/40 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/30 rounded-xl p-1 shadow-sm">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="flex items-center gap-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:dark:bg-gray-800/80 data-[state=active]:shadow-sm transition-all"
                  >
                    <Icon className="w-4 h-4" />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {/* Period Selector */}
            <Tabs value={period.toString()} onValueChange={handlePeriodChange}>
              <TabsList className="bg-white/60 dark:bg-gray-900/40 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/30 rounded-xl p-1 shadow-sm">
                <TabsTrigger
                  value="7"
                  className="px-3 py-1.5 text-sm rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800/80 data-[state=active]:shadow-sm transition-all"
                >
                  7 days
                </TabsTrigger>
                <TabsTrigger
                  value="30"
                  className="px-3 py-1.5 text-sm rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800/80 data-[state=active]:shadow-sm transition-all"
                >
                  30 days
                </TabsTrigger>
                <TabsTrigger
                  value="90"
                  className="px-3 py-1.5 text-sm rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800/80 data-[state=active]:shadow-sm transition-all"
                >
                  90 days
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* SearchHero - only on Dashboard tab */}
          <AnimatePresence>
            {activeTab === 'dashboard' && (
              <motion.div
                key="search-hero"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <SearchHero className="mb-6 sm:mb-8" />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
            >
              <TabsContent value="dashboard" className="mt-0">
                <DashboardTab period={period} />
              </TabsContent>

              <TabsContent value="transcripts" className="mt-0">
                <TranscriptsTab />
              </TabsContent>

              <TabsContent value="insights" className="mt-0">
                <InsightsTab />
              </TabsContent>

              <TabsContent value="reports" className="mt-0">
                <ReportsTab />
              </TabsContent>
            </motion.div>
          </AnimatePresence>
        </Tabs>
      </div>

      {/* Transcript Detail Sheet */}
      {transcriptId && (
        <TranscriptDetailSheet
          transcriptId={transcriptId}
          open={true}
          onClose={handleTranscriptDetailClose}
        />
      )}
    </motion.div>
  );
}
