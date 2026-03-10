/**
 * ResearchFeed
 *
 * Real-time intelligence feed that replaces the loading spinner in CreatorView.
 * Each SSE provider event renders as an animated line showing real data as it arrives.
 * Falls back to a generic loading state if no SSE events come through.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { Search, Building2, Users, Globe, Sparkles, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import type { ProviderEvent } from '../demo/useDemoResearch';

const PROVIDER_META: Record<string, { icon: typeof Search; label: string; color: string }> = {
  exa: { icon: Search, label: 'EXA Search', color: 'text-blue-400' },
  ai_ark: { icon: Building2, label: 'AI Ark', color: 'text-violet-400' },
  apollo: { icon: Users, label: 'Apollo', color: 'text-emerald-400' },
  website: { icon: Globe, label: 'Website', color: 'text-amber-400' },
  gemini: { icon: Sparkles, label: 'Gemini', color: 'text-pink-400' },
};

interface ResearchFeedProps {
  domain: string;
  events: ProviderEvent[];
}

export function ResearchFeed({ domain, events }: ResearchFeedProps) {
  const hasEvents = events.length > 0;

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md"
      >
        {/* Header */}
        <div className="flex flex-col items-center gap-3 mb-6">
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-500/20 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-violet-400" />
            </div>
            <div className="absolute inset-0 w-14 h-14 rounded-2xl border-2 border-violet-500/30 border-t-violet-400 animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-sm text-zinc-300 font-medium">Researching {domain}</p>
            <p className="text-xs text-zinc-600 mt-1">
              {hasEvents ? 'Pulling intelligence from multiple sources' : 'Connecting to enrichment providers'}
            </p>
          </div>
        </div>

        {/* Event feed */}
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {events.map((event, i) => {
              const meta = PROVIDER_META[event.provider] || PROVIDER_META.exa;
              const Icon = meta.icon;
              const isComplete = event.status === 'complete' || event.status === 'skipped';
              const isError = event.status === 'error';
              const isWorking = event.status === 'working';

              return (
                <motion.div
                  key={`${event.provider}-${event.status}-${i}`}
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.25, delay: i * 0.05 }}
                  className={`flex items-start gap-3 px-3.5 py-2.5 rounded-xl border transition-colors ${
                    isComplete
                      ? 'bg-zinc-900/60 border-zinc-800/50'
                      : isError
                        ? 'bg-red-500/5 border-red-500/15'
                        : 'bg-zinc-900/40 border-zinc-800/30'
                  }`}
                >
                  {/* Provider icon */}
                  <div className={`mt-0.5 flex-shrink-0 ${isError ? 'text-red-400' : meta.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold uppercase tracking-wider ${isError ? 'text-red-400' : 'text-zinc-500'}`}>
                        {meta.label}
                      </span>
                      {isComplete && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                      {isError && <AlertCircle className="w-3 h-3 text-red-400" />}
                      {isWorking && <Loader2 className="w-3 h-3 text-zinc-500 animate-spin" />}
                      {event.durationMs && (
                        <span className="text-[10px] text-zinc-600 ml-auto">{event.durationMs}ms</span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5 truncate">{event.summary}</p>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Fallback: no events yet — show generic loading */}
          {!hasEvents && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="space-y-2"
            >
              {Object.entries(PROVIDER_META).slice(0, 4).map(([key, meta], i) => (
                <div
                  key={key}
                  className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-zinc-900/30 border border-zinc-800/20"
                >
                  <meta.icon className={`w-4 h-4 ${meta.color} opacity-30`} />
                  <div className="flex-1">
                    <div className="h-2.5 w-20 bg-zinc-800/50 rounded animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
                  </div>
                  <Loader2 className="w-3 h-3 text-zinc-700 animate-spin" />
                </div>
              ))}
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
