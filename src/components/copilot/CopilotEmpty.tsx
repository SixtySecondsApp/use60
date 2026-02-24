/**
 * Copilot Empty State Component
 * Displays when no conversation has started
 * US-008: 4 action cards in 2x2 grid + configure abilities banner
 * UX-004: Input removed -- unified input lives in AssistantShell
 */

import React from 'react';
import { Calendar, Target, AlertCircle, RefreshCw, Sparkles, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useDynamicPrompts } from '@/lib/hooks/useDynamicPrompts';

interface CopilotEmptyProps {
  onPromptClick: (prompt: string) => void;
}

// 4 suggested actions — the most universally useful for daily sales work
const suggestedActions = [
  {
    id: 'cold-outreach',
    icon: Target,
    label: 'Cold Outreach',
    desc: 'Find prospects and send a sequence',
    iconColor: 'text-violet-400',
    prompt: 'Start a campaign to find and reach out to prospects',
  },
  {
    id: 'meeting-prep',
    icon: Calendar,
    label: 'Prep for a meeting',
    desc: 'Briefing before your next call',
    iconColor: 'text-emerald-400',
    prompt: 'Prepare me for my next meeting',
  },
  {
    id: 'attention',
    icon: AlertCircle,
    label: 'What needs attention?',
    desc: 'Stale deals, overdue tasks',
    iconColor: 'text-pink-400',
    prompt: 'What deals or tasks need my attention today?',
  },
  {
    id: 'catch-up',
    icon: RefreshCw,
    label: 'Catch me up',
    desc: 'Summary of recent activity',
    iconColor: 'text-blue-400',
    prompt: 'Catch me up on recent activity and what I missed',
  },
];

export const CopilotEmpty: React.FC<CopilotEmptyProps> = ({ onPromptClick }) => {
  const { prompts: suggestedPrompts, isLoading: promptsLoading } = useDynamicPrompts(4);

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-0 w-full px-3 sm:px-4 py-6 sm:py-8 overflow-y-auto">
      <div className="w-full max-w-3xl mx-auto flex flex-col items-center">
        {/* Welcome Section */}
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2 bg-gradient-to-r from-gray-900 dark:from-white via-gray-900 dark:via-white to-gray-500 dark:to-slate-400 bg-clip-text text-transparent">
            Let&apos;s close more deals today
          </h1>
          <p className="text-gray-600 dark:text-slate-400 text-sm sm:text-base">
            Your AI sales copilot is ready to help
          </p>
        </div>

        {/* 2x2 Action Cards Grid */}
        <div className="w-full max-w-2xl grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-6">
          {suggestedActions.map((action) => (
            <button
              key={action.id}
              onClick={() => onPromptClick(action.prompt)}
              className={cn(
                'group relative p-5 rounded-2xl text-left transition-all',
                'bg-white dark:bg-white/[0.03] backdrop-blur-xl',
                'border border-gray-200 dark:border-white/10',
                'hover:bg-gray-50 dark:hover:bg-white/[0.06]',
                'hover:border-gray-300 dark:hover:border-white/20',
                'hover:scale-[1.02] hover:shadow-xl dark:hover:shadow-violet-500/10',
                'focus:outline-none focus:ring-2 focus:ring-violet-500'
              )}
            >
              <div
                className={cn(
                  'w-12 h-12 rounded-xl flex items-center justify-center mb-4',
                  'bg-white/5 dark:bg-white/[0.08] backdrop-blur-xl',
                  'border border-gray-200/50 dark:border-white/10',
                  'group-hover:bg-white/10 dark:group-hover:bg-white/[0.12]',
                  'group-hover:border-gray-300/50 dark:group-hover:border-white/20',
                  'group-hover:scale-110 transition-all shadow-lg shadow-black/5'
                )}
              >
                <action.icon className={cn('w-6 h-6', action.iconColor)} />
              </div>
              <p className="font-semibold text-gray-900 dark:text-white mb-1 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                {action.label}
              </p>
              <p className="text-sm text-gray-500 dark:text-slate-500 group-hover:text-gray-600 dark:group-hover:text-slate-400 transition-colors">
                {action.desc}
              </p>
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            </button>
          ))}
        </div>

        {/* Configure Abilities Banner */}
        <Link
          to="/agent/marketplace"
          className={cn(
            'w-full max-w-2xl flex items-center justify-between px-5 py-4 rounded-2xl mb-8 transition-all group',
            'bg-gradient-to-r from-[#37bd7e]/10 to-emerald-500/5',
            'dark:from-[#37bd7e]/10 dark:to-emerald-500/5',
            'border border-[#37bd7e]/20 dark:border-[#37bd7e]/20',
            'hover:border-[#37bd7e]/40 dark:hover:border-[#37bd7e]/40',
            'hover:shadow-lg hover:shadow-[#37bd7e]/5'
          )}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#37bd7e]/15 flex items-center justify-center">
              <Sparkles className="w-4.5 h-4.5 text-[#37bd7e]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Configure Abilities
              </p>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Enable campaigns, automations, and more skills for your copilot
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400 dark:text-slate-500 group-hover:text-[#37bd7e] group-hover:translate-x-0.5 transition-all" />
        </Link>

        {/* Quick Prompts */}
        <div className="w-full max-w-2xl">
          <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase mb-4 text-center tracking-wider">
            Try asking
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {promptsLoading ? (
              <>
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="px-4 py-2 bg-gray-100 dark:bg-white/5 rounded-full animate-pulse"
                  >
                    <div className="h-4 bg-gray-200 dark:bg-white/10 rounded w-32" />
                  </div>
                ))}
              </>
            ) : (
              suggestedPrompts.map((prompt, index) => (
                <button
                  key={index}
                  onClick={() => onPromptClick(prompt)}
                  className={cn(
                    'px-4 py-2 rounded-full text-sm',
                    'bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10',
                    'text-gray-600 dark:text-slate-400',
                    'hover:text-gray-900 dark:hover:text-white',
                    'hover:bg-gray-200 dark:hover:bg-white/10',
                    'hover:border-gray-300 dark:hover:border-white/20',
                    'transition-all'
                  )}
                >
                  {prompt}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CopilotEmpty;
