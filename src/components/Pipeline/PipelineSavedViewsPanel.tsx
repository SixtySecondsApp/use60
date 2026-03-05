/**
 * PipelineSavedViewsPanel (PIPE-ADV-001)
 *
 * Dropdown panel for creating, applying, and deleting saved filter presets.
 */

import React, { useState } from 'react';
import { Bookmark, Plus, Trash2, Share2, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { usePipelineSavedViews } from './hooks/usePipelineSavedViews';
import type { PipelineSavedView } from './hooks/usePipelineSavedViews';
import { useAuth } from '@/lib/contexts/AuthContext';

interface PipelineSavedViewsPanelProps {
  /** Current active filters + sort/view state to save */
  currentFilters: PipelineSavedView['filters'];
  /** Called when a saved view is applied */
  onApply: (view: PipelineSavedView) => void;
}

export function PipelineSavedViewsPanel({ currentFilters, onApply }: PipelineSavedViewsPanelProps) {
  const { user } = useAuth();
  const { views, isLoading, createView, deleteView, updateSharing } = usePipelineSavedViews();
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [shareNew, setShareNew] = useState(false);

  const handleCreate = () => {
    if (!newName.trim()) return;
    createView.mutate(
      { name: newName.trim(), filters: currentFilters, isShared: shareNew },
      {
        onSuccess: () => {
          setNewName('');
          setShareNew(false);
          setShowCreate(false);
        },
      }
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium bg-white/60 dark:bg-white/[0.02] border border-gray-200/80 dark:border-white/[0.09] text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-white/[0.13] hover:text-gray-800 dark:hover:text-white hover:bg-white dark:hover:bg-white/[0.04] backdrop-blur-xl transition-all">
          <Bookmark className="w-3.5 h-3.5" />
          Views
          {views.length > 0 && (
            <span className="ml-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400">
              {views.length}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-[260px] p-0" align="start">
        <div className="p-3 border-b border-gray-100 dark:border-white/[0.06]">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              Saved Views
            </span>
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Save current
            </button>
          </div>
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="p-3 border-b border-gray-100 dark:border-white/[0.06] space-y-2">
            <input
              type="text"
              placeholder="View name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
              className="w-full px-2.5 py-1.5 text-sm bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.08] rounded-lg outline-none focus:border-blue-400 dark:focus:border-blue-500/50 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-colors"
            />
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={shareNew}
                onChange={(e) => setShareNew(e.target.checked)}
                className="rounded"
              />
              <span className="text-[12px] text-gray-600 dark:text-gray-400">Share with team</span>
            </label>
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || createView.isPending}
                className="flex-1 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold disabled:opacity-50 transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => { setShowCreate(false); setNewName(''); }}
                className="flex-1 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.08] text-gray-600 dark:text-gray-300 text-xs font-medium hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Views list */}
        <div className="max-h-[280px] overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-gray-400 dark:text-gray-500">
              Loading...
            </div>
          ) : views.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-400 dark:text-gray-500">
              No saved views yet
            </div>
          ) : (
            <div className="p-1.5 space-y-0.5">
              {views.map((view) => {
                const isOwner = view.user_id === user?.id;
                return (
                  <div
                    key={view.id}
                    className="group flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
                  >
                    <button
                      onClick={() => {
                        onApply(view);
                        setOpen(false);
                      }}
                      className="flex-1 flex items-center gap-2 text-left min-w-0"
                    >
                      <Bookmark className="w-3.5 h-3.5 flex-shrink-0 text-gray-400 dark:text-gray-500" />
                      <span className="text-sm text-gray-800 dark:text-gray-200 truncate">
                        {view.name}
                      </span>
                      {view.is_shared && (
                        <Share2 className="w-3 h-3 flex-shrink-0 text-blue-500 dark:text-blue-400" />
                      )}
                    </button>

                    {isOwner && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() =>
                            updateSharing.mutate({ viewId: view.id, isShared: !view.is_shared })
                          }
                          title={view.is_shared ? 'Make private' : 'Share with team'}
                          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-white/[0.06] text-gray-400 hover:text-blue-500 transition-colors"
                        >
                          {view.is_shared ? (
                            <Check className="w-3 h-3" />
                          ) : (
                            <Share2 className="w-3 h-3" />
                          )}
                        </button>
                        <button
                          onClick={() => deleteView.mutate(view.id)}
                          title="Delete view"
                          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-white/[0.06] text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
