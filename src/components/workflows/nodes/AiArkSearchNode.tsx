import React, { memo, useState, useEffect, useCallback } from 'react';
import { NodeProps, Handle, Position, useReactFlow } from 'reactflow';
import {
  Search,
  Building2,
  Users,
  Layers,
  Loader2,
  ChevronDown,
  ChevronUp,
  Coins,
  AlertCircle,
} from 'lucide-react';
import { ModernNodeCard, HANDLE_STYLES } from './ModernNodeCard';
import {
  executeAiArkSearch,
  estimateCreditCost,
  CREDIT_COSTS,
  type AiArkAction,
  type AiArkSearchNodeConfig,
  type SeniorityLevel,
} from '@/lib/workflows/nodeExecutors/aiArkSearchExecutor';

// ─── Data shape stored in the ReactFlow node ─────────────────────────────────

export interface AiArkSearchNodeData extends AiArkSearchNodeConfig {
  label?: string;
  // Runtime state
  isSearching?: boolean;
  searchError?: string;
  lastResultCount?: number;
  lastTotalCount?: number;
  creditsConsumed?: number;
  // Collapsed config panel
  configExpanded?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTION_OPTIONS: { value: AiArkAction; label: string; icon: React.ElementType; color: string }[] = [
  { value: 'company_search', label: 'Company Search', icon: Building2, color: 'text-blue-500' },
  { value: 'people_search', label: 'People Search', icon: Users, color: 'text-violet-500' },
  { value: 'similarity_search', label: 'Similarity Search', icon: Layers, color: 'text-emerald-500' },
];

const SENIORITY_OPTIONS: { value: SeniorityLevel; label: string }[] = [
  { value: 'C_SUITE', label: 'C-Suite' },
  { value: 'VP', label: 'VP' },
  { value: 'DIRECTOR', label: 'Director' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'SENIOR', label: 'Senior IC' },
  { value: 'ENTRY', label: 'Entry Level' },
  { value: 'INDIVIDUAL_CONTRIBUTOR', label: 'Individual Contributor' },
];

const EMPLOYEE_RANGES = [
  { label: 'Any size', min: undefined, max: undefined },
  { label: '1–10', min: 1, max: 10 },
  { label: '11–50', min: 11, max: 50 },
  { label: '51–200', min: 51, max: 200 },
  { label: '201–500', min: 201, max: 500 },
  { label: '501–1000', min: 501, max: 1000 },
  { label: '1001–5000', min: 1001, max: 5000 },
  { label: '5000+', min: 5001, max: undefined },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a comma-separated string into a trimmed string array */
function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Render a comma-separated string from an array */
function joinCsv(arr?: string[]): string {
  return arr ? arr.join(', ') : '';
}

// ─── Component ────────────────────────────────────────────────────────────────

const AiArkSearchNode = memo(({ id, data, selected }: NodeProps<AiArkSearchNodeData>) => {
  const { setNodes } = useReactFlow();

  // Local state mirrors node data fields for controlled inputs
  const [action, setAction] = useState<AiArkAction>(data.action ?? 'company_search');
  const [configExpanded, setConfigExpanded] = useState(data.configExpanded ?? true);
  const [isSearching, setIsSearching] = useState(data.isSearching ?? false);

  // Company search fields
  const [industry, setIndustry] = useState(joinCsv(data.industry));
  const [location, setLocation] = useState(joinCsv(data.location));
  const [technologies, setTechnologies] = useState(joinCsv(data.technologies));
  const [keywords, setKeywords] = useState(joinCsv(data.keywords));
  const [companyName, setCompanyName] = useState(data.company_name ?? '');
  const [domain, setDomain] = useState(joinCsv(data.domain));
  const [employeeRange, setEmployeeRange] = useState<string>('Any size');

  // People search fields
  const [jobTitle, setJobTitle] = useState(joinCsv(data.job_title));
  const [seniorityLevel, setSeniorityLevel] = useState<SeniorityLevel[]>(data.seniority_level ?? []);
  const [personName, setPersonName] = useState(data.name ?? '');
  const [companyDomain, setCompanyDomain] = useState(joinCsv(data.company_domain));

  // Similarity search fields
  const [lookalikeDomains, setLookalikeDomains] = useState(joinCsv(data.lookalike_domains));

  // Sync from external data changes
  useEffect(() => {
    setAction(data.action ?? 'company_search');
    setIsSearching(data.isSearching ?? false);
    setConfigExpanded(data.configExpanded ?? true);
  }, [data.action, data.isSearching, data.configExpanded]);

  // ── Update node data helper ──────────────────────────────────────────────

  const updateNodeData = useCallback(
    (updates: Partial<AiArkSearchNodeData>) => {
      setNodes((nodes) =>
        nodes.map((node) =>
          node.id === id
            ? { ...node, data: { ...node.data, ...updates } }
            : node
        )
      );
    },
    [id, setNodes]
  );

  // ── Action change ────────────────────────────────────────────────────────

  const handleActionChange = (newAction: AiArkAction) => {
    setAction(newAction);
    updateNodeData({ action: newAction, searchError: undefined });
  };

  // ── Employee range selector ───────────────────────────────────────────────

  const handleEmployeeRangeChange = (label: string) => {
    setEmployeeRange(label);
    const range = EMPLOYEE_RANGES.find((r) => r.label === label);
    updateNodeData({
      employee_min: range?.min,
      employee_max: range?.max,
    });
  };

  // ── Seniority toggle ─────────────────────────────────────────────────────

  const toggleSeniority = (level: SeniorityLevel) => {
    const updated = seniorityLevel.includes(level)
      ? seniorityLevel.filter((l) => l !== level)
      : [...seniorityLevel, level];
    setSeniorityLevel(updated);
    updateNodeData({ seniority_level: updated });
  };

  // ── Run search ───────────────────────────────────────────────────────────

  const handleSearch = async (e: React.MouseEvent) => {
    e.stopPropagation();

    setIsSearching(true);
    updateNodeData({ isSearching: true, searchError: undefined });

    // Snapshot current config into node data before executing
    const config = buildConfig();
    updateNodeData(config);

    try {
      const result = await executeAiArkSearch(config);
      updateNodeData({
        isSearching: false,
        searchError: undefined,
        lastResultCount: result.pagination.returned,
        lastTotalCount: result.total_count,
        creditsConsumed: result.credits_consumed,
        // Downstream nodes read from node.data.results / .companies / .contacts
        ...(result.companies ? { results: result.companies } : {}),
        ...(result.contacts ? { results: result.contacts } : {}),
      });
      setIsSearching(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Search failed';
      updateNodeData({ isSearching: false, searchError: message });
      setIsSearching(false);
    }
  };

  // ── Build config from current local state ─────────────────────────────────

  function buildConfig(): AiArkSearchNodeConfig {
    const base: AiArkSearchNodeConfig = { action, preview_mode: false };

    if (action === 'company_search') {
      if (industry) base.industry = parseCsv(industry);
      if (location) base.location = parseCsv(location);
      if (technologies) base.technologies = parseCsv(technologies);
      if (keywords) base.keywords = parseCsv(keywords);
      if (companyName) base.company_name = companyName;
      if (domain) base.domain = parseCsv(domain);
      const range = EMPLOYEE_RANGES.find((r) => r.label === employeeRange);
      if (range?.min != null) base.employee_min = range.min;
      if (range?.max != null) base.employee_max = range.max;
    } else if (action === 'people_search') {
      if (jobTitle) base.job_title = parseCsv(jobTitle);
      if (seniorityLevel.length) base.seniority_level = seniorityLevel;
      if (personName) base.name = personName;
      if (companyDomain) base.company_domain = parseCsv(companyDomain);
      if (location) base.location = parseCsv(location);
      if (companyName) base.company_name = companyName;
    } else {
      // similarity_search
      if (lookalikeDomains) base.lookalike_domains = parseCsv(lookalikeDomains);
    }

    return base;
  }

  // ── Derived display ──────────────────────────────────────────────────────

  const actionOption = ACTION_OPTIONS.find((o) => o.value === action)!;
  const ActionIcon = actionOption.icon;
  const creditInfo = CREDIT_COSTS[action];
  const hasResults = data.lastResultCount != null;

  // ── Header run button ────────────────────────────────────────────────────

  const RunButton = (
    <button
      onClick={handleSearch}
      disabled={isSearching}
      className={`p-1 rounded transition-colors ${
        isSearching
          ? 'text-gray-400 dark:text-zinc-500'
          : 'text-gray-500 dark:text-zinc-400 hover:text-violet-500 dark:hover:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-500/10'
      }`}
      title="Run search"
    >
      {isSearching ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <Search size={14} />
      )}
    </button>
  );

  return (
    <ModernNodeCard
      selected={selected}
      icon={Search}
      title="AI Ark Search"
      subtitle={actionOption.label}
      color="text-violet-600 dark:text-violet-400"
      headerAction={RunButton}
      className="w-[360px]"
      handles={
        <>
          {/* Input */}
          <Handle
            type="target"
            position={Position.Left}
            id="input"
            className={HANDLE_STYLES}
            style={{ top: '50%' }}
          />
          {/* Output handles */}
          <Handle
            type="source"
            position={Position.Right}
            id="results"
            className={HANDLE_STYLES}
            style={{ top: '30%' }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="first_result"
            className={HANDLE_STYLES}
            style={{ top: '50%' }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="meta"
            className={HANDLE_STYLES}
            style={{ top: '70%' }}
          />
        </>
      }
      handleLeft={false}
      handleRight={false}
    >
      <div>
        {/* ── Action selector ─────────────────────────────────────────── */}
        <div className="p-3 border-b border-gray-200 dark:border-zinc-800 bg-white dark:bg-[#1e1e1e]">
          <div className="grid grid-cols-3 gap-1">
            {ACTION_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isActive = action === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={(e) => { e.stopPropagation(); handleActionChange(opt.value); }}
                  className={`flex flex-col items-center gap-0.5 p-1.5 rounded text-[9px] font-medium border transition-colors nodrag ${
                    isActive
                      ? 'bg-violet-100 dark:bg-violet-500/10 border-violet-300 dark:border-violet-500/30 text-violet-700 dark:text-violet-300'
                      : 'border-gray-200 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 hover:border-gray-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <Icon size={12} />
                  {opt.label.split(' ')[0]}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Config panel ────────────────────────────────────────────── */}
        <div className="border-b border-gray-200 dark:border-zinc-800">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setConfigExpanded((v) => !v);
              updateNodeData({ configExpanded: !configExpanded });
            }}
            className="nodrag w-full flex items-center justify-between px-3 py-2 text-[10px] font-medium text-gray-500 dark:text-zinc-500 uppercase tracking-wider hover:bg-gray-50 dark:hover:bg-zinc-900/30 transition-colors"
          >
            <span>Filters</span>
            {configExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          {configExpanded && (
            <div className="px-3 pb-3 space-y-2 bg-white dark:bg-[#1e1e1e]">
              {/* ── Company Search Fields ─── */}
              {action === 'company_search' && (
                <>
                  <Field label="Industries (comma-separated)">
                    <input
                      type="text"
                      value={industry}
                      onChange={(e) => { setIndustry(e.target.value); updateNodeData({ industry: parseCsv(e.target.value) }); }}
                      onClick={(e) => e.stopPropagation()}
                      className={INPUT_CLS}
                      placeholder="software development, fintech"
                    />
                  </Field>
                  <Field label="Company Name">
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => { setCompanyName(e.target.value); updateNodeData({ company_name: e.target.value }); }}
                      onClick={(e) => e.stopPropagation()}
                      className={INPUT_CLS}
                      placeholder="Acme Corp or {{contact.company}}"
                    />
                  </Field>
                  <Field label="Employee Size">
                    <select
                      value={employeeRange}
                      onChange={(e) => handleEmployeeRangeChange(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className={INPUT_CLS}
                    >
                      {EMPLOYEE_RANGES.map((r) => (
                        <option key={r.label} value={r.label}>{r.label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Location (countries/cities, comma-separated)">
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => { setLocation(e.target.value); updateNodeData({ location: parseCsv(e.target.value) }); }}
                      onClick={(e) => e.stopPropagation()}
                      className={INPUT_CLS}
                      placeholder="United States, United Kingdom"
                    />
                  </Field>
                  <Field label="Technologies (comma-separated)">
                    <input
                      type="text"
                      value={technologies}
                      onChange={(e) => { setTechnologies(e.target.value); updateNodeData({ technologies: parseCsv(e.target.value) }); }}
                      onClick={(e) => e.stopPropagation()}
                      className={INPUT_CLS}
                      placeholder="salesforce, hubspot"
                    />
                  </Field>
                  <Field label="Keywords (comma-separated)">
                    <input
                      type="text"
                      value={keywords}
                      onChange={(e) => { setKeywords(e.target.value); updateNodeData({ keywords: parseCsv(e.target.value) }); }}
                      onClick={(e) => e.stopPropagation()}
                      className={INPUT_CLS}
                      placeholder="AI, machine learning"
                    />
                  </Field>
                  <Field label="Domains (comma-separated)">
                    <input
                      type="text"
                      value={domain}
                      onChange={(e) => { setDomain(e.target.value); updateNodeData({ domain: parseCsv(e.target.value) }); }}
                      onClick={(e) => e.stopPropagation()}
                      className={INPUT_CLS}
                      placeholder="acme.com, example.io"
                    />
                  </Field>
                </>
              )}

              {/* ── People Search Fields ─── */}
              {action === 'people_search' && (
                <>
                  <Field label="Job Titles (comma-separated)">
                    <input
                      type="text"
                      value={jobTitle}
                      onChange={(e) => { setJobTitle(e.target.value); updateNodeData({ job_title: parseCsv(e.target.value) }); }}
                      onClick={(e) => e.stopPropagation()}
                      className={INPUT_CLS}
                      placeholder="VP of Sales, Head of Marketing"
                    />
                  </Field>
                  <Field label="Seniority">
                    <div className="flex flex-wrap gap-1">
                      {SENIORITY_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={(e) => { e.stopPropagation(); toggleSeniority(opt.value); }}
                          className={`nodrag px-1.5 py-0.5 rounded text-[9px] border transition-colors ${
                            seniorityLevel.includes(opt.value)
                              ? 'bg-violet-100 dark:bg-violet-500/10 border-violet-300 dark:border-violet-500/30 text-violet-700 dark:text-violet-300'
                              : 'border-gray-200 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 hover:border-gray-300 dark:hover:border-zinc-700'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Person Name">
                    <input
                      type="text"
                      value={personName}
                      onChange={(e) => { setPersonName(e.target.value); updateNodeData({ name: e.target.value }); }}
                      onClick={(e) => e.stopPropagation()}
                      className={INPUT_CLS}
                      placeholder="John Smith or {{contact.name}}"
                    />
                  </Field>
                  <Field label="Company Domain (comma-separated)">
                    <input
                      type="text"
                      value={companyDomain}
                      onChange={(e) => { setCompanyDomain(e.target.value); updateNodeData({ company_domain: parseCsv(e.target.value) }); }}
                      onClick={(e) => e.stopPropagation()}
                      className={INPUT_CLS}
                      placeholder="acme.com or {{deal.company_domain}}"
                    />
                  </Field>
                  <Field label="Company Name">
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => { setCompanyName(e.target.value); updateNodeData({ company_name: e.target.value }); }}
                      onClick={(e) => e.stopPropagation()}
                      className={INPUT_CLS}
                      placeholder="Acme Corp"
                    />
                  </Field>
                  <Field label="Location (comma-separated)">
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => { setLocation(e.target.value); updateNodeData({ location: parseCsv(e.target.value) }); }}
                      onClick={(e) => e.stopPropagation()}
                      className={INPUT_CLS}
                      placeholder="New York, London"
                    />
                  </Field>
                </>
              )}

              {/* ── Similarity Search Fields ─── */}
              {action === 'similarity_search' && (
                <Field label="Lookalike Domains (up to 5, comma-separated)">
                  <input
                    type="text"
                    value={lookalikeDomains}
                    onChange={(e) => { setLookalikeDomains(e.target.value); updateNodeData({ lookalike_domains: parseCsv(e.target.value) }); }}
                    onClick={(e) => e.stopPropagation()}
                    className={INPUT_CLS}
                    placeholder="stripe.com, twilio.com"
                  />
                  <p className="text-[9px] text-gray-400 dark:text-zinc-600 mt-0.5">
                    Finds companies similar to these. Supports template variables.
                  </p>
                </Field>
              )}
            </div>
          )}
        </div>

        {/* ── Credit cost indicator ────────────────────────────────────── */}
        <div className="px-3 py-2 flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-zinc-500 border-b border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-[#252525]">
          <Coins size={10} className="text-amber-500" />
          <span>{estimateCreditCost(action)}</span>
          {data.creditsConsumed != null && (
            <span className="ml-auto text-amber-600 dark:text-amber-400">
              Last: {data.creditsConsumed.toFixed(2)} credits
            </span>
          )}
        </div>

        {/* ── Error display ────────────────────────────────────────────── */}
        {data.searchError && (
          <div className="p-3 bg-white dark:bg-[#1e1e1e]">
            <div className="flex items-start gap-1.5 text-[10px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-400/10 p-2 rounded border border-red-200 dark:border-red-400/20">
              <AlertCircle size={10} className="mt-0.5 shrink-0" />
              <span>{data.searchError}</span>
            </div>
          </div>
        )}

        {/* ── Results summary ──────────────────────────────────────────── */}
        <div className="px-3 py-2 flex items-center justify-between text-[10px] text-gray-500 dark:text-zinc-500 bg-white dark:bg-[#1e1e1e]">
          <div className="flex items-center gap-1">
            <ActionIcon size={10} className={actionOption.color} />
            <span>
              {hasResults
                ? `${data.lastResultCount} of ${data.lastTotalCount?.toLocaleString()} results`
                : 'Not run yet'}
            </span>
          </div>
          <span className="px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 border border-violet-200 dark:border-violet-500/20">
            AI Ark
          </span>
        </div>

        {/* ── Handle labels ────────────────────────────────────────────── */}
        <div className="absolute right-0 top-0 h-full pointer-events-none" style={{ width: 0 }}>
          {[
            { label: 'results[]', top: '30%' },
            { label: 'first', top: '50%' },
            { label: 'meta', top: '70%' },
          ].map(({ label, top }) => (
            <div
              key={label}
              className="absolute right-5 text-[8px] text-gray-400 dark:text-zinc-600 whitespace-nowrap"
              style={{ top, transform: 'translateY(-50%)' }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    </ModernNodeCard>
  );
});

AiArkSearchNode.displayName = 'AiArkSearchNode';
export default AiArkSearchNode;

// ─── Shared input class ───────────────────────────────────────────────────────

const INPUT_CLS =
  'nodrag w-full text-xs text-gray-700 dark:text-zinc-300 bg-gray-50 dark:bg-zinc-900/50 p-1.5 rounded border border-gray-200 dark:border-zinc-800 hover:border-violet-400 dark:hover:border-violet-500 focus:border-violet-500 outline-none';

// ─── Field wrapper ────────────────────────────────────────────────────────────

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1">
    <label className="text-[10px] font-medium text-gray-500 dark:text-zinc-500 uppercase tracking-wider">
      {label}
    </label>
    {children}
  </div>
);
