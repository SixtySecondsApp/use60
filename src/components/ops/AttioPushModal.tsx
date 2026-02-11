import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  AlertCircle,
  Loader2,
  Check,
  X,
  List,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useAttioIntegration } from '@/lib/hooks/useAttioIntegration';
import { toast } from 'sonner';
import type { OpsTableRow } from '@/lib/services/opsTableService';

// ---------------------------------------------------------------------------
// Auto-mapping: Ops column key -> Attio attribute slug (per object type)
// ---------------------------------------------------------------------------

type AttioObjectType = 'people' | 'companies' | 'deals';

const AUTO_MAP_PEOPLE: Record<string, string> = {
  email: 'email_addresses',
  email_address: 'email_addresses',
  first_name: 'first_name',
  last_name: 'last_name',
  company: 'company',
  company_name: 'company',
  phone: 'phone_numbers',
  phone_number: 'phone_numbers',
  title: 'job_title',
  job_title: 'job_title',
  linkedin: 'linkedin',
  linkedin_url: 'linkedin',
  city: 'primary_location',
  description: 'description',
};

const AUTO_MAP_COMPANIES: Record<string, string> = {
  company: 'name',
  company_name: 'name',
  name: 'name',
  website: 'domains',
  domain: 'domains',
  phone: 'phone_numbers',
  phone_number: 'phone_numbers',
  email: 'primary_email_address',
  email_address: 'primary_email_address',
  city: 'primary_location',
  description: 'description',
};

const AUTO_MAP_DEALS: Record<string, string> = {
  deal_name: 'name',
  name: 'name',
  amount: 'value',
  value: 'value',
  stage: 'stage',
};

const AUTO_MAP_BY_OBJECT: Record<AttioObjectType, Record<string, string>> = {
  people: AUTO_MAP_PEOPLE,
  companies: AUTO_MAP_COMPANIES,
  deals: AUTO_MAP_DEALS,
};

// Default matching attributes per object type
const DEFAULT_MATCHING: Record<AttioObjectType, string> = {
  people: 'email_addresses',
  companies: 'domains',
  deals: 'name',
};

// Field types that need special Attio value formatting (sent as field_type_map)
const ATTIO_FIELD_TYPES: Record<string, string> = {
  email_addresses: 'email',
  primary_email_address: 'email',
  phone_numbers: 'phone',
  domains: 'domain',
  primary_location: 'location',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FieldMapping {
  opsColumnKey: string;
  attioAttribute: string;
}

interface AttioAttribute {
  id: string;
  title: string;
  api_slug: string;
  type: string;
  is_required: boolean;
  is_writable: boolean;
}

interface AttioListOption {
  id: string;
  name: string;
  api_slug: string;
  parent_object: string;
  record_count: number;
  created_at: string;
}

interface PushResult {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Props — new standardised interface
// ---------------------------------------------------------------------------

interface AttioPushModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableId: string;
  columns: Array<{ id: string; name: string; key: string }>;
  rows: OpsTableRow[];
  selectedRowIds?: string[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AttioPushModal({
  open,
  onOpenChange,
  tableId,
  columns,
  rows,
  selectedRowIds,
}: AttioPushModalProps) {
  const { activeOrgId } = useOrg();
  const { isConnected, getAttributes, getLists } = useAttioIntegration();

  // Core state
  const [objectType, setObjectType] = useState<AttioObjectType>('people');
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [matchingAttribute, setMatchingAttribute] = useState<string>(DEFAULT_MATCHING.people);
  const [duplicateStrategy, setDuplicateStrategy] = useState<'update' | 'skip' | 'create'>('update');
  const [listAction, setListAction] = useState<'none' | 'existing'>('none');
  const [selectedListId, setSelectedListId] = useState('');

  // Async data
  const [attributes, setAttributes] = useState<AttioAttribute[]>([]);
  const [loadingAttributes, setLoadingAttributes] = useState(false);
  const [lists, setLists] = useState<AttioListOption[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);

  // Push state
  const [isPushing, setIsPushing] = useState(false);
  const [pushResult, setPushResult] = useState<PushResult | null>(null);

  // Determine rows to push
  const targetRows = useMemo(() => {
    if (selectedRowIds && selectedRowIds.length > 0) {
      const idSet = new Set(selectedRowIds);
      return rows.filter((r) => idSet.has(r.id));
    }
    return rows;
  }, [rows, selectedRowIds]);

  // ── Fetch Attio attributes for the selected object type ──────────────────

  const fetchAttributes = useCallback(async () => {
    if (!open || !isConnected) return;
    setLoadingAttributes(true);
    try {
      const attrs = await getAttributes(objectType);
      setAttributes(attrs);
    } catch (err: any) {
      console.error('[AttioPushModal] Failed to fetch attributes:', err);
      toast.error(`Failed to load Attio ${objectType} attributes`);
      setAttributes([]);
    } finally {
      setLoadingAttributes(false);
    }
  }, [objectType, open, isConnected, getAttributes]);

  useEffect(() => {
    if (open) fetchAttributes();
  }, [open, objectType, fetchAttributes]);

  // ── Fetch Attio lists once on open ───────────────────────────────────────

  const fetchLists = useCallback(async () => {
    if (!open || !isConnected) return;
    setLoadingLists(true);
    try {
      const fetched = await getLists();
      setLists(fetched);
    } catch (err: any) {
      console.error('[AttioPushModal] Failed to fetch lists:', err);
      setLists([]);
    } finally {
      setLoadingLists(false);
    }
  }, [open, isConnected, getLists]);

  useEffect(() => {
    if (open) fetchLists();
  }, [open, fetchLists]);

  // ── Auto-map fields when object type / columns change ────────────────────

  useEffect(() => {
    if (!open) return;
    const autoMap = AUTO_MAP_BY_OBJECT[objectType];
    const mappings: FieldMapping[] = [];
    for (const col of columns) {
      const attioAttr = autoMap[col.key];
      if (attioAttr) {
        mappings.push({ opsColumnKey: col.key, attioAttribute: attioAttr });
      }
    }
    setFieldMappings(mappings);
    setMatchingAttribute(DEFAULT_MATCHING[objectType]);
    setPushResult(null);
  }, [open, objectType, columns]);

  // ── Reset transient state when modal closes ──────────────────────────────

  useEffect(() => {
    if (!open) {
      setDuplicateStrategy('update');
      setListAction('none');
      setSelectedListId('');
      setPushResult(null);
    }
  }, [open]);

  // ── Derived data ─────────────────────────────────────────────────────────

  const writableAttributes = useMemo(
    () => attributes.filter((a) => a.is_writable),
    [attributes],
  );

  const unmappedColumns = useMemo(() => {
    const mappedKeys = new Set(fieldMappings.map((m) => m.opsColumnKey));
    return columns.filter((c) => !mappedKeys.has(c.key));
  }, [columns, fieldMappings]);

  const validMappings = useMemo(
    () => fieldMappings.filter((m) => m.attioAttribute.trim().length > 0),
    [fieldMappings],
  );

  const hasMatchingFieldMapped = useMemo(
    () => validMappings.some((m) => m.attioAttribute === matchingAttribute),
    [validMappings, matchingAttribute],
  );

  const filteredLists = useMemo(
    () => lists.filter((l) => l.parent_object === objectType),
    [lists, objectType],
  );

  // ── Mapping helpers ──────────────────────────────────────────────────────

  const addMapping = (opsColumnKey: string) => {
    setFieldMappings((prev) => [...prev, { opsColumnKey, attioAttribute: '' }]);
  };

  const updateMapping = (idx: number, attioAttribute: string) => {
    setFieldMappings((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], attioAttribute };
      return updated;
    });
  };

  const removeMapping = (idx: number) => {
    setFieldMappings((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Push handler ─────────────────────────────────────────────────────────

  const handlePush = async () => {
    if (!activeOrgId) {
      toast.error('No active organization');
      return;
    }
    if (validMappings.length === 0) {
      toast.error('Map at least one field before pushing');
      return;
    }

    setIsPushing(true);
    setPushResult(null);

    try {
      // Build field_mapping as { column_id: attio_attribute }
      const fieldMapping: Record<string, string> = {};
      const fieldTypeMap: Record<string, string> = {};

      for (const m of validMappings) {
        const col = columns.find((c) => c.key === m.opsColumnKey);
        if (col) {
          fieldMapping[col.id] = m.attioAttribute;
          const attrType = ATTIO_FIELD_TYPES[m.attioAttribute];
          if (attrType) {
            fieldTypeMap[m.attioAttribute] = attrType;
          }
        }
      }

      const body: Record<string, any> = {
        org_id: activeOrgId,
        table_id: tableId,
        object: objectType,
        field_mapping: fieldMapping,
        field_type_map: Object.keys(fieldTypeMap).length > 0 ? fieldTypeMap : undefined,
        matching_attribute: matchingAttribute || undefined,
        duplicate_strategy: duplicateStrategy,
      };

      // Send specific row ids
      if (selectedRowIds && selectedRowIds.length > 0) {
        body.row_ids = selectedRowIds;
      }

      if (listAction === 'existing' && selectedListId) {
        body.list_id = selectedListId;
      }

      const { data, error } = await supabase.functions.invoke('push-to-attio', {
        body,
      });

      if (error) {
        throw new Error(error.message || 'Push to Attio failed');
      }
      if (!data?.success) {
        throw new Error(data?.error || 'Push to Attio failed');
      }

      const result: PushResult = {
        created: data.created ?? 0,
        updated: data.updated ?? 0,
        skipped: data.skipped ?? 0,
        failed: data.failed ?? 0,
        total: data.total ?? 0,
      };
      setPushResult(result);

      const summary = [
        result.created && `${result.created} created`,
        result.updated && `${result.updated} updated`,
        result.skipped && `${result.skipped} skipped`,
        result.failed && `${result.failed} failed`,
      ]
        .filter(Boolean)
        .join(', ');

      if (result.failed > 0) {
        toast.warning(`Push complete with errors: ${summary}`);
      } else {
        toast.success(`Push complete: ${summary}`);
      }
    } catch (err: any) {
      console.error('[AttioPushModal] Push failed:', err);
      toast.error(err.message || 'Failed to push to Attio');
    } finally {
      setIsPushing(false);
    }
  };

  // ── Render: not connected ────────────────────────────────────────────────

  if (!isConnected) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md dark:bg-gray-900 dark:border-gray-700/50">
          <DialogHeader>
            <DialogTitle>Push to Attio</DialogTitle>
            <DialogDescription>Connect your Attio workspace first.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
            <AlertCircle className="h-5 w-5 shrink-0 text-yellow-400" />
            <p className="text-sm text-yellow-300">
              Attio is not connected. Go to Integrations settings to connect your workspace.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Render: main modal ───────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col dark:bg-gray-900 dark:border-gray-700/50">
        <DialogHeader>
          <DialogTitle>Push to Attio</DialogTitle>
          <DialogDescription>
            Map your Ops table columns to Attio attributes and push{' '}
            <span className="font-semibold text-gray-100">{targetRows.length}</span> rows.
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 space-y-5 pr-1">
          {pushResult ? (
            /* ── Results summary ─────────────────────────────────────── */
            <div className="flex flex-col items-center justify-center space-y-4 py-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-900/30">
                <Check className="h-7 w-7 text-emerald-400" />
              </div>
              <h3 className="text-lg font-semibold text-white">Push Complete</h3>
              <div className="grid w-full max-w-md grid-cols-4 gap-3">
                {[
                  { label: 'Created', value: pushResult.created, color: 'text-emerald-400' },
                  { label: 'Updated', value: pushResult.updated, color: 'text-blue-400' },
                  { label: 'Skipped', value: pushResult.skipped, color: 'text-gray-400' },
                  { label: 'Failed', value: pushResult.failed, color: 'text-red-400' },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-lg border border-gray-700 bg-gray-800/50 p-3 text-center"
                  >
                    <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
                    <p className="text-xs text-gray-500">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* ── Summary ──────────────────────────────────────────── */}
              <div className="rounded-lg border border-gray-700/60 bg-gray-800/30 px-4 py-3">
                <p className="text-sm text-gray-300">
                  Pushing{' '}
                  <span className="font-semibold text-white">{targetRows.length}</span>{' '}
                  rows to Attio.
                </p>
              </div>

              {/* ── Object type selector ─────────────────────────────── */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Attio Object Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { value: 'people', label: 'People', desc: 'Contacts / leads' },
                      { value: 'companies', label: 'Companies', desc: 'Organizations' },
                      { value: 'deals', label: 'Deals', desc: 'Opportunities' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setObjectType(opt.value)}
                      disabled={isPushing}
                      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                        objectType === opt.value
                          ? 'border-blue-500 bg-blue-500/15 text-blue-300'
                          : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="mt-0.5 text-xs opacity-70">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Field mappings ────────────────────────────────────── */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-300">Field Mapping</label>
                  {loadingAttributes && (
                    <span className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading attributes...
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {fieldMappings.map((mapping, idx) => {
                    const col = columns.find((c) => c.key === mapping.opsColumnKey);
                    return (
                      <div key={idx} className="flex items-center gap-2">
                        {/* Source column (read-only) */}
                        <div className="flex-1 truncate rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300">
                          {col?.name ?? mapping.opsColumnKey}
                        </div>
                        <ArrowRight className="h-4 w-4 shrink-0 text-gray-500" />
                        {/* Target attribute — dropdown when attributes loaded, free text otherwise */}
                        {writableAttributes.length > 0 ? (
                          <select
                            value={mapping.attioAttribute}
                            onChange={(e) => updateMapping(idx, e.target.value)}
                            disabled={isPushing}
                            className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 outline-none focus:border-blue-500"
                          >
                            <option value="">Select attribute...</option>
                            {writableAttributes.map((attr) => (
                              <option key={attr.api_slug} value={attr.api_slug}>
                                {attr.title} ({attr.api_slug})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={mapping.attioAttribute}
                            onChange={(e) => updateMapping(idx, e.target.value)}
                            placeholder="Attio attribute slug"
                            disabled={isPushing}
                            className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-blue-500"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => removeMapping(idx)}
                          disabled={isPushing}
                          className="rounded p-1 text-gray-500 hover:text-red-400"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Add unmapped column */}
                {unmappedColumns.length > 0 && (
                  <div className="mt-2">
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) addMapping(e.target.value);
                      }}
                      disabled={isPushing}
                      className="rounded-lg border border-dashed border-gray-700 bg-transparent px-3 py-2 text-sm text-gray-500 outline-none hover:border-gray-600"
                    >
                      <option value="">+ Add field mapping...</option>
                      {unmappedColumns.map((col) => (
                        <option key={col.key} value={col.key}>
                          {col.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Warning if matching field not mapped */}
                {!hasMatchingFieldMapped && matchingAttribute && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-yellow-400">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    Map a field to &ldquo;{matchingAttribute}&rdquo; for duplicate detection to
                    work correctly.
                  </div>
                )}
              </div>

              {/* ── Matching attribute ────────────────────────────────── */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Matching Attribute (for dedup)
                </label>
                {attributes.length > 0 ? (
                  <select
                    value={matchingAttribute}
                    onChange={(e) => setMatchingAttribute(e.target.value)}
                    disabled={isPushing}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 outline-none focus:border-blue-500"
                  >
                    <option value="">None (always create new)</option>
                    {attributes.map((attr) => (
                      <option key={attr.api_slug} value={attr.api_slug}>
                        {attr.title} ({attr.api_slug})
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <input
                      type="text"
                      value={matchingAttribute}
                      onChange={(e) => setMatchingAttribute(e.target.value)}
                      placeholder="e.g. email_addresses"
                      disabled={isPushing}
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-blue-500"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Common: email_addresses (people), domains (companies), name (deals)
                    </p>
                  </>
                )}
              </div>

              {/* ── Duplicate strategy ────────────────────────────────── */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Duplicate Handling
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      {
                        value: 'update' as const,
                        label: 'Update existing',
                        desc: 'Assert / upsert by matching attribute',
                      },
                      {
                        value: 'skip' as const,
                        label: 'Skip duplicates',
                        desc: 'Skip if already pushed',
                      },
                      {
                        value: 'create' as const,
                        label: 'Always create',
                        desc: 'Create new records',
                      },
                    ]
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDuplicateStrategy(opt.value)}
                      disabled={isPushing}
                      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                        duplicateStrategy === opt.value
                          ? 'border-violet-500 bg-violet-500/15 text-violet-300'
                          : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="mt-0.5 text-xs opacity-70">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Optional list ─────────────────────────────────────── */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Add to Attio List (optional)
                </label>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        {
                          value: 'none' as const,
                          label: 'No list',
                          desc: 'Push records only',
                          icon: X,
                        },
                        {
                          value: 'existing' as const,
                          label: 'Existing list',
                          desc: 'Add to an Attio list',
                          icon: List,
                        },
                      ]
                    ).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setListAction(opt.value)}
                        disabled={isPushing}
                        className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                          listAction === opt.value
                            ? 'border-orange-500 bg-orange-500/15 text-orange-300'
                            : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'
                        }`}
                      >
                        <p className="flex items-center gap-1.5 text-sm font-medium">
                          <opt.icon className="h-3.5 w-3.5" />
                          {opt.label}
                        </p>
                        <p className="mt-0.5 text-xs opacity-70">{opt.desc}</p>
                      </button>
                    ))}
                  </div>

                  {listAction === 'existing' && (
                    <div className="mt-2">
                      {loadingLists ? (
                        <div className="flex items-center gap-2 py-2 text-sm text-gray-400">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading lists...
                        </div>
                      ) : filteredLists.length === 0 ? (
                        <p className="py-2 text-sm text-gray-500">
                          No lists found for {objectType}. Create a list in Attio first.
                        </p>
                      ) : (
                        <select
                          value={selectedListId}
                          onChange={(e) => setSelectedListId(e.target.value)}
                          disabled={isPushing}
                          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 outline-none focus:border-orange-500"
                        >
                          <option value="">Select a list...</option>
                          {filteredLists.map((list) => (
                            <option key={list.id} value={list.id}>
                              {list.name} ({list.record_count} records)
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Preview ───────────────────────────────────────────── */}
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">
                  Preview (first 3 rows)
                </p>
                <div className="overflow-hidden rounded-lg border border-gray-700/60">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-700/60 bg-gray-800/50">
                        {validMappings.slice(0, 4).map((m) => (
                          <th
                            key={m.attioAttribute}
                            className="px-3 py-2 text-left font-medium text-gray-400"
                          >
                            {m.attioAttribute}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {targetRows.slice(0, 3).map((row) => (
                        <tr key={row.id} className="border-b border-gray-800/50">
                          {validMappings.slice(0, 4).map((m) => (
                            <td
                              key={m.attioAttribute}
                              className="max-w-[150px] truncate px-3 py-2 text-gray-300"
                            >
                              {row.cells[m.opsColumnKey]?.value ?? '\u2014'}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {targetRows.length === 0 && (
                        <tr>
                          <td
                            colSpan={Math.max(validMappings.slice(0, 4).length, 1)}
                            className="px-3 py-4 text-center text-gray-500"
                          >
                            No rows to push
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <DialogFooter className="mt-4 gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPushing}
          >
            {pushResult ? 'Done' : 'Cancel'}
          </Button>
          {!pushResult && (
            <Button
              onClick={handlePush}
              disabled={isPushing || validMappings.length === 0 || targetRows.length === 0}
              className="gap-2"
            >
              {isPushing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Push {targetRows.length} to Attio
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AttioPushModal;
