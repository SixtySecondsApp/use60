/**
 * BulkActionBar Component (PIPE-ADV-002)
 *
 * Floating action bar for bulk deal operations.
 * Appears at bottom when deals are selected in table view.
 */

import React, { useState } from 'react';
import { X, ArrowRight, XCircle, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import { useQueryClient } from '@tanstack/react-query';
import { useOrgMembers } from '@/lib/hooks/useOrgMembers';
import type { StageMetric } from './hooks/usePipelineData';

interface BulkActionBarProps {
  selectedIds: Set<string>;
  stageMetrics: StageMetric[];
  onClear: () => void;
  onRefresh: () => void;
}

export function BulkActionBar({ selectedIds, stageMetrics, onClear, onRefresh }: BulkActionBarProps) {
  const [loading, setLoading] = useState(false);
  const [showStageMenu, setShowStageMenu] = useState(false);
  const [showOwnerMenu, setShowOwnerMenu] = useState(false);
  const [showConfirmLost, setShowConfirmLost] = useState(false);
  const queryClient = useQueryClient();
  const { data: orgMembers = [] } = useOrgMembers();

  const ids = Array.from(selectedIds);
  const count = ids.length;

  const bulkUpdate = async (updates: Record<string, any>, label: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.from('deals').update(updates).in('id', ids);
      if (error) throw error;
      toast.success(`${count} deal${count !== 1 ? 's' : ''} ${label}`);
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      onClear();
      onRefresh();
    } catch (err: any) {
      toast.error(`Bulk update failed: ${err.message}`);
    } finally {
      setLoading(false);
      setShowStageMenu(false);
      setShowOwnerMenu(false);
      setShowConfirmLost(false);
    }
  };

  // Find Lost stage
  const lostStage = stageMetrics.find((s) => s.stage_name === 'Lost');

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl bg-gray-900/95 dark:bg-gray-800/95 backdrop-blur-xl border border-white/10 shadow-2xl">
      {/* Count */}
      <span className="text-sm font-semibold text-white">
        {count} selected
      </span>

      <div className="w-px h-6 bg-white/20" />

      {/* Move to Stage */}
      <div className="relative">
        <button
          onClick={() => { setShowStageMenu(!showStageMenu); setShowOwnerMenu(false); }}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-50"
        >
          <ArrowRight className="w-3.5 h-3.5" />
          Move to Stage
        </button>
        {showStageMenu && (
          <div className="absolute bottom-full mb-2 left-0 w-44 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-white/10 p-1 max-h-64 overflow-y-auto">
            {stageMetrics.map((stage) => (
              <button
                key={stage.stage_id}
                onClick={() => bulkUpdate({ stage_id: stage.stage_id }, `moved to ${stage.stage_name}`)}
                className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.04] rounded-lg transition-colors flex items-center gap-2"
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: stage.stage_color || '#9ca3af' }}
                />
                {stage.stage_name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Close as Lost */}
      <div className="relative">
        {showConfirmLost ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-300">Close {count} as lost?</span>
            <button
              onClick={() => bulkUpdate(
                { status: 'lost', ...(lostStage ? { stage_id: lostStage.stage_id } : {}) },
                'closed as lost'
              )}
              disabled={loading}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold text-red-400 bg-red-500/20 hover:bg-red-500/30 transition-colors disabled:opacity-50"
            >
              Confirm
            </button>
            <button
              onClick={() => setShowConfirmLost(false)}
              className="px-2 py-1 rounded-lg text-xs text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setShowConfirmLost(true); setShowStageMenu(false); setShowOwnerMenu(false); }}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors disabled:opacity-50"
          >
            <XCircle className="w-3.5 h-3.5" />
            Close as Lost
          </button>
        )}
      </div>

      {/* Assign Owner */}
      <div className="relative">
        <button
          onClick={() => { setShowOwnerMenu(!showOwnerMenu); setShowStageMenu(false); }}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-50"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Assign to
        </button>
        {showOwnerMenu && (
          <div className="absolute bottom-full mb-2 right-0 w-48 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-white/10 p-1 max-h-64 overflow-y-auto">
            {orgMembers.map((member) => (
              <button
                key={member.user_id}
                onClick={() => bulkUpdate({ owner_id: member.user_id }, `assigned to ${member.name || member.email}`)}
                className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.04] rounded-lg transition-colors truncate"
              >
                {member.name || member.email}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-6 bg-white/20" />

      {/* Clear selection */}
      <button
        onClick={onClear}
        className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        title="Clear selection"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default BulkActionBar;
