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
  Columns,
  Eye,
  Link2,
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
}

interface HubSpotProperty {
  name: string;
  label: string;
  type: string;
  fieldType: string;
  description: string;
  groupName: string;
  options: { label: string; value: string }[];
}

interface FieldMapping {
  hubspotProperty: string;
  columnLabel: string;
  columnType: string;
}

interface HubSpotFilter {
  propertyName: string;
  operator: string;
  value: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEPS = [
  { id: 1, label: 'Connect', icon: Link2 },
  { id: 2, label: 'Select', icon: ListFilter },
  { id: 3, label: 'Map Fields', icon: Columns },
  { id: 4, label: 'Import', icon: CheckCircle2 },
] as const;

const OBJECT_TYPES = [
  { value: 'contacts', label: 'Contacts' },
  { value: 'companies', label: 'Companies' },
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

const HUBSPOT_TYPE_MAP: Record<string, string> = {
  string: 'text',
  number: 'number',
  date: 'date',
  datetime: 'date',
  enumeration: 'dropdown',
  bool: 'checkbox',
  phone_number: 'phone',
};

const COMMON_PROPERTIES: Record<string, string[]> = {
  contacts: [
    'email',
    'firstname',
    'lastname',
    'company',
    'jobtitle',
    'phone',
    'lifecyclestage',
    'hs_lead_status',
    'city',
    'state',
    'country',
  ],
  companies: [
    'name',
    'domain',
    'industry',
    'numberofemployees',
    'annualrevenue',
    'city',
    'state',
    'country',
    'phone',
    'description',
  ],
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HubSpotImportWizard({ open, onOpenChange, onComplete }: HubSpotImportWizardProps) {
  const { user } = useUser();
  const { activeOrg } = useOrg();
  const queryClient = useQueryClient();
  const { isConnected, loading: hubspotLoading, connectHubSpot, getProperties } = useHubSpotIntegration();

  // Wizard state
  const [step, setStep] = useState(1);
  const [objectType, setObjectType] = useState<'contacts' | 'companies'>('contacts');
  const [tableName, setTableName] = useState('');
  const [limit, setLimit] = useState(1000);

  // Properties
  const [properties, setProperties] = useState<HubSpotProperty[]>([]);
  const [loadingProperties, setLoadingProperties] = useState(false);
  const [propertySearch, setPropertySearch] = useState('');

  // Filters
  const [filters, setFilters] = useState<HubSpotFilter[]>([]);

  // Field mappings
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);

  // Import state
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ table_id: string; rows_imported: number; columns_created: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Auto-advance to step 2 if connected
  useEffect(() => {
    if (open && isConnected && step === 1) {
      setStep(2);
    }
  }, [open, isConnected, step]);

  // Load properties when object type changes
  useEffect(() => {
    if (!open || !isConnected || step < 2) return;

    setLoadingProperties(true);
    getProperties(objectType as 'contacts')
      .then((props) => {
        setProperties(props);
        // Auto-select common properties as field mappings
        const common = COMMON_PROPERTIES[objectType] ?? [];
        const autoMappings: FieldMapping[] = [];
        for (const propName of common) {
          const prop = props.find((p) => p.name === propName);
          if (prop) {
            autoMappings.push({
              hubspotProperty: prop.name,
              columnLabel: prop.label,
              columnType: HUBSPOT_TYPE_MAP[prop.type] ?? 'text',
            });
          }
        }
        setFieldMappings(autoMappings);
      })
      .catch((e) => toast.error(e.message || 'Failed to load properties'))
      .finally(() => setLoadingProperties(false));
  }, [open, isConnected, objectType, step, getProperties]);

  // Default table name
  useEffect(() => {
    if (!tableName) {
      setTableName(`HubSpot ${objectType === 'contacts' ? 'Contacts' : 'Companies'}`);
    }
  }, [objectType, tableName]);

  const reset = () => {
    setStep(isConnected ? 2 : 1);
    setObjectType('contacts');
    setTableName('');
    setLimit(1000);
    setProperties([]);
    setFilters([]);
    setFieldMappings([]);
    setIsImporting(false);
    setImportResult(null);
    setImportError(null);
    setPropertySearch('');
  };

  const handleClose = () => {
    if (isImporting) return;
    reset();
    onOpenChange(false);
  };

  // Filtered properties for the picker
  const filteredProperties = useMemo(() => {
    if (!propertySearch) return properties;
    const q = propertySearch.toLowerCase();
    return properties.filter(
      (p) =>
        p.label.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q)
    );
  }, [properties, propertySearch]);

  // Check if property is already mapped
  const isMapped = (propName: string) =>
    fieldMappings.some((m) => m.hubspotProperty === propName);

  // Add/remove field mapping
  const toggleMapping = (prop: HubSpotProperty) => {
    if (isMapped(prop.name)) {
      setFieldMappings((prev) => prev.filter((m) => m.hubspotProperty !== prop.name));
    } else {
      setFieldMappings((prev) => [
        ...prev,
        {
          hubspotProperty: prop.name,
          columnLabel: prop.label,
          columnType: HUBSPOT_TYPE_MAP[prop.type] ?? 'text',
        },
      ]);
    }
  };

  // Update mapping label/type
  const updateMapping = (index: number, updates: Partial<FieldMapping>) => {
    setFieldMappings((prev) => prev.map((m, i) => (i === index ? { ...m, ...updates } : m)));
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

  // Import execution
  const handleImport = async () => {
    if (!user?.id || !activeOrg?.id || !tableName.trim() || fieldMappings.length === 0) return;

    setStep(4);
    setIsImporting(true);
    setImportError(null);

    try {
      const validFilters = filters.filter((f) => f.propertyName && f.operator);
      const { data, error } = await supabase.functions.invoke('import-from-hubspot', {
        body: {
          org_id: activeOrg.id,
          user_id: user.id,
          table_name: tableName.trim(),
          object_type: objectType,
          properties: fieldMappings.map((m) => m.hubspotProperty),
          field_mappings: fieldMappings,
          filters: validFilters.length > 0 ? validFilters : undefined,
          limit,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setImportResult(data);
      queryClient.invalidateQueries({ queryKey: ['ops-tables'] });
      toast.success(`Imported ${data.rows_imported} rows from HubSpot`);
    } catch (e: any) {
      setImportError(e?.message || 'Import failed');
      toast.error('HubSpot import failed: ' + (e?.message || 'Unknown error'));
    } finally {
      setIsImporting(false);
    }
  };

  const canProceedFromSelect = tableName.trim().length > 0;
  const canProceedFromMapping = fieldMappings.length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Import from HubSpot</DialogTitle>
          <DialogDescription>Import contacts or companies from HubSpot</DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Import from HubSpot</h2>
          <div className="flex items-center gap-1">
            {STEPS.map((s, i) => (
              <React.Fragment key={s.id}>
                <div className="flex items-center gap-1.5">
                  <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium ${
                    step > s.id
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                      : step === s.id
                        ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
                  }`}>
                    {step > s.id ? <CheckCircle2 className="w-4 h-4" /> : s.id}
                  </div>
                  <span className={`text-xs font-medium hidden sm:inline ${
                    step >= s.id ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'
                  }`}>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-px mx-2 ${
                    step > s.id ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-gray-200 dark:bg-gray-700'
                  }`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Connection check */}
          {step === 1 && (
            <div className="flex flex-col items-center justify-center py-10 space-y-4">
              {hubspotLoading ? (
                <>
                  <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                  <p className="text-sm text-gray-400">Checking HubSpot connection...</p>
                </>
              ) : isConnected ? (
                <>
                  <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                  <p className="text-sm text-gray-300">HubSpot is connected</p>
                  <Button onClick={() => setStep(2)}>Continue</Button>
                </>
              ) : (
                <>
                  <AlertCircle className="w-10 h-10 text-orange-400" />
                  <p className="text-sm text-gray-300">HubSpot is not connected</p>
                  <p className="text-xs text-gray-500 text-center max-w-sm">
                    Connect your HubSpot account to import contacts and companies.
                  </p>
                  <Button onClick={connectHubSpot} className="bg-orange-600 hover:bg-orange-500">
                    Connect HubSpot
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Step 2: Object type, filters, name */}
          {step === 2 && (
            <div className="space-y-5">
              {/* Table name */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">Table name</label>
                <input
                  type="text"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  placeholder="e.g. HubSpot Contacts Q1"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-orange-500"
                />
              </div>

              {/* Object type */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">Object type</label>
                <div className="flex gap-2">
                  {OBJECT_TYPES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => {
                        setObjectType(t.value);
                        setFieldMappings([]);
                        setTableName(`HubSpot ${t.label}`);
                      }}
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                        objectType === t.value
                          ? 'bg-orange-600 text-white'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Record limit */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">Max records</label>
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

              {/* Filters */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-300">Filters (optional)</label>
                  <button
                    onClick={addFilter}
                    className="inline-flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300"
                  >
                    <Plus className="w-3 h-3" /> Add filter
                  </button>
                </div>
                {filters.length === 0 && (
                  <p className="text-xs text-gray-500">No filters — all {objectType} will be imported.</p>
                )}
                {filters.map((f, i) => (
                  <div key={i} className="mb-2 flex items-center gap-2">
                    <select
                      value={f.propertyName}
                      onChange={(e) => updateFilter(i, { propertyName: e.target.value })}
                      className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-white outline-none"
                    >
                      <option value="">Property...</option>
                      {properties.map((p) => (
                        <option key={p.name} value={p.name}>{p.label}</option>
                      ))}
                    </select>
                    <select
                      value={f.operator}
                      onChange={(e) => updateFilter(i, { operator: e.target.value })}
                      className="rounded-lg border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-white outline-none"
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
                        className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-white placeholder-gray-500 outline-none"
                      />
                    )}
                    <button onClick={() => removeFilter(i)} className="text-gray-500 hover:text-red-400">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Field mapping */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-300">
                  Select properties to import ({fieldMappings.length} selected)
                </p>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  value={propertySearch}
                  onChange={(e) => setPropertySearch(e.target.value)}
                  placeholder="Search properties..."
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-orange-500"
                />
              </div>

              {loadingProperties ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                </div>
              ) : (
                <div className="max-h-[320px] overflow-y-auto space-y-1 rounded-lg border border-gray-800 p-2">
                  {filteredProperties.map((prop) => {
                    const mapped = isMapped(prop.name);
                    return (
                      <button
                        key={prop.name}
                        onClick={() => toggleMapping(prop)}
                        className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                          mapped
                            ? 'bg-orange-500/10 text-orange-300 border border-orange-500/20'
                            : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={mapped}
                          readOnly
                          className="w-4 h-4 rounded border-gray-600 text-orange-600 bg-gray-800"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{prop.label}</div>
                          <div className="truncate text-xs text-gray-500">{prop.name} · {prop.type}</div>
                        </div>
                      </button>
                    );
                  })}
                  {filteredProperties.length === 0 && (
                    <p className="py-4 text-center text-xs text-gray-500">No properties found</p>
                  )}
                </div>
              )}

              {/* Mapped fields summary */}
              {fieldMappings.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Column mapping</p>
                  {fieldMappings.map((m, i) => (
                    <div key={m.hubspotProperty} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-32 truncate">{m.hubspotProperty}</span>
                      <span className="text-gray-600">→</span>
                      <input
                        type="text"
                        value={m.columnLabel}
                        onChange={(e) => updateMapping(i, { columnLabel: e.target.value })}
                        className="flex-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-white outline-none"
                      />
                      <select
                        value={m.columnType}
                        onChange={(e) => updateMapping(i, { columnType: e.target.value })}
                        className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-white outline-none"
                      >
                        <option value="text">Text</option>
                        <option value="email">Email</option>
                        <option value="phone">Phone</option>
                        <option value="number">Number</option>
                        <option value="url">URL</option>
                        <option value="date">Date</option>
                        <option value="checkbox">Checkbox</option>
                        <option value="dropdown">Dropdown</option>
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 4: Import progress / result */}
          {step === 4 && (
            <div className="flex flex-col items-center justify-center py-8 space-y-6">
              {importResult ? (
                <>
                  <div className="flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="text-center space-y-1">
                    <h3 className="text-lg font-semibold text-white">Import Complete</h3>
                    <p className="text-sm text-gray-400">
                      Imported {importResult.rows_imported.toLocaleString()} rows with {importResult.columns_created} columns
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
                </>
              ) : importError ? (
                <>
                  <div className="flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30">
                    <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="text-center space-y-1">
                    <h3 className="text-lg font-semibold text-white">Import Failed</h3>
                    <p className="text-sm text-red-400">{importError}</p>
                  </div>
                  <Button onClick={() => { setStep(3); setImportError(null); }} variant="outline">
                    Back to Mapping
                  </Button>
                </>
              ) : (
                <>
                  <Loader2 className="w-10 h-10 text-orange-500 animate-spin" />
                  <div className="text-center space-y-1">
                    <h3 className="text-sm font-medium text-gray-300">Importing from HubSpot...</h3>
                    <p className="text-xs text-gray-500">
                      Fetching up to {limit.toLocaleString()} {objectType} and creating table
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 flex justify-between">
          <Button
            variant="ghost"
            onClick={step <= 2 ? handleClose : () => setStep((s) => Math.max(2, s - 1))}
            disabled={isImporting}
          >
            {step <= 2 ? 'Cancel' : <><ArrowLeft className="w-4 h-4 mr-1" /> Back</>}
          </Button>

          {step === 2 && (
            <Button
              onClick={() => setStep(3)}
              disabled={!canProceedFromSelect}
              className="gap-1 bg-orange-600 hover:bg-orange-500"
            >
              Continue <ArrowRight className="w-4 h-4" />
            </Button>
          )}

          {step === 3 && (
            <Button
              onClick={handleImport}
              disabled={!canProceedFromMapping}
              className="gap-1 bg-orange-600 hover:bg-orange-500"
            >
              Import {objectType === 'contacts' ? 'Contacts' : 'Companies'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
