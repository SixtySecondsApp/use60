/**
 * CopilotTestPage - Platform Admin page for testing Copilot queries
 *
 * Features:
 * - Test runner for 30 predefined queries (easy/medium/hard)
 * - Real-time quality assessment
 * - Results dashboard with scoring
 * - Historical trend tracking
 */

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  FlaskConical,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Sparkles,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { BackToPlatform } from '@/components/platform/BackToPlatform';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/lib/contexts/AuthContext';
import { toast } from 'sonner';

// =============================================================================
// Types
// =============================================================================

interface TestQuery {
  id: string;
  query: string;
  difficulty: 'easy' | 'medium' | 'hard';
  category: string;
  expectedBehavior: string;
}

interface TestResult {
  queryId: string;
  query: string;
  difficulty: 'easy' | 'medium' | 'hard';
  response: string;
  executionTime: number;
  toolsUsed: string[];
  scores: {
    accuracy: number;
    completeness: number;
    relevance: number;
    actionability: number;
    speed: number;
  };
  overallScore: number;
  status: 'pass' | 'fail' | 'warning';
  issues: string[];
}

// =============================================================================
// Test Queries
// =============================================================================

const TEST_QUERIES: TestQuery[] = [
  // Easy Queries (10)
  { id: 'e1', query: 'What meetings do I have today?', difficulty: 'easy', category: 'Meetings', expectedBehavior: 'Return today\'s meetings or indicate none' },
  { id: 'e2', query: 'Show me my pipeline summary', difficulty: 'easy', category: 'Pipeline', expectedBehavior: 'Display pipeline metrics' },
  { id: 'e3', query: 'How many deals are closing this month?', difficulty: 'easy', category: 'Deals', expectedBehavior: 'Return count of deals closing this month' },
  { id: 'e4', query: 'What\'s my next meeting?', difficulty: 'easy', category: 'Meetings', expectedBehavior: 'Show next scheduled meeting' },
  { id: 'e5', query: 'List my recent activities', difficulty: 'easy', category: 'Activities', expectedBehavior: 'Display recent activity log' },
  { id: 'e6', query: 'Show deals at risk', difficulty: 'easy', category: 'Deals', expectedBehavior: 'List at-risk deals' },
  { id: 'e7', query: 'What tasks are overdue?', difficulty: 'easy', category: 'Tasks', expectedBehavior: 'Show overdue tasks' },
  { id: 'e8', query: 'Show my calendar for tomorrow', difficulty: 'easy', category: 'Calendar', expectedBehavior: 'Display tomorrow\'s schedule' },
  { id: 'e9', query: 'How many meetings did I have last week?', difficulty: 'easy', category: 'Meetings', expectedBehavior: 'Return meeting count' },
  { id: 'e10', query: 'List contacts I haven\'t contacted in 30 days', difficulty: 'easy', category: 'Contacts', expectedBehavior: 'Show stale contacts' },

  // Medium Queries (10)
  { id: 'm1', query: 'Prep me for my next meeting with talking points', difficulty: 'medium', category: 'Meeting Prep', expectedBehavior: 'Generate meeting prep with context' },
  { id: 'm2', query: 'Research Stripe and their key stakeholders', difficulty: 'medium', category: 'Research', expectedBehavior: 'Use web search, return company intel' },
  { id: 'm3', query: 'Draft a follow-up email to my last meeting attendee', difficulty: 'medium', category: 'Email', expectedBehavior: 'Generate contextual email draft' },
  { id: 'm4', query: 'Analyze my win/loss patterns this quarter', difficulty: 'medium', category: 'Analysis', expectedBehavior: 'Provide win/loss analysis' },
  { id: 'm5', query: 'What competitors should I know about for Acme Corp?', difficulty: 'medium', category: 'Research', expectedBehavior: 'Research and list competitors' },
  { id: 'm6', query: 'Summarize my pipeline health and forecast', difficulty: 'medium', category: 'Pipeline', expectedBehavior: 'Health summary with predictions' },
  { id: 'm7', query: 'Create a task to follow up on stale deals', difficulty: 'medium', category: 'Tasks', expectedBehavior: 'Create appropriate task' },
  { id: 'm8', query: 'Research industry trends for fintech', difficulty: 'medium', category: 'Research', expectedBehavior: 'Web search for trends' },
  { id: 'm9', query: 'Find contacts at companies in my pipeline', difficulty: 'medium', category: 'Contacts', expectedBehavior: 'Cross-reference pipeline and contacts' },
  { id: 'm10', query: 'Generate a morning brief for today', difficulty: 'medium', category: 'Brief', expectedBehavior: 'Comprehensive daily summary' },

  // Hard Queries (10)
  { id: 'h1', query: 'Create a full prospecting package for conturae.com', difficulty: 'hard', category: 'Prospecting', expectedBehavior: 'Research + outreach angles + draft' },
  { id: 'h2', query: 'Analyze my entire pipeline and identify at-risk deals with recovery suggestions', difficulty: 'hard', category: 'Analysis', expectedBehavior: 'Deep pipeline analysis' },
  { id: 'h3', query: 'Research my next 3 meetings and prepare talking points for each', difficulty: 'hard', category: 'Meeting Prep', expectedBehavior: 'Multi-meeting prep' },
  { id: 'h4', query: 'Build a competitive analysis comparing Stripe vs Square vs PayPal', difficulty: 'hard', category: 'Research', expectedBehavior: 'Multi-company comparison' },
  { id: 'h5', query: 'Create a sales sequence for following up with cold leads', difficulty: 'hard', category: 'Sequences', expectedBehavior: 'Multi-step sequence' },
  { id: 'h6', query: 'Generate a quarterly business review summary', difficulty: 'hard', category: 'Reports', expectedBehavior: 'Comprehensive QBR data' },
  { id: 'h7', query: 'Research and enrich all contacts from closing-soon deals', difficulty: 'hard', category: 'Enrichment', expectedBehavior: 'Batch enrichment' },
  { id: 'h8', query: 'Create personalized outreach for top 5 prospects with research backing', difficulty: 'hard', category: 'Outreach', expectedBehavior: 'Research + personalization' },
  { id: 'h9', query: 'Analyze meeting patterns and suggest optimal times', difficulty: 'hard', category: 'Analysis', expectedBehavior: 'Pattern analysis' },
  { id: 'h10', query: 'Generate a deal acceleration plan for my largest opportunity', difficulty: 'hard', category: 'Strategy', expectedBehavior: 'Strategic deal plan' },
];

// =============================================================================
// Main Component
// =============================================================================

export default function CopilotTestPage() {
  const { user } = useAuth();
  const [isRunning, setIsRunning] = useState(false);
  const [currentQuery, setCurrentQuery] = useState<string | null>(null);
  const [results, setResults] = useState<TestResult[]>([]);
  const [expandedDifficulty, setExpandedDifficulty] = useState<string | null>('easy');
  const [progress, setProgress] = useState(0);

  const runSingleTest = useCallback(async (testQuery: TestQuery): Promise<TestResult> => {
    const startTime = Date.now();

    try {
      // Call the Copilot API
      const response = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: testQuery.query }],
          stream: false,
        }),
      });

      const data = await response.json();
      const executionTime = Date.now() - startTime;

      // Extract response content
      const responseContent = data.content?.[0]?.text || data.message || JSON.stringify(data);
      const toolsUsed = data.tool_calls?.map((t: { name: string }) => t.name) || [];

      // Calculate scores (simplified scoring - in production use AI assessment)
      const hasContent = responseContent.length > 50;
      const hasActionable = responseContent.includes('action') ||
                           responseContent.includes('button') ||
                           responseContent.includes('click') ||
                           responseContent.includes('Open') ||
                           responseContent.includes('View');
      const isRelevant = !responseContent.toLowerCase().includes('error') &&
                        !responseContent.toLowerCase().includes('unable');
      const isFast = executionTime < 5000;

      const scores = {
        accuracy: hasContent && isRelevant ? 4 : 2,
        completeness: hasContent ? 4 : 2,
        relevance: isRelevant ? 5 : 2,
        actionability: hasActionable ? 4 : 3,
        speed: isFast ? 5 : executionTime < 10000 ? 3 : 1,
      };

      const overallScore = (
        scores.accuracy * 0.3 +
        scores.completeness * 0.25 +
        scores.relevance * 0.2 +
        scores.actionability * 0.15 +
        scores.speed * 0.1
      );

      const issues: string[] = [];
      if (!hasContent) issues.push('Response too short');
      if (!isRelevant) issues.push('May contain errors');
      if (!isFast) issues.push('Slow response time');

      return {
        queryId: testQuery.id,
        query: testQuery.query,
        difficulty: testQuery.difficulty,
        response: responseContent.slice(0, 500),
        executionTime,
        toolsUsed,
        scores,
        overallScore,
        status: overallScore >= 4 ? 'pass' : overallScore >= 3 ? 'warning' : 'fail',
        issues,
      };
    } catch (error) {
      return {
        queryId: testQuery.id,
        query: testQuery.query,
        difficulty: testQuery.difficulty,
        response: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        executionTime: Date.now() - startTime,
        toolsUsed: [],
        scores: { accuracy: 1, completeness: 1, relevance: 1, actionability: 1, speed: 1 },
        overallScore: 1,
        status: 'fail',
        issues: ['Request failed'],
      };
    }
  }, []);

  const runAllTests = useCallback(async () => {
    setIsRunning(true);
    setResults([]);
    setProgress(0);

    const newResults: TestResult[] = [];
    const total = TEST_QUERIES.length;

    for (let i = 0; i < TEST_QUERIES.length; i++) {
      const testQuery = TEST_QUERIES[i];
      setCurrentQuery(testQuery.query);

      const result = await runSingleTest(testQuery);
      newResults.push(result);
      setResults([...newResults]);
      setProgress(((i + 1) / total) * 100);

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setCurrentQuery(null);
    setIsRunning(false);
    toast.success(`Completed ${total} tests`);
  }, [runSingleTest]);

  const runDifficultyTests = useCallback(async (difficulty: 'easy' | 'medium' | 'hard') => {
    setIsRunning(true);
    const queries = TEST_QUERIES.filter(q => q.difficulty === difficulty);
    setProgress(0);

    const newResults: TestResult[] = results.filter(r => r.difficulty !== difficulty);
    const total = queries.length;

    for (let i = 0; i < queries.length; i++) {
      const testQuery = queries[i];
      setCurrentQuery(testQuery.query);

      const result = await runSingleTest(testQuery);
      newResults.push(result);
      setResults([...newResults]);
      setProgress(((i + 1) / total) * 100);

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setCurrentQuery(null);
    setIsRunning(false);
    toast.success(`Completed ${total} ${difficulty} tests`);
  }, [results, runSingleTest]);

  // Calculate stats
  const stats = {
    total: results.length,
    passed: results.filter(r => r.status === 'pass').length,
    warning: results.filter(r => r.status === 'warning').length,
    failed: results.filter(r => r.status === 'fail').length,
    avgScore: results.length > 0
      ? (results.reduce((acc, r) => acc + r.overallScore, 0) / results.length).toFixed(2)
      : '0.00',
    avgTime: results.length > 0
      ? Math.round(results.reduce((acc, r) => acc + r.executionTime, 0) / results.length)
      : 0,
  };

  const getResultsByDifficulty = (difficulty: 'easy' | 'medium' | 'hard') =>
    results.filter(r => r.difficulty === difficulty);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-700/50 px-6 py-6">
        <div className="max-w-7xl mx-auto">
          <BackToPlatform />
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-lg">
                <FlaskConical className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                  Copilot Test Suite
                </h1>
                <p className="text-gray-700 dark:text-gray-300 mt-1">
                  Test Copilot with 30 queries across easy, medium, and hard difficulty
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={runAllTests}
                disabled={isRunning}
                className="gap-2 bg-indigo-600 hover:bg-indigo-700"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Run All Tests
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      {isRunning && (
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700/50">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center gap-4">
              <Progress value={progress} className="flex-1" />
              <span className="text-sm text-gray-500 dark:text-gray-400 min-w-[60px]">
                {Math.round(progress)}%
              </span>
            </div>
            {currentQuery && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 truncate">
                Testing: {currentQuery}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Stats Summary */}
      {results.length > 0 && (
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-900/50">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              <StatCard label="Total Tests" value={stats.total} />
              <StatCard
                label="Passed"
                value={stats.passed}
                color="green"
                icon={<CheckCircle2 className="w-4 h-4" />}
              />
              <StatCard
                label="Warnings"
                value={stats.warning}
                color="yellow"
                icon={<AlertTriangle className="w-4 h-4" />}
              />
              <StatCard
                label="Failed"
                value={stats.failed}
                color="red"
                icon={<XCircle className="w-4 h-4" />}
              />
              <StatCard
                label="Avg Score"
                value={stats.avgScore}
                icon={<Sparkles className="w-4 h-4" />}
              />
              <StatCard
                label="Avg Time"
                value={`${stats.avgTime}ms`}
                icon={<Clock className="w-4 h-4" />}
              />
            </div>
          </div>
        </div>
      )}

      {/* Test Sections */}
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">
        {(['easy', 'medium', 'hard'] as const).map((difficulty) => (
          <DifficultySection
            key={difficulty}
            difficulty={difficulty}
            queries={TEST_QUERIES.filter(q => q.difficulty === difficulty)}
            results={getResultsByDifficulty(difficulty)}
            isExpanded={expandedDifficulty === difficulty}
            onToggle={() => setExpandedDifficulty(
              expandedDifficulty === difficulty ? null : difficulty
            )}
            onRun={() => runDifficultyTests(difficulty)}
            isRunning={isRunning}
          />
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Sub-Components
// =============================================================================

function StatCard({
  label,
  value,
  color,
  icon
}: {
  label: string;
  value: string | number;
  color?: 'green' | 'yellow' | 'red';
  icon?: React.ReactNode;
}) {
  const colorClasses = {
    green: 'text-green-600 dark:text-green-400',
    yellow: 'text-yellow-600 dark:text-yellow-400',
    red: 'text-red-600 dark:text-red-400',
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700/50">
      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-1">
        {icon}
        {label}
      </div>
      <div className={cn('text-2xl font-semibold', color && colorClasses[color])}>
        {value}
      </div>
    </div>
  );
}

function DifficultySection({
  difficulty,
  queries,
  results,
  isExpanded,
  onToggle,
  onRun,
  isRunning,
}: {
  difficulty: 'easy' | 'medium' | 'hard';
  queries: TestQuery[];
  results: TestResult[];
  isExpanded: boolean;
  onToggle: () => void;
  onRun: () => void;
  isRunning: boolean;
}) {
  const difficultyColors = {
    easy: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    hard: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };

  const passedCount = results.filter(r => r.status === 'pass').length;
  const totalCount = queries.length;

  return (
    <div className="bg-white dark:bg-gray-900/80 rounded-xl border border-gray-200 dark:border-gray-700/50 overflow-hidden">
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronRight className="w-5 h-5 text-gray-400" />
          )}
          <Badge className={difficultyColors[difficulty]}>
            {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
          </Badge>
          <span className="text-gray-900 dark:text-gray-100 font-medium">
            {totalCount} Queries
          </span>
          {results.length > 0 && (
            <span className="text-gray-500 dark:text-gray-400">
              ({passedCount}/{results.length} passed)
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onRun();
          }}
          disabled={isRunning}
          className="gap-2"
        >
          <Play className="w-3.5 h-3.5" />
          Run {difficulty}
        </Button>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-gray-200 dark:border-gray-700/50"
          >
            <div className="p-4 space-y-2">
              {queries.map((query) => {
                const result = results.find(r => r.queryId === query.id);
                return (
                  <QueryRow key={query.id} query={query} result={result} />
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function QueryRow({ query, result }: { query: TestQuery; result?: TestResult }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border border-gray-100 dark:border-gray-800 rounded-lg overflow-hidden">
      <div
        className={cn(
          'flex items-center justify-between p-3 cursor-pointer',
          'hover:bg-gray-50 dark:hover:bg-gray-800/30',
          result?.status === 'pass' && 'bg-green-50/50 dark:bg-green-900/10',
          result?.status === 'warning' && 'bg-yellow-50/50 dark:bg-yellow-900/10',
          result?.status === 'fail' && 'bg-red-50/50 dark:bg-red-900/10'
        )}
        onClick={() => result && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {result ? (
            result.status === 'pass' ? (
              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
            ) : result.status === 'warning' ? (
              <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-red-500 shrink-0" />
            )
          ) : (
            <div className="w-4 h-4 rounded-full border-2 border-gray-300 dark:border-gray-600 shrink-0" />
          )}
          <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
            {query.query}
          </span>
        </div>
        {result && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-500 dark:text-gray-400">
              {result.executionTime}ms
            </span>
            <Badge variant="outline" className="font-mono">
              {result.overallScore.toFixed(1)}/5
            </Badge>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isExpanded && result && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/20 p-4"
          >
            <div className="space-y-3 text-sm">
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">Response:</span>
                <p className="text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-wrap">
                  {result.response}
                </p>
              </div>
              {result.issues.length > 0 && (
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Issues:</span>
                  <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 mt-1">
                    {result.issues.map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400">
                <span>Accuracy: {result.scores.accuracy}/5</span>
                <span>Completeness: {result.scores.completeness}/5</span>
                <span>Relevance: {result.scores.relevance}/5</span>
                <span>Actionability: {result.scores.actionability}/5</span>
                <span>Speed: {result.scores.speed}/5</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
