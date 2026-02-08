import React, { useState, useEffect, useRef } from 'react';
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
  ArrowLeft,
  ArrowRight,
  Search,
  Users,
  X,
  ChevronDown,
  Coins,
  Zap,
  Sparkles,
  Check,
  Minus,
  Rocket,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useOpsTableSearch, useApolloCredits, useParseApolloQuery } from '@/lib/hooks/useOpsTableSearch';
import { useICPProfiles } from '@/lib/hooks/useICPProfiles';
import type { ICPProfile } from '@/lib/hooks/useICPProfiles';
import { ICPProfileSelector } from './ICPProfileSelector';
import type { ApolloSearchParams, NormalizedContact } from '@/lib/services/apolloSearchService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApolloSearchWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: (tableId: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SENIORITY_OPTIONS = [
  'owner', 'founder', 'c_suite', 'partner', 'vp',
  'head', 'director', 'manager', 'senior', 'entry',
];

const SENIORITY_LABELS: Record<string, string> = {
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

const DEPARTMENT_OPTIONS = [
  'engineering_technical', 'sales', 'marketing', 'finance',
  'operations', 'human_resources', 'support', 'legal',
  'product_management', 'data_science', 'consulting',
  'education', 'media_communications',
];

const DEPARTMENT_LABELS: Record<string, string> = {
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

const EMPLOYEE_RANGES = [
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

const FUNDING_OPTIONS = [
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

// ---------------------------------------------------------------------------
// Multi-select chip component
// ---------------------------------------------------------------------------

function ChipSelect({
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

function TagInput({
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
// Apollo-compatible locations (countries + major cities/regions)
// ---------------------------------------------------------------------------

const APOLLO_LOCATIONS = [
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
// Location tag input with searchable dropdown
// ---------------------------------------------------------------------------

function LocationTagInput({
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
              // Highlight the matching part
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
// Credit bar
// ---------------------------------------------------------------------------

function extractCredits(credits: Record<string, unknown>): {
  emailUsed: number; emailLimit: number; phoneUsed: number; phoneLimit: number; found: boolean;
} {
  // Try various field names Apollo might use
  const raw = (credits.raw as Record<string, unknown>) || credits;

  // Try nested "usage" or "credits" objects
  const usage = (raw.usage as Record<string, unknown>) || (raw.credits as Record<string, unknown>) || raw;

  const findNum = (obj: Record<string, unknown>, ...keys: string[]): number => {
    for (const key of keys) {
      if (typeof obj[key] === 'number') return obj[key] as number;
    }
    return 0;
  };

  const emailUsed = findNum(usage, 'email_credits_used', 'emails_used', 'email_used', 'enrichment_credits_used');
  const emailLimit = findNum(usage, 'email_credits_limit', 'emails_limit', 'email_limit', 'enrichment_credits_limit', 'email_credits_total');
  const phoneUsed = findNum(usage, 'phone_credits_used', 'phones_used', 'phone_used', 'mobile_credits_used');
  const phoneLimit = findNum(usage, 'phone_credits_limit', 'phones_limit', 'phone_limit', 'mobile_credits_limit', 'phone_credits_total');

  // Also check top-level credits object
  const emailUsed2 = findNum(credits, 'email_credits_used', 'enrichment_credits_used');
  const emailLimit2 = findNum(credits, 'email_credits_limit', 'enrichment_credits_limit', 'email_credits_total');
  const phoneUsed2 = findNum(credits, 'phone_credits_used', 'mobile_credits_used');
  const phoneLimit2 = findNum(credits, 'phone_credits_limit', 'mobile_credits_limit', 'phone_credits_total');

  const finalEmailUsed = emailUsed || emailUsed2;
  const finalEmailLimit = emailLimit || emailLimit2;
  const finalPhoneUsed = phoneUsed || phoneUsed2;
  const finalPhoneLimit = phoneLimit || phoneLimit2;

  return {
    emailUsed: finalEmailUsed,
    emailLimit: finalEmailLimit,
    phoneUsed: finalPhoneUsed,
    phoneLimit: finalPhoneLimit,
    found: finalEmailLimit > 0 || finalPhoneLimit > 0,
  };
}

function CreditBar({ credits, isLoading }: { credits: ReturnType<typeof useApolloCredits>['data']; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>Loading credits...</span>
      </div>
    );
  }

  if (!credits) return null;

  const hasUsageStats = credits.source === 'usage_stats';

  if (hasUsageStats) {
    const { emailUsed, emailLimit, phoneUsed, phoneLimit, found } = extractCredits(credits as Record<string, unknown>);

    if (found) {
      const emailRemaining = emailLimit - emailUsed;
      const phoneRemaining = phoneLimit - phoneUsed;
      const emailPct = emailLimit > 0 ? (emailUsed / emailLimit) * 100 : 0;
      const phonePct = phoneLimit > 0 ? (phoneUsed / phoneLimit) * 100 : 0;

      return (
        <div className="flex items-center gap-4 text-xs">
          {emailLimit > 0 && (
            <div className="flex items-center gap-2">
              <Coins className="w-3 h-3 text-amber-400" />
              <span className="text-zinc-500">Email:</span>
              <span className={emailPct > 80 ? 'text-red-400 font-medium' : emailPct > 50 ? 'text-amber-400 font-medium' : 'text-green-400 font-medium'}>
                {emailRemaining.toLocaleString()}
              </span>
              <div className="w-16 h-1.5 rounded-full bg-zinc-700 overflow-hidden">
                <div
                  className={`h-full rounded-full ${emailPct > 80 ? 'bg-red-500' : emailPct > 50 ? 'bg-amber-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(emailPct, 100)}%` }}
                />
              </div>
            </div>
          )}
          {phoneLimit > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-zinc-500">Phone:</span>
              <span className={phonePct > 80 ? 'text-red-400 font-medium' : phonePct > 50 ? 'text-amber-400 font-medium' : 'text-green-400 font-medium'}>
                {phoneRemaining.toLocaleString()}
              </span>
              <div className="w-16 h-1.5 rounded-full bg-zinc-700 overflow-hidden">
                <div
                  className={`h-full rounded-full ${phonePct > 80 ? 'bg-red-500' : phonePct > 50 ? 'bg-amber-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(phonePct, 100)}%` }}
                />
              </div>
            </div>
          )}
          <span className="text-zinc-600 ml-auto">Search is free</span>
        </div>
      );
    }

    // usage_stats returned but we couldn't parse known fields — show raw key/value pairs
    const raw = (credits.raw as Record<string, unknown>) || {};
    const entries = Object.entries(raw).filter(([, v]) => typeof v === 'number' || typeof v === 'string');
    if (entries.length > 0) {
      return (
        <div className="flex items-center gap-3 text-xs flex-wrap">
          <Coins className="w-3 h-3 text-amber-400" />
          {entries.slice(0, 4).map(([k, v]) => (
            <span key={k} className="text-zinc-400">
              <span className="text-zinc-500">{k.replace(/_/g, ' ')}:</span>{' '}
              <span className="text-zinc-300 font-medium">{String(v)}</span>
            </span>
          ))}
          <span className="text-zinc-600 ml-auto">Search is free</span>
        </div>
      );
    }
  }

  // Fallback: no usage stats available
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-500">
      <Coins className="w-3 h-3 text-zinc-600" />
      <span>Search is free</span>
      <span className="text-zinc-700">|</span>
      <span>Enrich: 1 credit/email, 8 credits/phone</span>
      {credits.usage_stats_message && (
        <>
          <span className="text-zinc-700">|</span>
          <span className="text-zinc-600 truncate max-w-[200px]" title={credits.usage_stats_message}>
            {credits.usage_stats_message.includes('master')
              ? 'Use master key for credit balance'
              : credits.usage_stats_message}
          </span>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ApolloSearchWizard({
  open,
  onOpenChange,
  onComplete,
}: ApolloSearchWizardProps) {
  // Step 0: ICP Profile selector, Step 1: Search filters, Step 2: Preview results
  const [step, setStep] = useState<0 | 1 | 2>(0);

  // ICP profiles — skip Step 0 entirely if no profiles available
  const { profiles, isLoading: isLoadingProfiles, regenerate } = useICPProfiles();
  const hasProfiles = profiles.length > 0;

  useEffect(() => {
    // Once loading finishes, if there are no profiles, jump to Step 1
    if (!isLoadingProfiles && !hasProfiles && step === 0) {
      setStep(1);
    }
  }, [isLoadingProfiles, hasProfiles, step]);

  // Search filters
  const [titles, setTitles] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [keywords, setKeywords] = useState('');
  const [seniorities, setSeniorities] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [employeeRanges, setEmployeeRanges] = useState<string[]>([]);
  const [fundingStages, setFundingStages] = useState<string[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [emailStatusVerified, setEmailStatusVerified] = useState(true);
  const [tableName, setTableName] = useState('');

  // Preview state
  const [previewContacts, setPreviewContacts] = useState<NormalizedContact[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Auto-enrich options
  const [enrichEmail, setEnrichEmail] = useState(false);
  const [enrichPhone, setEnrichPhone] = useState(false);

  // Natural language query
  const [nlQuery, setNlQuery] = useState('');
  const [nlSummary, setNlSummary] = useState('');
  const parseQuery = useParseApolloQuery();
  const isParsing = parseQuery.isPending;

  // Quick Import state
  const [quickImportStep, setQuickImportStep] = useState<string | null>(null);
  const navigate = useNavigate();

  // Fetch credits eagerly when dialog is open
  const { data: creditsData, isLoading: creditsLoading } = useApolloCredits(open);

  const { searchApollo, createTableFromSearch, isSearching, isCreating } = useOpsTableSearch({
    navigateOnSuccess: false,
  });

  const buildSearchParams = (): ApolloSearchParams => {
    const params: ApolloSearchParams = { per_page: 50, page: 1 };
    if (titles.length) params.person_titles = titles;
    if (locations.length) params.person_locations = locations;
    if (keywords.trim()) params.q_keywords = keywords.trim();
    if (seniorities.length) params.person_seniorities = seniorities;
    if (departments.length) params.person_departments = departments;
    if (employeeRanges.length) params.organization_num_employees_ranges = employeeRanges;
    if (fundingStages.length) params.organization_latest_funding_stage_cd = fundingStages;
    if (domains.length) params.q_organization_domains = domains;
    if (emailStatusVerified) params.contact_email_status = ['verified'];
    return params;
  };

  const hasFilters = titles.length > 0 || locations.length > 0 || keywords.trim().length > 0 ||
    seniorities.length > 0 || departments.length > 0 || employeeRanges.length > 0 ||
    fundingStages.length > 0 || domains.length > 0;

  const applyParseResult = (result: { params: Partial<ApolloSearchParams>; summary: string; enrichment?: { email?: boolean; phone?: boolean }; suggested_table_name?: string }) => {
    const p = result.params;
    if (p.person_titles?.length) setTitles(p.person_titles);
    if (p.person_locations?.length) setLocations(p.person_locations);
    if (p.q_keywords) setKeywords(p.q_keywords);
    if (p.person_seniorities?.length) setSeniorities(p.person_seniorities);
    if (p.person_departments?.length) setDepartments(p.person_departments);
    if (p.organization_num_employees_ranges?.length) setEmployeeRanges(p.organization_num_employees_ranges);
    if (p.organization_latest_funding_stage_cd?.length) setFundingStages(p.organization_latest_funding_stage_cd);
    if (p.q_organization_domains?.length) setDomains(p.q_organization_domains);
    if (p.contact_email_status?.includes('verified')) setEmailStatusVerified(true);

    // Auto-enable enrichment checkboxes from NL detection
    if (result.enrichment?.email) setEnrichEmail(true);
    if (result.enrichment?.phone) setEnrichPhone(true);

    // Pre-fill table name
    if (result.suggested_table_name) setTableName(result.suggested_table_name);

    // Auto-expand advanced filters if any advanced filter was set
    const hasAdvanced = (p.person_seniorities?.length ?? 0) > 0 ||
      (p.person_departments?.length ?? 0) > 0 ||
      (p.organization_num_employees_ranges?.length ?? 0) > 0 ||
      (p.organization_latest_funding_stage_cd?.length ?? 0) > 0 ||
      (p.q_organization_domains?.length ?? 0) > 0;
    if (hasAdvanced) setShowAdvanced(true);

    setNlSummary(result.summary);
  };

  const handleParseNL = () => {
    if (!nlQuery.trim()) return;
    parseQuery.mutate(nlQuery.trim(), {
      onSuccess: (result) => {
        applyParseResult(result);
        setNlQuery('');
        setStep(1);
      },
    });
  };

  const handleQuickImport = () => {
    if (!nlQuery.trim()) return;
    setQuickImportStep('Parsing query...');

    parseQuery.mutate(nlQuery.trim(), {
      onSuccess: (result) => {
        applyParseResult(result);

        // Build search params from parsed result
        const p = result.params;
        const params: ApolloSearchParams = { per_page: p.per_page || 50, page: 1 };
        if (p.person_titles?.length) params.person_titles = p.person_titles;
        if (p.person_locations?.length) params.person_locations = p.person_locations;
        if (p.q_keywords) params.q_keywords = p.q_keywords;
        if (p.person_seniorities?.length) params.person_seniorities = p.person_seniorities;
        if (p.person_departments?.length) params.person_departments = p.person_departments;
        if (p.organization_num_employees_ranges?.length) params.organization_num_employees_ranges = p.organization_num_employees_ranges;
        if (p.organization_latest_funding_stage_cd?.length) params.organization_latest_funding_stage_cd = p.organization_latest_funding_stage_cd;
        if (p.q_organization_domains?.length) params.q_organization_domains = p.q_organization_domains;
        if (p.contact_email_status?.includes('verified')) params.contact_email_status = ['verified'];

        const hasAutoEnrich = result.enrichment?.email || result.enrichment?.phone;
        setQuickImportStep(hasAutoEnrich ? 'Searching & creating table...' : 'Creating table...');

        const description = result.summary || 'Apollo search';

        createTableFromSearch.mutate(
          {
            query_description: description,
            search_params: params,
            table_name: result.suggested_table_name || undefined,
            ...(hasAutoEnrich ? {
              auto_enrich: {
                email: result.enrichment?.email || false,
                phone: result.enrichment?.phone || false,
              },
            } : {}),
          },
          {
            onSuccess: (tableResult) => {
              setQuickImportStep(null);
              const enriched = tableResult.enriched_count || 0;
              const enrichMsg = enriched > 0 ? ` (${enriched} enriched)` : '';
              const dedupMsg = tableResult.dedup
                ? ` — filtered ${tableResult.dedup.duplicates} duplicates`
                : '';
              toast.success(`Table "${tableResult.table_name}" created with ${tableResult.row_count} leads${enrichMsg}${dedupMsg}`);
              onOpenChange(false);
              resetForm();
              onComplete?.(tableResult.table_id);
              navigate(`/ops/${tableResult.table_id}`);
            },
            onError: (error: Error & { code?: string }) => {
              setQuickImportStep(null);
              if (error.code === 'ALL_DUPLICATES') {
                toast.warning('All contacts are already in your CRM or previously imported.');
              } else if (error.code === 'NO_RESULTS') {
                toast.warning('No results found. Try broadening your search criteria.');
              } else if (error.code === 'APOLLO_NOT_CONFIGURED') {
                toast.error('Apollo is not configured. Add your API key in Settings > Integrations.');
              } else {
                toast.error(error.message || 'Quick Import failed');
              }
            },
          },
        );
      },
      onError: (error) => {
        setQuickImportStep(null);
        toast.error(error.message || 'Failed to parse query');
      },
    });
  };

  const handleSearch = () => {
    const params = buildSearchParams();
    searchApollo.mutate(params, {
      onSuccess: (result) => {
        setPreviewContacts(result.contacts);
        setTotalResults(result.pagination.total);
        setStep(2);
      },
    });
  };

  const handleCreateTable = () => {
    const params = buildSearchParams();
    const description = [
      titles.length ? `Titles: ${titles.join(', ')}` : '',
      locations.length ? `Locations: ${locations.join(', ')}` : '',
      keywords ? `Keywords: ${keywords}` : '',
      seniorities.length ? `Seniority: ${seniorities.map((s) => SENIORITY_LABELS[s] || s).join(', ')}` : '',
      departments.length ? `Departments: ${departments.map((d) => DEPARTMENT_LABELS[d] || d).join(', ')}` : '',
      domains.length ? `Domains: ${domains.join(', ')}` : '',
    ].filter(Boolean).join(' | ');

    const hasAutoEnrich = enrichEmail || enrichPhone;

    createTableFromSearch.mutate(
      {
        query_description: description || 'Apollo search',
        search_params: params,
        table_name: tableName.trim() || undefined,
        ...(hasAutoEnrich ? {
          auto_enrich: {
            email: enrichEmail,
            phone: enrichPhone,
          },
        } : {}),
      },
      {
        onSuccess: (result) => {
          onOpenChange(false);
          resetForm();
          onComplete?.(result.table_id);
        },
      },
    );
  };

  const handleSelectProfile = (profile: ICPProfile) => {
    const f = profile.filters;
    if (f.person_titles?.length) setTitles(f.person_titles);
    if (f.person_locations?.length) setLocations(f.person_locations);
    if (f.q_keywords) setKeywords(f.q_keywords);
    if (f.person_seniorities?.length) setSeniorities(f.person_seniorities);
    if (f.person_departments?.length) setDepartments(f.person_departments);
    if (f.organization_num_employees_ranges?.length) setEmployeeRanges(f.organization_num_employees_ranges);
    if (f.organization_latest_funding_stage_cd?.length) setFundingStages(f.organization_latest_funding_stage_cd);
    if (f.q_organization_domains?.length) setDomains(f.q_organization_domains);
    if (f.contact_email_status?.includes('verified')) setEmailStatusVerified(true);

    // Auto-expand advanced filters if any advanced filter was set
    const hasAdvanced = (f.person_seniorities?.length ?? 0) > 0 ||
      (f.person_departments?.length ?? 0) > 0 ||
      (f.organization_num_employees_ranges?.length ?? 0) > 0 ||
      (f.organization_latest_funding_stage_cd?.length ?? 0) > 0 ||
      (f.q_organization_domains?.length ?? 0) > 0;
    if (hasAdvanced) setShowAdvanced(true);

    setStep(1);
  };

  const handleSelectCustom = () => {
    setStep(1);
  };

  const resetForm = () => {
    setStep(0);
    setTitles([]);
    setLocations([]);
    setKeywords('');
    setSeniorities([]);
    setDepartments([]);
    setEmployeeRanges([]);
    setFundingStages([]);
    setDomains([]);
    setEmailStatusVerified(false);
    setTableName('');
    setPreviewContacts([]);
    setTotalResults(0);
    setShowAdvanced(false);
    setEnrichEmail(false);
    setEnrichPhone(false);
    setNlQuery('');
    setNlSummary('');
    setQuickImportStep(null);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-2xl bg-zinc-900 border-zinc-700 text-white max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Search className="w-5 h-5 text-blue-400" />
            Apollo People Search
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            {step === 0
              ? 'Choose a target profile or start a custom search'
              : step === 1
              ? hasProfiles ? 'Adjust the pre-filled filters or search as-is' : 'Search Apollo for leads matching your criteria'
              : `Found ${totalResults.toLocaleString()} results — preview and create table`}
          </DialogDescription>
          <CreditBar credits={creditsData} isLoading={creditsLoading} />
        </DialogHeader>

        {/* Step indicator — 3 steps when profiles exist, 2 steps otherwise */}
        <div className="flex items-center gap-2 mt-2">
          {(hasProfiles || isLoadingProfiles) && (
            <>
              <div className={`flex items-center gap-1.5 text-xs font-medium ${step === 0 ? 'text-blue-400' : step > 0 ? 'text-green-400' : 'text-zinc-500'}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step === 0 ? 'bg-blue-500 text-white' : step > 0 ? 'bg-green-500/20 text-green-400 border border-green-500/40' : 'bg-zinc-700 text-zinc-400'}`}>1</div>
                Profile
              </div>
              <div className="flex-1 h-px bg-zinc-700" />
            </>
          )}
          <div className={`flex items-center gap-1.5 text-xs font-medium ${step === 1 ? 'text-blue-400' : step > 1 ? 'text-green-400' : 'text-zinc-500'}`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step === 1 ? 'bg-blue-500 text-white' : step > 1 ? 'bg-green-500/20 text-green-400 border border-green-500/40' : 'bg-zinc-700 text-zinc-400'}`}>{hasProfiles || isLoadingProfiles ? '2' : '1'}</div>
            Search
          </div>
          <div className="flex-1 h-px bg-zinc-700" />
          <div className={`flex items-center gap-1.5 text-xs font-medium ${step === 2 ? 'text-blue-400' : 'text-zinc-500'}`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step === 2 ? 'bg-blue-500 text-white' : 'bg-zinc-700 text-zinc-400'}`}>{hasProfiles || isLoadingProfiles ? '3' : '2'}</div>
            Preview & Import
          </div>
        </div>

        {/* Step 0: ICP Profile Selector */}
        {step === 0 && (
          <div className="space-y-4 mt-4">
            {/* NL search bar on Step 0 */}
            <div className="relative">
              <div className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2.5 focus-within:border-blue-500 transition-colors">
                <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
                <input
                  type="text"
                  value={nlQuery}
                  onChange={(e) => setNlQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && nlQuery.trim() && !isParsing) {
                      e.preventDefault();
                      handleParseNL();
                    }
                  }}
                  placeholder="Describe who you're looking for, e.g. &quot;CTOs at fintech startups in London&quot;"
                  className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
                  disabled={isParsing}
                />
                {nlQuery.trim() && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleParseNL}
                      disabled={isParsing || !!quickImportStep}
                      className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                    >
                      {isParsing ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <ArrowRight className="w-3 h-3" />
                      )}
                      {isParsing ? 'Parsing...' : 'Search'}
                    </button>
                    <button
                      type="button"
                      onClick={handleQuickImport}
                      disabled={isParsing || !!quickImportStep || isCreating}
                      className="rounded-md bg-gradient-to-r from-violet-600 to-blue-600 px-3 py-1 text-xs font-medium text-white hover:from-violet-500 hover:to-blue-500 disabled:opacity-50 transition-all flex items-center gap-1.5"
                    >
                      {quickImportStep ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Rocket className="w-3 h-3" />
                      )}
                      {quickImportStep || 'Quick Import'}
                    </button>
                  </div>
                )}
              </div>
              {quickImportStep && (
                <div className="mt-1.5 flex items-center gap-2 text-xs text-violet-300/80 bg-violet-500/5 border border-violet-500/10 rounded-md px-2.5 py-1.5">
                  <Loader2 className="w-3 h-3 animate-spin text-violet-400" />
                  <span>{quickImportStep}</span>
                </div>
              )}
            </div>

            <div className="relative flex items-center gap-3">
              <div className="flex-1 h-px bg-zinc-700/50" />
              <span className="text-[10px] text-zinc-600 uppercase tracking-wider">or choose a profile</span>
              <div className="flex-1 h-px bg-zinc-700/50" />
            </div>

            <ICPProfileSelector
              profiles={profiles}
              isLoading={isLoadingProfiles}
              onSelectProfile={handleSelectProfile}
              onSelectCustom={handleSelectCustom}
              onRegenerate={regenerate}
            />
          </div>
        )}

        {/* Step 1: Search Filters */}
        {step === 1 && (
          <div className="space-y-4 mt-4">
            {/* Natural language search bar */}
            <div className="relative">
              <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 focus-within:border-blue-500 transition-colors">
                <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
                <input
                  type="text"
                  value={nlQuery}
                  onChange={(e) => setNlQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && nlQuery.trim() && !isParsing) {
                      e.preventDefault();
                      handleParseNL();
                    }
                  }}
                  placeholder="Describe your ideal prospect, e.g. &quot;VPs of Sales at SaaS companies in New York&quot;"
                  className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
                  disabled={isParsing}
                />
                {nlQuery.trim() && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleParseNL}
                      disabled={isParsing || !!quickImportStep}
                      className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                    >
                      {isParsing ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      {isParsing ? 'Parsing...' : 'Fill Filters'}
                    </button>
                    <button
                      type="button"
                      onClick={handleQuickImport}
                      disabled={isParsing || !!quickImportStep || isCreating}
                      className="rounded-md bg-gradient-to-r from-violet-600 to-blue-600 px-3 py-1 text-xs font-medium text-white hover:from-violet-500 hover:to-blue-500 disabled:opacity-50 transition-all flex items-center gap-1.5"
                    >
                      {quickImportStep ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Rocket className="w-3 h-3" />
                      )}
                      {quickImportStep || 'Quick Import'}
                    </button>
                  </div>
                )}
              </div>
              {quickImportStep && (
                <div className="mt-1.5 flex items-center gap-2 text-xs text-violet-300/80 bg-violet-500/5 border border-violet-500/10 rounded-md px-2.5 py-1.5">
                  <Loader2 className="w-3 h-3 animate-spin text-violet-400" />
                  <span>{quickImportStep}</span>
                </div>
              )}
              {parseQuery.isError && (
                <p className="mt-1 text-xs text-red-400">{parseQuery.error?.message}</p>
              )}
              {nlSummary && (
                <div className="mt-1.5 flex items-start gap-1.5 text-xs text-blue-300/80 bg-blue-500/5 border border-blue-500/10 rounded-md px-2.5 py-1.5">
                  <Sparkles className="w-3 h-3 mt-0.5 shrink-0 text-blue-400" />
                  <span>{nlSummary} — <span className="text-zinc-500">review and adjust the filters below</span></span>
                </div>
              )}
            </div>

            <div className="relative flex items-center gap-3">
              <div className="flex-1 h-px bg-zinc-700/50" />
              <span className="text-[10px] text-zinc-600 uppercase tracking-wider">or set filters manually</span>
              <div className="flex-1 h-px bg-zinc-700/50" />
            </div>

            {/* Core filters */}
            <TagInput
              label="Job Titles"
              placeholder="e.g. VP Sales, CTO, Head of Engineering"
              values={titles}
              onChange={setTitles}
            />

            <LocationTagInput
              values={locations}
              onChange={setLocations}
            />

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Keywords</label>
              <input
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
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

            {/* Verified emails toggle — always visible */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEmailStatusVerified(!emailStatusVerified)}
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
                  onChange={setSeniorities}
                />

                <ChipSelect
                  label="Department"
                  options={DEPARTMENT_OPTIONS}
                  labels={DEPARTMENT_LABELS}
                  selected={departments}
                  onChange={setDepartments}
                />

                <ChipSelect
                  label="Company Size"
                  options={EMPLOYEE_RANGES}
                  selected={employeeRanges}
                  onChange={setEmployeeRanges}
                />

                <ChipSelect
                  label="Funding Stage"
                  options={FUNDING_OPTIONS}
                  selected={fundingStages}
                  onChange={setFundingStages}
                />

                <TagInput
                  label="Company Domains"
                  placeholder="e.g. google.com, stripe.com"
                  values={domains}
                  onChange={setDomains}
                />
              </div>
            )}

            {/* Actions */}
            <div className={`flex items-center pt-2 ${hasProfiles ? 'justify-between' : 'justify-end'}`}>
              {hasProfiles && (
                <Button
                  variant="outline"
                  onClick={() => setStep(0)}
                  className="gap-1.5 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Profiles
                </Button>
              )}
              <Button
                onClick={handleSearch}
                disabled={!hasFilters || isSearching}
                className="gap-2 bg-blue-600 hover:bg-blue-500 text-white"
              >
                {isSearching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                {isSearching ? 'Searching...' : 'Search Apollo'}
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Preview & Import */}
        {step === 2 && (
          <div className="space-y-4 mt-4">
            {/* Results count */}
            <div className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4 text-blue-400" />
              <span className="text-zinc-300">
                <span className="font-semibold text-white">{totalResults.toLocaleString()}</span> total matches
                {previewContacts.length > 0 && (
                  <span className="text-zinc-500"> — showing first {previewContacts.length}</span>
                )}
              </span>
            </div>

            {/* Auto-enrich options */}
            {(() => {
              const contactCount = Math.min(totalResults, 50);
              const emailCredits = enrichEmail ? contactCount : 0;
              const phoneCredits = enrichPhone ? contactCount * 8 : 0;
              const totalCredits = emailCredits + phoneCredits;

              return (
                <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/40 px-3.5 py-3">
                  <div className="flex items-center gap-2 mb-2.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-xs font-medium text-zinc-300">Enrich on import</span>
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2.5 cursor-pointer hover:border-zinc-600 transition-colors">
                      <input
                        type="checkbox"
                        checked={enrichEmail}
                        onChange={(e) => setEnrichEmail(e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-600 bg-zinc-700 text-blue-500 focus:ring-blue-500/30"
                      />
                      <div className="flex-1 flex items-center justify-between">
                        <span className="text-sm text-zinc-200">Enrich emails</span>
                        <span className="text-xs text-zinc-500">1 credit/contact</span>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2.5 cursor-pointer hover:border-zinc-600 transition-colors">
                      <input
                        type="checkbox"
                        checked={enrichPhone}
                        onChange={(e) => setEnrichPhone(e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-600 bg-zinc-700 text-blue-500 focus:ring-blue-500/30"
                      />
                      <div className="flex-1 flex items-center justify-between">
                        <span className="text-sm text-zinc-200">Enrich phone numbers</span>
                        <span className="text-xs text-zinc-500">8 credits/contact</span>
                      </div>
                    </label>
                  </div>
                  {totalCredits > 0 && (
                    <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-zinc-700/50">
                      <span className="text-xs text-zinc-500">Estimated credits</span>
                      <span className="text-xs font-medium text-amber-400">
                        ~{totalCredits.toLocaleString()} credits for {contactCount} contacts
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Data availability summary */}
            {(() => {
              const total = previewContacts.length;
              const withEmail = previewContacts.filter((c) => c.email || c.has_email).length;
              const withPhone = previewContacts.filter((c) => c.phone || c.has_phone).length;
              const withLocation = previewContacts.filter((c) => c.city || c.state || c.country || c.has_city || c.has_state || c.has_country).length;
              const withLinkedin = previewContacts.filter((c) => c.linkedin_url || c.has_linkedin).length;

              return (
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: 'Email', count: withEmail, icon: '📧' },
                    { label: 'Phone', count: withPhone, icon: '📱' },
                    { label: 'Location', count: withLocation, icon: '📍' },
                    { label: 'LinkedIn', count: withLinkedin, icon: '🔗' },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 px-2.5 py-2 text-center">
                      <div className="text-sm font-semibold text-white">{stat.count}<span className="text-zinc-500 font-normal">/{total}</span></div>
                      <div className="text-[10px] text-zinc-500">{stat.label} available</div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Preview table */}
            {(() => {
              // Check for actual data OR has_* flags
              const hasEmail = previewContacts.some((c) => c.email);
              const hasPhone = previewContacts.some((c) => c.phone);
              const hasLocation = previewContacts.some((c) => c.city || c.state || c.country);
              const hasEmployees = previewContacts.some((c) => c.employees);
              const hasLinkedin = previewContacts.some((c) => c.linkedin_url);
              const hasDomain = previewContacts.some((c) => c.company_domain);

              // Show availability columns if flags exist but data doesn't
              const hasEmailFlags = !hasEmail && previewContacts.some((c) => c.has_email);
              const hasPhoneFlags = !hasPhone && previewContacts.some((c) => c.has_phone);

              return (
                <div className="rounded-lg border border-zinc-700 overflow-hidden">
                  <div className="overflow-x-auto max-h-[260px] overflow-y-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead className="sticky top-0 z-10">
                        <tr className="border-b border-zinc-700 bg-zinc-800">
                          <th className="px-3 py-2 text-left text-zinc-400 font-medium whitespace-nowrap">Name</th>
                          <th className="px-3 py-2 text-left text-zinc-400 font-medium whitespace-nowrap">Title</th>
                          <th className="px-3 py-2 text-left text-zinc-400 font-medium whitespace-nowrap">Company</th>
                          {hasLocation && <th className="px-3 py-2 text-left text-zinc-400 font-medium whitespace-nowrap">Location</th>}
                          {hasEmployees && <th className="px-3 py-2 text-left text-zinc-400 font-medium whitespace-nowrap">Employees</th>}
                          {hasEmail && <th className="px-3 py-2 text-left text-zinc-400 font-medium whitespace-nowrap">Email</th>}
                          {hasEmailFlags && <th className="px-3 py-2 text-center text-zinc-400 font-medium whitespace-nowrap">Email</th>}
                          {hasPhone && <th className="px-3 py-2 text-left text-zinc-400 font-medium whitespace-nowrap">Phone</th>}
                          {hasPhoneFlags && <th className="px-3 py-2 text-center text-zinc-400 font-medium whitespace-nowrap">Phone</th>}
                          {hasLinkedin && <th className="px-3 py-2 text-left text-zinc-400 font-medium whitespace-nowrap">LinkedIn</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {previewContacts.map((c) => (
                          <tr key={c.apollo_id} className="border-b border-zinc-800 hover:bg-zinc-800/30">
                            <td className="px-3 py-2 text-zinc-200 whitespace-nowrap">
                              {c.full_name || `${c.first_name} ${c.last_name}`.trim()}
                            </td>
                            <td className="px-3 py-2 text-zinc-400 max-w-[160px] truncate">{c.title}</td>
                            <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5">
                                {c.company_domain && (
                                  <img
                                    src={`https://img.logo.dev/${c.company_domain}?token=pk_X-1ZO13GSgeOoUrIuJ6GMQ&size=32&format=png`}
                                    alt=""
                                    className="w-4 h-4 rounded-sm object-contain shrink-0"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                  />
                                )}
                                {c.company}
                                {hasDomain && c.company_domain && (
                                  <span className="text-zinc-600 text-[10px]">{c.company_domain}</span>
                                )}
                              </span>
                            </td>
                            {hasLocation && (
                              <td className="px-3 py-2 whitespace-nowrap">
                                {c.city || c.state ? (
                                  <>
                                    <span className="text-zinc-400">{[c.city, c.state].filter(Boolean).join(', ')}</span>
                                    {c.country && <span className="text-zinc-500">, {c.country}</span>}
                                  </>
                                ) : c.country ? (
                                  <span className="text-zinc-400">{c.country}</span>
                                ) : (
                                  <span className="text-zinc-600">—</span>
                                )}
                              </td>
                            )}
                            {hasEmployees && (
                              <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">
                                {c.employees ? c.employees.toLocaleString() : '—'}
                              </td>
                            )}
                            {hasEmail && (
                              <td className="px-3 py-2 text-zinc-300 whitespace-nowrap">{c.email || '—'}</td>
                            )}
                            {hasEmailFlags && (
                              <td className="px-3 py-2 text-center">
                                {c.has_email ? (
                                  <Check className="w-3.5 h-3.5 text-green-400 mx-auto" />
                                ) : (
                                  <Minus className="w-3.5 h-3.5 text-zinc-600 mx-auto" />
                                )}
                              </td>
                            )}
                            {hasPhone && (
                              <td className="px-3 py-2 text-zinc-300 whitespace-nowrap">{c.phone || '—'}</td>
                            )}
                            {hasPhoneFlags && (
                              <td className="px-3 py-2 text-center">
                                {c.has_phone ? (
                                  <Check className="w-3.5 h-3.5 text-green-400 mx-auto" />
                                ) : (
                                  <Minus className="w-3.5 h-3.5 text-zinc-600 mx-auto" />
                                )}
                              </td>
                            )}
                            {hasLinkedin && (
                              <td className="px-3 py-2 whitespace-nowrap">
                                {c.linkedin_url ? (
                                  <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline">Profile</a>
                                ) : '—'}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Enrichment note */}
                  <div className="px-3 py-2 border-t border-zinc-700/50 bg-zinc-800/30 flex items-center gap-2 text-[11px] text-zinc-500">
                    <Zap className="w-3 h-3 text-amber-400/60" />
                    <span>Apollo search shows availability only. Enable enrichment above to get full contact data (emails, phones, LinkedIn).</span>
                  </div>
                </div>
              );
            })()}

            {/* Table name */}
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Table Name (optional)</label>
              <input
                type="text"
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                placeholder="Auto-generated from search criteria"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-blue-500"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                className="gap-1.5 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
              <Button
                onClick={handleCreateTable}
                disabled={isCreating}
                className="gap-2 bg-blue-600 hover:bg-blue-500 text-white"
              >
                {isCreating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ArrowRight className="w-4 h-4" />
                )}
                {isCreating
                  ? (enrichEmail || enrichPhone ? 'Creating & Enriching...' : 'Creating...')
                  : (enrichEmail || enrichPhone ? 'Create & Enrich' : 'Create Table')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
