import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  AlertCircle,
  Search,
  ListFilter,
  Users,
  Zap,
  Plus,
  Trash2,
} from 'lucide-react';
import { useHubSpotIntegration } from '@/lib/hooks/useHubSpotIntegration';
import { supabase } from '@/lib/supabase/clientV2';
import { useUser } from '@/lib/hooks/useUser';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HubSpotImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: (tableId: string) => void;
  /** When 'pipeline', imports deals into the deals table via materialize-crm-deals */
  importMode?: 'ops' | 'pipeline';
}

interface HubSpotSegment {
  id: string;
  name: string;
  listType: 'STATIC' | 'DYNAMIC';
  membershipCount: number;
}

interface HubSpotFilter {
  propertyName: string;
  operator: string;
  value: string;
}

interface PreviewContact {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  company: string;
}

interface HubSpotProperty {
  name: string;
  label: string;
  type: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEPS = [
  { id: 1, label: 'Select Source' },
  { id: 2, label: 'Preview & Import' },
] as const;

const FILTER_OPERATORS = [
  { value: 'EQ', label: 'Equals' },
  { value: 'NEQ', label: 'Not equal' },
  { value: 'CONTAINS', label: 'Contains' },
  { value: 'HAS_PROPERTY', label: 'Has value' },
  { value: 'NOT_HAS_PROPERTY', label: 'Is empty' },
  { value: 'GT', label: 'Greater than' },
  { value: 'LT', label: 'Less than' },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HubSpotImportWizard({ open, onOpenChange, onComplete, importMode = 'ops' }: HubSpotImportWizardProps) {
  const { userData: user } = useUser();
  const { activeOrg } = useOrg();
  const queryClient = useQueryClient();
  const {
    isConnected,
    loading: hubspotLoading,
    connectHubSpot,
    getSegments,
    getProperties,
    previewContacts,
  } = useHubSpotIntegration();

  // Wizard state
  const [step, setStep] = useState(1);
  const [sourceMode, setSourceMode] = useState<'segment' | 'filter'>('segment');
  const [tableName, setTableName] = useState('');
  const [limit, setLimit] = useState(1000);

  // Segment selection
  const [segments, setSegments] = useState<HubSpotSegment[]>([]);
  const [loadingSegments, setLoadingSegments] = useState(false);
  const [segmentSearch, setSegmentSearch] = useState('');
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

  // Properties for filters
  const [properties, setProperties] = useState<HubSpotProperty[]>([]);
  const [loadingProperties, setLoadingProperties] = useState(false);

  // Filter mode
  const [filters, setFilters] = useState<HubSpotFilter[]>([]);
  const [filterLogic, setFilterLogic] = useState<'AND' | 'OR'>('AND');

  // Preview state
  const [previewData, setPreviewData] = useState<{ totalCount: number; contacts: PreviewContact[] } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Sync direction
  const [syncDirection, setSyncDirection] = useState<'pull_only' | 'bidirectional'>('pull_only');

  // Import state
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ table_id: string; rows_imported: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importAllColumns, setImportAllColumns] = useState(true); // Default to importing all columns

  // Pipeline mode: CRM deal index records
  const [crmDeals, setCrmDeals] = useState<Array<{ id: string; name: string; stage: string | null; amount: number | null; close_date: string | null }>>([]);
  const [loadingCrmDeals, setLoadingCrmDeals] = useState(false);
  const [selectedCrmDealIds, setSelectedCrmDealIds] = useState<Set<string>>(new Set());
  const [pipelineImportResult, setPipelineImportResult] = useState<{ materialized: number; failed: number } | null>(null);

  // Pipeline mode: load unmaterialized CRM deals
  useEffect(() => {
    if (open && importMode === 'pipeline' && activeOrg?.id) {
      loadCrmDeals();
    }
  }, [open, importMode, activeOrg?.id]);

  const loadCrmDeals = async () => {
    if (!activeOrg?.id) return;
    setLoadingCrmDeals(true);
    try {
      const { data, error } = await supabase
        .from('crm_deal_index')
        .select('id, name, stage, amount, close_date')
        .eq('org_id', activeOrg.id)
        .eq('crm_source', 'hubspot')
        .eq('is_materialized', false)
        .order('name');
      if (error) throw error;
      setCrmDeals(data || []);
      // Select all by default
      setSelectedCrmDealIds(new Set((data || []).map((d) => d.id)));
    } catch (e: any) {
      toast.error(e.message || 'Failed to load HubSpot deals');
    } finally {
      setLoadingCrmDeals(false);
    }
  };

  const handlePipelineImport = async () => {
    if (!activeOrg?.id || selectedCrmDealIds.size === 0) return;
    setIsImporting(true);
    setImportError(null);
    try {
      const { data, error } = await supabase.functions.invoke('materialize-crm-deals', {
        body: {
          org_id: activeOrg.id,
          deal_index_ids: [...selectedCrmDealIds],
        },
      });
      if (error) throw error;
      setPipelineImportResult({ materialized: data.materialized, failed: data.failed });
      if (data.materialized > 0) {
        toast.success(`Imported ${data.materialized} deal${data.materialized !== 1 ? 's' : ''} to pipeline`);
      }
      if (data.failed > 0) {
        toast.error(`${data.failed} deal${data.failed !== 1 ? 's' : ''} failed to import`);
      }
    } catch (e: any) {
      setImportError(e?.message || 'Pipeline import failed');
      toast.error('Pipeline import failed: ' + (e?.message || 'Unknown error'));
    } finally {
      setIsImporting(false);
    }
  };

  // Auto-advance to step 1 content if connected
  useEffect(() => {
    if (open && isConnected && step === 1) {
      // Load segments when opening in segment mode
      if (sourceMode === 'segment' && segments.length === 0) {
        loadSegments();
      }
    }
  }, [open, isConnected, step, sourceMode]);

  // Load segments
  const loadSegments = async () => {
    setLoadingSegments(true);
    try {
      const fetchedSegments = await getSegments();
      setSegments(fetchedSegments);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load HubSpot segments');
    } finally {
      setLoadingSegments(false);
    }
  };

  // Load properties for filters
  const loadProperties = async () => {
    if (properties.length > 0) return;
    setLoadingProperties(true);
    try {
      const props = await getProperties('contacts');
      setProperties(props);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load properties');
    } finally {
      setLoadingProperties(false);
    }
  };

  // Handle source mode change
  const handleSourceModeChange = (mode: 'segment' | 'filter') => {
    setSourceMode(mode);
    setSelectedSegmentId(null);
    setFilters([]);
    if (mode === 'segment' && segments.length === 0) {
      loadSegments();
    }
    if (mode === 'filter' && properties.length === 0) {
      loadProperties();
    }
  };

  // Handle segment selection
  const handleSelectSegment = (segment: HubSpotSegment) => {
    setSelectedSegmentId(segment.id);
    setTableName(segment.name);
  };

  // Filter management
  const addFilter = () => {
    setFilters((prev) => [...prev, { propertyName: '', operator: 'EQ', value: '' }]);
  };

  const updateFilter = (index: number, updates: Partial<HubSpotFilter>) => {
    setFilters((prev) => prev.map((f, i) => (i === index ? { ...f, ...updates } : f)));
  };

  const removeFilter = (index: number) => {
    setFilters((prev) => prev.filter((_, i) => i !== index));
  };

  // Load preview when moving to step 2
  const loadPreview = async () => {
    setLoadingPreview(true);
    setPreviewData(null);
    try {
      const validFilters = filters.filter((f) => f.propertyName && f.operator);
      const result = await previewContacts({
        list_id: sourceMode === 'segment' ? selectedSegmentId || undefined : undefined,
        filters: sourceMode === 'filter' && validFilters.length > 0 ? validFilters : undefined,
        filter_logic: sourceMode === 'filter' && validFilters.length > 1 ? filterLogic : undefined,
        limit: 5,
      });
      setPreviewData(result);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load preview');
    } finally {
      setLoadingPreview(false);
    }
  };

  // Handle continue to step 2
  const handleContinueToPreview = async () => {
    setStep(2);
    await loadPreview();
  };

  // Filtered segments for search
  const filteredSegments = useMemo(() => {
    if (!segmentSearch) return segments;
    const q = segmentSearch.toLowerCase();
    return segments.filter((s) => s.name.toLowerCase().includes(q));
  }, [segments, segmentSearch]);

  // Default table name
  useEffect(() => {
    if (!tableName && sourceMode === 'filter') {
      setTableName('HubSpot Contacts');
    }
  }, [sourceMode, tableName]);

  const reset = () => {
    setStep(1);
    setSourceMode('segment');
    setTableName('');
    setLimit(1000);
    setSegments([]);
    setSegmentSearch('');
    setSelectedSegmentId(null);
    setFilters([]);
    setPreviewData(null);
    setIsImporting(false);
    setImportResult(null);
    setImportError(null);
    setImportAllColumns(true);
    setSyncDirection('pull_only');
    setCrmDeals([]);
    setSelectedCrmDealIds(new Set());
    setPipelineImportResult(null);
  };

  const handleClose = () => {
    if (isImporting) return;
    reset();
    onOpenChange(false);
  };

  // Import execution
  const handleImport = async () => {
    console.log('[HubSpotImportWizard] handleImport called', {
      userId: user?.id,
      orgId: activeOrg?.id,
      tableName,
      selectedSegmentId,
      sourceMode,
      limit
    });

    if (!user?.id) {
      console.error('[HubSpotImportWizard] Missing user.id');
      toast.error('Missing user - please refresh and try again');
      return;
    }
    if (!activeOrg?.id) {
      console.error('[HubSpotImportWizard] Missing activeOrg.id');
      toast.error('Missing organization - please refresh and try again');
      return;
    }
    if (!tableName.trim()) {
      console.error('[HubSpotImportWizard] Missing tableName');
      toast.error('Please enter a table name');
      return;
    }

    setIsImporting(true);
    setImportError(null);

    try {
      const validFilters = filters.filter((f) => f.propertyName && f.operator);
      const requestBody = {
        org_id: activeOrg.id,
        user_id: user.id,
        table_name: tableName.trim(),
        list_id: sourceMode === 'segment' ? selectedSegmentId : undefined,
        filters: sourceMode === 'filter' && validFilters.length > 0 ? validFilters : undefined,
        filter_logic: sourceMode === 'filter' && validFilters.length > 1 ? filterLogic : undefined,
        limit,
        import_all_columns: importAllColumns,
        sync_direction: syncDirection,
      };
      console.log('[HubSpotImportWizard] Calling import-from-hubspot with:', requestBody);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('No auth token available');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL;
      const fnUrl = `${supabaseUrl}/functions/v1/import-from-hubspot`;
      const jsonBody = JSON.stringify(requestBody);
      console.log('[HubSpotImportWizard] Direct fetch to:', fnUrl, 'body length:', jsonBody.length);

      const resp = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY,
        },
        body: jsonBody,
      });

      const data = await resp.json();
      console.log('[HubSpotImportWizard] Response:', { status: resp.status, data });

      if (!resp.ok || data?.error) throw new Error(data?.error || `HTTP ${resp.status}`);

      queryClient.invalidateQueries({ queryKey: ['ops-tables'] });
      toast.success(`Imported ${data.rows_imported} contacts from HubSpot`);

      // Auto-close and navigate to the new table
      onComplete?.(data.table_id);
      handleClose();
    } catch (e: any) {
      setImportError(e?.message || 'Import failed');
      toast.error('HubSpot import failed: ' + (e?.message || 'Unknown error'));
    } finally {
      setIsImporting(false);
    }
  };

  const canProceedFromSource =
    tableName.trim().length > 0 &&
    ((sourceMode === 'segment' && selectedSegmentId) || sourceMode === 'filter');

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Import from HubSpot</DialogTitle>
          <DialogDescription>Import contacts from HubSpot</DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="px-6 pt-4 pb-3 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {importMode === 'pipeline' ? 'Import HubSpot Deals to Pipeline' : 'Import from HubSpot'}
          </h2>
          {importMode !== 'pipeline' && <div className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <React.Fragment key={s.id}>
                <div className="flex items-center gap-1.5">
                  <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                    step > s.id
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                      : step === s.id
                        ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
                  }`}>
                    {step > s.id ? <CheckCircle2 className="w-3.5 h-3.5" /> : s.id}
                  </div>
                  <span className={`text-xs font-medium ${
                    step >= s.id ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'
                  }`}>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-px ${
                    step > s.id ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-gray-200 dark:bg-gray-700'
                  }`} />
                )}
              </React.Fragment>
            ))}
          </div>}
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Connection check */}
          {!isConnected && !hubspotLoading && (
            <div className="flex flex-col items-center justify-center py-10 space-y-4">
              <AlertCircle className="w-10 h-10 text-orange-400" />
              <p className="text-sm text-gray-300">HubSpot is not connected</p>
              <p className="text-xs text-gray-500 text-center max-w-sm">
                Connect your HubSpot account to import contacts.
              </p>
              <Button onClick={connectHubSpot} className="bg-orange-600 hover:bg-orange-500">
                Connect HubSpot
              </Button>
            </div>
          )}

          {hubspotLoading && (
            <div className="flex flex-col items-center justify-center py-10 space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
              <p className="text-sm text-gray-400">Checking HubSpot connection...</p>
            </div>
          )}

          {/* Pipeline mode: deal selection */}
          {importMode === 'pipeline' && !pipelineImportResult && (
            <div className="space-y-4">
              {loadingCrmDeals ? (
                <div className="flex flex-col items-center justify-center py-10 space-y-4">
                  <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                  <p className="text-sm text-gray-400">Loading HubSpot deals...</p>
                </div>
              ) : crmDeals.length === 0 && !isImporting ? (
                <div className="flex flex-col items-center justify-center py-10 space-y-4">
                  <AlertCircle className="w-10 h-10 text-gray-500" />
                  <p className="text-sm text-gray-300">No unmaterialized HubSpot deals found</p>
                  <p className="text-xs text-gray-500 text-center max-w-sm">
                    All synced deals have already been imported to the pipeline, or no deals have been synced from HubSpot yet.
                  </p>
                </div>
              ) : isImporting ? (
                <div className="flex flex-col items-center justify-center py-10 space-y-4">
                  <Loader2 className="w-10 h-10 text-orange-500 animate-spin" />
                  <p className="text-sm text-gray-300">Importing deals to pipeline...</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-300">
                      {crmDeals.length} deal{crmDeals.length !== 1 ? 's' : ''} available to import
                    </p>
                    <button
                      onClick={() => {
                        if (selectedCrmDealIds.size === crmDeals.length) {
                          setSelectedCrmDealIds(new Set());
                        } else {
                          setSelectedCrmDealIds(new Set(crmDeals.map((d) => d.id)));
                        }
                      }}
                      className="text-xs text-orange-400 hover:text-orange-300"
                    >
                      {selectedCrmDealIds.size === crmDeals.length ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>
                  <div className="max-h-[320px] overflow-y-auto space-y-1 rounded-lg border border-gray-800 p-2">
                    {crmDeals.map((deal) => (
                      <label
                        key={deal.id}
                        className={`flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                          selectedCrmDealIds.has(deal.id)
                            ? 'bg-orange-500/10 border border-orange-500/20'
                            : 'hover:bg-gray-800 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={selectedCrmDealIds.has(deal.id)}
                            onChange={() => {
                              setSelectedCrmDealIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(deal.id)) next.delete(deal.id);
                                else next.add(deal.id);
                                return next;
                              });
                            }}
                            className="w-3.5 h-3.5 rounded border-gray-600 text-orange-600 bg-gray-800 focus:ring-orange-500 focus:ring-offset-0 cursor-pointer"
                          />
                          <span className="text-sm text-gray-200 truncate">{deal.name || 'Untitled Deal'}</span>
                          {deal.stage && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400 shrink-0">
                              {deal.stage}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0 ml-2">
                          {deal.amount != null && (
                            <span className="text-xs text-gray-400">
                              ${deal.amount.toLocaleString()}
                            </span>
                          )}
                          {deal.close_date && (
                            <span className="text-[10px] text-gray-500">
                              {new Date(deal.close_date).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                  {importError && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-red-300">{importError}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Pipeline mode: import complete */}
          {importMode === 'pipeline' && pipelineImportResult && (
            <div className="flex flex-col items-center justify-center py-8 space-y-6">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="text-center space-y-1">
                <h3 className="text-lg font-semibold text-white">Import Complete</h3>
                <p className="text-sm text-gray-400">
                  {pipelineImportResult.materialized} deal{pipelineImportResult.materialized !== 1 ? 's' : ''} imported to pipeline.
                  {pipelineImportResult.failed > 0 && ` ${pipelineImportResult.failed} failed.`}
                </p>
              </div>
              <Button onClick={handleClose} className="gap-2 bg-orange-600 hover:bg-orange-500">
                Done
              </Button>
            </div>
          )}

          {/* Step 1: Select Source */}
          {isConnected && step === 1 && importMode !== 'pipeline' && (
            <div className="space-y-4">
              {/* Table name */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Table name</label>
                <input
                  type="text"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  placeholder="e.g. Q1 Marketing Leads"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-orange-500"
                />
              </div>

              {/* Source mode toggle */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Import from</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSourceModeChange('segment')}
                    className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                      sourceMode === 'segment'
                        ? 'bg-orange-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    HubSpot Segment
                  </button>
                  <button
                    onClick={() => handleSourceModeChange('filter')}
                    className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                      sourceMode === 'filter'
                        ? 'bg-orange-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                    }`}
                  >
                    <ListFilter className="w-4 h-4" />
                    Filter by Property
                  </button>
                </div>
              </div>

              {/* Segment selector (replaced deprecated HubSpot lists) */}
              {sourceMode === 'segment' && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">Select a segment</label>

                  {/* Search */}
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="text"
                      value={segmentSearch}
                      onChange={(e) => setSegmentSearch(e.target.value)}
                      placeholder="Search segments..."
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-orange-500"
                    />
                  </div>

                  {loadingSegments ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                    </div>
                  ) : (
                    <>
                      <div className="max-h-[200px] overflow-y-auto space-y-1 rounded-lg border border-gray-800 p-2">
                        {filteredSegments.map((segment) => (
                          <button
                            key={segment.id}
                            onClick={() => handleSelectSegment(segment)}
                            className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                              selectedSegmentId === segment.id
                                ? 'bg-orange-500/10 text-orange-300 border border-orange-500/20'
                                : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Users className="w-4 h-4 shrink-0 text-gray-500" />
                              <span className="truncate font-medium">{segment.name}</span>
                              <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded ${
                                segment.listType === 'DYNAMIC'
                                  ? 'bg-blue-500/20 text-blue-400'
                                  : 'bg-gray-700 text-gray-400'
                              }`}>
                                {segment.listType === 'DYNAMIC' ? 'Active' : 'Static'}
                              </span>
                            </div>
                            <span className="text-xs text-gray-500 shrink-0 ml-2">
                              {segment.membershipCount.toLocaleString()} contacts
                            </span>
                          </button>
                        ))}
                        {filteredSegments.length === 0 && (
                          <div className="py-6 text-center space-y-2">
                            <p className="text-xs text-gray-500">
                              {segments.length === 0 ? 'No segments found in HubSpot' : 'No segments match your search'}
                            </p>
                            {segments.length === 0 && (
                              <p className="text-xs text-gray-600 px-2">
                                Create a segment in HubSpot or use "Filter by Property" below to import by contact criteria.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      {segments.length === 0 && (
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                          <AlertCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                          <div className="text-xs text-blue-300">
                            <p className="font-medium mb-1">No HubSpot Segments?</p>
                            <p className="text-blue-400/80">
                              Use "Filter by Property" above to import contacts based on specific criteria (e.g., Company, Job Title, Email domain).
                            </p>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Filter builder */}
              {sourceMode === 'filter' && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-300">Filter criteria (optional)</label>
                    <button
                      onClick={addFilter}
                      className="inline-flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300"
                    >
                      <Plus className="w-3 h-3" /> Add filter
                    </button>
                  </div>
                  {filters.length === 0 && (
                    <p className="text-xs text-gray-500 mb-2">No filters — all contacts will be imported.</p>
                  )}
                  {loadingProperties ? (
                    <div className="flex items-center gap-2 py-2">
                      <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                      <span className="text-xs text-gray-500">Loading properties...</span>
                    </div>
                  ) : (
                    filters.map((f, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && (
                          <div className="flex items-center gap-2 my-1">
                            <div className="flex-1 h-px bg-gray-800" />
                            <button
                              type="button"
                              onClick={() => setFilterLogic(filterLogic === 'AND' ? 'OR' : 'AND')}
                              className="px-2 py-0.5 text-[10px] font-semibold uppercase rounded bg-gray-800 text-gray-400 hover:text-white transition-colors"
                            >
                              {filterLogic}
                            </button>
                            <div className="flex-1 h-px bg-gray-800" />
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <select
                            value={f.propertyName}
                            onChange={(e) => updateFilter(i, { propertyName: e.target.value })}
                            className="w-[180px] min-w-0 shrink-0 rounded-lg border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-white outline-none"
                          >
                            <option value="">Property...</option>
                            {properties.map((p) => (
                              <option key={p.name} value={p.name}>{p.label}</option>
                            ))}
                          </select>
                          <select
                            value={f.operator}
                            onChange={(e) => updateFilter(i, { operator: e.target.value })}
                            className="w-[120px] min-w-0 shrink-0 rounded-lg border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-white outline-none"
                          >
                            {FILTER_OPERATORS.map((op) => (
                              <option key={op.value} value={op.value}>{op.label}</option>
                            ))}
                          </select>
                          {f.operator !== 'HAS_PROPERTY' && f.operator !== 'NOT_HAS_PROPERTY' && (
                            <input
                              type="text"
                              value={f.value}
                              onChange={(e) => updateFilter(i, { value: e.target.value })}
                              placeholder="Value"
                              className="flex-1 min-w-0 rounded-lg border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-white placeholder-gray-500 outline-none"
                            />
                          )}
                          <button onClick={() => removeFilter(i)} className="shrink-0 text-gray-500 hover:text-red-400">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </React.Fragment>
                    ))
                  )}
                </div>
              )}

              {/* Record limit */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Max records</label>
                <select
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-orange-500"
                >
                  <option value={100}>100</option>
                  <option value={500}>500</option>
                  <option value={1000}>1,000</option>
                  <option value={5000}>5,000</option>
                  <option value={10000}>10,000</option>
                </select>
              </div>

              {/* Include common properties toggle */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                <input
                  type="checkbox"
                  id="importAllColumns"
                  checked={importAllColumns}
                  onChange={(e) => setImportAllColumns(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-600 text-orange-600 bg-gray-800 focus:ring-orange-500 focus:ring-offset-0 cursor-pointer"
                />
                <label htmlFor="importAllColumns" className="cursor-pointer">
                  <p className="text-sm font-medium text-gray-200">Include common properties</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {importAllColumns
                      ? 'First Name, Last Name, Company, Job Title, Phone, Lifecycle Stage, Lead Status'
                      : 'Only imports email — add more columns later from HubSpot properties'}
                  </p>
                </label>
              </div>

              {/* Sync direction */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Sync direction</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSyncDirection('pull_only')}
                    className={`flex-1 flex flex-col items-start gap-1 rounded-lg px-3 py-2.5 text-left text-sm transition-colors border ${
                      syncDirection === 'pull_only'
                        ? 'bg-orange-500/10 border-orange-500/30 text-orange-300'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                    }`}
                  >
                    <span className="font-medium text-xs">Pull only</span>
                    <span className="text-[10px] text-gray-500 leading-tight">
                      HubSpot → Table. Changes stay local.
                    </span>
                  </button>
                  <button
                    onClick={() => setSyncDirection('bidirectional')}
                    className={`flex-1 flex flex-col items-start gap-1 rounded-lg px-3 py-2.5 text-left text-sm transition-colors border ${
                      syncDirection === 'bidirectional'
                        ? 'bg-orange-500/10 border-orange-500/30 text-orange-300'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                    }`}
                  >
                    <span className="font-medium text-xs">Bi-directional</span>
                    <span className="text-[10px] text-gray-500 leading-tight">
                      Edits write back to HubSpot instantly.
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Preview & Import */}
          {isConnected && step === 2 && (
            <div className="space-y-4">
              {importResult ? (
                // Import complete
                <div className="flex flex-col items-center justify-center py-8 space-y-6">
                  <div className="flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="text-center space-y-1">
                    <h3 className="text-lg font-semibold text-white">Import Complete</h3>
                    <p className="text-sm text-gray-400">
                      Imported {importResult.rows_imported.toLocaleString()} contacts with email as the key identifier.
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      Add columns to pull more HubSpot properties (First Name, Company, etc.)
                    </p>
                  </div>
                  <Button
                    onClick={() => {
                      onComplete?.(importResult.table_id);
                      handleClose();
                    }}
                    className="gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open Table
                  </Button>
                </div>
              ) : importError ? (
                // Import error
                <div className="flex flex-col items-center justify-center py-8 space-y-6">
                  <div className="flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30">
                    <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="text-center space-y-1">
                    <h3 className="text-lg font-semibold text-white">Import Failed</h3>
                    <p className="text-sm text-red-400">{importError}</p>
                  </div>
                  <Button onClick={() => { setStep(1); setImportError(null); }} variant="outline">
                    Back to Selection
                  </Button>
                </div>
              ) : isImporting ? (
                // Importing
                <div className="flex flex-col items-center justify-center py-8 space-y-4">
                  <Loader2 className="w-10 h-10 text-orange-500 animate-spin" />
                  <div className="text-center space-y-1">
                    <h3 className="text-sm font-medium text-gray-300">Importing from HubSpot...</h3>
                    <p className="text-xs text-gray-500">
                      Fetching up to {limit.toLocaleString()} contacts
                    </p>
                  </div>
                </div>
              ) : (
                // Preview
                <>
                  {/* Preview header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="w-5 h-5 text-orange-400" />
                      <h3 className="text-sm font-semibold text-white">
                        {loadingPreview ? 'Loading preview...' : (
                          previewData
                            ? `Importing ${Math.min(previewData.totalCount, limit).toLocaleString()} contacts`
                            : 'Preview'
                        )}
                      </h3>
                    </div>
                    {previewData && previewData.totalCount > limit && (
                      <span className="text-xs text-gray-500">
                        (limited from {previewData.totalCount.toLocaleString()})
                      </span>
                    )}
                  </div>

                  {/* Preview table */}
                  {loadingPreview ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                    </div>
                  ) : previewData && previewData.contacts.length > 0 ? (
                    <div className="rounded-lg border border-gray-800 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-900/50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Email</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">First Name</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Last Name</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Company</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                          {previewData.contacts.map((contact) => (
                            <tr key={contact.id} className="hover:bg-gray-800/30">
                              <td className="px-3 py-2 text-gray-300 font-medium">{contact.email || '—'}</td>
                              <td className="px-3 py-2 text-gray-400">{contact.firstName || '—'}</td>
                              <td className="px-3 py-2 text-gray-400">{contact.lastName || '—'}</td>
                              <td className="px-3 py-2 text-gray-400">{contact.company || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {previewData.totalCount > 5 && (
                        <div className="px-3 py-2 text-xs text-gray-500 bg-gray-900/30 border-t border-gray-800">
                          ... and {(Math.min(previewData.totalCount, limit) - 5).toLocaleString()} more
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                      <Users className="w-8 h-8 mb-2 text-gray-700" />
                      <p className="text-sm">No contacts found matching your criteria</p>
                    </div>
                  )}

                  {/* Info about email key */}
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <AlertCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-blue-300">
                      <p className="font-medium mb-1">Email is the key identifier</p>
                      <p className="text-blue-400/80">
                        Your table will be created with email addresses. Add more columns (First Name, Company, etc.)
                        in the table by selecting "HubSpot Property" when adding a column.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-800 flex justify-between">
          {importMode === 'pipeline' ? (
            <>
              <Button variant="ghost" onClick={handleClose} disabled={isImporting}>
                Cancel
              </Button>
              {!pipelineImportResult && (
                <Button
                  onClick={handlePipelineImport}
                  disabled={selectedCrmDealIds.size === 0 || isImporting || loadingCrmDeals}
                  className="gap-1 bg-orange-600 hover:bg-orange-500"
                >
                  {isImporting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>Import {selectedCrmDealIds.size} Deal{selectedCrmDealIds.size !== 1 ? 's' : ''}</>
                  )}
                </Button>
              )}
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={step === 1 ? handleClose : () => setStep(1)}
                disabled={isImporting}
              >
                {step === 1 ? 'Cancel' : <><ArrowLeft className="w-4 h-4 mr-1" /> Back</>}
              </Button>

              {isConnected && step === 1 && (
                <Button
                  onClick={handleContinueToPreview}
                  disabled={!canProceedFromSource}
                  className="gap-1 bg-orange-600 hover:bg-orange-500"
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </Button>
              )}

              {isConnected && step === 2 && !importResult && !importError && !isImporting && (
                <Button
                  onClick={handleImport}
                  disabled={!previewData || previewData.contacts.length === 0}
                  className="gap-1 bg-orange-600 hover:bg-orange-500"
                >
                  Import {previewData ? Math.min(previewData.totalCount, limit).toLocaleString() : ''} Contacts
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
