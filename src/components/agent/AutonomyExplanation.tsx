/**
 * AutonomyExplanation — AE2-008 (Show Your Work)
 *
 * Collapsible inline card that shows a human-readable breakdown of
 * why the agent is operating at a given autonomy tier.
 *
 * Used in:
 *   - Command Centre item cards
 *   - Copilot approval prompts
 *
 * Receives ExplanationPayload as props (pure presentation, no API calls).
 */

import { useState } from 'react';
import {
  ChevronDown,
  Zap,
  ShieldCheck,
  Lightbulb,
  XCircle,
  AlertTriangle,
  Clock,
  TrendingDown,
  Target,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import {
  AutonomyFactorBar,
  type ExplanationFactor,
} from '@/components/agent/AutonomyFactorBar';

// =============================================================================
// Types (mirrors ExplanationPayload from autonomyExplainer.ts)
// =============================================================================

export interface NextMilestone {
  /** What the user needs to do */
  action: string;
  /** Specific metric or count needed */
  metric: string;
  /** How far along they are (0.0-1.0) */
  progress: number;
}

export type ExplanationTemplate =
  | 'auto_executing'
  | 'requesting_approval'
  | 'suggesting'
  | 'disabled'
  | 'context_escalation'
  | 'cooldown'
  | 'demotion';

export interface ExplanationPayload {
  /** Single-line summary for inline display */
  summary: string;
  /** Bullet-point factors for expanded view */
  factors: ExplanationFactor[];
  /** What it takes to promote to the next tier */
  next_milestone: NextMilestone | null;
  /** Recommended action for the user */
  recommendation: string;
  /** Template key */
  template: ExplanationTemplate;
}

export interface AutonomyExplanationProps {
  /** The structured explanation from the autonomy explainer */
  explanation: ExplanationPayload;
  /** Compact mode for smaller inline display (e.g. inside list items) */
  compact?: boolean;
  /** Additional class names */
  className?: string;
  /** Start expanded instead of collapsed */
  defaultOpen?: boolean;
}

// =============================================================================
// Template styling
// =============================================================================

interface TemplateConfig {
  icon: React.ElementType;
  badgeVariant: 'success' | 'default' | 'warning' | 'destructive' | 'secondary';
  badgeLabel: string;
  borderColor: string;
  iconColor: string;
}

const TEMPLATE_CONFIG: Record<ExplanationTemplate, TemplateConfig> = {
  auto_executing: {
    icon: Zap,
    badgeVariant: 'success',
    badgeLabel: 'Auto',
    borderColor: 'border-emerald-200/60 dark:border-emerald-800/30',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  requesting_approval: {
    icon: ShieldCheck,
    badgeVariant: 'default',
    badgeLabel: 'Approval',
    borderColor: 'border-blue-200/60 dark:border-blue-800/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  suggesting: {
    icon: Lightbulb,
    badgeVariant: 'warning',
    badgeLabel: 'Suggest',
    borderColor: 'border-yellow-200/60 dark:border-yellow-800/30',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
  },
  disabled: {
    icon: XCircle,
    badgeVariant: 'secondary',
    badgeLabel: 'Disabled',
    borderColor: 'border-gray-200/60 dark:border-gray-700/50',
    iconColor: 'text-gray-400 dark:text-gray-500',
  },
  context_escalation: {
    icon: AlertTriangle,
    badgeVariant: 'warning',
    badgeLabel: 'Escalated',
    borderColor: 'border-amber-200/60 dark:border-amber-800/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  cooldown: {
    icon: Clock,
    badgeVariant: 'destructive',
    badgeLabel: 'Cooldown',
    borderColor: 'border-red-200/60 dark:border-red-800/30',
    iconColor: 'text-red-600 dark:text-red-400',
  },
  demotion: {
    icon: TrendingDown,
    badgeVariant: 'destructive',
    badgeLabel: 'Demoted',
    borderColor: 'border-red-200/60 dark:border-red-800/30',
    iconColor: 'text-red-600 dark:text-red-400',
  },
};

// =============================================================================
// Next Milestone Callout
// =============================================================================

function MilestoneCallout({
  milestone,
  compact,
}: {
  milestone: NextMilestone;
  compact: boolean;
}) {
  const pct = Math.round(milestone.progress * 100);

  return (
    <div
      className={cn(
        'rounded-lg border border-blue-200/60 dark:border-blue-800/30',
        'bg-blue-50/50 dark:bg-blue-900/10',
        compact ? 'p-2' : 'p-3',
      )}
    >
      <div className="flex items-start gap-2">
        <Target
          className={cn(
            'flex-shrink-0 text-blue-600 dark:text-blue-400',
            compact ? 'h-3.5 w-3.5 mt-0' : 'h-4 w-4 mt-0.5',
          )}
        />
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              'font-medium text-blue-900 dark:text-blue-100',
              compact ? 'text-[11px]' : 'text-xs',
            )}
          >
            {milestone.action}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-1.5 rounded-full bg-blue-100 dark:bg-blue-900/40 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 dark:bg-blue-400 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400 flex-shrink-0">
              {milestone.metric}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function AutonomyExplanation({
  explanation,
  compact = false,
  className,
  defaultOpen = false,
}: AutonomyExplanationProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const config = TEMPLATE_CONFIG[explanation.template];
  const Icon = config.icon;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div
        className={cn(
          'rounded-lg border bg-white dark:bg-gray-900/50 transition-colors',
          config.borderColor,
          isOpen && 'ring-1 ring-gray-200/50 dark:ring-gray-700/30',
          className,
        )}
      >
        {/* Collapsed trigger row */}
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              'w-full flex items-center gap-2 text-left transition-colors',
              'hover:bg-gray-50/50 dark:hover:bg-gray-800/30 rounded-lg',
              compact ? 'px-2.5 py-1.5' : 'px-3 py-2.5',
            )}
            aria-label="Show autonomy explanation"
          >
            <Icon
              className={cn(
                'flex-shrink-0',
                config.iconColor,
                compact ? 'h-3.5 w-3.5' : 'h-4 w-4',
              )}
            />

            <span
              className={cn(
                'flex-1 min-w-0 truncate text-gray-700 dark:text-gray-300',
                compact ? 'text-[11px]' : 'text-xs',
              )}
            >
              {explanation.summary}
            </span>

            <Badge
              variant={config.badgeVariant}
              className={cn(
                'flex-shrink-0',
                compact && 'text-[10px] px-1.5 py-0',
              )}
            >
              {config.badgeLabel}
            </Badge>

            <ChevronDown
              className={cn(
                'flex-shrink-0 text-gray-400 dark:text-gray-500 transition-transform duration-200',
                compact ? 'h-3 w-3' : 'h-3.5 w-3.5',
                isOpen && 'rotate-180',
              )}
            />
          </button>
        </CollapsibleTrigger>

        {/* Expanded content */}
        <CollapsibleContent>
          <div
            className={cn(
              'border-t border-gray-100 dark:border-gray-800',
              compact ? 'px-2.5 py-2 space-y-2' : 'px-3 py-3 space-y-3',
            )}
          >
            {/* Factor bars */}
            {explanation.factors.length > 0 && (
              <div className="space-y-0.5">
                {explanation.factors.map((factor) => (
                  <AutonomyFactorBar
                    key={factor.label}
                    factor={factor}
                    compact={compact}
                  />
                ))}
              </div>
            )}

            {/* Next milestone callout */}
            {explanation.next_milestone && (
              <MilestoneCallout
                milestone={explanation.next_milestone}
                compact={compact}
              />
            )}

            {/* Recommendation */}
            {explanation.recommendation && (
              <div className="flex items-start gap-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info
                      className={cn(
                        'flex-shrink-0 text-gray-400 dark:text-gray-500 mt-0.5',
                        compact ? 'h-3 w-3' : 'h-3.5 w-3.5',
                      )}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <span className="text-xs">Agent recommendation</span>
                  </TooltipContent>
                </Tooltip>
                <p
                  className={cn(
                    'text-gray-500 dark:text-gray-400 leading-relaxed',
                    compact ? 'text-[11px]' : 'text-xs',
                  )}
                >
                  {explanation.recommendation}
                </p>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
