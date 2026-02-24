import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronDown } from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SENIORITY_OPTIONS = [
  'owner', 'founder', 'c_suite', 'partner', 'vp',
  'head', 'director', 'manager', 'senior', 'entry',
];

export const SENIORITY_LABELS: Record<string, string> = {
  owner: 'Owner',
  founder: 'Founder',
  c_suite: 'C-Suite',
  partner: 'Partner',
  vp: 'VP',
  head: 'Head',
  director: 'Director',
  manager: 'Manager',
  senior: 'Senior',
  entry: 'Entry',
};

export const DEPARTMENT_OPTIONS = [
  'engineering_technical', 'sales', 'marketing', 'finance',
  'operations', 'human_resources', 'support', 'legal',
  'product_management', 'data_science', 'consulting',
  'education', 'media_communications',
];

export const DEPARTMENT_LABELS: Record<string, string> = {
  engineering_technical: 'Engineering',
  sales: 'Sales',
  marketing: 'Marketing',
  finance: 'Finance',
  operations: 'Operations',
  human_resources: 'Human Resources',
  support: 'Support',
  legal: 'Legal',
  product_management: 'Product Management',
  data_science: 'Data Science',
  consulting: 'Consulting',
  education: 'Education',
  media_communications: 'Media & Communications',
};

export const EMPLOYEE_RANGES = [
  { value: '1,10', label: '1–10' },
  { value: '11,20', label: '11–20' },
  { value: '21,50', label: '21–50' },
  { value: '51,100', label: '51–100' },
  { value: '101,200', label: '101–200' },
  { value: '201,500', label: '201–500' },
  { value: '501,1000', label: '501–1K' },
  { value: '1001,5000', label: '1K–5K' },
  { value: '5001,10000', label: '5K–10K' },
  { value: '10001,', label: '10K+' },
];

export const FUNDING_OPTIONS = [
  { value: 'seed', label: 'Seed' },
  { value: 'angel', label: 'Angel' },
  { value: 'venture', label: 'Venture' },
  { value: 'series_a', label: 'Series A' },
  { value: 'series_b', label: 'Series B' },
  { value: 'series_c', label: 'Series C' },
  { value: 'series_d', label: 'Series D' },
  { value: 'series_e', label: 'Series E+' },
  { value: 'ipo', label: 'IPO' },
  { value: 'private_equity', label: 'Private Equity' },
];

export const APOLLO_LOCATIONS = [
  // Countries
  'United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'France',
  'Netherlands', 'Ireland', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Switzerland',
  'Austria', 'Belgium', 'Spain', 'Italy', 'Portugal', 'Poland', 'Czech Republic',
  'India', 'Singapore', 'Japan', 'South Korea', 'China', 'Hong Kong', 'Taiwan',
  'Israel', 'United Arab Emirates', 'Saudi Arabia', 'Brazil', 'Mexico', 'Argentina',
  'Colombia', 'Chile', 'South Africa', 'Nigeria', 'Kenya', 'New Zealand', 'Philippines',
  'Thailand', 'Vietnam', 'Indonesia', 'Malaysia', 'Romania', 'Hungary', 'Estonia',
  // US cities/states
  'New York, New York, United States', 'San Francisco, California, United States',
  'Los Angeles, California, United States', 'Chicago, Illinois, United States',
  'Boston, Massachusetts, United States', 'Seattle, Washington, United States',
  'Austin, Texas, United States', 'Denver, Colorado, United States',
  'Miami, Florida, United States', 'Atlanta, Georgia, United States',
  'Dallas, Texas, United States', 'Houston, Texas, United States',
  'San Diego, California, United States', 'Portland, Oregon, United States',
  'Nashville, Tennessee, United States', 'Phoenix, Arizona, United States',
  'Salt Lake City, Utah, United States', 'Raleigh, North Carolina, United States',
  'California, United States', 'Texas, United States', 'New York, United States',
  'Florida, United States', 'Massachusetts, United States', 'Washington, United States',
  'Colorado, United States', 'Illinois, United States', 'Georgia, United States',
  // UK cities
  'London, England, United Kingdom', 'Manchester, England, United Kingdom',
  'Birmingham, England, United Kingdom', 'Bristol, England, United Kingdom',
  'Leeds, England, United Kingdom', 'Liverpool, England, United Kingdom',
  'Edinburgh, Scotland, United Kingdom', 'Glasgow, Scotland, United Kingdom',
  'Cardiff, Wales, United Kingdom', 'Belfast, Northern Ireland, United Kingdom',
  'Cambridge, England, United Kingdom', 'Oxford, England, United Kingdom',
  'Brighton, England, United Kingdom', 'Newcastle, England, United Kingdom',
  'Nottingham, England, United Kingdom', 'Sheffield, England, United Kingdom',
  'Bath, England, United Kingdom', 'Reading, England, United Kingdom',
  'England, United Kingdom', 'Scotland, United Kingdom', 'Wales, United Kingdom',
  // Canada cities
  'Toronto, Ontario, Canada', 'Vancouver, British Columbia, Canada',
  'Montreal, Quebec, Canada', 'Calgary, Alberta, Canada', 'Ottawa, Ontario, Canada',
  // Europe cities
  'Berlin, Germany', 'Munich, Germany', 'Hamburg, Germany', 'Frankfurt, Germany',
  'Paris, France', 'Lyon, France', 'Amsterdam, Netherlands', 'Rotterdam, Netherlands',
  'Dublin, Ireland', 'Stockholm, Sweden', 'Copenhagen, Denmark', 'Oslo, Norway',
  'Helsinki, Finland', 'Zurich, Switzerland', 'Geneva, Switzerland',
  'Barcelona, Spain', 'Madrid, Spain', 'Milan, Italy', 'Rome, Italy',
  'Lisbon, Portugal', 'Warsaw, Poland', 'Prague, Czech Republic',
  'Vienna, Austria', 'Brussels, Belgium', 'Tallinn, Estonia', 'Bucharest, Romania',
  // APAC cities
  'Sydney, New South Wales, Australia', 'Melbourne, Victoria, Australia',
  'Singapore', 'Tokyo, Japan', 'Seoul, South Korea', 'Shanghai, China',
  'Beijing, China', 'Shenzhen, China', 'Bangalore, India', 'Mumbai, India',
  'Delhi, India', 'Hyderabad, India', 'Tel Aviv, Israel',
  'Dubai, United Arab Emirates', 'Auckland, New Zealand',
];

// ---------------------------------------------------------------------------
// Multi-select chip component
// ---------------------------------------------------------------------------

export function ChipSelect({
  label,
  options,
  labels,
  selected,
  onChange,
}: {
  label: string;
  options: string[] | { value: string; label: string }[];
  labels?: Record<string, string>;
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const normalizedOptions = options.map((o) =>
    typeof o === 'string' ? { value: o, label: labels?.[o] ?? o } : o
  );
  const visibleOptions = expanded ? normalizedOptions : normalizedOptions.slice(0, 8);

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((s) => s !== value)
        : [...selected, value]
    );
  };

  return (
    <div>
      <label className="block text-xs font-medium text-zinc-400 mb-1.5">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {visibleOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
              selected.includes(opt.value)
                ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600 hover:text-zinc-300'
            }`}
          >
            {opt.label}
          </button>
        ))}
        {normalizedOptions.length > 8 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="px-2 py-1 text-xs text-zinc-500 hover:text-zinc-300"
          >
            {expanded ? 'Show less' : `+${normalizedOptions.length - 8} more`}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tag input (comma-separated)
// ---------------------------------------------------------------------------

export function TagInput({
  label,
  placeholder,
  values,
  onChange,
}: {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const v = inputValue.trim().replace(/,/g, '');
      if (v && !values.includes(v)) {
        onChange([...values, v]);
      }
      setInputValue('');
    }
    if (e.key === 'Backspace' && !inputValue && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div>
      <label className="block text-xs font-medium text-zinc-400 mb-1.5">{label}</label>
      <div className="flex flex-wrap items-center gap-1.5 min-h-[36px] rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded bg-blue-500/20 px-2 py-0.5 text-xs text-blue-300 border border-blue-500/30"
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="text-blue-400 hover:text-blue-200"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={values.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[80px] bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Location tag input with searchable dropdown
// ---------------------------------------------------------------------------

export function LocationTagInput({
  values,
  onChange,
}: {
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [inputValue, setInputValue] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showDropdown) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showDropdown]);

  const filteredLocations = inputValue.trim()
    ? APOLLO_LOCATIONS.filter(
        (loc) =>
          loc.toLowerCase().includes(inputValue.toLowerCase()) &&
          !values.includes(loc)
      ).slice(0, 8)
    : [];

  const addLocation = (loc: string) => {
    if (!values.includes(loc)) {
      onChange([...values, loc]);
    }
    setInputValue('');
    setShowDropdown(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredLocations.length > 0) {
        addLocation(filteredLocations[0]);
      } else if (inputValue.trim()) {
        addLocation(inputValue.trim());
      }
    }
    if (e.key === 'Backspace' && !inputValue && values.length > 0) {
      onChange(values.slice(0, -1));
    }
    if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  return (
    <div ref={containerRef}>
      <label className="block text-xs font-medium text-zinc-400 mb-1.5">Locations</label>
      <div className="relative">
        <div className="flex flex-wrap items-center gap-1.5 min-h-[36px] rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded bg-blue-500/20 px-2 py-0.5 text-xs text-blue-300 border border-blue-500/30"
            >
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="text-blue-400 hover:text-blue-200"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => { if (inputValue.trim()) setShowDropdown(true); }}
            onKeyDown={handleKeyDown}
            placeholder={values.length === 0 ? 'Search locations, e.g. Bristol...' : ''}
            className="flex-1 min-w-[120px] bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
          />
        </div>

        {/* Dropdown */}
        {showDropdown && filteredLocations.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl overflow-hidden max-h-[200px] overflow-y-auto">
            {filteredLocations.map((loc) => {
              const idx = loc.toLowerCase().indexOf(inputValue.toLowerCase());
              return (
                <button
                  key={loc}
                  type="button"
                  onClick={() => addLocation(loc)}
                  className="w-full px-3 py-2 text-left text-xs text-zinc-300 hover:bg-zinc-700/50 transition-colors flex items-center"
                >
                  {idx >= 0 ? (
                    <>
                      <span className="text-zinc-500">{loc.slice(0, idx)}</span>
                      <span className="text-white font-medium">{loc.slice(idx, idx + inputValue.length)}</span>
                      <span className="text-zinc-500">{loc.slice(idx + inputValue.length)}</span>
                    </>
                  ) : (
                    loc
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ApolloFilterEditor — reusable filter form
// ---------------------------------------------------------------------------

export interface ApolloFilterEditorProps {
  titles: string[];
  onTitlesChange: (v: string[]) => void;
  locations: string[];
  onLocationsChange: (v: string[]) => void;
  keywords: string;
  onKeywordsChange: (v: string) => void;
  seniorities: string[];
  onSenioritiesChange: (v: string[]) => void;
  departments: string[];
  onDepartmentsChange: (v: string[]) => void;
  employeeRanges: string[];
  onEmployeeRangesChange: (v: string[]) => void;
  fundingStages: string[];
  onFundingStagesChange: (v: string[]) => void;
  domains: string[];
  onDomainsChange: (v: string[]) => void;
  emailStatusVerified: boolean;
  onEmailStatusChange: (v: boolean) => void;
  showAdvancedDefault?: boolean;
}

export function ApolloFilterEditor({
  titles,
  onTitlesChange,
  locations,
  onLocationsChange,
  keywords,
  onKeywordsChange,
  seniorities,
  onSenioritiesChange,
  departments,
  onDepartmentsChange,
  employeeRanges,
  onEmployeeRangesChange,
  fundingStages,
  onFundingStagesChange,
  domains,
  onDomainsChange,
  emailStatusVerified,
  onEmailStatusChange,
  showAdvancedDefault = false,
}: ApolloFilterEditorProps) {
  const [showAdvanced, setShowAdvanced] = useState(showAdvancedDefault);

  // Auto-expand if any advanced filters are pre-populated
  useEffect(() => {
    const hasAdvanced =
      seniorities.length > 0 ||
      departments.length > 0 ||
      employeeRanges.length > 0 ||
      fundingStages.length > 0 ||
      domains.length > 0;
    if (hasAdvanced) setShowAdvanced(true);
  }, []); // Only on mount

  return (
    <div className="space-y-4">
      {/* Core filters */}
      <TagInput
        label="Job Titles"
        placeholder="e.g. VP Sales, CTO, Head of Engineering"
        values={titles}
        onChange={onTitlesChange}
      />

      <LocationTagInput
        values={locations}
        onChange={onLocationsChange}
      />

      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">Keywords</label>
        <input
          type="text"
          value={keywords}
          onChange={(e) => onKeywordsChange(e.target.value)}
          placeholder="e.g. SaaS, AI, DevOps"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-blue-500"
        />
      </div>

      {/* Advanced filters toggle */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
        Advanced Filters
      </button>

      {/* Verified emails toggle */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onEmailStatusChange(!emailStatusVerified)}
          className={`relative w-9 h-5 rounded-full transition-colors ${emailStatusVerified ? 'bg-blue-500' : 'bg-zinc-700'}`}
        >
          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${emailStatusVerified ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
        <span className="text-xs text-zinc-400">Verified emails only</span>
      </div>

      {showAdvanced && (
        <div className="space-y-4 border-t border-zinc-700/50 pt-4">
          <ChipSelect
            label="Seniority"
            options={SENIORITY_OPTIONS}
            labels={SENIORITY_LABELS}
            selected={seniorities}
            onChange={onSenioritiesChange}
          />

          <ChipSelect
            label="Department"
            options={DEPARTMENT_OPTIONS}
            labels={DEPARTMENT_LABELS}
            selected={departments}
            onChange={onDepartmentsChange}
          />

          <ChipSelect
            label="Company Size"
            options={EMPLOYEE_RANGES}
            selected={employeeRanges}
            onChange={onEmployeeRangesChange}
          />

          <ChipSelect
            label="Funding Stage"
            options={FUNDING_OPTIONS}
            selected={fundingStages}
            onChange={onFundingStagesChange}
          />

          <TagInput
            label="Company Domains"
            placeholder="e.g. google.com, stripe.com"
            values={domains}
            onChange={onDomainsChange}
          />
        </div>
      )}
    </div>
  );
}
