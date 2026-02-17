/**
 * Shared badge and thumbnail components for the unified meetings list.
 * Extracted from RecordingsList.tsx for reuse across meeting and recording views.
 */

import React, { useRef, useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  Smile,
  Frown,
  Meh,
  Star,
  BarChart3,
  Clock,
  Bot,
  Mic,
  CheckCircle2,
  XCircle,
  Loader2,
  Play,
  Video,
  Radio,
} from 'lucide-react'
import type { RecordingStatus, MeetingPlatform } from '@/lib/types/meetingBaaS'
import type { UnifiedSource } from '@/lib/types/unifiedMeeting'

// ============================================================================
// Status Config
// ============================================================================

export const statusConfig: Record<RecordingStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
  pending: { label: 'Pending', variant: 'outline', icon: <Clock className="h-3 w-3" /> },
  bot_joining: { label: 'Joining', variant: 'secondary', icon: <Bot className="h-3 w-3 animate-pulse" /> },
  recording: { label: 'Recording', variant: 'default', icon: <Mic className="h-3 w-3 animate-pulse text-red-500" /> },
  processing: { label: 'Processing', variant: 'secondary', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  ready: { label: 'Ready', variant: 'default', icon: <CheckCircle2 className="h-3 w-3 text-emerald-500" /> },
  failed: { label: 'Failed', variant: 'destructive', icon: <XCircle className="h-3 w-3" /> },
}

// ============================================================================
// Platform Config
// ============================================================================

export const platformConfig: Record<MeetingPlatform, { label: string; color: string }> = {
  zoom: { label: 'Zoom', color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' },
  google_meet: { label: 'Google Meet', color: 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400' },
  microsoft_teams: { label: 'Teams', color: 'bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400' },
}

// ============================================================================
// Source Badge
// ============================================================================

const sourceConfig: Record<UnifiedSource, { label: string; shortLabel: string; icon: React.ReactNode; color: string }> = {
  fathom: {
    label: 'Fathom',
    shortLabel: 'Fathom',
    icon: <Video className="h-3 w-3" />,
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border-blue-200 dark:border-blue-500/20',
  },
  fireflies: {
    label: 'Fireflies',
    shortLabel: 'Fireflies',
    icon: <Mic className="h-3 w-3" />,
    color: 'bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400 border-orange-200 dark:border-orange-500/20',
  },
  voice: {
    label: 'Voice',
    shortLabel: 'Voice',
    icon: <Radio className="h-3 w-3" />,
    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20',
  },
  '60_notetaker': {
    label: '60 Notetaker',
    shortLabel: '60 NT',
    icon: <Bot className="h-3 w-3" />,
    color: 'bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400 border-purple-200 dark:border-purple-500/20',
  },
}

export const SourceBadge: React.FC<{ source: UnifiedSource; compact?: boolean }> = ({ source, compact }) => {
  const config = sourceConfig[source]
  return (
    <Badge variant="outline" className={cn("text-xs gap-1 border", config.color)}>
      {config.icon}
      {compact ? config.shortLabel : config.label}
    </Badge>
  )
}

// ============================================================================
// Sentiment Badge
// ============================================================================

export const SentimentBadge: React.FC<{ score: number | null | undefined }> = ({ score }) => {
  if (score === null || score === undefined) return null

  const getSentimentConfig = (s: number) => {
    if (s >= 0.3) return { label: 'Positive', icon: <Smile className="h-3 w-3" />, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-500/30' }
    if (s >= -0.3) return { label: 'Neutral', icon: <Meh className="h-3 w-3" />, color: 'bg-gray-100 text-gray-700 dark:bg-gray-500/10 dark:text-gray-400 border-gray-500/30' }
    return { label: 'Needs Review', icon: <Frown className="h-3 w-3" />, color: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border-amber-500/30' }
  }

  const config = getSentimentConfig(score)

  return (
    <Badge variant="outline" className={cn("text-xs gap-1 border", config.color)}>
      {config.icon}
      {config.label}
    </Badge>
  )
}

// ============================================================================
// Coach Rating Badge
// ============================================================================

export const CoachRatingBadge: React.FC<{ rating: number | null | undefined }> = ({ rating }) => {
  if (rating === null || rating === undefined) return null

  const getRatingConfig = (r: number) => {
    if (r >= 8) return { color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-500/30' }
    if (r >= 6) return { color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border-blue-500/30' }
    if (r >= 4) return { color: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border-amber-500/30' }
    return { color: 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400 border-red-500/30' }
  }

  const config = getRatingConfig(rating)

  return (
    <Badge variant="outline" className={cn("text-xs gap-1 border", config.color)}>
      <Star className="h-3 w-3" />
      {rating}/10
    </Badge>
  )
}

// ============================================================================
// Talk Time Badge
// ============================================================================

export const TalkTimeBadge: React.FC<{ repPct: number | null | undefined; judgement: 'good' | 'high' | 'low' | null | undefined }> = ({ repPct, judgement }) => {
  if (repPct === null || repPct === undefined) return null

  const getConfig = (j: 'good' | 'high' | 'low' | null | undefined) => {
    if (j === 'good') return { color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-500/30' }
    if (j === 'high') return { color: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border-amber-500/30' }
    return { color: 'bg-gray-100 text-gray-700 dark:bg-gray-500/10 dark:text-gray-400 border-gray-500/30' }
  }

  const config = getConfig(judgement)

  return (
    <Badge variant="outline" className={cn("text-xs gap-1 border", config.color)}>
      <BarChart3 className="h-3 w-3" />
      {Math.round(repPct)}% rep
    </Badge>
  )
}

// ============================================================================
// Video Thumbnail Component
// ============================================================================

const PlaceholderThumbnail: React.FC<{ title?: string; className?: string }> = ({ title, className }) => {
  const initial = (title || 'M')[0].toUpperCase()
  return (
    <div className={cn("bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg flex items-center justify-center", className)}>
      <span className="text-white text-xl font-bold">{initial}</span>
    </div>
  )
}

export const VideoThumbnail: React.FC<{
  videoUrl?: string | null
  thumbnailUrl?: string | null
  title?: string
  className?: string
}> = ({ videoUrl, thumbnailUrl, title, className }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [frameReady, setFrameReady] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [videoError, setVideoError] = useState(false)

  const showThumbnailImg = !!(thumbnailUrl && !imgError)
  const showVideo = !!(videoUrl && !videoError && !showThumbnailImg)

  useEffect(() => {
    if (!showVideo || isVisible) return
    const el = containerRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [showVideo, isVisible])

  if (showThumbnailImg) {
    return (
      <div className={cn("relative rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800", className)}>
        <img
          src={thumbnailUrl!}
          alt={title || 'Recording thumbnail'}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity">
          <Play className="h-5 w-5 text-white/90 drop-shadow-lg" />
        </div>
      </div>
    )
  }

  if (showVideo) {
    return (
      <div ref={containerRef} className={cn("relative rounded-lg overflow-hidden bg-gray-900", className)}>
        {isVisible && (
          <video
            ref={videoRef}
            src={videoUrl!}
            muted
            playsInline
            preload="metadata"
            onLoadedMetadata={() => {
              if (videoRef.current) {
                videoRef.current.currentTime = Math.min(10, videoRef.current.duration * 0.15)
              }
            }}
            onSeeked={() => setFrameReady(true)}
            onError={() => setVideoError(true)}
            className={cn("w-full h-full object-cover", !frameReady && "opacity-0")}
          />
        )}
        {frameReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity">
            <Play className="h-5 w-5 text-white/90 drop-shadow-lg" />
          </div>
        )}
        {!frameReady && <PlaceholderThumbnail title={title} className="absolute inset-0" />}
      </div>
    )
  }

  return <PlaceholderThumbnail title={title} className={className} />
}
