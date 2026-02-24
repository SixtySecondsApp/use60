/**
 * MetricDrillDownModal - Shows tile-specific popup content
 * Used for drilling down from KPI cards and comparison matrix
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Calendar,
  Building2,
  Smile,
  Frown,
  Meh,
  TrendingUp,
  AlertCircle,
  Clock,
  ExternalLink,
  Target,
  Star,
  CheckCircle,
  AlertTriangle,
  MessageSquare,
  Shield,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  useMeetingsForDrillDown,
  useSentimentExtremes,
  useTalkTimeExtremes,
  useObjectionDetails,
  useTeamAggregates,
  type TimePeriod,
  type DrillDownMetricType,
  type MeetingSummary,
} from '@/lib/hooks/useTeamAnalytics';
import { TeamAnalyticsService } from '@/lib/services/teamAnalyticsService';

interface MetricDrillDownModalProps {
  isOpen: boolean;
  onClose: () => void;
  metricType: DrillDownMetricType;
  period: TimePeriod;
  userId?: string;
  metricTitle: string;
  repName?: string;
}

// Metric type labels and icons
const metricConfig: Record<DrillDownMetricType, { label: string; icon: React.ElementType; color: string }> = {
  all: { label: 'All Meetings', icon: Calendar, color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/30' },
  positive_sentiment: { label: 'Positive Sentiment', icon: Smile, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30' },
  negative_sentiment: { label: 'Negative Sentiment', icon: Frown, color: 'text-red-600 bg-red-50 dark:bg-red-900/30' },
  forward_movement: { label: 'Forward Movement', icon: TrendingUp, color: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-900/30' },
  objection: { label: 'Objection Raised', icon: AlertCircle, color: 'text-orange-600 bg-orange-50 dark:bg-orange-900/30' },
  positive_outcome: { label: 'Positive Outcome', icon: Target, color: 'text-green-600 bg-green-50 dark:bg-green-900/30' },
  negative_outcome: { label: 'Negative Outcome', icon: Target, color: 'text-red-600 bg-red-50 dark:bg-red-900/30' },
  sentiment_extremes: { label: 'Sentiment Highlights', icon: Smile, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30' },
  talk_time_extremes: { label: 'Talk Time Distribution', icon: Clock, color: 'text-purple-600 bg-purple-50 dark:bg-purple-900/30' },
  coach_rating_summary: { label: 'Coaching Guidance', icon: Star, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30' },
  objection_details: { label: 'Objections Analysis', icon: Shield, color: 'text-orange-600 bg-orange-50 dark:bg-orange-900/30' },
};

// Types that use the generic meeting list
const GENERIC_MEETING_LIST_TYPES: DrillDownMetricType[] = [
  'all', 'positive_sentiment', 'negative_sentiment',
  'forward_movement', 'objection', 'positive_outcome', 'negative_outcome',
];

// ===========================================================================
// Shared sub-components
// ===========================================================================

function MeetingListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl animate-pulse">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
              <div className="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
            </div>
            <div className="flex gap-2">
              <div className="h-6 w-16 bg-gray-200 dark:bg-gray-700 rounded-full" />
              <div className="h-6 w-20 bg-gray-200 dark:bg-gray-700 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SentimentBadge({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-500 bg-gray-100 dark:bg-gray-700 rounded-full">
        <Meh className="w-3 h-3" /> N/A
      </span>
    );
  }
  if (score > 0.2) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-full">
        <Smile className="w-3 h-3" /> {score.toFixed(2)}
      </span>
    );
  }
  if (score < -0.2) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400 rounded-full">
        <Frown className="w-3 h-3" /> {score.toFixed(2)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 dark:bg-gray-700 dark:text-gray-400 rounded-full">
      <Meh className="w-3 h-3" /> {score.toFixed(2)}
    </span>
  );
}

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) {
    return (
      <span className="inline-flex items-center px-2 py-1 text-xs font-medium text-gray-500 bg-gray-100 dark:bg-gray-700 rounded-full">
        Unknown
      </span>
    );
  }
  const outcomeStyles: Record<string, string> = {
    positive: 'text-emerald-700 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400',
    negative: 'text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400',
    neutral: 'text-gray-700 bg-gray-100 dark:bg-gray-700 dark:text-gray-400',
  };
  return (
    <span className={cn('inline-flex items-center px-2 py-1 text-xs font-medium rounded-full capitalize', outcomeStyles[outcome.toLowerCase()] || outcomeStyles.neutral)}>
      {outcome}
    </span>
  );
}

function TalkTimeBadge({ pct }: { pct: number | null }) {
  if (pct === null) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-500 bg-gray-100 dark:bg-gray-700 rounded-full">
        <Clock className="w-3 h-3" /> N/A
      </span>
    );
  }
  const isIdeal = pct >= 45 && pct <= 55;
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full',
      isIdeal
        ? 'text-emerald-700 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400'
        : 'text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400'
    )}>
      <Clock className="w-3 h-3" /> {pct.toFixed(0)}%
    </span>
  );
}

function MeetingRow({ meeting, onClick }: { meeting: MeetingSummary; onClick: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.005 }}
      onClick={onClick}
      className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md transition-all group"
    >
      <div className="flex items-center gap-4">
        <div className="flex-shrink-0 p-2.5 bg-gray-100 dark:bg-gray-700 rounded-lg">
          <Calendar className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-gray-900 dark:text-white truncate">
              {meeting.title || 'Untitled Meeting'}
            </h4>
            <ExternalLink className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {format(parseISO(meeting.meetingDate), 'MMM d, yyyy')}
            </span>
            {meeting.companyName && (
              <span className="flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" />
                {meeting.companyName}
              </span>
            )}
            {meeting.durationMinutes && (
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {meeting.durationMinutes}m
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <SentimentBadge score={meeting.sentimentScore} />
          <OutcomeBadge outcome={meeting.outcome} />
          {meeting.hasForwardMovement && (
            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-cyan-700 bg-cyan-100 dark:bg-cyan-900/30 dark:text-cyan-400 rounded-full">
              <TrendingUp className="w-3 h-3" /> Fwd
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <Calendar className="w-12 h-12 text-gray-400 mb-4" />
      <p className="text-gray-500 dark:text-gray-400 text-center">{message}</p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
      <p className="text-red-600 dark:text-red-400 text-center">Failed to load data</p>
    </div>
  );
}

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">{title}</h3>
      {count !== undefined && (
        <span className="text-xs text-gray-500 dark:text-gray-400">{count} meeting{count !== 1 ? 's' : ''}</span>
      )}
    </div>
  );
}

// ===========================================================================
// Content sub-components
// ===========================================================================

/** Generic meeting list (existing behavior for 'all', 'forward_movement', etc.) */
function GenericMeetingListContent({
  metricType,
  period,
  userId,
  isOpen,
  onMeetingClick,
}: {
  metricType: DrillDownMetricType;
  period: TimePeriod;
  userId?: string;
  isOpen: boolean;
  onMeetingClick: (meetingId: string) => void;
}) {
  const { data: meetings, isLoading, error } = useMeetingsForDrillDown(metricType, period, userId, isOpen);

  if (error) return <ErrorState />;
  if (isLoading) return <MeetingListSkeleton />;
  if (!meetings || meetings.length === 0) return <EmptyState message="No meetings found for this filter" />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {meetings.length} meeting{meetings.length !== 1 ? 's' : ''} found
        </p>
      </div>
      {meetings.map((meeting) => (
        <MeetingRow key={meeting.meetingId} meeting={meeting} onClick={() => onMeetingClick(meeting.meetingId)} />
      ))}
    </div>
  );
}

/** Sentiment extremes: top 5 + bottom 5 */
function SentimentExtremesContent({
  period,
  userId,
  isOpen,
  onMeetingClick,
}: {
  period: TimePeriod;
  userId?: string;
  isOpen: boolean;
  onMeetingClick: (meetingId: string) => void;
}) {
  const { data, isLoading, error } = useSentimentExtremes(period, userId, isOpen);

  if (error) return <ErrorState />;
  if (isLoading) return <MeetingListSkeleton />;
  if (!data || (data.top5.length === 0 && data.bottom5.length === 0)) {
    return <EmptyState message="No meetings with sentiment data found" />;
  }

  return (
    <div className="space-y-6">
      {data.top5.length > 0 && (
        <div>
          <SectionHeader title="Highest Sentiment" count={data.top5.length} />
          <div className="space-y-3">
            {data.top5.map((m) => (
              <MeetingRow key={m.meetingId} meeting={m} onClick={() => onMeetingClick(m.meetingId)} />
            ))}
          </div>
        </div>
      )}

      {data.bottom5.length > 0 && (
        <div>
          <SectionHeader title="Lowest Sentiment" count={data.bottom5.length} />
          <div className="space-y-3">
            {data.bottom5.map((m) => (
              <MeetingRow key={m.meetingId} meeting={m} onClick={() => onMeetingClick(m.meetingId)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Talk time extremes: highest 5 + lowest 5 */
function TalkTimeExtremesContent({
  period,
  userId,
  isOpen,
  onMeetingClick,
}: {
  period: TimePeriod;
  userId?: string;
  isOpen: boolean;
  onMeetingClick: (meetingId: string) => void;
}) {
  const { data, isLoading, error } = useTalkTimeExtremes(period, userId, isOpen);

  if (error) return <ErrorState />;
  if (isLoading) return <MeetingListSkeleton />;
  if (!data || (data.highest5.length === 0 && data.lowest5.length === 0)) {
    return <EmptyState message="No meetings with talk time data found" />;
  }

  // Custom meeting row that highlights talk time
  const TalkTimeMeetingRow = ({ meeting, onClick }: { meeting: MeetingSummary; onClick: () => void }) => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.005 }}
      onClick={onClick}
      className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-md transition-all group"
    >
      <div className="flex items-center gap-4">
        <div className="flex-shrink-0 p-2.5 bg-gray-100 dark:bg-gray-700 rounded-lg">
          <Clock className="w-5 h-5 text-purple-600 dark:text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-gray-900 dark:text-white truncate">
              {meeting.title || 'Untitled Meeting'}
            </h4>
            <ExternalLink className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {format(parseISO(meeting.meetingDate), 'MMM d, yyyy')}
            </span>
            {meeting.companyName && (
              <span className="flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" />
                {meeting.companyName}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <TalkTimeBadge pct={meeting.talkTimePct} />
          <SentimentBadge score={meeting.sentimentScore} />
        </div>
      </div>
    </motion.div>
  );

  return (
    <div className="space-y-6">
      {data.highest5.length > 0 && (
        <div>
          <SectionHeader title="Most Talk Time (Rep)" count={data.highest5.length} />
          <div className="space-y-3">
            {data.highest5.map((m) => (
              <TalkTimeMeetingRow key={m.meetingId} meeting={m} onClick={() => onMeetingClick(m.meetingId)} />
            ))}
          </div>
        </div>
      )}

      {data.lowest5.length > 0 && (
        <div>
          <SectionHeader title="Least Talk Time (Rep)" count={data.lowest5.length} />
          <div className="space-y-3">
            {data.lowest5.map((m) => (
              <TalkTimeMeetingRow key={m.meetingId} meeting={m} onClick={() => onMeetingClick(m.meetingId)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Coach rating guidance: deterministic coaching text */
function CoachingGuidanceContent({ period }: { period: TimePeriod }) {
  const { data: aggregates, isLoading, error } = useTeamAggregates(period);

  if (error) return <ErrorState />;
  if (isLoading) return <MeetingListSkeleton />;
  if (!aggregates) return <EmptyState message="No data available for coaching guidance" />;

  const guidance = TeamAnalyticsService.generateTeamCoachingGuidance(aggregates);

  return (
    <div className="space-y-6">
      {/* Summary paragraph */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/30 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <Star className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">
            {guidance.summary}
          </p>
        </div>
      </div>

      {/* What's Working */}
      {guidance.highlights.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">
            What's Working Well
          </h3>
          <div className="space-y-2">
            {guidance.highlights.map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/30 rounded-lg">
                <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-gray-700 dark:text-gray-300">{item}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Areas to Improve */}
      {guidance.improvements.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">
            Areas to Improve
          </h3>
          <div className="space-y-2">
            {guidance.improvements.map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/30 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-gray-700 dark:text-gray-300">{item}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {guidance.highlights.length === 0 && guidance.improvements.length === 0 && (
        <EmptyState message="Not enough data to generate coaching insights" />
      )}
    </div>
  );
}

/** Objection details: meetings + top objections + handling methods */
function ObjectionDetailsContent({
  period,
  userId,
  isOpen,
  onMeetingClick,
}: {
  period: TimePeriod;
  userId?: string;
  isOpen: boolean;
  onMeetingClick: (meetingId: string) => void;
}) {
  const { data, isLoading, error } = useObjectionDetails(period, userId, isOpen);

  if (error) return <ErrorState />;
  if (isLoading) return <MeetingListSkeleton />;
  if (!data) return <EmptyState message="No objection data found" />;

  const { meetings, topObjections, topHandlingMethods } = data;
  const hasAnyData = meetings.length > 0 || topObjections.length > 0 || topHandlingMethods.length > 0;

  if (!hasAnyData) return <EmptyState message="No objection data found in this period" />;

  return (
    <div className="space-y-6">
      {/* Top 3 Objections */}
      {topObjections.length > 0 && (
        <div>
          <SectionHeader title="Top Objections" />
          <div className="grid grid-cols-1 gap-3">
            {topObjections.map((obj, i) => (
              <div key={i} className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700/30 rounded-xl">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-200 dark:bg-orange-800 text-xs font-bold text-orange-700 dark:text-orange-300">
                        {i + 1}
                      </span>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{obj.objection}</p>
                    </div>
                    {obj.category && (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium text-orange-700 bg-orange-100 dark:bg-orange-800/40 dark:text-orange-300 rounded-full mt-1">
                        {obj.category}
                      </span>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-gray-900 dark:text-white">{obj.occurrenceCount}x</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{obj.resolutionRate.toFixed(0)}% resolved</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Successful Handling Methods */}
      {topHandlingMethods.length > 0 && (
        <div>
          <SectionHeader title="Successful Handling Methods" />
          <div className="space-y-3">
            {topHandlingMethods.map((method, i) => (
              <div key={i} className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/30 rounded-xl">
                <div className="flex items-start gap-3">
                  <MessageSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-1" />
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Objection: "{method.objection}"
                    </p>
                    <p className="text-sm text-gray-800 dark:text-gray-200">
                      {method.response}
                    </p>
                    {method.meetingTitle && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        From: {method.meetingTitle}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Meetings with Key Objections */}
      {meetings.length > 0 && (
        <div>
          <SectionHeader title="Calls with Key Objections" count={meetings.length} />
          <div className="space-y-3">
            {meetings.map((m) => (
              <MeetingRow key={m.meetingId} meeting={m} onClick={() => onMeetingClick(m.meetingId)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Main Modal
// ===========================================================================

export function MetricDrillDownModal({
  isOpen,
  onClose,
  metricType,
  period,
  userId,
  metricTitle,
  repName,
}: MetricDrillDownModalProps) {
  const navigate = useNavigate();

  const config = metricConfig[metricType];
  const Icon = config.icon;

  const handleMeetingClick = (meetingId: string) => {
    onClose();
    navigate(`/meeting/${meetingId}`);
  };

  const periodLabel = period === 7 ? '7 days' : period === 30 ? '30 days' : '90 days';

  const isGenericList = GENERIC_MEETING_LIST_TYPES.includes(metricType);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden shadow-2xl border border-gray-200 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className={cn('p-2.5 rounded-xl', config.color)}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    {metricTitle}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {repName || 'All Team'} &middot; Last {periodLabel}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(85vh-120px)]">
              {isGenericList ? (
                <GenericMeetingListContent
                  metricType={metricType}
                  period={period}
                  userId={userId}
                  isOpen={isOpen}
                  onMeetingClick={handleMeetingClick}
                />
              ) : metricType === 'sentiment_extremes' ? (
                <SentimentExtremesContent
                  period={period}
                  userId={userId}
                  isOpen={isOpen}
                  onMeetingClick={handleMeetingClick}
                />
              ) : metricType === 'talk_time_extremes' ? (
                <TalkTimeExtremesContent
                  period={period}
                  userId={userId}
                  isOpen={isOpen}
                  onMeetingClick={handleMeetingClick}
                />
              ) : metricType === 'coach_rating_summary' ? (
                <CoachingGuidanceContent period={period} />
              ) : metricType === 'objection_details' ? (
                <ObjectionDetailsContent
                  period={period}
                  userId={userId}
                  isOpen={isOpen}
                  onMeetingClick={handleMeetingClick}
                />
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
