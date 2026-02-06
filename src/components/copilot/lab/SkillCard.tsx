/**
 * SkillCard Component
 *
 * Rich skill display with readiness status, capabilities, and "Try It" functionality.
 */

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  Settings,
  Clock,
  Zap,
  ChevronRight,
  ExternalLink,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { PlatformSkill } from '@/lib/services/platformSkillService';
import type { CapabilityStatus } from '@/lib/hooks/useOrgCapabilities';
import {
  evaluateReadiness,
  getCapabilityLabel,
  type ReadinessCheck,
  type Capability,
} from '@/lib/utils/skillReadiness';

interface SkillCardProps {
  skill: PlatformSkill;
  capabilities: CapabilityStatus[];
  variant?: 'default' | 'compact' | 'detailed';
  onTry?: (prompt: string) => void;
  onEdit?: () => void;
  onViewDetails?: () => void;
}

// Example prompts by skill pattern
const SKILL_EXAMPLE_PROMPTS: Record<string, string[]> = {
  'meeting-prep': [
    'Prep me for my next meeting',
    'What should I know before meeting [Company]?',
  ],
  'deal-rescue': [
    'Help me rescue [Deal Name]',
    'What deals need attention?',
  ],
  'pipeline': [
    'What\'s my pipeline looking like?',
    'Which deals are at risk?',
  ],
  'follow-up': [
    'What follow-ups am I missing?',
    'Draft a follow-up to [Contact]',
  ],
  'email': [
    'Draft an email to [Contact]',
    'Help me write a check-in message',
  ],
  'contact': [
    'Who is [Contact Name]?',
    'Brief me on [Company]',
  ],
  'forecast': [
    'What will close this month?',
    'How am I tracking to quota?',
  ],
  'daily': [
    'What should I focus on today?',
    'Run my daily focus workflow',
  ],
  default: [
    'Try this skill',
    'Test with sample data',
  ],
};

function getExamplePrompts(skill: PlatformSkill): string[] {
  const key = skill.skill_key.toLowerCase();
  for (const [pattern, prompts] of Object.entries(SKILL_EXAMPLE_PROMPTS)) {
    if (key.includes(pattern)) {
      return prompts;
    }
  }
  return SKILL_EXAMPLE_PROMPTS.default;
}

export function SkillCard({
  skill,
  capabilities,
  variant = 'default',
  onTry,
  onEdit,
  onViewDetails,
}: SkillCardProps) {
  const readiness = useMemo(
    () => evaluateReadiness(skill, capabilities),
    [skill, capabilities]
  );

  const examplePrompts = useMemo(() => getExamplePrompts(skill), [skill]);

  const isSequence = skill.category === 'agent-sequence';
  const requiredCapabilities = (skill.frontmatter.requires_capabilities ||
    []) as Capability[];
  const hasCapabilities =
    requiredCapabilities.length === 0 ||
    requiredCapabilities.every((cap) =>
      capabilities.find((c) => c.capability === cap && c.available)
    );

  // Compact variant for grids
  if (variant === 'compact') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={onViewDetails}
        className={cn(
          'bg-white dark:bg-gray-900/80 border rounded-lg p-4 cursor-pointer transition-all',
          'hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600',
          readiness.isReady
            ? 'border-gray-200 dark:border-gray-700/50'
            : 'border-amber-200 dark:border-amber-800/50'
        )}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-gray-900 dark:text-gray-100 truncate text-sm">
                {skill.frontmatter.name}
              </h4>
              {isSequence && (
                <Layers className="w-3.5 h-3.5 text-purple-500 shrink-0" />
              )}
            </div>
            <p className="text-xs text-gray-500 font-mono truncate mt-0.5">
              {skill.skill_key}
            </p>
          </div>
          {readiness.isReady ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          )}
        </div>
        <Progress
          value={readiness.score}
          className={cn(
            'h-1.5',
            readiness.score >= 80
              ? '[&>div]:bg-emerald-500'
              : readiness.score >= 50
              ? '[&>div]:bg-amber-500'
              : '[&>div]:bg-red-500'
          )}
        />
      </motion.div>
    );
  }

  // Detailed variant for expanded view
  if (variant === 'detailed') {
    return (
      <div className="bg-white dark:bg-gray-900/80 border border-gray-200 dark:border-gray-700/50 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {skill.frontmatter.name}
                </h3>
                {isSequence && (
                  <Badge
                    variant="outline"
                    className="bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800"
                  >
                    <Layers className="w-3 h-3 mr-1" />
                    Sequence
                  </Badge>
                )}
              </div>
              <p className="text-sm text-gray-500 font-mono">
                {skill.skill_key}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  readiness.isReady
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800'
                    : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800'
                )}
              >
                {readiness.isReady ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    Ready
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                    {readiness.score}% Ready
                  </>
                )}
              </Badge>
            </div>
          </div>
        </div>

        {/* Description */}
        {skill.frontmatter.description && (
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {skill.frontmatter.description}
            </p>
          </div>
        )}

        {/* What it does - for sequences */}
        {isSequence && skill.frontmatter.steps && (
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
              What It Does
            </h4>
            <div className="space-y-2">
              {(skill.frontmatter.steps as any[]).slice(0, 4).map((step, idx) => (
                <div key={idx} className="flex items-start gap-2 text-sm">
                  <div className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium shrink-0">
                    {idx + 1}
                  </div>
                  <span className="text-gray-600 dark:text-gray-400">
                    {step.description || step.name || `Step ${idx + 1}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Requirements */}
        {requiredCapabilities.length > 0 && (
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
              Requirements
            </h4>
            <div className="flex flex-wrap gap-2">
              {requiredCapabilities.map((cap) => {
                const capStatus = capabilities.find((c) => c.capability === cap);
                const isAvailable = capStatus?.available;
                return (
                  <Badge
                    key={cap}
                    variant="outline"
                    className={cn(
                      isAvailable
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800'
                        : 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'
                    )}
                  >
                    {isAvailable ? (
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                    ) : (
                      <XCircle className="w-3 h-3 mr-1" />
                    )}
                    {getCapabilityLabel(cap)}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}

        {/* Issues */}
        {readiness.issues.length > 0 && (
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
              Issues
            </h4>
            <div className="space-y-2">
              {readiness.issues.map((issue, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'flex items-start gap-2 text-sm px-3 py-2 rounded-lg',
                    issue.severity === 'error'
                      ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                      : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                  )}
                >
                  {issue.severity === 'error' ? (
                    <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <span>{issue.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Example Prompts */}
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
            Example Prompts
          </h4>
          <div className="space-y-2">
            {examplePrompts.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => onTry?.(prompt)}
                disabled={!hasCapabilities}
                className={cn(
                  'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors',
                  hasCapabilities
                    ? 'bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                    : 'bg-gray-50 dark:bg-gray-800/50 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                )}
              >
                <span className="truncate">{prompt}</span>
                <Play className="w-3.5 h-3.5 shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 py-4 bg-gray-50 dark:bg-gray-800/50 flex items-center gap-3">
          <Button
            onClick={() => onTry?.(examplePrompts[0])}
            disabled={!hasCapabilities}
            className="flex-1"
          >
            <Play className="w-4 h-4 mr-2" />
            Try It Now
          </Button>
          {onViewDetails && (
            <Button variant="outline" onClick={onViewDetails}>
              <ExternalLink className="w-4 h-4 mr-2" />
              View Details
            </Button>
          )}
          {onEdit && (
            <Button variant="ghost" size="icon" onClick={onEdit}>
              <Settings className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Default variant
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'bg-white dark:bg-gray-900/80 border rounded-xl p-5 transition-all',
        'hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600',
        readiness.isReady
          ? 'border-gray-200 dark:border-gray-700/50'
          : 'border-amber-200 dark:border-amber-800/50'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">
              {skill.frontmatter.name}
            </h3>
            {isSequence && (
              <Badge
                variant="outline"
                className="bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800 text-xs"
              >
                Sequence
              </Badge>
            )}
          </div>
          <p className="text-xs text-gray-500 font-mono mt-0.5">
            {skill.skill_key}
          </p>
        </div>
        <Badge
          variant="outline"
          className={cn(
            'shrink-0 text-xs',
            readiness.isReady
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400'
              : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400'
          )}
        >
          {readiness.score}%
        </Badge>
      </div>

      {/* Description */}
      {skill.frontmatter.description && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
          {skill.frontmatter.description}
        </p>
      )}

      {/* Progress */}
      <Progress
        value={readiness.score}
        className={cn(
          'h-1.5 mb-3',
          readiness.score >= 80
            ? '[&>div]:bg-emerald-500'
            : readiness.score >= 50
            ? '[&>div]:bg-amber-500'
            : '[&>div]:bg-red-500'
        )}
      />

      {/* Requirements badges */}
      {requiredCapabilities.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {requiredCapabilities.slice(0, 3).map((cap) => {
            const capStatus = capabilities.find((c) => c.capability === cap);
            const isAvailable = capStatus?.available;
            return (
              <Badge
                key={cap}
                variant="secondary"
                className={cn(
                  'text-xs',
                  isAvailable
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                )}
              >
                {isAvailable ? '✓' : '×'} {getCapabilityLabel(cap)}
              </Badge>
            );
          })}
          {requiredCapabilities.length > 3 && (
            <Badge variant="secondary" className="text-xs">
              +{requiredCapabilities.length - 3}
            </Badge>
          )}
        </div>
      )}

      {/* Example prompt */}
      <button
        onClick={() => onTry?.(examplePrompts[0])}
        disabled={!hasCapabilities}
        className={cn(
          'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors mb-3',
          hasCapabilities
            ? 'bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
            : 'bg-gray-50 dark:bg-gray-800/50 text-gray-400 dark:text-gray-500 cursor-not-allowed'
        )}
      >
        <span className="truncate">{examplePrompts[0]}</span>
        <Play className="w-3.5 h-3.5 shrink-0" />
      </button>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onViewDetails}
        >
          View Details
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </motion.div>
  );
}

export default SkillCard;
