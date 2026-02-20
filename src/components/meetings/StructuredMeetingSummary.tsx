/**
 * Structured Meeting Summary Component
 *
 * Displays extracted insights from meeting transcripts including:
 * - Key decisions
 * - Commitments (rep and prospect)
 * - Stakeholders mentioned
 * - Pricing discussions
 * - Technical requirements
 * - Outcome signals
 * - Stage indicators
 * - Competitor mentions
 * - Objections
 */

import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  AlertTriangle,
  Users,
  DollarSign,
  Wrench,
  TrendingUp,
  TrendingDown,
  Target,
  Shield,
  AlertCircle,
  ChevronRight,
  Loader2,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStructuredSummary } from '@/lib/hooks/useStructuredSummary';
import type { MeetingStructuredSummary } from '@/lib/types/meetingIntelligence';

interface StructuredMeetingSummaryProps {
  meetingId: string;
  className?: string;
  compact?: boolean;
  /** Callback when summary becomes available (used to hide generic summary in parent) */
  onSummaryReady?: (hasSummary: boolean) => void;
}

export function StructuredMeetingSummary({
  meetingId,
  className,
  compact = false,
  onSummaryReady,
}: StructuredMeetingSummaryProps) {
  const {
    summary,
    loading,
    processing,
    error,
    processSummary,
    hasForwardMovement,
    detectedStage,
  } = useStructuredSummary(meetingId);


  // Notify parent when summary is available
  useEffect(() => {
    onSummaryReady?.(!!summary);
  }, [summary, onSummaryReady]);

  if (loading || (!summary && processing)) {
    return (
      <div className={cn('flex items-center justify-center gap-3 p-8', className)}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          {processing ? 'Analyzing meeting...' : 'Loading...'}
        </span>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className={cn('p-4 text-center', className)}>
        {error && <p className="text-destructive text-sm mb-2">{error}</p>}
        <button
          onClick={() => processSummary()}
          disabled={processing}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
        >
          {processing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Target className="h-3.5 w-3.5" />
          )}
          {processing ? 'Analyzing...' : error ? 'Retry Analysis' : 'Analyze Meeting'}
        </button>
      </div>
    );
  }

  if (compact) {
    return <CompactSummary summary={summary} className={className} />;
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header with overall outcome */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <OutcomeIndicator outcome={summary.outcome_signals.overall} />
          <div>
            <h3 className="font-semibold">Meeting Analysis</h3>
            <p className="text-sm text-muted-foreground">
              Detected stage: <span className="capitalize">{detectedStage}</span>
              {summary.stage_indicators.confidence && (
                <span className="ml-1 text-xs">
                  ({Math.round(summary.stage_indicators.confidence * 100)}% confidence)
                </span>
              )}
            </p>
          </div>
        </div>
        {hasForwardMovement && (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-500/10 text-green-600 rounded text-sm">
            <TrendingUp className="h-3 w-3" />
            Forward Movement
          </span>
        )}
      </div>

      {/* Outcome Signals */}
      <OutcomeSignalsSection signals={summary.outcome_signals} />

      {/* Key Decisions */}
      {summary.key_decisions.length > 0 && (
        <Section title="Key Decisions" icon={CheckCircle2}>
          <div className="space-y-2">
            {summary.key_decisions.map((decision, i) => (
              <DecisionItem key={i} decision={decision} />
            ))}
          </div>
        </Section>
      )}

      {/* Commitments */}
      {(summary.rep_commitments.length > 0 || summary.prospect_commitments.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {summary.rep_commitments.length > 0 && (
            <Section title="Your Commitments" icon={Target} variant="compact">
              <ul className="space-y-1">
                {summary.rep_commitments.map((commitment, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <ChevronRight className="h-4 w-4 mt-0.5 text-muted-foreground" />
                    <span>{commitment.commitment}</span>
                    {commitment.due_date && (
                      <span className="text-xs text-muted-foreground">
                        (due: {commitment.due_date})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {summary.prospect_commitments.length > 0 && (
            <Section title="Prospect Commitments" icon={Users} variant="compact">
              <ul className="space-y-1">
                {summary.prospect_commitments.map((commitment, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <ChevronRight className="h-4 w-4 mt-0.5 text-muted-foreground" />
                    <span>{commitment.commitment}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}

      {/* Stakeholders */}
      {summary.stakeholders_mentioned.length > 0 && (
        <Section title="Stakeholders Mentioned" icon={Users}>
          <div className="flex flex-wrap gap-2">
            {summary.stakeholders_mentioned.map((stakeholder, i) => (
              <StakeholderBadge key={i} stakeholder={stakeholder} />
            ))}
          </div>
        </Section>
      )}

      {/* Pricing Discussion */}
      {summary.pricing_discussed.mentioned && (
        <Section title="Pricing Discussion" icon={DollarSign}>
          <PricingSection pricing={summary.pricing_discussed} />
        </Section>
      )}

      {/* Technical Requirements */}
      {summary.technical_requirements.length > 0 && (
        <Section title="Technical Requirements" icon={Wrench}>
          <div className="space-y-2">
            {summary.technical_requirements.map((req, i) => (
              <div key={i} className="flex items-start justify-between p-2 bg-muted/50 rounded">
                <span className="text-sm">{req.requirement}</span>
                <PriorityBadge priority={req.priority} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Competitor Mentions */}
      {summary.competitor_mentions.length > 0 && (
        <Section title="Competitors Mentioned" icon={Shield}>
          <div className="space-y-2">
            {summary.competitor_mentions.map((competitor, i) => (
              <CompetitorItem key={i} competitor={competitor} />
            ))}
          </div>
        </Section>
      )}

      {/* Objections */}
      {summary.objections.length > 0 && (
        <Section title="Objections" icon={AlertCircle}>
          <div className="space-y-2">
            {summary.objections.map((objection, i) => (
              <ObjectionItem key={i} objection={objection} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// Sub-components

function Section({
  title,
  icon: Icon,
  children,
  variant = 'default',
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  variant?: 'default' | 'compact';
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'rounded-lg border p-4',
        variant === 'compact' && 'p-3'
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h4 className="font-medium text-sm">{title}</h4>
      </div>
      {children}
    </motion.div>
  );
}

function OutcomeIndicator({ outcome }: { outcome: 'positive' | 'negative' | 'neutral' }) {
  const config = {
    positive: { icon: TrendingUp, color: 'text-green-500', bg: 'bg-green-500/10' },
    negative: { icon: TrendingDown, color: 'text-red-500', bg: 'bg-red-500/10' },
    neutral: { icon: Target, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  };

  const { icon: Icon, color, bg } = config[outcome];

  return (
    <div className={cn('p-2 rounded-full', bg)}>
      <Icon className={cn('h-5 w-5', color)} />
    </div>
  );
}

function OutcomeSignalsSection({ signals }: { signals: MeetingStructuredSummary['outcome_signals'] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {signals.positive_signals.length > 0 && (
        <div className="p-3 bg-green-500/5 border border-green-500/20 rounded-lg">
          <h5 className="text-sm font-medium text-green-600 mb-2 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            Positive Signals
          </h5>
          <ul className="space-y-1">
            {signals.positive_signals.map((signal, i) => (
              <li key={i} className="text-sm text-muted-foreground">• {signal}</li>
            ))}
          </ul>
        </div>
      )}
      {signals.negative_signals.length > 0 && (
        <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
          <h5 className="text-sm font-medium text-red-600 mb-2 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Concerns
          </h5>
          <ul className="space-y-1">
            {signals.negative_signals.map((signal, i) => (
              <li key={i} className="text-sm text-muted-foreground">• {signal}</li>
            ))}
          </ul>
        </div>
      )}
      {signals.next_steps.length > 0 && (
        <div className="md:col-span-2 p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
          <h5 className="text-sm font-medium text-blue-600 mb-2 flex items-center gap-1">
            <ArrowRight className="h-3 w-3" />
            Agreed Next Steps
          </h5>
          <ul className="space-y-1">
            {signals.next_steps.map((step, i) => (
              <li key={i} className="text-sm text-muted-foreground">• {step}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DecisionItem({ decision }: { decision: { decision: string; context: string; importance: string } }) {
  return (
    <div className="p-3 bg-muted/50 rounded-lg">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium">{decision.decision}</p>
        <PriorityBadge priority={decision.importance as any} />
      </div>
      {decision.context && (
        <p className="text-xs text-muted-foreground mt-1">{decision.context}</p>
      )}
    </div>
  );
}

function StakeholderBadge({ stakeholder }: { stakeholder: { name: string; role?: string; sentiment: string } }) {
  const sentimentColors = {
    positive: 'bg-green-500/10 text-green-600 border-green-500/20',
    neutral: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
    negative: 'bg-red-500/10 text-red-600 border-red-500/20',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs',
        sentimentColors[stakeholder.sentiment as keyof typeof sentimentColors]
      )}
    >
      <Users className="h-3 w-3" />
      {stakeholder.name}
      {stakeholder.role && <span className="text-muted-foreground">({stakeholder.role})</span>}
    </span>
  );
}

function PricingSection({ pricing }: { pricing: MeetingStructuredSummary['pricing_discussed'] }) {
  return (
    <div className="space-y-2">
      {pricing.amount && (
        <p className="text-sm">
          <span className="text-muted-foreground">Amount discussed:</span>{' '}
          <span className="font-medium">${pricing.amount.toLocaleString()}</span>
        </p>
      )}
      {pricing.structure && (
        <p className="text-sm">
          <span className="text-muted-foreground">Structure:</span> {pricing.structure}
        </p>
      )}
      {pricing.objections && pricing.objections.length > 0 && (
        <div>
          <p className="text-sm text-muted-foreground mb-1">Pricing concerns:</p>
          <ul className="list-disc list-inside text-sm">
            {pricing.objections.map((obj, i) => (
              <li key={i}>{obj}</li>
            ))}
          </ul>
        </div>
      )}
      {pricing.notes && (
        <p className="text-sm text-muted-foreground italic">{pricing.notes}</p>
      )}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: 'high' | 'medium' | 'low' }) {
  const colors = {
    high: 'bg-red-500/10 text-red-600',
    medium: 'bg-yellow-500/10 text-yellow-600',
    low: 'bg-green-500/10 text-green-600',
  };

  return (
    <span className={cn('px-2 py-0.5 rounded text-xs font-medium', colors[priority])}>
      {priority}
    </span>
  );
}

function CompetitorItem({ competitor }: { competitor: { name: string; context: string; sentiment: string } }) {
  return (
    <div className="p-2 bg-muted/50 rounded flex items-start justify-between">
      <div>
        <span className="font-medium text-sm">{competitor.name}</span>
        <p className="text-xs text-muted-foreground mt-0.5">{competitor.context}</p>
      </div>
      <span
        className={cn(
          'px-2 py-0.5 rounded text-xs',
          competitor.sentiment === 'positive' && 'bg-green-500/10 text-green-600',
          competitor.sentiment === 'neutral' && 'bg-gray-500/10 text-gray-600',
          competitor.sentiment === 'negative' && 'bg-red-500/10 text-red-600'
        )}
      >
        {competitor.sentiment}
      </span>
    </div>
  );
}

function ObjectionItem({ objection }: { objection: { objection: string; response?: string; resolved: boolean; category?: string } }) {
  return (
    <div className={cn(
      'p-3 rounded-lg border',
      objection.resolved ? 'bg-green-500/5 border-green-500/20' : 'bg-yellow-500/5 border-yellow-500/20'
    )}>
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium">{objection.objection}</p>
        <span className={cn(
          'px-2 py-0.5 rounded text-xs',
          objection.resolved ? 'bg-green-500/10 text-green-600' : 'bg-yellow-500/10 text-yellow-600'
        )}>
          {objection.resolved ? 'Resolved' : 'Open'}
        </span>
      </div>
      {objection.category && (
        <span className="text-xs text-muted-foreground">Category: {objection.category}</span>
      )}
      {objection.response && (
        <p className="text-xs text-muted-foreground mt-2">
          <span className="font-medium">Response:</span> {objection.response}
        </p>
      )}
    </div>
  );
}

function CompactSummary({ summary, className }: { summary: MeetingStructuredSummary; className?: string }) {
  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2">
        <OutcomeIndicator outcome={summary.outcome_signals.overall} />
        <div>
          <span className="text-sm font-medium capitalize">{summary.stage_indicators.detected_stage}</span>
          {summary.outcome_signals.forward_movement && (
            <span className="ml-2 text-xs text-green-600">✓ Forward movement</span>
          )}
        </div>
      </div>

      {summary.outcome_signals.next_steps.length > 0 && (
        <div className="text-sm">
          <span className="text-muted-foreground">Next steps:</span>{' '}
          {summary.outcome_signals.next_steps.slice(0, 2).join(', ')}
          {summary.outcome_signals.next_steps.length > 2 && (
            <span className="text-muted-foreground"> +{summary.outcome_signals.next_steps.length - 2} more</span>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        {summary.pricing_discussed.mentioned && (
          <span className="px-2 py-1 bg-blue-500/10 text-blue-600 rounded">💰 Pricing discussed</span>
        )}
        {summary.competitor_mentions.length > 0 && (
          <span className="px-2 py-1 bg-orange-500/10 text-orange-600 rounded">
            ⚔️ {summary.competitor_mentions.length} competitor(s)
          </span>
        )}
        {summary.objections.filter(o => !o.resolved).length > 0 && (
          <span className="px-2 py-1 bg-yellow-500/10 text-yellow-600 rounded">
            ⚠️ {summary.objections.filter(o => !o.resolved).length} open objection(s)
          </span>
        )}
      </div>
    </div>
  );
}

export default StructuredMeetingSummary;
