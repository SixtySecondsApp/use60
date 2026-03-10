/**
 * TeachSixtySection — LEARN-UI-005
 *
 * Route: /settings/teach-sixty
 * Lists all pending agent_config_questions, grouped by category.
 * Completeness widget at top. Category tabs. Each question as InAppQuestionCard.
 */

import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  Brain,
  CheckCircle2,
  Loader2,
  Target,
  Clock,
  Bot,
  BookOpen,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useAuth } from '@/lib/contexts/AuthContext';
import { usePendingConfigQuestions, type QuestionCategory } from '@/lib/services/configQuestionService';
import { ConfigCompletenessWidget } from '@/components/learning/ConfigCompletenessWidget';
import { InAppQuestionCard } from '@/components/learning/InAppQuestionCard';
import { AnswerHistoryTimeline } from '@/components/learning/AnswerHistoryTimeline';

// ============================================================================
// Config
// ============================================================================

const CATEGORY_META: Record<
  QuestionCategory,
  { label: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  revenue_pipeline: { label: 'Revenue & Pipeline', Icon: Target },
  daily_rhythm: { label: 'Daily Rhythm', Icon: Clock },
  agent_behaviour: { label: 'Agent Behaviour', Icon: Bot },
  methodology: { label: 'Methodology', Icon: BookOpen },
  signals: { label: 'Signals', Icon: Activity },
};

const CATEGORY_ORDER: QuestionCategory[] = [
  'revenue_pipeline',
  'daily_rhythm',
  'agent_behaviour',
  'methodology',
  'signals',
];

// ============================================================================
// Component
// ============================================================================

export default function TeachSixtySection() {
  const { activeOrgId } = useOrg();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<QuestionCategory | 'all' | 'history'>('all');

  const { data: pending = [], isLoading } = usePendingConfigQuestions(
    activeOrgId ?? '',
    user?.id
  );

  // Build tab list from categories that have pending questions
  const categoriesWithQuestions = CATEGORY_ORDER.filter((cat) =>
    pending.some((q) => q.category === cat)
  );

  // Filter by active tab
  const visibleQuestions =
    activeTab === 'all' || activeTab === 'history'
      ? pending
      : pending.filter((q) => q.category === activeTab);

  const allDone = !isLoading && pending.length === 0;

  return (
    <>
      <Helmet>
        <title>Teach 60 | Settings</title>
      </Helmet>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="h-8 w-8 rounded-lg bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center">
              <Brain className="h-4 w-4 text-indigo-400" />
            </div>
            <h1 className="text-lg font-semibold text-gray-100">Teach 60</h1>
          </div>
          <p className="text-sm text-gray-500 ml-10.5">
            Answer questions to help 60 understand your preferences and work smarter over time.
          </p>
        </div>

        {/* Completeness widget */}
        {activeOrgId && (
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
            <ConfigCompletenessWidget
              orgId={activeOrgId}
              userId={user?.id}
              showCategories
              showCTA={false}
            />
          </div>
        )}

        {/* All-done state */}
        {allDone && activeTab !== 'history' && (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
            <CheckCircle2 className="h-10 w-10 text-emerald-400" />
            <h3 className="text-base font-semibold text-gray-100">All caught up</h3>
            <p className="text-sm text-gray-500 max-w-xs">
              No pending questions right now. 60 will ask more as it learns from your activity.
            </p>
            <button
              onClick={() => setActiveTab('history')}
              className="mt-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              View answer history
            </button>
          </div>
        )}

        {/* Category tabs (only show if there are pending questions) */}
        {!allDone && (
          <>
            <div className="flex items-center gap-1 border-b border-gray-800 overflow-x-auto">
              {/* All tab */}
              <button
                onClick={() => setActiveTab('all')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-all',
                  activeTab === 'all'
                    ? 'border-indigo-500 text-indigo-400'
                    : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-700'
                )}
              >
                All
                {pending.length > 0 && (
                  <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-indigo-500/20 text-indigo-400 text-[10px] font-bold">
                    {pending.length}
                  </span>
                )}
              </button>

              {/* Category tabs */}
              {categoriesWithQuestions.map((cat) => {
                const meta = CATEGORY_META[cat];
                const { Icon } = meta;
                const count = pending.filter((q) => q.category === cat).length;
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveTab(cat)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-all',
                      activeTab === cat
                        ? 'border-indigo-500 text-indigo-400'
                        : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-700'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {meta.label}
                    <span className="text-[10px] text-gray-600">({count})</span>
                  </button>
                );
              })}

              {/* History tab */}
              <button
                onClick={() => setActiveTab('history')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-all ml-auto',
                  activeTab === 'history'
                    ? 'border-indigo-500 text-indigo-400'
                    : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-700'
                )}
              >
                History
              </button>
            </div>

            {/* Question cards */}
            {activeTab !== 'history' && (
              <div className="space-y-3">
                {isLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
                  </div>
                ) : visibleQuestions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-gray-600 gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    <p className="text-sm">No pending questions in this category</p>
                  </div>
                ) : (
                  visibleQuestions.map((q) => (
                    <InAppQuestionCard key={q.id} question={q} />
                  ))
                )}
              </div>
            )}
          </>
        )}

        {/* History tab content */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-200">Answer History</h2>
            <AnswerHistoryTimeline />
          </div>
        )}
      </div>
    </>
  );
}
