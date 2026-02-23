import React, { createContext, useContext, useState, useCallback, ReactNode, useMemo, useEffect } from 'react';
import { useDeals } from '@/lib/hooks/useDeals';
import { useDealStages } from '@/lib/hooks/useDealStages';
import { useUser } from '@/lib/hooks/useUser';
import { exportPipelineToCSV, getPipelineExportSummary, CSVExportOptions } from '@/lib/utils/csvExport';
import { format } from 'date-fns';
import { DatePreset, DateRange } from '@/components/ui/DateRangeFilter';
import logger from '@/lib/utils/logger';

interface FilterOptions {
  minValue: number | null;
  maxValue: number | null;
  probability: number | null;
  tags: string[];
  dateRange: {
    field: 'created_at' | 'expected_close_date' | 'stage_changed_at' | null;
    from: string | null;
    to: string | null;
  };
  stages: string[];
  priorities: string[];
  dealSizes: string[];
  leadSources: {
    types: string[];
    channels: string[];
  };
  daysInStage: {
    min: number | null;
    max: number | null;
  };
  timeStatus: Array<'normal' | 'warning' | 'danger'>;
  quickFilter: 'all' | 'my_deals' | 'hot_deals' | 'closing_soon' | 'stale_deals' | 'recent' | null;
}

interface StageMetric {
  stageId: string;
  stageName: string;
  count: number;
  value: number;
  weightedValue: number;
}

interface PipelineContextType {
  deals: any[];
  stages: any[];
  isLoading: boolean;
  error: any;
  createDeal: (dealData: any) => Promise<any>;
  updateDeal: (id: string, updates: any) => Promise<boolean>;
  deleteDeal: (id: string) => Promise<boolean>;
  moveDealToStage: (dealId: string, newStageId: string) => Promise<boolean>;
  forceUpdateDealStage: (dealId: string, stageId: string) => Promise<boolean>;
  refreshDeals: () => Promise<void>;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filterOptions: FilterOptions;
  setFilterOptions: (options: FilterOptions) => void;
  dealsByStage: Record<string, any[]>;
  pipelineValue: number;
  weightedPipelineValue: number;
  activePipelineValue: number;
  stageMetrics: StageMetric[];
  selectedOwnerId: string | undefined;
  setSelectedOwnerId: (ownerId: string | undefined) => void;
  // Add date filter state
  dateFilterPreset: DatePreset;
  setDateFilterPreset: (preset: DatePreset) => void;
  customDateRange: DateRange | null;
  setCustomDateRange: (range: DateRange | null) => void;
  exportPipeline: (options?: CSVExportOptions) => Promise<void>;
  getExportSummary: () => any;
}

export const PipelineContext = createContext<PipelineContextType | undefined>(undefined);

interface PipelineProviderProps {
  children: ReactNode;
}

export function PipelineProvider({ children }: PipelineProviderProps) {
  // Get current user to use as default owner
  const { userData } = useUser();
  
  // Initialize with undefined, will be set once userData loads
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | undefined>(undefined);
  const [hasInitialized, setHasInitialized] = useState(false);
  
  // Add a refresh timestamp to force re-calculations when needed
  const [lastRefresh, setLastRefresh] = useState<number>(Date.now());
  
  // Set selectedOwnerId to current user when userData loads
  useEffect(() => {
    if (userData?.id && !hasInitialized) {
      setSelectedOwnerId(userData.id);
      setHasInitialized(true);
    }
  }, [userData?.id, hasInitialized]);
  
  // Get the stages first
  const {
    stages: allStages,
    isLoading: isLoadingStages,
    error: stagesError
  } = useDealStages();
  
  // Filter out "Signed & Paid" stage from the pipeline display
  const stages = useMemo(() => {
    return allStages.filter(stage => 
      stage.name !== 'Signed & Paid' && 
      stage.name !== 'Signed and Paid'
    );
  }, [allStages]);
  
  // Get deals with owner filtering
  const { 
    deals, 
    isLoading: isLoadingDeals, 
    error: dealsError,
    createDeal,
    updateDeal,
    deleteDeal,
    moveDealToStage,
    forceUpdateDealStage,
    refreshDeals
  } = useDeals(selectedOwnerId);
  
  // Wrap refreshDeals to also update our refresh timestamp
  const wrappedRefreshDeals = useCallback(async () => {
    await refreshDeals();
    setLastRefresh(Date.now());
    logger.log('🔄 Pipeline data refreshed, forcing re-calculations...');
  }, [refreshDeals]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    minValue: null,
    maxValue: null,
    probability: null,
    tags: [],
    dateRange: {
      field: null,
      from: null,
      to: null
    },
    stages: [],
    priorities: [],
    dealSizes: [],
    leadSources: {
      types: [],
      channels: []
    },
    daysInStage: {
      min: null,
      max: null
    },
    timeStatus: [],
    quickFilter: null
  });

  // Add date filter state
  const [dateFilterPreset, setDateFilterPreset] = useState<DatePreset>('month');
  const [customDateRange, setCustomDateRange] = useState<DateRange | null>(null);

  // Helper functions using useCallback to stabilize references
  const matchesSearch = useCallback((deal: any, term: string) => {
    const searchLower = term.toLowerCase();
    return (
      deal.name?.toLowerCase().includes(searchLower) ||
      deal.company?.toLowerCase().includes(searchLower) ||
      deal.contact_name?.toLowerCase().includes(searchLower) ||
      deal.value?.toString().includes(searchLower)
    );
  }, []);

  const applyQuickFilter = useCallback((deals: any[], quickFilter: string, currentUserId?: string) => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    switch (quickFilter) {
      case 'my_deals':
        return deals.filter(deal => deal.owner_id === currentUserId);
      case 'hot_deals':
        // More realistic criteria: probability >= 50% OR value >= £5,000
        return deals.filter(deal => {
          const probability = deal.probability || 0;
          const value = deal.value || 0;
          return probability >= 50 || value >= 5000;
        });
      case 'closing_soon':
        // Extended to 30 days for better results
        return deals.filter(deal => {
          if (!deal.expected_close_date && !deal.close_date) return false;
          const closeDate = new Date(deal.expected_close_date || deal.close_date);
          return closeDate <= thirtyDaysFromNow && closeDate >= now;
        });
      case 'stale_deals':
        return deals.filter(deal => {
          const stageChangedAt = new Date(deal.stage_changed_at || deal.created_at);
          return stageChangedAt <= thirtyDaysAgo;
        });
      case 'recent':
        return deals.filter(deal => {
          const createdAt = new Date(deal.created_at);
          return createdAt >= thirtyDaysAgo;
        });
      default:
        return deals;
    }
  }, []);

  const matchesDateRange = useCallback((deal: any, dateRange: FilterOptions['dateRange']) => {
    if (!dateRange.field) return true;
    
    const dateValue = deal[dateRange.field];
    if (!dateValue) return false;
    
    const dealDate = new Date(dateValue);
    const fromDate = dateRange.from ? new Date(dateRange.from) : null;
    const toDate = dateRange.to ? new Date(dateRange.to) : null;
    
    if (fromDate && dealDate < fromDate) return false;
    if (toDate && dealDate > toDate) return false;
    
    return true;
  }, []);

  const matchesLeadSource = useCallback((deal: any, leadSources: FilterOptions['leadSources']) => {
    const dealType = deal.lead_source_type || deal.leadSource?.type || 'unknown';
    const dealChannel = deal.lead_source_channel || deal.leadSource?.channel || 'unknown';
    
    let typeMatch = leadSources.types.length === 0 || leadSources.types.includes(dealType);
    let channelMatch = leadSources.channels.length === 0 || leadSources.channels.includes(dealChannel);
    
    return typeMatch && channelMatch;
  }, []);

  const getTimeStatus = useCallback((deal: any): 'normal' | 'warning' | 'danger' => {
    const daysInStage = deal.daysInStage || 0;
    
    if (daysInStage > 30) return 'danger';
    if (daysInStage > 14) return 'warning';
    return 'normal';
  }, []);
  
  // Group deals by stage with filtering applied (using filtered deals)
  const dealsByStage = useMemo(() => {
    if (!stages) return {};

    // Get the effective date range for filtering
    const effectiveDateRange = customDateRange;

    // Apply all filters to the deals
    let filteredDeals = deals.filter(deal => {
      try {
        // Date filtering - filter by when deals were created
        if (effectiveDateRange) {
          const dealDate = new Date(deal.created_at);
          if (dealDate < effectiveDateRange.start || dealDate > effectiveDateRange.end) {
            return false;
          }
        }

        // Search term filtering
        if (searchTerm && !matchesSearch(deal, searchTerm)) {
          return false;
        }

        // Apply other filters
        const matchesValue = (!filterOptions.minValue || deal.value >= filterOptions.minValue) &&
                            (!filterOptions.maxValue || deal.value <= filterOptions.maxValue);
        
        const matchesProbability = !filterOptions.probability || deal.probability >= filterOptions.probability;
        
        const matchesStages = filterOptions.stages.length === 0 || filterOptions.stages.includes(deal.stage_id);
        
        const matchesPriorities = filterOptions.priorities.length === 0 || 
                                  ((deal as any).priority && filterOptions.priorities.includes((deal as any).priority));
        
        const matchesDealSizes = filterOptions.dealSizes.length === 0 || 
                                 ((deal as any).deal_size && filterOptions.dealSizes.includes((deal as any).deal_size));
        
        const matchesLeadSources = (filterOptions.leadSources.types.length === 0 || 
                                    ((deal as any).lead_source_type && filterOptions.leadSources.types.includes((deal as any).lead_source_type))) &&
                                   (filterOptions.leadSources.channels.length === 0 || 
                                    ((deal as any).lead_source_channel && filterOptions.leadSources.channels.includes((deal as any).lead_source_channel)));
        
        const matchesDaysInStage = (!filterOptions.daysInStage.min || deal.daysInStage >= filterOptions.daysInStage.min) &&
                                   (!filterOptions.daysInStage.max || deal.daysInStage <= filterOptions.daysInStage.max);
        
        const matchesTimeStatus = filterOptions.timeStatus.length === 0 || 
                                  (deal.timeStatus && filterOptions.timeStatus.includes(deal.timeStatus));
        
        const matchesFilterDateRange = matchesDateRange(deal, filterOptions.dateRange);
        
        return matchesValue && matchesProbability && matchesStages && matchesPriorities && 
               matchesDealSizes && matchesLeadSources && matchesDaysInStage && 
               matchesTimeStatus && matchesFilterDateRange;
      } catch (error) {
        logger.error('Error filtering deal:', deal, error);
        return false;
      }
    });

    // Apply quick filter
    if (filterOptions.quickFilter && filterOptions.quickFilter !== 'all') {
      filteredDeals = applyQuickFilter(filteredDeals, filterOptions.quickFilter, userData?.id);
    }

    // Group by stage
    const grouped: Record<string, any[]> = {};
    stages.forEach(stage => {
      grouped[stage.id] = [];
    });

    filteredDeals.forEach(deal => {
      if (grouped[deal.stage_id]) {
        grouped[deal.stage_id].push(deal);
      }
    });

    return grouped;
  }, [deals, stages, searchTerm, filterOptions, userData?.id, matchesSearch, applyQuickFilter, matchesDateRange, lastRefresh, dateFilterPreset, customDateRange]);
  
  // Calculate pipeline value (total of filtered deals)
  const pipelineValue = useMemo(() => {
    let totalValue = 0;
    Object.values(dealsByStage).forEach(stageDeals => {
      stageDeals.forEach(deal => {
        totalValue += Number(deal.value || 0);
      });
    });
    return totalValue;
  }, [dealsByStage, lastRefresh]);
  
  // Calculate weighted pipeline value (based on probability) - use filtered deals
  const weightedPipelineValue = useMemo(() => {
    if (!stages) return 0;
    
    // Sum up weighted values from all filtered deals by stage
    let totalWeighted = 0;
    Object.entries(dealsByStage).forEach(([stageId, stageDeals]) => {
      const stage = stages.find(s => s.id === stageId);
      if (!stage) return;
      
      // Calculate total value for this stage
      const stageValue = stageDeals.reduce((sum, deal) => sum + Number(deal.value || 0), 0);
      // Use stage's default probability for consistency
      totalWeighted += stageValue * (stage.default_probability / 100);
    });
    
    return totalWeighted;
  }, [dealsByStage, stages, lastRefresh]);

  // Calculate active pipeline value (only SQL, Opportunity, and Verbal) - only weighted amount
  const activePipelineValue = useMemo(() => {
    if (!stages) return 0;
    
    // Only include truly active stages: SQL, Opportunity, Verbal
    const activeStageNames = ['sql', 'opportunity', 'verbal'];
    
    const activeStages = stages.filter(stage => {
      const stageName = stage?.name?.toLowerCase();
      return stageName && activeStageNames.includes(stageName);
    });
    
    const activeStageIds = activeStages.map(stage => stage.id);
    
    // Sum up weighted values from active deals only (SQL, Opportunity, Verbal)
    let totalWeighted = 0;
    Object.entries(dealsByStage).forEach(([stageId, stageDeals]) => {
      // Only include active stages
      if (!activeStageIds.includes(stageId)) return;
      
      const stage = stages.find(s => s.id === stageId);
      if (!stage) return;
      
      // Calculate total value for this stage
      const stageValue = stageDeals.reduce((sum, deal) => sum + Number(deal.value || 0), 0);
      // Use stage's default probability for consistency
      totalWeighted += stageValue * (stage.default_probability / 100);
    });
    
    return totalWeighted;
  }, [dealsByStage, stages, lastRefresh]);
  
  // Calculate total count and value by stage (using filtered deals)
  const stageMetrics = useMemo(() => {
    if (!stages) return [];
    
    const metrics = stages.map(stage => {
      const stageDeals = dealsByStage[stage.id] || [];
      const count = stageDeals.length;
      const value = stageDeals.reduce((sum, deal) => sum + Number(deal.value || 0), 0);
      // Use stage's default probability for consistency with column headers
      const weightedValue = value * (stage.default_probability / 100);
      
      return {
        stageId: stage.id,
        stageName: stage.name,
        count,
        value,
        weightedValue
      };
    });
    
    return metrics;
  }, [dealsByStage, stages, lastRefresh]);
  
  // Export functionality
  const exportPipeline = useCallback(async (options: CSVExportOptions = {}) => {
    try {
      // Get all filtered deals from dealsByStage
      const filteredDeals = Object.values(dealsByStage).flat();
      
      if (filteredDeals.length === 0) {
        throw new Error('No deals to export with current filters');
      }
      
      // Generate filename with current filters applied
      const timestamp = format(new Date(), 'yyyy-MM-dd-HHmm');
      const ownerSuffix = selectedOwnerId ? '-filtered' : '-all-owners';
      const defaultFilename = `pipeline-export-${timestamp}${ownerSuffix}.csv`;
      
      const exportOptions = {
        filename: defaultFilename,
        ...options
      };
      
      await exportPipelineToCSV(filteredDeals, stages, exportOptions);
      
      // Optional: Show success message
      logger.log(`Successfully exported ${filteredDeals.length} deals to CSV`);
    } catch (error) {
      logger.error('Failed to export pipeline:', error);
      throw error;
    }
  }, [dealsByStage, stages, selectedOwnerId, lastRefresh]);
  
  const getExportSummary = useCallback(() => {
    const filteredDeals = Object.values(dealsByStage).flat();
    return getPipelineExportSummary(filteredDeals, stages);
  }, [dealsByStage, stages, lastRefresh]);
  
  // Memoize the context value to prevent unnecessary re-renders
  const value = useMemo(() => ({
    deals,
    stages,
    isLoading: isLoadingDeals || isLoadingStages,
    error: dealsError || stagesError,
    createDeal,
    updateDeal,
    deleteDeal,
    moveDealToStage,
    forceUpdateDealStage,
    refreshDeals: wrappedRefreshDeals,
    searchTerm,
    setSearchTerm,
    filterOptions,
    setFilterOptions,
    dealsByStage,
    pipelineValue,
    weightedPipelineValue,
    activePipelineValue,
    stageMetrics,
    selectedOwnerId,
    setSelectedOwnerId,
    // Add date filter state
    dateFilterPreset,
    setDateFilterPreset,
    customDateRange,
    setCustomDateRange,
    exportPipeline,
    getExportSummary
  }), [
    deals, 
    stages, 
    isLoadingDeals, 
    isLoadingStages, 
    dealsError, 
    stagesError, 
    createDeal, 
    updateDeal, 
    deleteDeal, 
    moveDealToStage, 
    forceUpdateDealStage,
    wrappedRefreshDeals,
    searchTerm, 
    setSearchTerm,
    filterOptions, 
    setFilterOptions,
    dealsByStage, 
    pipelineValue, 
    weightedPipelineValue, 
    activePipelineValue,
    stageMetrics,
    selectedOwnerId,
    setSelectedOwnerId,
    // Add date filter state
    dateFilterPreset,
    setDateFilterPreset,
    customDateRange,
    setCustomDateRange,
    exportPipeline,
    getExportSummary,
    lastRefresh // Add the refresh timestamp to force re-calculation
  ]);
  
  return (
    <PipelineContext.Provider value={value}>
      {children}
    </PipelineContext.Provider>
  );
}

export function usePipeline() {
  const context = useContext(PipelineContext);
  if (context === undefined) {
    throw new Error('usePipeline must be used within a PipelineProvider');
  }
  return context;
} 