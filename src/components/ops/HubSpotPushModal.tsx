import React, { useState, useEffect, useMemo } from 'react';
import { X, ArrowRight, AlertCircle, Loader2, Check, List, Plus } from 'lucide-react';
import type { OpsTableColumn, OpsTableRow } from '@/lib/services/opsTableService';

// Common auto-mapping: Ops column key → HubSpot property
const AUTO_MAP: Record<string, string> = {
  email: 'email',
  first_name: 'firstname',
  last_name: 'lastname',
  company_name: 'company',
  company: 'company',
  title: 'jobtitle',
  job_title: 'jobtitle',
  phone: 'phone',
  website: 'website',
  linkedin: 'hs_linkedinbio',
  linkedin_url: 'hs_linkedinbio',
  city: 'city',
  state: 'state',
  country: 'country',
};

interface FieldMapping {
  opsColumnKey: string;
  hubspotProperty: string;
}

export interface HubSpotPushConfig {
  fieldMappings: FieldMapping[];
  duplicateStrategy: 'update' | 'skip' | 'create';
  listId?: string;
  createNewList?: boolean;
  newListName?: string;
}

interface HubSpotListOption {
  listId: string;
  name: string;
}

interface HubSpotPushModalProps {
  isOpen: boolean;
  onClose: () => void;
  columns: OpsTableColumn[];
  selectedRows: OpsTableRow[];
  onPush: (config: HubSpotPushConfig) => void;
  isPushing?: boolean;
  hubspotLists?: HubSpotListOption[];
  isLoadingLists?: boolean;
}

export function HubSpotPushModal({
  isOpen,
  onClose,
  columns,
  selectedRows,
  onPush,
  isPushing,
  hubspotLists = [],
  isLoadingLists = false,
}: HubSpotPushModalProps) {
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [duplicateStrategy, setDuplicateStrategy] = useState<'update' | 'skip' | 'create'>('update');
  const [listAction, setListAction] = useState<'none' | 'existing' | 'new'>('none');
  const [selectedListId, setSelectedListId] = useState('');
  const [newListName, setNewListName] = useState('');

  // Auto-map fields on open
  useEffect(() => {
    if (!isOpen) return;
    const mappings: FieldMapping[] = [];
    for (const col of columns) {
      if (col.column_type === 'enrichment' || col.column_type === 'formula' ||
          col.column_type === 'integration' || col.column_type === 'action') continue;
      const hubspotProp = AUTO_MAP[col.key];
      if (hubspotProp) {
        mappings.push({ opsColumnKey: col.key, hubspotProperty: hubspotProp });
      }
    }
    setFieldMappings(mappings);
    setDuplicateStrategy('update');
    setListAction('none');
    setSelectedListId('');
    setNewListName('');
  }, [isOpen, columns]);

  const unmappedColumns = useMemo(() => {
    const mappedKeys = new Set(fieldMappings.map((m) => m.opsColumnKey));
    return columns.filter(
      (c) => !mappedKeys.has(c.key)
        && c.column_type !== 'enrichment'
        && c.column_type !== 'formula'
        && c.column_type !== 'integration'
        && c.column_type !== 'action'
    );
  }, [columns, fieldMappings]);

  const addMapping = (opsColumnKey: string) => {
    setFieldMappings([...fieldMappings, { opsColumnKey, hubspotProperty: '' }]);
  };

  const updateMapping = (idx: number, hubspotProperty: string) => {
    const updated = [...fieldMappings];
    updated[idx] = { ...updated[idx], hubspotProperty };
    setFieldMappings(updated);
  };

  const removeMapping = (idx: number) => {
    setFieldMappings(fieldMappings.filter((_, i) => i !== idx));
  };

  const validMappings = fieldMappings.filter((m) => m.hubspotProperty.trim().length > 0);
  const hasEmailMapping = validMappings.some((m) => m.hubspotProperty === 'email');

  const handlePush = () => {
    const config: HubSpotPushConfig = {
      fieldMappings: validMappings,
      duplicateStrategy,
    };
    if (listAction === 'existing' && selectedListId) {
      config.listId = selectedListId;
    } else if (listAction === 'new' && newListName.trim()) {
      config.createNewList = true;
      config.newListName = newListName.trim();
    }
    onPush(config);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-xl border border-gray-700 bg-gray-900 shadow-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700/60 px-6 py-4 shrink-0">
          <h2 className="text-lg font-semibold text-gray-100">Push to HubSpot</h2>
          <button
            onClick={onClose}
            disabled={isPushing}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5 space-y-5 flex-1">
          {/* Summary */}
          <div className="rounded-lg border border-gray-700/60 bg-gray-800/30 px-4 py-3">
            <p className="text-sm text-gray-300">
              Pushing <span className="font-semibold text-white">{selectedRows.length}</span> rows to HubSpot as contacts.
            </p>
          </div>

          {/* Field Mappings */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-300">Field Mapping</label>
            <div className="space-y-2">
              {fieldMappings.map((mapping, idx) => {
                const col = columns.find((c) => c.key === mapping.opsColumnKey);
                return (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300">
                      {col?.label ?? mapping.opsColumnKey}
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-500 shrink-0" />
                    <input
                      type="text"
                      value={mapping.hubspotProperty}
                      onChange={(e) => updateMapping(idx, e.target.value)}
                      placeholder="HubSpot property"
                      className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-violet-500"
                    />
                    <button
                      type="button"
                      onClick={() => removeMapping(idx)}
                      className="rounded p-1 text-gray-500 hover:text-red-400"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>

            {unmappedColumns.length > 0 && (
              <div className="mt-2">
                <select
                  value=""
                  onChange={(e) => { if (e.target.value) addMapping(e.target.value); }}
                  className="rounded-lg border border-dashed border-gray-700 bg-transparent px-3 py-2 text-sm text-gray-500 outline-none hover:border-gray-600"
                >
                  <option value="">+ Add field mapping...</option>
                  {unmappedColumns.map((col) => (
                    <option key={col.key} value={col.key}>{col.label}</option>
                  ))}
                </select>
              </div>
            )}

            {!hasEmailMapping && (
              <div className="mt-2 flex items-center gap-2 text-xs text-yellow-400">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Map an email field for duplicate detection to work correctly.
              </div>
            )}
          </div>

          {/* Duplicate Strategy */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-300">Duplicate Handling</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'update' as const, label: 'Update existing', desc: 'Update if email matches' },
                { value: 'skip' as const, label: 'Skip duplicates', desc: 'Skip if already in CRM' },
                { value: 'create' as const, label: 'Always create', desc: 'Create new contacts' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDuplicateStrategy(opt.value)}
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

          {/* Add to HubSpot List */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-300">Add to HubSpot List</label>
            <div className="space-y-2">
              {/* List action radios */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'none' as const, label: 'No list', desc: 'Push contacts only', icon: X },
                  { value: 'existing' as const, label: 'Existing list', desc: 'Add to a list', icon: List },
                  { value: 'new' as const, label: 'New list', desc: 'Create a new list', icon: Plus },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setListAction(opt.value)}
                    className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                      listAction === opt.value
                        ? 'border-orange-500 bg-orange-500/15 text-orange-300'
                        : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <opt.icon className="h-3.5 w-3.5" />
                      {opt.label}
                    </p>
                    <p className="mt-0.5 text-xs opacity-70">{opt.desc}</p>
                  </button>
                ))}
              </div>

              {/* Existing list dropdown */}
              {listAction === 'existing' && (
                <div className="mt-2">
                  {isLoadingLists ? (
                    <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading lists...
                    </div>
                  ) : hubspotLists.length === 0 ? (
                    <p className="text-sm text-gray-500 py-2">No lists found. Create a new one instead.</p>
                  ) : (
                    <select
                      value={selectedListId}
                      onChange={(e) => setSelectedListId(e.target.value)}
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 outline-none focus:border-orange-500"
                    >
                      <option value="">Select a list...</option>
                      {hubspotLists.map((list) => (
                        <option key={list.listId} value={list.listId}>{list.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* New list name input */}
              {listAction === 'new' && (
                <div className="mt-2">
                  <input
                    type="text"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    placeholder="Enter list name..."
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-orange-500"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Preview */}
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">Preview (first 3 rows)</p>
            <div className="rounded-lg border border-gray-700/60 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-700/60 bg-gray-800/50">
                    {validMappings.slice(0, 4).map((m) => (
                      <th key={m.hubspotProperty} className="px-3 py-2 text-left font-medium text-gray-400">
                        {m.hubspotProperty}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedRows.slice(0, 3).map((row) => (
                    <tr key={row.id} className="border-b border-gray-800/50">
                      {validMappings.slice(0, 4).map((m) => (
                        <td key={m.hubspotProperty} className="px-3 py-2 text-gray-300 truncate max-w-[150px]">
                          {row.cells[m.opsColumnKey]?.value ?? '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-700/60 px-6 py-4 shrink-0">
          <button
            onClick={onClose}
            disabled={isPushing}
            className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handlePush}
            disabled={isPushing || validMappings.length === 0}
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40 flex items-center gap-2"
          >
            {isPushing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Push {selectedRows.length} to HubSpot
          </button>
        </div>
      </div>
    </div>
  );
}

export default HubSpotPushModal;
