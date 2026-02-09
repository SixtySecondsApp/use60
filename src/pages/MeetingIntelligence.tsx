import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useMeetingIntelligence, SearchFilters, SearchSource } from '@/lib/hooks/useMeetingIntelligence';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { HelpPanel } from '@/components/docs/HelpPanel';
import {
  Search,
  RefreshCw,
  Calendar,
  Building2,
  ExternalLink,
  Clock,
  MessageSquare,
  Loader2,
  AlertCircle,
  Database,
  Zap,
  History,
  User,
} from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';

// Quick date range presets
const DATE_PRESETS = [
  { label: 'Last 7 days', value: 'last7days' },
  { label: 'Last 30 days', value: 'last30days' },
  { label: 'This month', value: 'thisMonth' },
  { label: 'Last month', value: 'lastMonth' },
  { label: 'All time', value: 'allTime' },
];

// Example queries to help users
const EXAMPLE_QUERIES = [
  'What objections came up in recent demos?',
  'Summarize discussions about pricing',
  'Which meetings had negative sentiment?',
  'What did prospects say about competitors?',
  'Find meetings where next steps were discussed',
  'What are the common pain points mentioned?',
];

function getDateRange(preset: string): { date_from?: string; date_to?: string } {
  const today = new Date();

  switch (preset) {
    case 'last7days':
      return {
        date_from: format(subDays(today, 7), 'yyyy-MM-dd'),
        date_to: format(today, 'yyyy-MM-dd'),
      };
    case 'last30days':
      return {
        date_from: format(subDays(today, 30), 'yyyy-MM-dd'),
        date_to: format(today, 'yyyy-MM-dd'),
      };
    case 'thisMonth':
      return {
        date_from: format(startOfMonth(today), 'yyyy-MM-dd'),
        date_to: format(today, 'yyyy-MM-dd'),
      };
    case 'lastMonth':
      const lastMonth = subMonths(today, 1);
      return {
        date_from: format(startOfMonth(lastMonth), 'yyyy-MM-dd'),
        date_to: format(endOfMonth(lastMonth), 'yyyy-MM-dd'),
      };
    default:
      return {};
  }
}

// Helper to get sentiment display info
function getSentimentDisplay(score: number | null | undefined) {
  if (score == null) return null;
  if (score > 0.25) return { label: 'Positive', variant: 'success' as const, emoji: '😊', className: 'bg-emerald-100/80 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-500/30' };
  if (score < -0.25) return { label: 'Negative', variant: 'destructive' as const, emoji: '😟', className: 'bg-red-100/80 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200/50 dark:border-red-500/30' };
  return { label: 'Neutral', variant: 'secondary' as const, emoji: '😐', className: 'bg-gray-100/80 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400 border-gray-200/50 dark:border-gray-700/30' };
}

// Helper to format seconds as MM:SS
function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const SourceCard: React.FC<{ source: SearchSource; onClick: () => void }> = ({
  source,
  onClick,
}) => {
  const sentiment = getSentimentDisplay(source.sentiment_score);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl p-4 cursor-pointer border border-gray-200/50 dark:border-gray-700/30 hover:border-emerald-500/40 dark:hover:border-emerald-500/30 shadow-sm dark:shadow-lg dark:shadow-black/10 transition-all duration-300 group"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Title row with sentiment badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-medium text-gray-900 dark:text-white truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors duration-300">
              {source.title}
            </h4>
            {sentiment && (
              <Badge className={cn('text-xs py-0 px-1.5 font-normal', sentiment.className)}>
                {sentiment.emoji} {sentiment.label}
              </Badge>
            )}
          </div>

          {/* Metadata row */}
          <div className="flex items-center gap-2 mt-1.5 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
            <Calendar className="h-3.5 w-3.5" />
            <span>{source.date}</span>
            {source.timestamp_seconds != null && (
              <>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <Badge variant="outline" className="text-xs py-0 px-1.5 font-mono bg-blue-50/80 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200/50 dark:border-blue-500/30">
                  <Clock className="h-3 w-3 mr-1" />
                  {formatTimestamp(source.timestamp_seconds)}
                </Badge>
              </>
            )}
            {source.owner_name && (
              <>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <User className="h-3.5 w-3.5" />
                <span className="truncate">{source.owner_name}</span>
              </>
            )}
            {source.company_name && (
              <>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <Building2 className="h-3.5 w-3.5" />
                <span className="truncate">{source.company_name}</span>
              </>
            )}
          </div>

          {/* Snippet with speaker attribution */}
          {source.relevance_snippet && (
            <p className="mt-2.5 text-sm text-gray-600 dark:text-gray-300 line-clamp-2 bg-gray-50/50 dark:bg-gray-800/30 rounded-lg p-2 border border-gray-100 dark:border-gray-700/20">
              {source.speaker_name && (
                <span className="font-medium text-emerald-600 dark:text-emerald-400 mr-1">
                  {source.speaker_name}:
                </span>
              )}
              {source.relevance_snippet}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-2">
          {/* Fathom link button */}
          {source.fathom_share_url && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.open(source.fathom_share_url!, '_blank');
              }}
              className="p-1.5 rounded-lg bg-purple-100/80 dark:bg-purple-900/30 border border-purple-200/50 dark:border-purple-500/30 hover:bg-purple-200/80 dark:hover:bg-purple-900/50 transition-all duration-300"
              title="Watch in Fathom"
            >
              <ExternalLink className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </button>
          )}
          {/* View in app button */}
          <div className="p-1.5 rounded-lg bg-gray-100/80 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/30 group-hover:border-emerald-300/50 dark:group-hover:border-emerald-500/30 transition-all duration-300">
            <ExternalLink className="h-4 w-4 text-gray-400 group-hover:text-emerald-500 dark:group-hover:text-emerald-400 transition-colors duration-300 flex-shrink-0" />
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const StatusIndicator: React.FC<{
  indexed: number;
  total: number;
  status: string;
  onSync: () => void;
  isSyncing: boolean;
}> = ({ indexed, total, status, onSync, isSyncing }) => {
  const percentage = total > 0 ? Math.round((indexed / total) * 100) : 0;
  const isFullySynced = indexed === total && total > 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-3 bg-white/60 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl px-4 py-2.5 border border-gray-200/50 dark:border-gray-700/30 shadow-sm"
    >
      {/* Progress indicator */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="w-10 h-10 rounded-full bg-gray-100/80 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/30">
            <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
              <circle
                cx="18"
                cy="18"
                r="14"
                fill="none"
                className="stroke-gray-200/50 dark:stroke-gray-700/30"
                strokeWidth="3"
              />
              <circle
                cx="18"
                cy="18"
                r="14"
                fill="none"
                className="stroke-emerald-500"
                strokeWidth="3"
                strokeDasharray={`${percentage * 0.88} 88`}
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <Database className="h-4 w-4 text-emerald-500" />
          </div>
        </div>

        <div className="flex flex-col">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
            {indexed}/{total}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">indexed</span>
        </div>
      </div>

      {/* Status badges */}
      <div className="flex items-center gap-2">
        {isFullySynced && (
          <Badge className="bg-emerald-100/80 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-500/30 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
            Synced
          </Badge>
        )}
        {status === 'syncing' && (
          <Badge className="bg-blue-100/80 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200/50 dark:border-blue-500/30 font-medium">
            <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
            Syncing
          </Badge>
        )}
        {status === 'error' && (
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
        onClick={onSync}
        disabled={isSyncing || status === 'syncing'}
        className="h-9 gap-2 bg-white/80 dark:bg-gray-800/50 border-gray-200/50 dark:border-gray-700/30 hover:bg-emerald-50/80 dark:hover:bg-emerald-900/20 hover:border-emerald-300/50 dark:hover:border-emerald-500/30 hover:text-emerald-700 dark:hover:text-emerald-400 rounded-lg transition-all duration-300 dark:text-gray-200"
      >
        <RefreshCw className={cn('h-3.5 w-3.5', isSyncing && 'animate-spin')} />
        {isSyncing ? 'Indexing...' : 'Sync'}
      </Button>
    </motion.div>
  );
};

export default function MeetingIntelligence() {
  const navigate = useNavigate();
  const {
    search,
    results,
    isSearching,
    searchError,
    indexStatus,
    isLoadingStatus,
    triggerFullIndex,
    clearResults,
    recentQueries,
    // Team filter
    selectedUserId,
    setSelectedUserId,
    teamMembers,
    isLoadingTeam,
  } = useMeetingIntelligence();

  const [query, setQuery] = useState('');
  const [sentiment, setSentiment] = useState<string>('all');
  const [datePreset, setDatePreset] = useState<string>('allTime');
  const [hasActionItems, setHasActionItems] = useState<string>('all');
  const [isIndexing, setIsIndexing] = useState(false);

  // Handle search
  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;

    const filters: SearchFilters = {};

    if (sentiment !== 'all') {
      filters.sentiment = sentiment as 'positive' | 'negative' | 'neutral';
    }

    const dateRange = getDateRange(datePreset);
    if (dateRange.date_from) filters.date_from = dateRange.date_from;
    if (dateRange.date_to) filters.date_to = dateRange.date_to;

    if (hasActionItems !== 'all') {
      filters.has_action_items = hasActionItems === 'yes';
    }

    await search(query, filters);
  }, [query, sentiment, datePreset, hasActionItems, search]);

  // Handle key press (Enter to search)
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isSearching) {
      handleSearch();
    }
  };

  // Handle full index trigger
  const handleFullIndex = async () => {
    setIsIndexing(true);
    try {
      await triggerFullIndex();
    } finally {
      setIsIndexing(false);
    }
  };

  // Navigate to source detail
  const handleSourceClick = (source: SearchSource) => {
    if (source.source_type === 'call') {
      navigate(`/calls/${source.source_id}`);
      return;
    }
    navigate(`/meetings/${source.source_id}`);
  };

  // Use example query
  const handleExampleClick = (exampleQuery: string) => {
    setQuery(exampleQuery);
  };

  // Use recent query
  const handleRecentQueryClick = (recentQuery: string) => {
    setQuery(recentQuery);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header - Enhanced */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8"
        >
          <div className="flex items-center gap-4">
            {/* Glassmorphic icon */}
            <div className="w-14 h-14 rounded-2xl bg-gray-800 border border-gray-700/50 flex items-center justify-center">
              <Search className="h-7 w-7 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-bold">
                  <span className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 dark:from-white dark:via-gray-100 dark:to-white bg-clip-text text-transparent">
                    Meeting
                  </span>{' '}
                  <span className="bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 bg-clip-text text-transparent">
                    Intelligence
                  </span>
                </h1>
                <HelpPanel docSlug="customer-meeting-intelligence" tooltip="Meeting Intelligence help" />
              </div>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {selectedUserId === null
                    ? 'Search across all team conversations (meetings + calls) with AI'
                    : selectedUserId === 'me'
                    ? 'Search across your conversations (meetings + calls) with AI'
                    : `Search ${teamMembers.find(m => m.user_id === selectedUserId)?.full_name || 'team member'}'s conversations`}
                </p>
              </div>
            </div>
          </div>

          {!isLoadingStatus && (
            <StatusIndicator
              indexed={indexStatus.indexed}
              total={indexStatus.total}
              status={indexStatus.status}
              onSync={handleFullIndex}
              isSyncing={isIndexing}
            />
          )}
        </motion.div>

        {/* Search Bar - Enhanced */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <Card className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/30 shadow-lg dark:shadow-xl dark:shadow-black/10 rounded-2xl overflow-hidden">
            {/* Gradient accent top */}
            <div className="h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />
            <CardContent className="p-5">
              <div className="flex gap-3">
                <div className="relative flex-1 group">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 p-1 rounded-lg bg-gray-100/80 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/30 group-focus-within:border-emerald-500/30 group-focus-within:bg-emerald-50/50 dark:group-focus-within:bg-emerald-900/20 transition-all duration-300">
                    <Search className="h-4 w-4 text-gray-400 group-focus-within:text-emerald-500 transition-colors duration-300" />
                  </div>
                  <Input
                    type="text"
                    placeholder="Ask anything about your meetings..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyPress}
                    className="pl-14 h-14 text-base bg-gray-50/80 dark:bg-gray-800/50 border-gray-200/50 dark:border-gray-700/30 rounded-xl focus:border-emerald-500/50 dark:focus:border-emerald-500/30 focus:ring-2 focus:ring-emerald-500/20 transition-all duration-300"
                  />
                </div>
                <Button
                  size="lg"
                  onClick={handleSearch}
                  disabled={isSearching || !query.trim()}
                  className="h-14 px-8 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 !text-white dark:!text-white rounded-xl shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 font-medium"
                >
                  {isSearching ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <Zap className="h-5 w-5 mr-2" />
                      Search
                    </>
                  )}
                </Button>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-200/50 dark:border-gray-700/30">
                {/* Team Member Filter */}
                <Select
                  value={selectedUserId || 'all'}
                  onValueChange={(value) => setSelectedUserId(value === 'all' ? null : value)}
                >
                  <SelectTrigger className="w-auto min-w-[160px] h-9 px-3 bg-gray-50/80 dark:bg-gray-800/50 border-gray-200/50 dark:border-gray-700/30 rounded-lg hover:border-emerald-500/30 transition-all duration-300 whitespace-nowrap">
                    <SelectValue placeholder="Team member" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All team</SelectItem>
                    <SelectItem value="me">My meetings</SelectItem>
                    {!isLoadingTeam && teamMembers.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                          Team Members
                        </div>
                        {teamMembers.map((member) => (
                          <SelectItem key={member.user_id} value={member.user_id}>
                            {member.full_name}
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>

                <Select value={sentiment} onValueChange={setSentiment}>
                  <SelectTrigger className="w-auto min-w-[120px] h-9 px-3 bg-gray-50/80 dark:bg-gray-800/50 border-gray-200/50 dark:border-gray-700/30 rounded-lg hover:border-emerald-500/30 transition-all duration-300 whitespace-nowrap">
                    <SelectValue placeholder="Sentiment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any sentiment</SelectItem>
                    <SelectItem value="positive">Positive</SelectItem>
                    <SelectItem value="neutral">Neutral</SelectItem>
                    <SelectItem value="negative">Negative</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={datePreset} onValueChange={setDatePreset}>
                  <SelectTrigger className="w-auto min-w-[120px] h-9 px-3 bg-gray-50/80 dark:bg-gray-800/50 border-gray-200/50 dark:border-gray-700/30 rounded-lg hover:border-emerald-500/30 transition-all duration-300 whitespace-nowrap">
                    <SelectValue placeholder="Date range" />
                  </SelectTrigger>
                  <SelectContent>
                    {DATE_PRESETS.map((preset) => (
                      <SelectItem key={preset.value} value={preset.value}>
                        {preset.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={hasActionItems} onValueChange={setHasActionItems}>
                  <SelectTrigger className="w-auto min-w-[130px] h-9 px-3 bg-gray-50/80 dark:bg-gray-800/50 border-gray-200/50 dark:border-gray-700/30 rounded-lg hover:border-emerald-500/30 transition-all duration-300 whitespace-nowrap">
                    <SelectValue placeholder="Action items" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any actions</SelectItem>
                    <SelectItem value="yes">With actions</SelectItem>
                    <SelectItem value="no">No actions</SelectItem>
                  </SelectContent>
                </Select>

                {results && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearResults}
                    className="h-9 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100/80 dark:hover:bg-gray-800/50 rounded-lg transition-all duration-300"
                  >
                    Clear results
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Example Queries (shown when no results) */}
        {!results && !isSearching && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mb-8"
          >
            <div className="bg-white/60 dark:bg-gray-900/30 backdrop-blur-xl rounded-2xl p-5 border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 rounded-lg bg-gray-100/80 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/30">
                  <MessageSquare className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                </div>
                <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                  Example queries
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_QUERIES.map((example, index) => (
                  <motion.button
                    key={index}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 + index * 0.05 }}
                    onClick={() => handleExampleClick(example)}
                    className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 bg-white/80 dark:bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-200/50 dark:border-gray-700/30 hover:bg-emerald-50/80 dark:hover:bg-emerald-900/20 hover:text-emerald-700 dark:hover:text-emerald-400 hover:border-emerald-300/50 dark:hover:border-emerald-500/30 shadow-sm transition-all duration-300"
                  >
                    {example}
                  </motion.button>
                ))}
              </div>

              {/* Recent queries */}
              {recentQueries.length > 0 && (
                <div className="mt-5 pt-5 border-t border-gray-200/50 dark:border-gray-700/30">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 rounded-lg bg-gray-100/80 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/30">
                      <History className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    </div>
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                      Recent searches
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recentQueries.slice(0, 5).map((recentQuery, index) => (
                      <button
                        key={index}
                        onClick={() => handleRecentQueryClick(recentQuery)}
                        className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 bg-gray-50/80 dark:bg-gray-800/30 backdrop-blur-sm rounded-xl border border-gray-200/30 dark:border-gray-700/20 hover:bg-gray-100/80 dark:hover:bg-gray-800/50 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300/50 dark:hover:border-gray-600/30 shadow-sm transition-all duration-300"
                      >
                        {recentQuery}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Loading State - Enhanced */}
        <AnimatePresence>
          {isSearching && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-12"
            >
              <div className="bg-white/60 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/30 shadow-lg dark:shadow-xl dark:shadow-black/10 p-8">
                {/* Main animation container */}
                <div className="flex flex-col items-center justify-center">
                  {/* Animated icon with rings */}
                  <div className="relative mb-6">
                    {/* Outer ring */}
                    <motion.div
                      className="absolute inset-0 w-24 h-24 rounded-full border-2 border-emerald-500/20"
                      animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.2, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    />
                    {/* Middle ring */}
                    <motion.div
                      className="absolute inset-2 w-20 h-20 rounded-full border-2 border-emerald-500/30"
                      animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0.3, 0.6] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
                    />
                    {/* Inner ring */}
                    <motion.div
                      className="absolute inset-4 w-16 h-16 rounded-full border-2 border-emerald-500/40"
                      animate={{ scale: [1, 1.1, 1], opacity: [0.7, 0.4, 0.7] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
                    />
                    {/* Center icon */}
                    <div className="relative w-24 h-24 flex items-center justify-center">
                      <div className="absolute inset-4 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full blur-lg opacity-50" />
                      <motion.div
                        className="relative p-4 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full shadow-lg shadow-emerald-500/30"
                        animate={{ scale: [1, 1.05, 1] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                      >
                        <Search className="h-8 w-8 text-white" />
                      </motion.div>
                    </div>
                  </div>

                  {/* Loading text */}
                  <motion.h3
                    className="text-lg font-semibold text-gray-900 dark:text-white mb-2"
                    animate={{ opacity: [1, 0.7, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    Analyzing your meetings
                  </motion.h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                    AI is searching through your conversations...
                  </p>

                  {/* Progress steps */}
                  <div className="flex items-center gap-6 text-xs">
                    <motion.div
                      className="flex items-center gap-2"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0 }}
                    >
                      <motion.div
                        className="w-2 h-2 rounded-full bg-emerald-500"
                        animate={{ scale: [1, 1.3, 1] }}
                        transition={{ duration: 0.8, repeat: Infinity }}
                      />
                      <span className="text-gray-600 dark:text-gray-300">Searching</span>
                    </motion.div>
                    <motion.div
                      className="flex items-center gap-2"
                      initial={{ opacity: 0.4 }}
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 }}
                    >
                      <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" />
                      <span className="text-gray-400 dark:text-gray-500">Analyzing</span>
                    </motion.div>
                    <motion.div
                      className="flex items-center gap-2 opacity-40"
                    >
                      <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" />
                      <span className="text-gray-400 dark:text-gray-500">Generating</span>
                    </motion.div>
                  </div>
                </div>

                {/* Skeleton preview */}
                <div className="mt-8 pt-6 border-t border-gray-200/50 dark:border-gray-700/30">
                  <div className="space-y-3">
                    <div className="h-3 w-3/4 bg-gray-200/80 dark:bg-gray-700/50 rounded animate-pulse" />
                    <div className="h-3 w-full bg-gray-200/80 dark:bg-gray-700/50 rounded animate-pulse" />
                    <div className="h-3 w-5/6 bg-gray-200/80 dark:bg-gray-700/50 rounded animate-pulse" />
                    <div className="h-3 w-2/3 bg-gray-200/80 dark:bg-gray-700/50 rounded animate-pulse" />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error State */}
        {searchError && !isSearching && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <Card className="bg-red-50/80 dark:bg-red-900/20 backdrop-blur-xl border border-red-200/50 dark:border-red-800/30 shadow-sm dark:shadow-lg dark:shadow-black/10 rounded-2xl">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-xl bg-red-100/80 dark:bg-red-900/30 border border-red-200/50 dark:border-red-700/30">
                  <AlertCircle className="h-5 w-5 text-red-500 dark:text-red-400" />
                </div>
                <div>
                  <p className="font-medium text-red-700 dark:text-red-400">
                    Search failed
                  </p>
                  <p className="text-sm text-red-600 dark:text-red-300">
                    {searchError}
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Results */}
        <AnimatePresence>
          {results && !isSearching && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {/* AI Answer */}
              <Card className="mb-6 bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl border border-emerald-200/50 dark:border-emerald-500/20 shadow-lg dark:shadow-xl dark:shadow-emerald-900/10 rounded-2xl overflow-hidden">
                {/* Enhanced header with gradient accent */}
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-cyan-500/10 dark:from-emerald-500/5 dark:via-teal-500/5 dark:to-cyan-500/5" />
                  <CardHeader className="relative pb-4 border-b border-emerald-100/50 dark:border-emerald-500/10">
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl blur-lg opacity-40" />
                          <div className="relative p-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/25">
                            <MessageSquare className="h-5 w-5 text-white" />
                          </div>
                        </div>
                        <div>
                          <span className="text-lg font-semibold text-gray-900 dark:text-white">Response</span>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Insights from your meetings</p>
                        </div>
                      </div>
                    </CardTitle>
                  </CardHeader>
                </div>

                <CardContent className="pt-6 pb-5">
                  {/* Enhanced prose styling for markdown */}
                  <div className="prose prose-gray dark:prose-invert max-w-none
                    prose-headings:font-semibold prose-headings:text-gray-900 dark:prose-headings:text-white
                    prose-h1:text-xl prose-h1:mt-6 prose-h1:mb-4
                    prose-h2:text-lg prose-h2:mt-5 prose-h2:mb-3
                    prose-h3:text-base prose-h3:mt-4 prose-h3:mb-2
                    prose-p:text-gray-600 dark:prose-p:text-gray-300 prose-p:leading-relaxed prose-p:my-3
                    prose-strong:text-gray-900 dark:prose-strong:text-white prose-strong:font-semibold
                    prose-em:text-gray-700 dark:prose-em:text-gray-200
                    prose-ul:my-3 prose-ul:space-y-1.5
                    prose-ol:my-3 prose-ol:space-y-1.5
                    prose-li:text-gray-600 dark:prose-li:text-gray-300 prose-li:pl-1
                    prose-li:marker:text-emerald-500 dark:prose-li:marker:text-emerald-400
                    prose-blockquote:border-l-emerald-500 prose-blockquote:bg-emerald-50/50 dark:prose-blockquote:bg-emerald-900/10
                    prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:rounded-r-lg prose-blockquote:not-italic
                    prose-blockquote:text-gray-600 dark:prose-blockquote:text-gray-300
                    prose-code:text-emerald-600 dark:prose-code:text-emerald-400 prose-code:bg-emerald-50/80 dark:prose-code:bg-emerald-900/20
                    prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-sm prose-code:font-medium
                    prose-code:before:content-none prose-code:after:content-none
                    prose-pre:bg-gray-900 dark:prose-pre:bg-gray-950 prose-pre:rounded-xl prose-pre:shadow-lg
                    prose-a:text-emerald-600 dark:prose-a:text-emerald-400 prose-a:no-underline hover:prose-a:underline
                    prose-hr:border-gray-200/50 dark:prose-hr:border-gray-700/30
                  ">
                    <ReactMarkdown>{results.answer}</ReactMarkdown>
                  </div>

                  {/* Enhanced metadata footer */}
                  <div className="mt-6 pt-4 border-t border-gray-200/50 dark:border-gray-700/30">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100/80 dark:bg-gray-800/50 rounded-lg border border-gray-200/50 dark:border-gray-700/30">
                          <Clock className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                            {results.query_metadata.response_time_ms}ms
                          </span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100/80 dark:bg-gray-800/50 rounded-lg border border-gray-200/50 dark:border-gray-700/30">
                          <Database className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                            {results.query_metadata.meetings_searched} meetings
                          </span>
                        </div>
                      </div>
                      {/* Query indicator */}
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50/80 dark:bg-emerald-900/20 rounded-lg border border-emerald-200/50 dark:border-emerald-500/20">
                        <Search className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300 truncate max-w-[200px]">
                          "{results.query_metadata.query || query}"
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Sources - Enhanced */}
              {results.sources.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-white/60 dark:bg-gray-900/30 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10 overflow-hidden"
                >
                  {/* Sources header */}
                  <div className="px-5 py-4 border-b border-gray-200/50 dark:border-gray-700/30 bg-gray-50/50 dark:bg-gray-800/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-blue-100/80 dark:bg-blue-900/30 border border-blue-200/50 dark:border-blue-500/20">
                          <ExternalLink className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Sources</h3>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Click to view the full conversation</p>
                        </div>
                      </div>
                      <Badge className="bg-blue-100/80 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200/50 dark:border-blue-500/20">
                        {results.sources.length} found
                      </Badge>
                    </div>
                  </div>

                  {/* Sources list */}
                  <div className="p-4 space-y-3">
                    {results.sources.map((source, index) => (
                      <motion.div
                        key={`${source.source_type}:${source.source_id}`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 * index }}
                      >
                        <SourceCard
                          source={source}
                          onClick={() => handleSourceClick(source)}
                        />
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* No sources */}
              {results.sources.length === 0 && (
                <div className="text-center py-12 bg-white/60 dark:bg-gray-900/30 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10">
                  <div className="inline-flex p-3 rounded-xl bg-gray-100/80 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/30 mb-3">
                    <MessageSquare className="h-6 w-6 text-gray-400" />
                  </div>
                  <p className="text-gray-600 dark:text-gray-300 font-medium">No specific meeting sources found.</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Try a different query or make sure your meetings are indexed.
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty state when no meetings with transcripts */}
        {!results && !isSearching && indexStatus.total === 0 && !isLoadingStatus && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
          >
            <div className="bg-white/60 dark:bg-gray-900/30 backdrop-blur-xl rounded-2xl p-8 border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10 max-w-lg mx-auto">
              <div className="inline-flex p-4 rounded-2xl bg-gray-100/80 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/30 mb-5">
                <Database className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                No meetings with transcripts
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
                Connect your Fathom account and sync your meetings to enable AI-powered search
                across all your sales conversations. Meetings need transcripts to be searchable.
              </p>
              <div className="flex gap-3 justify-center">
                <Button
                  variant="outline"
                  onClick={() => navigate('/integrations')}
                  className="bg-white/80 dark:bg-gray-800/50 backdrop-blur-sm border-gray-200/50 dark:border-gray-700/30 hover:border-emerald-500/30 dark:text-white rounded-xl transition-all duration-300"
                >
                  Connect Fathom
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/meetings')}
                  className="bg-white/80 dark:bg-gray-800/50 backdrop-blur-sm border-gray-200/50 dark:border-gray-700/30 hover:border-emerald-500/30 dark:text-white rounded-xl transition-all duration-300"
                >
                  View Meetings
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* State when meetings exist but not yet indexed */}
        {!results && !isSearching && indexStatus.total > 0 && indexStatus.indexed === 0 && !isLoadingStatus && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
          >
            <div className="bg-white/60 dark:bg-gray-900/30 backdrop-blur-xl rounded-2xl p-8 border border-emerald-200/50 dark:border-emerald-500/20 shadow-sm dark:shadow-lg dark:shadow-black/10 max-w-lg mx-auto">
              <div className="inline-flex p-4 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30 border border-emerald-200/50 dark:border-emerald-500/30 mb-5">
                <Zap className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Ready to build your search index
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
                You have {indexStatus.total} meetings with transcripts. Build the AI search index
                to enable semantic search across all your conversations.
              </p>
              <Button
                onClick={triggerFullIndex}
                disabled={indexStatus.status === 'syncing'}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all duration-300 px-6"
              >
                {indexStatus.status === 'syncing' ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Building Index...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Build Search Index
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
