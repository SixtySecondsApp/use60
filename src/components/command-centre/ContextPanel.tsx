import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Video,
  UserCircle,
  Activity,
  Target,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Clock,
  Bot,
  TrendingUp,
  Briefcase,
  Shield,
  Database,
  Brain,
  FileText,
  Link,
  Search,
  Mic,
  ListChecks,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Task } from '@/lib/database/models';
import { useTaskContext } from '@/lib/hooks/useTaskContext';
import { MeetingSearchPanel } from './MeetingSearchPanel';
import { RecordingPlayer } from './RecordingPlayer';
import { TranscriptViewer } from './TranscriptViewer';
import { ActionItemsTab } from './ActionItemsTab';
import { ContactIntelligenceTab } from './ContactIntelligenceTab';

// Type-to-tab mappings
const CONTEXT_TABS: Record<string, { id: string; label: string; icon: any }[]> = {
  email_draft: [
    { id: 'meeting', label: 'Meeting Highlights', icon: Video },
    { id: 'recording', label: 'Recording', icon: Mic },
    { id: 'actions', label: 'Action Items', icon: ListChecks },
    { id: 'signals', label: 'Buyer Signals', icon: TrendingUp },
    { id: 'history', label: 'Contact History', icon: Clock },
    { id: 'intelligence', label: 'Intelligence', icon: Brain },
    { id: 'search', label: 'Search', icon: Search },
  ],
  follow_up_email: [
    { id: 'meeting', label: 'Meeting Highlights', icon: Video },
    { id: 'recording', label: 'Recording', icon: Mic },
    { id: 'actions', label: 'Action Items', icon: ListChecks },
    { id: 'signals', label: 'Buyer Signals', icon: TrendingUp },
    { id: 'history', label: 'Contact History', icon: Clock },
    { id: 'intelligence', label: 'Intelligence', icon: Brain },
    { id: 'search', label: 'Search', icon: Search },
  ],
  proposal: [
    { id: 'deal', label: 'Deal Overview', icon: Briefcase },
    { id: 'competitive', label: 'Competitive Intel', icon: Shield },
    { id: 'history', label: 'Contact History', icon: Clock },
    { id: 'intelligence', label: 'Intelligence', icon: Brain },
    { id: 'search', label: 'Search', icon: Search },
  ],
  re_engagement: [
    { id: 'timeline', label: 'Last Contact', icon: Clock },
    { id: 'engagement', label: 'Engagement History', icon: Activity },
    { id: 'signals', label: 'Recent Activity', icon: TrendingUp },
    { id: 'search', label: 'Search', icon: Search },
  ],
  crm_update: [
    { id: 'current', label: 'Current Values', icon: Database },
    { id: 'confidence', label: 'AI Confidence', icon: Brain },
    { id: 'signals', label: 'Related Signals', icon: TrendingUp },
    { id: 'search', label: 'Search', icon: Search },
  ],
};

const DEFAULT_TABS = [
  { id: 'search', label: 'Search', icon: Search },
  { id: 'context', label: 'Context', icon: FileText },
  { id: 'related', label: 'Related', icon: Link },
];

interface ContextPanelProps {
  task: Task;
}

function EmptyTabState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-32 text-[11px] text-slate-400 dark:text-gray-500">
      {message}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-3 bg-slate-200 dark:bg-gray-700 rounded w-3/4" />
      <div className="h-3 bg-slate-200 dark:bg-gray-700 rounded w-1/2" />
      <div className="h-3 bg-slate-200 dark:bg-gray-700 rounded w-5/6" />
      <div className="h-3 bg-slate-200 dark:bg-gray-700 rounded w-2/3" />
    </div>
  );
}

function MeetingHighlightsContent({ data, meetingId }: { data: any; meetingId?: string }) {
  if (!data) return <EmptyTabState message="No meeting data available" />;

  // Normalise live DB data (start_time/end_time) vs metadata shape (date/duration)
  const displayDate = data.start_time || data.date;
  const displayTitle = data.title;

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1">{displayTitle}</h4>
        <p className="text-[11px] text-slate-500 dark:text-gray-400">
          {displayDate
            ? new Date(displayDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
            : null}
          {displayDate && data.duration ? ' · ' : null}
          {data.duration}
        </p>
        {meetingId && (
          <a
            href={`/meetings/${meetingId}`}
            className="inline-flex items-center gap-1 mt-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
          >
            <Video className="h-3 w-3" />
            View Recording
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>

      {data.summary && (
        <div>
          <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">
            AI Summary
          </h5>
          <p className="text-xs text-slate-600 dark:text-gray-400 leading-relaxed">{data.summary}</p>
        </div>
      )}

      {(data.key_moments?.length > 0 || data.highlights?.length > 0) && (
        <div>
          <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">
            Key Moments
          </h5>
          <ul className="space-y-1.5">
            {(data.key_moments || data.highlights || []).map((m: any, i: number) => (
              <li key={i} className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-gray-800/50 transition-colors">
                <Clock className="h-3 w-3 text-blue-500 mt-0.5 shrink-0" />
                <span className="text-[11px] text-slate-600 dark:text-gray-400">
                  {typeof m === 'string' ? m : m.text || m.description}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.attendees?.length > 0 && (
        <div>
          <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">
            Attendees
          </h5>
          <div className="space-y-2">
            {data.attendees.map((a: any, i: number) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-gray-700 flex items-center justify-center">
                  <span className="text-[10px] font-semibold text-slate-600 dark:text-gray-300">{a.name?.[0]}</span>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-slate-700 dark:text-gray-300">{a.name}</p>
                  <p className="text-[10px] text-slate-400 dark:text-gray-500">
                    {[a.role, a.company].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BuyerSignalsContent({ data }: { data: any }) {
  if (!data) return <EmptyTabState message="No buyer signal data available" />;

  // Normalise live DB contact data (first_name/last_name/company_name) vs metadata shape (name/company)
  const displayName = data.name || [data.first_name, data.last_name].filter(Boolean).join(' ') || null;
  const displayCompany = data.company || data.company_name || null;
  const displayLastContacted = data.last_contacted
    || (data.last_contacted_at
      ? new Date(data.last_contacted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null);

  return (
    <div className="space-y-4">
      {displayName && (
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
            <span className="text-sm font-bold text-white">
              {displayName.split(' ').map((n: string) => n[0]).join('')}
            </span>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-800 dark:text-gray-200">{displayName}</h4>
            <p className="text-[11px] text-slate-500 dark:text-gray-400">{data.title}</p>
            <p className="text-[11px] text-slate-400 dark:text-gray-500">{displayCompany}</p>
          </div>
        </div>
      )}

      {data.relationship_score !== undefined && (
        <div>
          <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-2">
            Relationship Health
          </h5>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-gray-800 overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  data.relationship_score >= 70
                    ? 'bg-emerald-500'
                    : data.relationship_score >= 40
                    ? 'bg-amber-500'
                    : 'bg-red-500'
                )}
                style={{ width: `${data.relationship_score}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-slate-700 dark:text-gray-300">{data.relationship_score}</span>
          </div>
          {displayLastContacted && (
            <p className="text-[10px] text-slate-400 dark:text-gray-500 mt-1">
              Last contacted {displayLastContacted}
            </p>
          )}
        </div>
      )}

      {data.buying_signals?.length > 0 && (
        <div>
          <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">
            Buying Signals
          </h5>
          <ul className="space-y-1.5">
            {data.buying_signals.map((signal: any, i: number) => (
              <li key={i} className="flex items-start gap-2">
                <TrendingUp className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" />
                <span className="text-[11px] text-slate-600 dark:text-gray-400">
                  {typeof signal === 'string' ? signal : signal.text || signal.description}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.rep_commitments?.length > 0 && (
        <div>
          <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">
            Rep Commitments
          </h5>
          <ul className="space-y-1.5">
            {data.rep_commitments.map((c: string, i: number) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle2 className="h-3 w-3 text-blue-500 mt-0.5 shrink-0" />
                <span className="text-[11px] text-slate-600 dark:text-gray-400">{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.prospect_commitments?.length > 0 && (
        <div>
          <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">
            Prospect Commitments
          </h5>
          <ul className="space-y-1.5">
            {data.prospect_commitments.map((c: string, i: number) => (
              <li key={i} className="flex items-start gap-2">
                <Target className="h-3 w-3 text-violet-500 mt-0.5 shrink-0" />
                <span className="text-[11px] text-slate-600 dark:text-gray-400">{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.objections?.length > 0 && (
        <div>
          <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">
            Objections
          </h5>
          <ul className="space-y-1.5">
            {data.objections.map((o: string, i: number) => (
              <li key={i} className="flex items-start gap-2">
                <Shield className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                <span className="text-[11px] text-slate-600 dark:text-gray-400">{o}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.competitor_mentions?.length > 0 && (
        <div>
          <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">
            Competitors Mentioned
          </h5>
          <ul className="space-y-1.5">
            {data.competitor_mentions.map((c: string, i: number) => (
              <li key={i} className="flex items-start gap-2">
                <Shield className="h-3 w-3 text-red-500 mt-0.5 shrink-0" />
                <span className="text-[11px] text-slate-600 dark:text-gray-400">{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.notes && (
        <div>
          <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">
            Notes
          </h5>
          <p className="text-xs text-slate-600 dark:text-gray-400 leading-relaxed">{data.notes}</p>
        </div>
      )}
    </div>
  );
}

function ContactHistoryContent({ contactId, activities }: { contactId?: string; activities?: any[] }) {
  if (!contactId) return <EmptyTabState message="No contact linked to this task" />;

  return (
    <div className="space-y-3">
      {activities && activities.length > 0 ? (
        <div className="space-y-2">
          {activities.map((item: any, i: number) => (
            <div key={item.id || i} className="flex items-start gap-2.5">
              <div className="relative flex flex-col items-center">
                <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
                  <Activity className="h-2.5 w-2.5 text-blue-500" />
                </div>
                {i < activities.length - 1 && (
                  <div className="w-px h-4 bg-slate-200 dark:bg-gray-700/50 mt-1" />
                )}
              </div>
              <div className="flex-1 min-w-0 pb-2">
                <p className="text-[11px] text-slate-600 dark:text-gray-400">{item.subject || item.activity_type}</p>
                {item.created_at && (
                  <span className="text-[10px] text-slate-400 dark:text-gray-500">
                    {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-slate-500 dark:text-gray-400">No recent activity recorded.</p>
      )}
      <a
        href={`/contacts/${contactId}`}
        className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
      >
        View full contact history
        <ExternalLink className="h-2.5 w-2.5" />
      </a>
    </div>
  );
}

function DealOverviewContent({ data, dealId }: { data: any; dealId?: string }) {
  if (!data && !dealId) return <EmptyTabState message="No deal data available" />;

  // Normalise live DB data (name/value) vs metadata shape (deal_name/deal_value/deal_stage)
  const displayName = data?.name || data?.deal_name || null;
  const displayValue = data?.value != null
    ? `$${Number(data.value).toLocaleString()}`
    : data?.deal_value || null;
  const displayStage = data?.deal_stage || null;

  return (
    <div className="space-y-4">
      {displayName && (
        <div className="rounded-lg border border-slate-200 dark:border-gray-700/50 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-xs font-semibold text-slate-700 dark:text-gray-300">Active Deal</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-gray-400">{displayName}</p>
          <div className="flex items-center gap-3 mt-1.5">
            {displayValue && (
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{displayValue}</span>
            )}
            {displayStage && (
              <Badge variant="secondary" className="text-[10px]">{displayStage}</Badge>
            )}
          </div>
          {data?.notes && (
            <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-2 line-clamp-3">{data.notes}</p>
          )}
        </div>
      )}
      {dealId && (
        <a
          href={`/deals/${dealId}`}
          className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
        >
          <ExternalLink className="h-2.5 w-2.5" />
          Open deal in CRM
        </a>
      )}
      {!displayName && (
        <EmptyTabState message="No deal details available" />
      )}
    </div>
  );
}

function CompetitiveIntelContent({ data }: { data: any }) {
  if (!data?.competitors?.length && !data?.competitive_notes) {
    return <EmptyTabState message="No competitive intelligence available" />;
  }

  return (
    <div className="space-y-4">
      {data.competitors?.length > 0 && (
        <div>
          <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">
            Competitors Mentioned
          </h5>
          <ul className="space-y-1.5">
            {data.competitors.map((c: any, i: number) => (
              <li key={i} className="flex items-start gap-2">
                <Shield className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                <span className="text-[11px] text-slate-600 dark:text-gray-400">
                  {typeof c === 'string' ? c : c.name || c.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.competitive_notes && (
        <div>
          <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">
            Notes
          </h5>
          <p className="text-xs text-slate-600 dark:text-gray-400 leading-relaxed">{data.competitive_notes}</p>
        </div>
      )}
    </div>
  );
}

function LastContactContent({ data }: { data: any }) {
  if (!data) return <EmptyTabState message="No contact timeline available" />;

  return (
    <div className="space-y-3">
      {data.last_contacted && (
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-slate-400" />
          <div>
            <p className="text-xs font-medium text-slate-700 dark:text-gray-300">Last Contact</p>
            <p className="text-[11px] text-slate-500 dark:text-gray-400">{data.last_contacted}</p>
          </div>
        </div>
      )}
      {data.last_interaction && (
        <div>
          <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">
            Last Interaction
          </h5>
          <p className="text-xs text-slate-600 dark:text-gray-400 leading-relaxed">{data.last_interaction}</p>
        </div>
      )}
    </div>
  );
}

function EngagementHistoryContent({ data }: { data: any }) {
  const items: any[] = data?.activity || data?.engagement_history || [];
  if (!items.length) return <EmptyTabState message="No engagement history available" />;

  return (
    <div className="space-y-2">
      {items.map((item: any, i: number) => (
        <div key={i} className="flex items-start gap-2.5">
          <div className="relative flex flex-col items-center">
            <div className={cn(
              'w-5 h-5 rounded-full flex items-center justify-center',
              item.actor === 'AI' ? 'bg-violet-100 dark:bg-violet-500/20' : 'bg-blue-100 dark:bg-blue-500/20'
            )}>
              {item.actor === 'AI' ? (
                <Bot className="h-2.5 w-2.5 text-violet-500" />
              ) : (
                <UserCircle className="h-2.5 w-2.5 text-blue-500" />
              )}
            </div>
            {i < items.length - 1 && (
              <div className="w-px h-4 bg-slate-200 dark:bg-gray-700/50 mt-1" />
            )}
          </div>
          <div className="flex-1 min-w-0 pb-2">
            <p className="text-[11px] text-slate-600 dark:text-gray-400">{item.action || item.description}</p>
            {item.timestamp && (
              <span className="text-[10px] text-slate-400 dark:text-gray-500">
                {new Date(item.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function CurrentValuesContent({ data }: { data: any }) {
  const fields = data?.current_values || data?.crm_fields || {};
  const entries = Object.entries(fields);
  if (!entries.length) return <EmptyTabState message="No current CRM values available" />;

  return (
    <div className="space-y-2">
      {entries.map(([key, value]: [string, any]) => (
        <div key={key} className="flex items-start justify-between gap-2 py-1 border-b border-slate-100 dark:border-gray-800/50 last:border-0">
          <span className="text-[11px] text-slate-500 dark:text-gray-400 capitalize">
            {key.replace(/_/g, ' ')}
          </span>
          <span className="text-[11px] font-medium text-slate-700 dark:text-gray-300 text-right max-w-[60%]">
            {typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')}
          </span>
        </div>
      ))}
    </div>
  );
}

function AIConfidenceContent({ data }: { data: any }) {
  const fields = data?.confidence_scores || data?.ai_confidence || {};
  const entries = Object.entries(fields);
  if (!entries.length) return <EmptyTabState message="No AI confidence data available" />;

  return (
    <div className="space-y-3">
      {entries.map(([key, score]: [string, any]) => {
        const pct = typeof score === 'number' ? score : parseInt(score, 10);
        return (
          <div key={key}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-slate-600 dark:text-gray-400 capitalize">
                {key.replace(/_/g, ' ')}
              </span>
              <span className="text-[11px] font-semibold text-slate-700 dark:text-gray-300">{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 dark:bg-gray-800 overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full',
                  pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DefaultContextContent({ task }: { task: Task }) {
  const metadata = task.metadata || {};
  if (!Object.keys(metadata).length) return <EmptyTabState message="No additional context" />;

  return (
    <div className="space-y-2">
      {Object.entries(metadata).map(([key, value]: [string, any]) => (
        <div key={key} className="text-[11px] text-slate-600 dark:text-gray-400">
          <span className="font-medium capitalize">{key.replace(/_/g, ' ')}: </span>
          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
        </div>
      ))}
    </div>
  );
}

function RelatedItemsContent({ task }: { task: Task }) {
  const relatedItems = task.metadata?.related_items;
  if (!relatedItems?.length) return <EmptyTabState message="No related items found" />;

  return (
    <div className="space-y-2">
      {relatedItems.map((item: any, i: number) => (
        <a
          key={i}
          href={
            item.type === 'deal' ? `/deals/${item.id}` :
            item.type === 'meeting' ? `/meetings/${item.id}` :
            item.type === 'contact' ? `/contacts/${item.id}` :
            '#'
          }
          className="w-full flex items-center gap-3 rounded-lg border border-slate-200 dark:border-gray-700/50 p-3 hover:bg-slate-50 dark:hover:bg-gray-800/50 transition-colors text-left"
        >
          <div className={cn(
            'w-7 h-7 rounded-lg flex items-center justify-center',
            item.type === 'deal' ? 'bg-emerald-50 dark:bg-emerald-500/10' :
            item.type === 'meeting' ? 'bg-indigo-50 dark:bg-indigo-500/10' :
            'bg-blue-50 dark:bg-blue-500/10'
          )}>
            {item.type === 'deal' ? <Target className="h-3.5 w-3.5 text-emerald-500" /> :
             item.type === 'meeting' ? <CalendarClock className="h-3.5 w-3.5 text-indigo-500" /> :
             <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-700 dark:text-gray-300 truncate">{item.title}</p>
            <p className="text-[10px] text-slate-400 dark:text-gray-500">{item.status}</p>
          </div>
          <ExternalLink className="h-3 w-3 text-slate-300 dark:text-gray-600" />
        </a>
      ))}
    </div>
  );
}

interface TaskContextData {
  deal: any | null;
  contact: any | null;
  company: any | null;
  meeting: any | null;
  transcript: string | null;
  actionItems: any[];
  activities: any[];
  isLoading: boolean;
}

function RecordingContent({ task, ctx }: { task: Task; ctx: TaskContextData }) {
  const [seekTime, setSeekTime] = useState<number | undefined>();
  const [currentTime, setCurrentTime] = useState(0);

  const meeting = ctx?.meeting;
  const recordingUrl = meeting?.recording_url || meeting?.share_url;
  const transcript = ctx?.transcript || meeting?.transcript_text;

  if (!meeting) {
    return <EmptyTabState message="No meeting linked to this task" />;
  }

  return (
    <div className="space-y-3">
      {recordingUrl ? (
        <RecordingPlayer
          url={recordingUrl}
          onTimeUpdate={setCurrentTime}
          seekTo={seekTime}
        />
      ) : (
        <div className="rounded-lg border border-slate-200 dark:border-gray-700/50 p-3 text-center">
          <p className="text-xs text-slate-500 dark:text-gray-400">No recording available</p>
          <a
            href={`/meetings/${meeting.id}`}
            className="inline-flex items-center gap-1 mt-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
          >
            View meeting details
          </a>
        </div>
      )}

      {transcript && (
        <div>
          <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-2">
            Transcript
          </h5>
          <TranscriptViewer
            transcript={transcript}
            currentTime={currentTime}
            onSeek={setSeekTime}
          />
        </div>
      )}
    </div>
  );
}

function renderTabContent(tabId: string, task: Task, ctx: TaskContextData) {
  const metadata = task?.metadata || {};

  if (ctx.isLoading) {
    return <LoadingSkeleton />;
  }

  switch (tabId) {
    case 'meeting':
      return <MeetingHighlightsContent data={ctx.meeting} meetingId={task.meeting_id || task.metadata?.meeting_id} />;
    case 'signals':
      return <BuyerSignalsContent data={ctx.contact} />;
    case 'history':
      return <ContactHistoryContent contactId={task.contact_id} activities={ctx.activities} />;
    case 'deal':
      return <DealOverviewContent data={ctx.deal} dealId={task.deal_id} />;
    case 'competitive':
      return <CompetitiveIntelContent data={metadata.competitive_context || metadata} />;
    case 'timeline':
      return <LastContactContent data={ctx.contact} />;
    case 'engagement':
      return <EngagementHistoryContent data={{ activity: ctx.activities, ...metadata }} />;
    case 'current':
      return <CurrentValuesContent data={metadata} />;
    case 'confidence':
      return <AIConfidenceContent data={metadata} />;
    case 'context':
      return <DefaultContextContent task={task} />;
    case 'related':
      return <RelatedItemsContent task={task} />;
    case 'recording':
      return <RecordingContent task={task} ctx={ctx} />;
    case 'actions':
      return <ActionItemsTab meetingId={(task.metadata?.meeting_id as string) || task.meeting_id} />;
    case 'intelligence':
      return <ContactIntelligenceTab contactId={task.contact_id} contactName={task.contact_name} />;
    case 'search':
      return <MeetingSearchPanel contactId={task.contact_id} dealId={task.deal_id} />;
    default:
      return <EmptyTabState message="Content not available" />;
  }
}

export function ContextPanel({ task }: ContextPanelProps) {
  const deliverableType = task.deliverable_type || task.metadata?.deliverable_type;
  const tabs = CONTEXT_TABS[deliverableType ?? ''] || DEFAULT_TABS;

  const [activeTab, setActiveTab] = useState(tabs[0]?.id || 'context');

  const ctx = useTaskContext(task);

  // Reset to first tab when task changes or deliverable_type changes
  useEffect(() => {
    const currentTabs = CONTEXT_TABS[task.deliverable_type ?? task.metadata?.deliverable_type ?? ''] || DEFAULT_TABS;
    const isValid = currentTabs.some(t => t.id === activeTab);
    if (!isValid) {
      setActiveTab(currentTabs[0]?.id || 'context');
    }
  }, [task.id, deliverableType, activeTab, tabs]);

  if (!tabs.length) return null;

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 320, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="shrink-0 border-l border-slate-200 dark:border-gray-700/50 bg-white dark:bg-gray-900/80 overflow-hidden flex flex-col"
    >
      {/* Context tabs */}
      <div className="shrink-0 flex items-center gap-0 px-3 border-b border-slate-200 dark:border-gray-700/50 bg-white dark:bg-gray-900/80 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-2.5 text-[11px] font-medium border-b-2 transition-colors whitespace-nowrap shrink-0',
              activeTab === tab.id
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-300'
            )}
          >
            <tab.icon className="h-3 w-3" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-4"
          >
            {renderTabContent(activeTab, task, ctx)}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
