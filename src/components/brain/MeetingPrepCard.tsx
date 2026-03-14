/**
 * MeetingPrepCard — 30-second glanceable prep before meetings
 *
 * Compact card with blue gradient left border. Shows meeting title, countdown,
 * contact info with relationship strength bar, and template-based bullet points
 * derived from Brain memory (no LLM call).
 *
 * Auto-hides after meeting start time passes and only renders when a meeting
 * is within 90 minutes.
 *
 * NL-003
 */

import { useMemo } from 'react';
import {
  Calendar,
  Clock,
  MessageSquare,
  Users,
  AlertCircle,
  Lightbulb,
  User,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  useUpcomingMeetingPrep,
  type UpcomingMeetingPrep,
} from '@/lib/hooks/useUpcomingMeetingPrep';

// ============================================================================
// Helpers
// ============================================================================

/** Build a display name from contact info */
function contactDisplayName(contact: { first_name: string | null; last_name: string | null }): string {
  const parts = [contact.first_name, contact.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Unknown Contact';
}

/** Extract a human-readable tone hint from communication_style JSONB */
function extractToneHint(style: Record<string, unknown> | null): string | null {
  if (!style) return null;

  // communication_style may contain keys like "formality", "tone", "preferred_tone", etc.
  const formality = style.formality as string | undefined;
  const tone = (style.tone ?? style.preferred_tone ?? style.style) as string | undefined;

  if (formality) {
    const normalized = formality.toLowerCase();
    if (normalized.includes('formal')) return 'formal';
    if (normalized.includes('casual') || normalized.includes('informal')) return 'casual';
    if (normalized.includes('direct')) return 'direct';
    return normalized;
  }

  if (tone) {
    return tone.toLowerCase();
  }

  return null;
}

/** Colour for the relationship strength bar segment */
function strengthBarColor(strength: number): string {
  if (strength >= 0.7) return 'bg-emerald-500';
  if (strength >= 0.4) return 'bg-amber-500';
  return 'bg-red-500';
}

/** Text colour matching strength level */
function strengthTextColor(strength: number): string {
  if (strength >= 0.7) return 'text-emerald-600 dark:text-emerald-400';
  if (strength >= 0.4) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

/** Colour for sentiment dot */
function sentimentDotColor(score: number): string {
  if (score >= 0.3) return 'bg-emerald-500';
  if (score >= 0) return 'bg-amber-500';
  return 'bg-red-500';
}

/** Human-friendly sentiment label */
function sentimentLabel(score: number): string {
  if (score >= 0.5) return 'Very positive';
  if (score >= 0.2) return 'Positive';
  if (score >= -0.2) return 'Neutral';
  if (score >= -0.5) return 'Negative';
  return 'Very negative';
}

// ============================================================================
// Build bullet points (template-based, no LLM)
// ============================================================================

interface PrepBullet {
  icon: typeof MessageSquare;
  text: string;
  iconClassName: string;
}

function buildBullets(prep: UpcomingMeetingPrep): PrepBullet[] {
  const bullets: PrepBullet[] = [];

  // 1. Style hint from communication_style
  const tone = extractToneHint(prep.communicationStyle);
  if (tone) {
    bullets.push({
      icon: MessageSquare,
      text: `Prefers ${tone} tone`,
      iconClassName: 'text-blue-500 dark:text-blue-400',
    });
  }

  // 2. Most recent pending commitment
  if (prep.commitments.length > 0) {
    const latest = prep.commitments[0];
    const summary =
      latest.summary.length > 80
        ? latest.summary.slice(0, 77) + '...'
        : latest.summary;
    bullets.push({
      icon: Users,
      text: `You promised: ${summary}`,
      iconClassName: 'text-amber-500 dark:text-amber-400',
    });
  }

  // 3. Last meeting sentiment
  if (prep.lastSentiment !== null) {
    bullets.push({
      icon: AlertCircle,
      text: `Last meeting sentiment: ${sentimentLabel(prep.lastSentiment)}`,
      iconClassName:
        prep.lastSentiment >= 0.2
          ? 'text-emerald-500 dark:text-emerald-400'
          : prep.lastSentiment >= -0.2
            ? 'text-amber-500 dark:text-amber-400'
            : 'text-red-500 dark:text-red-400',
    });
  }

  // 4. Suggested opener based on context
  if (prep.objections.length > 0) {
    const objTopic =
      prep.objections[0].summary.length > 60
        ? prep.objections[0].summary.slice(0, 57) + '...'
        : prep.objections[0].summary;
    bullets.push({
      icon: Lightbulb,
      text: `Ask about: ${objTopic}`,
      iconClassName: 'text-purple-500 dark:text-purple-400',
    });
  } else if (prep.commitments.length > 1) {
    const followUp =
      prep.commitments[1].summary.length > 60
        ? prep.commitments[1].summary.slice(0, 57) + '...'
        : prep.commitments[1].summary;
    bullets.push({
      icon: Lightbulb,
      text: `Follow up on: ${followUp}`,
      iconClassName: 'text-purple-500 dark:text-purple-400',
    });
  }

  return bullets;
}

// ============================================================================
// Simplified card (no Brain memory for contact)
// ============================================================================

function SimplifiedPrepCard({ prep }: { prep: UpcomingMeetingPrep }) {
  const isUrgent = prep.minutesUntil < 30;

  return (
    <Card className="relative overflow-hidden border-l-4 border-l-blue-500 bg-white dark:bg-gray-900/80 border-slate-200 dark:border-gray-700/50">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Calendar className="h-4 w-4 text-blue-500 shrink-0" />
            <span className="text-sm font-medium text-slate-700 dark:text-gray-200 truncate">
              {prep.meeting.title}
            </span>
          </div>
          <Badge
            variant="secondary"
            className={cn(
              'shrink-0 gap-1 text-xs font-medium',
              isUrgent
                ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20'
                : 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20'
            )}
          >
            <Clock className="h-3 w-3" />
            in {prep.minutesUntil} min
          </Badge>
        </div>
      </div>
    </Card>
  );
}

// ============================================================================
// Full prep card
// ============================================================================

function FullPrepCard({ prep }: { prep: UpcomingMeetingPrep }) {
  const isUrgent = prep.minutesUntil < 30;
  const bullets = useMemo(() => buildBullets(prep), [prep]);

  return (
    <Card className="relative overflow-hidden border-l-4 border-l-blue-500 bg-white dark:bg-gray-900/80 border-slate-200 dark:border-gray-700/50">
      <div className="px-4 py-3 space-y-3">
        {/* Header: title + countdown badge */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Calendar className="h-4 w-4 text-blue-500 shrink-0" />
            <span className="text-sm font-medium text-slate-700 dark:text-gray-200 truncate">
              {prep.meeting.title}
            </span>
          </div>
          <Badge
            variant="secondary"
            className={cn(
              'shrink-0 gap-1 text-xs font-medium',
              isUrgent
                ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20'
                : 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20'
            )}
          >
            <Clock className="h-3 w-3" />
            in {prep.minutesUntil} min
          </Badge>
        </div>

        {/* Contact row + relationship strength bar */}
        {prep.contact && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 min-w-0">
              <User className="h-3.5 w-3.5 text-slate-400 dark:text-gray-500 shrink-0" />
              <span className="text-sm text-slate-600 dark:text-gray-300 truncate">
                {contactDisplayName(prep.contact)}
              </span>
              {prep.contact.title && (
                <span className="text-xs text-slate-400 dark:text-gray-500 truncate hidden sm:inline">
                  {prep.contact.title}
                </span>
              )}
            </div>

            {/* Strength mini bar */}
            {prep.strength !== null && (
              <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                <div className="w-16 h-1.5 rounded-full bg-slate-100 dark:bg-gray-700 overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      strengthBarColor(prep.strength)
                    )}
                    style={{ width: `${Math.round(prep.strength * 100)}%` }}
                  />
                </div>
                <span
                  className={cn(
                    'text-[11px] tabular-nums font-medium',
                    strengthTextColor(prep.strength)
                  )}
                >
                  {Math.round(prep.strength * 100)}%
                </span>
              </div>
            )}
          </div>
        )}

        {/* Bullet points */}
        {bullets.length > 0 && (
          <div className="space-y-1.5">
            {bullets.map((bullet, i) => {
              const Icon = bullet.icon;
              return (
                <div key={i} className="flex items-start gap-2">
                  <Icon
                    className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', bullet.iconClassName)}
                  />
                  <span className="text-xs text-slate-600 dark:text-gray-400 leading-relaxed">
                    {bullet.text}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Sentiment dot (inline with last bullet or standalone) */}
        {prep.lastSentiment !== null && bullets.length === 0 && (
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'w-2 h-2 rounded-full shrink-0',
                sentimentDotColor(prep.lastSentiment)
              )}
            />
            <span className="text-xs text-slate-500 dark:text-gray-400">
              Last sentiment: {sentimentLabel(prep.lastSentiment)}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}

// ============================================================================
// Exported component
// ============================================================================

export default function MeetingPrepCard() {
  const { data: prep, isLoading } = useUpcomingMeetingPrep();

  // Don't render anything while loading or when there's no upcoming meeting
  if (isLoading || !prep) return null;

  // Auto-hide: if meeting start has passed
  const startTime = new Date(prep.meeting.startTime);
  if (startTime <= new Date()) return null;

  // Determine if we have Brain memory for the contact
  const hasBrainData =
    prep.strength !== null ||
    prep.communicationStyle !== null ||
    prep.commitments.length > 0 ||
    prep.objections.length > 0 ||
    prep.lastSentiment !== null;

  return (
    <div className="px-6 py-2">
      {hasBrainData ? (
        <FullPrepCard prep={prep} />
      ) : (
        <SimplifiedPrepCard prep={prep} />
      )}
    </div>
  );
}
