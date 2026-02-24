/**
 * Action Items Store
 *
 * Zustand store for managing AI-generated action items that need user approval.
 * Persists to localStorage for session continuity.
 *
 * Action Item Types:
 * - follow-up: Email drafts ready to send
 * - meeting-prep: Briefings before calls
 * - crm-update: Suggested HubSpot updates
 * - reminder: Nudges about stale contacts/deals
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================================================
// Types
// ============================================================================

export type ActionItemType = 'follow-up' | 'meeting-prep' | 'crm-update' | 'reminder';

export type ActionItemStatus = 'pending' | 'approved' | 'dismissed' | 'edited';

export type ActionItemAction = 'preview' | 'edit' | 'approve' | 'dismiss';

/**
 * Context linking action item to CRM entities
 */
export interface ActionItemContext {
  hubspotContactId?: string;
  hubspotContactName?: string;
  hubspotDealId?: string;
  hubspotDealName?: string;
  fathomCallIds?: string[];
  calendarEventId?: string;
}

/**
 * Content payload varies by action item type
 */
export interface FollowUpContent {
  to: string;
  subject: string;
  body: string;
  replyToMessageId?: string;
}

export interface MeetingPrepContent {
  meetingTitle: string;
  meetingTime: string;
  attendees: string[];
  talkingPoints: string[];
  risks?: string[];
  opportunities?: string[];
  recentHistory?: string;
}

export interface CrmUpdateContent {
  entityType: 'contact' | 'deal' | 'company';
  entityId: string;
  entityName: string;
  field: string;
  currentValue?: string;
  suggestedValue: string;
  reason: string;
}

export interface ReminderContent {
  message: string;
  entityType?: 'contact' | 'deal';
  entityId?: string;
  entityName?: string;
  daysSinceActivity?: number;
}

export type ActionItemContent =
  | FollowUpContent
  | MeetingPrepContent
  | CrmUpdateContent
  | ReminderContent;

/**
 * Core ActionItem interface matching the brief specification
 */
export interface ActionItem {
  id: string;
  type: ActionItemType;
  status: ActionItemStatus;
  title: string;
  preview: string;
  content: ActionItemContent;
  context: ActionItemContext;
  createdAt: string; // ISO string for persistence
  actions: ActionItemAction[];
}

// ============================================================================
// Store
// ============================================================================

interface ActionItemStore {
  // State
  items: ActionItem[];

  // Actions
  addItem: (item: Omit<ActionItem, 'id' | 'createdAt' | 'status'>) => string;
  updateItem: (id: string, updates: Partial<ActionItem>) => void;
  removeItem: (id: string) => void;
  approveItem: (id: string) => void;
  dismissItem: (id: string, reason?: string) => void;
  editItem: (id: string, content: ActionItemContent) => void;

  // Selectors
  getPendingItems: () => ActionItem[];
  getItemById: (id: string) => ActionItem | undefined;
  getItemsByType: (type: ActionItemType) => ActionItem[];

  // Utilities
  clearAll: () => void;
  clearCompleted: () => void;
}

export const useActionItemStore = create<ActionItemStore>()(
  persist(
    (set, get) => ({
      // Initial state
      items: [],

      // Add a new action item
      addItem: (itemData) => {
        const id = `ai_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const newItem: ActionItem = {
          ...itemData,
          id,
          status: 'pending',
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          items: [newItem, ...state.items], // Newest first
        }));

        return id;
      },

      // Update an existing item
      updateItem: (id, updates) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, ...updates } : item
          ),
        }));
      },

      // Remove an item completely
      removeItem: (id) => {
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        }));
      },

      // Approve an action item
      approveItem: (id) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, status: 'approved' as const } : item
          ),
        }));
      },

      // Dismiss an action item with optional reason
      dismissItem: (id, _reason) => {
        // In future, we could store dismiss reasons for feedback
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, status: 'dismissed' as const } : item
          ),
        }));
      },

      // Edit item content and mark as edited
      editItem: (id, content) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? { ...item, content, status: 'edited' as const }
              : item
          ),
        }));
      },

      // Get only pending items
      getPendingItems: () => {
        return get().items.filter((item) => item.status === 'pending');
      },

      // Get item by ID
      getItemById: (id) => {
        return get().items.find((item) => item.id === id);
      },

      // Get items by type
      getItemsByType: (type) => {
        return get().items.filter((item) => item.type === type);
      },

      // Clear all items
      clearAll: () => {
        set({ items: [] });
      },

      // Clear approved/dismissed items
      clearCompleted: () => {
        set((state) => ({
          items: state.items.filter(
            (item) => item.status === 'pending' || item.status === 'edited'
          ),
        }));
      },
    }),
    {
      name: 'copilot-action-items',
      version: 1,
    }
  )
);

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Get a human-readable time since creation
 */
export function getRelativeTime(createdAt: string): string {
  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now.getTime() - created.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * Get icon name for action item type
 */
export function getActionItemIcon(type: ActionItemType): string {
  switch (type) {
    case 'follow-up':
      return 'mail';
    case 'meeting-prep':
      return 'calendar';
    case 'crm-update':
      return 'database';
    case 'reminder':
      return 'bell';
    default:
      return 'zap';
  }
}

/**
 * Get label for action item type
 */
export function getActionItemLabel(type: ActionItemType): string {
  switch (type) {
    case 'follow-up':
      return 'Follow-up';
    case 'meeting-prep':
      return 'Meeting Prep';
    case 'crm-update':
      return 'CRM Update';
    case 'reminder':
      return 'Reminder';
    default:
      return 'Action';
  }
}
