import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Mail,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Clock,
  Users,
  FileText,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { CopilotResponse as CopilotResponseType } from '../types';
import type {
  MeetingIntelligenceResponseData,
  MeetingIntelligenceSource,
  MeetingIntelligenceStructuredMeeting,
  MeetingIntelligenceSuggestedAction,
} from '../types';

interface MeetingIntelligenceResponseProps {
  data: CopilotResponseType & { data: MeetingIntelligenceResponseData };
  onActionClick?: (action: any) => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getSimilarityColors(similarity: number): string {
  if (similarity >= 0.8) {
    return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
  }
  if (similarity >= 0.6) {
    return 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400';
  }
  return 'bg-gray-100 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400';
}

function SentimentBadge({ sentiment, score }: { sentiment?: string; score?: number }) {
  const colors: Record<string, string> = {
    positive: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    negative: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    neutral: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  };
  const color = colors[sentiment as keyof typeof colors] || colors.neutral;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {sentiment || 'neutral'}
      {score != null && <span className="ml-1 opacity-75">{Math.round(score * 100)}%</span>}
    </span>
  );
}

function SourceCard({
  source,
  onClick,
}: {
  source: MeetingIntelligenceSource;
  onClick?: () => void;
}) {
  const sentimentColor =
    source.sentiment === 'positive'
      ? 'text-green-500'
      : source.sentiment === 'negative'
      ? 'text-red-500'
      : 'text-muted-foreground';

  return (
    <div
      className="p-3 rounded-lg border border-border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">{source.transcriptTitle}</span>
        </div>
        <span
          className={`text-xs px-1.5 py-0.5 rounded-full font-medium ml-2 shrink-0 ${getSimilarityColors(
            source.similarity
          )}`}
        >
          {Math.round(source.similarity * 100)}%
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
        {source.date && <span>{source.date}</span>}
        {source.sentiment && <span className={sentimentColor}>{source.sentiment}</span>}
      </div>
      <p className="text-xs text-muted-foreground line-clamp-2">{source.text}</p>
    </div>
  );
}

const markdownComponents = {
  p: ({ children }: any) => (
    <p className="mb-2 last:mb-0 text-sm text-foreground leading-relaxed">{children}</p>
  ),
  strong: ({ children }: any) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }: any) => <em className="italic">{children}</em>,
  ul: ({ children }: any) => (
    <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }: any) => (
    <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>
  ),
  li: ({ children }: any) => <li className="text-sm pl-0.5">{children}</li>,
  h1: ({ children }: any) => <h1 className="text-base font-bold mb-2">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-sm font-bold mb-1.5">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-sm font-semibold mb-1">{children}</h3>,
};

// ─── Suggested Actions ───────────────────────────────────────────────────────

function SuggestedActions({
  actions,
  onActionClick,
}: {
  actions?: MeetingIntelligenceSuggestedAction[];
  onActionClick?: (action: any) => void;
}) {
  if (!actions || actions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 pt-2">
      {actions.map((action) => (
        <button
          key={action.type}
          onClick={() =>
            onActionClick?.({
              type: action.type,
              ...action.data,
            })
          }
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-accent transition-colors"
        >
          {(action.type === 'create_task' || action.type === 'create_task_from_meeting') && <CheckSquare className="w-3.5 h-3.5" />}
          {(action.type === 'draft_email' || action.type === 'draft_email_from_meeting') && <Mail className="w-3.5 h-3.5" />}
          {action.type === 'post_slack' && <MessageSquare className="w-3.5 h-3.5" />}
          {action.label}
        </button>
      ))}
    </div>
  );
}

// ─── Structured Meeting Card ─────────────────────────────────────────────────

function StructuredMeetingCard({
  meeting,
}: {
  meeting: MeetingIntelligenceStructuredMeeting;
}) {
  const [expanded, setExpanded] = useState(false);

  const actionItemCount = meeting.actionItems?.length ?? 0;
  const speakerRatio = meeting.talkTime?.talkRatio;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        type="button"
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-accent/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-sm font-medium truncate">{meeting.title}</span>
            <SentimentBadge sentiment={meeting.sentiment} score={meeting.positiveScore} />
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {meeting.date && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {meeting.date}
              </span>
            )}
            {actionItemCount > 0 && (
              <span className="flex items-center gap-1">
                <CheckSquare className="w-3 h-3" />
                {actionItemCount} action{actionItemCount !== 1 ? 's' : ''}
              </span>
            )}
            {speakerRatio && (
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {speakerRatio}
              </span>
            )}
          </div>
          {/* Talk time mini-bar */}
          {meeting.talkTime?.speakers && meeting.talkTime.speakers.length >= 2 && (
            <div className="mt-2 flex rounded-full overflow-hidden h-1.5">
              {meeting.talkTime.speakers.map((speaker, i) => (
                <div
                  key={i}
                  style={{ width: `${speaker.percentage}%` }}
                  className={i === 0 ? 'bg-blue-400' : 'bg-emerald-400'}
                  title={`${speaker.name}: ${speaker.percentage}%`}
                />
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0 text-muted-foreground">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-3 border-t border-border">
              {meeting.summary && (
                <p className="text-xs text-muted-foreground pt-3 leading-relaxed">
                  {meeting.summary}
                </p>
              )}
              {meeting.agreements && meeting.agreements.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-foreground mb-1">Agreements</p>
                  <ul className="space-y-0.5">
                    {meeting.agreements.map((a, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                        <span className="text-green-500 shrink-0">+</span>
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {meeting.decisions && meeting.decisions.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-foreground mb-1">Decisions</p>
                  <ul className="space-y-0.5">
                    {meeting.decisions.map((d, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                        <span className="shrink-0">&#x2713;</span>
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {meeting.objections && meeting.objections.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-foreground mb-1">Objections</p>
                  <ul className="space-y-1">
                    {meeting.objections.map((obj, i) => (
                      <li key={i} className="text-xs text-muted-foreground">
                        <span className="font-medium text-red-500">{obj.title}: </span>
                        {obj.description}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {meeting.actionItems && meeting.actionItems.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-foreground mb-1">Action Items</p>
                  <ul className="space-y-1">
                    {meeting.actionItems.map((item, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex gap-1.5 items-start">
                        <CheckSquare className="w-3 h-3 shrink-0 mt-0.5 text-blue-400" />
                        <span>
                          {item.text}
                          {item.assignee && (
                            <span className="text-muted-foreground/60 ml-1">({item.assignee})</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Query-type Layouts ───────────────────────────────────────────────────────

function SemanticLayout({
  responseData,
  onActionClick,
}: {
  responseData: MeetingIntelligenceResponseData;
  onActionClick?: (action: any) => void;
}) {
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const sources = responseData.sources ?? [];

  return (
    <div className="space-y-4">
      {/* Answer */}
      <div className="prose-sm max-w-none text-sm text-foreground">
        <ReactMarkdown components={markdownComponents}>{responseData.answer}</ReactMarkdown>
      </div>

      {/* Sources */}
      {sources.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setSourcesExpanded(!sourcesExpanded)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            <Search className="w-3.5 h-3.5" />
            {sources.length} source{sources.length !== 1 ? 's' : ''}
            {sourcesExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
          <AnimatePresence>
            {sourcesExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="space-y-2 pt-1">
                  {sources.map((source) => (
                    <SourceCard
                      key={source.transcriptId}
                      source={source}
                      onClick={() => onActionClick?.({ type: 'open_transcript', transcriptId: source.transcriptId })}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Key signals */}
      {responseData.metadata && (
        <p className="text-xs text-muted-foreground">
          Analyzed {responseData.metadata.meetingsAnalyzed} meeting
          {responseData.metadata.meetingsAnalyzed !== 1 ? 's' : ''} across{' '}
          {responseData.metadata.segmentsSearched} segment
          {responseData.metadata.segmentsSearched !== 1 ? 's' : ''}
        </p>
      )}

      <SuggestedActions actions={responseData.suggestedActions} onActionClick={onActionClick} />
    </div>
  );
}

function StructuredLayout({
  responseData,
  onActionClick,
}: {
  responseData: MeetingIntelligenceResponseData;
  onActionClick?: (action: any) => void;
}) {
  const meetings = responseData.structuredData ?? [];

  return (
    <div className="space-y-4">
      {/* Brief answer */}
      {responseData.answer && (
        <p className="text-sm text-muted-foreground">{responseData.answer}</p>
      )}

      {/* Meeting cards grid */}
      {meetings.length > 0 ? (
        <div className="space-y-2">
          {meetings.map((meeting) => (
            <StructuredMeetingCard key={meeting.id} meeting={meeting} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No meetings matched your query.</p>
      )}

      <SuggestedActions actions={responseData.suggestedActions} onActionClick={onActionClick} />
    </div>
  );
}

function AggregateLayout({
  responseData,
  onActionClick,
}: {
  responseData: MeetingIntelligenceResponseData;
  onActionClick?: (action: any) => void;
}) {
  const meta = responseData.metadata;
  const aggData = responseData.aggregationData as Record<string, any> | undefined;

  // Build stats from aggregation data if available, otherwise fall back to metadata
  const stats: Array<{ label: string; value: string | number; icon: React.ReactNode; trend: string | null }> = [];

  if (aggData) {
    // Dashboard metrics
    if (aggData.totalMeetings != null) {
      stats.push({
        label: 'Total meetings',
        value: aggData.totalMeetings,
        icon: <BarChart3 className="w-4 h-4 text-blue-400" />,
        trend: null,
      });
    }
    if (aggData.averageSentiment != null) {
      stats.push({
        label: 'Avg sentiment',
        value: `${Math.round(Number(aggData.averageSentiment) * 100)}%`,
        icon: <TrendingUp className="w-4 h-4 text-emerald-400" />,
        trend: Number(aggData.averageSentiment) >= 0.6 ? 'up' : Number(aggData.averageSentiment) <= 0.4 ? 'down' : 'neutral',
      });
    }
    if (aggData.averageTalkRatio != null || aggData.talkTimeRatio != null) {
      const ratio = aggData.averageTalkRatio ?? aggData.talkTimeRatio;
      stats.push({
        label: 'Avg talk ratio',
        value: typeof ratio === 'string' ? ratio : `${Math.round(Number(ratio) * 100)}%`,
        icon: <Users className="w-4 h-4 text-violet-400" />,
        trend: null,
      });
    }
    // Talk time entries
    if (Array.isArray(aggData.entries) || Array.isArray(aggData)) {
      const entries = Array.isArray(aggData) ? aggData : aggData.entries;
      stats.push({
        label: 'Speakers tracked',
        value: entries.length,
        icon: <Users className="w-4 h-4 text-violet-400" />,
        trend: null,
      });
    }
  }

  // Fallback if no aggregation-specific stats were added
  if (stats.length === 0) {
    stats.push(
      {
        label: 'Meetings analyzed',
        value: meta?.meetingsAnalyzed ?? 0,
        icon: <BarChart3 className="w-4 h-4 text-blue-400" />,
        trend: null,
      },
      {
        label: 'Total meetings',
        value: meta?.totalMeetings ?? 0,
        icon: <Clock className="w-4 h-4 text-violet-400" />,
        trend: null,
      },
      {
        label: 'Segments searched',
        value: meta?.segmentsSearched ?? 0,
        icon: <Search className="w-4 h-4 text-emerald-400" />,
        trend: null,
      },
    );
  }

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className={`grid gap-2 ${stats.length <= 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-border bg-card p-3 flex flex-col gap-1"
          >
            <div className="flex items-center justify-between">
              {stat.icon}
              {stat.trend === 'up' && <TrendingUp className="w-3.5 h-3.5 text-green-500" />}
              {stat.trend === 'down' && <TrendingDown className="w-3.5 h-3.5 text-red-500" />}
              {stat.trend === 'neutral' && <Minus className="w-3.5 h-3.5 text-muted-foreground" />}
            </div>
            <p className="text-lg font-semibold text-foreground">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Answer text */}
      <div className="prose-sm max-w-none text-sm text-foreground">
        <ReactMarkdown components={markdownComponents}>{responseData.answer}</ReactMarkdown>
      </div>

      <SuggestedActions actions={responseData.suggestedActions} onActionClick={onActionClick} />
    </div>
  );
}

function CrossMeetingLayout({
  responseData,
  onActionClick,
}: {
  responseData: MeetingIntelligenceResponseData;
  onActionClick?: (action: any) => void;
}) {
  const sources = responseData.sources ?? [];

  // Group sources by transcriptTitle for pattern cards
  const patternMap = new Map<string, MeetingIntelligenceSource[]>();
  for (const source of sources) {
    const key = source.transcriptTitle;
    if (!patternMap.has(key)) patternMap.set(key, []);
    patternMap.get(key)!.push(source);
  }
  const patterns = Array.from(patternMap.entries());

  return (
    <div className="space-y-4">
      {/* Answer */}
      <div className="prose-sm max-w-none text-sm text-foreground">
        <ReactMarkdown components={markdownComponents}>{responseData.answer}</ReactMarkdown>
      </div>

      {/* Pattern cards */}
      {patterns.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Source meetings
          </p>
          {patterns.map(([title, srcs]) => (
            <div key={title} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium truncate">{title}</span>
                <span className="ml-auto text-xs text-muted-foreground shrink-0">
                  {srcs.length} excerpt{srcs.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="space-y-1">
                {srcs.slice(0, 2).map((src, i) => (
                  <p key={i} className="text-xs text-muted-foreground line-clamp-2">
                    {src.text}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <SuggestedActions actions={responseData.suggestedActions} onActionClick={onActionClick} />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MeetingIntelligenceResponse({
  data,
  onActionClick,
}: MeetingIntelligenceResponseProps) {
  const responseData = data.data;

  const renderLayout = () => {
    switch (responseData.queryType) {
      case 'structured':
        return (
          <StructuredLayout responseData={responseData} onActionClick={onActionClick} />
        );
      case 'aggregate':
        return (
          <AggregateLayout responseData={responseData} onActionClick={onActionClick} />
        );
      case 'cross_meeting':
        return (
          <CrossMeetingLayout responseData={responseData} onActionClick={onActionClick} />
        );
      case 'semantic':
      default:
        return (
          <SemanticLayout responseData={responseData} onActionClick={onActionClick} />
        );
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {data.summary && (
        <p className="text-sm text-muted-foreground">{data.summary}</p>
      )}
      {renderLayout()}
    </motion.div>
  );
}
