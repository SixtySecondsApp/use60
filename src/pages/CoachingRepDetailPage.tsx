/**
 * CoachingRepDetailPage — COACH-UI-006
 *
 * Route: /coaching/rep/:userId
 * Shows a rep's meeting scorecard history + trend charts.
 */

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ArrowLeft,
  Loader2,
  FileText,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronRight,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useOrg } from '@/lib/contexts/OrgContext';
import {
  useRepScorecards,
  useSkillProgression,
  gradeBgColour,
  gradeColour,
} from '@/lib/services/coachingDashboardService';
import { SkillProgressionChart } from '@/components/coaching/SkillProgressionChart';
import { RepScorecardView } from '@/components/coaching/RepScorecardView';

interface ScorecardRowProps {
  id: string;
  meetingId: string;
  overallScore: number;
  grade: string;
  createdAt: string;
  selected: boolean;
  onClick: () => void;
}

function ScorecardRow({ id, meetingId, overallScore, grade, createdAt, selected, onClick }: ScorecardRowProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800 transition-colors',
        selected ? 'bg-indigo-500/10' : 'hover:bg-gray-100 dark:hover:bg-gray-800/40'
      )}
    >
      <div className={cn('h-9 w-9 rounded-lg border flex items-center justify-center flex-shrink-0', gradeBgColour(grade))}>
        <span className="text-sm font-bold">{grade}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-semibold', gradeColour(grade))}>
          {overallScore}/100
        </p>
        <p className="text-xs text-gray-500">
          {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 text-gray-600 flex-shrink-0" />
    </button>
  );
}

export default function CoachingRepDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { activeOrgId } = useOrg();
  const [selectedMeetingId, setSelectedMeetingId] = React.useState<string | null>(null);

  const { data: scorecards, isLoading: scorecardsLoading } = useRepScorecards(userId ?? '');

  // Auto-select first scorecard
  React.useEffect(() => {
    if (scorecards && scorecards.length > 0 && !selectedMeetingId) {
      setSelectedMeetingId(scorecards[0].meeting_id);
    }
  }, [scorecards, selectedMeetingId]);

  if (!userId) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No rep selected
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Rep Coaching Detail | 60</title>
      </Helmet>

      <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-950">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <button
            onClick={() => navigate('/coaching')}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Coaching
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
            {/* Skill Progression Chart */}
            {activeOrgId && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 p-5">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-indigo-400" />
                  Skill Progression
                </h3>
                <SkillProgressionChart userId={userId} orgId={activeOrgId} />
              </div>
            )}

            {/* Scorecard History */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* List */}
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-400" />
                    Scorecard History
                  </h3>
                </div>

                {scorecardsLoading ? (
                  <div className="flex items-center justify-center h-40">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
                  </div>
                ) : !scorecards || scorecards.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-gray-600 gap-2">
                    <FileText className="h-6 w-6" />
                    <p className="text-sm">No scorecards yet</p>
                  </div>
                ) : (
                  <div className="overflow-y-auto max-h-[500px]">
                    {scorecards.map((sc) => (
                      <ScorecardRow
                        key={sc.id}
                        id={sc.id}
                        meetingId={sc.meeting_id}
                        overallScore={sc.overall_score}
                        grade={sc.grade}
                        createdAt={sc.created_at}
                        selected={selectedMeetingId === sc.meeting_id}
                        onClick={() => setSelectedMeetingId(sc.meeting_id)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Detail */}
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 overflow-hidden">
                {selectedMeetingId ? (
                  <RepScorecardView
                    meetingId={selectedMeetingId}
                    showGenerateButton={false}
                    className="h-full"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-600 text-sm">
                    Select a scorecard to view details
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
