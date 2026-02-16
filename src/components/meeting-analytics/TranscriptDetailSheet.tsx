/**
 * TranscriptDetailSheet - Slide-over detail view for a single transcript
 *
 * CRITICAL: SheetContent uses !top-16 !h-[calc(100vh-4rem)] per CLAUDE.md top bar offset rule.
 */

import React, { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import {
  Clock, Languages, FileText, MessageSquare, Target,
  AlertCircle, CheckSquare, ChevronDown, ChevronRight,
  Lightbulb, Quote, Sparkles,
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

const SPEAKER_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4'];

function parseSpeakerTalkTime(fullText: string) {
  const lines = (fullText || '').split('\n').filter(l => l.trim());
  const speakerPattern = /^([A-Za-z\s\-'\.]+):\s*(.*)$/;
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
  const speakerPattern = /^([A-Za-z\s\-'\.]+):\s*(.*)$/;
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
      <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed">
        {fullText}
      </pre>
    );
  }

  return (
    <div className="space-y-3">
      {segments.map((seg, i) => (
        seg.speaker ? (
          <div key={i} className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                 style={{ backgroundColor: seg.color }}>
              {seg.speaker[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-semibold" style={{ color: seg.color }}>{seg.speaker}</span>
              <p className="text-sm text-muted-foreground leading-relaxed">{seg.text}</p>
            </div>
          </div>
        ) : seg.text ? (
          <p key={i} className="text-sm text-muted-foreground/60 pl-11">{seg.text}</p>
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
      <SheetContent side="right" className="!top-16 !h-[calc(100vh-4rem)] w-full sm:max-w-2xl overflow-y-auto p-0">
        {isLoading ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Separator />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !transcript ? (
          <div className="p-6 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p>Transcript not found</p>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Header */}
            <SheetHeader>
              <SheetTitle className="text-xl">{transcript.title || 'Untitled Meeting'}</SheetTitle>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mt-1">
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {new Date(transcript.createdAt).toLocaleDateString()}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDuration(transcript.audioDuration)}
                </span>
                {transcript.languageCode && (
                  <Badge variant="outline" className="text-xs">
                    <Languages className="h-3 w-3 mr-1" />
                    {transcript.languageCode}
                  </Badge>
                )}
                {transcript.overallConfidence !== null && (
                  <Badge variant="outline" className="text-xs">
                    {Math.round(transcript.overallConfidence * 100)}% confidence
                  </Badge>
                )}
              </div>
            </SheetHeader>

            <Separator />

            {/* Summary */}
            {insights?.summaries && insights.summaries.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Summary
                </h3>
                {insights.summaries.map((s) => (
                  <div key={s.id} className="mb-3">
                    <Badge variant="outline" className="text-xs mb-1 capitalize">{s.summaryType}</Badge>
                    <p className="text-sm text-muted-foreground leading-relaxed">{s.summaryText}</p>
                  </div>
                ))}
              </section>
            )}

            {/* Talk Time Visualization */}
            {transcript.fullText && (() => {
              const { speakers, totalWords } = parseSpeakerTalkTime(transcript.fullText);
              if (speakers.length === 0) return null;
              return (
                <section>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Talk Time ({totalWords.toLocaleString()} words)
                  </h3>
                  {/* Stacked bar */}
                  <div className="flex h-6 rounded-full overflow-hidden">
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
                  <div className="mt-2 space-y-1">
                    {speakers.map((sp, i) => (
                      <div key={sp.name} className="flex items-center gap-2 text-sm">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: SPEAKER_COLORS[i % SPEAKER_COLORS.length] }}
                        />
                        <span className="font-medium flex-1 min-w-0 truncate">{sp.name}</span>
                        <span className="text-muted-foreground text-xs">{sp.wordCount.toLocaleString()} words</span>
                        <span className="text-muted-foreground text-xs w-10 text-right">{sp.percentage}%</span>
                        <Badge variant="outline" className={`text-xs ${
                          sp.percentage > 60
                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
                            : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                        }`}>
                          {sp.percentage > 60 ? 'dominant' : 'balanced'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })()}

            {/* Sentiment */}
            {insights?.sentiment && (
              <section>
                <h3 className="text-sm font-semibold mb-2">Sentiment</h3>
                <div className="flex items-center gap-3">
                  <Badge className={sentimentBadgeClass(insights.sentiment.sentiment)}>
                    {insights.sentiment.sentiment}
                  </Badge>
                  {insights.sentiment.confidence !== null && (
                    <span className="text-sm text-muted-foreground">
                      {Math.round(insights.sentiment.confidence * 100)}% confidence
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {insights.sentiment.positiveScore !== null && (
                    <div className="text-center p-2 rounded-md bg-emerald-50 dark:bg-emerald-900/20">
                      <div className="text-xs text-muted-foreground">Positive</div>
                      <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                        {Math.round(insights.sentiment.positiveScore * 100)}%
                      </div>
                    </div>
                  )}
                  {insights.sentiment.negativeScore !== null && (
                    <div className="text-center p-2 rounded-md bg-red-50 dark:bg-red-900/20">
                      <div className="text-xs text-muted-foreground">Negative</div>
                      <div className="text-sm font-semibold text-red-600 dark:text-red-400">
                        {Math.round(insights.sentiment.negativeScore * 100)}%
                      </div>
                    </div>
                  )}
                  {insights.sentiment.neutralScore !== null && (
                    <div className="text-center p-2 rounded-md bg-amber-50 dark:bg-amber-900/20">
                      <div className="text-xs text-muted-foreground">Neutral</div>
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
              <section>
                <h3 className="text-sm font-semibold mb-2">Topics</h3>
                <div className="flex flex-wrap gap-2">
                  {insights.topics.map((t) => (
                    <Badge
                      key={t.id}
                      variant="outline"
                      className={
                        (t.relevanceScore ?? 0) > 0.8
                          ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700'
                          : (t.relevanceScore ?? 0) > 0.5
                            ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700'
                            : ''
                      }
                    >
                      {t.topicName}
                      {t.relevanceScore !== null && (
                        <span className="ml-1 text-xs opacity-60">{Math.round(t.relevanceScore * 100)}%</span>
                      )}
                    </Badge>
                  ))}
                </div>
              </section>
            )}

            {/* Action Items */}
            {insights?.actionItems && insights.actionItems.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <CheckSquare className="h-4 w-4" />
                  Action Items ({insights.actionItems.length})
                </h3>
                <div className="space-y-2">
                  {insights.actionItems.map((item) => (
                    <div key={item.id} className="p-3 rounded-md border bg-card text-sm">
                      <p className="font-medium">{item.actionText}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        {item.assignee && (
                          <Badge variant="secondary" className="text-xs">{item.assignee}</Badge>
                        )}
                        {item.priority && (
                          <Badge variant="outline" className={`text-xs ${priorityBadgeClass(item.priority)}`}>
                            {item.priority}
                          </Badge>
                        )}
                        <Badge variant="outline" className={`text-xs ${statusBadgeClass(item.status)}`}>
                          {item.status.replace('_', ' ')}
                        </Badge>
                        {item.dueDate && (
                          <span className="text-xs text-muted-foreground">
                            Due: {new Date(item.dueDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Key Moments */}
            {insights?.keyMoments && insights.keyMoments.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Key Moments ({insights.keyMoments.length})
                </h3>
                {Object.entries(groupedMoments).map(([type, moments]) => {
                  const Icon = MOMENT_TYPE_ICON[type as MaMomentType] || FileText;
                  const color = MOMENT_TYPE_COLOR[type as MaMomentType] || 'text-gray-500';
                  return (
                    <div key={type} className="mb-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                        <Icon className={`h-3.5 w-3.5 ${color}`} />
                        {type.replace('_', ' ')}s ({moments.length})
                      </h4>
                      <div className="space-y-1.5">
                        {moments.map((m) => (
                          <div key={m.id} className="pl-5 text-sm">
                            <p className="font-medium">{m.title || 'Untitled'}</p>
                            {m.description && (
                              <p className="text-muted-foreground text-xs mt-0.5">{m.description}</p>
                            )}
                            {(m.startTime !== null || m.importanceScore !== null) && (
                              <div className="flex gap-2 mt-0.5 text-xs text-muted-foreground">
                                {m.startTime !== null && <span>{formatTime(m.startTime)}</span>}
                                {m.importanceScore !== null && <span>Importance: {m.importanceScore}/10</span>}
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
              <section>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Q&A Pairs ({insights.qaPairs.length})
                </h3>
                <div className="space-y-2">
                  {insights.qaPairs.map((qa) => {
                    const isExpanded = expandedQA.has(qa.id);
                    return (
                      <div key={qa.id} className="border rounded-md bg-card overflow-hidden">
                        <button
                          onClick={() => toggleQA(qa.id)}
                          className="w-full p-3 text-left flex items-start gap-2 hover:bg-muted/50 transition-colors"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 mt-0.5 shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 mt-0.5 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{qa.questionText}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge
                                variant="outline"
                                className={`text-xs ${qa.isAnswered
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                                  : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                                }`}
                              >
                                {qa.isAnswered ? 'Answered' : 'Unanswered'}
                              </Badge>
                              {qa.questioner && (
                                <span className="text-xs text-muted-foreground">by {qa.questioner}</span>
                              )}
                            </div>
                          </div>
                        </button>
                        {isExpanded && qa.answerText && (
                          <div className="px-3 pb-3 pl-9">
                            <div className="border-l-2 border-muted pl-3">
                              <p className="text-sm text-muted-foreground">{qa.answerText}</p>
                              {qa.answerer && (
                                <span className="text-xs text-muted-foreground mt-1 block">
                                  \u2014 {qa.answerer}
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
              <section>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAsk(!showAsk)}
                  className="flex items-center gap-2 text-sm font-semibold p-0 h-auto"
                >
                  {showAsk ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <Sparkles className="h-4 w-4" />
                  Ask About This Meeting
                </Button>
                {showAsk && (
                  <div className="mt-2 max-h-[400px] overflow-y-auto">
                    <AskAnythingPanel transcriptId={transcriptId} compact />
                  </div>
                )}
              </section>
            )}

            {/* Full Transcript */}
            <section>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTranscript(!showTranscript)}
                className="flex items-center gap-2 text-sm font-semibold p-0 h-auto"
              >
                {showTranscript ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                Full Transcript
              </Button>
              {showTranscript && transcript.fullText && (
                <div className="mt-2 max-h-96 overflow-y-auto rounded-md border bg-muted/30 p-4">
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
