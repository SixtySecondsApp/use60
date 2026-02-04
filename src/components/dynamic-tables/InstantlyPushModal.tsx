import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { X, Send, AlertCircle, ChevronDown, Eye } from 'lucide-react';

// ---------------------------------------------------------------------------
// Instantly variable options
// ---------------------------------------------------------------------------

const INSTANTLY_VARIABLES = [
  { value: 'skip', label: 'Skip (do not map)' },
  { value: 'email', label: 'Email (required)' },
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'company_name', label: 'Company Name' },
  { value: 'phone', label: 'Phone' },
  { value: 'website', label: 'Website' },
  { value: 'custom1', label: 'Custom 1' },
  { value: 'custom2', label: 'Custom 2' },
  { value: 'custom3', label: 'Custom 3' },
  { value: 'custom4', label: 'Custom 4' },
  { value: 'custom5', label: 'Custom 5' },
] as const;

// ---------------------------------------------------------------------------
// Auto-mapping heuristics: table column key -> Instantly variable
// ---------------------------------------------------------------------------

const AUTO_MAP_RULES: Record<string, string> = {
  email: 'email',
  email_address: 'email',
  work_email: 'email',
  full_name: 'first_name',
  first_name: 'first_name',
  name: 'first_name',
  last_name: 'last_name',
  surname: 'last_name',
  company: 'company_name',
  company_name: 'company_name',
  organization: 'company_name',
  phone: 'phone',
  phone_number: 'phone',
  mobile: 'phone',
  website: 'website',
  linkedin_url: 'website',
  url: 'website',
  title: 'custom1',
  job_title: 'custom1',
  position: 'custom1',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InstantlyPushModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableId: string;
  selectedRowIds: string[];
  columns: Array<{ key: string; label: string; column_type: string }>;
  rows: Array<{ id: string; cells: Record<string, { value: string | null }> }>;
  onPush: (params: {
    campaign_name: string;
    variable_mapping: Record<string, string>;
  }) => void;
  isPushing?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InstantlyPushModal({
  isOpen,
  onClose,
  tableId: _tableId,
  selectedRowIds,
  columns,
  rows,
  onPush,
  isPushing = false,
}: InstantlyPushModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Campaign name defaults to a readable date-stamped name
  const defaultCampaignName = useMemo(() => {
    const date = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return `Campaign - ${date}`;
  }, []);

  const [campaignName, setCampaignName] = useState(defaultCampaignName);
  const [mapping, setMapping] = useState<Record<string, string>>({});

  // Only include rows that are selected
  const selectedRows = useMemo(
    () => rows.filter((r) => selectedRowIds.includes(r.id)),
    [rows, selectedRowIds]
  );

  // Build initial auto-mapping when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setCampaignName(defaultCampaignName);

    const autoMap: Record<string, string> = {};
    for (const col of columns) {
      const key = col.key.toLowerCase();
      if (AUTO_MAP_RULES[key]) {
        autoMap[col.key] = AUTO_MAP_RULES[key];
      } else {
        autoMap[col.key] = 'skip';
      }
    }
    setMapping(autoMap);
  }, [isOpen, columns, defaultCampaignName]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPushing) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isPushing]);

  // Close on backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (isPushing) return;
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose, isPushing]
  );

  const handleMappingChange = useCallback((columnKey: string, instantlyVar: string) => {
    setMapping((prev) => ({ ...prev, [columnKey]: instantlyVar }));
  }, []);

  const handlePush = useCallback(() => {
    // Filter out 'skip' entries
    const filteredMapping: Record<string, string> = {};
    for (const [key, val] of Object.entries(mapping)) {
      if (val && val !== 'skip') {
        filteredMapping[key] = val;
      }
    }
    onPush({ campaign_name: campaignName.trim(), variable_mapping: filteredMapping });
  }, [mapping, campaignName, onPush]);

  // Validation
  const isEmailMapped = useMemo(
    () => Object.values(mapping).includes('email'),
    [mapping]
  );

  const canPush = isEmailMapped && campaignName.trim().length > 0 && !isPushing;

  // Build preview data: first 3 selected rows mapped through current mapping
  const previewRows = useMemo(() => {
    const preview: Array<Record<string, string>> = [];
    const previewSlice = selectedRows.slice(0, 3);

    for (const row of previewSlice) {
      const mapped: Record<string, string> = {};
      for (const [colKey, instantlyVar] of Object.entries(mapping)) {
        if (instantlyVar === 'skip' || !instantlyVar) continue;
        const cellValue = row.cells[colKey]?.value || '';
        if (cellValue) {
          mapped[instantlyVar] = cellValue;
        }
      }
      preview.push(mapped);
    }
    return preview;
  }, [selectedRows, mapping]);

  // Instantly variable labels for preview
  const variableLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const v of INSTANTLY_VARIABLES) {
      map[v.value] = v.label.replace(' (required)', '');
    }
    return map;
  }, []);

  if (!isOpen) return null;

  const leadCount = selectedRowIds.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-gray-700 bg-gray-900 shadow-2xl"
      >
        {/* ----------------------------------------------------------------- */}
        {/* Header                                                            */}
        {/* ----------------------------------------------------------------- */}
        <div className="flex items-center justify-between border-b border-gray-700/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
              <Send className="h-4.5 w-4.5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-100">Push to Instantly</h2>
              <p className="text-sm text-gray-400">
                {leadCount} lead{leadCount !== 1 ? 's' : ''} selected
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isPushing}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200 disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Scrollable body                                                   */}
        {/* ----------------------------------------------------------------- */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-6">
            {/* Campaign name */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">
                Campaign Name
              </label>
              <input
                type="text"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="Enter campaign name..."
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
              />
            </div>

            {/* Variable mapping */}
            <div>
              <label className="mb-3 block text-sm font-medium text-gray-300">
                Variable Mapping
              </label>

              {!isEmailMapped && (
                <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
                  <p className="text-sm text-amber-300">
                    An email mapping is required to push leads to Instantly.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                {/* Header row */}
                <div className="grid grid-cols-2 gap-3 px-1">
                  <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
                    Table Column
                  </span>
                  <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
                    Instantly Variable
                  </span>
                </div>

                {/* Mapping rows */}
                {columns.map((col) => {
                  const currentValue = mapping[col.key] || 'skip';
                  const isMappedToEmail = currentValue === 'email';

                  return (
                    <div
                      key={col.key}
                      className="grid grid-cols-2 items-center gap-3 rounded-lg border border-gray-700/40 bg-gray-800/30 px-3 py-2"
                    >
                      <div className="truncate text-sm text-gray-200" title={col.label}>
                        {col.label}
                        <span className="ml-1.5 text-xs text-gray-500">({col.column_type})</span>
                      </div>
                      <div className="relative">
                        <select
                          value={currentValue}
                          onChange={(e) => handleMappingChange(col.key, e.target.value)}
                          className={`w-full appearance-none rounded-lg border bg-gray-800 py-1.5 pl-3 pr-8 text-sm outline-none transition-colors focus:ring-1 ${
                            isMappedToEmail
                              ? 'border-emerald-500/50 text-emerald-300 focus:border-emerald-500 focus:ring-emerald-500/30'
                              : currentValue === 'skip'
                                ? 'border-gray-700 text-gray-500 focus:border-gray-600 focus:ring-gray-600/30'
                                : 'border-gray-700 text-gray-200 focus:border-gray-600 focus:ring-gray-600/30'
                          }`}
                        >
                          {INSTANTLY_VARIABLES.map((v) => (
                            <option key={v.value} value={v.value}>
                              {v.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Preview section */}
            {previewRows.length > 0 && (
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <Eye className="h-4 w-4 text-gray-400" />
                  <label className="text-sm font-medium text-gray-300">
                    Preview ({Math.min(3, selectedRows.length)} of {selectedRows.length})
                  </label>
                </div>
                <div className="space-y-2">
                  {previewRows.map((row, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-gray-700/40 bg-gray-800/30 px-3 py-2.5"
                    >
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {Object.entries(row).map(([varName, value]) => (
                          <div key={varName} className="text-sm">
                            <span className="text-gray-500">
                              {variableLabelMap[varName] || varName}:
                            </span>{' '}
                            <span className="text-gray-200">{value}</span>
                          </div>
                        ))}
                      </div>
                      {Object.keys(row).length === 0 && (
                        <p className="text-sm italic text-gray-500">No mapped values</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Footer                                                            */}
        {/* ----------------------------------------------------------------- */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-700/60 px-6 py-4">
          <button
            onClick={onClose}
            disabled={isPushing}
            className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-700 hover:text-gray-100 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handlePush}
            disabled={!canPush}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
            {isPushing ? 'Pushing...' : `Push ${leadCount} Lead${leadCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default InstantlyPushModal;
