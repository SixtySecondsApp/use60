/**
 * AgentWorkingIndicator
 *
 * Shows which specialist agents are currently working during
 * multi-agent execution in the copilot chat.
 */

import { BarChart3, Mail, Search, Database, Calendar, Target, Check, Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ActiveAgent } from '@/lib/hooks/useCopilotChat';

const AGENT_ICON_MAP: Record<string, React.ElementType> = {
  BarChart3,
  Mail,
  Search,
  Database,
  Calendar,
  Target,
};

const AGENT_COLOR_MAP: Record<string, string> = {
  blue: 'text-blue-500',
  purple: 'text-purple-500',
  emerald: 'text-emerald-500',
  orange: 'text-orange-500',
  amber: 'text-amber-500',
  rose: 'text-rose-500',
};

const AGENT_BG_MAP: Record<string, string> = {
  blue: 'bg-blue-500/10',
  purple: 'bg-purple-500/10',
  emerald: 'bg-emerald-500/10',
  orange: 'bg-orange-500/10',
  amber: 'bg-amber-500/10',
  rose: 'bg-rose-500/10',
};

interface AgentWorkingIndicatorProps {
  agents: ActiveAgent[];
}

export function AgentWorkingIndicator({ agents }: AgentWorkingIndicatorProps) {
  if (agents.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 py-2 px-3">
      <AnimatePresence mode="popLayout">
        {agents.map((agent) => {
          const IconComponent = AGENT_ICON_MAP[agent.icon] || Search;
          const colorClass = AGENT_COLOR_MAP[agent.color] || 'text-muted-foreground';
          const bgClass = AGENT_BG_MAP[agent.color] || 'bg-muted/50';
          const isDone = agent.status === 'done';

          return (
            <motion.div
              key={agent.name}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                isDone ? 'opacity-60' : ''
              } ${bgClass}`}
            >
              <div className={`flex-shrink-0 ${colorClass}`}>
                <IconComponent className="h-4 w-4" />
              </div>

              <div className="flex-1 min-w-0">
                <span className="font-medium">{agent.displayName}</span>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {isDone ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-xs text-muted-foreground">Complete</span>
                  </>
                ) : (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground truncate max-w-[160px]">
                      {agent.reason}
                    </span>
                  </>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export default AgentWorkingIndicator;
