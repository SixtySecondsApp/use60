import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  ChevronDown,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useParseAiArkQuery } from '@/lib/hooks/useParseAiArkQuery';
import { AiArkIndustryPicker } from './filters/AiArkIndustryPicker';
import { AiArkTechPicker } from './filters/AiArkTechPicker';
import { AiArkLocationPicker } from './filters/AiArkLocationPicker';
import { AiArkCreditWidget } from './AiArkCreditWidget';
import {
  AiArkCompanyPreviewTable,
  AiArkPeoplePreviewTable,
} from './AiArkPreviewTable';
import {
  aiArkSearchService,
  type AiArkCompanySearchParams,
  type AiArkPeopleSearchParams,
  type NormalizedAiArkCompany,
  type NormalizedAiArkContact,
} from '@/lib/services/aiArkSearchService';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMPLOYEE_PRESETS = [
  { label: '1–10', min: 1, max: 10 },
  { label: '11–50', min: 11, max: 50 },
  { label: '51–200', min: 51, max: 200 },
  { label: '201–500', min: 201, max: 500 },
  { label: '501–1K', min: 501, max: 1000 },
  { label: '1K+', min: 1001, max: undefined },
];

const SENIORITY_OPTIONS = [
  { value: 'c_suite', label: 'C-Suite' },
  { value: 'vp', label: 'VP' },
  { value: 'director', label: 'Director' },
  { value: 'manager', label: 'Manager' },
  { value: 'senior', label: 'Senior' },
  { value: 'entry', label: 'Entry' },
];

type SearchType = 'company' | 'people';
type Step = 1 | 2 | 3;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AiArkSearchWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: (tableId: string) => void;
  /** 'dialog' (default) wraps in a Dialog. 'inline' renders directly into the parent. */
  mode?: 'dialog' | 'inline';
  /** Pre-populate the domain filter (e.g. from a deal or contact card "Find Similar" button) */
  initialDomain?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AiArkSearchWizard({ open, onOpenChange, onComplete, mode = 'dialog', initialDomain }: AiArkSearchWizardProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);

  // Search type
  const [searchType, setSearchType] = useState<SearchType>('company');

  // NL query
  const [nlQuery, setNlQuery] = useState('');
  const [nlSummary, setNlSummary] = useState('');
  const parseQuery = useParseAiArkQuery();
  const isParsing = parseQuery.isPending;

  // Company filters
  const [industries, setIndustries] = useState<{ industries: string[]; tags: string[] }>({
    industries: [],
    tags: [],
  });
  const [technologies, setTechnologies] = useState<string[]>([]);
  const [locations, setLocations] = useState<{ cities: string[]; countries: string[] }>({
    cities: [],
    countries: [],
  });
  const [employeePresets, setEmployeePresets] = useState<number[]>([]);
  const [revenueMin, setRevenueMin] = useState('');
  const [revenueMax, setRevenueMax] = useState('');
  const [foundedMin, setFoundedMin] = useState('');
  const [foundedMax, setFoundedMax] = useState('');
  const [keywords, setKeywords] = useState('');

  // People-specific filters
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [titleInput, setTitleInput] = useState('');
  const [seniorities, setSeniorities] = useState<string[]>([]);

  // Domain filter (pre-populated from "Find Similar" button on deal/contact cards)
  const [domain, setDomain] = useState<string>(initialDomain ?? '');

  // Table name
  const [tableName, setTableName] = useState('');

  // Preview state
  const [previewCompanies, setPreviewCompanies] = useState<NormalizedAiArkCompany[]>([]);
  const [previewContacts, setPreviewContacts] = useState<NormalizedAiArkContact[]>([]);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [creditsConsumed, setCreditsConsumed] = useState<number | null>(null);

  // Full results
  const [fullCompanies, setFullCompanies] = useState<NormalizedAiArkCompany[]>([]);
  const [fullContacts, setFullContacts] = useState<NormalizedAiArkContact[]>([]);
  const [fullTotal, setFullTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Loading states
  const [isSearchingPreview, setIsSearchingPreview] = useState(false);
  const [isPullingFull, setIsPullingFull] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // ---------------------------------------------------------------------------
  // Derived helpers
  // ---------------------------------------------------------------------------

  const resolvedEmployeeMin = employeePresets.length > 0
    ? Math.min(...employeePresets.map((i) => EMPLOYEE_PRESETS[i].min))
    : undefined;
  const resolvedEmployeeMax = (() => {
    if (employeePresets.length === 0) return undefined;
    const maxes = employeePresets.map((i) => EMPLOYEE_PRESETS[i].max);
    if (maxes.some((m) => m === undefined)) return undefined;
    return Math.max(...(maxes as number[]));
  })();

  const buildCompanyParams = (perPage: number, page = 0): AiArkCompanySearchParams => {
    const params: AiArkCompanySearchParams = { per_page: perPage, page };
    const allIndustries = [...industries.industries, ...industries.tags];
    if (allIndustries.length) params.industry = allIndustries;
    if (technologies.length) params.technologies = technologies;
    const allLocations = [...locations.cities, ...locations.countries];
    if (allLocations.length) params.location = allLocations;
    if (resolvedEmployeeMin !== undefined) params.employee_min = resolvedEmployeeMin;
    if (resolvedEmployeeMax !== undefined) params.employee_max = resolvedEmployeeMax;
    if (revenueMin.trim()) params.revenue_min = Number(revenueMin);
    if (revenueMax.trim()) params.revenue_max = Number(revenueMax);
    if (foundedMin.trim()) params.founded_min = Number(foundedMin);
    if (foundedMax.trim()) params.founded_max = Number(foundedMax);
    if (keywords.trim()) params.keywords = keywords.trim().split(/[\s,]+/).filter(Boolean);
    if (domain.trim()) params.domain = domain.trim().split(/[\s,]+/).filter(Boolean);
    return params;
  };

  const buildPeopleParams = (perPage: number, page = 0): AiArkPeopleSearchParams => {
    const params: AiArkPeopleSearchParams = { per_page: perPage, page };
    if (jobTitles.length) params.job_title = jobTitles;
    if (seniorities.length) params.seniority_level = seniorities;
    const allLocations = [...locations.cities, ...locations.countries];
    if (allLocations.length) params.location = allLocations;
    if (domain.trim()) params.company_domain = domain.trim().split(/[\s,]+/).filter(Boolean);
    if (keywords.trim()) params.keywords = keywords.trim().split(/[\s,]+/).filter(Boolean);
    const allIndustries = [...industries.industries, ...industries.tags];
    if (allIndustries.length) params.industry = allIndustries;
    return params;
  };

  const hasFilters = searchType === 'company'
    ? industries.industries.length > 0 || industries.tags.length > 0 || technologies.length > 0 ||
      locations.cities.length > 0 || locations.countries.length > 0 || employeePresets.length > 0 ||
      revenueMin.trim() !== '' || revenueMax.trim() !== '' || foundedMin.trim() !== '' || foundedMax.trim() !== '' || keywords.trim() !== ''
    : jobTitles.length > 0 || seniorities.length > 0 || locations.cities.length > 0 || locations.countries.length > 0;

  const creditCostPerSearch = searchType === 'company' ? 2.5 : 12.5;

  // ---------------------------------------------------------------------------
  // Step 2: Preview search (5 results)
  // ---------------------------------------------------------------------------

  const handlePreviewSearch = async () => {
    setIsSearchingPreview(true);
    try {
      if (searchType === 'company') {
        const result = await aiArkSearchService.searchCompanies(buildCompanyParams(5, 0));
        setPreviewCompanies(result.companies);
        setPreviewTotal(result.pagination.total);
        setCreditsConsumed(result.credits_consumed);
      } else {
        const result = await aiArkSearchService.searchPeople(buildPeopleParams(5, 0));
        setPreviewContacts(result.contacts);
        setPreviewTotal(result.pagination.total);
        setCreditsConsumed(result.credits_consumed);
      }
      setStep(2);
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === 'AI_ARK_NOT_CONFIGURED') {
        toast.error('AI Ark is not configured. Add your API key in Settings > Integrations.');
      } else {
        toast.error(e.message || 'Search failed');
      }
    } finally {
      setIsSearchingPreview(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Step 3: Pull full page (25 results)
  // ---------------------------------------------------------------------------

  const handlePullFull = async () => {
    setIsPullingFull(true);
    try {
      if (searchType === 'company') {
        const result = await aiArkSearchService.searchCompanies(buildCompanyParams(25, 0));
        setFullCompanies(result.companies);
        setFullTotal(result.pagination.total);
        setCreditsConsumed((prev) => (prev ?? 0) + (result.credits_consumed ?? 0));
        setSelectedIds(new Set(result.companies.map((c) => c.ai_ark_id)));
      } else {
        const result = await aiArkSearchService.searchPeople(buildPeopleParams(25, 0));
        setFullContacts(result.contacts);
        setFullTotal(result.pagination.total);
        setCreditsConsumed((prev) => (prev ?? 0) + (result.credits_consumed ?? 0));
        setSelectedIds(new Set(result.contacts.map((c) => c.ai_ark_id)));
      }
      setCurrentPage(0);
      setStep(3);
    } catch (err) {
      const e = err as Error & { code?: string };
      toast.error(e.message || 'Failed to pull results');
    } finally {
      setIsPullingFull(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Step 3: Load 25 more (never auto-loads)
  // ---------------------------------------------------------------------------

  const handleLoadMore = async () => {
    setIsLoadingMore(true);
    const nextPage = currentPage + 1;
    try {
      if (searchType === 'company') {
        const result = await aiArkSearchService.searchCompanies(buildCompanyParams(25, nextPage));
        const newCompanies = result.companies;
        setFullCompanies((prev) => {
          const existingIds = new Set(prev.map((c) => c.ai_ark_id));
          return [...prev, ...newCompanies.filter((c) => !existingIds.has(c.ai_ark_id))];
        });
        setCreditsConsumed((prev) => (prev ?? 0) + (result.credits_consumed ?? 0));
      } else {
        const result = await aiArkSearchService.searchPeople(buildPeopleParams(25, nextPage));
        const newContacts = result.contacts;
        setFullContacts((prev) => {
          const existingIds = new Set(prev.map((c) => c.ai_ark_id));
          return [...prev, ...newContacts.filter((c) => !existingIds.has(c.ai_ark_id))];
        });
        setCreditsConsumed((prev) => (prev ?? 0) + (result.credits_consumed ?? 0));
      }
      setCurrentPage(nextPage);
    } catch (err) {
      const e = err as Error & { code?: string };
      toast.error(e.message || 'Failed to load more results');
    } finally {
      setIsLoadingMore(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Import selected to Ops Table
  // ---------------------------------------------------------------------------

  const handleImport = async () => {
    if (selectedIds.size === 0) {
      toast.warning('Select at least one result to import');
      return;
    }
    setIsImporting(true);
    try {
      const allIndustries = [...industries.industries, ...industries.tags];
      const queryDescription = searchType === 'company'
        ? [
            allIndustries.length ? `Industries: ${allIndustries.join(', ')}` : '',
            technologies.length ? `Technologies: ${technologies.join(', ')}` : '',
            keywords.trim() ? `Keywords: ${keywords}` : '',
          ].filter(Boolean).join(' | ') || 'AI Ark company search'
        : [
            jobTitles.length ? `Titles: ${jobTitles.join(', ')}` : '',
            seniorities.length ? `Seniority: ${seniorities.join(', ')}` : '',
          ].filter(Boolean).join(' | ') || 'AI Ark people search';

      const result = await aiArkSearchService.searchAndCreateTable({
        query_description: queryDescription,
        search_params: searchType === 'company'
          ? buildCompanyParams(selectedIds.size)
          : buildPeopleParams(selectedIds.size),
        search_type: searchType === 'company' ? 'company_search' : 'people_search',
        table_name: tableName.trim() || undefined,
      });

      toast.success(`${result.row_count} records imported`);
      onOpenChange(false);
      resetForm();
      onComplete?.(result.table_id);
      navigate(`/ops/${result.table_id}`);
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === 'AI_ARK_NOT_CONFIGURED') {
        toast.error('AI Ark is not configured. Add your API key in Settings > Integrations.');
      } else {
        toast.error(e.message || 'Import failed');
      }
    } finally {
      setIsImporting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Selection helpers
  // ---------------------------------------------------------------------------

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allIds = searchType === 'company'
      ? fullCompanies.map((c) => c.ai_ark_id)
      : fullContacts.map((c) => c.ai_ark_id);
    const allSelected = allIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  };

  const allSelected = (() => {
    const allIds = searchType === 'company'
      ? fullCompanies.map((c) => c.ai_ark_id)
      : fullContacts.map((c) => c.ai_ark_id);
    return allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
  })();

  // ---------------------------------------------------------------------------
  // NL parse → apply filters
  // ---------------------------------------------------------------------------

  const applyParseResult = (parsed: import('@/lib/hooks/useParseAiArkQuery').ParsedAiArkQuery) => {
    if (parsed.search_type) setSearchType(parsed.search_type);

    if (parsed.industry?.length || parsed.industry_tags?.length) {
      setIndustries({
        industries: parsed.industry ?? [],
        tags: parsed.industry_tags ?? [],
      });
    }

    if (parsed.technologies?.length) setTechnologies(parsed.technologies);

    if (parsed.location?.length) {
      const cities: string[] = [];
      const countries: string[] = [];
      for (const loc of parsed.location) {
        if (loc.includes(',') || loc.length <= 3) {
          cities.push(loc);
        } else {
          countries.push(loc);
        }
      }
      setLocations({ cities, countries: countries.length ? countries : cities.length ? [] : parsed.location });
    }

    if (parsed.employee_min !== undefined || parsed.employee_max !== undefined) {
      const min = parsed.employee_min ?? 0;
      const max = parsed.employee_max;
      const matchedPresets: number[] = [];
      EMPLOYEE_PRESETS.forEach((preset, idx) => {
        const presetMax = preset.max ?? Infinity;
        const presetMin = preset.min;
        if (presetMin <= (max ?? Infinity) && presetMax >= min) {
          matchedPresets.push(idx);
        }
      });
      if (matchedPresets.length) setEmployeePresets(matchedPresets);
    }

    if (parsed.revenue_min !== undefined) setRevenueMin(String(parsed.revenue_min));
    if (parsed.revenue_max !== undefined) setRevenueMax(String(parsed.revenue_max));
    if (parsed.founded_min !== undefined) setFoundedMin(String(parsed.founded_min));
    if (parsed.founded_max !== undefined) setFoundedMax(String(parsed.founded_max));
    if (parsed.keywords?.length) setKeywords(parsed.keywords.join(', '));
    if (parsed.job_title?.length) setJobTitles(parsed.job_title);
    if (parsed.seniority_level?.length) setSeniorities(parsed.seniority_level);
    if (parsed.suggested_table_name) setTableName(parsed.suggested_table_name);
    if (parsed.summary) setNlSummary(parsed.summary);
  };

  const handleParseNL = () => {
    if (!nlQuery.trim() || isParsing) return;
    parseQuery.mutate(nlQuery.trim(), {
      onSuccess: (result) => {
        applyParseResult(result);
        setNlQuery('');
      },
      onError: () => {
        toast.error('Could not parse query, try using filters directly');
      },
    });
  };

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  const resetForm = () => {
    setStep(1);
    setSearchType('company');
    setNlQuery('');
    setNlSummary('');
    parseQuery.reset();
    setIndustries({ industries: [], tags: [] });
    setTechnologies([]);
    setLocations({ cities: [], countries: [] });
    setEmployeePresets([]);
    setRevenueMin('');
    setRevenueMax('');
    setFoundedMin('');
    setFoundedMax('');
    setKeywords('');
    setJobTitles([]);
    setTitleInput('');
    setSeniorities([]);
    setTableName('');
    setPreviewCompanies([]);
    setPreviewContacts([]);
    setPreviewTotal(0);
    setFullCompanies([]);
    setFullContacts([]);
    setFullTotal(0);
    setCurrentPage(0);
    setSelectedIds(new Set());
    setCreditsConsumed(null);
  };

  // ---------------------------------------------------------------------------
  // Step labels
  // ---------------------------------------------------------------------------

  const stepLabel = step === 1
    ? 'Search AI Ark for companies or people matching your criteria'
    : step === 2
    ? `Found ${previewTotal.toLocaleString()} results — preview and pull full page`
    : `${fullCompanies.length + fullContacts.length} of ${fullTotal.toLocaleString()} loaded — select and import`;

  const hasLoadMore = searchType === 'company'
    ? fullCompanies.length < fullTotal
    : fullContacts.length < fullTotal;

  // ---------------------------------------------------------------------------
  // Render helpers — Step 1 filter sections
  // ---------------------------------------------------------------------------

  const renderCompanyFilters = () => (
    <div className="space-y-4">
      <AiArkIndustryPicker value={industries} onChange={setIndustries} />
      <AiArkTechPicker value={technologies} onChange={setTechnologies} />
      <AiArkLocationPicker value={locations} onChange={setLocations} />

      {/* Employee range presets */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">Company Size</label>
        <div className="flex flex-wrap gap-1.5">
          {EMPLOYEE_PRESETS.map((preset, idx) => {
            const active = employeePresets.includes(idx);
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setEmployeePresets((prev) =>
                    prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
                  );
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
                  active
                    ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600 hover:text-zinc-300'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Revenue range */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">Revenue Range ($M)</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={revenueMin}
            onChange={(e) => setRevenueMin(e.target.value)}
            placeholder="Min"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-blue-500"
          />
          <span className="text-zinc-600 text-xs shrink-0">to</span>
          <input
            type="number"
            value={revenueMax}
            onChange={(e) => setRevenueMax(e.target.value)}
            placeholder="Max"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Founded year range */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">Founded Year</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={foundedMin}
            onChange={(e) => setFoundedMin(e.target.value)}
            placeholder="e.g. 2010"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-blue-500"
          />
          <span className="text-zinc-600 text-xs shrink-0">to</span>
          <input
            type="number"
            value={foundedMax}
            onChange={(e) => setFoundedMax(e.target.value)}
            placeholder="e.g. 2024"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Keywords */}
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

      {/* Domain filter */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">
          Domain
          {domain && (
            <span className="ml-2 text-[10px] font-normal text-blue-400 normal-case">pre-filled from card</span>
          )}
        </label>
        <input
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="e.g. acme.com, stripe.com"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-blue-500"
        />
        <p className="mt-1 text-[10px] text-zinc-500">Filter by exact domain(s), comma-separated</p>
      </div>
    </div>
  );

  const renderPeopleFilters = () => (
    <div className="space-y-4">
      {/* Job titles */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">Job Titles</label>
        <div className="flex flex-wrap items-center gap-1.5 min-h-[36px] rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5">
          {jobTitles.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded bg-blue-500/20 px-2 py-0.5 text-xs text-blue-300 border border-blue-500/30"
            >
              {t}
              <button
                type="button"
                onClick={() => setJobTitles((prev) => prev.filter((x) => x !== t))}
                className="text-blue-400 hover:text-blue-200"
              >
                <ChevronDown className="w-3 h-3 rotate-45" />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ',') && titleInput.trim()) {
                e.preventDefault();
                const v = titleInput.trim().replace(/,$/, '');
                if (v && !jobTitles.includes(v)) setJobTitles((prev) => [...prev, v]);
                setTitleInput('');
              }
              if (e.key === 'Backspace' && !titleInput && jobTitles.length > 0) {
                setJobTitles((prev) => prev.slice(0, -1));
              }
            }}
            placeholder={jobTitles.length === 0 ? 'e.g. VP Sales, CTO — press Enter to add' : ''}
            className="flex-1 min-w-[120px] bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
          />
        </div>
      </div>

      {/* Seniority */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">Seniority</label>
        <div className="flex flex-wrap gap-1.5">
          {SENIORITY_OPTIONS.map((opt) => {
            const active = seniorities.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setSeniorities((prev) =>
                    prev.includes(opt.value)
                      ? prev.filter((s) => s !== opt.value)
                      : [...prev, opt.value]
                  );
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
                  active
                    ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600 hover:text-zinc-300'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <AiArkLocationPicker value={locations} onChange={setLocations} />
    </div>
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const innerContent = (
    <>
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Search className="w-5 h-5 text-blue-400" />
            AI Ark {searchType === 'company' ? 'Company' : 'People'} Search
          </DialogTitle>
          <DialogDescription className="text-zinc-400">{stepLabel}</DialogDescription>
          <AiArkCreditWidget creditsConsumed={creditsConsumed} />
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-2 mt-2">
          {([1, 2, 3] as const).map((s, idx) => {
            const labels = ['Search', 'Preview', 'Import'];
            const isDone = step > s;
            const isActive = step === s;
            return (
              <React.Fragment key={s}>
                {idx > 0 && <div className="flex-1 h-px bg-zinc-700" />}
                <div className={`flex items-center gap-1.5 text-xs font-medium ${
                  isActive ? 'text-blue-400' : isDone ? 'text-green-400' : 'text-zinc-500'
                }`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isActive
                      ? 'bg-blue-500 text-white'
                      : isDone
                      ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                      : 'bg-zinc-700 text-zinc-400'
                  }`}>
                    {s}
                  </div>
                  {labels[idx]}
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Step 1: Filters                                                     */}
        {/* ------------------------------------------------------------------ */}
        {step === 1 && (
          <div className="space-y-4 mt-4">
            {/* Search type toggle */}
            <div className="flex gap-1 p-1 rounded-lg bg-zinc-800 border border-zinc-700">
              <button
                type="button"
                onClick={() => setSearchType('company')}
                className={`flex-1 flex items-center justify-center gap-2 text-xs font-medium py-1.5 rounded-md transition-colors ${
                  searchType === 'company'
                    ? 'bg-zinc-700 text-white'
                    : 'text-zinc-400 hover:text-zinc-300'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                Company Search
              </button>
              <button
                type="button"
                onClick={() => setSearchType('people')}
                className={`flex-1 flex items-center justify-center gap-2 text-xs font-medium py-1.5 rounded-md transition-colors ${
                  searchType === 'people'
                    ? 'bg-zinc-700 text-white'
                    : 'text-zinc-400 hover:text-zinc-300'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                People Search
              </button>
            </div>

            {/* NL search bar */}
            <div>
              <div className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 transition-colors focus-within:border-blue-500 ${
                isParsing ? 'border-blue-500/50 bg-blue-500/5' : 'border-zinc-700 bg-zinc-800/50'
              }`}>
                {isParsing ? (
                  <Loader2 className="w-4 h-4 text-blue-400 shrink-0 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
                )}
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
                  placeholder="Describe who you're looking for, e.g. Series B fintech companies in London using React"
                  className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
                  disabled={isParsing}
                />
                {nlQuery.trim() && !isParsing && (
                  <button
                    type="button"
                    onClick={handleParseNL}
                    className="shrink-0 rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 transition-colors"
                  >
                    Parse
                  </button>
                )}
                {isParsing && (
                  <span className="shrink-0 text-xs text-blue-400">Parsing...</span>
                )}
              </div>
              {nlSummary && !isParsing && (
                <div className="mt-1.5 flex items-start gap-1.5 rounded-md border border-blue-500/20 bg-blue-500/5 px-2.5 py-1.5 text-xs text-blue-300/80">
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

            {searchType === 'company' ? renderCompanyFilters() : renderPeopleFilters()}

            <div className="flex items-center justify-between pt-2 border-t border-zinc-700/50">
              <div className="text-xs text-zinc-500">
                Cost: ~{creditCostPerSearch} credits per search
              </div>
              <Button
                onClick={handlePreviewSearch}
                disabled={!hasFilters || isSearchingPreview}
                className="gap-2 bg-blue-600 hover:bg-blue-500 text-white"
              >
                {isSearchingPreview ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                {isSearchingPreview ? 'Searching...' : 'Search AI Ark'}
              </Button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Step 2: Preview (5 results)                                         */}
        {/* ------------------------------------------------------------------ */}
        {step === 2 && (
          <div className="space-y-4 mt-4">
            {/* Header */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-300">
                Showing{' '}
                <span className="font-semibold text-white">
                  {searchType === 'company' ? previewCompanies.length : previewContacts.length}
                </span>{' '}
                of{' '}
                <span className="inline-flex items-center gap-1 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full px-2 py-0.5 text-xs font-medium">
                  {previewTotal.toLocaleString()} total
                </span>
              </span>
            </div>

            {/* Preview table */}
            {searchType === 'company' ? (
              <AiArkCompanyPreviewTable
                companies={previewCompanies}
                selectedIds={new Set()}
                onToggleSelect={() => {}}
                onSelectAll={() => {}}
                allSelected={false}
              />
            ) : (
              <AiArkPeoplePreviewTable
                contacts={previewContacts}
                selectedIds={new Set()}
                onToggleSelect={() => {}}
                onSelectAll={() => {}}
                allSelected={false}
              />
            )}

            {/* Credit cost info */}
            <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 px-3.5 py-3 text-xs text-zinc-400 space-y-1">
              <div className="flex items-center justify-between">
                <span>Full pull (25 results)</span>
                <span className="text-amber-400 font-medium">~{creditCostPerSearch} credits</span>
              </div>
              <div className="text-zinc-600">Each additional page of 25 costs ~{creditCostPerSearch} credits</div>
            </div>

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
                onClick={handlePullFull}
                disabled={isPullingFull}
                className="gap-2 bg-blue-600 hover:bg-blue-500 text-white"
              >
                {isPullingFull ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ArrowRight className="w-4 h-4" />
                )}
                {isPullingFull ? 'Pulling...' : 'Pull Full Page (25 results)'}
              </Button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Step 3: Full results + import                                       */}
        {/* ------------------------------------------------------------------ */}
        {step === 3 && (
          <div className="space-y-4 mt-4">
            {/* Header with running credit counter */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-zinc-300">
                <span className="font-semibold text-white">{selectedIds.size}</span> of{' '}
                <span className="font-semibold text-white">
                  {searchType === 'company' ? fullCompanies.length : fullContacts.length}
                </span>{' '}
                selected
                <span className="text-zinc-600 text-xs">/ {fullTotal.toLocaleString()} total</span>
              </div>
              <AiArkCreditWidget creditsConsumed={creditsConsumed} className="text-xs" />
            </div>

            {/* Full results table with checkboxes */}
            {searchType === 'company' ? (
              <AiArkCompanyPreviewTable
                companies={fullCompanies}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onSelectAll={toggleSelectAll}
                allSelected={allSelected}
              />
            ) : (
              <AiArkPeoplePreviewTable
                contacts={fullContacts}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onSelectAll={toggleSelectAll}
                allSelected={allSelected}
              />
            )}

            {/* Load 25 more — never auto-loads */}
            {hasLoadMore && (
              <Button
                variant="outline"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="w-full gap-2 border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs"
              >
                {isLoadingMore ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                {isLoadingMore ? 'Loading...' : `Load 25 more (~${creditCostPerSearch} credits)`}
              </Button>
            )}

            {/* Table name input */}
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

            <div className="flex items-center justify-between pt-2 border-t border-zinc-700/50">
              <Button
                variant="outline"
                onClick={() => setStep(2)}
                className="gap-1.5 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
              <Button
                onClick={handleImport}
                disabled={isImporting || selectedIds.size === 0}
                className="gap-2 bg-blue-600 hover:bg-blue-500 text-white"
              >
                {isImporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ArrowRight className="w-4 h-4" />
                )}
                {isImporting
                  ? 'Importing...'
                  : `Import ${selectedIds.size} Selected to Ops Table`}
              </Button>
            </div>
          </div>
        )}
    </>
  );

  if (mode === 'inline') {
    return (
      <div className="bg-zinc-900 text-white p-4 space-y-2">
        {innerContent}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-2xl bg-zinc-900 border-zinc-700 text-white max-h-[85vh] overflow-y-auto">
        {innerContent}
      </DialogContent>
    </Dialog>
  );
}
