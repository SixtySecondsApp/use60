import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, MoreHorizontal, Pencil, Copy, Trash2 } from 'lucide-react';
import type { SavedView } from '@/lib/services/opsTableService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ViewSelectorProps {
  views: SavedView[];
  activeViewId: string | null;
  onSelectView: (viewId: string) => void;
  onCreateView: () => void;
  onRenameView: (viewId: string, name: string) => void;
  onDuplicateView: (view: SavedView) => void;
  onDeleteView: (viewId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ViewSelector({
  views,
  activeViewId,
  onSelectView,
  onCreateView,
  onRenameView,
  onDuplicateView,
  onDeleteView,
}: ViewSelectorProps) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Sort: system views first, then by position
  const sortedViews = [...views].sort((a, b) => {
    if (a.is_system !== b.is_system) return a.is_system ? -1 : 1;
    return a.position - b.position;
  });

  // Focus rename input when entering rename mode
  useEffect(() => {
    if (renamingId) {
      setTimeout(() => renameInputRef.current?.focus(), 50);
    }
  }, [renamingId]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpenId) return;

    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpenId]);

  const handleStartRename = useCallback((view: SavedView) => {
    setRenamingId(view.id);
    setRenameValue(view.name);
    setMenuOpenId(null);
  }, []);

  const handleCommitRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      onRenameView(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue('');
  }, [renamingId, renameValue, onRenameView]);

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCommitRename();
      }
      if (e.key === 'Escape') {
        setRenamingId(null);
        setRenameValue('');
      }
    },
    [handleCommitRename],
  );

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
      {sortedViews.map((view) => {
        const isActive = view.id === activeViewId;
        const isRenaming = view.id === renamingId;

        return (
          <div key={view.id} className="relative flex shrink-0 items-center">
            {/* Tab */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                if (!isRenaming) onSelectView(view.id);
              }}
              onKeyDown={(e) => {
                if (!isRenaming && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onSelectView(view.id);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenuOpenId(view.id);
              }}
              className={`
                inline-flex cursor-pointer select-none items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium
                transition-colors
                ${
                  isActive
                    ? 'border-violet-500/30 bg-violet-600/20 text-violet-300'
                    : 'border-gray-700/50 bg-gray-800/60 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                }
              `}
            >
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={handleRenameKeyDown}
                  onBlur={handleCommitRename}
                  className="w-24 bg-transparent text-sm outline-none"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span>{view.name}</span>
              )}

              {/* Menu trigger (not shown while renaming) */}
              {!isRenaming && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpenId(menuOpenId === view.id ? null : view.id);
                  }}
                  className="ml-0.5 rounded p-0.5 text-gray-500 transition-colors hover:bg-gray-700/50 hover:text-gray-300"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Context menu */}
            {menuOpenId === view.id && (
              <div
                ref={menuRef}
                className="absolute left-0 top-full z-50 mt-1 w-40 rounded-lg border border-gray-700 bg-gray-800 py-1 shadow-xl"
              >
                <button
                  onClick={() => handleStartRename(view)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-300 transition-colors hover:bg-gray-700/60 hover:text-white"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Rename
                </button>
                <button
                  onClick={() => {
                    onDuplicateView(view);
                    setMenuOpenId(null);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-300 transition-colors hover:bg-gray-700/60 hover:text-white"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Duplicate
                </button>
                {!view.is_system && (
                  <button
                    onClick={() => {
                      onDeleteView(view.id);
                      setMenuOpenId(null);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Create new view button */}
      <button
        onClick={onCreateView}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-dashed border-gray-700/50 px-2.5 py-1.5 text-sm text-gray-500 transition-colors hover:border-gray-600 hover:bg-gray-800/40 hover:text-gray-300"
      >
        <Plus className="h-3.5 w-3.5" />
        <span>New view</span>
      </button>
    </div>
  );
}
