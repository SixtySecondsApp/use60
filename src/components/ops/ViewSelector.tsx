import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, MoreHorizontal, Pencil, Copy, Trash2, Settings2 } from 'lucide-react';
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
  onEditView?: (viewId: string) => void;
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
  onEditView,
}: ViewSelectorProps) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

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

  // Close menu on outside click or scroll
  useEffect(() => {
    if (!menuOpenId) return;

    function handleClickOutside(e: MouseEvent) {
      const triggerEl = triggerRefs.current.get(menuOpenId!);
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        (!triggerEl || !triggerEl.contains(e.target as Node))
      ) {
        setMenuOpenId(null);
      }
    }

    function handleScroll() {
      setMenuOpenId(null);
    }

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [menuOpenId]);

  const openMenu = useCallback((viewId: string) => {
    const triggerEl = triggerRefs.current.get(viewId);
    if (triggerEl) {
      const rect = triggerEl.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, left: rect.left });
    }
    setMenuOpenId(viewId);
  }, []);

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

  // Find the view for the open menu
  const menuView = menuOpenId ? sortedViews.find((v) => v.id === menuOpenId) : null;

  return (
    <>
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
                  openMenu(view.id);
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
                    ref={(el) => {
                      if (el) triggerRefs.current.set(view.id, el);
                      else triggerRefs.current.delete(view.id);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (menuOpenId === view.id) {
                        setMenuOpenId(null);
                      } else {
                        openMenu(view.id);
                      }
                    }}
                    className="ml-0.5 rounded p-0.5 text-gray-500 transition-colors hover:bg-gray-700/50 hover:text-gray-300"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
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

      {/* Context menu rendered via portal to avoid overflow clipping */}
      {menuOpenId && menuView && menuPos && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}
          className="z-[9999] w-40 rounded-lg border border-gray-700 bg-gray-800 py-1 shadow-xl"
        >
          {!menuView.is_system && onEditView && (
            <button
              onClick={() => {
                onEditView(menuView.id);
                setMenuOpenId(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-300 transition-colors hover:bg-gray-700/60 hover:text-white"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Edit view
            </button>
          )}
          <button
            onClick={() => handleStartRename(menuView)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-300 transition-colors hover:bg-gray-700/60 hover:text-white"
          >
            <Pencil className="h-3.5 w-3.5" />
            Rename
          </button>
          <button
            onClick={() => {
              onDuplicateView(menuView);
              setMenuOpenId(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-300 transition-colors hover:bg-gray-700/60 hover:text-white"
          >
            <Copy className="h-3.5 w-3.5" />
            Duplicate
          </button>
          {!menuView.is_system && (
            <button
              onClick={() => {
                onDeleteView(menuView.id);
                setMenuOpenId(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
