/**
 * Command Centre Store
 *
 * Manages UI state for the Command Centre including selection, filters, sorting, and focus navigation.
 * Only persists sidebar collapsed state to localStorage.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Inlined from deleted command-centre/types.ts (orphaned old task-based UI)
type CommandCentreFilter = 'all' | 'review' | 'drafts' | 'working' | 'done';
type CommandCentreSortField = 'urgency' | 'created_at' | 'due_date' | 'priority' | 'ai_status';
type CommandCentreSortOrder = 'asc' | 'desc';

export type CCActiveTab = 'inbox' | 'actions';

interface CommandCentreState {
  // Selection
  selectedTaskId: string | null;

  // Multi-select
  selectedTaskIds: string[];

  // Filters
  activeFilter: CommandCentreFilter;
  searchQuery: string;
  sortField: CommandCentreSortField;
  sortOrder: CommandCentreSortOrder;

  // UI
  sidebarCollapsed: boolean;
  contextOpen: boolean;
  focusedTaskIndex: number;

  // Inbox tab state
  ccActiveTab: CCActiveTab;
  inboxPendingCount: number;

  // Actions
  setSelectedTaskId: (id: string | null) => void;
  setActiveFilter: (filter: CommandCentreFilter) => void;
  setSearchQuery: (query: string) => void;
  setSortField: (field: CommandCentreSortField) => void;
  setSortOrder: (order: CommandCentreSortOrder) => void;
  toggleSidebarCollapsed: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleContextPanel: () => void;
  setContextOpen: (open: boolean) => void;
  setFocusedTaskIndex: (index: number) => void;
  moveFocusUp: () => void;
  moveFocusDown: (maxIndex: number) => void;
  reset: () => void;

  // Multi-select actions
  toggleTaskSelection: (id: string) => void;
  addToSelection: (id: string) => void;
  selectRange: (ids: string[]) => void;
  clearSelection: () => void;

  // Inbox actions
  setCCActiveTab: (tab: CCActiveTab) => void;
  setInboxPendingCount: (count: number) => void;
}

const DEFAULTS = {
  selectedTaskId: null,
  selectedTaskIds: [] as string[],
  activeFilter: 'all' as CommandCentreFilter,
  searchQuery: '',
  sortField: 'urgency' as CommandCentreSortField,
  sortOrder: 'desc' as CommandCentreSortOrder,
  sidebarCollapsed: false,
  contextOpen: false,
  focusedTaskIndex: 0,
  ccActiveTab: 'inbox' as CCActiveTab,
  inboxPendingCount: 0,
};

export const useCommandCentreStore = create<CommandCentreState>()(
  persist(
    (set, get) => ({
      // Initial state
      selectedTaskId: DEFAULTS.selectedTaskId,
      selectedTaskIds: DEFAULTS.selectedTaskIds,
      activeFilter: DEFAULTS.activeFilter,
      searchQuery: DEFAULTS.searchQuery,
      sortField: DEFAULTS.sortField,
      sortOrder: DEFAULTS.sortOrder,
      sidebarCollapsed: DEFAULTS.sidebarCollapsed,
      contextOpen: DEFAULTS.contextOpen,
      focusedTaskIndex: DEFAULTS.focusedTaskIndex,
      ccActiveTab: DEFAULTS.ccActiveTab,
      inboxPendingCount: DEFAULTS.inboxPendingCount,

      // Actions
      setSelectedTaskId: (id: string | null) => {
        set({ selectedTaskId: id });
      },

      setActiveFilter: (filter: CommandCentreFilter) => {
        set({ activeFilter: filter, focusedTaskIndex: 0 });
      },

      setSearchQuery: (query: string) => {
        set({ searchQuery: query, focusedTaskIndex: 0 });
      },

      setSortField: (field: CommandCentreSortField) => {
        set({ sortField: field, focusedTaskIndex: 0 });
      },

      setSortOrder: (order: CommandCentreSortOrder) => {
        set({ sortOrder: order, focusedTaskIndex: 0 });
      },

      toggleSidebarCollapsed: () => {
        set({ sidebarCollapsed: !get().sidebarCollapsed });
      },

      setSidebarCollapsed: (collapsed: boolean) => {
        set({ sidebarCollapsed: collapsed });
      },

      toggleContextPanel: () => {
        set({ contextOpen: !get().contextOpen });
      },

      setContextOpen: (open: boolean) => {
        set({ contextOpen: open });
      },

      setFocusedTaskIndex: (index: number) => {
        set({ focusedTaskIndex: Math.max(0, index) });
      },

      moveFocusUp: () => {
        const { focusedTaskIndex } = get();
        set({ focusedTaskIndex: Math.max(0, focusedTaskIndex - 1) });
      },

      moveFocusDown: (maxIndex: number) => {
        const { focusedTaskIndex } = get();
        set({ focusedTaskIndex: Math.min(maxIndex, focusedTaskIndex + 1) });
      },

      reset: () => {
        const { sidebarCollapsed, contextOpen } = get();
        set({
          ...DEFAULTS,
          sidebarCollapsed, // Keep persisted value
          contextOpen, // Keep persisted value
          selectedTaskIds: [],
        });
      },

      toggleTaskSelection: (id: string) => {
        const { selectedTaskIds } = get();
        if (selectedTaskIds.includes(id)) {
          set({ selectedTaskIds: selectedTaskIds.filter(i => i !== id) });
        } else {
          set({ selectedTaskIds: [...selectedTaskIds, id] });
        }
      },

      addToSelection: (id: string) => {
        const { selectedTaskIds } = get();
        if (!selectedTaskIds.includes(id)) {
          set({ selectedTaskIds: [...selectedTaskIds, id] });
        }
      },

      selectRange: (ids: string[]) => {
        set({ selectedTaskIds: ids });
      },

      clearSelection: () => {
        set({ selectedTaskIds: [] });
      },

      // Inbox actions
      setCCActiveTab: (tab: CCActiveTab) => {
        set({ ccActiveTab: tab });
      },

      setInboxPendingCount: (count: number) => {
        set({ inboxPendingCount: count });
      },
    }),
    {
      name: 'command-centre-ui',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        contextOpen: state.contextOpen,
        ccActiveTab: state.ccActiveTab,
      }),
    }
  )
);
