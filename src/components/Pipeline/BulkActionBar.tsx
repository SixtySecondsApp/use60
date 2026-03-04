/**
 * BulkActionBar (PIPE-ADV-002)
 *
 * Floating action bar shown when deals are multi-selected in the table view.
 * Supports bulk move (stage), bulk tag, and bulk assign (owner).
 */

import React, { useState } from 'react';
import { X, ArrowRight, Tag, UserCheck, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import type { StageMetric } from './hooks/usePipelineData';
import logger from '@/lib/utils/logger';

interface BulkActionBarProps {
  selectedIds: Set<string>;
  stageMetrics: StageMetric[];
  onClear: () => void;
  onRefresh: () => void;
}

const DEAL_TAGS = [
  'Hot', 'Cold', 'Stalled', 'Needs Attention', 'Champion Confirmed',
  'Budget Confirmed', 'Timeline Slipping', 'Competitive', 'Renewal',
];

export function BulkActionBar({ selectedIds, stageMetrics, onClear, onRefresh }: BulkActionBarProps) {
  const count = selectedIds.size;
  const [moveOpen, setMoveOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  if (count === 0) return null;

  const handleBulkMove = async (stageId: string, stageName: string) => {
    setIsProcessing(true);
    setMoveOpen(false);
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase
        .from('deals')
        .update({ stage_id: stageId, stage_changed_at: new Date().toISOString() })
        .in('id', ids);

      if (error) throw error;

      toast.success(`${count} deal${count > 1 ? 's' : ''} moved to ${stageName}`);
      onClear();
      onRefresh();
    } catch (err: any) {
      logger.error('Bulk move failed:', err);
      toast.error(`Failed to move deals: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkTag = async (tag: string) => {
    setIsProcessing(true);
    setTagOpen(false);
    try {
      const ids = Array.from(selectedIds);

      // Fetch existing tags for all selected deals
      const { data: existing, error: fetchErr } = await supabase
        .from('deals')
        .select('id, tags')
        .in('id', ids);

      if (fetchErr) throw fetchErr;

      // Merge tag into each deal's tags array
      const updates = (existing || []).map((d: any) => {
        const currentTags: string[] = Array.isArray(d.tags) ? d.tags : [];
        const newTags = currentTags.includes(tag) ? currentTags : [...currentTags, tag];
        return { id: d.id, tags: newTags };
      });

      for (const update of updates) {
        const { error } = await supabase
          .from('deals')
          .update({ tags: update.tags })
          .eq('id', update.id);
        if (error) throw error;
      }

      toast.success(`Tagged ${count} deal${count > 1 ? 's' : ''} as "${tag}"`);
      onClear();
      onRefresh();
    } catch (err: any) {
      logger.error('Bulk tag failed:', err);
      toast.error(`Failed to tag deals: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-3 rounded-2xl bg-gray-900 dark:bg-white/[0.08] border border-white/10 backdrop-blur-xl shadow-2xl shadow-black/40 animate-in slide-in-from-bottom-4 duration-200">
      {/* Count badge */}
      <div className="flex items-center gap-2 pr-3 border-r border-white/10">
        <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold">
          {count}
        </span>
        <span className="text-sm text-gray-300">
          deal{count > 1 ? 's' : ''} selected
        </span>
      </div>

      {/* Bulk Move */}
      <Popover open={moveOpen} onOpenChange={setMoveOpen}>
        <PopoverTrigger asChild>
          <button
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.10] text-gray-200 text-[12.5px] font-medium transition-colors disabled:opacity-50"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            Move to Stage
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-1.5" align="start" side="top">
          <div className="space-y-0.5">
            {stageMetrics.map((stage) => (
              <button
                key={stage.stage_id}
                onClick={() => handleBulkMove(stage.stage_id, stage.stage_name)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors text-left"
              >
                <span
                  className="w-2 h-2 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: stage.stage_color || '#3B82F6' }}
                />
                {stage.stage_name}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Bulk Tag */}
      <Popover open={tagOpen} onOpenChange={setTagOpen}>
        <PopoverTrigger asChild>
          <button
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.10] text-gray-200 text-[12.5px] font-medium transition-colors disabled:opacity-50"
          >
            <Tag className="w-3.5 h-3.5" />
            Tag
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-1.5" align="start" side="top">
          <div className="space-y-0.5 max-h-[240px] overflow-y-auto">
            {DEAL_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => handleBulkTag(tag)}
                className="w-full px-3 py-2 rounded-lg text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors text-left"
              >
                {tag}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Clear selection */}
      <button
        onClick={onClear}
        className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-white/[0.06] text-gray-400 hover:text-gray-200 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
