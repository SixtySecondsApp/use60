/**
 * ProductProfileView -- Read-only display for a Product Profile.
 *
 * Renders a hero header with product name, category badge, research status,
 * product URL link, and is_primary indicator. 10 organized sections with icons,
 * completeness dots, pill tags, competitor cards, pricing tiers table,
 * pain-point-solution-impact table, and feature cards.
 */

import React from 'react';
import {
  Package,
  Users,
  Sparkles,
  DollarSign,
  Swords,
  Lightbulb,
  Shield,
  Heart,
  Zap,
  Plug,
  Pencil,
  Trash2,
  Target,
  ExternalLink,
  CheckCircle2,
  Circle,
  Star,
  Link2,
  Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type {
  ProductProfile,
  ProductOverviewSection,
  ProductTargetMarketSection,
  ProductValuePropositionsSection,
  ProductPricingSection,
  ProductCompetitorsSection,
  ProductUseCasesSection,
  ProductDifferentiatorsSection,
  ProductPainPointsSolvedSection,
  ProductKeyFeaturesSection,
  ProductIntegrationsSection,
} from '@/lib/types/productProfile';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProductProfileViewProps {
  profile: ProductProfile;
  onEdit?: () => void;
  onDelete?: () => void;
  onCreateICP?: () => void;
  /** If the parent fact profile has a company name, pass it here for the link-back */
  parentCompanyName?: string;
}

// ---------------------------------------------------------------------------
// Section completeness checkers
// ---------------------------------------------------------------------------

function isOverviewComplete(s: ProductOverviewSection | undefined): boolean {
  return !!(s?.description && s?.tagline);
}

function isTargetMarketComplete(s: ProductTargetMarketSection | undefined): boolean {
  return !!(s?.industries?.length || s?.buyer_personas?.length);
}

function isValuePropsComplete(s: ProductValuePropositionsSection | undefined): boolean {
  return !!(s?.primary_value_prop || s?.supporting_points?.length);
}

function isPricingComplete(s: ProductPricingSection | undefined): boolean {
  return !!(s?.model || s?.tiers?.length || s?.price_range);
}

function isCompetitorsComplete(s: ProductCompetitorsSection | undefined): boolean {
  return !!(s?.direct_competitors?.length || s?.indirect_competitors?.length);
}

function isUseCasesComplete(s: ProductUseCasesSection | undefined): boolean {
  return !!(s?.primary_use_cases?.length || s?.secondary_use_cases?.length);
}

function isDifferentiatorsComplete(s: ProductDifferentiatorsSection | undefined): boolean {
  return !!(s?.key_differentiators?.length || s?.unique_capabilities?.length);
}

function isPainPointsComplete(s: ProductPainPointsSolvedSection | undefined): boolean {
  return !!(s?.pain_points?.length);
}

function isKeyFeaturesComplete(s: ProductKeyFeaturesSection | undefined): boolean {
  return !!(s?.features?.length);
}

function isIntegrationsComplete(s: ProductIntegrationsSection | undefined): boolean {
  return !!(s?.native_integrations?.length || s?.platforms?.length);
}

// ---------------------------------------------------------------------------
// Small helpers (matching FactProfileView patterns)
// ---------------------------------------------------------------------------

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
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[#E2E8F0] dark:border-gray-700/50 bg-[#F8FAFC]/50 dark:bg-gray-800/30">
        <span className="flex-shrink-0 text-[#64748B] dark:text-gray-400">{icon}</span>
        <h2 className="flex-1 text-sm font-semibold text-[#1E293B] dark:text-gray-100">{title}</h2>
        {isComplete ? (
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-brand-teal" />
        ) : (
          <Circle className="h-4 w-4 flex-shrink-0 text-[#94A3B8] dark:text-gray-500" />
        )}
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

function EmptySection() {
  return (
    <p className="text-sm text-[#94A3B8] dark:text-gray-500 italic">
      Not yet researched
    </p>
  );
}

// ---------------------------------------------------------------------------
// Category color mapping
// ---------------------------------------------------------------------------

const categoryColorMap: Record<string, string> = {
  saas: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20',
  platform: 'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-500/20',
  service: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20',
  hardware: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20',
  api: 'bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-500/20',
  marketplace: 'bg-pink-50 dark:bg-pink-500/10 text-pink-700 dark:text-pink-400 border-pink-200 dark:border-pink-500/20',
};

function getCategoryBadgeClass(category: string): string {
  const key = category.toLowerCase().trim();
  return categoryColorMap[key] || 'bg-slate-100 dark:bg-gray-500/10 text-[#64748B] dark:text-gray-400 border-slate-200 dark:border-gray-500/20';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProductProfileView({ profile, onEdit, onDelete, onCreateICP, parentCompanyName }: ProductProfileViewProps) {
  const rd = profile.research_data;
  const overview = rd?.overview;
  const targetMarket = rd?.target_market;
  const valueProps = rd?.value_propositions;
  const pricing = rd?.pricing;
  const competitors = rd?.competitors;
  const useCases = rd?.use_cases;
  const differentiators = rd?.differentiators;
  const painPoints = rd?.pain_points_solved;
  const keyFeatures = rd?.key_features;
  const integrations = rd?.integrations;

  // Data presence checks
  const hasOverviewData = !!(overview?.description || overview?.tagline || overview?.category || overview?.product_url);
  const hasTargetMarketData = !!(targetMarket?.industries?.length || targetMarket?.company_sizes?.length || targetMarket?.regions?.length || targetMarket?.buyer_personas?.length);
  const hasValuePropsData = !!(valueProps?.primary_value_prop || valueProps?.supporting_points?.length || valueProps?.proof_points?.length);
  const hasPricingData = !!(pricing?.model || pricing?.tiers?.length || pricing?.price_range || pricing?.billing_options?.length);
  const hasCompetitorsData = !!(competitors?.direct_competitors?.length || competitors?.indirect_competitors?.length);
  const hasUseCasesData = !!(useCases?.primary_use_cases?.length || useCases?.secondary_use_cases?.length);
  const hasDifferentiatorsData = !!(differentiators?.key_differentiators?.length || differentiators?.unique_capabilities?.length || differentiators?.awards?.length);
  const hasPainPointsData = !!(painPoints?.pain_points?.length);
  const hasKeyFeaturesData = !!(keyFeatures?.features?.length);
  const hasIntegrationsData = !!(integrations?.native_integrations?.length || integrations?.api_available || integrations?.platforms?.length);

  return (
    <div className="space-y-6">
      {/* ---- Hero section ---- */}
      <div className="rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row items-start gap-5">
          {/* Product avatar / logo */}
          {profile.logo_url ? (
            <img
              src={profile.logo_url}
              alt={profile.name}
              className="h-20 w-20 rounded-2xl object-cover ring-4 ring-white dark:ring-gray-900 shadow-lg"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 text-3xl font-bold ring-4 ring-white dark:ring-gray-900 shadow-lg">
              {profile.name.charAt(0).toUpperCase()}
            </div>
          )}

          {/* Product info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-3 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold text-[#1E293B] dark:text-gray-100 leading-tight">
                {profile.name}
              </h1>
              {profile.is_primary && (
                <Badge variant="warning" className="gap-1 mt-1">
                  <Star className="h-3 w-3" />
                  Primary
                </Badge>
              )}
            </div>

            {/* Category badge */}
            {profile.category && (
              <div className="mt-2">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getCategoryBadgeClass(profile.category)}`}>
                  {profile.category}
                </span>
              </div>
            )}

            {profile.description && (
              <p className="mt-2 text-base text-[#64748B] dark:text-gray-400 leading-relaxed">
                {profile.description}
              </p>
            )}

            {/* Meta row */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[#64748B] dark:text-gray-400">
              {profile.product_url && (
                <a
                  href={profile.product_url.startsWith('http') ? profile.product_url : `https://${profile.product_url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-brand-blue hover:text-brand-blue/80 transition-colors"
                >
                  <Globe className="h-3.5 w-3.5" />
                  Product URL
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {profile.fact_profile_id && parentCompanyName && (
                <span className="inline-flex items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5" />
                  Part of {parentCompanyName}
                </span>
              )}
            </div>

            {/* Research status + action buttons */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
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
              {profile.research_status === 'pending' && (
                <Badge variant="secondary" className="gap-1">
                  <Circle className="h-3 w-3" />
                  Pending Research
                </Badge>
              )}

              {/* Spacer */}
              <div className="flex-1" />

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                {onCreateICP && (
                  <Button variant="outline" size="sm" onClick={onCreateICP}>
                    <Target className="h-3.5 w-3.5 mr-1.5" />
                    Create ICP
                  </Button>
                )}
                {onDelete && (
                  <Button variant="outline" size="sm" onClick={onDelete} className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:border-red-300 dark:hover:border-red-500/30">
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Delete
                  </Button>
                )}
                {onEdit && (
                  <Button variant="default" size="sm" onClick={onEdit}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Edit
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---- 1. Overview ---- */}
      <SectionCard
        title="Overview"
        icon={<Package className="h-4 w-4" />}
        isComplete={isOverviewComplete(overview)}
      >
        {hasOverviewData ? (
          <div className="space-y-4">
            {overview?.tagline && (
              <p className="text-sm font-medium text-[#1E293B] dark:text-gray-100 italic">
                &ldquo;{overview.tagline}&rdquo;
              </p>
            )}
            {overview?.description && (
              <p className="text-sm text-[#1E293B] dark:text-gray-100 leading-relaxed whitespace-pre-wrap">
                {overview.description}
              </p>
            )}
          </div>
        ) : (
          <EmptySection />
        )}
      </SectionCard>

      {/* ---- 2. Target Market ---- */}
      <SectionCard
        title="Target Market"
        icon={<Users className="h-4 w-4" />}
        isComplete={isTargetMarketComplete(targetMarket)}
      >
        {hasTargetMarketData ? (
          <dl className="space-y-4">
            <TagList label="Industries" tags={targetMarket?.industries} color="blue" />
            <TagList label="Company Sizes" tags={targetMarket?.company_sizes} />
            <TagList label="Regions" tags={targetMarket?.regions} color="teal" />
            <TagList label="Buyer Personas" tags={targetMarket?.buyer_personas} color="violet" />
          </dl>
        ) : (
          <EmptySection />
        )}
      </SectionCard>

      {/* ---- 3. Value Propositions ---- */}
      <SectionCard
        title="Value Propositions"
        icon={<Sparkles className="h-4 w-4" />}
        isComplete={isValuePropsComplete(valueProps)}
      >
        {hasValuePropsData ? (
          <div className="space-y-4">
            {valueProps?.primary_value_prop && (
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3">
                <dt className="text-xs font-medium text-emerald-700 dark:text-emerald-400 mb-1">Primary Value Proposition</dt>
                <dd className="text-sm text-[#1E293B] dark:text-gray-100 font-medium">{valueProps.primary_value_prop}</dd>
              </div>
            )}
            <TagList label="Supporting Points" tags={valueProps?.supporting_points} color="blue" />
            <TagList label="Proof Points" tags={valueProps?.proof_points} color="amber" />
          </div>
        ) : (
          <EmptySection />
        )}
      </SectionCard>

      {/* ---- 4. Pricing ---- */}
      <SectionCard
        title="Pricing"
        icon={<DollarSign className="h-4 w-4" />}
        isComplete={isPricingComplete(pricing)}
      >
        {hasPricingData ? (
          <div className="space-y-5">
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {pricing?.model && (
                <div className="space-y-1">
                  <dt className="text-xs font-medium text-[#64748B] dark:text-gray-400">Model</dt>
                  <dd className="text-sm text-[#1E293B] dark:text-gray-100">{pricing.model}</dd>
                </div>
              )}
              {pricing?.price_range && (
                <div className="space-y-1">
                  <dt className="text-xs font-medium text-[#64748B] dark:text-gray-400">Price Range</dt>
                  <dd className="text-sm text-[#1E293B] dark:text-gray-100">{pricing.price_range}</dd>
                </div>
              )}
            </dl>

            <TagList label="Billing Options" tags={pricing?.billing_options} />

            {/* Tiers table */}
            {pricing?.tiers && pricing.tiers.length > 0 && (
              <div className="space-y-2">
                <dt className="text-xs font-medium text-[#64748B] dark:text-gray-400">Pricing Tiers</dt>
                <dd>
                  <div className="overflow-hidden rounded-lg border border-[#E2E8F0] dark:border-gray-700/50">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[#F8FAFC] dark:bg-gray-800/50">
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-[#64748B] dark:text-gray-400">Tier</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-[#64748B] dark:text-gray-400">Price</th>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-[#64748B] dark:text-gray-400">Features</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0] dark:divide-gray-700/50">
                        {pricing.tiers.map((tier, i) => (
                          <tr key={i} className="hover:bg-[#F8FAFC] dark:hover:bg-gray-800/30 transition-colors">
                            <td className="px-4 py-2.5 font-medium text-[#1E293B] dark:text-gray-100">{tier.name}</td>
                            <td className="px-4 py-2.5 text-[#1E293B] dark:text-gray-100">{tier.price || <span className="text-[#94A3B8] dark:text-gray-500">--</span>}</td>
                            <td className="px-4 py-2.5">
                              <div className="flex flex-wrap gap-1">
                                {tier.features?.map((f, j) => (
                                  <PillBadge key={j} color="blue">{f}</PillBadge>
                                ))}
                              </div>
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

      {/* ---- 5. Competitors ---- */}
      <SectionCard
        title="Competitors"
        icon={<Swords className="h-4 w-4" />}
        isComplete={isCompetitorsComplete(competitors)}
      >
        {hasCompetitorsData ? (
          <div className="space-y-4">
            {/* Direct competitors as cards */}
            {competitors?.direct_competitors && competitors.direct_competitors.length > 0 && (
              <div className="space-y-2">
                <dt className="text-xs font-medium text-[#64748B] dark:text-gray-400">Direct Competitors</dt>
                <dd className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {competitors.direct_competitors.map((comp, i) => (
                    <div
                      key={`${comp.name}-${i}`}
                      className="flex items-start gap-3 px-3 py-3 rounded-lg border border-[#E2E8F0] dark:border-gray-700/50 bg-[#F8FAFC] dark:bg-gray-800/50"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-sm font-semibold flex-shrink-0">
                        {comp.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[#1E293B] dark:text-gray-100 truncate">{comp.name}</p>
                        {comp.domain && (
                          <p className="text-xs text-[#64748B] dark:text-gray-400 truncate">{comp.domain}</p>
                        )}
                        {comp.differentiator && (
                          <p className="text-xs text-[#94A3B8] dark:text-gray-500 mt-1">{comp.differentiator}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </dd>
              </div>
            )}

            <TagList label="Indirect Competitors" tags={competitors?.indirect_competitors} />
          </div>
        ) : (
          <EmptySection />
        )}
      </SectionCard>

      {/* ---- 6. Use Cases ---- */}
      <SectionCard
        title="Use Cases"
        icon={<Lightbulb className="h-4 w-4" />}
        isComplete={isUseCasesComplete(useCases)}
      >
        {hasUseCasesData ? (
          <div className="space-y-4">
            {/* Primary use cases */}
            {useCases?.primary_use_cases && useCases.primary_use_cases.length > 0 && (
              <div className="space-y-2">
                <dt className="text-xs font-medium text-[#64748B] dark:text-gray-400">Primary Use Cases</dt>
                <dd className="space-y-2">
                  {useCases.primary_use_cases.map((uc, i) => (
                    <div
                      key={i}
                      className="px-4 py-3 rounded-lg border border-[#E2E8F0] dark:border-gray-700/50 bg-[#F8FAFC] dark:bg-gray-800/50"
                    >
                      <p className="text-sm font-medium text-[#1E293B] dark:text-gray-100">{uc.title}</p>
                      {uc.description && (
                        <p className="text-sm text-[#64748B] dark:text-gray-400 mt-1">{uc.description}</p>
                      )}
                      {uc.persona && (
                        <PillBadge color="violet">{uc.persona}</PillBadge>
                      )}
                    </div>
                  ))}
                </dd>
              </div>
            )}

            <TagList label="Secondary Use Cases" tags={useCases?.secondary_use_cases} color="teal" />
          </div>
        ) : (
          <EmptySection />
        )}
      </SectionCard>

      {/* ---- 7. Differentiators ---- */}
      <SectionCard
        title="Differentiators"
        icon={<Shield className="h-4 w-4" />}
        isComplete={isDifferentiatorsComplete(differentiators)}
      >
        {hasDifferentiatorsData ? (
          <dl className="space-y-4">
            <TagList label="Key Differentiators" tags={differentiators?.key_differentiators} color="teal" />
            <TagList label="Unique Capabilities" tags={differentiators?.unique_capabilities} color="violet" />
            <TagList label="Awards" tags={differentiators?.awards} color="amber" />
          </dl>
        ) : (
          <EmptySection />
        )}
      </SectionCard>

      {/* ---- 8. Pain Points Solved ---- */}
      <SectionCard
        title="Pain Points Solved"
        icon={<Heart className="h-4 w-4" />}
        isComplete={isPainPointsComplete(painPoints)}
      >
        {hasPainPointsData ? (
          <div className="space-y-2">
            <div className="overflow-hidden rounded-lg border border-[#E2E8F0] dark:border-gray-700/50">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F8FAFC] dark:bg-gray-800/50">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-[#64748B] dark:text-gray-400">Pain Point</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-[#64748B] dark:text-gray-400">Solution</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-[#64748B] dark:text-gray-400">Impact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] dark:divide-gray-700/50">
                  {painPoints!.pain_points.map((pp, i) => (
                    <tr key={i} className="hover:bg-[#F8FAFC] dark:hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-2.5 text-[#1E293B] dark:text-gray-100">{pp.pain}</td>
                      <td className="px-4 py-2.5 text-[#1E293B] dark:text-gray-100">{pp.solution}</td>
                      <td className="px-4 py-2.5 text-emerald-700 dark:text-emerald-400 font-medium">{pp.impact}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptySection />
        )}
      </SectionCard>

      {/* ---- 9. Key Features ---- */}
      <SectionCard
        title="Key Features"
        icon={<Zap className="h-4 w-4" />}
        isComplete={isKeyFeaturesComplete(keyFeatures)}
      >
        {hasKeyFeaturesData ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {keyFeatures!.features.map((feat, i) => (
              <div
                key={i}
                className="px-4 py-3 rounded-lg border border-[#E2E8F0] dark:border-gray-700/50 bg-[#F8FAFC] dark:bg-gray-800/50"
              >
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-[#1E293B] dark:text-gray-100">{feat.name}</p>
                  {feat.category && (
                    <PillBadge color="blue">{feat.category}</PillBadge>
                  )}
                </div>
                {feat.description && (
                  <p className="text-xs text-[#64748B] dark:text-gray-400 mt-1">{feat.description}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptySection />
        )}
      </SectionCard>

      {/* ---- 10. Integrations ---- */}
      <SectionCard
        title="Integrations"
        icon={<Plug className="h-4 w-4" />}
        isComplete={isIntegrationsComplete(integrations)}
      >
        {hasIntegrationsData ? (
          <dl className="space-y-4">
            {integrations?.api_available && (
              <div>
                <Badge variant="success" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  API Available
                </Badge>
              </div>
            )}
            <TagList label="Native Integrations" tags={integrations?.native_integrations} color="blue" />
            <TagList label="Platforms" tags={integrations?.platforms} color="violet" />
          </dl>
        ) : (
          <EmptySection />
        )}
      </SectionCard>

      {/* ---- Footer meta ---- */}
      <div className="text-center py-4">
        <p className="text-xs text-[#94A3B8] dark:text-gray-500">
          Last updated{' '}
          {new Date(profile.updated_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
    </div>
  );
}
