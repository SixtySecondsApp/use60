/**
 * RacePanel
 *
 * Chat execution panel for the multi-agent demo. Shows streaming messages,
 * tool call badges, agent working indicators, and a running timer.
 * Supports both mock mode (client-side simulation) and live mode (edge function).
 */

import { useEffect, useRef, useState } from 'react';
import { Loader2, Wrench, Timer, User, Bot } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { AgentWorkingIndicator } from '@/components/copilot/AgentWorkingIndicator';
import { AgentTimeline } from './AgentTimeline';
import { useMockAgentRace } from './useMockAgentRace';
import type { PanelMetrics } from './types';

// =============================================================================
// Timer display
// =============================================================================

function RunningTimer({ startTime, endTime }: { startTime: number; endTime: number | null }) {
  const [elapsed, setElapsed] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (endTime) {
      setElapsed(endTime - startTime);
      return;
    }

    const tick = () => {
      setElapsed(Date.now() - startTime);
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [startTime, endTime]);

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
      <Timer className="h-3 w-3" />
      {(elapsed / 1000).toFixed(1)}s
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

interface RacePanelProps {
  mode: 'single' | 'multi';
  scenarioId: string | null;
  startSignal: number; // Timestamp — changes trigger a new run
  onMetricsReady: (metrics: PanelMetrics) => void;
}

export function RacePanel({ mode, scenarioId, startSignal, onMetricsReady }: RacePanelProps) {
  const { state, run, reset } = useMockAgentRace(mode);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevSignalRef = useRef(0);

  // Trigger run when startSignal changes
  useEffect(() => {
    if (startSignal > 0 && startSignal !== prevSignalRef.current && scenarioId) {
      prevSignalRef.current = startSignal;
      reset();
      // Small stagger so UI can clear
      setTimeout(() => run(scenarioId), 50);
    }
  }, [startSignal, scenarioId, run, reset]);

  // Report metrics when ready
  useEffect(() => {
    if (state.metrics) {
      onMetricsReady(state.metrics);
    }
  }, [state.metrics, onMetricsReady]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.messages, state.toolsUsed, state.activeAgents]);

  const isIdle = !state.isThinking && !state.isStreaming && !state.metrics;
  const isRunning = state.isThinking || state.isStreaming;
  const raceStart = state.metrics?.startTime ?? (startSignal > 0 ? startSignal : 0);

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="py-3 px-4 border-b flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge
              variant={mode === 'multi' ? 'default' : 'secondary'}
              className="text-xs"
            >
              {mode === 'single' ? 'Single Agent' : 'Multi-Agent'}
            </Badge>
            {mode === 'multi' && (
              <span className="text-[10px] text-muted-foreground">
                Orchestrator + Specialists
              </span>
            )}
          </div>
          {raceStart > 0 && (
            <RunningTimer startTime={raceStart} endTime={state.metrics?.endTime ?? null} />
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-0 overflow-hidden flex flex-col">
        {/* Message area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0" style={{ maxHeight: 400 }}>
          {isIdle && (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Select a scenario and click Run
            </div>
          )}

          {/* User message */}
          {state.messages.length > 0 && scenarioId && (
            <div className="flex items-start gap-2">
              <div className="flex-shrink-0 rounded-full bg-primary/10 p-1.5">
                <User className="h-3 w-3 text-primary" />
              </div>
              <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 max-w-full">
                <p className="line-clamp-2 text-xs">{state.messages[0]?.content === 'prompt' ? '...' : state.messages[0]?.content}</p>
              </div>
            </div>
          )}

          {/* Tool call badges */}
          {state.toolsUsed.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {state.toolsUsed.map((tool, i) => (
                <Badge
                  key={`${tool}-${i}`}
                  variant="outline"
                  className="text-[10px] gap-1 font-mono"
                >
                  <Wrench className="h-2.5 w-2.5" />
                  {tool}
                </Badge>
              ))}
            </div>
          )}

          {/* Agent working indicators (multi-agent only) */}
          {mode === 'multi' && state.activeAgents.length > 0 && (
            <AgentWorkingIndicator agents={state.activeAgents} />
          )}

          {/* Agent timeline (multi-agent only) */}
          {mode === 'multi' && state.timeline.length > 0 && raceStart > 0 && (
            <AgentTimeline
              entries={state.timeline}
              isRunning={isRunning}
              raceStartTime={raceStart}
            />
          )}

          {/* Thinking indicator */}
          {state.isThinking && state.messages.length < 2 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>{mode === 'multi' ? 'Classifying intent and delegating...' : 'Processing...'}</span>
            </div>
          )}

          {/* Streaming response */}
          {state.messages.length > 1 && (
            <div className="flex items-start gap-2">
              <div className="flex-shrink-0 rounded-full bg-emerald-500/10 p-1.5">
                <Bot className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className={cn(
                'text-sm rounded-lg px-3 py-2 max-w-full',
                state.isStreaming ? 'animate-pulse' : ''
              )}>
                <p className="text-xs leading-relaxed">{state.messages[1].content}</p>
              </div>
            </div>
          )}

          {/* Completion indicator */}
          {state.metrics && (
            <div className="text-center">
              <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                Complete in {(state.metrics.durationMs / 1000).toFixed(1)}s
              </Badge>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
