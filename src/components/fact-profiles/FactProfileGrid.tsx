import React, { useState, useMemo } from 'react';
import {
  Search,
  Building2,
  Target,
  Shield,
} from 'lucide-react';
import { FactProfileCard } from '@/components/fact-profiles/FactProfileCard';
import type { FactProfile } from '@/lib/types/factProfile';

// ---------------------------------------------------------------------------
// Loading Skeleton
// ---------------------------------------------------------------------------

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-52 animate-pulse rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80"
        >
          <div className="p-5 space-y-3">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-gray-200 dark:bg-gray-700" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="h-3 w-24 rounded bg-gray-100 dark:bg-gray-800" />
              </div>
            </div>
            <div className="h-5 w-24 rounded-full bg-gray-100 dark:bg-gray-800" />
            <div className="flex gap-2">
              <div className="h-5 w-16 rounded-full bg-gray-100 dark:bg-gray-800" />
              <div className="h-5 w-20 rounded-full bg-gray-100 dark:bg-gray-800" />
            </div>
            <div className="space-y-1">
              <div className="h-3 w-24 rounded bg-gray-100 dark:bg-gray-800" />
              <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800" />
            </div>
            <div className="h-3 w-32 rounded bg-gray-100 dark:bg-gray-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyState({ filterType }: { filterType: 'all' | 'org_profile' | 'client_org' | 'target_company' }) {
  const config = {
    all: {
      icon: <Search className="h-7 w-7 text-[#94A3B8] dark:text-gray-500" />,
      title: 'No fact profiles yet',
      description: 'Create a fact profile to start building your company research library.',
    },
    org_profile: {
      icon: <Shield className="h-7 w-7 text-brand-blue dark:text-blue-400" />,
      title: 'No business profile yet',
      description: 'Create a fact profile for your own business to feed org context into AI features.',
    },
    client_org: {
      icon: <Building2 className="h-7 w-7 text-brand-blue dark:text-blue-400" />,
      title: 'No client org profiles',
      description: 'Add a client organization to build a comprehensive fact profile about them.',
    },
    target_company: {
      icon: <Target className="h-7 w-7 text-violet-600 dark:text-violet-400" />,
      title: 'No target company profiles',
      description: 'Research target companies to understand your prospects before outreach.',
    },
  };

  const { icon, title, description } = config[filterType];

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 px-6 py-16 text-center shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] dark:shadow-none backdrop-blur-sm">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-50 dark:bg-gray-800/50">
        {icon}
      </div>
      <h3 className="mb-1 text-lg font-semibold text-[#1E293B] dark:text-white">
        {title}
      </h3>
      <p className="max-w-sm text-sm text-[#64748B] dark:text-gray-400">
        {description}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FactProfileGridProps {
  profiles: FactProfile[];
  isLoading: boolean;
  filterType: 'all' | 'org_profile' | 'client_org' | 'target_company';
  onView: (profile: FactProfile) => void;
  onEdit: (profile: FactProfile) => void;
  onResearch: (profile: FactProfile) => void;
  onShare: (profile: FactProfile) => void;
  onDelete: (profile: FactProfile) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FactProfileGrid({
  profiles,
  isLoading,
  filterType,
  onView,
  onEdit,
  onResearch,
  onShare,
  onDelete,
}: FactProfileGridProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter profiles by type and search query, org profiles pinned to top
  const filteredProfiles = useMemo(() => {
    if (!profiles) return [];
    const normalizedQuery = searchQuery.trim().toLowerCase();

    const filtered = profiles.filter((p) => {
      // Tab-level filter
      let matchesType: boolean;
      if (filterType === 'org_profile') {
        matchesType = p.is_org_profile === true;
      } else if (filterType === 'all') {
        matchesType = true;
      } else {
        matchesType = p.profile_type === filterType;
      }

      if (!normalizedQuery) return matchesType;

      const rd = p.research_data;
      const haystack = [
        p.company_name,
        p.company_domain ?? '',
        p.is_org_profile ? 'your business org profile' : '',
        p.profile_type === 'client_org' ? 'client org client organization' : 'target company prospect',
        p.research_status,
        p.approval_status,
        rd?.company_overview?.tagline ?? '',
        rd?.company_overview?.description ?? '',
        rd?.market_position?.industry ?? '',
        rd?.market_position?.target_market ?? '',
        (rd?.market_position?.competitors ?? []).join(' '),
        (rd?.technology?.tech_stack ?? []).join(' '),
      ]
        .join(' ')
        .toLowerCase();
      const matchesSearch = haystack.includes(normalizedQuery);
      return matchesType && matchesSearch;
    });

    // Pin org profile(s) to the top in all views
    return filtered.sort((a, b) => {
      if (a.is_org_profile && !b.is_org_profile) return -1;
      if (!a.is_org_profile && b.is_org_profile) return 1;
      return 0;
    });
  }, [profiles, filterType, searchQuery]);

  if (isLoading) {
    return <GridSkeleton />;
  }

  return (
    <div className="space-y-4">
      {/* Search input */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B] dark:text-gray-500" />
        <input
          type="text"
          placeholder="Search company, domain, industry..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 py-2 pl-10 pr-4 text-sm text-[#1E293B] dark:text-gray-100 placeholder-[#94A3B8] dark:placeholder-gray-500 transition-colors focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue backdrop-blur-sm"
        />
      </div>

      {/* Grid */}
      {filteredProfiles.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredProfiles.map((profile) => (
            <FactProfileCard
              key={profile.id}
              profile={profile}
              onView={onView}
              onEdit={onEdit}
              onResearch={onResearch}
              onShare={onShare}
              onDelete={onDelete}
            />
          ))}
        </div>
      ) : (
        <EmptyState filterType={searchQuery ? 'all' : filterType} />
      )}
    </div>
  );
}
