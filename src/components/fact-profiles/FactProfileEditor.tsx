/**
 * FactProfileEditor -- Main editor component for Fact Profiles.
 *
 * 8 collapsible sections mapping to FactProfileResearchData. Uses controlled
 * inputs with a 1-second debounced auto-save. Header bar with navigation,
 * status badges, and action buttons.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  TrendingUp,
  Package,
  Users,
  DollarSign,
  Cpu,
  Target,
  Newspaper,
  X,
  Plus,
  Loader2,
  Send,
  Sparkles,
} from 'lucide-react';
import { FactProfileSection } from './FactProfileSection';
import type {
  FactProfile,
  FactProfileResearchData,
  ApprovalStatus,
  ResearchStatus,
  CompanyOverviewSection,
  MarketPositionSection,
  ProductsServicesSection,
  TeamLeadershipSection,
  FinancialsSection,
  TechnologySection,
  IdealCustomerIndicatorsSection,
  RecentActivitySection,
} from '@/lib/types/factProfile';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FactProfileEditorProps {
  profile: FactProfile;
  onSave: (data: Partial<FactProfileResearchData>) => void;
  onStatusChange: (status: ApprovalStatus) => void;
  onResearch?: () => void;
  isSaving: boolean;
}

// ---------------------------------------------------------------------------
// Status badge helpers
// ---------------------------------------------------------------------------

const RESEARCH_STATUS_STYLES: Record<ResearchStatus, string> = {
  pending: 'bg-[#F8FAFC] text-[#64748B] border-[#E2E8F0] dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
  researching: 'bg-brand-blue/10 text-brand-blue border-brand-blue/20 dark:bg-brand-blue/10 dark:text-blue-400 dark:border-brand-blue/30',
  complete: 'bg-brand-teal/10 text-brand-teal border-brand-teal/20 dark:bg-brand-teal/10 dark:text-emerald-400 dark:border-brand-teal/30',
  failed: 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
};

const RESEARCH_STATUS_LABELS: Record<ResearchStatus, string> = {
  pending: 'Pending Research',
  researching: 'Researching...',
  complete: 'Research Complete',
  failed: 'Research Failed',
};

const APPROVAL_STATUS_STYLES: Record<ApprovalStatus, string> = {
  draft: 'bg-[#F8FAFC] text-[#64748B] border-[#E2E8F0] dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
  pending_review: 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
  approved: 'bg-brand-teal/10 text-brand-teal border-brand-teal/20 dark:bg-brand-teal/10 dark:text-emerald-400 dark:border-brand-teal/30',
  changes_requested: 'bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800',
  archived: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-500 dark:border-gray-700',
};

const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  draft: 'Draft',
  pending_review: 'Pending Review',
  approved: 'Approved',
  changes_requested: 'Changes Requested',
  archived: 'Archived',
};

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

/** Standard text input with consistent styling */
function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-[#64748B] dark:text-gray-400">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-[#E2E8F0] dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-[#1E293B] dark:text-gray-100 bg-white dark:bg-gray-800/50 placeholder:text-[#94A3B8] dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-colors"
      />
    </div>
  );
}

/** Textarea input */
function FieldTextarea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-[#64748B] dark:text-gray-400">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full border border-[#E2E8F0] dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-[#1E293B] dark:text-gray-100 bg-white dark:bg-gray-800/50 placeholder:text-[#94A3B8] dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-colors resize-none"
      />
    </div>
  );
}

/** Tag chips with add/remove */
function TagField({
  label,
  tags,
  onChange,
  placeholder,
}: {
  label: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && inputValue.trim()) {
      e.preventDefault();
      const trimmed = inputValue.trim().replace(/,$/g, '');
      if (trimmed && !tags.includes(trimmed)) {
        onChange([...tags, trimmed]);
      }
      setInputValue('');
    }
    if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-[#64748B] dark:text-gray-400">
        {label}
      </label>
      <div className="flex flex-wrap gap-1.5 p-2 min-h-[40px] border border-[#E2E8F0] dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800/50 focus-within:ring-2 focus-within:ring-brand-blue/20 focus-within:border-brand-blue transition-colors">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#F8FAFC] dark:bg-gray-800 text-[#1E293B] dark:text-gray-200 text-xs border border-[#E2E8F0] dark:border-gray-700"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="text-[#94A3B8] dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : 'Add more...'}
          className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-sm text-[#1E293B] dark:text-gray-100 placeholder:text-[#94A3B8] dark:placeholder:text-gray-500"
        />
      </div>
      <p className="text-xs text-[#94A3B8] dark:text-gray-500">Press Enter or comma to add</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default empty sections
// ---------------------------------------------------------------------------

const EMPTY_OVERVIEW: CompanyOverviewSection = {
  name: '',
  tagline: '',
  description: '',
  founded_year: null,
  headquarters: '',
  company_type: '',
  website: '',
};

const EMPTY_MARKET: MarketPositionSection = {
  industry: '',
  sub_industries: [],
  target_market: '',
  market_size: '',
  differentiators: [],
  competitors: [],
};

const EMPTY_PRODUCTS: ProductsServicesSection = {
  products: [],
  use_cases: [],
  pricing_model: '',
  key_features: [],
};

const EMPTY_TEAM: TeamLeadershipSection = {
  employee_count: null,
  employee_range: '',
  key_people: [],
  departments: [],
  hiring_signals: [],
};

const EMPTY_FINANCIALS: FinancialsSection = {
  revenue_range: '',
  funding_status: '',
  funding_rounds: [],
  total_raised: '',
  investors: [],
  valuation: '',
};

const EMPTY_TECHNOLOGY: TechnologySection = {
  tech_stack: [],
  platforms: [],
  integrations: [],
};

const EMPTY_ICP_INDICATORS: IdealCustomerIndicatorsSection = {
  target_industries: [],
  target_company_sizes: [],
  target_roles: [],
  buying_signals: [],
  pain_points: [],
  value_propositions: [],
};

const EMPTY_ACTIVITY: RecentActivitySection = {
  news: [],
  awards: [],
  milestones: [],
  reviews_summary: {},
};

// ---------------------------------------------------------------------------
// Section completeness checkers
// ---------------------------------------------------------------------------

function isOverviewComplete(s: CompanyOverviewSection): boolean {
  return !!(s.name && s.description);
}

function isMarketComplete(s: MarketPositionSection): boolean {
  return !!(s.industry && s.differentiators.length > 0);
}

function isProductsComplete(s: ProductsServicesSection): boolean {
  return s.products.length > 0 || s.key_features.length > 0;
}

function isTeamComplete(s: TeamLeadershipSection): boolean {
  return s.key_people.length > 0 || !!s.employee_range;
}

function isFinancialsComplete(s: FinancialsSection): boolean {
  return !!(s.revenue_range || s.funding_status || s.total_raised);
}

function isTechComplete(s: TechnologySection): boolean {
  return s.tech_stack.length > 0;
}

function isICPComplete(s: IdealCustomerIndicatorsSection): boolean {
  return s.pain_points.length > 0 || s.value_propositions.length > 0;
}

function isActivityComplete(s: RecentActivitySection): boolean {
  return s.news.length > 0 || s.milestones.length > 0;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FactProfileEditor({
  profile,
  onSave,
  onStatusChange,
  onResearch,
  isSaving,
}: FactProfileEditorProps) {
  const navigate = useNavigate();

  // Initialize section state from profile research_data
  const rd = profile.research_data;

  const [overview, setOverview] = useState<CompanyOverviewSection>({
    ...EMPTY_OVERVIEW,
    ...rd?.company_overview,
  });
  const [market, setMarket] = useState<MarketPositionSection>({
    ...EMPTY_MARKET,
    ...rd?.market_position,
  });
  const [products, setProducts] = useState<ProductsServicesSection>({
    ...EMPTY_PRODUCTS,
    ...rd?.products_services,
  });
  const [team, setTeam] = useState<TeamLeadershipSection>({
    ...EMPTY_TEAM,
    ...rd?.team_leadership,
  });
  const [financials, setFinancials] = useState<FinancialsSection>({
    ...EMPTY_FINANCIALS,
    ...rd?.financials,
  });
  const [technology, setTechnology] = useState<TechnologySection>({
    ...EMPTY_TECHNOLOGY,
    ...rd?.technology,
  });
  const [icpIndicators, setIcpIndicators] = useState<IdealCustomerIndicatorsSection>({
    ...EMPTY_ICP_INDICATORS,
    ...rd?.ideal_customer_indicators,
  });
  const [activity, setActivity] = useState<RecentActivitySection>({
    ...EMPTY_ACTIVITY,
    ...rd?.recent_activity,
  });

  // Key people mini-form state
  const [newPersonName, setNewPersonName] = useState('');
  const [newPersonTitle, setNewPersonTitle] = useState('');

  // Funding round mini-form state
  const [newRound, setNewRound] = useState('');
  const [newRoundAmount, setNewRoundAmount] = useState('');
  const [newRoundDate, setNewRoundDate] = useState('');

  // News mini-form state
  const [newNewsTitle, setNewNewsTitle] = useState('');
  const [newNewsUrl, setNewNewsUrl] = useState('');
  const [newNewsDate, setNewNewsDate] = useState('');

  // --- Debounced auto-save ---
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  const collectAllData = useCallback((): Partial<FactProfileResearchData> => ({
    company_overview: overview,
    market_position: market,
    products_services: products,
    team_leadership: team,
    financials: financials,
    technology: technology,
    ideal_customer_indicators: icpIndicators,
    recent_activity: activity,
  }), [overview, market, products, team, financials, technology, icpIndicators, activity]);

  useEffect(() => {
    // Skip auto-save on first render (initial hydration)
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      onSave(collectAllData());
    }, 1000);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [overview, market, products, team, financials, technology, icpIndicators, activity, collectAllData, onSave]);

  // --- Key people helpers ---
  const addPerson = () => {
    if (!newPersonName.trim()) return;
    setTeam((prev) => ({
      ...prev,
      key_people: [...prev.key_people, { name: newPersonName.trim(), title: newPersonTitle.trim() }],
    }));
    setNewPersonName('');
    setNewPersonTitle('');
  };

  const removePerson = (index: number) => {
    setTeam((prev) => ({
      ...prev,
      key_people: prev.key_people.filter((_, i) => i !== index),
    }));
  };

  // --- Funding round helpers ---
  const addFundingRound = () => {
    if (!newRound.trim()) return;
    setFinancials((prev) => ({
      ...prev,
      funding_rounds: [
        ...prev.funding_rounds,
        { round: newRound.trim(), amount: newRoundAmount.trim(), date: newRoundDate.trim() },
      ],
    }));
    setNewRound('');
    setNewRoundAmount('');
    setNewRoundDate('');
  };

  const removeFundingRound = (index: number) => {
    setFinancials((prev) => ({
      ...prev,
      funding_rounds: prev.funding_rounds.filter((_, i) => i !== index),
    }));
  };

  // --- News helpers ---
  const addNews = () => {
    if (!newNewsTitle.trim()) return;
    setActivity((prev) => ({
      ...prev,
      news: [
        ...prev.news,
        { title: newNewsTitle.trim(), url: newNewsUrl.trim(), date: newNewsDate.trim() },
      ],
    }));
    setNewNewsTitle('');
    setNewNewsUrl('');
    setNewNewsDate('');
  };

  const removeNews = (index: number) => {
    setActivity((prev) => ({
      ...prev,
      news: prev.news.filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-gray-950">
      {/* ---- Header bar ---- */}
      <div className="sticky top-0 z-10 border-b border-[#E2E8F0] dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
        <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-3">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Back */}
            <button
              type="button"
              onClick={() => navigate('/fact-profiles')}
              className="flex items-center gap-1.5 text-sm text-[#64748B] dark:text-gray-400 hover:text-[#1E293B] dark:hover:text-gray-100 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back</span>
            </button>

            {/* Separator */}
            <div className="h-5 w-px bg-[#E2E8F0] dark:bg-gray-700" />

            {/* Company info */}
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-base font-semibold text-[#1E293B] dark:text-gray-100 truncate">
                {profile.company_name}
              </h1>
              {profile.company_domain && (
                <span className="text-xs text-[#94A3B8] dark:text-gray-500 hidden sm:inline">
                  {profile.company_domain}
                </span>
              )}
            </div>

            {/* Badges */}
            <div className="flex items-center gap-2 ml-auto flex-shrink-0">
              {/* Research status */}
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${RESEARCH_STATUS_STYLES[profile.research_status]}`}
              >
                {RESEARCH_STATUS_LABELS[profile.research_status]}
              </span>

              {/* Approval status */}
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${APPROVAL_STATUS_STYLES[profile.approval_status]}`}
              >
                {APPROVAL_STATUS_LABELS[profile.approval_status]}
              </span>

              {/* Saving indicator */}
              {isSaving && (
                <span className="inline-flex items-center gap-1 text-xs text-[#94A3B8] dark:text-gray-500">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Saving
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {onResearch && (
                <button
                  type="button"
                  onClick={onResearch}
                  disabled={profile.research_status === 'researching'}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-violet/10 text-brand-violet border border-brand-violet/20 hover:bg-brand-violet/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Run Research
                </button>
              )}

              {profile.approval_status !== 'pending_review' && (
                <button
                  type="button"
                  onClick={() => onStatusChange('pending_review')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-blue text-white hover:bg-brand-blue/90 transition-colors"
                >
                  <Send className="h-3.5 w-3.5" />
                  Send for Review
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ---- Sections ---- */}
      <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-6 space-y-4 max-w-4xl">
        {/* 1. Company Overview */}
        <FactProfileSection
          title="Company Overview"
          icon={<Building2 className="h-4 w-4" />}
          isComplete={isOverviewComplete(overview)}
          defaultOpen
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldInput
              label="Company Name"
              value={overview.name}
              onChange={(v) => setOverview((p) => ({ ...p, name: v }))}
              placeholder="Acme Corp"
            />
            <FieldInput
              label="Website"
              value={overview.website}
              onChange={(v) => setOverview((p) => ({ ...p, website: v }))}
              placeholder="https://acme.com"
            />
          </div>
          <FieldInput
            label="Tagline"
            value={overview.tagline}
            onChange={(v) => setOverview((p) => ({ ...p, tagline: v }))}
            placeholder="A short company tagline"
          />
          <FieldTextarea
            label="Description"
            value={overview.description}
            onChange={(v) => setOverview((p) => ({ ...p, description: v }))}
            placeholder="What does this company do?"
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FieldInput
              label="Founded Year"
              value={overview.founded_year?.toString() ?? ''}
              onChange={(v) =>
                setOverview((p) => ({
                  ...p,
                  founded_year: v ? parseInt(v, 10) || null : null,
                }))
              }
              placeholder="2020"
              type="number"
            />
            <FieldInput
              label="Headquarters"
              value={overview.headquarters}
              onChange={(v) => setOverview((p) => ({ ...p, headquarters: v }))}
              placeholder="San Francisco, CA"
            />
            <FieldInput
              label="Company Type"
              value={overview.company_type}
              onChange={(v) => setOverview((p) => ({ ...p, company_type: v }))}
              placeholder="Private, Public, etc."
            />
          </div>
        </FactProfileSection>

        {/* 2. Market Position */}
        <FactProfileSection
          title="Market Position"
          icon={<TrendingUp className="h-4 w-4" />}
          isComplete={isMarketComplete(market)}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldInput
              label="Industry"
              value={market.industry}
              onChange={(v) => setMarket((p) => ({ ...p, industry: v }))}
              placeholder="SaaS, FinTech, etc."
            />
            <FieldInput
              label="Target Market"
              value={market.target_market}
              onChange={(v) => setMarket((p) => ({ ...p, target_market: v }))}
              placeholder="SMB, Mid-Market, Enterprise"
            />
          </div>
          <FieldInput
            label="Market Size"
            value={market.market_size}
            onChange={(v) => setMarket((p) => ({ ...p, market_size: v }))}
            placeholder="$5B TAM"
          />
          <TagField
            label="Sub-Industries"
            tags={market.sub_industries}
            onChange={(tags) => setMarket((p) => ({ ...p, sub_industries: tags }))}
            placeholder="Add sub-industries..."
          />
          <TagField
            label="Differentiators"
            tags={market.differentiators}
            onChange={(tags) => setMarket((p) => ({ ...p, differentiators: tags }))}
            placeholder="What sets them apart?"
          />
          <TagField
            label="Competitors"
            tags={market.competitors}
            onChange={(tags) => setMarket((p) => ({ ...p, competitors: tags }))}
            placeholder="Known competitors..."
          />
        </FactProfileSection>

        {/* 3. Products & Services */}
        <FactProfileSection
          title="Products & Services"
          icon={<Package className="h-4 w-4" />}
          isComplete={isProductsComplete(products)}
        >
          <TagField
            label="Products"
            tags={products.products}
            onChange={(tags) => setProducts((p) => ({ ...p, products: tags }))}
            placeholder="Product names..."
          />
          <TagField
            label="Key Features"
            tags={products.key_features}
            onChange={(tags) => setProducts((p) => ({ ...p, key_features: tags }))}
            placeholder="Notable features..."
          />
          <TagField
            label="Use Cases"
            tags={products.use_cases}
            onChange={(tags) => setProducts((p) => ({ ...p, use_cases: tags }))}
            placeholder="Common use cases..."
          />
          <FieldInput
            label="Pricing Model"
            value={products.pricing_model}
            onChange={(v) => setProducts((p) => ({ ...p, pricing_model: v }))}
            placeholder="Freemium, Subscription, etc."
          />
        </FactProfileSection>

        {/* 4. Team & Leadership */}
        <FactProfileSection
          title="Team & Leadership"
          icon={<Users className="h-4 w-4" />}
          isComplete={isTeamComplete(team)}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldInput
              label="Employee Count"
              value={team.employee_count?.toString() ?? ''}
              onChange={(v) =>
                setTeam((p) => ({
                  ...p,
                  employee_count: v ? parseInt(v, 10) || null : null,
                }))
              }
              placeholder="150"
              type="number"
            />
            <FieldInput
              label="Employee Range"
              value={team.employee_range}
              onChange={(v) => setTeam((p) => ({ ...p, employee_range: v }))}
              placeholder="101-200"
            />
          </div>

          {/* Key People */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#64748B] dark:text-gray-400">
              Key People
            </label>
            {team.key_people.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {team.key_people.map((person, idx) => (
                  <div
                    key={idx}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#F8FAFC] dark:bg-gray-800 text-[#1E293B] dark:text-gray-200 text-xs border border-[#E2E8F0] dark:border-gray-700 mr-1.5"
                  >
                    <span className="font-medium">{person.name}</span>
                    {person.title && (
                      <span className="text-[#94A3B8] dark:text-gray-500">- {person.title}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => removePerson(idx)}
                      className="text-[#94A3B8] dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors ml-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newPersonName}
                onChange={(e) => setNewPersonName(e.target.value)}
                placeholder="Name"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPerson(); } }}
                className="flex-1 border border-[#E2E8F0] dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-[#1E293B] dark:text-gray-100 bg-white dark:bg-gray-800/50 placeholder:text-[#94A3B8] dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-colors"
              />
              <input
                type="text"
                value={newPersonTitle}
                onChange={(e) => setNewPersonTitle(e.target.value)}
                placeholder="Title"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPerson(); } }}
                className="flex-1 border border-[#E2E8F0] dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-[#1E293B] dark:text-gray-100 bg-white dark:bg-gray-800/50 placeholder:text-[#94A3B8] dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-colors"
              />
              <button
                type="button"
                onClick={addPerson}
                disabled={!newPersonName.trim()}
                className="flex-shrink-0 p-2 rounded-lg border border-[#E2E8F0] dark:border-gray-700 text-[#64748B] dark:text-gray-400 hover:bg-[#F8FAFC] dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <TagField
            label="Departments"
            tags={team.departments}
            onChange={(tags) => setTeam((p) => ({ ...p, departments: tags }))}
            placeholder="Engineering, Sales, Marketing..."
          />
          <TagField
            label="Hiring Signals"
            tags={team.hiring_signals}
            onChange={(tags) => setTeam((p) => ({ ...p, hiring_signals: tags }))}
            placeholder="Open roles, team growth..."
          />
        </FactProfileSection>

        {/* 5. Financials */}
        <FactProfileSection
          title="Financials"
          icon={<DollarSign className="h-4 w-4" />}
          isComplete={isFinancialsComplete(financials)}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldInput
              label="Revenue Range"
              value={financials.revenue_range}
              onChange={(v) => setFinancials((p) => ({ ...p, revenue_range: v }))}
              placeholder="$10M-$50M ARR"
            />
            <FieldInput
              label="Funding Status"
              value={financials.funding_status}
              onChange={(v) => setFinancials((p) => ({ ...p, funding_status: v }))}
              placeholder="Series B, Bootstrapped, etc."
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldInput
              label="Total Raised"
              value={financials.total_raised}
              onChange={(v) => setFinancials((p) => ({ ...p, total_raised: v }))}
              placeholder="$25M"
            />
            <FieldInput
              label="Valuation"
              value={financials.valuation}
              onChange={(v) => setFinancials((p) => ({ ...p, valuation: v }))}
              placeholder="$100M"
            />
          </div>
          <TagField
            label="Investors"
            tags={financials.investors}
            onChange={(tags) => setFinancials((p) => ({ ...p, investors: tags }))}
            placeholder="Investor names..."
          />

          {/* Funding Rounds */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#64748B] dark:text-gray-400">
              Funding Rounds
            </label>
            {financials.funding_rounds.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {financials.funding_rounds.map((fr, idx) => (
                  <div
                    key={idx}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#F8FAFC] dark:bg-gray-800 text-[#1E293B] dark:text-gray-200 text-xs border border-[#E2E8F0] dark:border-gray-700 mr-1.5"
                  >
                    <span className="font-medium">{fr.round}</span>
                    {fr.amount && (
                      <span className="text-[#94A3B8] dark:text-gray-500">- {fr.amount}</span>
                    )}
                    {fr.date && (
                      <span className="text-[#94A3B8] dark:text-gray-500">({fr.date})</span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeFundingRound(idx)}
                      className="text-[#94A3B8] dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors ml-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newRound}
                onChange={(e) => setNewRound(e.target.value)}
                placeholder="Round (e.g. Series A)"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFundingRound(); } }}
                className="flex-1 border border-[#E2E8F0] dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-[#1E293B] dark:text-gray-100 bg-white dark:bg-gray-800/50 placeholder:text-[#94A3B8] dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-colors"
              />
              <input
                type="text"
                value={newRoundAmount}
                onChange={(e) => setNewRoundAmount(e.target.value)}
                placeholder="Amount"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFundingRound(); } }}
                className="w-24 border border-[#E2E8F0] dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-[#1E293B] dark:text-gray-100 bg-white dark:bg-gray-800/50 placeholder:text-[#94A3B8] dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-colors"
              />
              <input
                type="text"
                value={newRoundDate}
                onChange={(e) => setNewRoundDate(e.target.value)}
                placeholder="Date"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFundingRound(); } }}
                className="w-24 border border-[#E2E8F0] dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-[#1E293B] dark:text-gray-100 bg-white dark:bg-gray-800/50 placeholder:text-[#94A3B8] dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-colors"
              />
              <button
                type="button"
                onClick={addFundingRound}
                disabled={!newRound.trim()}
                className="flex-shrink-0 p-2 rounded-lg border border-[#E2E8F0] dark:border-gray-700 text-[#64748B] dark:text-gray-400 hover:bg-[#F8FAFC] dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        </FactProfileSection>

        {/* 6. Technology */}
        <FactProfileSection
          title="Technology"
          icon={<Cpu className="h-4 w-4" />}
          isComplete={isTechComplete(technology)}
        >
          <TagField
            label="Tech Stack"
            tags={technology.tech_stack}
            onChange={(tags) => setTechnology((p) => ({ ...p, tech_stack: tags }))}
            placeholder="React, Python, AWS..."
          />
          <TagField
            label="Platforms"
            tags={technology.platforms}
            onChange={(tags) => setTechnology((p) => ({ ...p, platforms: tags }))}
            placeholder="Web, Mobile, Desktop..."
          />
          <TagField
            label="Integrations"
            tags={technology.integrations}
            onChange={(tags) => setTechnology((p) => ({ ...p, integrations: tags }))}
            placeholder="Salesforce, Slack, Zapier..."
          />
        </FactProfileSection>

        {/* 7. Ideal Customer Indicators */}
        <FactProfileSection
          title="Ideal Customer Indicators"
          icon={<Target className="h-4 w-4" />}
          isComplete={isICPComplete(icpIndicators)}
        >
          <TagField
            label="Target Industries"
            tags={icpIndicators.target_industries}
            onChange={(tags) => setIcpIndicators((p) => ({ ...p, target_industries: tags }))}
            placeholder="Industries they sell to..."
          />
          <TagField
            label="Target Company Sizes"
            tags={icpIndicators.target_company_sizes}
            onChange={(tags) => setIcpIndicators((p) => ({ ...p, target_company_sizes: tags }))}
            placeholder="SMB, Mid-Market, Enterprise..."
          />
          <TagField
            label="Target Roles"
            tags={icpIndicators.target_roles}
            onChange={(tags) => setIcpIndicators((p) => ({ ...p, target_roles: tags }))}
            placeholder="CTO, VP Engineering..."
          />
          <TagField
            label="Buying Signals"
            tags={icpIndicators.buying_signals}
            onChange={(tags) => setIcpIndicators((p) => ({ ...p, buying_signals: tags }))}
            placeholder="New funding, rapid hiring..."
          />
          <TagField
            label="Pain Points"
            tags={icpIndicators.pain_points}
            onChange={(tags) => setIcpIndicators((p) => ({ ...p, pain_points: tags }))}
            placeholder="Common challenges..."
          />
          <TagField
            label="Value Propositions"
            tags={icpIndicators.value_propositions}
            onChange={(tags) => setIcpIndicators((p) => ({ ...p, value_propositions: tags }))}
            placeholder="How they solve pain points..."
          />
        </FactProfileSection>

        {/* 8. Recent Activity */}
        <FactProfileSection
          title="Recent Activity"
          icon={<Newspaper className="h-4 w-4" />}
          isComplete={isActivityComplete(activity)}
        >
          {/* News */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#64748B] dark:text-gray-400">
              News
            </label>
            {activity.news.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {activity.news.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[#F8FAFC] dark:bg-gray-800 border border-[#E2E8F0] dark:border-gray-700 text-xs"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-[#1E293B] dark:text-gray-200 block truncate">
                        {item.title}
                      </span>
                      {item.url && (
                        <span className="text-[#94A3B8] dark:text-gray-500 block truncate">
                          {item.url}
                        </span>
                      )}
                    </div>
                    {item.date && (
                      <span className="flex-shrink-0 text-[#94A3B8] dark:text-gray-500">
                        {item.date}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeNews(idx)}
                      className="flex-shrink-0 text-[#94A3B8] dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newNewsTitle}
                onChange={(e) => setNewNewsTitle(e.target.value)}
                placeholder="Headline"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNews(); } }}
                className="flex-1 border border-[#E2E8F0] dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-[#1E293B] dark:text-gray-100 bg-white dark:bg-gray-800/50 placeholder:text-[#94A3B8] dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-colors"
              />
              <input
                type="text"
                value={newNewsUrl}
                onChange={(e) => setNewNewsUrl(e.target.value)}
                placeholder="URL"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNews(); } }}
                className="w-32 border border-[#E2E8F0] dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-[#1E293B] dark:text-gray-100 bg-white dark:bg-gray-800/50 placeholder:text-[#94A3B8] dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-colors"
              />
              <input
                type="text"
                value={newNewsDate}
                onChange={(e) => setNewNewsDate(e.target.value)}
                placeholder="Date"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNews(); } }}
                className="w-24 border border-[#E2E8F0] dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-[#1E293B] dark:text-gray-100 bg-white dark:bg-gray-800/50 placeholder:text-[#94A3B8] dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-colors"
              />
              <button
                type="button"
                onClick={addNews}
                disabled={!newNewsTitle.trim()}
                className="flex-shrink-0 p-2 rounded-lg border border-[#E2E8F0] dark:border-gray-700 text-[#64748B] dark:text-gray-400 hover:bg-[#F8FAFC] dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <TagField
            label="Awards"
            tags={activity.awards}
            onChange={(tags) => setActivity((p) => ({ ...p, awards: tags }))}
            placeholder="Recent awards..."
          />
          <TagField
            label="Milestones"
            tags={activity.milestones}
            onChange={(tags) => setActivity((p) => ({ ...p, milestones: tags }))}
            placeholder="Key milestones..."
          />
        </FactProfileSection>
      </div>
    </div>
  );
}
