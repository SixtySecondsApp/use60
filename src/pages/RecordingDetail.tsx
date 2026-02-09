import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useRecording, useRecordingRealtime } from '@/lib/hooks/useRecordings'
import { recordingService } from '@/lib/services/recordingService'
import { supabase } from '@/lib/supabase/clientV2'
import { ProposalWizard } from '@/components/proposals/ProposalWizard'
import { format, formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Video,
  Clock,
  Calendar,
  Users,
  FileText,
  Sparkles,
  MessageSquare,
  Building2,
  CheckCircle2,
  XCircle,
  Loader2,
  Bot,
  Mic,
  Play,
  Download,
  Share2,
  AlertCircle,
  ExternalLink,
  ClipboardList,
  RefreshCw,
  BarChart3,
  TrendingUp
} from 'lucide-react'
import type { RecordingStatus, MeetingPlatform } from '@/lib/types/meetingBaaS'

// Status badge configuration
const statusConfig: Record<RecordingStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
  pending: { label: 'Pending', variant: 'outline', icon: <Clock className="h-3 w-3" /> },
  bot_joining: { label: 'Joining', variant: 'secondary', icon: <Bot className="h-3 w-3 animate-pulse" /> },
  recording: { label: 'Recording', variant: 'default', icon: <Mic className="h-3 w-3 animate-pulse text-red-500" /> },
  processing: { label: 'Processing', variant: 'secondary', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  ready: { label: 'Ready', variant: 'default', icon: <CheckCircle2 className="h-3 w-3 text-emerald-500" /> },
  failed: { label: 'Failed', variant: 'destructive', icon: <XCircle className="h-3 w-3" /> },
}

// Platform badge configuration
const platformConfig: Record<MeetingPlatform, { label: string; color: string }> = {
  zoom: { label: 'Zoom', color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' },
  google_meet: { label: 'Google Meet', color: 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400' },
  microsoft_teams: { label: 'Teams', color: 'bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400' },
}

// Format duration
const formatDuration = (seconds: number | null | undefined): string => {
  if (!seconds || seconds <= 0) return '—'
  const minutes = Math.floor(seconds / 60)
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
  }
  return `${minutes}m`
}

// Sentiment helpers
const getSentimentLabel = (score: number): string => {
  if (score >= 0.3) return 'Positive'
  if (score >= -0.3) return 'Neutral'
  return 'Needs Review'
}

const getSentimentColor = (score: number): string => {
  if (score >= 0.3) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
  if (score >= -0.3) return 'bg-gray-100 text-gray-700 dark:bg-gray-500/10 dark:text-gray-400'
  return 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400'
}

const getCoachColor = (rating: number): string => {
  if (rating >= 70) return 'text-emerald-600 dark:text-emerald-400'
  if (rating >= 40) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

const getTalkTimeColor = (judgement: string | null | undefined): string => {
  if (judgement === 'good') return 'text-emerald-600 dark:text-emerald-400'
  if (judgement === 'high' || judgement === 'low') return 'text-amber-600 dark:text-amber-400'
  return 'text-gray-600 dark:text-gray-400'
}

// Skeleton for loading state
const RecordingDetailSkeleton: React.FC = () => (
  <div className="p-6 space-y-6">
    <div className="flex items-center gap-4">
      <Skeleton className="h-10 w-10 rounded-lg" />
      <div>
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-4 w-40" />
      </div>
    </div>
    <div className="grid grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <Skeleton key={i} className="h-24 rounded-xl" />
      ))}
    </div>
    <Skeleton className="h-96 rounded-xl" />
  </div>
)

export const RecordingDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [isDownloading, setIsDownloading] = useState(false)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoLoading, setVideoLoading] = useState(false)
  const [videoError, setVideoError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isLoadingVideo, setIsLoadingVideo] = useState(false)
  const [showProposalWizard, setShowProposalWizard] = useState(false)
  const [linkedMeetingId, setLinkedMeetingId] = useState<string | null>(null)

  // Fetch recording data
  const { recording, isLoading, error } = useRecording(id || '')

  // Subscribe to real-time updates
  useRecordingRealtime(id || '')

  // Fetch signed video URL when recording is ready
  useEffect(() => {
    if (!id || !recording?.recording_s3_key || recording.status !== 'ready') {
      setVideoUrl(null)
      return
    }

    let cancelled = false
    setIsLoadingVideo(true)

    recordingService.getRecordingUrl(id).then((result) => {
      if (cancelled) return
      if (result.success && result.url) {
        setVideoUrl(result.url)
      }
      setIsLoadingVideo(false)
    })

    return () => { cancelled = true }
  }, [id, recording?.recording_s3_key, recording?.status])

  // Look up the linked meeting for proposal generation
  useEffect(() => {
    if (!id || !recording || recording.status !== 'ready') return

    let cancelled = false

    supabase
      .from('meetings')
      .select('id')
      .eq('recording_id', id)
      .eq('source_type', '60_notetaker')
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) {
          setLinkedMeetingId(data.id)
        }
      })

    return () => { cancelled = true }
  }, [id, recording?.status])

  // Handle download - fetches fresh signed URL and triggers download
  const handleDownload = async () => {
    if (!id) return

    setIsDownloading(true)
    try {
      const result = await recordingService.getRecordingUrl(id)

      if (!result.success || !result.url) {
        toast.error(result.error || 'Failed to get download URL')
        return
      }

      // Create a temporary link and trigger download
      const link = document.createElement('a')
      link.href = result.url
      link.download = `${recording?.meeting_title || 'recording'}.mp4`
      link.target = '_blank'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      toast.success('Download started')
    } catch (err) {
      toast.error('Failed to download recording')
    } finally {
      setIsDownloading(false)
    }
  }

  if (isLoading) {
    return <RecordingDetailSkeleton />
  }

  if (error || !recording) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Recording Not Found
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            The recording you're looking for doesn't exist or you don't have access to it.
          </p>
          <Button onClick={() => navigate('/recordings')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Recordings
          </Button>
        </div>
      </div>
    )
  }

  const status = statusConfig[recording.status]
  const platform = platformConfig[recording.meeting_platform]
  const hasAiInsights = recording.sentiment_score != null || recording.coach_rating != null || recording.talk_time_rep_pct != null

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between"
      >
        <div className="flex items-start gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate('/recordings')}
            className="shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {recording.meeting_title || 'Untitled Recording'}
              </h1>
              <Badge variant={status.variant} className="gap-1">
                {status.icon}
                {status.label}
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
              <Badge variant="outline" className={cn("text-xs", platform?.color)}>
                {platform?.label || recording.meeting_platform}
              </Badge>
              {recording.meeting_start_time && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(recording.meeting_start_time), 'PPp')}
                </span>
              )}
              {recording.meeting_duration_seconds && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDuration(recording.meeting_duration_seconds)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {linkedMeetingId && recording.status === 'ready' && (
            <Button
              size="sm"
              onClick={() => setShowProposalWizard(true)}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <FileText className="h-4 w-4" />
              Generate Proposal
            </Button>
          )}
          {recording.recording_s3_key && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleDownload}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {isDownloading ? 'Downloading...' : 'Download'}
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-2">
            <Share2 className="h-4 w-4" />
            Share
          </Button>
        </div>
      </motion.div>

      {/* Video Player */}
      {recording.status === 'ready' && recording.recording_s3_key && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="bg-black rounded-xl overflow-hidden aspect-video">
            {isLoadingVideo ? (
              <div className="w-full h-full flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-white animate-spin" />
              </div>
            ) : videoUrl ? (
              <video
                controls
                className="w-full h-full"
                src={videoUrl}
                poster={recording.thumbnail_url || undefined}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                <Video className="h-12 w-12" />
                <p className="text-sm">Video unavailable</p>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* HITL Alert */}
      {recording.hitl_required && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4"
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <div className="flex-1">
              <p className="font-medium text-amber-800 dark:text-amber-200">
                Review Required
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                {recording.hitl_type === 'speaker_confirmation'
                  ? 'Please confirm the speaker identifications for accurate CRM sync.'
                  : recording.hitl_type === 'deal_selection'
                  ? 'Please select which deal this recording should be linked to.'
                  : 'This recording needs your attention.'}
              </p>
            </div>
            <Button variant="outline" size="sm" className="border-amber-500/50 text-amber-700 dark:text-amber-300">
              Review Now
            </Button>
          </div>
        </motion.div>
      )}

      {/* Stats Cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
      >
        <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/30">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-1">
            <Users className="h-4 w-4" />
            Speakers
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {recording.speakers?.length || 0}
          </div>
        </div>

        <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/30">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-1">
            <ClipboardList className="h-4 w-4" />
            Action Items
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {recording.action_items?.length || 0}
          </div>
        </div>

        {recording.sentiment_score != null ? (
          <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/30">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-1">
              <TrendingUp className="h-4 w-4" />
              Sentiment
            </div>
            <div className="flex items-center gap-2">
              <Badge className={cn("text-xs", getSentimentColor(recording.sentiment_score))}>
                {getSentimentLabel(recording.sentiment_score)}
              </Badge>
            </div>
          </div>
        ) : (
          <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/30">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-1">
              <Sparkles className="h-4 w-4" />
              Highlights
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {recording.highlights?.length || 0}
            </div>
          </div>
        )}

        {recording.coach_rating != null ? (
          <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/30">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-1">
              <BarChart3 className="h-4 w-4" />
              Coach Rating
            </div>
            <div className={cn("text-2xl font-bold", getCoachColor(recording.coach_rating))}>
              {Math.round(recording.coach_rating)}/100
            </div>
          </div>
        ) : (
          <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/30">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-1">
              <Building2 className="h-4 w-4" />
              CRM Links
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {recording.crm_contacts?.length || 0}
            </div>
          </div>
        )}
      </motion.div>

      {/* Video Player */}
      {recording.recording_s3_key && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl border border-gray-200/50 dark:border-gray-700/30 overflow-hidden"
        >
          <div className="p-4 border-b border-gray-200/50 dark:border-gray-700/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Video className="h-5 w-5 text-emerald-500" />
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Recording</h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={refreshVideoUrl}
              disabled={videoLoading}
              className="gap-2"
            >
              <RefreshCw className={cn("h-4 w-4", videoLoading && "animate-spin")} />
              Refresh
            </Button>
          </div>

          <div className="aspect-video bg-black relative">
            {videoLoading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <Loader2 className="h-12 w-12 text-emerald-500 animate-spin mx-auto mb-3" />
                  <p className="text-gray-400 text-sm">Loading video...</p>
                </div>
              </div>
            ) : videoError ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-3" />
                  <p className="text-gray-400 text-sm mb-3">{videoError}</p>
                  <Button variant="outline" size="sm" onClick={refreshVideoUrl}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry
                  </Button>
                </div>
              </div>
            ) : videoUrl ? (
              <video
                ref={videoRef}
                src={videoUrl}
                controls
                className="w-full h-full"
                poster={recording.thumbnail_url || undefined}
                onError={() => {
                  setVideoError('Video playback failed. The URL may have expired.')
                }}
              >
                Your browser does not support the video tag.
              </video>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <Video className="h-12 w-12 text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-400 text-sm">
                    {recording.status === 'processing'
                      ? 'Video is being processed...'
                      : 'Video not available'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Content Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Tabs defaultValue="summary" className="w-full">
          <TabsList className="bg-white/80 dark:bg-gray-900/40 border border-gray-200/50 dark:border-gray-700/30">
            <TabsTrigger value="summary" className="gap-2">
              <Sparkles className="h-4 w-4" />
              Summary
            </TabsTrigger>
            <TabsTrigger value="transcript" className="gap-2">
              <FileText className="h-4 w-4" />
              Transcript
            </TabsTrigger>
            <TabsTrigger value="speakers" className="gap-2">
              <Users className="h-4 w-4" />
              Speakers
            </TabsTrigger>
            <TabsTrigger value="actions" className="gap-2">
              <ClipboardList className="h-4 w-4" />
              Actions
            </TabsTrigger>
            {hasAiInsights && (
              <TabsTrigger value="insights" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                AI Insights
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="summary" className="mt-4">
            <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl p-6 border border-gray-200/50 dark:border-gray-700/30">
              {recording.summary ? (
                <div className="prose dark:prose-invert max-w-none">
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {recording.summary}
                  </p>
                </div>
              ) : (
                <div className="text-center py-12">
                  <Sparkles className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">
                    {recording.status === 'processing'
                      ? 'Summary is being generated...'
                      : 'No summary available for this recording.'}
                  </p>
                </div>
              )}

              {/* Highlights */}
              {recording.highlights && recording.highlights.length > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-200/50 dark:border-gray-700/30">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                    Key Highlights
                  </h3>
                  <div className="space-y-3">
                    {recording.highlights.map((highlight, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                      >
                        <Badge variant="outline" className="capitalize shrink-0">
                          {highlight.type.replace('_', ' ')}
                        </Badge>
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          {highlight.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="transcript" className="mt-4">
            <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl p-6 border border-gray-200/50 dark:border-gray-700/30">
              {recording.transcript_json?.utterances ? (
                <div className="space-y-4 max-h-[600px] overflow-y-auto">
                  {recording.transcript_json.utterances.map((utterance, index) => (
                    <div key={index} className="flex gap-3">
                      <div className="shrink-0 w-24 text-xs text-gray-500 dark:text-gray-400 pt-1">
                        {Math.floor(utterance.start / 60)}:{String(Math.floor(utterance.start % 60)).padStart(2, '0')}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-emerald-600 dark:text-emerald-400 mb-1">
                          {utterance.speaker_name || `Speaker ${utterance.speaker_id}`}
                        </div>
                        <p className="text-gray-700 dark:text-gray-300 text-sm">
                          {utterance.text}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : recording.transcript_text ? (
                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {recording.transcript_text}
                </p>
              ) : (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">
                    {recording.status === 'processing'
                      ? 'Transcript is being processed...'
                      : 'No transcript available for this recording.'}
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="speakers" className="mt-4">
            <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl p-6 border border-gray-200/50 dark:border-gray-700/30">
              {recording.speakers && recording.speakers.length > 0 ? (
                <div className="space-y-4">
                  {recording.speakers.map((speaker, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold",
                          speaker.is_internal ? 'bg-emerald-500' : 'bg-blue-500'
                        )}>
                          {(speaker.name || speaker.email || `S${speaker.speaker_id}`).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 dark:text-gray-100">
                            {speaker.name || speaker.email || `Speaker ${speaker.speaker_id}`}
                          </div>
                          {speaker.email && speaker.name && (
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {speaker.email}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge variant={speaker.is_internal ? 'default' : 'outline'}>
                          {speaker.is_internal ? 'Internal' : 'External'}
                        </Badge>
                        {speaker.talk_time_percent !== undefined && (
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {Math.round(speaker.talk_time_percent)}% talk time
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Users className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">
                    No speaker information available.
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="actions" className="mt-4">
            <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl p-6 border border-gray-200/50 dark:border-gray-700/30">
              {recording.action_items && recording.action_items.length > 0 ? (
                <div className="space-y-3">
                  {recording.action_items.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                    >
                      <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          {index + 1}
                        </span>
                      </div>
                      <div className="flex-1">
                        <p className="text-gray-700 dark:text-gray-300">
                          {item.text}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-sm text-gray-500 dark:text-gray-400">
                          {item.assignee && (
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {item.assignee}
                            </span>
                          )}
                          {item.due_date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(item.due_date), 'MMM d, yyyy')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <ClipboardList className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">
                    No action items identified in this recording.
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* AI Insights Tab */}
          {hasAiInsights && (
            <TabsContent value="insights" className="mt-4">
              <div className="space-y-4">
                {/* Sentiment Analysis */}
                {recording.sentiment_score != null && (
                  <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl p-6 border border-gray-200/50 dark:border-gray-700/30">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100">Sentiment Analysis</h3>
                      <Badge className={getSentimentColor(recording.sentiment_score)}>
                        {getSentimentLabel(recording.sentiment_score)} ({(recording.sentiment_score * 100).toFixed(0)}%)
                      </Badge>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className={cn(
                          "h-2 rounded-full transition-all",
                          recording.sentiment_score >= 0.3 ? 'bg-emerald-500' :
                          recording.sentiment_score >= -0.3 ? 'bg-gray-400' : 'bg-red-500'
                        )}
                        style={{ width: `${Math.max(5, ((recording.sentiment_score + 1) / 2) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Talk Time */}
                {recording.talk_time_rep_pct != null && recording.talk_time_customer_pct != null && (
                  <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl p-6 border border-gray-200/50 dark:border-gray-700/30">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100">Talk Time Balance</h3>
                      {recording.talk_time_judgement && (
                        <Badge variant="outline" className={getTalkTimeColor(recording.talk_time_judgement)}>
                          {recording.talk_time_judgement === 'good' ? 'Balanced' :
                           recording.talk_time_judgement === 'high' ? 'Rep Dominant' : 'Low Rep Talk'}
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-gray-600 dark:text-gray-400">Rep</span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">{Math.round(recording.talk_time_rep_pct)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div className="h-2 rounded-full bg-blue-500" style={{ width: `${recording.talk_time_rep_pct}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-gray-600 dark:text-gray-400">Customer</span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">{Math.round(recording.talk_time_customer_pct)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${recording.talk_time_customer_pct}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Coaching Insights */}
                {recording.coach_rating != null && (
                  <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl p-6 border border-gray-200/50 dark:border-gray-700/30">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100">Coaching Score</h3>
                      <span className={cn("text-2xl font-bold", getCoachColor(recording.coach_rating))}>
                        {Math.round(recording.coach_rating)}/100
                      </span>
                    </div>
                    {recording.coach_summary && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                        {recording.coach_summary}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </motion.div>

      {/* Proposal Wizard */}
      {linkedMeetingId && (
        <ProposalWizard
          open={showProposalWizard}
          onOpenChange={setShowProposalWizard}
          meetingIds={[linkedMeetingId]}
        />
      )}
    </div>
  )
}

export default RecordingDetail
