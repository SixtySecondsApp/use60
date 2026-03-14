/**
 * Command Centre Keyboard Navigation Hook
 *
 * Manages keyboard navigation state for the Command Centre feed.
 * Shortcuts are only active when not typing in inputs, textareas, selects,
 * or contenteditable elements (e.g. TipTap editor).
 *
 * Supported keys:
 *   j       — move selection down (detail panel updates immediately)
 *   k       — move selection up (detail panel updates immediately)
 *   Enter   — toggle side panel for highlighted item (legacy compat)
 *   a       — approve highlighted item (only if status is open/ready)
 *   d       — dismiss highlighted item
 *   Escape  — clear selection
 *
 * Note: 'e' shortcut for edit mode will be handled by dispatching a custom
 * event or passing a ref — deferred because edit mode is internal to
 * CCEmailPanel and requires a separate wiring step.
 */

import { useState, useEffect, useCallback } from 'react';
import type { CCItem } from '@/lib/services/commandCentreItemsService';

// ============================================================================
// Types
// ============================================================================

export interface UseCommandCentreKeyboardOptions {
  items: CCItem[];
  selectedItem: CCItem | null;
  onSelectItem: (item: CCItem | null) => void;
  onApprove: (id: string) => void;
  onDismiss: (id: string) => void;
  /** Whether the side panel is currently open */
  isPanelOpen: boolean;
}

export interface UseCommandCentreKeyboardReturn {
  /** Currently highlighted item index (-1 if none) */
  highlightedIndex: number;
  /** Set the highlighted index programmatically */
  setHighlightedIndex: (index: number) => void;
  /** Whether a specific item is highlighted */
  isHighlighted: (itemId: string) => boolean;
}

// ============================================================================
// Hook
// ============================================================================

export function useCommandCentreKeyboard(
  options: UseCommandCentreKeyboardOptions
): UseCommandCentreKeyboardReturn {
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // Reset highlight when the item list length changes (e.g. after approve/dismiss)
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [options.items.length]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't intercept when the user is typing in a form element or
      // a contenteditable (covers TipTap and other rich-text editors)
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      const items = options.items;
      if (items.length === 0) return;

      switch (e.key) {
        case 'j': {
          // Move selection down — detail panel updates immediately
          e.preventDefault();
          const newIndex = Math.min(highlightedIndex + 1, items.length - 1);
          setHighlightedIndex(newIndex);
          options.onSelectItem(items[newIndex]);
          break;
        }

        case 'k': {
          // Move selection up — detail panel updates immediately
          e.preventDefault();
          const newIndex = Math.max(highlightedIndex - 1, 0);
          setHighlightedIndex(newIndex);
          options.onSelectItem(items[newIndex]);
          break;
        }

        case 'Enter': {
          // Toggle panel open/close for the highlighted item (legacy compat)
          e.preventDefault();
          if (highlightedIndex >= 0 && highlightedIndex < items.length) {
            const item = items[highlightedIndex];
            if (options.selectedItem?.id === item.id) {
              options.onSelectItem(null);
            } else {
              options.onSelectItem(item);
            }
          }
          break;
        }

        case 'a': {
          // Approve the highlighted item (guard: only open or ready items)
          e.preventDefault();
          if (highlightedIndex >= 0 && highlightedIndex < items.length) {
            const item = items[highlightedIndex];
            if (item.status === 'open' || item.status === 'ready') {
              options.onApprove(item.id);
            }
          }
          break;
        }

        case 'd': {
          // Dismiss the highlighted item
          e.preventDefault();
          if (highlightedIndex >= 0 && highlightedIndex < items.length) {
            const item = items[highlightedIndex];
            options.onDismiss(item.id);
          }
          break;
        }

        case 'Escape': {
          // Clear selection (detail panel closes)
          e.preventDefault();
          setHighlightedIndex(-1);
          options.onSelectItem(null);
          break;
        }

        default:
          break;
      }
    },
    [highlightedIndex, options]
  );

  // Attach / clean up the document-level keydown listener
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const isHighlighted = useCallback(
    (itemId: string): boolean => {
      if (highlightedIndex < 0 || highlightedIndex >= options.items.length) {
        return false;
      }
      return options.items[highlightedIndex]?.id === itemId;
    },
    [highlightedIndex, options.items]
  );

  return {
    highlightedIndex,
    setHighlightedIndex,
    isHighlighted,
  };
}
