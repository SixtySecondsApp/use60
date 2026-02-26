import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Loader2,
  ArrowLeft,
  ArrowRight,
  Building2,
  Users,
  X,
  Database,
  Shield,
  Coins,
  Check,
  Zap,
  Globe,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  explloriumSearchService,
  type ExplloriumBusinessFilters,
  type ExplloriumProspectFilters,
} from '@/lib/services/explloriumSearchService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExplloriumSearchWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: (tableId: string) => void;
}

type SearchType = 'business_search' | 'prospect_search';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// These are exact Google Business Category values accepted by the Explorium API
const BUSINESS_INDUSTRIES = [
  'Software Company',
  'Financial Services',
  'Medical center',
  'Manufacturer',
  'Retail',
  'Legal services',
  'Education',
  'Accounting',
  'Marketing agency',
  'Real Estate',
  'Insurance',
  'Investment management',
  'Construction company',
  'Pharmaceutical company',
  'Media company',
  'Professional Services',
  'Bank',
  'Hotel',
  'Restaurant',
];

const EMPLOYEE_RANGES = [
  '1-10',
  '11-50',
  '51-200',
  '201-500',
  '501-1000',
  '1001-5000',
  '5001-10000',
  '10001+',
];

// Exact enum values accepted by the Explorium company_revenue filter
const REVENUE_RANGES = [
  '0-500K',
  '500K-1M',
  '1M-5M',
  '5M-10M',
  '10M-25M',
  '25M-75M',
  '75M-200M',
  '200M-500M',
  '500M-1B',
  '1B-10B',
];

// Deduplicated display list: owner and founder share "Owner/Founder" but we
// track the values separately in state so the API receives the right values.
const SENIORITY_DISPLAY: { label: string; values: string[] }[] = [
  { label: 'Owner/Founder', values: ['owner', 'founder'] },
  { label: 'C-Suite', values: ['c-suite'] },
  { label: 'VP', values: ['vp'] },
  { label: 'Director', values: ['director'] },
  { label: 'Manager', values: ['manager'] },
  { label: 'Senior', values: ['senior'] },
];

const DEPARTMENT_OPTIONS: { label: string; value: string }[] = [
  { label: 'Sales', value: 'sales' },
  { label: 'Engineering', value: 'engineering' },
  { label: 'Marketing', value: 'marketing' },
  { label: 'Finance', value: 'finance' },
  { label: 'HR', value: 'human resources' },
  { label: 'Operations', value: 'operations' },
  { label: 'Legal', value: 'legal' },
  { label: 'Product', value: 'product' },
];

// ---------------------------------------------------------------------------
// Tag Input helper
// ---------------------------------------------------------------------------

interface TagInputProps {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  placeholder?: string;
  className?: string;
}

function TagInput({ tags, onTagsChange, placeholder = 'Type and press Enter', className = '' }: TagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onTagsChange([...tags, trimmed]);
    }
    setInputValue('');
  };

  const removeTag = (tag: string) => {
    onTagsChange(tags.filter((t) => t !== tag));
  };

  return (
    <div
      className={`min-h-[40px] flex flex-wrap gap-1.5 rounded-lg border border-zinc-700/80 bg-zinc-900/80 px-2.5 py-1.5 cursor-text focus-within:border-brand-teal/60 focus-within:ring-1 focus-within:ring-brand-teal/20 transition-all ${className}`}
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-md bg-brand-teal/10 border border-brand-teal/25 px-2 py-0.5 text-xs text-brand-teal/80 font-medium"
        >
          {tag}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
            className="text-brand-teal/60 hover:text-brand-teal/80 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            addTag(inputValue);
          } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
            onTagsChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => { if (inputValue.trim()) addTag(inputValue); }}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[120px] bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Checkbox group helper
// ---------------------------------------------------------------------------

interface CheckboxGroupProps {
  label: string;
  options: { label: string; value: string }[];
  selected: string[];
  onSelectedChange: (selected: string[]) => void;
}

function CheckboxGroup({ label, options, selected, onSelectedChange }: CheckboxGroupProps) {
  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onSelectedChange(selected.filter((v) => v !== value));
    } else {
      onSelectedChange([...selected, value]);
    }
  };

  return (
    <div>
      <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium border transition-all ${
                active
                  ? 'bg-brand-teal/15 border-brand-teal/50 text-brand-teal/80 shadow-[0_0_8px_rgba(3,173,156,0.15)]'
                  : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
              }`}
            >
              {active && <Check className="w-2.5 h-2.5 inline mr-1 opacity-70" />}
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Seniority group (handles the owner/founder display deduplication)
// ---------------------------------------------------------------------------

interface SeniorityGroupProps {
  selected: string[];
  onSelectedChange: (selected: string[]) => void;
}

function SeniorityGroup({ selected, onSelectedChange }: SeniorityGroupProps) {
  const isGroupSelected = (values: string[]) => values.some((v) => selected.includes(v));

  const toggleGroup = (values: string[]) => {
    const anySelected = values.some((v) => selected.includes(v));
    if (anySelected) {
      onSelectedChange(selected.filter((v) => !values.includes(v)));
    } else {
      const newSelected = [...selected];
      for (const v of values) {
        if (!newSelected.includes(v)) newSelected.push(v);
      }
      onSelectedChange(newSelected);
    }
  };

  return (
    <div>
      <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">Seniority</p>
      <div className="flex flex-wrap gap-1.5">
        {SENIORITY_DISPLAY.map((group) => {
          const active = isGroupSelected(group.values);
          return (
            <button
              key={group.label}
              type="button"
              onClick={() => toggleGroup(group.values)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium border transition-all ${
                active
                  ? 'bg-brand-teal/15 border-brand-teal/50 text-brand-teal/80 shadow-[0_0_8px_rgba(3,173,156,0.15)]'
                  : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
              }`}
            >
              {active && <Check className="w-2.5 h-2.5 inline mr-1 opacity-70" />}
              {group.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step indicator — segmented progress bar style
// ---------------------------------------------------------------------------

interface StepIndicatorProps {
  current: number;
  labels: string[];
}

function StepIndicator({ current, labels }: StepIndicatorProps) {
  return (
    <div className="space-y-2 mt-1">
      {/* Segmented bar */}
      <div className="flex gap-1">
        {labels.map((_, idx) => {
          const stepNum = idx + 1;
          const isDone = current > stepNum;
          const isActive = current === stepNum;
          return (
            <div
              key={idx}
              className={`flex-1 h-0.5 rounded-full transition-all duration-500 ${
                isDone
                  ? 'bg-brand-teal'
                  : isActive
                  ? 'bg-brand-teal/90'
                  : 'bg-zinc-800'
              }`}
              style={isActive ? { boxShadow: '0 0 6px rgba(3,173,156,0.6)' } : undefined}
            />
          );
        })}
      </div>
      {/* Labels */}
      <div className="flex">
        {labels.map((label, idx) => {
          const stepNum = idx + 1;
          const isDone = current > stepNum;
          const isActive = current === stepNum;
          return (
            <div key={label} className="flex-1 flex items-center gap-1.5">
              <span
                className={`text-[10px] font-semibold transition-colors ${
                  isActive
                    ? 'text-brand-teal'
                    : isDone
                    ? 'text-zinc-500'
                    : 'text-zinc-700'
                }`}
              >
                {isDone ? (
                  <span className="inline-flex items-center gap-1">
                    <Check className="w-2.5 h-2.5 text-brand-teal" />
                    {label}
                  </span>
                ) : (
                  label
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter section wrapper
// ---------------------------------------------------------------------------

function FilterSection({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-zinc-800/80 rounded-xl bg-zinc-900/40 p-4 space-y-4">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ExplloriumSearchWizard({
  open,
  onOpenChange,
  onComplete,
}: ExplloriumSearchWizardProps) {
  // Steps: 1 = search type, 2 = filters, 3 = preview & create
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1
  const [searchType, setSearchType] = useState<SearchType>('business_search');

  // Step 2 — Business filters
  const [bizIndustries, setBizIndustries] = useState<string[]>([]);
  const [bizEmployeeRanges, setBizEmployeeRanges] = useState<string[]>([]);
  const [bizRevenueRanges, setBizRevenueRanges] = useState<string[]>([]);
  const [bizCountries, setBizCountries] = useState<string[]>(['us']);
  const [bizTechnologies, setBizTechnologies] = useState<string[]>([]);
  const [bizIntentTopics, setBizIntentTopics] = useState<string[]>([]);
  const [bizIsPublic, setBizIsPublic] = useState<boolean | undefined>(undefined);
  const [bizDomains, setBizDomains] = useState('');
  const [bizLimit, setBizLimit] = useState(25);

  // Step 2 — Prospect filters
  const [prospectJobTitle, setProspectJobTitle] = useState('');
  const [prospectIncludeRelated, setProspectIncludeRelated] = useState(true);
  const [prospectSeniorities, setProspectSeniorities] = useState<string[]>([]);
  const [prospectDepartments, setProspectDepartments] = useState<string[]>([]);
  const [prospectCountries, setProspectCountries] = useState<string[]>(['us']);
  const [prospectEmployeeRanges, setProspectEmployeeRanges] = useState<string[]>([]);
  const [prospectHasEmail, setProspectHasEmail] = useState(true);
  const [prospectLimit, setProspectLimit] = useState(25);

  // Step 3
  const [tableName, setTableName] = useState('');
  const [statsCount, setStatsCount] = useState<number | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Fetch stats when entering step 3
  useEffect(() => {
    if (step !== 3) return;
    setStatsLoading(true);
    setStatsCount(null);

    const filters = searchType === 'business_search'
      ? buildBusinessFilters()
      : buildProspectFilters();

    explloriumSearchService
      .getStats({ action: searchType, filters })
      .then(({ total_count }) => setStatsCount(total_count))
      .catch((err: unknown) => {
        // Non-blocking — swallow silently; UI shows "Unable to get count"
        console.warn('[ExplloriumSearchWizard] Stats fetch failed:', err)
      })
      .finally(() => setStatsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Auto-generate table name when entering step 3
  useEffect(() => {
    if (step !== 3 || tableName) return;
    setTableName(generateTableName());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ---------------------------------------------------------------------------
  // Filter builders
  // ---------------------------------------------------------------------------

  function buildBusinessFilters(): ExplloriumBusinessFilters {
    const filters: ExplloriumBusinessFilters = {};
    if (bizIndustries.length) filters.industries = bizIndustries;
    if (bizEmployeeRanges.length) filters.employee_ranges = bizEmployeeRanges;
    if (bizRevenueRanges.length) filters.revenue_ranges = bizRevenueRanges;
    if (bizCountries.length) filters.countries = bizCountries;
    if (bizTechnologies.length) filters.technologies = bizTechnologies;
    if (bizIntentTopics.length) filters.intent_topics = bizIntentTopics;
    if (bizIsPublic !== undefined) filters.is_public = bizIsPublic;
    const domains = bizDomains
      .split('\n')
      .map((d) => d.trim())
      .filter(Boolean);
    if (domains.length) filters.domains = domains;
    return filters;
  }

  function buildProspectFilters(): ExplloriumProspectFilters {
    const filters: ExplloriumProspectFilters = {};
    if (prospectJobTitle.trim()) filters.job_title = prospectJobTitle.trim();
    filters.include_related_titles = prospectIncludeRelated;
    if (prospectSeniorities.length) filters.seniorities = prospectSeniorities;
    if (prospectDepartments.length) filters.departments = prospectDepartments;
    if (prospectCountries.length) filters.prospect_countries = prospectCountries;
    if (prospectEmployeeRanges.length) filters.employee_ranges = prospectEmployeeRanges;
    filters.has_email = prospectHasEmail;
    return filters;
  }

  function generateTableName(): string {
    if (searchType === 'business_search') {
      const parts: string[] = [];
      if (bizIndustries.length) parts.push(bizIndustries.slice(0, 2).join(' & '));
      if (bizEmployeeRanges.length) parts.push(`${bizEmployeeRanges[0]} employees`);
      if (bizCountries.length && !bizCountries.includes('us')) parts.push(bizCountries[0].toUpperCase());
      return parts.length > 0 ? `Explorium: ${parts.join(', ')}` : 'Explorium Business Search';
    } else {
      const parts: string[] = [];
      if (prospectJobTitle.trim()) parts.push(prospectJobTitle.trim());
      if (prospectSeniorities.length) {
        const label = SENIORITY_DISPLAY.find((g) => g.values.some((v) => prospectSeniorities.includes(v)))?.label;
        if (label) parts.push(label);
      }
      if (prospectDepartments.length) parts.push(prospectDepartments[0]);
      return parts.length > 0 ? `Explorium: ${parts.join(', ')}` : 'Explorium People Search';
    }
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  function hasBusinessFilters(): boolean {
    return (
      bizIndustries.length > 0 ||
      bizEmployeeRanges.length > 0 ||
      bizRevenueRanges.length > 0 ||
      bizTechnologies.length > 0 ||
      bizIntentTopics.length > 0 ||
      bizIsPublic !== undefined ||
      bizDomains.trim().length > 0 ||
      (bizCountries.length > 0 && !(bizCountries.length === 1 && bizCountries[0] === 'us'))
    );
  }

  function hasProspectFilters(): boolean {
    return (
      prospectJobTitle.trim().length > 0 ||
      prospectSeniorities.length > 0 ||
      prospectDepartments.length > 0 ||
      prospectEmployeeRanges.length > 0 ||
      (prospectCountries.length > 0 && !(prospectCountries.length === 1 && prospectCountries[0] === 'us'))
    );
  }

  const canProceedFromStep2 =
    searchType === 'business_search' ? hasBusinessFilters() : hasProspectFilters();

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function handleCreateTable() {
    setIsCreating(true);
    try {
      const filters =
        searchType === 'business_search' ? buildBusinessFilters() : buildProspectFilters();

      const description =
        searchType === 'business_search'
          ? [
              bizIndustries.length ? `Industries: ${bizIndustries.join(', ')}` : '',
              bizEmployeeRanges.length ? `Size: ${bizEmployeeRanges.join(', ')}` : '',
              bizCountries.length ? `Countries: ${bizCountries.join(', ')}` : '',
            ]
              .filter(Boolean)
              .join(' | ') || 'Explorium business search'
          : [
              prospectJobTitle.trim() ? `Title: ${prospectJobTitle.trim()}` : '',
              prospectSeniorities.length ? `Seniority: ${prospectSeniorities.join(', ')}` : '',
              prospectDepartments.length ? `Departments: ${prospectDepartments.join(', ')}` : '',
            ]
              .filter(Boolean)
              .join(' | ') || 'Explorium people search';

      const result = await explloriumSearchService.searchAndCreateTable({
        query_description: description,
        search_type: searchType,
        filters,
        table_name: tableName.trim() || undefined,
        exclude_crm: true,
        per_page: searchType === 'business_search' ? bizLimit : prospectLimit,
      });

      toast.success(`${result.row_count} ${searchType === 'business_search' ? 'companies' : 'prospects'} imported`);
      onOpenChange(false);
      resetForm();
      onComplete?.(result.table_id);
    } catch (err) {
      const error = err as Error & { code?: string };
      if (error.code === 'insufficient_credits') {
        toast.error('Not enough credits. Top up to continue.');
      } else if (error.code === 'NO_RESULTS') {
        toast.warning('No results matched your filters. Try broadening your search.');
      } else if (error.code === 'ALL_DUPLICATES') {
        toast.warning('All results are already in your CRM or Ops tables. Try different filters.');
      } else {
        toast.error(error.message || 'Failed to create table from Explorium search');
      }
    } finally {
      setIsCreating(false);
    }
  }

  function resetForm() {
    setStep(1);
    setSearchType('business_search');
    // Business
    setBizIndustries([]);
    setBizEmployeeRanges([]);
    setBizRevenueRanges([]);
    setBizCountries(['us']);
    setBizTechnologies([]);
    setBizIntentTopics([]);
    setBizIsPublic(undefined);
    setBizDomains('');
    setBizLimit(25);
    // Prospect
    setProspectJobTitle('');
    setProspectIncludeRelated(true);
    setProspectSeniorities([]);
    setProspectDepartments([]);
    setProspectCountries(['us']);
    setProspectEmployeeRanges([]);
    setProspectHasEmail(true);
    setProspectLimit(25);
    // Step 3
    setTableName('');
    setStatsCount(null);
    setStatsLoading(false);
    setIsCreating(false);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden bg-[#0c0e12] border border-zinc-800/80 text-white max-h-[88vh] flex flex-col">

        {/* ------------------------------------------------------------------ */}
        {/* Header                                                              */}
        {/* ------------------------------------------------------------------ */}
        <div className="relative px-6 pt-5 pb-4 border-b border-zinc-800/60 shrink-0">
          {/* Teal accent bar at top */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-brand-teal/0 via-brand-teal to-brand-teal/0" />

          <DialogHeader className="space-y-0">
            <div className="flex items-center gap-3 mb-3">
              {/* Explorium badge */}
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-teal/10 border border-brand-teal/20">
                  <Database className="w-3.5 h-3.5 text-brand-teal" />
                </div>
                <div>
                  <DialogTitle className="text-[13px] font-semibold text-white leading-none">
                    Explorium
                  </DialogTitle>
                  <DialogDescription className="text-[10px] text-zinc-600 leading-none mt-0.5">
                    80M+ companies · 200M+ prospects
                  </DialogDescription>
                </div>
              </div>

              <div className="flex-1" />

              {/* Step label */}
              <span className="text-[10px] font-medium text-zinc-600 tabular-nums">
                Step {step} of 3
              </span>
            </div>

            {/* Step indicator */}
            <StepIndicator
              current={step}
              labels={['Search type', 'Filters', 'Preview & create']}
            />
          </DialogHeader>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Scrollable body                                                     */}
        {/* ------------------------------------------------------------------ */}
        <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">

          {/* ---------------------------------------------------------------- */}
          {/* Step 1: Search Type                                               */}
          {/* ---------------------------------------------------------------- */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-xs text-zinc-500">Choose what type of data you want to find</p>

              <div className="grid grid-cols-2 gap-3">
                {/* Company Search */}
                <button
                  type="button"
                  onClick={() => setSearchType('business_search')}
                  className={`group relative flex flex-col items-start gap-4 rounded-xl border p-5 text-left transition-all duration-200 ${
                    searchType === 'business_search'
                      ? 'border-brand-teal/50 bg-brand-teal/[0.06]'
                      : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/70'
                  }`}
                  style={searchType === 'business_search' ? { boxShadow: '0 0 20px rgba(3,173,156,0.08), inset 0 0 20px rgba(3,173,156,0.03)' } : undefined}
                >
                  {/* Selected indicator */}
                  {searchType === 'business_search' && (
                    <div className="absolute top-3.5 right-3.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-teal">
                      <Check className="w-2.5 h-2.5 text-black" strokeWidth={3} />
                    </div>
                  )}

                  {/* Icon */}
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                    searchType === 'business_search'
                      ? 'bg-brand-teal/15 border border-brand-teal/20'
                      : 'bg-zinc-800 border border-zinc-700/50 group-hover:bg-zinc-750'
                  }`}>
                    <Building2 className={`w-5 h-5 transition-colors ${searchType === 'business_search' ? 'text-brand-teal' : 'text-zinc-500'}`} />
                  </div>

                  <div className="space-y-1.5">
                    <p className={`text-sm font-semibold transition-colors ${searchType === 'business_search' ? 'text-white' : 'text-zinc-300'}`}>
                      Company Search
                    </p>
                    <p className="text-xs text-zinc-600 leading-relaxed">
                      Find businesses by industry, size, revenue, and intent signals
                    </p>
                  </div>

                  {/* Stats row */}
                  <div className="flex items-center gap-3 pt-1 border-t border-zinc-800/60 w-full">
                    <div className="flex items-center gap-1">
                      <Globe className="w-3 h-3 text-zinc-600" />
                      <span className="text-[10px] text-zinc-600">80M+ companies</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Zap className="w-3 h-3 text-zinc-600" />
                      <span className="text-[10px] text-zinc-600">Intent signals</span>
                    </div>
                  </div>
                </button>

                {/* People Search */}
                <button
                  type="button"
                  onClick={() => setSearchType('prospect_search')}
                  className={`group relative flex flex-col items-start gap-4 rounded-xl border p-5 text-left transition-all duration-200 ${
                    searchType === 'prospect_search'
                      ? 'border-brand-teal/50 bg-brand-teal/[0.06]'
                      : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/70'
                  }`}
                  style={searchType === 'prospect_search' ? { boxShadow: '0 0 20px rgba(3,173,156,0.08), inset 0 0 20px rgba(3,173,156,0.03)' } : undefined}
                >
                  {searchType === 'prospect_search' && (
                    <div className="absolute top-3.5 right-3.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-teal">
                      <Check className="w-2.5 h-2.5 text-black" strokeWidth={3} />
                    </div>
                  )}

                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                    searchType === 'prospect_search'
                      ? 'bg-brand-teal/15 border border-brand-teal/20'
                      : 'bg-zinc-800 border border-zinc-700/50 group-hover:bg-zinc-750'
                  }`}>
                    <Users className={`w-5 h-5 transition-colors ${searchType === 'prospect_search' ? 'text-brand-teal' : 'text-zinc-500'}`} />
                  </div>

                  <div className="space-y-1.5">
                    <p className={`text-sm font-semibold transition-colors ${searchType === 'prospect_search' ? 'text-white' : 'text-zinc-300'}`}>
                      People Search
                    </p>
                    <p className="text-xs text-zinc-600 leading-relaxed">
                      Find decision-makers by job title, seniority, and department
                    </p>
                  </div>

                  <div className="flex items-center gap-3 pt-1 border-t border-zinc-800/60 w-full">
                    <div className="flex items-center gap-1">
                      <Users className="w-3 h-3 text-zinc-600" />
                      <span className="text-[10px] text-zinc-600">200M+ prospects</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <TrendingUp className="w-3 h-3 text-zinc-600" />
                      <span className="text-[10px] text-zinc-600">Verified emails</span>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* Step 2: Filters                                                   */}
          {/* ---------------------------------------------------------------- */}
          {step === 2 && (
            <div className="space-y-3">
              <p className="text-xs text-zinc-500">
                {searchType === 'business_search'
                  ? 'Narrow your company search with filters'
                  : 'Filter by role, seniority, and company size'}
              </p>

              {searchType === 'business_search' ? (
                <>
                  <FilterSection>
                    {/* Industries */}
                    <div>
                      <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">Industries</p>
                      <TagInput
                        tags={bizIndustries}
                        onTagsChange={setBizIndustries}
                        placeholder="Type industry and press Enter"
                      />
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {BUSINESS_INDUSTRIES.filter((i) => !bizIndustries.includes(i)).map((industry) => (
                          <button
                            key={industry}
                            type="button"
                            onClick={() => setBizIndustries([...bizIndustries, industry])}
                            className="rounded-full border border-zinc-800 bg-zinc-900/60 px-2.5 py-0.5 text-[10px] text-zinc-500 hover:border-brand-teal/30 hover:text-brand-teal hover:bg-brand-teal/5 transition-all"
                          >
                            + {industry}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Company Size */}
                    <CheckboxGroup
                      label="Company Size"
                      options={EMPLOYEE_RANGES.map((r) => ({ label: r, value: r }))}
                      selected={bizEmployeeRanges}
                      onSelectedChange={setBizEmployeeRanges}
                    />

                    {/* Revenue Range */}
                    <CheckboxGroup
                      label="Revenue Range"
                      options={REVENUE_RANGES.map((r) => ({ label: r, value: r }))}
                      selected={bizRevenueRanges}
                      onSelectedChange={setBizRevenueRanges}
                    />
                  </FilterSection>

                  <FilterSection>
                    {/* Country */}
                    <div>
                      <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">Countries <span className="text-zinc-700 normal-case tracking-normal font-normal">(ISO alpha-2)</span></p>
                      <TagInput
                        tags={bizCountries}
                        onTagsChange={setBizCountries}
                        placeholder="e.g. us, gb, de"
                      />
                    </div>

                    {/* Technologies */}
                    <div>
                      <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">Technologies</p>
                      <TagInput
                        tags={bizTechnologies}
                        onTagsChange={setBizTechnologies}
                        placeholder="e.g. Salesforce, HubSpot, AWS"
                      />
                    </div>

                    {/* Intent Topics */}
                    <div>
                      <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-1">
                        Intent Topics
                        <span className="ml-1.5 text-zinc-700 normal-case tracking-normal font-normal">via Bombora</span>
                      </p>
                      <TagInput
                        tags={bizIntentTopics}
                        onTagsChange={setBizIntentTopics}
                        placeholder="e.g. CRM Software, Marketing Automation"
                      />
                    </div>
                  </FilterSection>

                  <FilterSection>
                    {/* Is Public */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-zinc-300">Public companies only</p>
                        <p className="text-[10px] text-zinc-600 mt-0.5">Filter to publicly traded companies</p>
                      </div>
                      <Switch
                        checked={bizIsPublic === true}
                        onCheckedChange={(checked) => setBizIsPublic(checked ? true : undefined)}
                      />
                    </div>

                    {/* Company Domains */}
                    <div>
                      <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">
                        Target Domains <span className="text-zinc-700 normal-case tracking-normal font-normal">one per line</span>
                      </p>
                      <textarea
                        value={bizDomains}
                        onChange={(e) => setBizDomains(e.target.value)}
                        placeholder={'acme.com\nexample.io\nstartup.co'}
                        rows={3}
                        className="w-full rounded-lg border border-zinc-700/80 bg-zinc-900/80 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-brand-teal/60 focus:ring-1 focus:ring-brand-teal/20 resize-none transition-all"
                      />
                    </div>

                    {/* Results limit */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-zinc-300">Results limit</p>
                        <p className="text-[10px] text-zinc-600 mt-0.5">Maximum 500</p>
                      </div>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={bizLimit}
                        onChange={(e) => setBizLimit(Math.min(500, Math.max(1, Number(e.target.value))))}
                        className="w-20 rounded-lg border border-zinc-700/80 bg-zinc-900/80 px-3 py-1.5 text-sm text-white text-center outline-none focus:border-brand-teal/60 focus:ring-1 focus:ring-brand-teal/20 transition-all"
                      />
                    </div>
                  </FilterSection>
                </>
              ) : (
                <>
                  <FilterSection>
                    {/* Job Title */}
                    <div>
                      <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">
                        Job Title
                      </label>
                      <input
                        type="text"
                        value={prospectJobTitle}
                        onChange={(e) => setProspectJobTitle(e.target.value)}
                        placeholder="e.g. VP of Sales, Head of Marketing"
                        className="w-full rounded-lg border border-zinc-700/80 bg-zinc-900/80 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-brand-teal/60 focus:ring-1 focus:ring-brand-teal/20 transition-all"
                      />
                      <div className="flex items-center gap-2 mt-2.5">
                        <Switch
                          id="include-related"
                          checked={prospectIncludeRelated}
                          onCheckedChange={setProspectIncludeRelated}
                        />
                        <Label htmlFor="include-related" className="text-xs text-zinc-400 cursor-pointer font-normal">
                          Include related titles
                        </Label>
                      </div>
                    </div>

                    {/* Seniority */}
                    <SeniorityGroup
                      selected={prospectSeniorities}
                      onSelectedChange={setProspectSeniorities}
                    />

                    {/* Department */}
                    <CheckboxGroup
                      label="Department"
                      options={DEPARTMENT_OPTIONS}
                      selected={prospectDepartments}
                      onSelectedChange={setProspectDepartments}
                    />
                  </FilterSection>

                  <FilterSection>
                    {/* Country */}
                    <div>
                      <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">Countries <span className="text-zinc-700 normal-case tracking-normal font-normal">(ISO alpha-2)</span></p>
                      <TagInput
                        tags={prospectCountries}
                        onTagsChange={setProspectCountries}
                        placeholder="e.g. us, gb, de"
                      />
                    </div>

                    {/* Company Size */}
                    <CheckboxGroup
                      label="Company Size"
                      options={EMPLOYEE_RANGES.map((r) => ({ label: r, value: r }))}
                      selected={prospectEmployeeRanges}
                      onSelectedChange={setProspectEmployeeRanges}
                    />
                  </FilterSection>

                  <FilterSection>
                    {/* Has Email */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-zinc-300">Has email address</p>
                        <p className="text-[10px] text-zinc-600 mt-0.5">Only return prospects with verified email</p>
                      </div>
                      <Switch
                        checked={prospectHasEmail}
                        onCheckedChange={setProspectHasEmail}
                      />
                    </div>

                    {/* Results limit */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-zinc-300">Results limit</p>
                        <p className="text-[10px] text-zinc-600 mt-0.5">Maximum 500</p>
                      </div>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={prospectLimit}
                        onChange={(e) =>
                          setProspectLimit(Math.min(500, Math.max(1, Number(e.target.value))))
                        }
                        className="w-20 rounded-lg border border-zinc-700/80 bg-zinc-900/80 px-3 py-1.5 text-sm text-white text-center outline-none focus:border-brand-teal/60 focus:ring-1 focus:ring-brand-teal/20 transition-all"
                      />
                    </div>
                  </FilterSection>
                </>
              )}
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* Step 3: Preview & Create                                          */}
          {/* ---------------------------------------------------------------- */}
          {step === 3 && (
            <div className="space-y-3">
              <p className="text-xs text-zinc-500">Review your search before creating the table</p>

              {/* Stats — hero card */}
              <div className="relative rounded-xl border border-zinc-800/80 bg-zinc-900/50 overflow-hidden">
                {/* Subtle grid pattern */}
                <div
                  className="absolute inset-0 opacity-[0.03]"
                  style={{
                    backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
                    backgroundSize: '20px 20px',
                  }}
                />
                <div className="relative px-5 py-5 text-center">
                  {statsLoading ? (
                    <div className="flex flex-col items-center gap-2 py-2">
                      <Loader2 className="w-5 h-5 animate-spin text-brand-teal" />
                      <p className="text-xs text-zinc-500">Counting matches across 80M+ records...</p>
                    </div>
                  ) : statsCount !== null ? (
                    <>
                      <div
                        className="text-4xl font-bold text-white tabular-nums tracking-tight"
                        style={{ textShadow: '0 0 30px rgba(3,173,156,0.3)' }}
                      >
                        ~{statsCount.toLocaleString()}
                      </div>
                      <p className="text-sm text-zinc-500 mt-1">
                        {searchType === 'business_search' ? 'companies' : 'prospects'} match your filters
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-zinc-600 py-2">Unable to fetch count — search will proceed</p>
                  )}
                </div>
              </div>

              {/* Info row */}
              <div className="grid grid-cols-2 gap-2">
                {/* Credit cost */}
                <div className="flex items-center gap-2.5 rounded-lg border border-amber-500/15 bg-amber-500/[0.04] px-3.5 py-3">
                  <Coins className="w-3.5 h-3.5 text-amber-500/70 shrink-0" />
                  <div>
                    <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-semibold">Cost</p>
                    <p className="text-xs text-amber-300/90 font-semibold mt-0.5">2 platform credits</p>
                  </div>
                </div>

                {/* CRM exclusion */}
                <div className="flex items-center gap-2.5 rounded-lg border border-brand-teal/15 bg-brand-teal/[0.04] px-3.5 py-3">
                  <Shield className="w-3.5 h-3.5 text-brand-teal/70 shrink-0" />
                  <div>
                    <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-semibold">CRM</p>
                    <p className="text-xs text-brand-teal/80 font-semibold mt-0.5">Exclusion active</p>
                  </div>
                </div>
              </div>

              {/* Filter summary */}
              <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 px-4 py-3.5">
                <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-2.5">Search summary</p>
                <div className="flex flex-wrap gap-1.5">
                  {searchType === 'business_search' ? (
                    <>
                      {bizIndustries.map((i) => (
                        <span key={i} className="inline-flex items-center gap-1 rounded-full bg-zinc-800 border border-zinc-700/50 px-2 py-0.5 text-[10px] text-zinc-400">
                          <Building2 className="w-2.5 h-2.5 text-zinc-600" />{i}
                        </span>
                      ))}
                      {bizEmployeeRanges.map((r) => (
                        <span key={r} className="inline-flex items-center rounded-full bg-zinc-800 border border-zinc-700/50 px-2 py-0.5 text-[10px] text-zinc-400">
                          {r} emp
                        </span>
                      ))}
                      {bizRevenueRanges.map((r) => (
                        <span key={r} className="inline-flex items-center rounded-full bg-zinc-800 border border-zinc-700/50 px-2 py-0.5 text-[10px] text-zinc-400">
                          ${r}
                        </span>
                      ))}
                      {bizCountries.map((c) => (
                        <span key={c} className="inline-flex items-center gap-1 rounded-full bg-zinc-800 border border-zinc-700/50 px-2 py-0.5 text-[10px] text-zinc-400 uppercase">
                          <Globe className="w-2.5 h-2.5 text-zinc-600" />{c}
                        </span>
                      ))}
                      {bizTechnologies.map((t) => (
                        <span key={t} className="inline-flex items-center rounded-full bg-zinc-800 border border-zinc-700/50 px-2 py-0.5 text-[10px] text-zinc-400">
                          {t}
                        </span>
                      ))}
                      {bizIntentTopics.map((t) => (
                        <span key={t} className="inline-flex items-center gap-1 rounded-full bg-brand-teal/10 border border-brand-teal/20 px-2 py-0.5 text-[10px] text-brand-teal">
                          <Zap className="w-2.5 h-2.5" />{t}
                        </span>
                      ))}
                      {bizIsPublic === true && (
                        <span className="inline-flex items-center rounded-full bg-zinc-800 border border-zinc-700/50 px-2 py-0.5 text-[10px] text-zinc-400">
                          Public only
                        </span>
                      )}
                      {bizDomains.trim() && bizDomains.split('\n').filter(Boolean).map((d) => (
                        <span key={d} className="inline-flex items-center rounded-full bg-zinc-800 border border-zinc-700/50 px-2 py-0.5 text-[10px] text-zinc-400 font-mono">
                          {d}
                        </span>
                      ))}
                      <span className="inline-flex items-center rounded-full bg-zinc-800 border border-zinc-700/50 px-2 py-0.5 text-[10px] text-zinc-500">
                        limit {bizLimit}
                      </span>
                    </>
                  ) : (
                    <>
                      {prospectJobTitle.trim() && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 border border-zinc-700/50 px-2 py-0.5 text-[10px] text-zinc-400">
                          <Users className="w-2.5 h-2.5 text-zinc-600" />{prospectJobTitle.trim()}
                          {prospectIncludeRelated && <span className="text-zinc-600">+related</span>}
                        </span>
                      )}
                      {SENIORITY_DISPLAY.filter((g) => g.values.some((v) => prospectSeniorities.includes(v))).map((g) => (
                        <span key={g.label} className="inline-flex items-center rounded-full bg-zinc-800 border border-zinc-700/50 px-2 py-0.5 text-[10px] text-zinc-400">
                          {g.label}
                        </span>
                      ))}
                      {DEPARTMENT_OPTIONS.filter((o) => prospectDepartments.includes(o.value)).map((o) => (
                        <span key={o.value} className="inline-flex items-center rounded-full bg-zinc-800 border border-zinc-700/50 px-2 py-0.5 text-[10px] text-zinc-400">
                          {o.label}
                        </span>
                      ))}
                      {prospectCountries.map((c) => (
                        <span key={c} className="inline-flex items-center gap-1 rounded-full bg-zinc-800 border border-zinc-700/50 px-2 py-0.5 text-[10px] text-zinc-400 uppercase">
                          <Globe className="w-2.5 h-2.5 text-zinc-600" />{c}
                        </span>
                      ))}
                      {prospectEmployeeRanges.map((r) => (
                        <span key={r} className="inline-flex items-center rounded-full bg-zinc-800 border border-zinc-700/50 px-2 py-0.5 text-[10px] text-zinc-400">
                          {r} emp
                        </span>
                      ))}
                      {prospectHasEmail && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand-teal/10 border border-brand-teal/20 px-2 py-0.5 text-[10px] text-brand-teal">
                          <Check className="w-2.5 h-2.5" />verified email
                        </span>
                      )}
                      <span className="inline-flex items-center rounded-full bg-zinc-800 border border-zinc-700/50 px-2 py-0.5 text-[10px] text-zinc-500">
                        limit {prospectLimit}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Table name */}
              <div>
                <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-1.5">
                  Table Name
                </label>
                <input
                  type="text"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  placeholder="Auto-generated from search criteria"
                  className="w-full rounded-lg border border-zinc-700/80 bg-zinc-900/80 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-brand-teal/60 focus:ring-1 focus:ring-brand-teal/20 transition-all"
                />
              </div>
            </div>
          )}
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Footer navigation                                                   */}
        {/* ------------------------------------------------------------------ */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-t border-zinc-800/60 bg-zinc-950/40">
          {/* Back */}
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
              disabled={isCreating}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>
          ) : (
            <div />
          )}

          {/* Next / Create */}
          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s + 1) as 2 | 3)}
              disabled={step === 2 && !canProceedFromStep2}
              className="flex items-center gap-1.5 rounded-lg bg-brand-teal px-4 py-2 text-xs font-semibold text-black transition-all hover:bg-brand-teal/90 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ boxShadow: '0 0 16px rgba(3,173,156,0.3)' }}
            >
              Continue
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCreateTable}
              disabled={isCreating}
              className="flex items-center gap-2 rounded-lg bg-brand-teal px-5 py-2 text-xs font-semibold text-black transition-all hover:bg-brand-teal/90 disabled:opacity-50"
              style={{ boxShadow: isCreating ? 'none' : '0 0 16px rgba(3,173,156,0.3)' }}
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Building table...
                </>
              ) : (
                <>
                  <Database className="w-3.5 h-3.5" />
                  Create Table
                </>
              )}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
