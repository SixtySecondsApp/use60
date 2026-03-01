/**
 * Landing Builder Right Panel
 * Phase timeline, current deliverable preview, and session info
 */

import React, { useState, useMemo } from 'react';
import { ChevronDown, Layers, FileOutput, Clock, Plus, Eye, Search, CheckCircle2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BuilderPhase, PhaseDeliverable, LandingResearchData } from './types';
import { PhaseTimeline } from './PhaseTimeline';
import { DeliverablePreview } from './DeliverablePreview';
import { ProgressivePreview } from './ProgressivePreview';

interface LandingBuilderRightPanelProps {
  phases: BuilderPhase[];
  currentPhase: number;
  deliverables: Record<number, PhaseDeliverable>;
  onNewProject?: () => void;
  isProcessing?: boolean;
  /** Accumulated approved phase outputs for progressive preview */
  phaseOutputs?: Record<number, string>;
  /** Current active phase (0-based) */
  activePhase?: number;
  /** Generated hero image URL */
  heroImageUrl?: string | null;
  /** Auto-research data from landing-research edge function */
  research?: LandingResearchData | null;
  /** Whether auto-research is currently running */
  isResearching?: boolean;
  /** Called when user clicks a completed phase to go back and edit */
  onPhaseClick?: (phaseId: number) => void;
}

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  iconColor: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({ title, icon, iconColor, defaultOpen = true, children }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-gray-200 dark:border-white/5 last:border-b-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className={cn('w-5 h-5', iconColor)}>{icon}</div>
          <span className="text-xs font-semibold text-gray-900 dark:text-white uppercase tracking-wider">
            {title}
          </span>
        </div>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-gray-400 dark:text-slate-500 transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </button>
      {isOpen && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

export const LandingBuilderRightPanel: React.FC<LandingBuilderRightPanelProps> = ({
  phases,
  currentPhase,
  deliverables,
  onNewProject,
  isProcessing,
  phaseOutputs,
  activePhase,
  heroImageUrl,
  research,
  isResearching,
  onPhaseClick,
}) => {
  const completedPhases = phases.filter((p) => p.status === 'complete').length;
  const latestDeliverableKey = Object.keys(deliverables)
    .map(Number)
    .sort((a, b) => b - a)[0];
  const latestDeliverable = latestDeliverableKey ? deliverables[latestDeliverableKey] : undefined;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-4 border-b border-gray-200 dark:border-white/5">
        <div className="flex items-center gap-2 mb-1">
          <Layers className="w-4 h-4 text-violet-500" />
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            Landing Page Builder
          </span>
        </div>
        <p className="text-xs text-gray-500 dark:text-slate-400">
          {completedPhases}/{phases.length} phases complete
        </p>
        {isProcessing && (
          <div className="mt-2 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
            <span className="text-[11px] text-violet-500 dark:text-violet-400">Processing...</span>
          </div>
        )}
        {/* Research status indicator */}
        {isResearching && (
          <div className="mt-2 flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-blue-500 animate-pulse" />
            <span className="text-[11px] text-blue-500 dark:text-blue-400">Researching your market...</span>
          </div>
        )}
        {research?.status === 'complete' && !isResearching && (() => {
          const ds = research.data_sources;
          if (ds) {
            const total = Object.keys(ds).length;
            const succeeded = Object.values(ds).filter(Boolean).length;
            const isPartial = succeeded < total;
            const failedSources = Object.entries(ds)
              .filter(([, v]) => !v)
              .map(([k]) => k.replace('_', ' '));

            return (
              <div className="mt-2 flex items-center gap-2 group relative">
                {isPartial ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                )}
                <span className={cn(
                  'text-[11px]',
                  isPartial ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                )}>
                  {isPartial
                    ? `Partial research (${succeeded}/${total} sources)`
                    : `Full research complete${research.competitors.length > 0 ? ` (${research.competitors.length} competitors)` : ''}`
                  }
                </span>
                {isPartial && failedSources.length > 0 && (
                  <div className="absolute left-0 top-full mt-1 hidden group-hover:block z-10 bg-gray-900 text-gray-300 text-[10px] rounded-lg px-3 py-2 shadow-lg border border-gray-700 whitespace-nowrap">
                    <p className="font-medium text-gray-400 mb-1">Timed out:</p>
                    {failedSources.map(s => <p key={s}>{s}</p>)}
                  </div>
                )}
              </div>
            );
          }

          return (
            <div className="mt-2 flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
                Market research ready{research.competitors.length > 0 ? ` (${research.competitors.length} competitors found)` : ''}
              </span>
            </div>
          );
        })()}
      </div>

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto">
        {/* Phase Timeline */}
        <CollapsibleSection
          title="Pipeline"
          icon={<Layers className="w-4 h-4" />}
          iconColor="text-violet-400"
          defaultOpen={true}
        >
          <PhaseTimeline
            phases={phases}
            currentPhase={currentPhase}
            onPhaseClick={onPhaseClick}
          />
        </CollapsibleSection>

        {/* Progressive Preview */}
        {phaseOutputs && Object.keys(phaseOutputs).length > 0 && (
          <CollapsibleSection
            title="Preview"
            icon={<Eye className="w-4 h-4" />}
            iconColor="text-violet-400"
            defaultOpen={true}
          >
            <ProgressivePreview
              phaseOutputs={phaseOutputs}
              currentPhase={activePhase ?? 0}
              heroImageUrl={heroImageUrl}
            />
          </CollapsibleSection>
        )}

        {/* Current Deliverable */}
        {latestDeliverable && (
          <CollapsibleSection
            title="Latest Deliverable"
            icon={<FileOutput className="w-4 h-4" />}
            iconColor="text-emerald-400"
            defaultOpen={true}
          >
            <DeliverablePreview
              deliverable={latestDeliverable}
              phaseNumber={latestDeliverableKey as number}
            />
          </CollapsibleSection>
        )}

        {/* Session */}
        <CollapsibleSection
          title="Session"
          icon={<Clock className="w-4 h-4" />}
          iconColor="text-blue-400"
          defaultOpen={false}
        >
          <div className="space-y-3">
            <div className="text-xs text-gray-500 dark:text-slate-400">
              Phase {currentPhase} of {phases.length}
            </div>
            {onNewProject && (
              <button
                onClick={onNewProject}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 w-full rounded-lg text-xs font-medium transition-all',
                  'bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10',
                  'text-gray-600 dark:text-slate-400',
                  'hover:bg-gray-200 dark:hover:bg-white/10',
                  'hover:text-gray-900 dark:hover:text-white'
                )}
              >
                <Plus className="w-3.5 h-3.5" />
                New Project
              </button>
            )}
          </div>
        </CollapsibleSection>
      </div>
    </div>
  );
};

