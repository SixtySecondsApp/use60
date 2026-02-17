/**
 * PipelineKanban Component (PIPE-011)
 *
 * Kanban board view with DnD-kit drag-and-drop.
 * Fixed: DragOverlay passes isDragOverlay, TouchSensor for mobile,
 * dropAnimation with spring physics, styled floating card.
 */

import React, { useState, useRef, useMemo } from 'react';
import {
  DndContext,
  closestCorners,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
  DragEndEvent,
  MeasuringStrategy,
  DragOverEvent,
  DragStartEvent,
} from '@dnd-kit/core';
import { PipelineColumn } from './PipelineColumn';
import { DealCard } from './DealCard';
import type { PipelineDeal, StageMetric } from './hooks/usePipelineData';
import { getLogoDevUrl } from '@/lib/utils/logoDev';
import { extractDomain } from './hooks/useCompanyLogoBatch';
import { toast } from 'sonner';
import logger from '@/lib/utils/logger';

interface PipelineKanbanProps {
  stageMetrics: StageMetric[];
  dealsByStage: Record<string, PipelineDeal[]>;
  onDealClick: (dealId: string) => void;
  onDealStageChange: (dealId: string, newStageId: string) => Promise<void>;
}

// Custom drop animation with spring physics
const dropAnimationConfig = {
  duration: 250,
  easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
};

export function PipelineKanban({
  stageMetrics,
  dealsByStage,
  onDealClick,
  onDealStageChange,
}: PipelineKanbanProps) {
  const [localDealsByStage, setLocalDealsByStage] = useState(dealsByStage);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [draggedFromStage, setDraggedFromStage] = useState<string | null>(null);
  const [activeDeal, setActiveDeal] = useState<PipelineDeal | null>(null);
  const lastValidOverStageRef = useRef<string | null>(null);

  // Update local state when prop changes (but not during drag)
  React.useEffect(() => {
    if (!draggedId) {
      setLocalDealsByStage(dealsByStage);
    }
  }, [dealsByStage, draggedId]);

  // Configure sensors - PointerSensor for desktop, TouchSensor for mobile
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    })
  );

  // Compute logo URL for the overlay deal
  const overlayLogoUrl = useMemo(() => {
    if (!activeDeal) return undefined;
    const domain = extractDomain(activeDeal.company);
    return domain ? getLogoDevUrl(domain, { size: 64, format: 'png' }) || undefined : undefined;
  }, [activeDeal]);

  // Find stage for a given ID (deal or stage)
  const findStageForId = (id: string): string | undefined => {
    if (id in localDealsByStage) return id;
    return Object.keys(localDealsByStage).find(stageId =>
      localDealsByStage[stageId].some(deal => deal.id === id)
    );
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const id = String(active.id);
    setDraggedId(id);
    const fromStage = findStageForId(id);
    setDraggedFromStage(fromStage || null);

    // Set activeDeal for overlay
    let deal = null;
    for (const stageId in localDealsByStage) {
      deal = localDealsByStage[stageId].find(d => d.id === id);
      if (deal) break;
    }
    setActiveDeal(deal);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    const fromStage = findStageForId(activeId);
    let toStage = findStageForId(overId);

    // If overId is a stageId (column), use it directly
    if (!toStage && stageMetrics.find(s => s.stage_id === overId)) {
      toStage = overId;
    }
    if (!fromStage || !toStage) return;

    // If dropped on the same stage and same position, do nothing
    if (fromStage === toStage && overId === activeId) return;

    // Find the index in the target stage
    let toIndex = localDealsByStage[toStage].findIndex(d => d.id === overId);
    if (toIndex === -1 || overId === toStage) {
      toIndex = localDealsByStage[toStage].length;
    }

    // Store last valid over stage for drop fallback
    lastValidOverStageRef.current = toStage;

    // Optimistically update localDealsByStage for visual feedback
    setLocalDealsByStage(prev => {
      const fromDeals = [...prev[fromStage]];
      const dealIdx = fromDeals.findIndex(d => d.id === activeId);
      if (dealIdx === -1) return prev;
      const [deal] = fromDeals.splice(dealIdx, 1);

      const toDeals = [...prev[toStage]];
      if (!toDeals.some(d => d.id === activeId)) {
        toDeals.splice(toIndex, 0, { ...deal, stage_id: toStage });
      }

      return {
        ...prev,
        [fromStage]: fromDeals,
        [toStage]: toDeals,
      };
    });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    const activeId = String(active.id);

    let toStage = over ? findStageForId(String(over.id)) : null;
    if (!toStage && over && stageMetrics.find(s => s.stage_id === String(over.id))) {
      toStage = String(over.id);
    }
    if (!toStage) {
      toStage = lastValidOverStageRef.current;
    }
    const fromStage = draggedFromStage;

    // Cleanup drag state
    setDraggedId(null);
    setDraggedFromStage(null);
    setActiveDeal(null);
    lastValidOverStageRef.current = null;

    if (!fromStage || !toStage || fromStage === toStage) {
      return;
    }

    // Persist to DB
    try {
      await onDealStageChange(activeId, toStage);
    } catch (err) {
      toast.error('Failed to move deal. Please try again.');
      logger.error('Error updating deal stage:', err);
      setLocalDealsByStage(dealsByStage);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      measuring={{
        droppable: {
          strategy: MeasuringStrategy.Always,
        },
      }}
      autoScroll={{
        threshold: {
          x: 0.2,
          y: 0.2,
        },
        interval: 10,
      }}
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
            onAddDealClick={() => {
              logger.log('Add deal clicked for stage:', stage.stage_id);
            }}
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

      {/* DragOverlay - floating card that follows cursor */}
      <DragOverlay dropAnimation={dropAnimationConfig}>
        {activeDeal && (
          <DealCard
            key={`overlay-${activeDeal.id}`}
            deal={activeDeal}
            logoUrl={overlayLogoUrl}
            onClick={() => {}}
            isDragOverlay={true}
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}
