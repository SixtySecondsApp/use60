/**
 * SandboxMeetings
 *
 * Pixel-perfect replica of the real 60 Meetings page (UnifiedMeetingsList).
 * RecordingCard grid with CallGridThumbnail, source/duration badges,
 * sentiment/coach/talk-time badges. Clicking opens MeetingDetail.
 */

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Video,
  LayoutGrid,
  List,
  Clock,
  Users,
  Play,
  Search,
  Filter,
  Smile,
  Meh,
  Frown,
  Star,
  Mic2,
  ArrowLeft,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { useSandboxData } from '../data/SandboxDataProvider';
import type { SandboxMeeting } from '../data/sandboxTypes';

// ── Source badge colors (matches real RecordingBadges.tsx SourceBadge - dark mode only) ──
const SOURCE_CONFIG: Record<string, { label: string; color: string }> = {
  fathom: { label: 'Fathom', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  zoom: { label: 'Zoom', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  teams: { label: 'Teams', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  google_meet: { label: 'Google Meet', color: 'bg-green-500/10 text-green-400 border-green-500/20' },
  '60_notetaker': { label: '60 Notetaker', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  fireflies: { label: 'Fireflies', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  voice: { label: 'Voice', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
};

const SENTIMENT_BADGE: Record<string, { icon: React.ElementType; bg: string; text: string; label: string }> = {
  positive: { icon: Smile, bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'Positive' },
  neutral: { icon: Meh, bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Neutral' },
  challenging: { icon: Frown, bg: 'bg-red-500/20', text: 'text-red-400', label: 'Challenging' },
};

function formatDuration(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes}m`;
}

// ── CallGridThumbnail (pixel-perfect match to real RecordingBadges.tsx) ──
function CallGridThumbnail({ attendees }: { attendees: { name: string }[] }) {
  const participants = attendees.slice(0, 4);
  const cols = participants.length <= 1 ? 'grid-cols-1 grid-rows-1' : 'grid-cols-2';
  const rows = participants.length <= 2 ? 'grid-rows-1' : 'grid-rows-2';

  return (
    <div className="rounded-lg overflow-hidden bg-[#0f172a] relative w-full h-full">
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.08] to-blue-500/[0.05]" />

      {/* Participant grid */}
      <div className={`grid gap-[3px] p-[3px] h-full relative ${cols} ${rows}`}>
        {participants.map((p, i) => {
          const initials = p.name.split(' ').map(n => n[0]).join('').slice(0, 2);
          return (
            <div key={i} className="rounded-md flex flex-col items-center justify-center bg-[#1e293b]">
              <div className="rounded-full flex items-center justify-center mb-0.5 bg-slate-700 w-5 h-5 sm:w-7 sm:h-7">
                <span className="text-[8px] sm:text-[10px] font-medium text-slate-300">{initials}</span>
              </div>
              <span className="text-[6px] sm:text-[8px] text-slate-400 truncate max-w-[90%] text-center">
                {p.name.split(' ')[0]}
              </span>
            </div>
          );
        })}
      </div>

      {/* REC indicator — bottom-left */}
      <div className="absolute bottom-0.5 left-1 flex items-center gap-0.5">
        <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse" />
        <span className="text-[5px] text-red-400/70 font-medium">REC</span>
      </div>
    </div>
  );
}

// ── StatCard (matches real UnifiedMeetingsList stat cards) ──
function StatCard({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) {
  return (
    <div className="bg-gray-900/40 backdrop-blur-xl rounded-xl px-4 py-3 border border-gray-700/30 shadow-lg shadow-black/10 hover:border-gray-600/40 transition-all duration-300 group w-full flex items-center gap-3">
      <div className="p-2 rounded-lg bg-gray-800/50 border border-gray-700/30 text-gray-400 group-hover:text-emerald-400 group-hover:border-emerald-500/30 transition-all duration-300 flex-shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-[11px] text-gray-500">{label}</p>
        <p className="text-sm font-semibold text-white">{value}</p>
      </div>
    </div>
  );
}

// ── RecordingCard (pixel-perfect match to real RecordingCard.tsx) ────
function RecordingCard({ meeting, index, onClick }: { meeting: SandboxMeeting; index: number; onClick: () => void }) {
  const sentiment = meeting.sentiment_label ? SENTIMENT_BADGE[meeting.sentiment_label] : null;
  const source = meeting.source ? SOURCE_CONFIG[meeting.source] : null;
  const date = new Date(meeting.meeting_start);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.35 }}
      onClick={onClick}
      className="bg-gray-900/40 backdrop-blur-xl rounded-2xl p-3 sm:p-5 border border-gray-700/30 hover:border-gray-600/40 transition-all duration-300 cursor-pointer group w-full"
    >
      {/* Thumbnail — aspect-video with CallGridThumbnail */}
      <div className="relative aspect-video rounded-xl mb-3 sm:mb-4 overflow-hidden border border-gray-700/20">
        <CallGridThumbnail attendees={meeting.attendees} />

        {/* Gradient overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

        {/* Play button on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-14 h-14 bg-gray-900/95 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
            <Play className="h-7 w-7 text-emerald-400 fill-current ml-1" />
          </div>
        </div>

        {/* Source badge — top-left */}
        {source && (
          <div className="absolute top-2 left-2">
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${source.color} backdrop-blur-sm`}>
              {source.label}
            </span>
          </div>
        )}

        {/* Duration badge — bottom-right (matches real) */}
        {meeting.duration_minutes > 0 && (
          <div className="absolute bottom-2 right-2">
            <span className="px-2 py-1 bg-gray-900/70 backdrop-blur-md rounded-lg text-xs text-gray-300 flex items-center gap-1 border border-gray-700/30">
              <Clock className="h-3 w-3" />
              {formatDuration(meeting.duration_minutes)}
            </span>
          </div>
        )}
      </div>

      {/* Content — matches real RecordingCard CardContent */}
      <div className="space-y-2">
        {/* Title — 2-line clamp */}
        <h3 className="text-sm font-medium text-gray-100 line-clamp-2 leading-snug">
          {meeting.title}
        </h3>

        {/* Meta row: date + company */}
        <div className="flex items-center gap-2 text-[11px] text-gray-400">
          <span>{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          {meeting.company_name && (
            <>
              <span className="text-gray-700">&middot;</span>
              <span className="truncate max-w-[120px]">{meeting.company_name}</span>
            </>
          )}
        </div>

        {/* Badges row: Sentiment + Coach + TalkTime */}
        <div className="flex flex-wrap items-center gap-1.5">
          {sentiment && (
            <span className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${sentiment.bg} ${sentiment.text} border-current/20`}>
              <sentiment.icon className="w-3 h-3" />
              {sentiment.label}
            </span>
          )}
          {meeting.coach_rating !== undefined && (
            <span className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
              meeting.coach_rating >= 8 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
              : meeting.coach_rating >= 6 ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
              : 'bg-orange-500/20 text-orange-400 border-orange-500/30'
            }`}>
              <Star className="w-3 h-3" />
              {meeting.coach_rating}/10
            </span>
          )}
          {meeting.talk_time_rep_pct !== undefined && (
            <span className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
              meeting.talk_time_judgement === 'good' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
              : meeting.talk_time_judgement === 'high' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
              : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
            }`}>
              <Mic2 className="w-3 h-3" />
              {meeting.talk_time_rep_pct}%
            </span>
          )}
        </div>

        {/* Summary preview */}
        {(meeting.summary_oneliner || meeting.next_steps_oneliner) && (
          <div className="p-2 bg-gray-800/30 rounded-lg space-y-1 border border-gray-700/20">
            {meeting.summary_oneliner && (
              <p className="text-[11px] text-gray-300 line-clamp-1">{meeting.summary_oneliner}</p>
            )}
            {meeting.next_steps_oneliner && (
              <p className="text-[11px] text-emerald-400 line-clamp-1">{meeting.next_steps_oneliner}</p>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Main Meetings Page ──────────────────────────────────────────────
export default function SandboxMeetings() {
  const { data } = useSandboxData();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const selectedMeeting = selectedId ? data.meetings.find(m => m.id === selectedId) : null;

  // Stats
  const totalMeetings = data.meetings.length;
  const avgDuration = Math.round(data.meetings.reduce((s, m) => s + m.duration_minutes, 0) / totalMeetings);
  const positiveCt = data.meetings.filter(m => m.sentiment_label === 'positive').length;
  const avgCoachRating = data.meetings.filter(m => m.coach_rating).length > 0
    ? (data.meetings.reduce((s, m) => s + (m.coach_rating ?? 0), 0) / data.meetings.filter(m => m.coach_rating).length).toFixed(1)
    : null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-white">Meetings</h2>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
            {totalMeetings} recordings
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-gray-900/50 border border-gray-800/50">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white/[0.08] text-white' : 'text-gray-500'}`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white/[0.08] text-white' : 'text-gray-500'}`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
          <button className="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]">
            <Filter className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats bar — matches real stat cards with icon boxes */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5 mb-6">
        <StatCard label="Total Meetings" value={totalMeetings.toString()} icon={Video} />
        <StatCard label="Avg Duration" value={`${avgDuration}m`} icon={Clock} />
        <StatCard label="Positive Sentiment" value={`${positiveCt}/${totalMeetings}`} icon={Smile} />
        <StatCard label="Avg Coach Rating" value={avgCoachRating ? `${avgCoachRating}/10` : 'N/A'} icon={Star} />
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-xl bg-gray-900/40 border border-gray-700/30">
        <Search className="w-4 h-4 text-gray-500" />
        <span className="text-sm text-gray-600">Search meetings...</span>
      </div>

      {/* Grid / Detail */}
      {selectedMeeting ? (
        <MeetingDetail meeting={selectedMeeting} onClose={() => setSelectedId(null)} />
      ) : (
        <div className={viewMode === 'grid'
          ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4'
          : 'space-y-2'
        }>
          {data.meetings.map((meeting, i) => (
            <RecordingCard
              key={meeting.id}
              meeting={meeting}
              index={i}
              onClick={() => setSelectedId(meeting.id)}
            />
          ))}
        </div>
      )}

      {/* Personalized CTA */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.5 }}
        className="mt-6 rounded-2xl p-5 bg-gradient-to-r from-[#37bd7e]/10 via-[#37bd7e]/5 to-transparent border border-[#37bd7e]/20 flex items-center justify-between"
      >
        <div>
          <p className="text-sm font-semibold text-white">
            Get AI meeting prep for every call
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Talking points, risk signals, and deal context — ready before you join
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[#37bd7e] text-sm font-medium flex-shrink-0">
          Start free trial
          <ArrowRight className="w-4 h-4" />
        </div>
      </motion.div>
    </div>
  );
}

// ── Meeting Detail ──────────────────────────────────────────────────
function MeetingDetail({ meeting, onClose }: { meeting: SandboxMeeting; onClose: () => void }) {
  const prep = meeting.prep;
  const sentiment = meeting.sentiment_label ? SENTIMENT_BADGE[meeting.sentiment_label] : null;
  const [analysisReady, setAnalysisReady] = useState(false);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;
    const timer = setTimeout(() => setAnalysisReady(true), 1800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to meetings
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Main content — 8 cols */}
        <div className="lg:col-span-8 space-y-4">
          {/* Recording card with CallGridThumbnail */}
          <div className="rounded-2xl overflow-hidden border border-gray-700/30 bg-gray-900/40 backdrop-blur-xl">
            <div className="relative aspect-video">
              <CallGridThumbnail attendees={meeting.attendees} />
              <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 via-transparent to-transparent" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 bg-gray-900/95 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg cursor-pointer hover:scale-110 transition-transform">
                  <Play className="h-8 w-8 text-emerald-400 fill-current ml-1" />
                </div>
              </div>
              {meeting.duration_minutes > 0 && (
                <div className="absolute bottom-3 right-3">
                  <span className="px-2 py-1 bg-gray-900/70 backdrop-blur-md rounded-lg text-xs text-gray-300 flex items-center gap-1 border border-gray-700/30">
                    <Clock className="h-3 w-3" />
                    {formatDuration(meeting.duration_minutes)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Title + meta */}
          <div>
            <h3 className="text-xl font-bold text-white mb-2">{meeting.title}</h3>
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{formatDuration(meeting.duration_minutes)}</span>
              <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />{meeting.attendees.length} attendees</span>
              {meeting.company_name && (
                <span className="text-[#37bd7e]">{meeting.company_name}</span>
              )}
            </div>
          </div>

          {/* AI Summary */}
          {!analysisReady ? (
            <div className="rounded-2xl p-5 border bg-gray-900/40 backdrop-blur-xl border-gray-700/30 flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-[#37bd7e] animate-spin" />
              <span className="text-xs text-gray-500 font-mono">Analyzing transcript...</span>
            </div>
          ) : (meeting.summary_oneliner || meeting.coach_summary) && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl p-5 border bg-gray-900/40 backdrop-blur-xl border-gray-700/30"
            >
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">AI Summary</h4>
              {meeting.summary_oneliner && (
                <p className="text-sm text-gray-300 leading-relaxed mb-2">{meeting.summary_oneliner}</p>
              )}
              {meeting.next_steps_oneliner && (
                <p className="text-sm text-emerald-400 leading-relaxed">{meeting.next_steps_oneliner}</p>
              )}
            </motion.div>
          )}

          {/* Analytics bars */}
          {analysisReady && (
          <div className="rounded-2xl p-5 border bg-gray-900/40 backdrop-blur-xl border-gray-700/30 space-y-4">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Meeting Analytics</h4>

            {/* Sentiment */}
            {meeting.sentiment_score !== undefined && (
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-gray-500">Sentiment</span>
                  {sentiment && (
                    <span className={sentiment.text}>{sentiment.label}</span>
                  )}
                </div>
                <div className="h-2 rounded-full bg-gray-800/50 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      (meeting.sentiment_score ?? 0) > 0.25 ? 'bg-emerald-500'
                      : (meeting.sentiment_score ?? 0) < -0.25 ? 'bg-red-500'
                      : 'bg-yellow-500'
                    }`}
                    style={{ width: `${Math.round(((meeting.sentiment_score ?? 0) + 1) / 2 * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Coach Rating */}
            {meeting.coach_rating !== undefined && (
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-gray-500">Coach Rating</span>
                  <span className={
                    meeting.coach_rating >= 8 ? 'text-emerald-400'
                    : meeting.coach_rating >= 6 ? 'text-yellow-400'
                    : 'text-orange-400'
                  }>{meeting.coach_rating}/10</span>
                </div>
                <div className="h-2 rounded-full bg-gray-800/50 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      meeting.coach_rating >= 8 ? 'bg-emerald-500'
                      : meeting.coach_rating >= 6 ? 'bg-yellow-500'
                      : 'bg-orange-500'
                    }`}
                    style={{ width: `${meeting.coach_rating * 10}%` }}
                  />
                </div>
                {meeting.coach_summary && (
                  <p className="text-xs text-gray-500 italic mt-1.5">{meeting.coach_summary}</p>
                )}
              </div>
            )}

            {/* Talk Time */}
            {meeting.talk_time_rep_pct !== undefined && meeting.talk_time_customer_pct !== undefined && (
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-gray-500">Talk Time</span>
                  <span className={
                    meeting.talk_time_judgement === 'good' ? 'text-emerald-400'
                    : meeting.talk_time_judgement === 'high' ? 'text-orange-400'
                    : 'text-blue-400'
                  }>
                    {meeting.talk_time_judgement === 'good' ? 'Balanced'
                    : meeting.talk_time_judgement === 'high' ? 'Too much talking'
                    : 'Good listening'}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <div className="flex-1">
                    <div className="text-[10px] text-gray-600 mb-1">Rep ({meeting.talk_time_rep_pct}%)</div>
                    <div className="h-2 rounded-full bg-gray-800/50 overflow-hidden">
                      <div className="h-full rounded-full bg-blue-500" style={{ width: `${meeting.talk_time_rep_pct}%` }} />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="text-[10px] text-gray-600 mb-1">Customer ({meeting.talk_time_customer_pct}%)</div>
                    <div className="h-2 rounded-full bg-gray-800/50 overflow-hidden">
                      <div className="h-full rounded-full bg-purple-500" style={{ width: `${meeting.talk_time_customer_pct}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          )}

          {/* Meeting Prep */}
          {prep && (
            <div className="rounded-2xl p-5 border bg-gray-900/40 backdrop-blur-xl border-gray-700/30 space-y-4">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Meeting Prep</h4>

              {prep.company_overview && (
                <div>
                  <h5 className="text-xs font-medium text-gray-400 mb-1.5">Company Context</h5>
                  <p className="text-sm text-gray-300 leading-relaxed">{prep.company_overview}</p>
                </div>
              )}

              {prep.talking_points.length > 0 && (
                <div>
                  <h5 className="text-xs font-medium text-gray-400 mb-1.5">Talking Points</h5>
                  <div className="space-y-1.5">
                    {prep.talking_points.map((tp, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-gray-300">
                        <span className="text-[#37bd7e] font-mono text-xs mt-0.5">{i + 1}.</span>
                        <span>{tp}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {prep.risk_signals.length > 0 && (
                <div>
                  <h5 className="text-xs font-medium text-amber-400 mb-1.5">Risk Signals</h5>
                  <div className="space-y-1.5">
                    {prep.risk_signals.map((rs, i) => (
                      <p key={i} className="text-sm text-amber-400/80 pl-4 border-l-2 border-amber-500/20">{rs}</p>
                    ))}
                  </div>
                </div>
              )}

              {prep.questions_to_ask.length > 0 && (
                <div>
                  <h5 className="text-xs font-medium text-blue-400 mb-1.5">Questions to Ask</h5>
                  <div className="space-y-1.5">
                    {prep.questions_to_ask.map((q, i) => (
                      <p key={i} className="text-sm text-gray-300 pl-4 border-l-2 border-blue-500/20">{q}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar — 4 cols */}
        <div className="lg:col-span-4 space-y-4">
          {/* Attendees */}
          <div className="rounded-2xl p-4 border bg-gray-900/40 backdrop-blur-xl border-gray-700/30">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Attendees</h4>
            <div className="space-y-2">
              {meeting.attendees.map((a, i) => (
                <div key={i} className="flex items-center gap-2.5 p-2 rounded-lg bg-gray-800/30 border border-gray-700/20">
                  <div className="w-8 h-8 rounded-lg bg-[#37bd7e]/15 flex items-center justify-center text-[10px] font-bold text-[#37bd7e]">
                    {a.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-200 truncate">{a.name}</p>
                    {a.title && <p className="text-[10px] text-gray-500 truncate">{a.title}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Items */}
          {meeting.action_items && meeting.action_items.length > 0 && (
            <div className="rounded-2xl p-4 border bg-gray-900/40 backdrop-blur-xl border-gray-700/30">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Action Items
                <span className="ml-2 text-gray-600">
                  {meeting.action_items.filter(a => a.completed).length}/{meeting.action_items.length}
                </span>
              </h4>
              <div className="space-y-2">
                {meeting.action_items.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className={`w-4 h-4 mt-0.5 rounded border flex-shrink-0 flex items-center justify-center ${
                      item.completed
                        ? 'bg-[#37bd7e] border-[#37bd7e]'
                        : 'border-gray-600 bg-transparent'
                    }`}>
                      {item.completed && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className={`text-xs leading-relaxed ${
                      item.completed ? 'text-gray-500 line-through' : 'text-gray-300'
                    }`}>
                      {item.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deal Context */}
          {meeting.prep?.deal_context && (
            <div className="rounded-2xl p-4 border bg-gray-900/40 backdrop-blur-xl border-gray-700/30">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Deal Context</h4>
              <p className="text-xs text-gray-300 leading-relaxed">{meeting.prep.deal_context}</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
