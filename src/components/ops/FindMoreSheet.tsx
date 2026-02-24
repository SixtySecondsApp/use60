import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Search,
  Loader2,
  Plus,
  Building2,
  User,
  Globe,
  MapPin,
  Briefcase,
  Sparkles,
  UserPlus,
  MessageSquare,
  HeartHandshake,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgId } from '@/lib/contexts/OrgContext';
import { useProspectingSearch, type ProspectingProvider, type ProspectingSearchResult } from '@/lib/hooks/useProspectingSearch';
import type { ICPProfile, ICPCriteria } from '@/lib/types/prospecting';
import { icpProfileService } from '@/lib/services/icpProfileService';

interface FindMoreSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icpProfile: ICPProfile | null;
  tableId: string;
  onRowsAdded: () => void;
}

type ProviderOption = 'apollo' | 'ai_ark' | 'crm' | 'all';

const PROVIDER_OPTIONS: { value: ProviderOption; label: string; disabled?: boolean }[] = [
  { value: 'apollo', label: 'Apollo' },
  { value: 'ai_ark', label: 'AI Ark' },
  { value: 'crm', label: 'CRM' },
  { value: 'all', label: 'All Sources' },
];

// Criteria summary component
function CriteriaSummary({ criteria }: { criteria: ICPCriteria }) {
  const parts: { icon: React.ElementType; text: string }[] = [];

  if (criteria.industries?.length) {
    parts.push({
      icon: Building2,
      text: `${criteria.industries.length} ${criteria.industries.length === 1 ? 'industry' : 'industries'}`,
    });
  }
  if (criteria.seniority_levels?.length) {
    parts.push({
      icon: User,
      text: criteria.seniority_levels.join(', '),
    });
  }
  if (criteria.title_keywords?.length) {
    parts.push({
      icon: Briefcase,
      text: `${criteria.title_keywords.length} title ${criteria.title_keywords.length === 1 ? 'keyword' : 'keywords'}`,
    });
  }
  if (criteria.location_countries?.length) {
    parts.push({
      icon: MapPin,
      text: criteria.location_countries.join(', '),
    });
  }
  if (criteria.technology_keywords?.length) {
    parts.push({
      icon: Globe,
      text: `${criteria.technology_keywords.length} tech ${criteria.technology_keywords.length === 1 ? 'keyword' : 'keywords'}`,
    });
  }

  if (parts.length === 0) {
    return (
      <p className="text-sm text-[#64748B] dark:text-gray-400">
        No criteria defined
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {parts.map((part, i) => {
        const Icon = part.icon;
        return (
          <div key={i} className="flex items-center gap-2 text-sm">
            <Icon className="h-4 w-4 text-[#64748B] dark:text-gray-400 shrink-0" />
            <span className="text-[#1E293B] dark:text-gray-100">{part.text}</span>
          </div>
        );
      })}
    </div>
  );
}

// Classification helper functions
type LeadClassification = 'net_new' | 'uncontacted' | 'contacted_no_deal' | 'existing_with_deal';

function getClassificationLabel(classification?: LeadClassification): string {
  switch (classification) {
    case 'net_new':
      return 'Net New';
    case 'uncontacted':
      return 'Uncontacted';
    case 'contacted_no_deal':
      return 'Contacted';
    case 'existing_with_deal':
      return 'Has Deal';
    default:
      return 'Unknown';
  }
}

function getClassificationVariant(classification?: LeadClassification): 'default' | 'secondary' | 'outline' {
  switch (classification) {
    case 'net_new':
      return 'default'; // Blue for brand new leads
    case 'uncontacted':
      return 'secondary'; // Gray for uncontacted
    case 'contacted_no_deal':
      return 'outline'; // Outline for contacted
    case 'existing_with_deal':
      return 'outline'; // Outline for has deal
    default:
      return 'secondary';
  }
}

function getClassificationIcon(classification?: LeadClassification) {
  switch (classification) {
    case 'net_new':
      return Sparkles;
    case 'uncontacted':
      return UserPlus;
    case 'contacted_no_deal':
      return MessageSquare;
    case 'existing_with_deal':
      return HeartHandshake;
    default:
      return User;
  }
}

export function FindMoreSheet({
  open,
  onOpenChange,
  icpProfile,
  tableId,
  onRowsAdded,
}: FindMoreSheetProps) {
  const orgId = useOrgId();
  const [selectedProvider, setSelectedProvider] = useState<ProviderOption>('apollo');
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isCrmSearching, setIsCrmSearching] = useState(false);
  const [crmResults, setCrmResults] = useState<ProspectingSearchResult | null>(null);
  const [classificationFilter, setClassificationFilter] = useState<'all' | LeadClassification>('all');

  const {
    search,
    isSearching: isExternalSearching,
    results: externalSearchResult,
    reset: resetExternalSearch,
  } = useProspectingSearch();

  // Unified search state
  const isSearching = isExternalSearching || isCrmSearching;
  const searchResult = selectedProvider === 'crm' ? crmResults : externalSearchResult;

  // Filtered results based on classification
  const filteredResults = useMemo(() => {
    if (!searchResult) return [];
    if (classificationFilter === 'all') return searchResult.results;
    return searchResult.results.filter((r: any) => r.classification === classificationFilter);
  }, [searchResult, classificationFilter]);

  // Classification counts
  const classificationCounts = useMemo(() => {
    if (!searchResult) return { net_new: 0, uncontacted: 0, contacted_no_deal: 0, existing_with_deal: 0, total: 0 };
    const counts = searchResult.results.reduce((acc: any, r: any) => {
      if (r.classification) {
        acc[r.classification] = (acc[r.classification] || 0) + 1;
      }
      acc.total++;
      return acc;
    }, { net_new: 0, uncontacted: 0, contacted_no_deal: 0, existing_with_deal: 0, total: 0 });
    return counts;
  }, [searchResult]);

  // Reset state when sheet closes
  useEffect(() => {
    if (!open) {
      resetExternalSearch();
      setCrmResults(null);
      setSelectedRows([]);
      setSelectedProvider('apollo');
    }
  }, [open, resetExternalSearch]);

  const searchCrm = useCallback(async () => {
    if (!icpProfile || !orgId) return;
    setIsCrmSearching(true);
    setCrmResults(null);
    try {
      const { data, error } = await supabase.functions.invoke('search-crm-with-icp', {
        body: {
          org_id: orgId,
          criteria: icpProfile.criteria,
          profile_type: icpProfile.profile_type,
          parent_icp_id: icpProfile.parent_icp_id || undefined,
          icp_profile_id: icpProfile.id,
          limit: 50,
        },
      });
      if (error) throw new Error(error.message || 'CRM search failed');
      if (data?.error) throw new Error(data.error);

      // Normalize to ProspectingSearchResult shape
      const results = data.results || [];
      setCrmResults({
        results,
        total_results: results.length,
        credits_consumed: 0,
        page: 1,
        per_page: 50,
        has_more: false,
        provider: 'crm' as any,
        duration_ms: data.duration_ms || 0,
        icp_profile_id: icpProfile.id,
        search_chained: data.search_chained,
        parent_icp_id: data.parent_icp_id,
      });
    } catch (err: any) {
      toast.error(err.message || 'CRM search failed');
      console.error('[FindMoreSheet] CRM search error:', err);
    } finally {
      setIsCrmSearching(false);
    }
  }, [icpProfile, orgId]);

  const handleSearch = () => {
    if (!icpProfile) {
      toast.error('No ICP profile linked to this table');
      return;
    }

    if (selectedProvider === 'crm') {
      searchCrm();
      return;
    }

    const provider: ProspectingProvider =
      selectedProvider === 'all' ? 'apollo' : selectedProvider;

    search({
      icp_profile_id: icpProfile.id,
      parent_icp_id: icpProfile.parent_icp_id || undefined,
      profile_type: icpProfile.profile_type,
      provider,
      search_params: {},
      page: 1,
      per_page: 25,
    });
  };

  const handleAddRows = async () => {
    if (selectedRows.length === 0) {
      toast.error('No rows selected');
      return;
    }

    if (!searchResult) {
      toast.error('No search results available');
      return;
    }

    setIsAdding(true);
    try {
      // Get selected lead objects
      const selectedLeads = selectedRows.map((idx) => searchResult.results[idx]);

      // Append to ICP's linked table with deduplication
      const result = await icpProfileService.appendLeadsToTable({
        tableId,
        icpProfileId: icpProfile.id,
        leads: selectedLeads,
      });

      // Show results
      if (result.added_count === 0 && result.skipped_count > 0) {
        toast.info(`All ${result.skipped_count} ${result.skipped_count === 1 ? 'lead was' : 'leads were'} already in the table (duplicates skipped)`);
      } else if (result.skipped_count > 0) {
        toast.success(
          `Added ${result.added_count} new ${result.added_count === 1 ? 'lead' : 'leads'}, skipped ${result.skipped_count} ${result.skipped_count === 1 ? 'duplicate' : 'duplicates'}`
        );
      } else {
        toast.success(`Added ${result.added_count} ${result.added_count === 1 ? 'lead' : 'leads'}`);
      }

      if (result.errors && result.errors.length > 0) {
        console.warn('[FindMoreSheet] Non-fatal errors:', result.errors);
      }

      onRowsAdded();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add rows');
      console.error('[FindMoreSheet] Add rows error:', err);
    } finally {
      setIsAdding(false);
    }
  };

  const toggleRow = (index: number) => {
    setSelectedRows((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const toggleAll = () => {
    if (!searchResult) return;
    if (selectedRows.length === searchResult.results.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(searchResult.results.map((_, i) => i));
    }
  };

  // Batch action: Add all leads of a specific classification
  const handleBatchAddByClassification = useCallback(async (classification: LeadClassification) => {
    if (!searchResult || !icpProfile) return;

    const indices = searchResult.results
      .map((r: any, i: number) => (r.classification === classification ? i : -1))
      .filter((i: number) => i >= 0);

    if (indices.length === 0) {
      toast.info(`No ${getClassificationLabel(classification).toLowerCase()} leads found`);
      return;
    }

    setIsAdding(true);
    try {
      const leadsToAdd = indices.map((idx: number) => searchResult.results[idx]);
      const result = await icpProfileService.appendLeadsToTable({
        tableId,
        icpProfileId: icpProfile.id,
        leads: leadsToAdd,
      });

      if (result.added_count === 0 && result.skipped_count > 0) {
        toast.info(`All ${result.skipped_count} ${getClassificationLabel(classification).toLowerCase()} ${result.skipped_count === 1 ? 'lead was' : 'leads were'} already in the table`);
      } else if (result.skipped_count > 0) {
        toast.success(
          `Added ${result.added_count} ${getClassificationLabel(classification).toLowerCase()} ${result.added_count === 1 ? 'lead' : 'leads'}, skipped ${result.skipped_count} ${result.skipped_count === 1 ? 'duplicate' : 'duplicates'}`
        );
      } else {
        toast.success(`Added ${result.added_count} ${getClassificationLabel(classification).toLowerCase()} ${result.added_count === 1 ? 'lead' : 'leads'}`);
      }

      onRowsAdded();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add leads');
      console.error('[FindMoreSheet] Batch add error:', err);
    } finally {
      setIsAdding(false);
    }
  }, [searchResult, icpProfile, tableId, onRowsAdded, onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="!top-16 !h-[calc(100vh-4rem)] w-[600px] sm:max-w-[600px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Find More Leads
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6 py-4">
          {/* ICP Profile Info */}
          {icpProfile && (
            <div className="rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#1E293B] dark:text-gray-100">
                  {icpProfile.name}
                </h3>
                <Badge variant="outline" className="text-[10px]">
                  {(icpProfile.profile_type || 'icp').toUpperCase()}
                </Badge>
              </div>
              {icpProfile.description && (
                <p className="mb-3 text-sm text-[#64748B] dark:text-gray-400">
                  {icpProfile.description}
                </p>
              )}
              <CriteriaSummary criteria={icpProfile.criteria} />
            </div>
          )}

          {/* Provider Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-[#1E293B] dark:text-gray-100">
              Search Provider
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PROVIDER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => setSelectedProvider(opt.value)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    selectedProvider === opt.value
                      ? 'border-brand-blue bg-brand-blue/5 dark:bg-brand-blue/10 text-brand-blue dark:text-blue-400'
                      : 'border-[#E2E8F0] dark:border-gray-700/50 text-[#64748B] dark:text-gray-400 hover:border-brand-blue/30 dark:hover:border-brand-blue/30'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Search Button */}
          <Button
            onClick={handleSearch}
            disabled={isSearching || !icpProfile}
            className="w-full gap-2"
          >
            {isSearching ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Search
              </>
            )}
          </Button>

          {/* Results Preview */}
          {searchResult && (
            <div className="space-y-3">
              {/* Result count with classification breakdown */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[#1E293B] dark:text-gray-100">
                    {classificationCounts.total} results
                  </p>
                  <p className="text-xs text-[#64748B] dark:text-gray-400">
                    {classificationCounts.net_new} net-new · {classificationCounts.uncontacted} uncontacted · {classificationCounts.contacted_no_deal} contacted
                  </p>
                </div>
                {searchResult.results.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="text-xs text-brand-blue dark:text-blue-400 hover:underline"
                  >
                    {selectedRows.length === searchResult.results.length ? 'Deselect All' : 'Select All'}
                  </button>
                )}
              </div>

              {/* Classification filter buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setClassificationFilter('all')}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    classificationFilter === 'all'
                      ? 'border-brand-blue bg-brand-blue/5 dark:bg-brand-blue/10 text-brand-blue dark:text-blue-400'
                      : 'border-[#E2E8F0] dark:border-gray-700/50 text-[#64748B] dark:text-gray-400 hover:border-brand-blue/30'
                  }`}
                >
                  All ({classificationCounts.total})
                </button>
                <button
                  type="button"
                  onClick={() => setClassificationFilter('net_new')}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    classificationFilter === 'net_new'
                      ? 'border-brand-blue bg-brand-blue/5 dark:bg-brand-blue/10 text-brand-blue dark:text-blue-400'
                      : 'border-[#E2E8F0] dark:border-gray-700/50 text-[#64748B] dark:text-gray-400 hover:border-brand-blue/30'
                  }`}
                >
                  <Sparkles className="h-3 w-3" />
                  Net New ({classificationCounts.net_new})
                </button>
                <button
                  type="button"
                  onClick={() => setClassificationFilter('uncontacted')}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    classificationFilter === 'uncontacted'
                      ? 'border-brand-blue bg-brand-blue/5 dark:bg-brand-blue/10 text-brand-blue dark:text-blue-400'
                      : 'border-[#E2E8F0] dark:border-gray-700/50 text-[#64748B] dark:text-gray-400 hover:border-brand-blue/30'
                  }`}
                >
                  <UserPlus className="h-3 w-3" />
                  Uncontacted ({classificationCounts.uncontacted})
                </button>
                <button
                  type="button"
                  onClick={() => setClassificationFilter('contacted_no_deal')}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    classificationFilter === 'contacted_no_deal'
                      ? 'border-brand-blue bg-brand-blue/5 dark:bg-brand-blue/10 text-brand-blue dark:text-blue-400'
                      : 'border-[#E2E8F0] dark:border-gray-700/50 text-[#64748B] dark:text-gray-400 hover:border-brand-blue/30'
                  }`}
                >
                  <MessageSquare className="h-3 w-3" />
                  Contacted ({classificationCounts.contacted_no_deal})
                </button>
              </div>

              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {filteredResults.map((result: any, filteredIndex: number) => {
                  // Get the original index from searchResult.results for checkbox state
                  const originalIndex = searchResult.results.indexOf(result);
                  return (
                  <div
                    key={originalIndex}
                    className="flex items-start gap-3 rounded-lg border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 p-3 hover:border-brand-blue/30 dark:hover:border-brand-blue/30 transition-colors"
                  >
                    <Checkbox
                      checked={selectedRows.includes(originalIndex)}
                      onCheckedChange={() => toggleRow(originalIndex)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium text-[#1E293B] dark:text-gray-100 truncate">
                          {result.name || result.first_name + ' ' + result.last_name || 'Unknown'}
                        </p>
                        {result.classification && (
                          <Badge variant={getClassificationVariant(result.classification)} className="shrink-0 text-xs">
                            {getClassificationLabel(result.classification)}
                          </Badge>
                        )}
                      </div>
                      {result.title && (
                        <p className="text-xs text-[#64748B] dark:text-gray-400 truncate">
                          {result.title}
                        </p>
                      )}
                      {result.organization_name && (
                        <p className="text-xs text-[#64748B] dark:text-gray-400 truncate">
                          {result.organization_name}
                        </p>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>

              {/* Action Buttons */}
              <div className="space-y-2">
                {/* Add Selected Button */}
                {selectedRows.length > 0 && (
                  <Button
                    onClick={handleAddRows}
                    disabled={isAdding}
                    className="w-full gap-2"
                    variant="default"
                  >
                    {isAdding ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4" />
                        Add Selected ({selectedRows.length})
                      </>
                    )}
                  </Button>
                )}

                {/* Batch Action Buttons */}
                {searchResult && searchResult.results.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {classificationCounts.net_new > 0 && (
                      <Button
                        onClick={() => handleBatchAddByClassification('net_new')}
                        disabled={isAdding}
                        variant="outline"
                        className="gap-1.5 text-xs"
                      >
                        <Sparkles className="h-3 w-3" />
                        Add Net-New ({classificationCounts.net_new})
                      </Button>
                    )}
                    {classificationCounts.uncontacted > 0 && (
                      <Button
                        onClick={() => handleBatchAddByClassification('uncontacted')}
                        disabled={isAdding}
                        variant="outline"
                        className="gap-1.5 text-xs"
                      >
                        <UserPlus className="h-3 w-3" />
                        Add Uncontacted ({classificationCounts.uncontacted})
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {!icpProfile && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-4 text-center">
              <p className="text-sm text-amber-700 dark:text-amber-300">
                This table is not linked to an ICP profile. Create an ICP profile first to use Find More.
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
