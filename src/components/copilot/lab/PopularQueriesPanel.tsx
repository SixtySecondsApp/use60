/**
 * PopularQueriesPanel Component
 *
 * Displays trending queries with skill coverage indicators.
 * Highlights gaps (uncovered intents) with "Build Skill" actions.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp,
  Sparkles,
  Hammer,
  CheckCircle,
  XCircle,
  ChevronRight,
  Search,
  AlertTriangle,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { QueryIntent } from '@/lib/hooks/useQueryAnalytics';

interface PopularQueriesPanelProps {
  gaps: QueryIntent[] | undefined;
  trending: QueryIntent[] | undefined;
  isLoading?: boolean;
  timeRange: '7d' | '30d' | '90d';
  onTimeRangeChange: (range: '7d' | '30d' | '90d') => void;
  onBuildSkill?: (intent: QueryIntent) => void;
  onTryPrompt?: (prompt: string) => void;
  onRefresh?: () => void;
  className?: string;
}

const TIME_RANGE_LABELS = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
};

function QueryIntentCard({
  intent,
  onBuildSkill,
  onTryPrompt,
  showBuildAction = false,
}: {
  intent: QueryIntent;
  onBuildSkill?: (intent: QueryIntent) => void;
  onTryPrompt?: (prompt: string) => void;
  showBuildAction?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const exampleQuery = intent.example_queries?.[0] || intent.normalized_query;

  return (
    <motion.div
      layout
      className={cn(
        'border rounded-lg p-3 transition-colors',
        intent.is_covered
          ? 'border-green-200 dark:border-green-800/50 bg-green-50/50 dark:bg-green-900/10'
          : 'border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-900/10'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {intent.is_covered ? (
              <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            )}
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {exampleQuery}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              {intent.query_count}× asked
            </span>
            <Badge
              variant="secondary"
              className="text-xs capitalize"
            >
              {intent.intent_category.replace(/-/g, ' ')}
            </Badge>
            {intent.matched_skill_key && (
              <span className="text-green-600 dark:text-green-400 truncate max-w-[150px]">
                → {intent.matched_skill_key}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {showBuildAction && !intent.is_covered && onBuildSkill && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onBuildSkill(intent)}
              className="text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/30"
            >
              <Hammer className="w-3 h-3 mr-1" />
              Build
            </Button>
          )}
          {onTryPrompt && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onTryPrompt(exampleQuery)}
            >
              Try
              <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          )}
        </div>
      </div>

      {/* Expandable examples */}
      {intent.example_queries && intent.example_queries.length > 1 && (
        <>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            {isExpanded ? 'Hide' : 'Show'} {intent.example_queries.length - 1} more examples
          </button>
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-2 space-y-1 pl-6">
                  {intent.example_queries.slice(1).map((q, idx) => (
                    <p
                      key={idx}
                      className="text-xs text-gray-600 dark:text-gray-400"
                    >
                      "{q}"
                    </p>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </motion.div>
  );
}

export function PopularQueriesPanel({
  gaps,
  trending,
  isLoading,
  timeRange,
  onTimeRangeChange,
  onBuildSkill,
  onTryPrompt,
  onRefresh,
  className,
}: PopularQueriesPanelProps) {
  const [activeTab, setActiveTab] = useState<'gaps' | 'trending'>('gaps');

  const displayItems = activeTab === 'gaps' ? gaps : trending;
  const hasData = displayItems && displayItems.length > 0;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg">
            <TrendingUp className="w-4 h-4 text-white" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Query Analytics
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <Select value={timeRange} onValueChange={(v) => onTimeRangeChange(v as '7d' | '30d' | '90d')}>
            <SelectTrigger className="w-[130px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TIME_RANGE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {onRefresh && (
            <Button variant="ghost" size="icon" onClick={onRefresh} className="h-8 w-8">
              <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
            </Button>
          )}
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
        <button
          onClick={() => setActiveTab('gaps')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
            activeTab === 'gaps'
              ? 'bg-white dark:bg-gray-700 text-amber-700 dark:text-amber-300 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          )}
        >
          <AlertTriangle className="w-4 h-4" />
          Needs Skills ({gaps?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('trending')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
            activeTab === 'trending'
              ? 'bg-white dark:bg-gray-700 text-blue-700 dark:text-blue-300 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          )}
        >
          <Sparkles className="w-4 h-4" />
          All Trending ({trending?.length || 0})
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 bg-gray-100 dark:bg-gray-800/50 rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : hasData ? (
        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          <AnimatePresence mode="popLayout">
            {displayItems?.map((intent) => (
              <QueryIntentCard
                key={intent.id}
                intent={intent}
                onBuildSkill={onBuildSkill}
                onTryPrompt={onTryPrompt}
                showBuildAction={activeTab === 'gaps'}
              />
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="text-center py-8">
          <Search className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {activeTab === 'gaps' ? 'No skill gaps found!' : 'No query data yet'}
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {activeTab === 'gaps'
              ? 'Your skills are covering all detected intents'
              : 'Query analytics will appear as users interact with the copilot'}
          </p>
        </div>
      )}

      {/* Call to Action */}
      {activeTab === 'gaps' && hasData && onBuildSkill && (
        <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Build skills for popular queries to improve copilot coverage
          </p>
        </div>
      )}
    </div>
  );
}

export default PopularQueriesPanel;
