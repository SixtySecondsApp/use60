/**
 * LinkedInAdLibraryPage — LAP-001/LAP-002
 *
 * Displays LinkedIn Ad Library scraped ads with multi-select UI so users
 * can batch-import selected ads into an ops table.
 *
 * Multi-select pattern follows ContactsView / DealsView convention:
 *   - selectedAdIds: Set<string>  tracks selections across pagination
 *   - "Select All" checkbox in toolbar
 *   - Floating bulk actions bar when >= 1 ad selected
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Search,
  Filter,
  CheckSquare,
  Square,
  X,
  Table2,
  ExternalLink,
  Image,
  PlayCircle,
  FileText,
  Building2,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { AdLibraryImportWizard } from '@/components/ops/AdLibraryImportWizard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUser } from '@/lib/hooks/useUser';
import { useOrg } from '@/lib/contexts/OrgContext';
import { supabase } from '@/lib/supabase/clientV2';
import { useQuery } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LinkedInAd {
  id: string;
  advertiser_name: string;
  advertiser_domain?: string | null;
  headline?: string | null;
  body_text?: string | null;
  cta_text?: string | null;
  landing_page_url?: string | null;
  creative_type: 'image' | 'video' | 'carousel' | 'text' | 'document';
  creative_url?: string | null;
  thumbnail_url?: string | null;
  impressions_range?: string | null;
  run_date_start?: string | null;
  run_date_end?: string | null;
  is_active?: boolean;
  scraped_at: string;
  raw_data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Creative type badge
// ---------------------------------------------------------------------------

function CreativeTypeBadge({ type }: { type: LinkedInAd['creative_type'] }) {
  const configs: Record<
    LinkedInAd['creative_type'],
    { label: string; icon: React.ReactNode; classes: string }
  > = {
    image: {
      label: 'Image',
      icon: <Image className="h-3 w-3" />,
      classes: 'bg-blue-500/20 text-blue-400',
    },
    video: {
      label: 'Video',
      icon: <PlayCircle className="h-3 w-3" />,
      classes: 'bg-purple-500/20 text-purple-400',
    },
    carousel: {
      label: 'Carousel',
      icon: <Table2 className="h-3 w-3" />,
      classes: 'bg-emerald-500/20 text-emerald-400',
    },
    text: {
      label: 'Text',
      icon: <FileText className="h-3 w-3" />,
      classes: 'bg-zinc-500/20 text-zinc-400',
    },
    document: {
      label: 'Document',
      icon: <FileText className="h-3 w-3" />,
      classes: 'bg-amber-500/20 text-amber-400',
    },
  };

  const config = configs[type] ?? configs.text;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${config.classes}`}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Ad Card
// ---------------------------------------------------------------------------

interface AdCardProps {
  ad: LinkedInAd;
  isSelected: boolean;
  onToggle: (id: string) => void;
}

function AdCard({ ad, isSelected, onToggle }: AdCardProps) {
  return (
    <div
      className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border transition-all duration-150 ${
        isSelected
          ? 'border-violet-500 bg-violet-500/5 shadow-md shadow-violet-500/10'
          : 'border-gray-800 bg-gray-900 hover:border-gray-700'
      }`}
      onClick={() => onToggle(ad.id)}
      role="checkbox"
      aria-checked={isSelected}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onToggle(ad.id);
        }
      }}
    >
      {/* Checkbox overlay */}
      <div className="absolute left-3 top-3 z-10">
        {isSelected ? (
          <CheckSquare className="h-5 w-5 text-violet-400" />
        ) : (
          <Square className="h-5 w-5 text-gray-600 group-hover:text-gray-400" />
        )}
      </div>

      {/* Creative thumbnail */}
      {ad.thumbnail_url || ad.creative_url ? (
        <div className="relative h-48 w-full overflow-hidden bg-gray-800">
          <img
            src={ad.thumbnail_url ?? ad.creative_url ?? ''}
            alt={ad.headline ?? 'Ad creative'}
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <div className="absolute bottom-2 right-2">
            <CreativeTypeBadge type={ad.creative_type} />
          </div>
        </div>
      ) : (
        <div className="flex h-48 w-full items-center justify-center bg-gray-800">
          <Image className="h-12 w-12 text-gray-600" />
          <div className="absolute bottom-2 right-2">
            <CreativeTypeBadge type={ad.creative_type} />
          </div>
        </div>
      )}

      {/* Ad content */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        {/* Advertiser */}
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 flex-shrink-0 text-gray-500" />
          <span className="truncate text-sm font-medium text-gray-200">
            {ad.advertiser_name}
          </span>
          {ad.is_active && (
            <span className="ml-auto flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500/20 text-emerald-400">
              Active
            </span>
          )}
        </div>

        {/* Headline */}
        {ad.headline && (
          <p className="line-clamp-2 text-sm font-semibold text-gray-100">
            {ad.headline}
          </p>
        )}

        {/* Body text */}
        {ad.body_text && (
          <p className="line-clamp-3 text-xs text-gray-400">{ad.body_text}</p>
        )}

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between pt-2">
          {ad.cta_text && (
            <span className="rounded border border-blue-500/40 px-2 py-0.5 text-xs font-medium text-blue-400">
              {ad.cta_text}
            </span>
          )}
          {ad.landing_page_url && (
            <a
              href={ad.landing_page_url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-gray-500 hover:text-gray-300"
              onClick={(e) => e.stopPropagation()}
              title="Open landing page"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>

        {/* Impressions / date */}
        {(ad.impressions_range ?? ad.run_date_start) && (
          <div className="flex items-center gap-3 border-t border-gray-800 pt-2 text-[11px] text-gray-500">
            {ad.impressions_range && <span>{ad.impressions_range} impressions</span>}
            {ad.run_date_start && (
              <span>
                {ad.run_date_start}
                {ad.run_date_end && ` – ${ad.run_date_end}`}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Floating bulk actions bar
// ---------------------------------------------------------------------------

interface AdBulkActionsBarProps {
  selectedCount: number;
  totalCount: number;
  onDeselectAll: () => void;
  onAddToOpsTable: () => void;
}

function AdBulkActionsBar({
  selectedCount,
  totalCount,
  onDeselectAll,
  onAddToOpsTable,
}: AdBulkActionsBarProps) {
  const isVisible = selectedCount > 0;

  return (
    <div
      className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 transition-all duration-300 ease-out ${
        isVisible
          ? 'translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-4 opacity-0'
      }`}
    >
      <div className="relative overflow-hidden rounded-2xl border border-gray-700 bg-gray-900/90 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-1 px-4 py-3">
          {/* Selected count */}
          <span className="mr-2 whitespace-nowrap text-sm font-medium text-gray-300">
            {selectedCount} selected
            <span className="ml-1 text-gray-500">of {totalCount}</span>
          </span>

          {/* Divider */}
          <div className="mx-2 h-5 w-px bg-gray-700" />

          {/* Add to Ops Table — primary action */}
          <button
            onClick={onAddToOpsTable}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500"
          >
            <Table2 className="h-4 w-4" />
            Add to Ops Table
          </button>

          {/* Divider */}
          <div className="mx-2 h-5 w-px bg-gray-700" />

          {/* Deselect all */}
          <button
            onClick={onDeselectAll}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
            title="Deselect all"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function LinkedInAdLibraryPage() {
  const { userData } = useUser();
  const { activeOrg } = useOrg();

  // Multi-select state
  const [selectedAdIds, setSelectedAdIds] = useState<Set<string>>(new Set());

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAdvertiser, setFilterAdvertiser] = useState('');
  const [importWizardOpen, setImportWizardOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // Data fetching — linkedin_ad_library_ads table
  // ---------------------------------------------------------------------------

  const orgId = activeOrg?.id ?? (userData as any)?.org_id ?? null;

  const {
    data: ads = [],
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery<LinkedInAd[]>({
    queryKey: ['linkedin-ad-library', orgId],
    queryFn: async () => {
      if (!orgId) return [];

      const { data, error } = await (supabase as any)
        .from('linkedin_ad_library_ads')
        .select(
          'id, advertiser_name, advertiser_domain, headline, body_text, cta_text, landing_page_url, creative_type, creative_url, thumbnail_url, impressions_range, run_date_start, run_date_end, is_active, scraped_at'
        )
        .eq('org_id', orgId)
        .order('scraped_at', { ascending: false })
        .limit(200);

      if (error) {
        // Table may not exist yet — return empty rather than crashing
        if (error.code === '42P01') return [];
        throw error;
      }

      return (data ?? []) as LinkedInAd[];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  // ---------------------------------------------------------------------------
  // Filtered ads
  // ---------------------------------------------------------------------------

  const filteredAds = useMemo(() => {
    let result = ads;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (ad) =>
          ad.advertiser_name?.toLowerCase().includes(q) ||
          ad.headline?.toLowerCase().includes(q) ||
          ad.body_text?.toLowerCase().includes(q)
      );
    }

    if (filterAdvertiser.trim()) {
      const q = filterAdvertiser.toLowerCase();
      result = result.filter((ad) =>
        ad.advertiser_name?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [ads, searchQuery, filterAdvertiser]);

  // ---------------------------------------------------------------------------
  // Selection handlers
  // ---------------------------------------------------------------------------

  const handleToggleAd = useCallback((id: string) => {
    setSelectedAdIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const allVisibleSelected =
    filteredAds.length > 0 &&
    filteredAds.every((ad) => selectedAdIds.has(ad.id));

  const someVisibleSelected =
    !allVisibleSelected && filteredAds.some((ad) => selectedAdIds.has(ad.id));

  const handleSelectAll = () => {
    if (allVisibleSelected) {
      // Deselect all visible
      setSelectedAdIds((prev) => {
        const next = new Set(prev);
        filteredAds.forEach((ad) => next.delete(ad.id));
        return next;
      });
    } else {
      // Select all visible
      setSelectedAdIds((prev) => {
        const next = new Set(prev);
        filteredAds.forEach((ad) => next.add(ad.id));
        return next;
      });
    }
  };

  const handleDeselectAll = () => {
    setSelectedAdIds(new Set());
  };

  // ---------------------------------------------------------------------------
  // Bulk action — Add to Ops Table
  // ---------------------------------------------------------------------------

  const handleAddToOpsTable = () => {
    setImportWizardOpen(true);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const selectedCount = selectedAdIds.size;

  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">LinkedIn Ad Library</h1>
          <p className="mt-1 text-sm text-gray-400">
            Browse scraped competitor ads and import them into an ops table for remixing.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2"
        >
          {isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Select All checkbox */}
        <button
          onClick={handleSelectAll}
          className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:text-gray-100"
          title={allVisibleSelected ? 'Deselect all' : 'Select all'}
        >
          {allVisibleSelected ? (
            <CheckSquare className="h-4 w-4 text-violet-400" />
          ) : someVisibleSelected ? (
            <Square className="h-4 w-4 text-violet-400" />
          ) : (
            <Square className="h-4 w-4" />
          )}
          {allVisibleSelected ? 'Deselect all' : 'Select all'}
        </button>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <Input
            placeholder="Search ads…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Advertiser filter */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <Input
            placeholder="Filter by advertiser…"
            value={filterAdvertiser}
            onChange={(e) => setFilterAdvertiser(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Count badge */}
        {filteredAds.length > 0 && (
          <span className="ml-auto text-sm text-gray-500">
            {filteredAds.length} ad{filteredAds.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-72 animate-pulse rounded-xl bg-gray-800"
            />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
          <p className="text-sm text-red-400">Failed to load ads. Please try again.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : filteredAds.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
          <Table2 className="h-12 w-12 text-gray-600" />
          <div>
            <p className="text-base font-medium text-gray-300">No ads found</p>
            <p className="mt-1 text-sm text-gray-500">
              {ads.length === 0
                ? 'Run an Apify LinkedIn Ad Library scrape to populate this view.'
                : 'Try adjusting your search or filter.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredAds.map((ad) => (
            <AdCard
              key={ad.id}
              ad={ad}
              isSelected={selectedAdIds.has(ad.id)}
              onToggle={handleToggleAd}
            />
          ))}
        </div>
      )}

      {/* Floating bulk actions bar */}
      <AdBulkActionsBar
        selectedCount={selectedCount}
        totalCount={filteredAds.length}
        onDeselectAll={handleDeselectAll}
        onAddToOpsTable={handleAddToOpsTable}
      />

      {/* Ad Library Import Wizard — LAP-004 */}
      <AdLibraryImportWizard
        open={importWizardOpen}
        onOpenChange={setImportWizardOpen}
        selectedAdIds={selectedAdIds}
        onSuccess={() => setSelectedAdIds(new Set())}
      />
    </div>
  );
}
