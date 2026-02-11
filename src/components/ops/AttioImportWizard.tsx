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
  Building2,
  Briefcase,
  Zap,
  Database,
  Plus,
  Trash2,
} from 'lucide-react';
import { useAttioIntegration } from '@/lib/hooks/useAttioIntegration';
import { supabase } from '@/lib/supabase/clientV2';
import { useUser } from '@/lib/hooks/useUser';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AttioImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: (tableId: string) => void;
}

type AttioObjectType = 'people' | 'companies' | 'deals';

interface AttioList {
  id: string;
  name: string;
  api_slug: string;
  parent_object: string;
  record_count: number;
  created_at: string;
}

interface AttioAttribute {
  id: string;
  title: string;
  api_slug: string;
  type: string;
  is_required: boolean;
  is_writable: boolean;
}

interface AttioFilter {
  attributeSlug: string;
  operator: string;
  value: string;
}

interface PreviewRecord {
  id: string;
  values: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEPS = [
  { id: 1, label: 'Select Source' },
  { id: 2, label: 'Preview & Import' },
] as const;

const OBJECT_OPTIONS: { value: AttioObjectType; label: string; icon: React.ElementType }[] = [
  { value: 'people', label: 'People', icon: Users },
  { value: 'companies', label: 'Companies', icon: Building2 },
  { value: 'deals', label: 'Deals', icon: Briefcase },
];

const FILTER_OPERATORS = [
  { value: '$eq', label: 'Equals' },
  { value: '$not_eq', label: 'Not equal' },
  { value: '$contains', label: 'Contains' },
  { value: '$not_empty', label: 'Has value' },
  { value: '$is_empty', label: 'Is empty' },
  { value: '$gt', label: 'Greater than' },
  { value: '$lt', label: 'Less than' },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractDisplayValue(attrValue: any): string {
  if (!attrValue) return '';
  if (Array.isArray(attrValue)) {
    // Attio stores most values as arrays of value objects
    const first = attrValue[0];
    if (!first) return '';
    if (first.email_address) return first.email_address;
    if (first.phone_number) return first.phone_number;
    if (first.domain) return first.domain;
    if (first.value !== undefined) return String(first.value);
    if (first.first_name || first.last_name) {
      return [first.first_name, first.last_name].filter(Boolean).join(' ');
    }
    if (first.full_name) return first.full_name;
    if (first.target_object) return first.target_record_id || '';
    return JSON.stringify(first);
  }
  if (typeof attrValue === 'object') {
    return attrValue.value ?? attrValue.name ?? JSON.stringify(attrValue);
  }
  return String(attrValue);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AttioImportWizard({ open, onOpenChange, onComplete }: AttioImportWizardProps) {
  const { userData: user } = useUser();
  const { activeOrg } = useOrg();
  const queryClient = useQueryClient();
  const {
    isConnected,
    loading: attioLoading,
    connectAttio,
    getLists,
    getAttributes,
    getRecords,
  } = useAttioIntegration();

  // Wizard state
  const [step, setStep] = useState(1);
  const [sourceMode, setSourceMode] = useState<'list' | 'filter'>('list');
  const [selectedObject, setSelectedObject] = useState<AttioObjectType>('people');
  const [tableName, setTableName] = useState('');
  const [limit, setLimit] = useState(1000);

  // List selection
  const [lists, setLists] = useState<AttioList[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [listSearch, setListSearch] = useState('');
  const [selectedListId, setSelectedListId] = useState<string | null>(null);

  // Attributes
  const [attributes, setAttributes] = useState<AttioAttribute[]>([]);
  const [loadingAttributes, setLoadingAttributes] = useState(false);
  const [selectedAttributeIds, setSelectedAttributeIds] = useState<Set<string>>(new Set());

  // Filter mode
  const [filters, setFilters] = useState<AttioFilter[]>([]);

  // Preview state
  const [previewData, setPreviewData] = useState<{ totalCount: number; records: PreviewRecord[] } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Import state
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ table_id: string; rows_imported: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Auto-load lists when connected in list mode
  useEffect(() => {
    if (open && isConnected && step === 1 && sourceMode === 'list' && lists.length === 0) {
      loadLists();
    }
  }, [open, isConnected, step, sourceMode]);

  // Load attributes when object type changes (filter mode) or when wizard opens
  useEffect(() => {
    if (open && isConnected && step === 1 && sourceMode === 'filter') {
      loadAttributesForObject(selectedObject);
    }
  }, [open, isConnected, step, sourceMode, selectedObject]);

  // Load Attio lists via the hook
  const loadLists = async () => {
    setLoadingLists(true);
    try {
      const fetchedLists = await getLists();
      setLists(fetchedLists);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load Attio lists');
    } finally {
      setLoadingLists(false);
    }
  };

  // Load attributes for a given object type via the hook
  const loadAttributesForObject = async (obj: AttioObjectType) => {
    setLoadingAttributes(true);
    try {
      const attrs = await getAttributes(obj);
      setAttributes(attrs);
      // Select all attributes by default
      setSelectedAttributeIds(new Set(attrs.map((a) => a.id)));
    } catch (e: any) {
      toast.error(e.message || 'Failed to load Attio attributes');
    } finally {
      setLoadingAttributes(false);
    }
  };

  // Handle source mode change
  const handleSourceModeChange = (mode: 'list' | 'filter') => {
    setSourceMode(mode);
    setSelectedListId(null);
    setFilters([]);
    if (mode === 'list' && lists.length === 0) {
      loadLists();
    }
    if (mode === 'filter' && attributes.length === 0) {
      loadAttributesForObject(selectedObject);
    }
  };

  // Handle object type change (filter mode)
  const handleObjectChange = (obj: AttioObjectType) => {
    setSelectedObject(obj);
    setAttributes([]);
    setSelectedAttributeIds(new Set());
    setFilters([]);
    loadAttributesForObject(obj);
  };

  // Handle list selection
  const handleSelectList = (list: AttioList) => {
    setSelectedListId(list.id);
    setTableName(list.name);
  };

  // Toggle attribute selection
  const toggleAttribute = (attrId: string) => {
    setSelectedAttributeIds((prev) => {
      const next = new Set(prev);
      if (next.has(attrId)) {
        next.delete(attrId);
      } else {
        next.add(attrId);
      }
      return next;
    });
  };

  // Select / deselect all attributes
  const toggleAllAttributes = () => {
    if (selectedAttributeIds.size === attributes.length) {
      setSelectedAttributeIds(new Set());
    } else {
      setSelectedAttributeIds(new Set(attributes.map((a) => a.id)));
    }
  };

  // Filter management
  const addFilter = () => {
    setFilters((prev) => [...prev, { attributeSlug: '', operator: '$eq', value: '' }]);
  };

  const updateFilter = (index: number, updates: Partial<AttioFilter>) => {
    setFilters((prev) => prev.map((f, i) => (i === index ? { ...f, ...updates } : f)));
  };

  const removeFilter = (index: number) => {
    setFilters((prev) => prev.filter((_, i) => i !== index));
  };

  // Filtered lists for search
  const filteredLists = useMemo(() => {
    if (!listSearch) return lists;
    const q = listSearch.toLowerCase();
    return lists.filter((l) => l.name.toLowerCase().includes(q));
  }, [lists, listSearch]);

  // Load preview when moving to step 2
  const loadPreview = async () => {
    setLoadingPreview(true);
    setPreviewData(null);
    try {
      const objectForQuery = sourceMode === 'list' ? selectedObject : selectedObject;
      const validFilters = filters.filter((f) => f.attributeSlug && f.operator);
      const filterPayload = validFilters.length > 0
        ? { $and: validFilters.map((f) => ({ attribute: f.attributeSlug, [f.operator]: f.value || true })) }
        : undefined;

      const records = await getRecords(objectForQuery, {
        limit: 5,
        filter: sourceMode === 'list' && selectedListId
          ? { list_id: selectedListId }
          : filterPayload,
      });

      setPreviewData({
        totalCount: records.length >= 5 ? limit : records.length,
        records: records.slice(0, 5).map((r: any) => ({
          id: r.id?.record_id || r.id || String(Math.random()),
          values: r.values || r,
        })),
      });
    } catch (e: any) {
      toast.error(e.message || 'Failed to load preview');
    } finally {
      setLoadingPreview(false);
    }
  };

  // Handle continue to step 2
  const handleContinueToPreview = async () => {
    // Load attributes for preview if not loaded yet (list mode)
    if (sourceMode === 'list' && attributes.length === 0) {
      await loadAttributesForObject(selectedObject);
    }
    setStep(2);
    await loadPreview();
  };

  // Default table name for filter mode
  useEffect(() => {
    if (!tableName && sourceMode === 'filter') {
      const objLabel = OBJECT_OPTIONS.find((o) => o.value === selectedObject)?.label || 'Records';
      setTableName(`Attio ${objLabel}`);
    }
  }, [sourceMode, selectedObject, tableName]);

  // Preview columns derived from record data
  const previewColumns = useMemo(() => {
    if (!previewData?.records?.length) return [];
    const allKeys = new Set<string>();
    for (const r of previewData.records) {
      for (const key of Object.keys(r.values)) {
        allKeys.add(key);
      }
    }
    // Prioritize common fields
    const priority = ['name', 'email_addresses', 'first_name', 'last_name', 'domains', 'phone_numbers', 'primary_location'];
    const sorted = [...allKeys].sort((a, b) => {
      const ai = priority.indexOf(a);
      const bi = priority.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
    return sorted.slice(0, 4);
  }, [previewData]);

  const reset = () => {
    setStep(1);
    setSourceMode('list');
    setSelectedObject('people');
    setTableName('');
    setLimit(1000);
    setLists([]);
    setListSearch('');
    setSelectedListId(null);
    setAttributes([]);
    setSelectedAttributeIds(new Set());
    setFilters([]);
    setPreviewData(null);
    setIsImporting(false);
    setImportResult(null);
    setImportError(null);
  };

  const handleClose = () => {
    if (isImporting) return;
    reset();
    onOpenChange(false);
  };

  // Import execution
  const handleImport = async () => {
    if (!user?.id) {
      toast.error('Missing user - please refresh and try again');
      return;
    }
    if (!activeOrg?.id) {
      toast.error('Missing organization - please refresh and try again');
      return;
    }
    if (!tableName.trim()) {
      toast.error('Please enter a table name');
      return;
    }

    setIsImporting(true);
    setImportError(null);

    try {
      const selectedAttrs = attributes
        .filter((a) => selectedAttributeIds.has(a.id))
        .map((a) => ({ id: a.id, api_slug: a.api_slug, title: a.title, type: a.type }));

      const validFilters = filters.filter((f) => f.attributeSlug && f.operator);
      const requestBody: Record<string, any> = {
        org_id: activeOrg.id,
        user_id: user.id,
        table_name: tableName.trim(),
        object: selectedObject,
        attributes: selectedAttrs,
        limit,
      };

      if (sourceMode === 'list' && selectedListId) {
        requestBody.list_id = selectedListId;
      } else if (validFilters.length > 0) {
        requestBody.filter = {
          $and: validFilters.map((f) => ({
            attribute: f.attributeSlug,
            [f.operator]: f.value || true,
          })),
        };
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('No auth token available');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL;
      const fnUrl = `${supabaseUrl}/functions/v1/import-from-attio`;
      const jsonBody = JSON.stringify(requestBody);

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

      if (!resp.ok || data?.error) throw new Error(data?.error || `HTTP ${resp.status}`);

      setImportResult({
        table_id: data.table_id,
        rows_imported: data.rows_imported ?? 0,
      });

      queryClient.invalidateQueries({ queryKey: ['ops-tables'] });
      const objLabel = OBJECT_OPTIONS.find((o) => o.value === selectedObject)?.label || 'records';
      toast.success(`Imported ${data.rows_imported ?? 0} ${objLabel.toLowerCase()} from Attio`);

      onComplete?.(data.table_id);
      handleClose();
    } catch (e: any) {
      setImportError(e?.message || 'Import failed');
      toast.error('Attio import failed: ' + (e?.message || 'Unknown error'));
    } finally {
      setIsImporting(false);
    }
  };

  const canProceedFromSource =
    tableName.trim().length > 0 &&
    ((sourceMode === 'list' && selectedListId) || sourceMode === 'filter');

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Import from Attio</DialogTitle>
          <DialogDescription>Import records from Attio CRM</DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="px-6 pt-4 pb-3 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Import from Attio</h2>
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <React.Fragment key={s.id}>
                <div className="flex items-center gap-1.5">
                  <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                    step > s.id
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                      : step === s.id
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
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
          </div>
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Connection check */}
          {!isConnected && !attioLoading && (
            <div className="flex flex-col items-center justify-center py-10 space-y-4">
              <AlertCircle className="w-10 h-10 text-blue-400" />
              <p className="text-sm text-gray-300">Attio is not connected</p>
              <p className="text-xs text-gray-500 text-center max-w-sm">
                Connect your Attio workspace to import people, companies, and deals.
              </p>
              <Button onClick={connectAttio} className="bg-blue-600 hover:bg-blue-500">
                Connect Attio
              </Button>
            </div>
          )}

          {attioLoading && (
            <div className="flex flex-col items-center justify-center py-10 space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              <p className="text-sm text-gray-400">Checking Attio connection...</p>
            </div>
          )}

          {/* Step 1: Select Source */}
          {isConnected && step === 1 && (
            <div className="space-y-4">
              {/* Table name */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Table name</label>
                <input
                  type="text"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  placeholder="e.g. Q1 Pipeline Contacts"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500"
                />
              </div>

              {/* Object type selector */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Object type</label>
                <div className="flex gap-2">
                  {OBJECT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleObjectChange(opt.value)}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        selectedObject === opt.value
                          ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                      }`}
                    >
                      <opt.icon className="w-3.5 h-3.5" />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Source mode toggle */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Import from</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSourceModeChange('list')}
                    className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                      sourceMode === 'list'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                    }`}
                  >
                    <Database className="w-4 h-4" />
                    Attio List
                  </button>
                  <button
                    onClick={() => handleSourceModeChange('filter')}
                    className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                      sourceMode === 'filter'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                    }`}
                  >
                    <ListFilter className="w-4 h-4" />
                    Filter by Attribute
                  </button>
                </div>
              </div>

              {/* List selector */}
              {sourceMode === 'list' && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">Select a list</label>

                  {/* Search */}
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="text"
                      value={listSearch}
                      onChange={(e) => setListSearch(e.target.value)}
                      placeholder="Search lists..."
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500"
                    />
                  </div>

                  {loadingLists ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                    </div>
                  ) : (
                    <>
                      <div className="max-h-[200px] overflow-y-auto space-y-1 rounded-lg border border-gray-800 p-2">
                        {filteredLists.map((list) => (
                          <button
                            key={list.id}
                            onClick={() => handleSelectList(list)}
                            className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                              selectedListId === list.id
                                ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20'
                                : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Database className="w-4 h-4 shrink-0 text-gray-500" />
                              <span className="truncate font-medium">{list.name}</span>
                              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">
                                {list.parent_object || 'records'}
                              </span>
                            </div>
                            <span className="text-xs text-gray-500 shrink-0 ml-2">
                              {list.record_count.toLocaleString()} entries
                            </span>
                          </button>
                        ))}
                        {filteredLists.length === 0 && (
                          <div className="py-6 text-center space-y-2">
                            <p className="text-xs text-gray-500">
                              {lists.length === 0 ? 'No lists found in Attio' : 'No lists match your search'}
                            </p>
                            {lists.length === 0 && (
                              <p className="text-xs text-gray-600 px-2">
                                Create a list in Attio or use "Filter by Attribute" to import records directly.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Filter builder (filter mode) */}
              {sourceMode === 'filter' && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-300">Filter criteria (optional)</label>
                    <button
                      onClick={addFilter}
                      className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                    >
                      <Plus className="w-3 h-3" /> Add filter
                    </button>
                  </div>
                  {filters.length === 0 && (
                    <p className="text-xs text-gray-500 mb-2">No filters -- all {selectedObject} will be imported.</p>
                  )}
                  {loadingAttributes ? (
                    <div className="flex items-center gap-2 py-2">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                      <span className="text-xs text-gray-500">Loading attributes...</span>
                    </div>
                  ) : (
                    filters.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 mb-2">
                        <select
                          value={f.attributeSlug}
                          onChange={(e) => updateFilter(i, { attributeSlug: e.target.value })}
                          className="w-[180px] min-w-0 shrink-0 rounded-lg border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-white outline-none"
                        >
                          <option value="">Attribute...</option>
                          {attributes.map((a) => (
                            <option key={a.id} value={a.api_slug}>{a.title}</option>
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
                        {f.operator !== '$not_empty' && f.operator !== '$is_empty' && (
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
                    ))
                  )}
                </div>
              )}

              {/* Attribute selector (select which attributes to import as columns) */}
              {(sourceMode === 'filter' || sourceMode === 'list') && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-300">Attributes to import as columns</label>
                    {attributes.length > 0 && (
                      <button
                        onClick={toggleAllAttributes}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        {selectedAttributeIds.size === attributes.length ? 'Deselect all' : 'Select all'}
                      </button>
                    )}
                  </div>
                  {loadingAttributes ? (
                    <div className="flex items-center gap-2 py-2">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                      <span className="text-xs text-gray-500">Loading attributes...</span>
                    </div>
                  ) : attributes.length === 0 ? (
                    <p className="text-xs text-gray-500">No attributes found for this object type.</p>
                  ) : (
                    <div className="max-h-[160px] overflow-y-auto rounded-lg border border-gray-800 p-2 space-y-0.5">
                      {attributes.map((attr) => (
                        <label
                          key={attr.id}
                          className="flex items-center gap-2 rounded px-2 py-1.5 text-sm cursor-pointer hover:bg-gray-800/50"
                        >
                          <input
                            type="checkbox"
                            checked={selectedAttributeIds.has(attr.id)}
                            onChange={() => toggleAttribute(attr.id)}
                            className="w-3.5 h-3.5 rounded border-gray-600 text-blue-600 bg-gray-800 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                          />
                          <span className="text-gray-300 truncate">{attr.title}</span>
                          <span className="text-[10px] text-gray-600 shrink-0">{attr.type}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {attributes.length > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      {selectedAttributeIds.size} of {attributes.length} attributes selected
                    </p>
                  )}
                </div>
              )}

              {/* Record limit */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Max records</label>
                <select
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                >
                  <option value={100}>100</option>
                  <option value={500}>500</option>
                  <option value={1000}>1,000</option>
                  <option value={5000}>5,000</option>
                  <option value={10000}>10,000</option>
                </select>
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
                      Imported {importResult.rows_imported.toLocaleString()} records from Attio.
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
                  <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                  <div className="text-center space-y-1">
                    <h3 className="text-sm font-medium text-gray-300">Importing from Attio...</h3>
                    <p className="text-xs text-gray-500">
                      Fetching up to {limit.toLocaleString()} {selectedObject}
                    </p>
                  </div>
                </div>
              ) : (
                // Preview
                <>
                  {/* Preview header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="w-5 h-5 text-blue-400" />
                      <h3 className="text-sm font-semibold text-white">
                        {loadingPreview ? 'Loading preview...' : (
                          previewData
                            ? `Preview (${previewData.records.length} records shown)`
                            : 'Preview'
                        )}
                      </h3>
                    </div>
                  </div>

                  {/* Preview table */}
                  {loadingPreview ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                    </div>
                  ) : previewData && previewData.records.length > 0 ? (
                    <div className="rounded-lg border border-gray-800 overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-900/50">
                            <tr>
                              {previewColumns.map((col) => (
                                <th key={col} className="px-3 py-2 text-left text-xs font-medium text-gray-400 whitespace-nowrap">
                                  {col.replace(/_/g, ' ')}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-800">
                            {previewData.records.map((record) => (
                              <tr key={record.id} className="hover:bg-gray-800/30">
                                {previewColumns.map((col) => (
                                  <td key={col} className="px-3 py-2 text-gray-300 truncate max-w-[160px]">
                                    {extractDisplayValue(record.values[col]) || '--'}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {previewData.totalCount > 5 && (
                        <div className="px-3 py-2 text-xs text-gray-500 bg-gray-900/30 border-t border-gray-800">
                          Showing first 5 of up to {limit.toLocaleString()} records to import
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                      <Database className="w-8 h-8 mb-2 text-gray-700" />
                      <p className="text-sm">No records found matching your criteria</p>
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <AlertCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-blue-300">
                      <p className="font-medium mb-1">Import summary</p>
                      <p className="text-blue-400/80">
                        Importing {selectedAttributeIds.size} attributes from {selectedObject}
                        {sourceMode === 'list' && selectedListId ? ' (filtered by list)' : ''}.
                        Up to {limit.toLocaleString()} records will be created in table "{tableName}".
                        You can add more Attio attribute columns later in the table settings.
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
              className="gap-1 bg-blue-600 hover:bg-blue-500"
            >
              Continue <ArrowRight className="w-4 h-4" />
            </Button>
          )}

          {isConnected && step === 2 && !importResult && !importError && !isImporting && (
            <Button
              onClick={handleImport}
              disabled={!previewData || previewData.records.length === 0}
              className="gap-1 bg-blue-600 hover:bg-blue-500"
            >
              Import {OBJECT_OPTIONS.find((o) => o.value === selectedObject)?.label || 'Records'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
