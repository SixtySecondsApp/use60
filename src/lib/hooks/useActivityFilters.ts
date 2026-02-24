import { create } from 'zustand';
import { startOfMonth, endOfMonth } from 'date-fns';

export type ActivityType = 'sale' | 'outbound' | 'meeting' | 'proposal';
export type ActivityStatus = 'completed' | 'pending' | 'cancelled' | 'no_show';
export type ActivityPriority = 'high' | 'medium' | 'low';
export type SaleType = 'one-off' | 'subscription' | 'lifetime';
export type MeetingType = 'Discovery' | 'Demo' | 'Follow-up' | 'Proposal' | 'Client Call' | 'Other';
export type OutboundType = 'Call' | 'Client Call' | 'Email' | 'LinkedIn' | 'Other';

interface ActivityFilters {
  // Basic filters
  type?: ActivityType;
  salesRep?: string;
  status?: ActivityStatus;
  priority?: ActivityPriority;
  searchQuery: string;
  
  // Date filtering
  dateRange: {
    start: Date;
    end: Date;
  };
  
  // Sub-type filters
  saleType?: SaleType;
  meetingType?: MeetingType;
  outboundType?: OutboundType;
  
  // Amount filtering
  minAmount?: number;
  maxAmount?: number;
  
  // Client filtering
  clientName?: string;
}

interface ActivityFiltersStore {
  filters: ActivityFilters;
  /** True when dateRange was explicitly set (e.g. heatmap click), false on default/reset */
  dateRangeExplicit: boolean;
  setFilters: (filters: Partial<ActivityFilters>) => void;
  resetFilters: () => void;
  clearSubTypeFilters: () => void;
}

const defaultFilters: ActivityFilters = {
  type: undefined,
  dateRange: {
    start: startOfMonth(new Date()),
    end: new Date(),
  },
  searchQuery: '',
  salesRep: undefined,
  status: undefined,
  priority: undefined,
  saleType: undefined,
  meetingType: undefined,
  outboundType: undefined,
  minAmount: undefined,
  maxAmount: undefined,
  clientName: undefined,
};

export const useActivityFilters = create<ActivityFiltersStore>((set) => ({
  filters: defaultFilters,
  dateRangeExplicit: false,
  setFilters: (newFilters) =>
    set((state) => ({
      filters: {
        // Keep existing filters
        ...state.filters,
        // Override with new filters
        ...newFilters
      },
      // Mark dateRange as explicitly set when caller provides one
      dateRangeExplicit: 'dateRange' in newFilters ? true : state.dateRangeExplicit,
    })),
  resetFilters: () =>
    set({
      filters: { ...defaultFilters },
      dateRangeExplicit: false,
    }),
  clearSubTypeFilters: () =>
    set((state) => ({
      filters: {
        ...state.filters,
        saleType: undefined,
        meetingType: undefined,
        outboundType: undefined,
      }
    })),
}));