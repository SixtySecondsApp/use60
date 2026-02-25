/**
 * AgentResearch — Step 3
 *
 * Live visual showing 6 agents researching the user's website.
 * Each agent row shows Lucide icon, name, status, and streaming findings.
 * Progress bar fills as agents complete. Shows a "compiling" state when
 * animation finishes but the API is still loading. Calls onComplete 1.5s
 * after data is ready.
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

function StatusIcon({ status }: { status: AgentStatus['status'] }) {
  if (status === 'idle') return <div className="w-4 h-4 rounded-full bg-gray-700" />;
  if (status === 'working')
    return <Loader2 className="w-4 h-4 text-violet-400 animate-spin motion-reduce:animate-none" />;
  if (status === 'found')
    return <div className="w-4 h-4 rounded-full bg-emerald-500/80 animate-pulse motion-reduce:animate-none" />;
  return <Check className="w-4 h-4 text-emerald-400" />;
}

export function AgentResearch({
  agents,
  isComplete,
  isAnimationDone,
  stats,
  onComplete,
}: AgentResearchProps) {
  const calledRef = useRef(false);

  useEffect(() => {
    if (isComplete && !calledRef.current) {
      calledRef.current = true;
      const timer = setTimeout(onComplete, 1400);
      return () => clearTimeout(timer);
    }
  }, [isComplete, onComplete]);

  // Calculate progress
  const completedCount = agents.filter((a) => a.status === 'complete').length;
  const activeCount = agents.filter((a) => a.status === 'working' || a.status === 'found').length;
  const progress = (completedCount + activeCount * 0.5) / agents.length;

  // Waiting for API after animation finishes
  const isWaitingForApi = isAnimationDone && !isComplete;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      className="min-h-[100dvh] flex flex-col items-center justify-center px-5 sm:px-6"
    >
      <div className="w-full max-w-md sm:max-w-lg mx-auto">
        {/* Card */}
        <div
          className="bg-gray-900/80 backdrop-blur-sm border border-white/[0.06]
            rounded-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="px-5 sm:px-6 py-4 border-b border-white/[0.05] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-200 tracking-wide uppercase">
              Agent Research
            </h2>
            {isComplete && stats && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full tabular-nums"
              >
                {stats.signals_found} signals &middot; {stats.actions_queued} actions
              </motion.span>
            )}
          </div>

          {/* Progress bar */}
          <div className="h-0.5 bg-gray-800">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress * 100}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className={cn(
                'h-full rounded-full transition-colors duration-300',
                isComplete ? 'bg-emerald-500' : 'bg-violet-500'
              )}
            />
          </div>

          {/* Agent rows */}
          <div className="divide-y divide-white/[0.04]">
            {agents.map((agent, i) => {
              const AgentIcon = ICON_MAP[agent.icon] || Search;
              return (
                <motion.div
                  key={agent.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.25, ease: 'easeOut' }}
                  className="px-5 sm:px-6 py-3 sm:py-3.5 flex items-start gap-3"
                >
                  {/* Icon */}
                  <span className="mt-0.5 shrink-0 w-6 flex items-center justify-center">
                    <AgentIcon className="w-4 h-4 text-gray-400" />
                  </span>

                  {/* Name + finding */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-200">
                        {agent.name}
                      </span>
                      <StatusIcon status={agent.status} />
                    </div>
                    {agent.finding && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className={cn(
                          'text-xs mt-1 leading-relaxed font-mono',
                          agent.status === 'complete'
                            ? 'text-emerald-400/80'
                            : 'text-gray-400'
                        )}
                      >
                        {agent.finding}
                      </motion.p>
                    )}
                    {agent.detail && agent.status !== 'working' && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.6 }}
                        className="text-[11px] mt-0.5 text-gray-500 font-mono truncate"
                      >
                        {agent.detail}
                      </motion.p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Footer — "compiling" state while waiting for API */}
          {isWaitingForApi && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="px-5 sm:px-6 py-4 border-t border-white/[0.05] bg-violet-500/[0.04]"
            >
              <p className="text-sm text-violet-400 font-medium text-center flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" />
                Compiling your intelligence report&hellip;
              </p>
            </motion.div>
          )}

          {/* Footer — complete */}
          {isComplete && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="px-5 sm:px-6 py-4 border-t border-white/[0.05] bg-emerald-500/[0.04]"
            >
              <p className="text-sm text-emerald-400 font-medium text-center flex items-center justify-center gap-2">
                <Check className="w-4 h-4" />
                All agents ready &mdash; preparing your personalised demo
              </p>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
