/**
 * AgentTimeline
 *
 * Horizontal Gantt-style visualization showing agent execution timelines.
 * Animated bar growth via requestAnimationFrame during execution.
 */

import { useEffect, useRef, useState } from 'react';
import type { TimelineEntry } from './types';

const COLOR_MAP: Record<string, string> = {
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
  emerald: 'bg-emerald-500',
  orange: 'bg-orange-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
};

const TEXT_COLOR_MAP: Record<string, string> = {
  blue: 'text-blue-600 dark:text-blue-400',
  purple: 'text-purple-600 dark:text-purple-400',
  emerald: 'text-emerald-600 dark:text-emerald-400',
  orange: 'text-orange-600 dark:text-orange-400',
  amber: 'text-amber-600 dark:text-amber-400',
  rose: 'text-rose-600 dark:text-rose-400',
};

interface AgentTimelineProps {
  entries: TimelineEntry[];
  isRunning: boolean;
  raceStartTime: number;
}

export function AgentTimeline({ entries, isRunning, raceStartTime }: AgentTimelineProps) {
  const [now, setNow] = useState(Date.now());
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (!isRunning) {
      cancelAnimationFrame(frameRef.current);
      return;
    }

    const tick = () => {
      setNow(Date.now());
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [isRunning]);

  if (entries.length === 0) return null;

  // Calculate total span for scale
  const maxEndMs = Math.max(
    ...entries.map((e) => e.endMs ?? (now - raceStartTime)),
    1000
  );

  return (
    <div className="space-y-2 mt-3">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        Agent Timeline
      </p>
      <div className="space-y-1.5">
        {entries.map((entry) => {
          const startPct = (entry.startMs / maxEndMs) * 100;
          const endMs = entry.endMs ?? (now - raceStartTime);
          const widthPct = Math.max(((endMs - entry.startMs) / maxEndMs) * 100, 2);
          const durationSec = ((entry.endMs ?? (now - raceStartTime)) - entry.startMs) / 1000;

          return (
            <div key={entry.agentName} className="flex items-center gap-2">
              <span className={`text-[10px] font-medium w-16 truncate ${TEXT_COLOR_MAP[entry.color] || 'text-muted-foreground'}`}>
                {entry.displayName.split(' ')[0]}
              </span>
              <div className="flex-1 h-5 bg-muted/50 rounded-sm relative overflow-hidden">
                <div
                  className={`absolute top-0 h-full rounded-sm transition-all duration-100 ${COLOR_MAP[entry.color] || 'bg-gray-500'} ${
                    entry.endMs ? 'opacity-80' : 'opacity-60 animate-pulse'
                  }`}
                  style={{
                    left: `${startPct}%`,
                    width: `${widthPct}%`,
                  }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground w-10 text-right tabular-nums">
                {durationSec.toFixed(1)}s
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
