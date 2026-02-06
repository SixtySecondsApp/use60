/**
 * Result Comparison Component
 * 
 * LAB-006: Compare two query results side-by-side.
 * 
 * Features:
 * - Select two saved results to compare
 * - Side-by-side diff view
 * - Highlight structural differences
 * - Show timing comparison
 * 
 * @see docs/PRD_PROACTIVE_AI_TEAMMATE.md
 */

import { useState, useMemo } from 'react';
import {
  ArrowLeftRight,
  Clock,
  Zap,
  DollarSign,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  Minus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ============================================================================
// Types
// ============================================================================

interface ComparisonResult {
  id: string;
  name: string;
  prompt: string;
  response: string;
  structuredResponse?: any;
  responseType?: string;
  sequenceKey?: string;
  totalTime: number;
  tokenCount?: number;
  estimatedCost?: number;
  timestamp: string;
}

interface ResultComparisonProps {
  results: ComparisonResult[];
  onSelectResult?: (result: ComparisonResult) => void;
}

// ============================================================================
// Component
// ============================================================================

export function ResultComparison({ results, onSelectResult }: ResultComparisonProps) {
  const [leftResultId, setLeftResultId] = useState<string>('');
  const [rightResultId, setRightResultId] = useState<string>('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const leftResult = results.find(r => r.id === leftResultId);
  const rightResult = results.find(r => r.id === rightResultId);

  // Calculate differences
  const comparison = useMemo(() => {
    if (!leftResult || !rightResult) return null;

    return {
      timeDiff: rightResult.totalTime - leftResult.totalTime,
      timeDiffPercent: ((rightResult.totalTime - leftResult.totalTime) / leftResult.totalTime) * 100,
      tokenDiff: (rightResult.tokenCount || 0) - (leftResult.tokenCount || 0),
      costDiff: (rightResult.estimatedCost || 0) - (leftResult.estimatedCost || 0),
      sameResponseType: leftResult.responseType === rightResult.responseType,
      sameSequence: leftResult.sequenceKey === rightResult.sequenceKey,
    };
  }, [leftResult, rightResult]);

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ArrowLeftRight className="w-5 h-5" />
          Compare Results
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Result Selectors */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">
              Result A
            </label>
            <Select value={leftResultId} onValueChange={setLeftResultId}>
              <SelectTrigger>
                <SelectValue placeholder="Select result..." />
              </SelectTrigger>
              <SelectContent>
                {results.map(r => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">
              Result B
            </label>
            <Select value={rightResultId} onValueChange={setRightResultId}>
              <SelectTrigger>
                <SelectValue placeholder="Select result..." />
              </SelectTrigger>
              <SelectContent>
                {results.filter(r => r.id !== leftResultId).map(r => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Comparison View */}
        {leftResult && rightResult && comparison && (
          <div className="space-y-4">
            {/* Metrics Comparison */}
            <div className="grid grid-cols-3 gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <MetricComparison
                label="Latency"
                leftValue={`${(leftResult.totalTime / 1000).toFixed(2)}s`}
                rightValue={`${(rightResult.totalTime / 1000).toFixed(2)}s`}
                diff={comparison.timeDiff}
                diffLabel={`${comparison.timeDiff > 0 ? '+' : ''}${(comparison.timeDiff / 1000).toFixed(2)}s`}
                icon={Clock}
                lowerIsBetter
              />
              
              <MetricComparison
                label="Tokens"
                leftValue={leftResult.tokenCount?.toLocaleString() || '-'}
                rightValue={rightResult.tokenCount?.toLocaleString() || '-'}
                diff={comparison.tokenDiff}
                diffLabel={`${comparison.tokenDiff > 0 ? '+' : ''}${comparison.tokenDiff}`}
                icon={Zap}
                lowerIsBetter
              />
              
              <MetricComparison
                label="Cost"
                leftValue={leftResult.estimatedCost ? `$${leftResult.estimatedCost.toFixed(4)}` : '-'}
                rightValue={rightResult.estimatedCost ? `$${rightResult.estimatedCost.toFixed(4)}` : '-'}
                diff={comparison.costDiff}
                diffLabel={`${comparison.costDiff > 0 ? '+' : ''}$${Math.abs(comparison.costDiff).toFixed(4)}`}
                icon={DollarSign}
                lowerIsBetter
              />
            </div>

            {/* Response Type Comparison */}
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <span className="text-sm font-medium">Response Type</span>
              <div className="flex items-center gap-4">
                <Badge variant="outline">{leftResult.responseType || 'text'}</Badge>
                <span className="text-gray-400">vs</span>
                <Badge variant="outline">{rightResult.responseType || 'text'}</Badge>
                {comparison.sameResponseType ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <X className="w-4 h-4 text-amber-500" />
                )}
              </div>
            </div>

            {/* Sequence Comparison */}
            {(leftResult.sequenceKey || rightResult.sequenceKey) && (
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <span className="text-sm font-medium">Sequence</span>
                <div className="flex items-center gap-4">
                  <Badge variant="secondary">{leftResult.sequenceKey || 'none'}</Badge>
                  <span className="text-gray-400">vs</span>
                  <Badge variant="secondary">{rightResult.sequenceKey || 'none'}</Badge>
                  {comparison.sameSequence ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <X className="w-4 h-4 text-amber-500" />
                  )}
                </div>
              </div>
            )}

            {/* Response Content Comparison */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleSection('response')}
                className="w-full flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <span className="font-medium">Response Content</span>
                {expandedSections.response ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
              
              {expandedSections.response && (
                <div className="grid grid-cols-2 divide-x divide-gray-200 dark:divide-gray-700">
                  <div className="p-4">
                    <div className="text-xs text-gray-500 mb-2">Result A</div>
                    <div className="text-sm whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                      {leftResult.response}
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="text-xs text-gray-500 mb-2">Result B</div>
                    <div className="text-sm whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                      {rightResult.response}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Structured Data Comparison */}
            {(leftResult.structuredResponse || rightResult.structuredResponse) && (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection('structured')}
                  className="w-full flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <span className="font-medium">Structured Data</span>
                  {expandedSections.structured ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>
                
                {expandedSections.structured && (
                  <div className="grid grid-cols-2 divide-x divide-gray-200 dark:divide-gray-700">
                    <div className="p-4">
                      <div className="text-xs text-gray-500 mb-2">Result A</div>
                      <pre className="text-xs overflow-x-auto max-h-[300px]">
                        {JSON.stringify(leftResult.structuredResponse, null, 2)}
                      </pre>
                    </div>
                    <div className="p-4">
                      <div className="text-xs text-gray-500 mb-2">Result B</div>
                      <pre className="text-xs overflow-x-auto max-h-[300px]">
                        {JSON.stringify(rightResult.structuredResponse, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {(!leftResultId || !rightResultId) && (
          <div className="text-center py-8 text-gray-500">
            <ArrowLeftRight className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Select two results to compare</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

function MetricComparison({
  label,
  leftValue,
  rightValue,
  diff,
  diffLabel,
  icon: Icon,
  lowerIsBetter = false,
}: {
  label: string;
  leftValue: string;
  rightValue: string;
  diff: number;
  diffLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  lowerIsBetter?: boolean;
}) {
  const isBetter = lowerIsBetter ? diff < 0 : diff > 0;
  const isWorse = lowerIsBetter ? diff > 0 : diff < 0;
  const isSame = Math.abs(diff) < 0.001;

  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1 text-gray-500 mb-2">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="flex items-center justify-center gap-2 text-sm">
        <span className="font-mono">{leftValue}</span>
        <span className="text-gray-400">→</span>
        <span className="font-mono">{rightValue}</span>
      </div>
      <div className={cn(
        'text-xs mt-1 font-medium',
        isSame && 'text-gray-500',
        isBetter && 'text-green-600',
        isWorse && 'text-red-600'
      )}>
        {isSame ? (
          <span className="flex items-center justify-center gap-1">
            <Minus className="w-3 h-3" />
            Same
          </span>
        ) : (
          diffLabel
        )}
      </div>
    </div>
  );
}

export default ResultComparison;
