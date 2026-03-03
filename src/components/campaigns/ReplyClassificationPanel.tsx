import React, { useState } from 'react';
import { Loader2, MessageSquare } from 'lucide-react';
import type { ClassifiedReply, ReplyCategory } from '@/lib/types/campaign';

interface Props {
  replies: ClassifiedReply[];
  isLoading: boolean;
}

type CategoryFilter = 'all' | ReplyCategory;

const CATEGORY_TABS: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'interested', label: 'Interested' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'question', label: 'Questions' },
  { value: 'out_of_office', label: 'OOO' },
  { value: 'forwarded', label: 'Forwarded' },
];

function categoryColor(category: ReplyCategory): string {
  switch (category) {
    case 'interested': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
    case 'not_interested': return 'text-red-400 bg-red-400/10 border-red-400/20';
    case 'question': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
    case 'out_of_office': return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
    case 'forwarded': return 'text-purple-400 bg-purple-400/10 border-purple-400/20';
    case 'unsubscribe': return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
    default: return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
  }
}

function categoryLabel(category: ReplyCategory): string {
  switch (category) {
    case 'interested': return 'Interested';
    case 'not_interested': return 'Not Interested';
    case 'question': return 'Question';
    case 'out_of_office': return 'Out of Office';
    case 'forwarded': return 'Forwarded';
    case 'unsubscribe': return 'Unsubscribe';
    default: return category;
  }
}

export function ReplyClassificationPanel({ replies, isLoading }: Props) {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  const filtered =
    categoryFilter === 'all' ? replies : replies.filter((r) => r.category === categoryFilter);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Category tabs */}
      <div className="flex flex-wrap gap-1">
        {CATEGORY_TABS.map((tab) => {
          const count =
            tab.value === 'all'
              ? replies.length
              : replies.filter((r) => r.category === tab.value).length;
          return (
            <button
              key={tab.value}
              onClick={() => setCategoryFilter(tab.value)}
              className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                categoryFilter === tab.value
                  ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                  : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800 border border-transparent'
              }`}
            >
              {tab.label}
              <span className="ml-1 text-[10px] opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Reply list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-12 gap-3 text-gray-500">
          <MessageSquare className="h-8 w-8 opacity-30" />
          <p className="text-sm">No replies in this category</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((reply, idx) => (
            <div key={idx} className="rounded-lg border border-gray-800 bg-gray-900/50 p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{reply.contact_name || reply.contact_email}</p>
                  <p className="text-xs text-gray-500 truncate">{reply.contact_email}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium ${categoryColor(reply.category)}`}>
                    {categoryLabel(reply.category)}
                  </span>
                  <span className="text-[10px] text-gray-600">{Math.round(reply.confidence * 100)}%</span>
                </div>
              </div>
              {reply.subject && (
                <p className="text-xs text-gray-400 italic truncate">&ldquo;{reply.subject}&rdquo;</p>
              )}
              {reply.summary && (
                <p className="text-xs text-gray-400">{reply.summary}</p>
              )}
              {reply.suggested_action && (
                <div className="rounded bg-indigo-500/5 border border-indigo-500/10 px-2 py-1.5">
                  <p className="text-[10px] font-medium text-indigo-400 uppercase mb-0.5">Suggested action</p>
                  <p className="text-xs text-gray-300">{reply.suggested_action}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
