/**
 * useRecentItems
 *
 * Persists recently visited/searched items in localStorage.
 * Capped at MAX_ITEMS entries, most recent first.
 * Deduped by (id, type).
 *
 * Story: SRCH-003
 */

import { useState, useCallback, useEffect } from 'react';
import type { SearchEntityType } from './useUnifiedSearch';

// ============================================================================
// Types
// ============================================================================

export interface RecentItem {
  id: string;
  type: SearchEntityType;
  name: string;
  subtitle: string;
  visitedAt: number; // epoch ms
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = 'sixty_recent_items_v1';
const MAX_ITEMS = 8;

// ============================================================================
// Helpers
// ============================================================================

function loadFromStorage(): RecentItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentItem[];
  } catch {
    return [];
  }
}

function saveToStorage(items: RecentItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore quota errors silently
  }
}

// ============================================================================
// Hook
// ============================================================================

export function useRecentItems() {
  const [items, setItems] = useState<RecentItem[]>(() => loadFromStorage());

  // Keep state synced if another tab updates storage
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setItems(loadFromStorage());
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const addItem = useCallback(
    (item: Omit<RecentItem, 'visitedAt'>) => {
      setItems((prev) => {
        // Remove existing entry with same id+type
        const filtered = prev.filter(
          (r) => !(r.id === item.id && r.type === item.type)
        );
        const next: RecentItem[] = [
          { ...item, visitedAt: Date.now() },
          ...filtered,
        ].slice(0, MAX_ITEMS);
        saveToStorage(next);
        return next;
      });
    },
    []
  );

  const clearItems = useCallback(() => {
    saveToStorage([]);
    setItems([]);
  }, []);

  return { items, addItem, clearItems };
}
