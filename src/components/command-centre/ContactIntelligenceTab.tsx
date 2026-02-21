import { Video, TrendingUp, AlertTriangle, Circle } from 'lucide-react';
import { useContactIntelligence } from '@/lib/hooks/useContactIntelligence';
import { cn } from '@/lib/utils';

interface ContactIntelligenceTabProps {
  contactId: string | null | undefined;
  contactName?: string;
}

function SentimentDot({ score }: { score?: number | null }) {
  if (score === null || score === undefined) return null;
  const color = score >= 0.7 ? 'bg-emerald-400' : score >= 0.4 ? 'bg-amber-400' : 'bg-red-400';
  return <div className={cn('w-2 h-2 rounded-full', color)} title={`Sentiment: ${Math.round(score * 100)}%`} />;
}

export function ContactIntelligenceTab({ contactId, contactName }: ContactIntelligenceTabProps) {
  const { data, isLoading } = useContactIntelligence(contactId);

  if (!contactId) {
    return (
      <div className="flex items-center justify-center h-32 text-[11px] text-slate-400 dark:text-gray-500">
        No contact linked to this task
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="animate-pulse rounded-lg bg-slate-100 dark:bg-gray-800/50 h-16" />
        ))}
      </div>
    );
  }

  if (!data || data.totalMeetings === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-center">
        <Video className="h-6 w-6 text-slate-300 dark:text-gray-600 mb-2" />
        <p className="text-xs text-slate-500 dark:text-gray-400">No meetings found</p>
        <p className="text-[11px] text-slate-400 dark:text-gray-500 mt-0.5">
          {contactName ? `No recorded meetings with ${contactName}` : 'No meetings with this contact'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-slate-50 dark:bg-gray-800/30 p-2.5 text-center">
          <p className="text-lg font-bold text-slate-800 dark:text-gray-200">{data.totalMeetings}</p>
          <p className="text-[10px] text-slate-500 dark:text-gray-400">Meetings</p>
        </div>
        <div className="rounded-lg bg-slate-50 dark:bg-gray-800/30 p-2.5 text-center">
          <p className={cn(
            'text-lg font-bold',
            data.avgSentiment !== null && data.avgSentiment >= 0.7 ? 'text-emerald-600 dark:text-emerald-400' :
            data.avgSentiment !== null && data.avgSentiment >= 0.4 ? 'text-amber-600 dark:text-amber-400' :
            data.avgSentiment !== null ? 'text-red-600 dark:text-red-400' : 'text-slate-400'
          )}>
            {data.avgSentiment !== null ? `${Math.round(data.avgSentiment * 100)}%` : '—'}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-gray-400">Avg Sentiment</p>
        </div>
        <div className="rounded-lg bg-slate-50 dark:bg-gray-800/30 p-2.5 text-center">
          <p className={cn(
            'text-lg font-bold',
            data.unresolvedActionItems.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
          )}>
            {data.unresolvedActionItems.length}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-gray-400">Open Items</p>
        </div>
      </div>

      {/* Meeting timeline */}
      <div>
        <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-2">
          Meeting Timeline
        </h5>
        <div className="space-y-1.5">
          {data.meetings.map((meeting) => (
            <a
              key={meeting.id}
              href={`/meetings/${meeting.id}`}
              className="flex items-start gap-2.5 rounded-lg border border-slate-200 dark:border-gray-700/50 p-2.5 hover:bg-slate-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <div className="relative flex flex-col items-center pt-0.5">
                <SentimentDot score={meeting.sentiment_score} />
                <div className="w-px h-full bg-slate-200 dark:bg-gray-700/50 mt-1 min-h-[16px]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700 dark:text-gray-300 truncate">
                  {meeting.title}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-slate-400 dark:text-gray-500">
                    {new Date(meeting.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  {meeting.action_items_count > 0 && (
                    <>
                      <span className="text-slate-300 dark:text-gray-600">·</span>
                      <span className={cn(
                        'text-[10px]',
                        meeting.pending_action_items > 0 ? 'text-amber-500' : 'text-emerald-500'
                      )}>
                        {meeting.pending_action_items > 0
                          ? `${meeting.pending_action_items} open`
                          : `${meeting.action_items_count} done`}
                      </span>
                    </>
                  )}
                </div>
                {meeting.summary_oneliner && (
                  <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-1 line-clamp-2">
                    {meeting.summary_oneliner}
                  </p>
                )}
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* Unresolved action items */}
      {data.unresolvedActionItems.length > 0 && (
        <div>
          <h5 className="text-[11px] font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 text-amber-500" />
            Unresolved Action Items
          </h5>
          <div className="space-y-1">
            {data.unresolvedActionItems.slice(0, 5).map((item: any) => (
              <div key={item.id} className="flex items-start gap-2 py-1">
                <Circle className="h-3 w-3 text-amber-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-slate-600 dark:text-gray-400">{item.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {item.assignee_name && (
                      <span className="text-[10px] text-slate-400 dark:text-gray-500">{item.assignee_name}</span>
                    )}
                    {item.due_date && (
                      <span className={cn(
                        'text-[10px]',
                        new Date(item.due_date) < new Date() ? 'text-red-500' : 'text-slate-400 dark:text-gray-500'
                      )}>
                        {new Date(item.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {data.unresolvedActionItems.length > 5 && (
              <p className="text-[10px] text-slate-400 dark:text-gray-500 pl-5">
                +{data.unresolvedActionItems.length - 5} more
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
