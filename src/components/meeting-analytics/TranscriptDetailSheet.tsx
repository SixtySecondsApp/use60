/**
 * TranscriptDetailSheet - Slide-over detail view for a single transcript
 *
 * CRITICAL: SheetContent uses !top-16 !h-[calc(100vh-4rem)] per CLAUDE.md top bar offset rule.
 */

import React, { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Clock, Languages, FileText, MessageSquare, Target,
  AlertCircle, CheckSquare, ChevronDown,
  Lightbulb, Sparkles,
} from 'lucide-react';
import { AskAnythingPanel } from './AskAnythingPanel';
import { useMaTranscript, useMaInsights } from '@/lib/hooks/useMeetingAnalytics';
import type { MaMomentType } from '@/lib/types/meetingAnalytics';

interface TranscriptDetailSheetProps {
  transcriptId: string | undefined;
  open: boolean;
  onClose: () => void;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '\u2014';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatTime(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function sentimentBadgeClass(sentiment: string): string {
  switch (sentiment) {
    case 'positive': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
    case 'negative': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    case 'neutral': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
    case 'mixed': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
    default: return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  }
}

function priorityBadgeClass(priority: string | null): string {
  switch (priority) {
    case 'high': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    case 'medium': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
    case 'low': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
    default: return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  }
}

function priorityBorderClass(priority: string | null): string {
  switch (priority) {
    case 'high': return 'border-l-4 border-l-red-500';
    case 'medium': return 'border-l-4 border-l-amber-500';
    case 'low': return 'border-l-4 border-l-emerald-500';
    default: return 'border-l-4 border-l-gray-300 dark:border-l-gray-600';
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'completed': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
    case 'in_progress': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    case 'cancelled': return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
    default: return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
  }
}

const MOMENT_TYPE_ICON: Record<MaMomentType, typeof Target> = {
  decision: Target,
  agreement: CheckSquare,
  disagreement: AlertCircle,
  question: MessageSquare,
  insight: Lightbulb,
  blocker: AlertCircle,
  milestone: Target,
  other: FileText,
};

const MOMENT_TYPE_COLOR: Record<MaMomentType, string> = {
  decision: 'text-blue-500',
  agreement: 'text-emerald-500',
  disagreement: 'text-red-500',
  question: 'text-purple-500',
  insight: 'text-amber-500',
  blocker: 'text-red-500',
  milestone: 'text-blue-500',
  other: 'text-gray-500',
};

const MOMENT_TYPE_BG: Record<MaMomentType, string> = {
  decision: 'bg-blue-600/10 dark:bg-blue-500/20 border-blue-600/20',
  agreement: 'bg-emerald-600/10 dark:bg-emerald-500/20 border-emerald-600/20',
  disagreement: 'bg-red-600/10 dark:bg-red-500/20 border-red-600/20',
  question: 'bg-purple-600/10 dark:bg-purple-500/20 border-purple-600/20',
  insight: 'bg-amber-600/10 dark:bg-amber-500/20 border-amber-600/20',
  blocker: 'bg-red-600/10 dark:bg-red-500/20 border-red-600/20',
  milestone: 'bg-blue-600/10 dark:bg-blue-500/20 border-blue-600/20',
  other: 'bg-gray-100/80 dark:bg-gray-700/30 border-gray-300/30',
};

const SPEAKER_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4'];

function parseSpeakerTalkTime(fullText: string) {
  const lines = (fullText || '').split('\n').filter(l => l.trim());
  const speakerPattern = /^([A-Za-z\s\-'.]+):\s*(.*)$/;
  const stats: Record<string, number> = {};

  for (const line of lines) {
    const match = line.match(speakerPattern);
    if (match) {
      const speaker = match[1].trim();
      const words = match[2].trim().split(/\s+/).filter(w => w.length > 0).length;
      stats[speaker] = (stats[speaker] || 0) + words;
    }
  }

  const speakers = Object.entries(stats)
    .sort((a, b) => b[1] - a[1])
    .map(([name, wordCount]) => ({ name, wordCount, percentage: 0 }));
  const total = speakers.reduce((s, sp) => s + sp.wordCount, 0);
  speakers.forEach(sp => { sp.percentage = total > 0 ? Math.round(sp.wordCount / total * 100) : 0; });

  return { speakers, totalWords: total };
}

function SpeakerTranscriptView({ fullText }: { fullText: string }) {
  const lines = fullText.split('\n').filter(l => l.trim());
  const speakerPattern = /^([A-Za-z\s\-'.]+):\s*(.*)$/;
  const speakerColorMap = new Map<string, string>();
  let colorIndex = 0;

  const segments = lines.map(line => {
    const match = line.match(speakerPattern);
    if (match) {
      const speaker = match[1].trim();
      if (!speakerColorMap.has(speaker)) {
        speakerColorMap.set(speaker, SPEAKER_COLORS[colorIndex % SPEAKER_COLORS.length]);
        colorIndex++;
      }
      return { speaker, text: match[2].trim(), color: speakerColorMap.get(speaker)! };
    }
    return { speaker: null, text: line.trim(), color: '#6b7280' };
  });

  const hasSpeakers = segments.some(s => s.speaker !== null);

  if (!hasSpeakers) {
    return (
      <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed text-gray-700 dark:text-gray-300">
        {fullText}
      </pre>
    );
  }

  return (
    <div className="space-y-3">
      {segments.map((seg, i) => (
        seg.speaker ? (
          <div key={i} className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm"
                 style={{ backgroundColor: seg.color }}>
              {seg.speaker[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-semibold" style={{ color: seg.color }}>{seg.speaker}</span>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{seg.text}</p>
            </div>
          </div>
        ) : seg.text ? (
          <p key={i} className="text-sm text-gray-500 dark:text-gray-500 pl-11">{seg.text}</p>
        ) : null
      ))}
    </div>
  );
}

export function TranscriptDetailSheet({ transcriptId, open, onClose }: TranscriptDetailSheetProps) {
  const { data: transcript, isLoading: tLoading } = useMaTranscript(transcriptId);
  const { data: insights, isLoading: iLoading } = useMaInsights(transcriptId);

  const [showTranscript, setShowTranscript] = useState(false);
  const [showAsk, setShowAsk] = useState(false);
  const [expandedQA, setExpandedQA] = useState<Set<string>>(new Set());

  const isLoading = tLoading || iLoading;

  const toggleQA = (id: string) => {
    setExpandedQA((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Group key moments by type
  const groupedMoments = (insights?.keyMoments || []).reduce<Record<string, typeof insights.keyMoments>>((acc, m) => {
    const type = m.momentType;
    if (!acc[type]) acc[type] = [];
    acc[type].push(m);
    return acc;
  }, {});

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="!top-16 !h-[calc(100vh-4rem)] w-full sm:max-w-2xl overflow-y-auto p-0 bg-gray-50 dark:bg-[#0a0f1e]">
        {isLoading ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="h-px bg-gray-200/50 dark:bg-gray-700/30 my-4" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !transcript ? (
          <div className="p-6 text-center">
            <div className="p-4 bg-gray-100/80 dark:bg-gray-800/50 rounded-2xl inline-flex mb-4">
              <FileText className="h-10 w-10 text-gray-400" />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Transcript not found</p>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {/* Header */}
            <SheetHeader className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-4 border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10">
              <SheetTitle className="text-xl font-bold text-gray-900 dark:text-gray-100">{transcript.title || 'Untitled Meeting'}</SheetTitle>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="flex items-center gap-1.5 bg-white/80 dark:bg-gray-800/50 rounded-lg px-2.5 py-1 text-xs border border-gray-200/50 dark:border-gray-700/30 text-gray-600 dark:text-gray-400">
                  <Clock className="h-3.5 w-3.5" />
                  {new Date(transcript.createdAt).toLocaleDateString()}
                </span>
                <span className="flex items-center gap-1.5 bg-white/80 dark:bg-gray-800/50 rounded-lg px-2.5 py-1 text-xs border border-gray-200/50 dark:border-gray-700/30 text-gray-600 dark:text-gray-400">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDuration(transcript.audioDuration)}
                </span>
                {transcript.languageCode && (
                  <span className="flex items-center gap-1.5 bg-white/80 dark:bg-gray-800/50 rounded-lg px-2.5 py-1 text-xs border border-gray-200/50 dark:border-gray-700/30 text-gray-600 dark:text-gray-400">
                    <Languages className="h-3.5 w-3.5" />
                    {transcript.languageCode}
                  </span>
                )}
                {transcript.overallConfidence !== null && (
                  <span className="bg-white/80 dark:bg-gray-800/50 rounded-lg px-2.5 py-1 text-xs border border-gray-200/50 dark:border-gray-700/30 text-gray-600 dark:text-gray-400">
                    {Math.round(transcript.overallConfidence * 100)}% confidence
                  </span>
                )}
              </div>
            </SheetHeader>

            {/* Summary */}
            {insights?.summaries && insights.summaries.length > 0 && (
              <section className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-4 border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-gray-900 dark:text-gray-100">
                  <div className="p-1.5 bg-gray-100/80 dark:bg-gray-800/50 rounded-lg border border-gray-200/50 dark:border-gray-700/30">
                    <FileText className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                  </div>
                  Summary
                </h3>
                {insights.summaries.map((s) => (
                  <div key={s.id} className="mb-3 last:mb-0">
                    <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-md bg-gray-100/80 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/30 text-gray-600 dark:text-gray-400 capitalize mb-1.5">{s.summaryType}</span>
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{s.summaryText}</p>
                  </div>
                ))}
              </section>
            )}

            {/* Talk Time Visualization */}
            {transcript.fullText && (() => {
              const { speakers, totalWords } = parseSpeakerTalkTime(transcript.fullText);
              if (speakers.length === 0) return null;
              return (
                <section className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-4 border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-gray-900 dark:text-gray-100">
                    <div className="p-1.5 bg-gray-100/80 dark:bg-gray-800/50 rounded-lg border border-gray-200/50 dark:border-gray-700/30">
                      <MessageSquare className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                    </div>
                    Talk Time
                    <span className="text-xs font-normal text-gray-500 dark:text-gray-400">({totalWords.toLocaleString()} words)</span>
                  </h3>
                  {/* Stacked bar */}
                  <div className="h-6 rounded-full overflow-hidden flex bg-gray-100/80 dark:bg-gray-800/50">
                    {speakers.map((sp, i) => (
                      <div
                        key={sp.name}
                        className="h-full transition-all"
                        style={{
                          width: `${sp.percentage}%`,
                          backgroundColor: SPEAKER_COLORS[i % SPEAKER_COLORS.length],
                          minWidth: sp.percentage > 0 ? '2px' : 0,
                        }}
                        title={`${sp.name}: ${sp.percentage}%`}
                      />
                    ))}
                  </div>
                  {/* Speaker list */}
                  <div className="mt-3 space-y-2">
                    {speakers.map((sp, i) => (
                      <div key={sp.name} className="flex items-center gap-2.5 text-sm">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: SPEAKER_COLORS[i % SPEAKER_COLORS.length] }}
                        />
                        <span className="font-medium flex-1 min-w-0 truncate text-gray-700 dark:text-gray-300">{sp.name}</span>
                        <span className="text-gray-500 dark:text-gray-400 text-xs">{sp.wordCount.toLocaleString()} words</span>
                        <span className="text-gray-500 dark:text-gray-400 text-xs w-10 text-right">{sp.percentage}%</span>
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded-md ${
                          sp.percentage > 60
                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-200/50 dark:border-amber-700/30'
                            : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-700/30'
                        }`}>
                          {sp.percentage > 60 ? 'dominant' : 'balanced'}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })()}

            {/* Sentiment */}
            {insights?.sentiment && (
              <section className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-4 border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10">
                <h3 className="text-sm font-semibold mb-3 text-gray-900 dark:text-gray-100">Sentiment</h3>
                <div className="flex items-center gap-3 mb-3">
                  <Badge className={`${sentimentBadgeClass(insights.sentiment.sentiment)} border-0 capitalize`}>
                    {insights.sentiment.sentiment}
                  </Badge>
                  {insights.sentiment.confidence !== null && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {Math.round(insights.sentiment.confidence * 100)}% confidence
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {insights.sentiment.positiveScore !== null && (
                    <div className="bg-emerald-50 dark:bg-emerald-500/10 rounded-xl p-3 text-center border border-emerald-200/50 dark:border-emerald-500/20">
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Positive</div>
                      <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                        {Math.round(insights.sentiment.positiveScore * 100)}%
                      </div>
                    </div>
                  )}
                  {insights.sentiment.negativeScore !== null && (
                    <div className="bg-red-50 dark:bg-red-500/10 rounded-xl p-3 text-center border border-red-200/50 dark:border-red-500/20">
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Negative</div>
                      <div className="text-sm font-semibold text-red-600 dark:text-red-400">
                        {Math.round(insights.sentiment.negativeScore * 100)}%
                      </div>
                    </div>
                  )}
                  {insights.sentiment.neutralScore !== null && (
                    <div className="bg-amber-50 dark:bg-amber-500/10 rounded-xl p-3 text-center border border-amber-200/50 dark:border-amber-500/20">
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Neutral</div>
                      <div className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                        {Math.round(insights.sentiment.neutralScore * 100)}%
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Topics */}
            {insights?.topics && insights.topics.length > 0 && (
              <section className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-4 border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10">
                <h3 className="text-sm font-semibold mb-3 text-gray-900 dark:text-gray-100">Topics</h3>
                <div className="flex flex-wrap gap-2">
                  {insights.topics.map((t) => (
                    <span
                      key={t.id}
                      className={`bg-white/60 dark:bg-gray-800/40 rounded-lg px-2.5 py-1 text-xs border border-gray-200/50 dark:border-gray-700/30 text-gray-700 dark:text-gray-300 ${
                        (t.relevanceScore ?? 0) > 0.8
                          ? 'border-emerald-300/50 dark:border-emerald-700/30 bg-emerald-50/50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-300'
                          : (t.relevanceScore ?? 0) > 0.5
                            ? 'border-amber-300/50 dark:border-amber-700/30 bg-amber-50/50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-300'
                            : ''
                      }`}
                    >
                      {t.topicName}
                      {t.relevanceScore !== null && (
                        <span className="ml-1 opacity-60">{Math.round(t.relevanceScore * 100)}%</span>
                      )}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* Action Items */}
            {insights?.actionItems && insights.actionItems.length > 0 && (
              <section className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-4 border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-gray-900 dark:text-gray-100">
                  <div className="p-1.5 bg-amber-600/10 dark:bg-amber-500/20 rounded-lg border border-amber-600/20">
                    <CheckSquare className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  </div>
                  Action Items
                  <span className="text-xs font-normal text-gray-500 dark:text-gray-400">({insights.actionItems.length})</span>
                </h3>
                <div className="space-y-2">
                  {insights.actionItems.map((item) => (
                    <div key={item.id} className={`rounded-xl bg-white/60 dark:bg-gray-800/40 border border-gray-200/50 dark:border-gray-700/30 overflow-hidden ${priorityBorderClass(item.priority)}`}>
                      <div className="p-3">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{item.actionText}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          {item.assignee && (
                            <span className="text-xs font-medium px-1.5 py-0.5 rounded-md bg-gray-100/80 dark:bg-gray-700/50 border border-gray-200/50 dark:border-gray-600/30 text-gray-600 dark:text-gray-400">{item.assignee}</span>
                          )}
                          {item.priority && (
                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded-md ${priorityBadgeClass(item.priority)}`}>
                              {item.priority}
                            </span>
                          )}
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-md ${statusBadgeClass(item.status)}`}>
                            {item.status.replace('_', ' ')}
                          </span>
                          {item.dueDate && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              Due: {new Date(item.dueDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Key Moments */}
            {insights?.keyMoments && insights.keyMoments.length > 0 && (
              <section className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-4 border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-gray-900 dark:text-gray-100">
                  <div className="p-1.5 bg-gray-100/80 dark:bg-gray-800/50 rounded-lg border border-gray-200/50 dark:border-gray-700/30">
                    <Target className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                  </div>
                  Key Moments
                  <span className="text-xs font-normal text-gray-500 dark:text-gray-400">({insights.keyMoments.length})</span>
                </h3>
                {Object.entries(groupedMoments).map(([type, moments]) => {
                  const Icon = MOMENT_TYPE_ICON[type as MaMomentType] || FileText;
                  const color = MOMENT_TYPE_COLOR[type as MaMomentType] || 'text-gray-500';
                  const bgClass = MOMENT_TYPE_BG[type as MaMomentType] || 'bg-gray-100/80 dark:bg-gray-700/30 border-gray-300/30';
                  return (
                    <div key={type} className="mb-3 last:mb-0">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5">
                        <div className={`p-1 rounded-md border ${bgClass}`}>
                          <Icon className={`h-3 w-3 ${color}`} />
                        </div>
                        {type.replace('_', ' ')}s ({moments.length})
                      </h4>
                      <div className="space-y-2">
                        {moments.map((m) => (
                          <div key={m.id} className="bg-white/60 dark:bg-gray-800/40 rounded-xl p-3 border border-gray-200/50 dark:border-gray-700/30">
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{m.title || 'Untitled'}</p>
                            {m.description && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{m.description}</p>
                            )}
                            {(m.startTime !== null || m.importanceScore !== null) && (
                              <div className="flex gap-2 mt-1.5 items-center">
                                {m.startTime !== null && (
                                  <span className="text-xs text-gray-500 dark:text-gray-400">{formatTime(m.startTime)}</span>
                                )}
                                {m.importanceScore !== null && (
                                  <span className="text-xs font-medium px-1.5 py-0.5 rounded-md bg-gray-100/80 dark:bg-gray-700/50 border border-gray-200/50 dark:border-gray-600/30 text-gray-600 dark:text-gray-400">
                                    {m.importanceScore}/10
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </section>
            )}

            {/* Q&A Pairs */}
            {insights?.qaPairs && insights.qaPairs.length > 0 && (
              <section className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-4 border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-gray-900 dark:text-gray-100">
                  <div className="p-1.5 bg-purple-600/10 dark:bg-purple-500/20 rounded-lg border border-purple-600/20">
                    <MessageSquare className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                  </div>
                  Q&A Pairs
                  <span className="text-xs font-normal text-gray-500 dark:text-gray-400">({insights.qaPairs.length})</span>
                </h3>
                <div className="space-y-2">
                  {insights.qaPairs.map((qa) => {
                    const isExpanded = expandedQA.has(qa.id);
                    return (
                      <div key={qa.id} className="bg-white/60 dark:bg-gray-800/40 rounded-xl border border-gray-200/50 dark:border-gray-700/30 overflow-hidden">
                        <button
                          onClick={() => toggleQA(qa.id)}
                          className="w-full p-3 text-left flex items-start gap-2 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors"
                        >
                          <span className={`mt-0.5 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}>
                            <ChevronDown className="h-4 w-4 text-gray-400" />
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{qa.questionText}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`text-xs font-medium px-1.5 py-0.5 rounded-md ${qa.isAnswered
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                              }`}>
                                {qa.isAnswered ? 'Answered' : 'Unanswered'}
                              </span>
                              {qa.questioner && (
                                <span className="text-xs text-gray-500 dark:text-gray-400">by {qa.questioner}</span>
                              )}
                            </div>
                          </div>
                        </button>
                        {isExpanded && qa.answerText && (
                          <div className="px-3 pb-3 pl-9">
                            <div className="border-l-2 border-blue-400/50 dark:border-blue-500/40 pl-3 bg-blue-50/30 dark:bg-blue-500/5 rounded-r-lg py-2">
                              <p className="text-sm text-gray-600 dark:text-gray-400">{qa.answerText}</p>
                              {qa.answerer && (
                                <span className="text-xs text-gray-500 dark:text-gray-500 mt-1 block">
                                  &mdash; {qa.answerer}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Ask About This Meeting */}
            {transcriptId && (
              <section className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10 overflow-hidden">
                <button
                  onClick={() => setShowAsk(!showAsk)}
                  className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors"
                >
                  <span className={`transition-transform duration-200 ${showAsk ? 'rotate-0' : '-rotate-90'}`}>
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  </span>
                  <div className="p-1 bg-violet-600/10 dark:bg-violet-500/20 rounded-md border border-violet-600/20">
                    <Sparkles className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                  </div>
                  Ask About This Meeting
                </button>
                {showAsk && (
                  <div className="border-t border-gray-200/50 dark:border-gray-700/30 max-h-[400px] overflow-y-auto">
                    <AskAnythingPanel transcriptId={transcriptId} compact />
                  </div>
                )}
              </section>
            )}

            {/* Full Transcript */}
            <section className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10 overflow-hidden">
              <button
                onClick={() => setShowTranscript(!showTranscript)}
                className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors"
              >
                <span className={`transition-transform duration-200 ${showTranscript ? 'rotate-0' : '-rotate-90'}`}>
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                </span>
                <div className="p-1 bg-gray-100/80 dark:bg-gray-800/50 rounded-md border border-gray-200/50 dark:border-gray-700/30">
                  <FileText className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                </div>
                Full Transcript
              </button>
              {showTranscript && transcript.fullText && (
                <div className="border-t border-gray-200/50 dark:border-gray-700/30 max-h-96 overflow-y-auto p-4 bg-gray-50/50 dark:bg-gray-900/20">
                  <SpeakerTranscriptView fullText={transcript.fullText} />
                </div>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
