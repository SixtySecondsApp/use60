/**
 * PipelineKanban Component (PIPE-011)
 *
 * Kanban board view with @hello-pangea/dnd drag-and-drop.
 * Cross-column moves only (no in-column reordering).
 */

import React, { useState, useRef, useMemo } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { PipelineColumn } from './PipelineColumn';
import type { PipelineDeal, StageMetric } from './hooks/usePipelineData';
import { getLogoDevUrl } from '@/lib/utils/logoDev';
import { extractDomain } from './hooks/useCompanyLogoBatch';
import { DealCard } from './DealCard';
import { toast } from 'sonner';
import logger from '@/lib/utils/logger';

interface PipelineKanbanProps {
  stageMetrics: StageMetric[];
  dealsByStage: Record<string, PipelineDeal[]>;
  onDealClick: (dealId: string) => void;
  onDealStageChange: (dealId: string, newStageId: string) => Promise<void>;
  onAddDealClick: (stageId: string | null) => void;
}

export function PipelineKanban({
  stageMetrics,
  dealsByStage,
  onDealClick,
  onDealStageChange,
  onAddDealClick,
}: PipelineKanbanProps) {
  const [localDealsByStage, setLocalDealsByStage] = useState(dealsByStage);
  const isDraggingRef = useRef(false);

  // Build a set of valid stage IDs for O(1) lookup
  const stageIdSet = useMemo(
    () => new Set(stageMetrics.map((s) => s.stage_id)),
    [stageMetrics]
  );

  // Sync local state when server data changes — only when not dragging
  React.useEffect(() => {
    if (!isDraggingRef.current) {
      setLocalDealsByStage(dealsByStage);
    }
  }, [dealsByStage]);

  const handleDragEnd = async (result: DropResult) => {
    isDraggingRef.current = false;
    const { source, destination, draggableId } = result;

    // Dropped outside any droppable
    if (!destination) return;

    const fromStage = source.droppableId;
    const toStage = destination.droppableId;

    // Same column — no-op
    if (fromStage === toStage) return;

    // Validate target is a real stage
    if (!stageIdSet.has(toStage)) return;

    // Optimistic update: move the deal to the target column
    setLocalDealsByStage((prev) => {
      const fromDeals = prev[fromStage]?.filter((d) => d.id !== draggableId) || [];
      const movedDeal = prev[fromStage]?.find((d) => d.id === draggableId);
      if (!movedDeal) return prev;

      const toDeals = [...(prev[toStage] || []), { ...movedDeal, stage_id: toStage }];

      return {
        ...prev,
        [fromStage]: fromDeals,
        [toStage]: toDeals,
      };
    });

    // Persist to DB
    try {
      await onDealStageChange(draggableId, toStage);
    } catch (err) {
      toast.error('Failed to move deal. Please try again.');
      logger.error('Error updating deal stage:', err);
      // Revert optimistic update
      setLocalDealsByStage(dealsByStage);
    }
  };

  return (
    <DragDropContext
      onDragStart={() => { isDraggingRef.current = true; }}
      onDragEnd={handleDragEnd}
    >
      {/* Desktop: Horizontal kanban columns */}
      <div
        className="hidden md:flex gap-3 pb-4 overflow-x-auto"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.06) transparent',
        }}
      >
        {stageMetrics.map((stage) => (
          <PipelineColumn
            key={stage.stage_id}
            stage={{
              id: stage.stage_id,
              name: stage.stage_name,
              color: stage.stage_color || '#3B82F6',
              default_probability: 50,
            }}
            deals={localDealsByStage[stage.stage_id] || []}
            onDealClick={onDealClick}
            onAddDealClick={(stageId) => onAddDealClick(stageId)}
            batchedMetadata={{ nextActions: {}, healthScores: {}, sentimentData: {} }}
          />
        ))}
      </div>

      {/* Mobile: Vertical list with stage headers */}
      <div className="md:hidden space-y-6 pb-4">
        {stageMetrics.map((stage) => {
          const deals = localDealsByStage[stage.stage_id] || [];
          if (deals.length === 0) return null;

          return (
            <div key={stage.stage_id} className="space-y-3">
              {/* Stage header */}
              <div className="flex items-center gap-2 px-2">
                <div
                  className="w-3 h-3 rounded-md flex-shrink-0"
                  style={{ backgroundColor: stage.stage_color || '#3B82F6' }}
                />
                <h3 className="font-semibold text-gray-900 dark:text-white text-lg">
                  {stage.stage_name}
                </h3>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  ({deals.length})
                </span>
              </div>

              {/* Deals */}
              <div className="space-y-2">
                {deals.map((deal) => {
                  const domain = extractDomain(deal.company);
                  const logoUrl = domain ? getLogoDevUrl(domain, { size: 64, format: 'png' }) || undefined : undefined;

                  return (
                    <div key={deal.id} className="w-full">
                      <DealCard
                        deal={deal}
                        logoUrl={logoUrl}
                        onClick={() => onDealClick(deal.id)}
                        isDragging={false}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Scroll indicator for desktop only */}
      {stageMetrics.length > 3 && (
        <div className="text-center text-xs text-gray-500 dark:text-gray-500 mt-2 hidden md:block lg:hidden">
          Scroll horizontally to see all pipeline stages
        </div>
      )}
    </DragDropContext>
  );
}
