/**
 * RecordingCard
 *
 * LIB-002: Card component for meeting library grid.
 * Shows title, date, duration, participants, platform badge.
 * Sentiment and quality badges from RecordingBadges.
 * Quick actions: play, share, generate content.
 * Hover state with action buttons.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Play,
  Share2,
  Sparkles,
  Clock,
  Users,
  ExternalLink,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  SentimentBadge,
  CoachRatingBadge,
  TalkTimeBadge,
  SourceBadge,
  VideoThumbnail,
} from './shared/RecordingBadges';
import type { UnifiedMeeting } from '@/lib/types/unifiedMeeting';

// ============================================================================
// Helpers
// ============================================================================

function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0 || minutes > 480) return '—';
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes}m`;
}

// ============================================================================
// Component
// ============================================================================

interface RecordingCardProps {
  meeting: UnifiedMeeting;
  onShare?: (meeting: UnifiedMeeting) => void;
  onGenerate?: (meeting: UnifiedMeeting) => void;
  signedUrl?: string | null;
}

export function RecordingCard({ meeting, onShare, onGenerate, signedUrl }: RecordingCardProps) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);

  function handlePlay() {
    navigate(meeting.detailPath);
  }

  return (
    <Card
      className={cn(
        'group relative overflow-hidden border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/60',
        'transition-shadow duration-200',
        hovered && 'shadow-md dark:shadow-black/30',
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <VideoThumbnail
          thumbnailUrl={meeting.thumbnailUrl}
          signedVideoUrl={signedUrl ?? null}
          title={meeting.title}
          sourceTable={meeting.sourceTable}
        />

        {/* Play overlay on hover */}
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity duration-200',
            hovered ? 'opacity-100' : 'opacity-0',
          )}
        >
          <button
            onClick={handlePlay}
            className="flex items-center justify-center h-12 w-12 rounded-full bg-white/90 hover:bg-white transition-colors shadow-lg"
          >
            <Play className="h-5 w-5 text-gray-900 fill-gray-900 ml-0.5" />
          </button>
        </div>

        {/* Source badge — top-left */}
        <div className="absolute top-2 left-2">
          <SourceBadge source={meeting.source} />
        </div>

        {/* Duration badge — top-right */}
        {meeting.durationMinutes && (
          <div className="absolute top-2 right-2">
            <Badge
              variant="secondary"
              className="text-[10px] bg-black/60 text-white border-0 backdrop-blur-sm"
            >
              <Clock className="h-2.5 w-2.5 mr-1" />
              {formatDuration(meeting.durationMinutes)}
            </Badge>
          </div>
        )}
      </div>

      {/* Content */}
      <CardContent className="p-3 space-y-2">
        {/* Title */}
        <button
          onClick={handlePlay}
          className="w-full text-left"
        >
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2 leading-snug hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
            {meeting.title || 'Untitled Meeting'}
          </h3>
        </button>

        {/* Meta row */}
        <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
          {meeting.date && (
            <span>{format(new Date(meeting.date), 'MMM d, yyyy')}</span>
          )}
          {meeting.companyName && (
            <>
              <span className="text-gray-300 dark:text-gray-700">·</span>
              <span className="truncate max-w-[120px]">{meeting.companyName}</span>
            </>
          )}
        </div>

        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-1.5">
          {meeting.sentimentScore !== null && (
            <SentimentBadge score={meeting.sentimentScore} />
          )}
          {meeting.coachRating !== null && (
            <CoachRatingBadge rating={meeting.coachRating} />
          )}
          {meeting.talkTimeRepPct !== null && meeting.talkTimeJudgement && (
            <TalkTimeBadge
              repPct={meeting.talkTimeRepPct}
              judgement={meeting.talkTimeJudgement}
            />
          )}
        </div>

        {/* Quick actions — fade in on hover */}
        <div
          className={cn(
            'flex items-center gap-1 pt-1 transition-opacity duration-200',
            hovered ? 'opacity-100' : 'opacity-0',
          )}
        >
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px] text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            onClick={handlePlay}
          >
            <Play className="h-3 w-3 mr-1" />
            Play
          </Button>
          {onShare && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px] text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              onClick={() => onShare(meeting)}
            >
              <Share2 className="h-3 w-3 mr-1" />
              Share
            </Button>
          )}
          {onGenerate && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px] text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              onClick={() => onGenerate(meeting)}
            >
              <Sparkles className="h-3 w-3 mr-1" />
              Generate
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 ml-auto text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            onClick={handlePlay}
            title="Open meeting detail"
          >
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
