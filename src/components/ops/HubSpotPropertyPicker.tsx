import React, { useState, useEffect, useMemo } from 'react';
import { Search, Loader2, Hash, Mail, Phone, Calendar, CheckSquare, ListFilter, User, Building2, Check } from 'lucide-react';
import { useHubSpotIntegration } from '@/lib/hooks/useHubSpotIntegration';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HubSpotProperty {
  name: string;
  label: string;
  type: string;
  fieldType: string;
  description: string;
  groupName: string;
}

interface HubSpotPropertyPickerProps {
  onSelect: (property: { name: string; label: string; columnType: string }) => void;
  onSelectMultiple?: (properties: { name: string; label: string; columnType: string }[]) => void;
  excludeProperties?: string[]; // Properties already added as columns
  multiSelect?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Map HubSpot types to our column types
const HUBSPOT_TYPE_MAP: Record<string, string> = {
  string: 'text',
  number: 'number',
  date: 'date',
  datetime: 'date',
  enumeration: 'dropdown',
  bool: 'checkbox',
  phone_number: 'phone',
};

// Property categories for grouping
const PROPERTY_GROUPS: Record<string, { label: string; icon: React.FC<any> }> = {
  contactinformation: { label: 'Contact Info', icon: User },
  companyinformation: { label: 'Company Info', icon: Building2 },
  emailinformation: { label: 'Email Info', icon: Mail },
  sales_properties: { label: 'Sales', icon: Hash },
  dealinformation: { label: 'Deal Info', icon: Hash },
};

// Common/recommended properties to show first
const COMMON_PROPERTIES = [
  'firstname',
  'lastname',
  'company',
  'jobtitle',
  'phone',
  'mobilephone',
  'city',
  'state',
  'country',
  'lifecyclestage',
  'hs_lead_status',
  'industry',
  'annualrevenue',
  'numberofemployees',
  'website',
  'linkedin_url',
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HubSpotPropertyPicker({ onSelect, onSelectMultiple, excludeProperties = [], multiSelect = false }: HubSpotPropertyPickerProps) {
  const { getProperties } = useHubSpotIntegration();
  const [properties, setProperties] = useState<HubSpotProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedProps, setSelectedProps] = useState<Set<string>>(new Set());

  // Load properties on mount
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const props = await getProperties('contacts');
        setProperties(props);
      } catch (e: any) {
        setError(e.message || 'Failed to load properties');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [getProperties]);

  // Filter and group properties
  const { filteredProperties, commonProps, otherProps } = useMemo(() => {
    // Exclude already-added properties and email (which is the key identifier)
    const excluded = new Set([...excludeProperties, 'email']);
    const available = properties.filter((p) => !excluded.has(p.name));

    // Apply search filter
    let filtered = available;
    if (search) {
      const q = search.toLowerCase();
      filtered = available.filter(
        (p) =>
          p.label.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q)
      );
    }

    // Separate common properties from others
    const common = filtered.filter((p) => COMMON_PROPERTIES.includes(p.name));
    const other = filtered.filter((p) => !COMMON_PROPERTIES.includes(p.name));

    // Sort common by their position in COMMON_PROPERTIES
    common.sort((a, b) => {
      const aIdx = COMMON_PROPERTIES.indexOf(a.name);
      const bIdx = COMMON_PROPERTIES.indexOf(b.name);
      return aIdx - bIdx;
    });

    // Sort other alphabetically by label
    other.sort((a, b) => a.label.localeCompare(b.label));

    return {
      filteredProperties: filtered,
      commonProps: common,
      otherProps: other,
    };
  }, [properties, excludeProperties, search]);

  // Get icon for property type
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'phone_number':
        return Phone;
      case 'date':
      case 'datetime':
        return Calendar;
      case 'bool':
        return CheckSquare;
      case 'enumeration':
        return ListFilter;
      default:
        return Hash;
    }
  };

  // Handle property selection
  const handleSelect = (prop: HubSpotProperty) => {
    if (multiSelect) {
      // Toggle selection in multi-select mode
      setSelectedProps((prev) => {
        const next = new Set(prev);
        if (next.has(prop.name)) {
          next.delete(prop.name);
        } else {
          next.add(prop.name);
        }
        return next;
      });
    } else {
      // Single select mode - call onSelect immediately
      onSelect({
        name: prop.name,
        label: prop.label,
        columnType: HUBSPOT_TYPE_MAP[prop.type] || 'text',
      });
    }
  };

  // Handle adding selected properties in multi-select mode
  const handleAddSelected = () => {
    if (!onSelectMultiple || selectedProps.size === 0) return;
    const selected = properties
      .filter((p) => selectedProps.has(p.name))
      .map((p) => ({
        name: p.name,
        label: p.label,
        columnType: HUBSPOT_TYPE_MAP[p.type] || 'text',
      }));
    onSelectMultiple(selected);
    setSelectedProps(new Set());
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
        <span className="ml-2 text-sm text-gray-400">Loading HubSpot properties...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search properties..."
          className="w-full rounded-lg border border-gray-700 bg-gray-800 pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-orange-500"
          autoFocus
        />
      </div>

      {/* Property list */}
      <div className="max-h-[300px] overflow-y-auto space-y-3">
        {/* Common properties */}
        {commonProps.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1 px-1">
              Recommended
            </h4>
            <div className="space-y-0.5">
              {commonProps.map((prop) => {
                const Icon = getTypeIcon(prop.type);
                const isSelected = selectedProps.has(prop.name);
                return (
                  <button
                    key={prop.name}
                    onClick={() => handleSelect(prop)}
                    className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-gray-800 ${
                      isSelected ? 'bg-orange-500/10 text-orange-300 border border-orange-500/30' : 'text-gray-300 hover:text-white'
                    }`}
                  >
                    {multiSelect && (
                      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-orange-500 border-orange-500' : 'border-gray-600'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                    )}
                    <Icon className="w-4 h-4 text-gray-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{prop.label}</div>
                      <div className="truncate text-xs text-gray-500">{prop.name}</div>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400 shrink-0">
                      {prop.type}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Other properties */}
        {otherProps.length > 0 && (
          <div>
            {commonProps.length > 0 && (
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1 px-1">
                All Properties
              </h4>
            )}
            <div className="space-y-0.5">
              {otherProps.map((prop) => {
                const Icon = getTypeIcon(prop.type);
                const isSelected = selectedProps.has(prop.name);
                return (
                  <button
                    key={prop.name}
                    onClick={() => handleSelect(prop)}
                    className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-gray-800 ${
                      isSelected ? 'bg-orange-500/10 text-orange-300 border border-orange-500/30' : 'text-gray-300 hover:text-white'
                    }`}
                  >
                    {multiSelect && (
                      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-orange-500 border-orange-500' : 'border-gray-600'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                    )}
                    <Icon className="w-4 h-4 text-gray-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{prop.label}</div>
                      <div className="truncate text-xs text-gray-500">{prop.name}</div>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400 shrink-0">
                      {prop.type}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {filteredProperties.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500">
              {search ? 'No properties match your search' : 'No properties available'}
            </p>
          </div>
        )}
      </div>

      {/* Add Selected button for multi-select mode */}
      {multiSelect && selectedProps.size > 0 && (
        <div className="pt-3 border-t border-gray-700">
          <button
            onClick={handleAddSelected}
            className="w-full rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-500"
          >
            Add {selectedProps.size} Column{selectedProps.size > 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  );
}
