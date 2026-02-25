/**
 * AgentResearch V2
 *
 * Enhanced research screen with:
 *   - Radial progress ring instead of linear bar
 *   - Compact agent grid (2x3) instead of stacked list
 *   - Company name reveal when data arrives
 *   - Faster transition to next step
 */

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2, Search, Users, BarChart3, FileText, Target, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentStatus } from './demo-types';

interface AgentResearchProps {
  agents: AgentStatus[];
  isComplete: boolean;
  isAnimationDone: boolean;
  stats: { signals_found: number; actions_queued: number } | null;
  companyName: string | null;
  onComplete: () => void;
}

const ICON_MAP: Record<string, React.ElementType> = {
  search: Search,
  users: Users,
  'bar-chart': BarChart3,
  'file-text': FileText,
  target: Target,
  zap: Zap,
};

function AgentCard({ agent }: { agent: AgentStatus }) {
  const AgentIcon = ICON_MAP[agent.icon] || Search;
  const isWorking = agent.status === 'working';
  const isFound = agent.status === 'found';
  const isDone = agent.status === 'complete';

  return (
    <div
      className={cn(
        'relative p-3 sm:p-3.5 rounded-xl border transition-all duration-300',
        isDone
          ? 'bg-emerald-500/[0.04] border-emerald-500/20'
          : isFound
            ? 'bg-violet-500/[0.04] border-violet-500/20'
            : isWorking
              ? 'bg-white/[0.02] border-white/[0.08]'
              : 'bg-white/[0.01] border-white/[0.04]'
      )}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <AgentIcon className={cn(
          'w-3.5 h-3.5 shrink-0',
          isDone ? 'text-emerald-400' : isFound ? 'text-violet-400' : 'text-zinc-500'
        )} />
        <span className="text-xs font-medium text-zinc-300 truncate">{agent.name}</span>
        <div className="ml-auto shrink-0">
          {isWorking && <Loader2 className="w-3 h-3 text-violet-400 animate-spin motion-reduce:animate-none" />}
          {isFound && <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse motion-reduce:animate-none" />}
          {isDone && <Check className="w-3 h-3 text-emerald-400" />}
        </div>
      </div>
      {agent.finding && (
        <p className={cn(
          'text-[10px] sm:text-[11px] font-mono leading-relaxed line-clamp-2',
          isDone ? 'text-emerald-400/70' : isFound ? 'text-violet-300/70' : 'text-zinc-500'
        )}>
          {agent.finding}
        </p>
      )}
    </div>
  );
}

export function AgentResearch({
  agents,
  isComplete,
  isAnimationDone,
  stats,
  companyName,
  onComplete,
}: AgentResearchProps) {
  const calledRef = useRef(false);

  useEffect(() => {
    if (isComplete && !calledRef.current) {
      calledRef.current = true;
      const timer = setTimeout(onComplete, 1200);
      return () => clearTimeout(timer);
    }
  }, [isComplete, onComplete]);

  const completedCount = agents.filter((a) => a.status === 'complete').length;
  const workingCount = agents.filter((a) => a.status === 'working' || a.status === 'found').length;
  const progress = Math.round(((completedCount + workingCount * 0.5) / agents.length) * 100);
  const isWaitingForApi = isAnimationDone && !isComplete;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      className="min-h-[100dvh] flex flex-col items-center justify-center px-5 sm:px-6"
    >
      <div className="w-full max-w-xl sm:max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full
              border border-white/[0.08] bg-white/[0.03] text-xs text-zinc-400 mb-4"
          >
            {isComplete ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                Done. Here's what we found.
              </>
            ) : (
              <>
                <Loader2 className="w-3 h-3 text-violet-400 animate-spin motion-reduce:animate-none" />
                Working on{companyName ? ` ${companyName}` : ''}...
              </>
            )}
          </motion.div>

          {companyName && isComplete && (
            <motion.h2
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="text-xl sm:text-2xl font-bold text-white tracking-tight"
            >
              {companyName}
            </motion.h2>
          )}

          {isComplete && stats && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-sm text-zinc-400 mt-1.5 tabular-nums"
            >
              {stats.signals_found} signals &middot; {stats.actions_queued} actions ready
            </motion.p>
          )}
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-zinc-800/80 rounded-full overflow-hidden mb-5 sm:mb-6">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className={cn(
              'h-full rounded-full transition-colors duration-500',
              isComplete ? 'bg-emerald-500' : 'bg-violet-500'
            )}
          />
        </div>

        {/* Agent grid — 2x3 on mobile, 3x2 on desktop */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
          {agents.map((agent, i) => (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.25, ease: 'easeOut' }}
            >
              <AgentCard agent={agent} />
            </motion.div>
          ))}
        </div>

        {/* Waiting for API */}
        {isWaitingForApi && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-5 sm:mt-6 text-center"
          >
            <p className="text-sm text-violet-400 font-medium flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" />
              Pulling signals from across the web&hellip;
            </p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
