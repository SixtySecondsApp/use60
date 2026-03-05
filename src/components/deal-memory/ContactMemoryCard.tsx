/**
 * ContactMemoryCard — surfaces contact memory on the contact profile page (MEM-004)
 *
 * Shows:
 *  - Relationship strength indicator
 *  - Communication & decision style
 *  - Interests extracted from meetings
 *  - Cross-deal event history (recent memory events involving this contact)
 */

import React, { useState } from 'react';
import {
  Brain,
  Heart,
  MessageSquare,
  Lightbulb,
  Flag,
  Loader2,
  Activity,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Users,
  Swords,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { useContactMemory, useFlagMemoryEvent, type DealMemoryEvent } from '@/lib/hooks/useDealMemory';

// ── Relationship strength bar ──────────────────────────────────────────────────

function RelationshipStrengthBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score * 100));
  const color =
    pct >= 70 ? 'from-emerald-500 to-emerald-400' :
    pct >= 40 ? 'from-amber-500 to-amber-400' :
    'from-red-500 to-red-400';
  const label =
    pct >= 70 ? 'Strong' : pct >= 40 ? 'Building' : 'Weak';

  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1.5">
        <span className="text-gray-500 dark:text-gray-400">Relationship Strength</span>
        <span className={pct >= 70 ? 'text-emerald-600 dark:text-emerald-400' : pct >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}>
          {label} ({Math.round(pct)}%)
        </span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 dark:bg-white/[0.04] overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${color} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Mini event row ─────────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  commitment: CheckCircle2,
  objection: AlertTriangle,
  stakeholder: Users,
  competitive: Swords,
  signal: Activity,
};

function MiniEventRow({
  event,
  onFlag,
  isFlagging,
}: {
  event: DealMemoryEvent;
  onFlag: (id: string) => void;
  isFlagging: boolean;
}) {
  const Icon = CATEGORY_ICONS[event.event_category] ?? MessageSquare;
  const colors: Record<string, string> = {
    commitment: 'text-emerald-500',
    objection: 'text-amber-500',
    stakeholder: 'text-blue-500',
    competitive: 'text-rose-500',
    sentiment: 'text-purple-500',
    signal: 'text-cyan-500',
  };
  const iconColor = colors[event.event_category] ?? 'text-gray-400';

  return (
    <div className="group flex gap-2.5 py-2 border-b border-gray-100 dark:border-white/[0.04] last:border-0">
      <Icon className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${iconColor}`} />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-gray-700 dark:text-gray-300 leading-snug">{event.summary}</p>
        <span className="text-[10px] text-gray-400">
          {formatDistanceToNow(new Date(event.source_timestamp), { addSuffix: true })}
        </span>
      </div>
      <button
        onClick={() => onFlag(event.id)}
        disabled={isFlagging}
        className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-rose-500 transition-all flex-shrink-0"
        title="Flag as incorrect"
      >
        <Flag className="w-3 h-3" />
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface ContactMemoryCardProps {
  contactId: string;
  contactName: string;
}

export function ContactMemoryCard({ contactId, contactName }: ContactMemoryCardProps) {
  const [showAllEvents, setShowAllEvents] = useState(false);
  const { data, isLoading } = useContactMemory(contactId);
  const flagMutation = useFlagMemoryEvent();

  const profile = data?.profile;
  const events = data?.events ?? [];
  const visibleEvents = showAllEvents ? events : events.slice(0, 5);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  const hasMemory = profile || events.length > 0;

  if (!hasMemory) {
    return (
      <div className="text-center py-10">
        <Brain className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
          No memory built yet
        </p>
        <p className="text-[12px] text-gray-400 max-w-xs mx-auto">
          60 will remember interactions with {contactName} once you have meetings or email exchanges.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Profile card */}
      {profile && (
        <div className="rounded-xl bg-gradient-to-br from-violet-500/[0.05] to-blue-500/[0.05] border border-violet-500/[0.10] p-4 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center">
              <Brain className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              What 60 Knows About {contactName}
            </span>
          </div>

          {/* Relationship strength */}
          {profile.relationship_strength != null && (
            <RelationshipStrengthBar score={profile.relationship_strength} />
          )}

          {/* AI summary */}
          {profile.summary && (
            <p className="text-[13px] text-gray-700 dark:text-gray-300 leading-relaxed">
              {profile.summary}
            </p>
          )}

          {/* Communication style */}
          {profile.communication_style && Object.keys(profile.communication_style).length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-[10.5px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Communication Style
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {profile.communication_style.preferred_channel && (
                  <Badge className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 border">
                    Prefers {profile.communication_style.preferred_channel}
                  </Badge>
                )}
                {profile.communication_style.response_speed && (
                  <Badge className="text-[10px] bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20 border">
                    Responds {profile.communication_style.response_speed}
                  </Badge>
                )}
                {profile.communication_style.formality_level && (
                  <Badge className="text-[10px] bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20 border">
                    {profile.communication_style.formality_level} tone
                  </Badge>
                )}
                {profile.communication_style.best_time_to_reach && (
                  <Badge className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 border">
                    <Clock className="w-2.5 h-2.5 mr-1" />
                    Best time: {profile.communication_style.best_time_to_reach}
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Interests */}
          {profile.interests && profile.interests.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Lightbulb className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-[10.5px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Topics They Care About
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {profile.interests.slice(0, 6).map((interest) => (
                  <Badge
                    key={interest.topic}
                    className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 border"
                  >
                    {interest.topic}
                    {interest.times_mentioned > 1 && (
                      <span className="ml-1 opacity-60">×{interest.times_mentioned}</span>
                    )}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Last interaction */}
          {profile.last_interaction_at && (
            <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
              <Heart className="w-3 h-3" />
              Last interaction{' '}
              {formatDistanceToNow(new Date(profile.last_interaction_at), { addSuffix: true })}
            </div>
          )}
        </div>
      )}

      {/* Cross-deal event history */}
      {events.length > 0 && (
        <div>
          <h3 className="text-[10.5px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex items-center gap-2 mb-3 after:content-[''] after:flex-1 after:h-px after:bg-gray-200 dark:after:bg-white/[0.06]">
            Interaction History ({events.length})
          </h3>
          <div>
            {visibleEvents.map((event) => (
              <MiniEventRow
                key={event.id}
                event={event}
                onFlag={(id) => flagMutation.mutate({ eventId: id })}
                isFlagging={flagMutation.isPending}
              />
            ))}
            {events.length > 5 && (
              <button
                onClick={() => setShowAllEvents((p) => !p)}
                className="w-full text-center text-[11px] text-violet-600 dark:text-violet-400 hover:underline pt-2"
              >
                {showAllEvents ? 'Show less' : `Show all ${events.length} events`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
