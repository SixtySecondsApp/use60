/**
 * Skills QA Page
 * 
 * Platform admin page for running QA tests on skills and sequences.
 * Validates contracts, execution, and capability requirements.
 */

import { useState, useEffect } from 'react';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useOrgCapabilities } from '@/lib/hooks/useOrgCapabilities';
import { usePlatformSkills } from '@/lib/hooks/usePlatformSkills';
import { runCategoryQA, generateQAReport, type QAResult } from '@/lib/utils/skillQAHarness';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, AlertCircle, Play, Loader2, FileCode, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { SKILL_CATEGORIES } from '@/lib/services/platformSkillService';

export default function SkillsQAPage() {
  const { activeOrgId } = useOrg();
  const { data: capabilities = [], isLoading: capabilitiesLoading } = useOrgCapabilities(activeOrgId);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [qaResults, setQaResults] = useState<QAResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [report, setReport] = useState<ReturnType<typeof generateQAReport> | null>(null);

  const runQA = async () => {
    if (!activeOrgId) {
      toast.error('No organization selected');
      return;
    }

    setIsRunning(true);
    setQaResults([]);
    setReport(null);

    try {
      const results: QAResult[] = [];

      if (selectedCategory === 'all') {
        // Run QA for all categories
        for (const category of SKILL_CATEGORIES) {
          if (category.value === 'agent-sequence') continue; // Skip sequences for now
          const categoryResults = await runCategoryQA(category.value, activeOrgId, capabilities);
          results.push(...categoryResults);
        }
      } else {
        // Run QA for selected category
        const categoryResults = await runCategoryQA(selectedCategory, activeOrgId, capabilities);
        results.push(...categoryResults);
      }

      setQaResults(results);
      setReport(generateQAReport(results));
      toast.success(`QA completed: ${results.filter(r => r.overall_status === 'pass').length}/${results.length} passed`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'QA test failed');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-700/50 px-6 py-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg">
                <FileCode className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                  Skills QA Testing
                </h1>
                <p className="text-gray-700 dark:text-gray-300 mt-1">
                  Validate skills and sequences against real org data
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                disabled={isRunning}
              >
                <option value="all">All Categories</option>
                {SKILL_CATEGORIES.filter(c => c.value !== 'agent-sequence').map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
              <Button
                onClick={runQA}
                disabled={isRunning || !activeOrgId || capabilitiesLoading}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Running QA...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Run QA Tests
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Report */}
      {report && (
        <div className="border-b border-gray-200 dark:border-gray-700/50 px-6 py-4">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-white dark:bg-gray-900/80 rounded-lg p-4 border border-gray-200 dark:border-gray-700/50">
                <div className="text-sm text-gray-600 dark:text-gray-400">Total</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{report.total}</div>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4 border border-emerald-200 dark:border-emerald-800">
                <div className="text-sm text-emerald-700 dark:text-emerald-400">Passed</div>
                <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{report.passed}</div>
              </div>
              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
                <div className="text-sm text-red-700 dark:text-red-400">Failed</div>
                <div className="text-2xl font-bold text-red-700 dark:text-red-400">{report.failed}</div>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
                <div className="text-sm text-amber-700 dark:text-amber-400">Warnings</div>
                <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{report.warnings}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {qaResults.length === 0 && !isRunning ? (
          <div className="text-center py-16">
            <FileCode className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              No QA results yet
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              Click "Run QA Tests" to validate skills and sequences
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {qaResults.map((result) => (
              <div
                key={result.skill_key}
                className={cn(
                  'bg-white dark:bg-gray-900/80 rounded-xl border p-6',
                  result.overall_status === 'pass'
                    ? 'border-emerald-200 dark:border-emerald-800'
                    : result.overall_status === 'fail'
                    ? 'border-red-200 dark:border-red-800'
                    : 'border-amber-200 dark:border-amber-800'
                )}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-gray-900 dark:text-gray-100">
                        {result.skill_name}
                      </h3>
                      <Badge variant="outline" className="text-xs">
                        {result.skill_key}
                      </Badge>
                      {result.is_sequence && (
                        <Badge variant="outline" className="text-xs">
                          <GitBranch className="w-3 h-3 mr-1" />
                          Sequence
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs',
                          result.overall_status === 'pass'
                            ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                            : result.overall_status === 'fail'
                            ? 'bg-red-100 text-red-700 border-red-300'
                            : 'bg-amber-100 text-amber-700 border-amber-300'
                        )}
                      >
                        {result.overall_status === 'pass' ? (
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                        ) : result.overall_status === 'fail' ? (
                          <XCircle className="w-3 h-3 mr-1" />
                        ) : (
                          <AlertCircle className="w-3 h-3 mr-1" />
                        )}
                        {result.overall_status.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Readiness: {result.readiness.score}% | Category: {result.category}
                    </div>
                  </div>
                </div>

                {/* Execution Test Results */}
                {result.execution_test && (
                  <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                      Execution Test
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">Status: </span>
                        <span className={result.execution_test.success ? 'text-emerald-600' : 'text-red-600'}>
                          {result.execution_test.success ? 'Success' : 'Failed'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">Time: </span>
                        {result.execution_test.execution_time_ms}ms
                      </div>
                      {result.is_sequence && result.execution_test.steps_total && (
                        <div>
                          <span className="text-gray-600 dark:text-gray-400">Steps: </span>
                          {result.execution_test.steps_completed}/{result.execution_test.steps_total}
                        </div>
                      )}
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">Providers: </span>
                        {result.execution_test.providers_used.join(', ') || 'None'}
                      </div>
                    </div>
                    {result.execution_test.error && (
                      <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                        Error: {result.execution_test.error}
                      </div>
                    )}
                  </div>
                )}

                {/* Contract Validation */}
                {result.contract_validation && (
                  <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                      Contract Validation
                    </div>
                    <div className="text-xs space-y-1">
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">Has Contract: </span>
                        {result.contract_validation.has_output_contract ? 'Yes' : 'No'}
                      </div>
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">Keys Match: </span>
                        <span className={result.contract_validation.output_keys_match ? 'text-emerald-600' : 'text-red-600'}>
                          {result.contract_validation.output_keys_match ? 'Yes' : 'No'}
                        </span>
                      </div>
                      {result.contract_validation.missing_keys.length > 0 && (
                        <div>
                          <span className="text-red-600">Missing: </span>
                          {result.contract_validation.missing_keys.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Readiness Issues */}
                {result.readiness.issues.length > 0 && (
                  <div className="mt-4">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                      Issues ({result.readiness.issues.length})
                    </div>
                    <ul className="space-y-1">
                      {result.readiness.issues.slice(0, 5).map((issue, idx) => (
                        <li
                          key={idx}
                          className={cn(
                            'text-xs',
                            issue.severity === 'error' ? 'text-red-600' : 'text-amber-600'
                          )}
                        >
                          {issue.severity === 'error' ? '●' : '○'} {issue.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
