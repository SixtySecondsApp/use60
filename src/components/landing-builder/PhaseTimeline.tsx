/**
 * Phase Timeline Component
 * Vertical stepper showing the 6-phase landing page pipeline
 */

import React from 'react';
import { CheckCircle2, Circle, RefreshCw, SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BuilderPhase, PhaseStatus } from './types';
import { PHASE_AGENT_MAP, AGENT_BADGES } from './types';

interface PhaseTimelineProps {
  phases: BuilderPhase[];
  currentPhase: number;
  onPhaseClick?: (phase: number) => void;
}

function getStatusIcon(status: PhaseStatus, isActive: boolean) {
  if (status === 'complete') return CheckCircle2;
  if (status === 'iterating') return RefreshCw;
  if (status === 'skipped') return SkipForward;
  if (isActive) return Circle;
  return Circle;
}

function getStatusColor(status: PhaseStatus, isActive: boolean) {
  if (status === 'complete') return 'text-emerald-500 dark:text-emerald-400';
  if (status === 'iterating') return 'text-amber-500 dark:text-amber-400';
  if (status === 'skipped') return 'text-gray-400 dark:text-slate-500';
  if (isActive) return 'text-violet-500 dark:text-violet-400';
  return 'text-gray-300 dark:text-slate-600';
}

function getLineColor(status: PhaseStatus) {
  if (status === 'complete') return 'bg-emerald-500/30 dark:bg-emerald-400/30';
  return 'bg-gray-200 dark:bg-white/5';
}

export const PhaseTimeline: React.FC<PhaseTimelineProps> = ({ phases, currentPhase, onPhaseClick }) => {
  return (
    <div className="space-y-0">
      {phases.map((phase, idx) => {
        const isActive = phase.id === currentPhase;
        const Icon = getStatusIcon(phase.status, isActive);
        const isClickable = phase.status === 'complete' && onPhaseClick;

        return (
          <div key={phase.id} className="flex items-start gap-3 relative">
            {/* Vertical line */}
            {idx < phases.length - 1 && (
              <div
                className={cn(
                  'absolute left-[11px] top-[24px] w-[2px] h-[calc(100%-8px)]',
                  getLineColor(phase.status)
                )}
              />
            )}

            {/* Icon */}
            <div className="flex-shrink-0 relative z-10 pt-0.5">
              <Icon
                className={cn(
                  'w-6 h-6 transition-all',
                  getStatusColor(phase.status, isActive),
                  isActive && phase.status !== 'complete' && 'animate-pulse',
                  isClickable && 'cursor-pointer'
                )}
                onClick={() => isClickable && onPhaseClick(phase.id)}
              />
            </div>

            {/* Content */}
            <button
              type="button"
              disabled={!isClickable}
              onClick={() => isClickable && onPhaseClick(phase.id)}
              className={cn(
                'flex-1 min-w-0 pb-4 text-left',
                isClickable && 'cursor-pointer hover:opacity-80 transition-opacity'
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'text-sm font-medium',
                    isActive
                      ? 'text-gray-900 dark:text-white'
                      : phase.status === 'complete'
                        ? 'text-gray-700 dark:text-slate-300'
                        : 'text-gray-400 dark:text-slate-500'
                  )}
                >
                  {phase.id}. {phase.name}
                </span>
                {isActive && phase.status !== 'complete' && (() => {
                  const agentRole = PHASE_AGENT_MAP[phase.id - 1]; // phase.id is 1-based
                  const badge = agentRole ? AGENT_BADGES[agentRole] : null;
                  return (
                    <span className={cn('text-[10px] font-medium uppercase tracking-wider', badge?.color || 'text-violet-500 dark:text-violet-400')}>
                      {badge?.label || 'Active'}
                    </span>
                  );
                })()}
              </div>
              <span className="text-[11px] text-gray-400 dark:text-slate-500">
                {phase.skill}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
};
