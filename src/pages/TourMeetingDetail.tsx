/**
 * TourMeetingDetail
 *
 * A fully static meeting detail page rendered during the product tour.
 * All data comes from tourDemoData — no Supabase queries, no realtime
 * subscriptions. Mirrors the layout of MeetingDetail without reusing it.
 */

import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ArrowLeft,
  Play,
  TrendingUp,
  Clock,
  Users,
  Star,
  CheckCircle2,
  Zap,
  Target,
  MessageSquare,
  ListChecks,
  ChevronRight,
} from 'lucide-react'
import { TOUR_DEMO_DETAIL, type TranscriptLine } from '@/components/tour/tourDemoData'
import { useTourStore } from '@/lib/stores/tourStore'

// Step index at which the transcript tab must be active (0-based, matches TOUR_STEPS)
const TRANSCRIPT_TOUR_STEP = 6

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function getSentimentLabel(score: number): string {
  if (score >= 0.7) return 'Positive'
  if (score >= 0.4) return 'Neutral'
  return 'Negative'
}

function getSentimentBadgeClass(score: number): string {
  if (score >= 0.7)
    return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
  if (score >= 0.4)
    return 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/20'
  return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20'
}

function getSentimentBarColor(score: number): string {
  if (score >= 0.7) return 'bg-emerald-500'
  if (score >= 0.4) return 'bg-yellow-500'
  return 'bg-red-500'
}

// Speaker color slots — deterministic based on index
const SPEAKER_COLORS: { text: string; bg: string; border: string }[] = [
  {
    text: 'text-emerald-700 dark:text-emerald-400',
    bg: 'bg-emerald-500',
    border: 'border-emerald-200 dark:border-emerald-500/20',
  },
  {
    text: 'text-indigo-700 dark:text-indigo-400',
    bg: 'bg-indigo-500',
    border: 'border-indigo-200 dark:border-indigo-500/20',
  },
  {
    text: 'text-amber-700 dark:text-amber-400',
    bg: 'bg-amber-500',
    border: 'border-amber-200 dark:border-amber-500/20',
  },
  {
    text: 'text-pink-700 dark:text-pink-400',
    bg: 'bg-pink-500',
    border: 'border-pink-200 dark:border-pink-500/20',
  },
]

function getSpeakerSlot(
  speaker: string,
  slotMap: Map<string, number>,
  nextSlot: { current: number }
): number {
  if (!slotMap.has(speaker)) {
    slotMap.set(speaker, nextSlot.current % SPEAKER_COLORS.length)
    nextSlot.current += 1
  }
  return slotMap.get(speaker)!
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Thin horizontal progress bar */
function ProgressBar({
  value,
  colorClass,
  className,
}: {
  value: number
  colorClass: string
  className?: string
}) {
  return (
    <div className={`h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden ${className ?? ''}`}>
      <div
        className={`h-full rounded-full transition-all ${colorClass}`}
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
    </div>
  )
}

/** Video placeholder area */
function VideoPlaceholder() {
  return (
    <div className="w-full rounded-2xl bg-gray-900 overflow-hidden flex flex-col items-center justify-center gap-4 select-none"
      style={{ height: '320px' }}>
      {/* Fake waveform decoration */}
      <div className="flex items-end gap-0.5 opacity-20">
        {[18, 28, 14, 36, 22, 40, 16, 32, 24, 38, 12, 30, 20, 44, 18, 28, 36, 14, 26, 34].map(
          (h, i) => (
            <div
              key={i}
              className="w-1 rounded-sm bg-emerald-400"
              style={{ height: `${h}px` }}
            />
          )
        )}
      </div>

      {/* Play button */}
      <div className="w-16 h-16 rounded-full bg-white/10 border border-white/20 flex items-center justify-center backdrop-blur-sm">
        <Play className="h-7 w-7 text-white fill-white ml-1" />
      </div>

      <p className="text-sm text-gray-400 text-center px-6">
        Recording available after your first meeting
      </p>
    </div>
  )
}

/** Sentiment analysis card */
function SentimentCard({
  score,
  reasoning,
}: {
  score: number
  reasoning: string
}) {
  return (
    <div className="rounded-2xl border border-gray-200/50 dark:border-gray-700/30 bg-white/80 dark:bg-gray-900/40 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold text-sm">Sentiment Analysis</span>
        </div>
        <Badge
          variant="outline"
          className={getSentimentBadgeClass(score)}
        >
          {getSentimentLabel(score)} ({Math.round(score * 100)}%)
        </Badge>
      </div>

      <ProgressBar
        value={score}
        colorClass={getSentimentBarColor(score)}
        className="mb-3"
      />

      <p className="text-sm text-muted-foreground leading-relaxed">{reasoning}</p>
    </div>
  )
}

/** Talk time card */
function TalkTimeCard({
  repPct,
  customerPct,
}: {
  repPct: number
  customerPct: number
}) {
  return (
    <div className="rounded-2xl border border-gray-200/50 dark:border-gray-700/30 bg-white/80 dark:bg-gray-900/40 p-5">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <span className="font-semibold text-sm">Talk Time</span>
        <Badge
          variant="outline"
          className="ml-auto text-xs bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
        >
          Good balance
        </Badge>
      </div>

      {/* Stacked bar */}
      <div className="flex h-3 rounded-full overflow-hidden mb-3">
        <div
          className="bg-indigo-500 transition-all"
          style={{ width: `${repPct}%` }}
        />
        <div
          className="bg-emerald-500 transition-all"
          style={{ width: `${customerPct}%` }}
        />
      </div>

      <div className="flex justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-indigo-500" />
          <span>You — {repPct}%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500" />
          <span>Customer — {customerPct}%</span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
        Excellent listening ratio. Keeping talk time under 40% drives 2.3x higher close rates
        on demo calls.
      </p>
    </div>
  )
}

/** AI summary tab content */
function SummaryTabContent() {
  const { aiSummary } = TOUR_DEMO_DETAIL

  return (
    <div className="space-y-6 py-2">
      {/* Overview */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          Overview
        </h3>
        <p className="text-sm text-foreground leading-relaxed">{aiSummary.overview}</p>
      </div>

      {/* Key Topics */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5" />
          Key Topics
        </h3>
        <ul className="space-y-1.5">
          {aiSummary.key_topics.map((topic, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-indigo-500" />
              <span>{topic}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Action Items */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
          <ListChecks className="h-3.5 w-3.5" />
          Action Items
        </h3>
        <ul className="space-y-1.5">
          {aiSummary.action_items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-500" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Buyer Signals */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-amber-500" />
          Buyer Signals
        </h3>
        <ul className="space-y-2">
          {aiSummary.buyer_signals.map((signal, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-sm bg-amber-50/60 dark:bg-amber-500/5 border border-amber-100 dark:border-amber-500/10 rounded-lg px-3 py-2"
            >
              <Zap className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
              <span className="italic text-foreground/90">{signal}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Next Steps */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
          <ChevronRight className="h-3.5 w-3.5" />
          Next Steps
        </h3>
        <ul className="space-y-1.5">
          {aiSummary.next_steps.map((step, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 shrink-0 w-4 h-4 rounded-full bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** Transcript tab content */
function TranscriptTabContent({ lines }: { lines: TranscriptLine[] }) {
  const slotMap = new Map<string, number>()
  const nextSlot = { current: 0 }
  let prevSpeaker: string | null = null

  return (
    <div
      className="max-h-[600px] overflow-y-auto pr-1 space-y-0 scrollbar-custom"
      data-tour="meeting-transcript"
    >
      {lines.map((line, idx) => {
        const slot = getSpeakerSlot(line.speaker, slotMap, nextSlot)
        const colors = SPEAKER_COLORS[slot]
        const firstName = line.speaker.split(' ')[0]
        const initial = firstName[0]?.toUpperCase() ?? '?'
        const isCont = line.speaker === prevSpeaker
        prevSpeaker = line.speaker

        return (
          <React.Fragment key={idx}>
            {!isCont && idx > 0 && (
              <div className="my-2 h-px bg-gradient-to-r from-transparent via-gray-200/60 dark:via-gray-700/40 to-transparent" />
            )}
            <div
              className={`flex items-start gap-3 px-2 py-2 rounded-lg transition-colors ${
                line.isKeyMoment
                  ? 'bg-amber-50/50 dark:bg-amber-500/5 border border-amber-100 dark:border-amber-500/10'
                  : 'hover:bg-gray-50/80 dark:hover:bg-gray-800/30'
              }`}
            >
              {/* Avatar column */}
              <div className="w-9 shrink-0 flex flex-col items-center gap-1 pt-0.5">
                {!isCont ? (
                  <>
                    <div
                      className={`w-6 h-6 rounded-md flex items-center justify-center text-white text-[10px] font-bold shrink-0 ${colors.bg}`}
                    >
                      {initial}
                    </div>
                    <span className={`text-[10px] font-medium leading-none ${colors.text}`}>
                      {firstName}
                    </span>
                  </>
                ) : (
                  <div className="w-6 h-6" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] text-muted-foreground font-mono">{line.timestamp}</span>
                  {line.isKeyMoment && (
                    <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                      <Zap className="h-2.5 w-2.5" />
                      Key moment
                    </span>
                  )}
                </div>
                <p className="text-sm text-foreground leading-relaxed">{line.text}</p>
              </div>
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}

/** Attendees sidebar card */
function AttendeesCard() {
  const { attendees } = TOUR_DEMO_DETAIL

  return (
    <div className="rounded-2xl border border-gray-200/50 dark:border-gray-700/30 bg-white/80 dark:bg-gray-900/40 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Users className="h-4 w-4 text-muted-foreground" />
        <span className="font-semibold text-sm">Attendees</span>
        <span className="ml-auto text-xs text-muted-foreground">{attendees.length}</span>
      </div>

      <div className="space-y-3">
        {attendees.map((att) => (
          <div key={att.id} className="flex items-center gap-3">
            {/* Avatar */}
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ backgroundColor: att.avatarColor }}
            >
              {att.initials}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{att.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {att.title} · {att.company}
              </p>
            </div>

            {/* Badge */}
            <Badge
              variant="outline"
              className={
                att.isExternal
                  ? 'text-xs shrink-0 bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20'
                  : 'text-xs shrink-0 bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-500/10 dark:text-gray-400 dark:border-gray-500/20'
              }
            >
              {att.isExternal ? 'External' : 'Internal'}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Meeting info sidebar card */
function MeetingInfoCard() {
  const { durationMinutes, date, meetingType, coachRating, openTaskCount } = TOUR_DEMO_DETAIL

  return (
    <div className="rounded-2xl border border-gray-200/50 dark:border-gray-700/30 bg-white/80 dark:bg-gray-900/40 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Star className="h-4 w-4 text-muted-foreground" />
        <span className="font-semibold text-sm">Meeting Info</span>
      </div>

      <div className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Duration
          </span>
          <span className="font-medium">{durationMinutes} min</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Date</span>
          <span className="font-medium text-xs text-right">
            {new Date(date).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Type</span>
          <Badge
            variant="outline"
            className="capitalize text-xs bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20"
          >
            {meetingType}
          </Badge>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5 text-amber-500" />
            Coach rating
          </span>
          <span className="font-medium">
            {coachRating}
            <span className="text-muted-foreground font-normal">/10</span>
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Open tasks
          </span>
          <Badge
            variant="outline"
            className="text-xs bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20"
          >
            {openTaskCount}
          </Badge>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function TourMeetingDetail() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'summary' | 'transcript'>('summary')

  // When the tour advances to the transcript step (step 6), automatically
  // switch to the transcript tab so [data-tour="meeting-transcript"] is in
  // the DOM and driver.js can find the element to highlight.
  const currentTourStep = useTourStore((s) => s.currentTourStep)
  useEffect(() => {
    if (currentTourStep === TRANSCRIPT_TOUR_STEP) {
      setActiveTab('transcript')
    } else if (currentTourStep >= 0 && currentTourStep < TRANSCRIPT_TOUR_STEP) {
      // Going backward past the transcript step: restore summary tab
      setActiveTab('summary')
    }
  }, [currentTourStep])

  const {
    title,
    date,
    durationMinutes,
    meetingType,
    sentimentScore,
    sentimentReasoning,
    talkTimeRepPct,
    talkTimeCustomerPct,
    transcript,
  } = TOUR_DEMO_DETAIL

  return (
    <div
      className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6 max-w-7xl min-w-0"
      data-tour="meeting-detail"
    >
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 min-w-0">
        <div className="space-y-1 sm:space-y-2 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Button
              onClick={() => navigate('/meetings')}
              variant="ghost"
              size="sm"
              className="min-h-[40px]"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Back</span>
            </Button>
          </div>

          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold break-words">{title}</h1>

          <p className="text-xs sm:text-sm text-muted-foreground break-words">
            {formatDate(date)} · {durationMinutes} min
          </p>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-2 sm:flex-nowrap sm:flex-shrink-0">
          <Badge
            variant="outline"
            className="capitalize bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border-blue-200 dark:border-blue-500/20"
          >
            {meetingType}
          </Badge>
          <Badge variant="outline" className={getSentimentBadgeClass(sentimentScore)}>
            {getSentimentLabel(sentimentScore)} ({Math.round(sentimentScore * 100)}%)
          </Badge>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Main 12-column grid                                                 */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 min-w-0">
        {/* ================================================================ */}
        {/* Left column — 8/12                                               */}
        {/* ================================================================ */}
        <div className="lg:col-span-8 space-y-3 sm:space-y-4 min-w-0">
          {/* Video placeholder */}
          <VideoPlaceholder />

          {/* AI Analysis section */}
          <div className="space-y-3 sm:space-y-4" data-tour="meeting-analysis">
            <SentimentCard score={sentimentScore} reasoning={sentimentReasoning} />
            <TalkTimeCard repPct={talkTimeRepPct} customerPct={talkTimeCustomerPct} />
          </div>

          {/* Tabbed section */}
          <div className="rounded-2xl border border-gray-200/50 dark:border-gray-700/30 bg-white/80 dark:bg-gray-900/40 p-5">
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as 'summary' | 'transcript')}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="transcript">Transcript</TabsTrigger>
              </TabsList>

              <TabsContent value="summary" className="mt-0">
                <SummaryTabContent />
              </TabsContent>

              <TabsContent value="transcript" className="mt-0">
                <TranscriptTabContent lines={transcript} />
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* ================================================================ */}
        {/* Right column — 4/12                                              */}
        {/* ================================================================ */}
        <div className="lg:col-span-4 space-y-3 sm:space-y-4 min-w-0">
          <AttendeesCard />
          <MeetingInfoCard />
        </div>
      </div>
    </div>
  )
}

export default TourMeetingDetail
