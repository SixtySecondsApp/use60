/**
 * Command Centre — Keyboard Navigation Hook
 *
 * Provides keyboard shortcuts for navigating the task list:
 * - Up/Down arrows: Navigate task list
 * - Enter: Select focused task
 * - N: Focus quick-add input
 * - Escape: Clear selection
 */

import { useEffect, useCallback } from 'react';
import type { Task } from '@/lib/database/models';

interface UseKeyboardNavOptions {
  tasks: Task[];
  selectedTaskId: string | null;
  onSelectTask: (id: string | null) => void;
  onToggleSidebar?: () => void;
  onToggleContext?: () => void;
}

export function useKeyboardNav({
  tasks,
  selectedTaskId,
  onSelectTask,
  onToggleSidebar,
  onToggleContext,
}: UseKeyboardNavOptions) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't handle shortcuts when user is typing in an input/textarea
      const target = e.target as HTMLElement;
      const isEditing =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if (isEditing) return;

      const currentIndex = tasks.findIndex((t) => t.id === selectedTaskId);

      switch (e.key) {
        case 'ArrowUp': {
          e.preventDefault();
          if (tasks.length === 0) return;
          const nextIndex = currentIndex > 0 ? currentIndex - 1 : 0;
          onSelectTask(tasks[nextIndex].id);
          break;
        }

        case 'ArrowDown': {
          e.preventDefault();
          if (tasks.length === 0) return;
          const nextIndex =
            currentIndex < tasks.length - 1 ? currentIndex + 1 : tasks.length - 1;
          onSelectTask(tasks[nextIndex].id);
          break;
        }

        case 'j': {
          e.preventDefault();
          if (tasks.length === 0) return;
          const nextIndex =
            currentIndex < tasks.length - 1 ? currentIndex + 1 : tasks.length - 1;
          onSelectTask(tasks[nextIndex].id);
          break;
        }

        case 'k': {
          e.preventDefault();
          if (tasks.length === 0) return;
          const nextIndex = currentIndex > 0 ? currentIndex - 1 : 0;
          onSelectTask(tasks[nextIndex].id);
          break;
        }

        case 'Enter': {
          // Enter already selects via click, but this ensures keyboard-only works
          if (currentIndex >= 0) {
            onSelectTask(tasks[currentIndex].id);
          }
          break;
        }

        case 'Escape': {
          e.preventDefault();
          onSelectTask(null);
          break;
        }

        case 'n':
        case 'N': {
          // Focus the quick-add input
          const quickAddInput = document.querySelector(
            '[data-command-centre-quick-add]'
          ) as HTMLInputElement | null;
          if (quickAddInput) {
            e.preventDefault();
            quickAddInput.focus();
          }
          break;
        }

        case '[': {
          e.preventDefault();
          onToggleSidebar?.();
          break;
        }

        case ']': {
          e.preventDefault();
          onToggleContext?.();
          break;
        }

        default:
          break;
      }
    },
    [tasks, selectedTaskId, onSelectTask, onToggleSidebar, onToggleContext]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
