/**
 * FactProfileView -- Beautiful read-only display for a Fact Profile.
 *
 * Renders a hero header with company avatar, name, tagline, and industry.
 * 8 organized sections with icons, completeness badges, pill tags, key people
 * mini-profiles, funding round tables, and news items. Includes an approval
 * status banner and print-friendly styles.
 */

import React from 'react';
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
  Pencil,
  Share2,
  ExternalLink,
  CheckCircle2,
  Circle,
  AlertCircle,
  Globe,
  Calendar,
  MapPin,
  Briefcase,
  Link2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreateICPFromFactsButton } from './CreateICPFromFactsButton';
import { ExportFactProfilePDF } from './ExportFactProfilePDF';
import { PushFactProfileToOps } from './PushFactProfileToOps';
import type {
  FactProfile,
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

interface FactProfileViewProps {
  profile: FactProfile;
}

// ---------------------------------------------------------------------------
// Section completeness checkers (mirrors editor logic)
// ---------------------------------------------------------------------------

function isOverviewComplete(s: CompanyOverviewSection | undefined): boolean {
  return !!(s?.name && s?.description);
}

function isMarketComplete(s: MarketPositionSection | undefined): boolean {
  return !!(s?.industry && s?.differentiators?.length);
}

function isProductsComplete(s: ProductsServicesSection | undefined): boolean {
  return !!(s?.products?.length || s?.key_features?.length);
}

function isTeamComplete(s: TeamLeadershipSection | undefined): boolean {
  return !!(s?.key_people?.length || s?.employee_range);
}

function isFinancialsComplete(s: FinancialsSection | undefined): boolean {
  return !!(s?.revenue_range || s?.funding_status || s?.total_raised);
}

function isTechComplete(s: TechnologySection | undefined): boolean {
  return !!(s?.tech_stack?.length);
}

function isICPComplete(s: IdealCustomerIndicatorsSection | undefined): boolean {
  return !!(s?.pain_points?.length || s?.value_propositions?.length);
}

function isActivityComplete(s: RecentActivitySection | undefined): boolean {
  return !!(s?.news?.length || s?.milestones?.length);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Pill badge for tags / arrays */
function PillBadge({ children, color = 'default' }: { children: React.ReactNode; color?: 'default' | 'blue' | 'violet' | 'teal' | 'amber' }) {
  const colorMap: Record<string, string> = {
    default: 'bg-[#F8FAFC] dark:bg-gray-800 text-[#1E293B] dark:text-gray-200 border-[#E2E8F0] dark:border-gray-700',
    blue: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20',
    violet: 'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-500/20',
    teal: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20',
    amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${colorMap[color]}`}>
      {children}
    </span>
  );
}

/** Label-value display */
function FieldDisplay({ label, value, icon }: { label: string; value: string | number | null | undefined; icon?: React.ReactNode }) {
  if (!value && value !== 0) return null;
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium text-[#64748B] dark:text-gray-400 flex items-center gap-1.5">
        {icon}
        {label}
      </dt>
      <dd className="text-sm text-[#1E293B] dark:text-gray-100">{value}</dd>
    </div>
  );
}

/** Tag list display -- renders an array of strings as pill badges */
function TagList({ label, tags, color = 'default' }: { label: string; tags: string[] | undefined; color?: 'default' | 'blue' | 'violet' | 'teal' | 'amber' }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className="space-y-2">
      <dt className="text-xs font-medium text-[#64748B] dark:text-gray-400">{label}</dt>
      <dd className="flex flex-wrap gap-1.5">
        {tags.map((tag, i) => (
          <PillBadge key={`${tag}-${i}`} color={color}>{tag}</PillBadge>
        ))}
      </dd>
    </div>
  );
}

/** Section wrapper card */
function SectionCard({
  title,
  icon,
  isComplete,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  isComplete: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 overflow-hidden">
      {/* Section header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[#E2E8F0] dark:border-gray-700/50 bg-[#F8FAFC]/50 dark:bg-gray-800/30">
        <span className="flex-shrink-0 text-[#64748B] dark:text-gray-400">{icon}</span>
        <h2 className="flex-1 text-sm font-semibold text-[#1E293B] dark:text-gray-100">{title}</h2>
        {isComplete ? (
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-brand-teal" />
        ) : (
          <Circle className="h-4 w-4 flex-shrink-0 text-[#94A3B8] dark:text-gray-500" />
        )}
      </div>
      {/* Section body */}
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

/** Empty state for a section with no data */
function EmptySection() {
  return (
    <p className="text-sm text-[#94A3B8] dark:text-gray-500 italic">
      No data available
    </p>
  );
}

/** Company avatar -- large hero size */
function HeroAvatar({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const firstLetter = name.charAt(0).toUpperCase();

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className="h-20 w-20 rounded-2xl object-cover ring-4 ring-white dark:ring-gray-900 shadow-lg"
      />
    );
  }

  return (
    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-blue/10 dark:bg-brand-blue/10 text-brand-blue dark:text-blue-400 text-3xl font-bold ring-4 ring-white dark:ring-gray-900 shadow-lg">
      {firstLetter}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Approval Banner
// ---------------------------------------------------------------------------

function ApprovalBanner({ profile }: { profile: FactProfile }) {
  if (profile.approval_status === 'draft') return null;

  const configs: Record<string, { bg: string; icon: React.ReactNode; title: string }> = {
    pending_review: {
      bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
      icon: <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />,
      title: 'Pending client review',
    },
    approved: {
      bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800',
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />,
      title: profile.approved_by
        ? `Approved by ${profile.approved_by}`
        : 'Approved',
    },
    changes_requested: {
      bg: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800',
      icon: <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400 flex-shrink-0" />,
      title: 'Changes requested',
    },
    archived: {
      bg: 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700',
      icon: <Circle className="h-4 w-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />,
      title: 'Archived',
    },
  };

  const config = configs[profile.approval_status];
  if (!config) return null;

  return (
    <div className={`rounded-xl border px-4 py-3 print:hidden ${config.bg}`}>
      <div className="flex items-start gap-3">
        {config.icon}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#1E293B] dark:text-gray-100">
            {config.title}
          </p>
          {profile.approval_status === 'approved' && profile.approved_at && (
            <p className="text-xs text-[#64748B] dark:text-gray-400 mt-0.5">
              {new Date(profile.approved_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          )}
          {profile.approval_status === 'changes_requested' && profile.approval_feedback && (
            <p className="text-sm text-orange-700 dark:text-orange-300 mt-1.5 whitespace-pre-wrap">
              {profile.approval_feedback}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FactProfileView({ profile }: FactProfileViewProps) {
  const navigate = useNavigate();
  const rd = profile.research_data;
  const overview = rd?.company_overview;
  const market = rd?.market_position;
  const products = rd?.products_services;
  const team = rd?.team_leadership;
  const financials = rd?.financials;
  const technology = rd?.technology;
  const icp = rd?.ideal_customer_indicators;
  const activity = rd?.recent_activity;

  // Check if a section has any meaningful data
  const hasOverviewData = !!(overview?.name || overview?.description || overview?.tagline || overview?.headquarters || overview?.founded_year || overview?.company_type || overview?.website);
  const hasMarketData = !!(market?.industry || market?.target_market || market?.market_size || market?.sub_industries?.length || market?.differentiators?.length || market?.competitors?.length);
  const hasProductsData = !!(products?.products?.length || products?.key_features?.length || products?.use_cases?.length || products?.pricing_model);
  const hasTeamData = !!(team?.employee_count || team?.employee_range || team?.key_people?.length || team?.departments?.length || team?.hiring_signals?.length);
  const hasFinancialsData = !!(financials?.revenue_range || financials?.funding_status || financials?.total_raised || financials?.valuation || financials?.investors?.length || financials?.funding_rounds?.length);
  const hasTechData = !!(technology?.tech_stack?.length || technology?.platforms?.length || technology?.integrations?.length);
  const hasICPData = !!(icp?.target_industries?.length || icp?.target_company_sizes?.length || icp?.target_roles?.length || icp?.buying_signals?.length || icp?.pain_points?.length || icp?.value_propositions?.length);
  const hasActivityData = !!(activity?.news?.length || activity?.awards?.length || activity?.milestones?.length);

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-gray-950">
      {/* ---- Print-friendly styles ---- */}
      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          body { background: white !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      {/* ---- Header bar ---- */}
      <div className="sticky top-0 z-10 border-b border-[#E2E8F0] dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm print:hidden">
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

            {/* Title */}
            <h1 className="text-base font-semibold text-[#1E293B] dark:text-gray-100 truncate min-w-0">
              {profile.company_name}
            </h1>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Placeholder share action
                }}
              >
                <Share2 className="h-3.5 w-3.5 mr-1.5" />
                Share
              </Button>
              <ExportFactProfilePDF profile={profile} variant="outline" size="sm" />
              <CreateICPFromFactsButton profile={profile} variant="outline" size="sm" />
              <PushFactProfileToOps profile={profile} variant="outline" size="sm" />
              <Button
                variant="default"
                size="sm"
                onClick={() => navigate(`/fact-profiles/${profile.id}/edit`)}
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Edit Profile
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ---- Main content ---- */}
      <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-6 max-w-4xl space-y-6">
        {/* Approval banner */}
        <ApprovalBanner profile={profile} />

        {/* ---- Hero section ---- */}
        <div className="rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-start gap-5">
            {/* Avatar */}
            <HeroAvatar name={profile.company_name} logoUrl={profile.company_logo_url} />

            {/* Company info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-3 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-bold text-[#1E293B] dark:text-gray-100 leading-tight">
                  {profile.company_name}
                </h1>
                {market?.industry && (
                  <Badge variant="default" className="mt-1">
                    {market.industry}
                  </Badge>
                )}
              </div>

              {overview?.tagline && (
                <p className="mt-2 text-base text-[#64748B] dark:text-gray-400 leading-relaxed">
                  {overview.tagline}
                </p>
              )}

              {/* Meta row */}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[#64748B] dark:text-gray-400">
                {profile.company_domain && (
                  <span className="inline-flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5" />
                    {profile.company_domain}
                  </span>
                )}
                {overview?.website && (
                  <a
                    href={overview.website.startsWith('http') ? overview.website : `https://${overview.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-brand-blue hover:text-brand-blue/80 transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Website
                  </a>
                )}
                {overview?.headquarters && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    {overview.headquarters}
                  </span>
                )}
                {overview?.founded_year && (
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Founded {overview.founded_year}
                  </span>
                )}
                {overview?.company_type && (
                  <span className="inline-flex items-center gap-1.5">
                    <Briefcase className="h-3.5 w-3.5" />
                    {overview.company_type}
                  </span>
                )}
              </div>

              {/* Profile type + research status badges */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {profile.profile_type === 'client_org' ? (
                  <Badge variant="default" className="gap-1">
                    <Building2 className="h-3 w-3" />
                    Client Org
                  </Badge>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 dark:bg-violet-500/10 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-400 border border-violet-200 dark:border-violet-500/20">
                    <Target className="h-3 w-3" />
                    Target Company
                  </span>
                )}
                {profile.research_status === 'complete' && (
                  <Badge variant="success" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Research Complete
                  </Badge>
                )}
                {profile.research_status === 'researching' && (
                  <Badge variant="warning" className="gap-1">
                    Researching...
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ---- 1. Company Overview ---- */}
        <SectionCard
          title="Company Overview"
          icon={<Building2 className="h-4 w-4" />}
          isComplete={isOverviewComplete(overview)}
        >
          {hasOverviewData ? (
            <div className="space-y-4">
              {overview?.description && (
                <p className="text-sm text-[#1E293B] dark:text-gray-100 leading-relaxed whitespace-pre-wrap">
                  {overview.description}
                </p>
              )}
              <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <FieldDisplay label="Headquarters" value={overview?.headquarters} icon={<MapPin className="h-3 w-3" />} />
                <FieldDisplay label="Founded" value={overview?.founded_year} icon={<Calendar className="h-3 w-3" />} />
                <FieldDisplay label="Company Type" value={overview?.company_type} icon={<Briefcase className="h-3 w-3" />} />
                {overview?.website && (
                  <div className="space-y-1">
                    <dt className="text-xs font-medium text-[#64748B] dark:text-gray-400 flex items-center gap-1.5">
                      <Globe className="h-3 w-3" />
                      Website
                    </dt>
                    <dd>
                      <a
                        href={overview.website.startsWith('http') ? overview.website : `https://${overview.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-brand-blue hover:text-brand-blue/80 inline-flex items-center gap-1 transition-colors"
                      >
                        {overview.website}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          ) : (
            <EmptySection />
          )}
        </SectionCard>

        {/* ---- 2. Market Position ---- */}
        <SectionCard
          title="Market Position"
          icon={<TrendingUp className="h-4 w-4" />}
          isComplete={isMarketComplete(market)}
        >
          {hasMarketData ? (
            <dl className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <FieldDisplay label="Industry" value={market?.industry} />
                <FieldDisplay label="Target Market" value={market?.target_market} />
                <FieldDisplay label="Market Size" value={market?.market_size} />
              </div>
              <TagList label="Sub-Industries" tags={market?.sub_industries} color="blue" />
              <TagList label="Differentiators" tags={market?.differentiators} color="teal" />
              {/* Competitors as linked cards */}
              {market?.competitors && market.competitors.length > 0 && (
                <div className="space-y-2">
                  <dt className="text-xs font-medium text-[#64748B] dark:text-gray-400">Competitors</dt>
                  <dd className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {market.competitors.map((comp, i) => (
                      <div
                        key={`${comp}-${i}`}
                        className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-[#E2E8F0] dark:border-gray-700/50 bg-[#F8FAFC] dark:bg-gray-800/50 hover:border-brand-blue/30 dark:hover:border-brand-blue/30 transition-colors"
                      >
                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-semibold flex-shrink-0">
                          {comp.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-[#1E293B] dark:text-gray-100 truncate">
                          {comp}
                        </span>
                      </div>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          ) : (
            <EmptySection />
          )}
        </SectionCard>

        {/* ---- 3. Products & Services ---- */}
        <SectionCard
          title="Products & Services"
          icon={<Package className="h-4 w-4" />}
          isComplete={isProductsComplete(products)}
        >
          {hasProductsData ? (
            <dl className="space-y-4">
              <TagList label="Products" tags={products?.products} color="violet" />
              <TagList label="Key Features" tags={products?.key_features} color="blue" />
              <TagList label="Use Cases" tags={products?.use_cases} color="teal" />
              <FieldDisplay label="Pricing Model" value={products?.pricing_model} />
            </dl>
          ) : (
            <EmptySection />
          )}
        </SectionCard>

        {/* ---- 4. Team & Leadership ---- */}
        <SectionCard
          title="Team & Leadership"
          icon={<Users className="h-4 w-4" />}
          isComplete={isTeamComplete(team)}
        >
          {hasTeamData ? (
            <div className="space-y-5">
              {/* Employee info */}
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldDisplay label="Employee Count" value={team?.employee_count} icon={<Users className="h-3 w-3" />} />
                <FieldDisplay label="Employee Range" value={team?.employee_range} />
              </dl>

              {/* Key people mini-profiles */}
              {team?.key_people && team.key_people.length > 0 && (
                <div className="space-y-2">
                  <dt className="text-xs font-medium text-[#64748B] dark:text-gray-400">Key People</dt>
                  <dd className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {team.key_people.map((person, i) => (
                      <div
                        key={`${person.name}-${i}`}
                        className="flex items-center gap-3 px-3 py-3 rounded-lg border border-[#E2E8F0] dark:border-gray-700/50 bg-[#F8FAFC] dark:bg-gray-800/50"
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-blue/10 dark:bg-brand-blue/10 text-brand-blue dark:text-blue-400 text-sm font-semibold flex-shrink-0">
                          {person.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[#1E293B] dark:text-gray-100 truncate">
                            {person.name}
                          </p>
                          {person.title && (
                            <p className="text-xs text-[#64748B] dark:text-gray-400 truncate">
                              {person.title}
                            </p>
                          )}
                        </div>
                        {person.linkedin && (
                          <a
                            href={person.linkedin.startsWith('http') ? person.linkedin : `https://${person.linkedin}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-shrink-0 text-[#94A3B8] dark:text-gray-500 hover:text-brand-blue dark:hover:text-blue-400 transition-colors"
                            title="LinkedIn"
                          >
                            <Link2 className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    ))}
                  </dd>
                </div>
              )}

              <TagList label="Departments" tags={team?.departments} />
              <TagList label="Hiring Signals" tags={team?.hiring_signals} color="amber" />
            </div>
          ) : (
            <EmptySection />
          )}
        </SectionCard>

        {/* ---- 5. Financials ---- */}
        <SectionCard
          title="Financials"
          icon={<DollarSign className="h-4 w-4" />}
          isComplete={isFinancialsComplete(financials)}
        >
          {hasFinancialsData ? (
            <div className="space-y-5">
              <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <FieldDisplay label="Revenue Range" value={financials?.revenue_range} />
                <FieldDisplay label="Funding Status" value={financials?.funding_status} />
                <FieldDisplay label="Total Raised" value={financials?.total_raised} />
                <FieldDisplay label="Valuation" value={financials?.valuation} />
              </dl>

              <TagList label="Investors" tags={financials?.investors} color="violet" />

              {/* Funding rounds table */}
              {financials?.funding_rounds && financials.funding_rounds.length > 0 && (
                <div className="space-y-2">
                  <dt className="text-xs font-medium text-[#64748B] dark:text-gray-400">Funding Rounds</dt>
                  <dd>
                    <div className="overflow-hidden rounded-lg border border-[#E2E8F0] dark:border-gray-700/50">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-[#F8FAFC] dark:bg-gray-800/50">
                            <th className="text-left px-4 py-2.5 text-xs font-medium text-[#64748B] dark:text-gray-400">
                              Round
                            </th>
                            <th className="text-left px-4 py-2.5 text-xs font-medium text-[#64748B] dark:text-gray-400">
                              Amount
                            </th>
                            <th className="text-left px-4 py-2.5 text-xs font-medium text-[#64748B] dark:text-gray-400">
                              Date
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8F0] dark:divide-gray-700/50">
                          {financials.funding_rounds.map((fr, i) => (
                            <tr key={i} className="hover:bg-[#F8FAFC] dark:hover:bg-gray-800/30 transition-colors">
                              <td className="px-4 py-2.5 font-medium text-[#1E293B] dark:text-gray-100">
                                {fr.round}
                              </td>
                              <td className="px-4 py-2.5 text-[#1E293B] dark:text-gray-100">
                                {fr.amount || <span className="text-[#94A3B8] dark:text-gray-500">--</span>}
                              </td>
                              <td className="px-4 py-2.5 text-[#64748B] dark:text-gray-400">
                                {fr.date || <span className="text-[#94A3B8] dark:text-gray-500">--</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </dd>
                </div>
              )}
            </div>
          ) : (
            <EmptySection />
          )}
        </SectionCard>

        {/* ---- 6. Technology ---- */}
        <SectionCard
          title="Technology"
          icon={<Cpu className="h-4 w-4" />}
          isComplete={isTechComplete(technology)}
        >
          {hasTechData ? (
            <dl className="space-y-4">
              <TagList label="Tech Stack" tags={technology?.tech_stack} color="violet" />
              <TagList label="Platforms" tags={technology?.platforms} color="blue" />
              <TagList label="Integrations" tags={technology?.integrations} color="teal" />
            </dl>
          ) : (
            <EmptySection />
          )}
        </SectionCard>

        {/* ---- 7. Ideal Customer Indicators ---- */}
        <SectionCard
          title="Ideal Customer Indicators"
          icon={<Target className="h-4 w-4" />}
          isComplete={isICPComplete(icp)}
        >
          {hasICPData ? (
            <dl className="space-y-4">
              <TagList label="Target Industries" tags={icp?.target_industries} color="blue" />
              <TagList label="Target Company Sizes" tags={icp?.target_company_sizes} />
              <TagList label="Target Roles" tags={icp?.target_roles} color="violet" />
              <TagList label="Buying Signals" tags={icp?.buying_signals} color="amber" />
              <TagList label="Pain Points" tags={icp?.pain_points} color="default" />
              <TagList label="Value Propositions" tags={icp?.value_propositions} color="teal" />
            </dl>
          ) : (
            <EmptySection />
          )}
        </SectionCard>

        {/* ---- 8. Recent Activity ---- */}
        <SectionCard
          title="Recent Activity"
          icon={<Newspaper className="h-4 w-4" />}
          isComplete={isActivityComplete(activity)}
        >
          {hasActivityData ? (
            <div className="space-y-5">
              {/* News items */}
              {activity?.news && activity.news.length > 0 && (
                <div className="space-y-2">
                  <dt className="text-xs font-medium text-[#64748B] dark:text-gray-400">News</dt>
                  <dd className="space-y-2">
                    {activity.news.map((item, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 px-4 py-3 rounded-lg border border-[#E2E8F0] dark:border-gray-700/50 bg-[#F8FAFC] dark:bg-gray-800/50"
                      >
                        <Newspaper className="h-4 w-4 text-[#94A3B8] dark:text-gray-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          {item.url ? (
                            <a
                              href={item.url.startsWith('http') ? item.url : `https://${item.url}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium text-brand-blue hover:text-brand-blue/80 transition-colors inline-flex items-center gap-1"
                            >
                              {item.title}
                              <ExternalLink className="h-3 w-3 flex-shrink-0" />
                            </a>
                          ) : (
                            <p className="text-sm font-medium text-[#1E293B] dark:text-gray-100">
                              {item.title}
                            </p>
                          )}
                        </div>
                        {item.date && (
                          <span className="flex-shrink-0 inline-flex items-center gap-1 text-xs text-[#64748B] dark:text-gray-400 bg-white dark:bg-gray-900/50 px-2 py-0.5 rounded-full border border-[#E2E8F0] dark:border-gray-700">
                            <Calendar className="h-3 w-3" />
                            {item.date}
                          </span>
                        )}
                      </div>
                    ))}
                  </dd>
                </div>
              )}

              <TagList label="Awards" tags={activity?.awards} color="amber" />
              <TagList label="Milestones" tags={activity?.milestones} color="teal" />
            </div>
          ) : (
            <EmptySection />
          )}
        </SectionCard>

        {/* ---- Footer meta ---- */}
        <div className="text-center py-4">
          <p className="text-xs text-[#94A3B8] dark:text-gray-500">
            Version {profile.version} &middot; Last updated{' '}
            {new Date(profile.updated_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
            {profile.share_views > 0 && (
              <> &middot; {profile.share_views} {profile.share_views === 1 ? 'view' : 'views'}</>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
