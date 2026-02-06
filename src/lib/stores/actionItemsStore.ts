/**
 * Action Items Store
 * Tracks pending approvals, confirmations, and action items from copilot sequences
 * 
 * Story: POL-004
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ActionItemStatus = 'pending' | 'confirmed' | 'rejected' | 'expired';
export type ActionItemType = 'task' | 'email' | 'slack' | 'crm_update' | 'meeting' | 'other';

export interface ActionItem {
  id: string;
  type: ActionItemType;
  title: string;
  description?: string;
  status: ActionItemStatus;
  
  // Source information
  sequenceKey: string;
  sequenceExecutionId: string;
  stepIndex?: number;
  
  // Entity references
  contactId?: string;
  contactName?: string;
  dealId?: string;
  dealName?: string;
  meetingId?: string;
  
  // Preview data for confirmation
  previewData?: Record<string, unknown>;
  
  // Timestamps
  createdAt: string;
  expiresAt?: string;
  confirmedAt?: string;
  rejectedAt?: string;
}

interface ActionItemsState {
  items: ActionItem[];
  
  // Computed
  pendingCount: () => number;
  
  // Actions
  addItem: (item: Omit<ActionItem, 'id' | 'createdAt' | 'status'>) => string;
  confirmItem: (id: string) => void;
  rejectItem: (id: string) => void;
  removeItem: (id: string) => void;
  clearExpired: () => void;
  clearAll: () => void;
  
  // Queries
  getItemsBySequence: (sequenceKey: string) => ActionItem[];
  getItemsByType: (type: ActionItemType) => ActionItem[];
  getPendingItems: () => ActionItem[];
}

export const useActionItemsStore = create<ActionItemsState>()(
  persist(
    (set, get) => ({
      items: [],
      
      pendingCount: () => {
        return get().items.filter(item => item.status === 'pending').length;
      },
      
      addItem: (itemData) => {
        const id = `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newItem: ActionItem = {
          ...itemData,
          id,
          status: 'pending',
          createdAt: new Date().toISOString(),
        };
        
        set((state) => ({
          items: [newItem, ...state.items]
        }));
        
        return id;
      },
      
      confirmItem: (id) => {
        set((state) => ({
          items: state.items.map(item =>
            item.id === id
              ? { ...item, status: 'confirmed' as ActionItemStatus, confirmedAt: new Date().toISOString() }
              : item
          )
        }));
      },
      
      rejectItem: (id) => {
        set((state) => ({
          items: state.items.map(item =>
            item.id === id
              ? { ...item, status: 'rejected' as ActionItemStatus, rejectedAt: new Date().toISOString() }
              : item
          )
        }));
      },
      
      removeItem: (id) => {
        set((state) => ({
          items: state.items.filter(item => item.id !== id)
        }));
      },
      
      clearExpired: () => {
        const now = new Date().toISOString();
        set((state) => ({
          items: state.items.filter(item => 
            !item.expiresAt || item.expiresAt > now || item.status !== 'pending'
          )
        }));
      },
      
      clearAll: () => {
        set({ items: [] });
      },
      
      getItemsBySequence: (sequenceKey) => {
        return get().items.filter(item => item.sequenceKey === sequenceKey);
      },
      
      getItemsByType: (type) => {
        return get().items.filter(item => item.type === type);
      },
      
      getPendingItems: () => {
        return get().items.filter(item => item.status === 'pending');
      },
    }),
    {
      name: 'copilot-action-items',
      // Only persist pending items to avoid stale data
      partialize: (state) => ({
        items: state.items.filter(item => item.status === 'pending')
      }),
    }
  )
);

// Helper hook for action item badge count
export function useActionItemCount(): number {
  return useActionItemsStore((state) => state.pendingCount());
}

// Helper to create action item from sequence step
export function createActionItemFromStep(
  sequenceKey: string,
  executionId: string,
  step: {
    type: ActionItemType;
    title: string;
    description?: string;
    contactId?: string;
    contactName?: string;
    dealId?: string;
    dealName?: string;
    previewData?: Record<string, unknown>;
  }
): Omit<ActionItem, 'id' | 'createdAt' | 'status'> {
  return {
    type: step.type,
    title: step.title,
    description: step.description,
    sequenceKey,
    sequenceExecutionId: executionId,
    contactId: step.contactId,
    contactName: step.contactName,
    dealId: step.dealId,
    dealName: step.dealName,
    previewData: step.previewData,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hour expiry
  };
}
