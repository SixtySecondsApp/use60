/**
 * Rep Scorecard View Component
 *
 * Displays coaching scorecard for a specific meeting including:
 * - Overall score and grade
 * - Metric scores breakdown
 * - Talk time analysis
 * - Checklist results
 * - Strengths and areas for improvement
 * - Coaching tips
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Award,
  Clock,
  MessageSquare,
  CheckSquare,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Star,
  Target,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMeetingScorecard } from '@/lib/hooks/useCoachingScorecard';
import { ScorecardMeetingLink } from './ScorecardMeetingLink';
import type { MeetingScorecard, ScorecardGrade } from '@/lib/types/meetingIntelligence';

interface RepScorecardViewProps {
  meetingId: string;
  className?: string;
  showGenerateButton?: boolean;
}

export function RepScorecardView({
  meetingId,
  className,
  showGenerateButton = true,
}: RepScorecardViewProps) {
  const { scorecard, loading, generating, error, generateScorecard } = useMeetingScorecard(meetingId);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['overview']));

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center p-8', className)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!scorecard) {
    return (
      <div className={cn('p-6 text-center', className)}>
        <Award className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-4">No scorecard available for this meeting.</p>
        {showGenerateButton && (
          <button
            onClick={() => generateScorecard()}
            disabled={generating}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Generate Scorecard
              </>
            )}
          </button>
        )}
        {error && <p className="text-destructive mt-2 text-sm">{error}</p>}
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Grade Badge */}
      <GradeBadge grade={scorecard.grade} score={scorecard.overall_score} />

      {/* Overview Section */}
      <CollapsibleSection
        title="Performance Overview"
        icon={Award}
        isExpanded={expandedSections.has('overview')}
        onToggle={() => toggleSection('overview')}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            label="Overall Score"
            value={`${scorecard.overall_score}%`}
            icon={Star}
            color={getScoreColor(scorecard.overall_score)}
          />
          <MetricCard
            label="Rep Talk Time"
            value={`${scorecard.talk_time_rep_pct}%`}
            icon={MessageSquare}
            color={getTalkTimeColor(scorecard.talk_time_rep_pct)}
            sublabel={scorecard.talk_time_rep_pct > 50 ? 'Too high' : 'Good'}
          />
          <MetricCard
            label="Discovery Questions"
            value={scorecard.discovery_questions_count.toString()}
            icon={MessageSquare}
            color={scorecard.discovery_questions_count >= 5 ? 'green' : 'yellow'}
          />
          <MetricCard
            label="Next Steps"
            value={scorecard.next_steps_established ? 'Yes' : 'No'}
            icon={Target}
            color={scorecard.next_steps_established ? 'green' : 'red'}
          />
        </div>
      </CollapsibleSection>

      {/* Metric Scores */}
      {Object.keys(scorecard.metric_scores).length > 0 && (
        <CollapsibleSection
          title="Metric Breakdown"
          icon={TrendingUp}
          isExpanded={expandedSections.has('metrics')}
          onToggle={() => toggleSection('metrics')}
        >
          <div className="space-y-3">
            {Object.entries(scorecard.metric_scores).map(([metricId, metric]) => (
              <MetricScoreBar
                key={metricId}
                name={metricId.replace(/_/g, ' ')}
                score={metric.score}
                weight={metric.weight}
                feedback={metric.feedback}
                meetingId={scorecard.meeting_id}
                skillName={metricId}
              />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Talk Time Analysis */}
      <CollapsibleSection
        title="Talk Time Analysis"
        icon={Clock}
        isExpanded={expandedSections.has('talktime')}
        onToggle={() => toggleSection('talktime')}
      >
        <div className="space-y-4">
          <TalkTimeBar
            repPct={scorecard.talk_time_rep_pct}
            customerPct={scorecard.talk_time_customer_pct}
          />
          {scorecard.monologue_count > 0 && (
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <p className="text-sm font-medium text-yellow-600">
                {scorecard.monologue_count} monologue(s) detected
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Speaking for more than 60 seconds without pause
              </p>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Checklist Results */}
      {Object.keys(scorecard.checklist_results).length > 0 && (
        <CollapsibleSection
          title={`Checklist (${Math.round(scorecard.checklist_completion_pct)}% complete)`}
          icon={CheckSquare}
          isExpanded={expandedSections.has('checklist')}
          onToggle={() => toggleSection('checklist')}
        >
          <div className="space-y-2">
            {Object.entries(scorecard.checklist_results).map(([itemId, result]) => (
              <ChecklistItem
                key={itemId}
                name={itemId.replace(/_/g, ' ')}
                covered={result.covered}
                quote={result.quote}
              />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Strengths & Improvements */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {scorecard.strengths.length > 0 && (
          <CollapsibleSection
            title="Strengths"
            icon={Star}
            isExpanded={expandedSections.has('strengths')}
            onToggle={() => toggleSection('strengths')}
            variant="compact"
          >
            <ul className="space-y-2">
              {scorecard.strengths.map((strength, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-green-500">✓</span>
                  {strength}
                </li>
              ))}
            </ul>
          </CollapsibleSection>
        )}

        {scorecard.areas_for_improvement.length > 0 && (
          <CollapsibleSection
            title="Areas to Improve"
            icon={AlertTriangle}
            isExpanded={expandedSections.has('improvements')}
            onToggle={() => toggleSection('improvements')}
            variant="compact"
          >
            <ul className="space-y-2">
              {scorecard.areas_for_improvement.map((area, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-yellow-500">→</span>
                  {area}
                </li>
              ))}
            </ul>
          </CollapsibleSection>
        )}
      </div>

      {/* Coaching Tips */}
      {scorecard.coaching_tips.length > 0 && (
        <CollapsibleSection
          title="Coaching Tips"
          icon={Lightbulb}
          isExpanded={expandedSections.has('tips')}
          onToggle={() => toggleSection('tips')}
        >
          <ul className="space-y-2">
            {scorecard.coaching_tips.map((tip, i) => (
              <li key={i} className="flex items-start gap-2 text-sm p-2 bg-blue-500/5 rounded">
                <Lightbulb className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                {tip}
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {/* Key Moments */}
      {scorecard.key_moments.length > 0 && (
        <CollapsibleSection
          title="Key Moments"
          icon={Star}
          isExpanded={expandedSections.has('moments')}
          onToggle={() => toggleSection('moments')}
        >
          <div className="space-y-2">
            {scorecard.key_moments.map((moment, i) => (
              <KeyMomentItem key={i} moment={moment} />
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}

// Sub-components

function GradeBadge({ grade, score }: { grade: ScorecardGrade; score: number }) {
  const gradeConfig = {
    A: { bg: 'bg-green-500', text: 'Excellent' },
    B: { bg: 'bg-blue-500', text: 'Good' },
    C: { bg: 'bg-yellow-500', text: 'Average' },
    D: { bg: 'bg-orange-500', text: 'Needs Work' },
    F: { bg: 'bg-red-500', text: 'Poor' },
  };

  const config = gradeConfig[grade];

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="flex items-center justify-center gap-4 p-6 rounded-lg bg-gradient-to-br from-muted/50 to-muted"
    >
      <div className={cn('w-20 h-20 rounded-full flex items-center justify-center text-white text-3xl font-bold', config.bg)}>
        {grade}
      </div>
      <div>
        <p className="text-2xl font-bold">{score}%</p>
        <p className="text-muted-foreground">{config.text}</p>
      </div>
    </motion.div>
  );
}

function CollapsibleSection({
  title,
  icon: Icon,
  isExpanded,
  onToggle,
  children,
  variant = 'default',
}: {
  title: string;
  icon: React.ElementType;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  variant?: 'default' | 'compact';
}) {
  return (
    <div className={cn('border rounded-lg overflow-hidden', variant === 'compact' && 'border-dashed')}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">{title}</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {isExpanded && <div className="p-4 pt-0">{children}</div>}
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  color,
  sublabel,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  color: 'green' | 'yellow' | 'red' | 'blue';
  sublabel?: string;
}) {
  const colorClasses = {
    green: 'bg-green-500/10 text-green-600',
    yellow: 'bg-yellow-500/10 text-yellow-600',
    red: 'bg-red-500/10 text-red-600',
    blue: 'bg-blue-500/10 text-blue-600',
  };

  return (
    <div className="p-3 rounded-lg bg-muted/50 text-center">
      <div className={cn('inline-flex p-2 rounded-full mb-2', colorClasses[color])}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {sublabel && <p className="text-xs text-muted-foreground">{sublabel}</p>}
    </div>
  );
}

function MetricScoreBar({
  name,
  score,
  weight,
  feedback,
  meetingId,
  skillName,
}: {
  name: string;
  score: number;
  weight: number;
  feedback?: string;
  meetingId?: string;
  skillName?: string;
}) {
  const isLowScore = score < 70;
  const scoreDisplay = <span className="font-medium">{Math.round(score)}%</span>;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="capitalize">{name}</span>
        {isLowScore && meetingId && skillName ? (
          <ScorecardMeetingLink
            meetingId={meetingId}
            skillName={skillName}
            score={score}
          >
            {scoreDisplay}
          </ScorecardMeetingLink>
        ) : (
          scoreDisplay
        )}
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            score >= 80 && 'bg-green-500',
            score >= 60 && score < 80 && 'bg-yellow-500',
            score < 60 && 'bg-red-500'
          )}
          style={{ width: `${score}%` }}
        />
      </div>
      {feedback && <p className="text-xs text-muted-foreground">{feedback}</p>}
    </div>
  );
}

function TalkTimeBar({ repPct, customerPct }: { repPct: number; customerPct: number }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span>Rep: {repPct}%</span>
        <span>Customer: {customerPct}%</span>
      </div>
      <div className="h-4 bg-muted rounded-full overflow-hidden flex">
        <div
          className={cn(
            'h-full transition-all',
            repPct <= 45 ? 'bg-green-500' : repPct <= 55 ? 'bg-yellow-500' : 'bg-red-500'
          )}
          style={{ width: `${repPct}%` }}
        />
        <div className="h-full bg-blue-500" style={{ width: `${customerPct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground text-center">
        {repPct <= 45 ? '✓ Ideal balance' : repPct <= 55 ? 'Slightly high' : '⚠️ Rep talking too much'}
      </p>
    </div>
  );
}

function ChecklistItem({ name, covered, quote }: { name: string; covered: boolean; quote?: string }) {
  return (
    <div className={cn(
      'flex items-start gap-2 p-2 rounded',
      covered ? 'bg-green-500/5' : 'bg-muted/50'
    )}>
      <span className={cn('mt-0.5', covered ? 'text-green-500' : 'text-muted-foreground')}>
        {covered ? '✓' : '○'}
      </span>
      <div className="flex-1">
        <p className={cn('text-sm capitalize', !covered && 'text-muted-foreground')}>{name}</p>
        {quote && <p className="text-xs text-muted-foreground italic mt-0.5">"{quote}"</p>}
      </div>
    </div>
  );
}

function KeyMomentItem({ moment }: { moment: { timestamp_seconds: number; type: string; description: string; quote?: string } }) {
  const typeConfig = {
    positive: { icon: TrendingUp, color: 'text-green-500', bg: 'bg-green-500/10' },
    negative: { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-500/10' },
    coaching: { icon: Lightbulb, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  };

  const config = typeConfig[moment.type as keyof typeof typeConfig] || typeConfig.coaching;
  const Icon = config.icon;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={cn('flex items-start gap-3 p-3 rounded-lg', config.bg)}>
      <Icon className={cn('h-4 w-4 mt-0.5', config.color)} />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{formatTime(moment.timestamp_seconds)}</span>
        </div>
        <p className="text-sm">{moment.description}</p>
        {moment.quote && (
          <p className="text-xs text-muted-foreground italic mt-1">"{moment.quote}"</p>
        )}
      </div>
    </div>
  );
}

function getScoreColor(score: number): 'green' | 'yellow' | 'red' {
  if (score >= 80) return 'green';
  if (score >= 60) return 'yellow';
  return 'red';
}

function getTalkTimeColor(pct: number): 'green' | 'yellow' | 'red' {
  if (pct <= 45) return 'green';
  if (pct <= 55) return 'yellow';
  return 'red';
}

export default RepScorecardView;
