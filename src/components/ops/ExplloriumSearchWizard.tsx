import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Loader2,
  ArrowLeft,
  ArrowRight,
  Search,
  Building2,
  Users,
  X,
  Database,
  Shield,
  Coins,
  ChevronRight,
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

const BUSINESS_INDUSTRIES = [
  'Software',
  'Financial Services',
  'Healthcare',
  'Manufacturing',
  'Retail',
  'Professional Services',
  'Education',
  'Media',
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

const REVENUE_RANGES = [
  '0-500K',
  '500K-1M',
  '1M-5M',
  '5M-10M',
  '10M-50M',
  '50M-100M',
  '100M-500M',
  '500M-1B',
  '1B-10B',
];

// Deduplicated display list: owner and founder share "Owner/Founder" but we
// track the values separately in state so the API receives the right values.
const SENIORITY_DISPLAY: { label: string; values: string[] }[] = [
  { label: 'Owner/Founder', values: ['owner', 'founder'] },
  { label: 'C-Suite', values: ['c_suite'] },
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
      className={`min-h-[38px] flex flex-wrap gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 cursor-text focus-within:border-blue-500 transition-colors ${className}`}
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-md bg-zinc-700 px-2 py-0.5 text-xs text-zinc-200"
        >
          {tag}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
            className="text-zinc-400 hover:text-white transition-colors"
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
        className="flex-1 min-w-[120px] bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
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
      <p className="text-xs font-medium text-zinc-400 mb-2">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors ${
                active
                  ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300'
              }`}
            >
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
      <p className="text-xs font-medium text-zinc-400 mb-2">Seniority</p>
      <div className="flex flex-wrap gap-1.5">
        {SENIORITY_DISPLAY.map((group) => {
          const active = isGroupSelected(group.values);
          return (
            <button
              key={group.label}
              type="button"
              onClick={() => toggleGroup(group.values)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors ${
                active
                  ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300'
              }`}
            >
              {group.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

interface StepIndicatorProps {
  current: number; // 1-indexed
  total: number;
  labels: string[];
}

function StepIndicator({ current, total, labels }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-2 mt-2">
      {labels.map((label, idx) => {
        const stepNum = idx + 1;
        const isActive = current === stepNum;
        const isDone = current > stepNum;
        return (
          <React.Fragment key={label}>
            <div
              className={`flex items-center gap-1.5 text-xs font-medium ${
                isActive ? 'text-blue-400' : isDone ? 'text-green-400' : 'text-zinc-500'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  isActive
                    ? 'bg-blue-500 text-white'
                    : isDone
                    ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                    : 'bg-zinc-700 text-zinc-400'
                }`}
              >
                {stepNum}
              </div>
              {label}
            </div>
            {idx < labels.length - 1 && <div className="flex-1 h-px bg-zinc-700" />}
          </React.Fragment>
        );
      })}
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
      .catch(() => {
        // Non-blocking — swallow silently; UI shows "Unable to get count"
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
  // Step descriptions
  // ---------------------------------------------------------------------------

  const stepDescription =
    step === 1
      ? 'Choose what type of data you want to find'
      : step === 2
      ? searchType === 'business_search'
        ? 'Narrow your company search with filters'
        : 'Filter by role, seniority, and company size'
      : 'Review your search before creating the table';

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
      <DialogContent className="sm:max-w-2xl bg-zinc-900 border-zinc-700 text-white max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Search className="w-5 h-5 text-violet-400" />
            Explorium Search
          </DialogTitle>
          <DialogDescription className="text-zinc-400">{stepDescription}</DialogDescription>
        </DialogHeader>

        <StepIndicator
          current={step}
          total={3}
          labels={['Search Type', 'Filters', 'Preview & Create']}
        />

        {/* ------------------------------------------------------------------ */}
        {/* Step 1: Search Type                                                 */}
        {/* ------------------------------------------------------------------ */}
        {step === 1 && (
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3">
              {/* Company Search */}
              <button
                type="button"
                onClick={() => setSearchType('business_search')}
                className={`relative flex flex-col items-start gap-3 rounded-xl border p-4 text-left transition-all ${
                  searchType === 'business_search'
                    ? 'border-violet-500 bg-violet-500/10 ring-1 ring-violet-500/30'
                    : 'border-zinc-700 bg-zinc-800/40 hover:border-zinc-600'
                }`}
              >
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                    searchType === 'business_search'
                      ? 'bg-violet-500/20 text-violet-400'
                      : 'bg-zinc-700 text-zinc-400'
                  }`}
                >
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <p className={`text-sm font-semibold ${searchType === 'business_search' ? 'text-white' : 'text-zinc-300'}`}>
                    Company Search
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500 leading-snug">
                    Find businesses by industry, size, revenue, and intent signals
                  </p>
                </div>
                {searchType === 'business_search' && (
                  <div className="absolute top-3 right-3 h-4 w-4 rounded-full bg-violet-500 flex items-center justify-center">
                    <div className="h-1.5 w-1.5 rounded-full bg-white" />
                  </div>
                )}
              </button>

              {/* People Search */}
              <button
                type="button"
                onClick={() => setSearchType('prospect_search')}
                className={`relative flex flex-col items-start gap-3 rounded-xl border p-4 text-left transition-all ${
                  searchType === 'prospect_search'
                    ? 'border-violet-500 bg-violet-500/10 ring-1 ring-violet-500/30'
                    : 'border-zinc-700 bg-zinc-800/40 hover:border-zinc-600'
                }`}
              >
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                    searchType === 'prospect_search'
                      ? 'bg-violet-500/20 text-violet-400'
                      : 'bg-zinc-700 text-zinc-400'
                  }`}
                >
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <p className={`text-sm font-semibold ${searchType === 'prospect_search' ? 'text-white' : 'text-zinc-300'}`}>
                    People Search
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500 leading-snug">
                    Find decision-makers by job title, seniority, and department
                  </p>
                </div>
                {searchType === 'prospect_search' && (
                  <div className="absolute top-3 right-3 h-4 w-4 rounded-full bg-violet-500 flex items-center justify-center">
                    <div className="h-1.5 w-1.5 rounded-full bg-white" />
                  </div>
                )}
              </button>
            </div>

            <div className="flex items-center justify-end pt-2">
              <Button
                onClick={() => setStep(2)}
                className="gap-2 bg-violet-600 hover:bg-violet-500 text-white"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Step 2: Filters                                                     */}
        {/* ------------------------------------------------------------------ */}
        {step === 2 && (
          <div className="space-y-5 mt-4">
            {searchType === 'business_search' ? (
              <>
                {/* Industries */}
                <div>
                  <p className="text-xs font-medium text-zinc-400 mb-2">Industries</p>
                  <TagInput
                    tags={bizIndustries}
                    onTagsChange={setBizIndustries}
                    placeholder="Type industry and press Enter"
                  />
                  {/* Quick suggestions */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {BUSINESS_INDUSTRIES.filter((i) => !bizIndustries.includes(i)).map((industry) => (
                      <button
                        key={industry}
                        type="button"
                        onClick={() => setBizIndustries([...bizIndustries, industry])}
                        className="rounded-full border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-300 transition-colors"
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

                {/* Country */}
                <div>
                  <p className="text-xs font-medium text-zinc-400 mb-2">Countries (ISO alpha-2)</p>
                  <TagInput
                    tags={bizCountries}
                    onTagsChange={setBizCountries}
                    placeholder="e.g. us, gb, de"
                  />
                </div>

                {/* Technologies */}
                <div>
                  <p className="text-xs font-medium text-zinc-400 mb-2">Technologies</p>
                  <TagInput
                    tags={bizTechnologies}
                    onTagsChange={setBizTechnologies}
                    placeholder="e.g. Salesforce, HubSpot, AWS"
                  />
                </div>

                {/* Intent Topics */}
                <div>
                  <p className="text-xs font-medium text-zinc-400 mb-2">Intent Topics (Bombora)</p>
                  <TagInput
                    tags={bizIntentTopics}
                    onTagsChange={setBizIntentTopics}
                    placeholder="e.g. CRM Software, Marketing Automation"
                  />
                </div>

                {/* Is Public */}
                <div className="flex items-center justify-between rounded-lg border border-zinc-700/60 bg-zinc-800/40 px-3.5 py-3">
                  <div>
                    <p className="text-sm text-zinc-300">Public companies only</p>
                    <p className="text-xs text-zinc-500">Filter to publicly traded companies</p>
                  </div>
                  <Switch
                    checked={bizIsPublic === true}
                    onCheckedChange={(checked) => setBizIsPublic(checked ? true : undefined)}
                  />
                </div>

                {/* Company Domains */}
                <div>
                  <p className="text-xs font-medium text-zinc-400 mb-2">
                    Target Domains{' '}
                    <span className="text-zinc-600 font-normal">(one per line)</span>
                  </p>
                  <textarea
                    value={bizDomains}
                    onChange={(e) => setBizDomains(e.target.value)}
                    placeholder="acme.com&#10;example.io&#10;startup.co"
                    rows={3}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-blue-500 resize-none"
                  />
                </div>

                {/* Results limit */}
                <div>
                  <label className="text-xs font-medium text-zinc-400 mb-2 block">
                    Results limit
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={bizLimit}
                    onChange={(e) => setBizLimit(Math.min(500, Math.max(1, Number(e.target.value))))}
                    className="w-28 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                  />
                  <p className="mt-1 text-xs text-zinc-600">Max 500</p>
                </div>
              </>
            ) : (
              <>
                {/* Job Title */}
                <div>
                  <label className="text-xs font-medium text-zinc-400 mb-2 block">
                    Job Title
                  </label>
                  <input
                    type="text"
                    value={prospectJobTitle}
                    onChange={(e) => setProspectJobTitle(e.target.value)}
                    placeholder="e.g. VP of Sales, Head of Marketing"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-blue-500"
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <Switch
                      id="include-related"
                      checked={prospectIncludeRelated}
                      onCheckedChange={setProspectIncludeRelated}
                    />
                    <Label htmlFor="include-related" className="text-xs text-zinc-400 cursor-pointer">
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

                {/* Country */}
                <div>
                  <p className="text-xs font-medium text-zinc-400 mb-2">Countries (ISO alpha-2)</p>
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

                {/* Has Email */}
                <div className="flex items-center justify-between rounded-lg border border-zinc-700/60 bg-zinc-800/40 px-3.5 py-3">
                  <div>
                    <p className="text-sm text-zinc-300">Has email address</p>
                    <p className="text-xs text-zinc-500">Only return prospects with verified email</p>
                  </div>
                  <Switch
                    checked={prospectHasEmail}
                    onCheckedChange={setProspectHasEmail}
                  />
                </div>

                {/* Results limit */}
                <div>
                  <label className="text-xs font-medium text-zinc-400 mb-2 block">
                    Results limit
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={prospectLimit}
                    onChange={(e) =>
                      setProspectLimit(Math.min(500, Math.max(1, Number(e.target.value))))
                    }
                    className="w-28 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                  />
                  <p className="mt-1 text-xs text-zinc-600">Max 500</p>
                </div>
              </>
            )}

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
                onClick={() => setStep(3)}
                disabled={!canProceedFromStep2}
                className="gap-2 bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50"
              >
                Next
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Step 3: Preview & Create                                            */}
        {/* ------------------------------------------------------------------ */}
        {step === 3 && (
          <div className="space-y-4 mt-4">
            {/* Stats */}
            <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/40 px-4 py-3.5">
              <div className="flex items-center gap-2">
                {searchType === 'business_search' ? (
                  <Building2 className="w-4 h-4 text-violet-400 shrink-0" />
                ) : (
                  <Users className="w-4 h-4 text-violet-400 shrink-0" />
                )}
                <span className="text-sm text-zinc-300">
                  {statsLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
                      <span className="text-zinc-400">Counting matches...</span>
                    </span>
                  ) : statsCount !== null ? (
                    <>
                      <span className="font-semibold text-white">
                        ~{statsCount.toLocaleString()}
                      </span>{' '}
                      {searchType === 'business_search' ? 'companies' : 'people'} match your filters
                    </>
                  ) : (
                    <span className="text-zinc-500">Unable to get count</span>
                  )}
                </span>
              </div>
            </div>

            {/* Credit cost */}
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-start gap-2.5">
              <Coins className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm text-zinc-300">
                This search will use{' '}
                <span className="font-semibold text-amber-300">2 platform credits</span>
              </p>
            </div>

            {/* CRM exclusion */}
            <div className="rounded-lg border border-green-500/20 bg-green-500/5 px-4 py-3 flex items-start gap-2.5">
              <Shield className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
              <p className="text-sm text-zinc-300">
                CRM exclusion active — known accounts will be filtered out automatically
              </p>
            </div>

            {/* Filter summary */}
            <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <Database className="w-3.5 h-3.5 text-zinc-400" />
                <span className="text-xs font-medium text-zinc-400">Search summary</span>
              </div>
              <div className="space-y-1 text-xs text-zinc-500">
                {searchType === 'business_search' ? (
                  <>
                    {bizIndustries.length > 0 && (
                      <p>
                        <span className="text-zinc-400">Industries:</span>{' '}
                        {bizIndustries.join(', ')}
                      </p>
                    )}
                    {bizEmployeeRanges.length > 0 && (
                      <p>
                        <span className="text-zinc-400">Size:</span>{' '}
                        {bizEmployeeRanges.join(', ')}
                      </p>
                    )}
                    {bizRevenueRanges.length > 0 && (
                      <p>
                        <span className="text-zinc-400">Revenue:</span>{' '}
                        {bizRevenueRanges.join(', ')}
                      </p>
                    )}
                    {bizCountries.length > 0 && (
                      <p>
                        <span className="text-zinc-400">Countries:</span>{' '}
                        {bizCountries.join(', ')}
                      </p>
                    )}
                    {bizTechnologies.length > 0 && (
                      <p>
                        <span className="text-zinc-400">Technologies:</span>{' '}
                        {bizTechnologies.join(', ')}
                      </p>
                    )}
                    {bizIntentTopics.length > 0 && (
                      <p>
                        <span className="text-zinc-400">Intent topics:</span>{' '}
                        {bizIntentTopics.join(', ')}
                      </p>
                    )}
                    {bizIsPublic === true && (
                      <p>
                        <span className="text-zinc-400">Public companies only</span>
                      </p>
                    )}
                    {bizDomains.trim() && (
                      <p>
                        <span className="text-zinc-400">Target domains:</span>{' '}
                        {bizDomains.split('\n').filter(Boolean).join(', ')}
                      </p>
                    )}
                    <p>
                      <span className="text-zinc-400">Limit:</span> {bizLimit} results
                    </p>
                  </>
                ) : (
                  <>
                    {prospectJobTitle.trim() && (
                      <p>
                        <span className="text-zinc-400">Job title:</span> {prospectJobTitle.trim()}
                        {prospectIncludeRelated && (
                          <span className="text-zinc-600"> + related titles</span>
                        )}
                      </p>
                    )}
                    {prospectSeniorities.length > 0 && (
                      <p>
                        <span className="text-zinc-400">Seniority:</span>{' '}
                        {SENIORITY_DISPLAY.filter((g) =>
                          g.values.some((v) => prospectSeniorities.includes(v))
                        )
                          .map((g) => g.label)
                          .join(', ')}
                      </p>
                    )}
                    {prospectDepartments.length > 0 && (
                      <p>
                        <span className="text-zinc-400">Departments:</span>{' '}
                        {DEPARTMENT_OPTIONS.filter((o) =>
                          prospectDepartments.includes(o.value)
                        )
                          .map((o) => o.label)
                          .join(', ')}
                      </p>
                    )}
                    {prospectCountries.length > 0 && (
                      <p>
                        <span className="text-zinc-400">Countries:</span>{' '}
                        {prospectCountries.join(', ')}
                      </p>
                    )}
                    {prospectEmployeeRanges.length > 0 && (
                      <p>
                        <span className="text-zinc-400">Company size:</span>{' '}
                        {prospectEmployeeRanges.join(', ')}
                      </p>
                    )}
                    <p>
                      <span className="text-zinc-400">Has email:</span>{' '}
                      {prospectHasEmail ? 'Yes' : 'No'}
                    </p>
                    <p>
                      <span className="text-zinc-400">Limit:</span> {prospectLimit} results
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Table name */}
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Table Name
              </label>
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
                onClick={() => setStep(2)}
                disabled={isCreating}
                className="gap-1.5 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
              <Button
                onClick={handleCreateTable}
                disabled={isCreating}
                className="gap-2 bg-violet-600 hover:bg-violet-500 text-white"
              >
                {isCreating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Database className="w-4 h-4" />
                )}
                {isCreating ? 'Creating...' : 'Create Table'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
