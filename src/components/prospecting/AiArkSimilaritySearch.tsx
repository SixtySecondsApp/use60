import { useState, useCallback } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Loader2,
  Plus,
  Shuffle,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AiArkCompanyPreviewTable } from './AiArkPreviewTable';
import { AiArkCreditWidget } from './AiArkCreditWidget';
import { AiArkIndustryPicker } from './filters/AiArkIndustryPicker';
import { AiArkLocationPicker } from './filters/AiArkLocationPicker';
import { aiArkSearchService } from '@/lib/services/aiArkSearchService';
import type { NormalizedAiArkCompany } from '@/lib/services/aiArkSearchService';
import { getSupabaseAuthToken } from '@/lib/supabase/clientV2';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = 'input' | 'preview' | 'results';

const EMPLOYEE_PRESETS = [
  { label: '1–10', min: 1, max: 10 },
  { label: '11–50', min: 11, max: 50 },
  { label: '51–200', min: 51, max: 200 },
  { label: '201–500', min: 201, max: 500 },
  { label: '501–1K', min: 501, max: 1000 },
  { label: '1K+', min: 1001, max: undefined },
];

const MAX_SEED_DOMAINS = 5;

// ---------------------------------------------------------------------------
// Similarity search API call
// ---------------------------------------------------------------------------

interface SimilarityResult {
  companies: NormalizedAiArkCompany[];
  pagination: {
    total: number;
    total_pages: number;
    page: number;
    page_size: number;
    returned: number;
  };
  credits_consumed: number | null;
}

async function callSimilaritySearch(params: {
  lookalike_domains: string[];
  match_count?: number;
  page?: number;
  account?: Record<string, unknown>;
}): Promise<SimilarityResult> {
  const token = await getSupabaseAuthToken();
  if (!token) throw new Error('Not authenticated');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY;

  const body: Record<string, unknown> = {
    seed_company_domain: params.lookalike_domains[0],
    match_count: params.match_count ?? 5,
    page: params.page ?? 0,
    _auth_token: token,
  };

  // Additional domains: edge fn builds lookalikeDomains from all seed fields;
  // pass extras as seed_company_name (comma-joined) for the edge fn to split
  if (params.lookalike_domains.length > 1) {
    body.seed_company_name = params.lookalike_domains.slice(1).join(',');
  }

  if (params.account && Object.keys(params.account).length > 0) {
    body.account = params.account;
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/ai-ark-similarity`, {
    method: 'POST',
    redirect: 'error',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok || data?.error) {
    const err = new Error(data?.error || `HTTP ${response.status}`) as Error & { code?: string };
    err.code = data?.code;
    throw err;
  }

  return data as SimilarityResult;
}

// ---------------------------------------------------------------------------
// Domain chip input
// ---------------------------------------------------------------------------

interface DomainChipInputProps {
  domains: string[];
  onAdd: (domain: string) => void;
  onRemove: (domain: string) => void;
}

function DomainChipInput({ domains, onAdd, onRemove }: DomainChipInputProps) {
  const [inputValue, setInputValue] = useState('');

  const commitInput = () => {
    const raw = inputValue.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
    if (!raw) return;
    const entries = raw.split(/[\s,]+/).filter(Boolean);
    for (const entry of entries) {
      onAdd(entry);
    }
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitInput();
    }
    if (e.key === 'Backspace' && !inputValue && domains.length > 0) {
      onRemove(domains[domains.length - 1]);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 min-h-[44px] rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 focus-within:border-blue-500 transition-colors">
      {domains.map((domain) => (
        <DomainChip key={domain} domain={domain} onRemove={() => onRemove(domain)} />
      ))}
      {domains.length < MAX_SEED_DOMAINS && (
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitInput}
          placeholder={
            domains.length === 0
              ? 'e.g. stripe.com, hubspot.com — press Enter to add'
              : 'Add another domain...'
          }
          className="flex-1 min-w-[160px] bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Domain chip (with logo)
// ---------------------------------------------------------------------------

function DomainChip({ domain, onRemove }: { domain: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-700/70 border border-zinc-600/50 px-2 py-1 text-xs text-zinc-200">
      <img
        src={`https://img.logo.dev/${domain}?token=pk_X-1ZO13GSgeOoUrIuJ6GMQ&size=32&format=png`}
        alt=""
        className="w-3.5 h-3.5 rounded-sm object-contain"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
      {domain}
      <button
        type="button"
        onClick={onRemove}
        className="text-zinc-500 hover:text-zinc-200 transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Seed domain card (preview step)
// ---------------------------------------------------------------------------

function SeedDomainCard({ domain }: { domain: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-zinc-700/60 bg-zinc-800/50 px-3 py-2">
      <img
        src={`https://img.logo.dev/${domain}?token=pk_X-1ZO13GSgeOoUrIuJ6GMQ&size=32&format=png`}
        alt=""
        className="w-6 h-6 rounded-sm object-contain shrink-0 bg-zinc-700/30"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
      <span className="flex-1 text-xs font-medium text-zinc-200 truncate">{domain}</span>
      <a
        href={`https://${domain}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-zinc-600 hover:text-blue-400 transition-colors shrink-0"
      >
        <ExternalLink className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AiArkSimilaritySearch({ onComplete, initialDomain }: { onComplete: (tableId: string) => void; initialDomain?: string }) {
  const navigate = useNavigate();

  // Step state
  const [step, setStep] = useState<Step>('input');

  // Seed domains (up to 5) — pre-populate from initialDomain if provided
  const [seedDomains, setSeedDomains] = useState<string[]>(
    initialDomain ? [initialDomain] : []
  );

  // Optional refinement filters (hidden by default)
  const [showFilters, setShowFilters] = useState(false);
  const [industries, setIndustries] = useState<{ industries: string[]; tags: string[] }>({
    industries: [],
    tags: [],
  });
  const [locations, setLocations] = useState<{ cities: string[]; countries: string[] }>({
    cities: [],
    countries: [],
  });
  const [employeePresets, setEmployeePresets] = useState<number[]>([]);

  // Results
  const [previewCompanies, setPreviewCompanies] = useState<NormalizedAiArkCompany[]>([]);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [fullCompanies, setFullCompanies] = useState<NormalizedAiArkCompany[]>([]);
  const [fullTotal, setFullTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [creditsConsumed, setCreditsConsumed] = useState<number | null>(null);

  // Table name
  const [tableName, setTableName] = useState('');

  // Loading states
  const [isSearchingPreview, setIsSearchingPreview] = useState(false);
  const [isPullingFull, setIsPullingFull] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // ---------------------------------------------------------------------------
  // Derived helpers
  // ---------------------------------------------------------------------------

  const resolvedEmployeeMin =
    employeePresets.length > 0
      ? Math.min(...employeePresets.map((i) => EMPLOYEE_PRESETS[i].min))
      : undefined;

  const resolvedEmployeeMax = (() => {
    if (employeePresets.length === 0) return undefined;
    const maxes = employeePresets.map((i) => EMPLOYEE_PRESETS[i].max);
    if (maxes.some((m) => m === undefined)) return undefined;
    return Math.max(...(maxes as number[]));
  })();

  const buildAccount = (): Record<string, unknown> | undefined => {
    const account: Record<string, unknown> = {};
    const allIndustries = [...industries.industries, ...industries.tags];
    if (allIndustries.length) account.industry = { include: allIndustries };
    if (resolvedEmployeeMin !== undefined || resolvedEmployeeMax !== undefined) {
      account.employeeSize = [{ start: resolvedEmployeeMin ?? 1, end: resolvedEmployeeMax }];
    }
    const allLocations = [...locations.cities, ...locations.countries];
    if (allLocations.length) account.location = { include: allLocations };
    return Object.keys(account).length > 0 ? account : undefined;
  };

  const canSearch = seedDomains.length > 0;

  const addDomain = useCallback((domain: string) => {
    setSeedDomains((prev) => {
      if (prev.includes(domain) || prev.length >= MAX_SEED_DOMAINS) return prev;
      return [...prev, domain];
    });
  }, []);

  const removeDomain = useCallback((domain: string) => {
    setSeedDomains((prev) => prev.filter((d) => d !== domain));
  }, []);

  // ---------------------------------------------------------------------------
  // Search handlers
  // ---------------------------------------------------------------------------

  const handlePreviewSearch = async () => {
    if (!canSearch) return;
    setIsSearchingPreview(true);
    try {
      const result = await callSimilaritySearch({
        lookalike_domains: seedDomains,
        match_count: 5,
        account: buildAccount(),
      });
      setPreviewCompanies(result.companies);
      setPreviewTotal(result.pagination.total);
      setCreditsConsumed(result.credits_consumed);
      setStep('preview');
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

  const handlePullFull = async () => {
    setIsPullingFull(true);
    try {
      const result = await callSimilaritySearch({
        lookalike_domains: seedDomains,
        match_count: 25,
        account: buildAccount(),
      });
      setFullCompanies(result.companies);
      setFullTotal(result.pagination.total);
      setCreditsConsumed((prev) => (prev ?? 0) + (result.credits_consumed ?? 0));
      setSelectedIds(new Set(result.companies.map((c) => c.ai_ark_id)));
      setCurrentPage(0);
      setStep('results');
    } catch (err) {
      const e = err as Error & { code?: string };
      toast.error(e.message || 'Failed to pull results');
    } finally {
      setIsPullingFull(false);
    }
  };

  const handleLoadMore = async () => {
    setIsLoadingMore(true);
    const nextPage = currentPage + 1;
    try {
      const result = await callSimilaritySearch({
        lookalike_domains: seedDomains,
        match_count: 25,
        page: nextPage,
        account: buildAccount(),
      });
      setFullCompanies((prev) => {
        const existingIds = new Set(prev.map((c) => c.ai_ark_id));
        return [...prev, ...result.companies.filter((c) => !existingIds.has(c.ai_ark_id))];
      });
      setCreditsConsumed((prev) => (prev ?? 0) + (result.credits_consumed ?? 0));
      setCurrentPage(nextPage);
    } catch (err) {
      const e = err as Error & { code?: string };
      toast.error(e.message || 'Failed to load more');
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleImport = async () => {
    if (selectedIds.size === 0) {
      toast.warning('Select at least one company to import');
      return;
    }
    setIsImporting(true);
    try {
      const seedLabel = seedDomains.join(', ');
      const result = await aiArkSearchService.searchAndCreateTable({
        query_description: `Companies similar to ${seedLabel}`,
        search_type: 'company_search',
        table_name: tableName.trim() || `Similar to ${seedDomains[0]}`,
        search_params: {
          domain: seedDomains,
          per_page: selectedIds.size,
          page: 0,
        },
      });
      toast.success(`${result.row_count} companies imported`);
      onComplete(result.table_id);
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

  // Selection helpers
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allIds = fullCompanies.map((c) => c.ai_ark_id);
    const isAllSelected = allIds.every((id) => selectedIds.has(id));
    setSelectedIds(isAllSelected ? new Set() : new Set(allIds));
  };

  const allSelected =
    fullCompanies.length > 0 && fullCompanies.every((c) => selectedIds.has(c.ai_ark_id));

  const hasLoadMore = fullCompanies.length < fullTotal;

  const resetToInput = () => {
    setStep('input');
    setPreviewCompanies([]);
    setFullCompanies([]);
    setPreviewTotal(0);
    setFullTotal(0);
    setCurrentPage(0);
    setSelectedIds(new Set());
    setCreditsConsumed(null);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-zinc-800/60">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Find Similar Companies</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Enter up to {MAX_SEED_DOMAINS} company domains to discover lookalikes.
          </p>
        </div>
        <AiArkCreditWidget creditsConsumed={creditsConsumed} />
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2">
        {(['input', 'preview', 'results'] as const).map((s, idx) => {
          const labels = ['Seed', 'Preview', 'Import'];
          const stepOrder = ['input', 'preview', 'results'];
          const isDone = stepOrder.indexOf(step) > idx;
          const isActive = step === s;
          return (
            <div key={s} className="flex items-center gap-2">
              {idx > 0 && <div className="h-px w-8 bg-zinc-700" />}
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
                  {idx + 1}
                </div>
                {labels[idx]}
              </div>
            </div>
          );
        })}
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* Step: Input                                                           */}
      {/* -------------------------------------------------------------------- */}
      {step === 'input' && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Seed Domains{' '}
              <span className="text-zinc-600 font-normal">
                ({seedDomains.length}/{MAX_SEED_DOMAINS})
              </span>
            </label>
            <DomainChipInput
              domains={seedDomains}
              onAdd={addDomain}
              onRemove={removeDomain}
            />
            <p className="mt-1.5 text-[11px] text-zinc-600">
              Type a domain and press Enter or comma to add —{' '}
              <span className="text-zinc-500">https://</span> is stripped automatically.
            </p>
          </div>

          {/* Optional filter toggle */}
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1.5"
          >
            <Plus
              className={`w-3 h-3 transition-transform ${showFilters ? 'rotate-45' : ''}`}
            />
            {showFilters ? 'Hide' : 'Add'} optional filters to narrow results
          </button>

          {showFilters && (
            <div className="space-y-3 rounded-lg border border-zinc-700/60 bg-zinc-800/30 p-4">
              <AiArkIndustryPicker value={industries} onChange={setIndustries} />
              <AiArkLocationPicker value={locations} onChange={setLocations} />
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Company Size (optional)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {EMPLOYEE_PRESETS.map((preset, idx) => {
                    const active = employeePresets.includes(idx);
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          setEmployeePresets((prev) =>
                            prev.includes(idx)
                              ? prev.filter((i) => i !== idx)
                              : [...prev, idx]
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
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-zinc-500">~2.5 credits per search</div>
            <Button
              onClick={handlePreviewSearch}
              disabled={!canSearch || isSearchingPreview}
              className="gap-2 bg-blue-600 hover:bg-blue-500 text-white"
            >
              {isSearchingPreview ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Shuffle className="w-4 h-4" />
              )}
              {isSearchingPreview ? 'Searching...' : 'Find Similar Companies'}
            </Button>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* Step: Preview (5 results)                                             */}
      {/* -------------------------------------------------------------------- */}
      {step === 'preview' && (
        <div className="space-y-4">
          {/* Seed domain cards */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-zinc-400">Seed companies</p>
            <div className="space-y-1.5">
              {seedDomains.map((domain) => (
                <SeedDomainCard key={domain} domain={domain} />
              ))}
            </div>
          </div>

          {/* Preview count */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-300">
              Showing{' '}
              <span className="font-semibold text-white">{previewCompanies.length}</span> of{' '}
              <span className="inline-flex items-center gap-1 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full px-2 py-0.5 text-xs font-medium">
                {previewTotal.toLocaleString()} similar companies
              </span>
            </span>
          </div>

          <AiArkCompanyPreviewTable
            companies={previewCompanies}
            selectedIds={new Set()}
            onToggleSelect={() => {}}
            onSelectAll={() => {}}
            allSelected={false}
          />

          {/* Credit cost info */}
          <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 px-3.5 py-3 text-xs text-zinc-400 space-y-1">
            <div className="flex items-center justify-between">
              <span>Full pull (25 results)</span>
              <span className="text-amber-400 font-medium">~2.5 credits</span>
            </div>
            <div className="text-zinc-600">Each additional page of 25 costs ~2.5 credits</div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              onClick={resetToInput}
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

      {/* -------------------------------------------------------------------- */}
      {/* Step: Results + import                                                */}
      {/* -------------------------------------------------------------------- */}
      {step === 'results' && (
        <div className="space-y-4">
          {/* Compact seed chips */}
          <div className="flex flex-wrap gap-1.5">
            {seedDomains.map((domain) => (
              <span
                key={domain}
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700/60 bg-zinc-800/50 px-2.5 py-1 text-xs text-zinc-300"
              >
                <img
                  src={`https://img.logo.dev/${domain}?token=pk_X-1ZO13GSgeOoUrIuJ6GMQ&size=32&format=png`}
                  alt=""
                  className="w-3.5 h-3.5 rounded-sm object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                {domain}
              </span>
            ))}
          </div>

          {/* Results header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-zinc-300">
              <span className="font-semibold text-white">{selectedIds.size}</span> of{' '}
              <span className="font-semibold text-white">{fullCompanies.length}</span> selected
              <span className="text-zinc-600 text-xs">/ {fullTotal.toLocaleString()} total</span>
            </div>
            <AiArkCreditWidget creditsConsumed={creditsConsumed} className="text-xs" />
          </div>

          <AiArkCompanyPreviewTable
            companies={fullCompanies}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onSelectAll={toggleSelectAll}
            allSelected={allSelected}
          />

          {/* Load more */}
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
              {isLoadingMore ? 'Loading...' : 'Load 25 more (~2.5 credits)'}
            </Button>
          )}

          {/* Table name input */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Table Name (optional)
            </label>
            <input
              type="text"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              placeholder={`Similar to ${seedDomains[0] ?? 'seed company'}`}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-blue-500"
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-zinc-700/50">
            <Button
              variant="outline"
              onClick={() => setStep('preview')}
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
                : `Import ${selectedIds.size} Companies to Ops Table`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
