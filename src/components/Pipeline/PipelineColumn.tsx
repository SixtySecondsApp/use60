/**
 * PipelineColumn Component (PIPE-010)
 *
 * Premium glass-morphism column with stage color gradient stripe,
 * colored count badges, and @hello-pangea/dnd drop zone.
 */

import React, { useMemo } from 'react';
import { Droppable, Draggable } from '@hello-pangea/dnd';
import { DealCard } from './DealCard';
import { Plus, Inbox } from 'lucide-react';
import { getLogoDevUrl } from '@/lib/utils/logoDev';
import { extractDomain } from './hooks/useCompanyLogoBatch';
import { useOrgMoney } from '@/lib/hooks/useOrgMoney';

interface PipelineColumnProps {
  stage: {
    id: string;
    name: string;
    color: string;
    default_probability: number;
  };
  deals: any[];
  onDealClick: (dealId: string) => void;
  onAddDealClick: (stageId: string) => void;
  onConvertToSubscription?: (deal: any) => void;
  batchedMetadata?: {
    nextActions: Record<string, { pendingCount: number; highUrgencyCount: number }>;
    healthScores: Record<string, { overall_health_score: number; health_status: string }>;
    sentimentData: Record<string, { avg_sentiment: number | null; sentiment_history: number[]; trend_direction: string; trend_delta: number; meeting_count: number }>;
  };
}

export function PipelineColumn({
  stage,
  deals,
  onDealClick,
  onAddDealClick,
  onConvertToSubscription,
  batchedMetadata = { nextActions: {}, healthScores: {}, sentimentData: {} },
}: PipelineColumnProps) {
  const { formatMoney: fmtMoney } = useOrgMoney();

  // Calculate total value of deals in this stage
  const totalValue = useMemo(() => {
    return deals.reduce((sum, deal) => sum + parseFloat(deal.value || 0), 0);
  }, [deals]);

  // Format total value
  const formattedTotal = useMemo(() => {
    return fmtMoney(totalValue, { compact: true });
  }, [totalValue, fmtMoney]);

  // Compute logo URLs for deals
  const logoUrls = useMemo(() => {
    const urls: Record<string, string | null> = {};
    deals.forEach((deal) => {
      const domain = extractDomain(deal.company);
      urls[deal.id] = domain ? getLogoDevUrl(domain, { size: 64, format: 'png' }) : null;
    });
    return urls;
  }, [deals]);

  // Create hex to rgba helper for stage color
  const stageColorAlpha = (alpha: number) => {
    const hex = stage.color || '#3B82F6';
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  return (
    <div
      data-testid={`pipeline-column-${stage.id}`}
      className={`
        flex-1 min-w-[300px] max-w-[300px] flex flex-col
        rounded-2xl overflow-hidden
        bg-white/80 dark:bg-white/[0.03]
        backdrop-blur-xl dark:backdrop-blur-xl
        border border-gray-200/80 dark:border-white/[0.06]
        max-h-[calc(100vh-250px)]
        transition-all duration-200
      `}
    >
      {/* Stage color gradient stripe at top */}
      <div
        className="h-[2.5px] w-full"
        style={{
          background: `linear-gradient(90deg, ${stage.color}, ${stageColorAlpha(0.3)})`,
        }}
      />

      {/* Column Header */}
      <div className="px-4 pt-3.5 pb-3 border-b border-gray-200/80 dark:border-white/[0.06]">
        {/* Stage Name and Count */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2.5">
            <span className="text-[13px] font-bold text-gray-900 dark:text-gray-100 tracking-tight">
              {stage.name}
            </span>
            <span
              className="text-[10.5px] font-bold px-2 py-[1px] rounded-full"
              style={{
                backgroundColor: stageColorAlpha(0.12),
                color: stage.color,
              }}
            >
              {deals.length}
            </span>
          </div>

          <button className="w-[26px] h-[26px] rounded-md flex items-center justify-center text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.05] hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="5" r="1" />
              <circle cx="12" cy="12" r="1" />
              <circle cx="12" cy="19" r="1" />
            </svg>
          </button>
        </div>

        {/* Stage Value */}
        <div className="flex items-center gap-3">
          <span className="text-base font-bold text-gray-900 dark:text-gray-100 tracking-tight">
            {formattedTotal}
          </span>
          <span className="text-[10.5px] font-semibold text-gray-500 dark:text-gray-500 flex items-center gap-1">
            <span className="text-emerald-500">&#8593;</span>
            {stage.default_probability}%
          </span>
        </div>
      </div>

      {/* Droppable Deal Container */}
      <Droppable droppableId={stage.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`
              flex-1 overflow-y-auto p-2 flex flex-col gap-[7px]
              min-h-[120px]
              transition-all duration-150
              scrollbar-thin
              ${snapshot.isDraggingOver ? 'bg-blue-50/50 dark:bg-blue-500/[0.05] ring-1 ring-inset ring-blue-400/20' : ''}
            `}
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(255,255,255,0.06) transparent',
            }}
          >
            {/* Empty state */}
            {deals.length === 0 && !snapshot.isDraggingOver && (
              <div className="flex-1 flex flex-col items-center justify-center py-8 text-gray-400 dark:text-gray-500">
                <Inbox className="w-9 h-9 mb-2.5 opacity-20" />
                <p className="text-xs font-medium opacity-70">No deals</p>
              </div>
            )}

            {deals.map((deal, index) => {
              const dealId = String(deal.id);
              return (
                <Draggable key={dealId} draggableId={dealId} index={index}>
                  {(dragProvided, dragSnapshot) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      {...dragProvided.dragHandleProps}
                      onClick={() => onDealClick(deal.id)}
                    >
                      <DealCard
                        deal={deal}
                        logoUrl={logoUrls[dealId] || undefined}
                        isDragging={dragSnapshot.isDragging}
                      />
                    </div>
                  )}
                </Draggable>
              );
            })}

            {provided.placeholder}
          </div>
        )}
      </Droppable>

      {/* Add Deal Button */}
      <div className="px-2 pb-2.5 pt-1">
        <button
          onClick={() => onAddDealClick(stage.id)}
          className="
            w-full flex items-center justify-center gap-1.5
            py-2.5 rounded-lg
            border-[1.5px] border-dashed border-gray-200 dark:border-white/[0.08]
            text-gray-400 dark:text-gray-500 text-xs font-medium
            hover:border-blue-400/30 dark:hover:border-blue-400/20
            hover:text-blue-500 dark:hover:text-blue-400
            hover:bg-blue-50/30 dark:hover:bg-blue-500/[0.03]
            transition-all duration-200
          "
        >
          <Plus className="w-3.5 h-3.5" />
          Add deal
        </button>
      </div>
    </div>
  );
}
