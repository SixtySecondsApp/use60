/**
 * AIAutonomySettings (US-025)
 *
 * Settings section showing "AI Autonomy" with each action type displaying:
 *   - Current tier (disabled / suggest / approve / auto) with color coding
 *   - Confidence level / total signals
 *   - Approval count progress
 *   - Promotion eligibility status
 *
 * Queries autopilot_confidence for all action types for the current user.
 */

import {
  Shield,
  Loader2,
  AlertCircle,
  Zap,
  Eye,
  ShieldCheck,
  ShieldAlert,
  Ban,
  TrendingUp,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  useAllAutopilotConfidence,
  type AutopilotConfidence,
} from '@/lib/hooks/useAutopilotConfidence';

// ============================================================================
// Constants
// ============================================================================

const TIER_CONFIG: Record<
  string,
  {
    label: string;
    icon: typeof Shield;
    badgeCls: string;
    progressCls: string;
    description: string;
  }
> = {
  disabled: {
    label: 'Disabled',
    icon: Ban,
    badgeCls: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
    progressCls: '[&>div]:bg-gray-500',
    description: 'AI actions are turned off for this type',
  },
  suggest: {
    label: 'Suggest',
    icon: Eye,
    badgeCls: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    progressCls: '[&>div]:bg-blue-500',
    description: 'AI suggests actions for your review',
  },
  approve: {
    label: 'Approve',
    icon: ShieldAlert,
    badgeCls: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    progressCls: '[&>div]:bg-amber-500',
    description: 'AI drafts actions, you approve before execution',
  },
  auto: {
    label: 'Auto',
    icon: ShieldCheck,
    badgeCls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    progressCls: '[&>div]:bg-emerald-500',
    description: 'AI executes actions automatically',
  },
};

/** Human-readable labels for action types */
const ACTION_LABELS: Record<string, string> = {
  crm_field_update: 'CRM Field Updates',
  crm_stage_change: 'Deal Stage Changes',
  crm_note_add: 'CRM Notes',
  crm_contact_create: 'Contact Creation',
  email_draft: 'Email Drafts',
  email_send: 'Email Sending',
  task_create: 'Task Creation',
  meeting_prep: 'Meeting Prep',
  slack_post: 'Slack Posts',
  send_email: 'Email Sending',
  send_slack: 'Slack Messages',
  create_task: 'Task Creation',
  enrich_contact: 'Contact Enrichment',
  draft_proposal: 'Proposal Drafts',
};

/** Default threshold for auto-execute promotion */
const AUTO_THRESHOLD = 10;

/** Icon color per tier for the legend */
const TIER_ICON_COLOR: Record<string, string> = {
  auto: 'text-emerald-400',
  approve: 'text-amber-400',
  suggest: 'text-blue-400',
  disabled: 'text-gray-400',
};

// ============================================================================
// Tier progress visualization
// ============================================================================

const TIER_ORDER: string[] = ['disabled', 'suggest', 'approve', 'auto'];

const TIER_ACTIVE_COLOR: Record<string, string> = {
  auto: 'bg-emerald-500',
  approve: 'bg-amber-500',
  suggest: 'bg-blue-500',
  disabled: 'bg-gray-500',
};

function TierProgressBar({ currentTier }: { currentTier: string }): JSX.Element {
  const currentIdx = TIER_ORDER.indexOf(currentTier);

  return (
    <div className="flex items-center gap-1">
      {TIER_ORDER.map((tier, i) => {
        const isActive = i <= currentIdx;
        const config = TIER_CONFIG[tier];
        const bgCls = isActive ? (TIER_ACTIVE_COLOR[tier] ?? 'bg-gray-500') : 'bg-gray-800';
        return (
          <div key={tier} className="flex items-center gap-1">
            <div
              className={cn('h-1.5 w-8 rounded-full transition-colors', bgCls)}
              title={config?.label}
            />
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Action type card
// ============================================================================

function AutonomyItemCard({ item }: { item: AutopilotConfidence }): JSX.Element {
  const tier = item.current_tier || 'suggest';
  const config = TIER_CONFIG[tier] ?? TIER_CONFIG.suggest;
  const TierIcon = config.icon;
  const label = ACTION_LABELS[item.action_type] ?? item.action_type.replace(/_/g, ' ');
  const progress = Math.min((item.total_signals / AUTO_THRESHOLD) * 100, 100);
  const isAuto = tier === 'auto';
  const showProgress = !isAuto && !item.never_promote;
  const showPromotionBadge = item.promotion_eligible && !item.never_promote;
  const remaining = Math.max(0, AUTO_THRESHOLD - item.total_signals);

  return (
    <Card className="border border-gray-800 bg-gray-900/60">
      <CardContent className="p-4">
        {/* Top row: name + tier badge */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-100">{label}</span>
              <Badge
                variant="outline"
                className={cn('text-xs px-2 py-0 border font-medium', config.badgeCls)}
              >
                <TierIcon className="h-3 w-3 mr-1" />
                {config.label}
              </Badge>
              {item.never_promote && (
                <Badge
                  variant="outline"
                  className="text-xs px-2 py-0 border font-medium bg-gray-500/15 text-gray-400 border-gray-500/30"
                >
                  <Ban className="h-3 w-3 mr-1" />
                  Locked
                </Badge>
              )}
              {showPromotionBadge && (
                <Badge
                  variant="outline"
                  className="text-xs px-2 py-0 border font-medium bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  Ready to promote
                </Badge>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{config.description}</p>
          </div>

          <TierProgressBar currentTier={tier} />
        </div>

        {/* Stats row */}
        <div className="mt-3 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <div className="text-sm font-semibold text-gray-100">{item.total_signals}</div>
            <span className="text-xs text-gray-500">approvals</span>
          </div>

          {showProgress && (
            <div className="flex-1 min-w-[80px] max-w-[200px]">
              <Progress value={progress} className={cn('h-1.5', config.progressCls)} />
            </div>
          )}

          {showProgress && (
            <span className="text-xs text-gray-500">{remaining} more to auto</span>
          )}

          {isAuto && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400">
              <Zap className="h-3 w-3" />
              Auto-executing
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main component
// ============================================================================

export function AIAutonomySettings() {
  const { data: items, isLoading, isError, error, refetch } = useAllAutopilotConfidence();

  // Loading
  if (isLoading) {
    return (
      <Card className="border border-gray-800 bg-gray-900/60">
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex items-center gap-2.5">
            <Shield className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-100">AI Autonomy</span>
          </div>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8 gap-2 text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading autonomy settings...</span>
        </CardContent>
      </Card>
    );
  }

  // Error
  if (isError) {
    return (
      <Card className="border border-gray-800 bg-gray-900/60">
        <CardContent className="flex items-center gap-3 py-5 px-5">
          <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
          <p className="text-sm text-gray-400">
            Could not load autonomy settings: {(error as Error)?.message ?? 'Unknown error'}
          </p>
          <button
            onClick={() => refetch()}
            className="ml-auto text-xs text-violet-400 hover:text-violet-300 underline"
          >
            Retry
          </button>
        </CardContent>
      </Card>
    );
  }

  const confidenceItems = items ?? [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <Shield className="h-5 w-5 text-gray-400" />
        <div>
          <h2 className="text-lg font-semibold text-gray-100">AI Autonomy</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            See how the AI earns trust for each action type. More approvals unlock higher autonomy.
          </p>
        </div>
      </div>

      {/* Tier legend */}
      <div className="flex items-center gap-4 text-xs flex-wrap">
        {TIER_ORDER.map((tier) => {
          const config = TIER_CONFIG[tier];
          const Icon = config.icon;
          const iconColor = TIER_ICON_COLOR[tier] ?? 'text-gray-400';
          return (
            <div key={tier} className="flex items-center gap-1.5">
              <Icon className={cn('h-3.5 w-3.5', iconColor)} />
              <span className="text-gray-500">{config.label}</span>
            </div>
          );
        })}
      </div>

      {/* Action type cards */}
      {confidenceItems.length > 0 ? (
        <div className="space-y-3">
          {confidenceItems.map((item) => (
            <AutonomyItemCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <Card className="border border-gray-800 bg-gray-900/60">
          <CardContent className="py-8 text-center">
            <TrendingUp className="h-8 w-8 text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500">
              No autonomy data yet. As you approve AI actions, autonomy levels will build here.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default AIAutonomySettings;
