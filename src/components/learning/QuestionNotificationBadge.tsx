/**
 * QuestionNotificationBadge — LEARN-UI-003
 *
 * Shows pending question count in nav.
 * Queries agent_config_questions where status=pending.
 * Refreshes on focus/visibility change.
 * Click navigates to /settings/teach-sixty.
 */

import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { usePendingConfigQuestions } from '@/lib/services/configQuestionService';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';

interface QuestionNotificationBadgeProps {
  className?: string;
}

export function QuestionNotificationBadge({ className }: QuestionNotificationBadgeProps) {
  const { activeOrgId } = useOrg();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: pending = [] } = usePendingConfigQuestions(
    activeOrgId ?? '',
    user?.id
  );

  const count = pending.length;

  // Refresh on visibility change (tab focus)
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) {
        qc.invalidateQueries({ queryKey: ['config-questions', 'pending'] });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [qc]);

  if (!count) return null;

  return (
    <button
      onClick={() => navigate('/settings/teach-sixty')}
      className={cn(
        'inline-flex items-center justify-center',
        'h-[18px] min-w-[18px] px-1 rounded-full',
        'bg-indigo-500 text-white text-[10px] font-semibold leading-none',
        'hover:bg-indigo-400 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
        className
      )}
      aria-label={`${count} pending question${count !== 1 ? 's' : ''} — click to answer`}
    >
      {count > 9 ? '9+' : count}
    </button>
  );
}
