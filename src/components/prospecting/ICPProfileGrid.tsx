import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  Crosshair,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ICPProfileCard } from '@/components/prospecting/ICPProfileCard';
import { useICPProfiles as useICPProfilesList, useDeleteICPProfile, useDuplicateICPProfile } from '@/lib/hooks/useICPProfilesCRUD';
import type { ICPProfile, ICPStatus } from '@/lib/types/prospecting';

// ---------------------------------------------------------------------------
// Status Filter Tabs
// ---------------------------------------------------------------------------

const STATUS_TABS: { label: string; value: ICPStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Testing', value: 'testing' },
  { label: 'Approved', value: 'approved' },
  { label: 'Active', value: 'active' },
  { label: 'Archived', value: 'archived' },
];

// ---------------------------------------------------------------------------
// Loading Skeleton
// ---------------------------------------------------------------------------

function GridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          className="h-40 animate-pulse rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800/40"
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyState({ onCreateProfile }: { onCreateProfile: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 px-6 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-200 dark:bg-zinc-800">
        <Crosshair className="h-7 w-7 text-gray-500 dark:text-zinc-500" />
      </div>
      <h3 className="mb-1 text-lg font-medium text-gray-900 dark:text-white">
        Create your first ICP profile
      </h3>
      <p className="mb-6 max-w-sm text-sm text-gray-600 dark:text-zinc-400">
        Define your ideal customer profile to start prospecting across data providers.
      </p>
      <Button onClick={onCreateProfile} className="gap-2">
        <Plus className="h-4 w-4" />
        Create ICP Profile
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ICPProfileGridProps {
  orgId: string;
  selectedProfileId?: string;
  onSelectProfile: (profile: ICPProfile) => void;
  onEditProfile: (profile: ICPProfile) => void;
  onCreateProfile: () => void;
  onTestProfile: (profile: ICPProfile) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ICPProfileGrid({
  orgId,
  selectedProfileId,
  onSelectProfile,
  onEditProfile,
  onCreateProfile,
  onTestProfile,
}: ICPProfileGridProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ICPStatus | 'all'>('all');

  const { data: profiles, isLoading } = useICPProfilesList(orgId);
  const deleteProfile = useDeleteICPProfile();
  const duplicateProfile = useDuplicateICPProfile();

  // Filter profiles
  const filteredProfiles = useMemo(() => {
    if (!profiles) return [];
    return profiles.filter((p) => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase())
        || (p.description ?? '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [profiles, searchQuery, statusFilter]);

  // Handlers
  const handleDelete = (profile: ICPProfile) => {
    deleteProfile.mutate({ id: profile.id, orgId: profile.organization_id, name: profile.name });
  };

  const handleDuplicate = (profile: ICPProfile) => {
    duplicateProfile.mutate({ id: profile.id, newName: `${profile.name} (Copy)` });
  };

  if (isLoading) {
    return <GridSkeleton />;
  }

  if (!profiles || profiles.length === 0) {
    return <EmptyState onCreateProfile={onCreateProfile} />;
  }

  return (
    <div className="space-y-4">
      {/* Toolbar: Search + Create Button */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-zinc-500" />
          <input
            type="text"
            placeholder="Search profiles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900/60 py-2 pl-10 pr-4 text-sm text-gray-900 dark:text-zinc-100 placeholder-gray-500 dark:placeholder-zinc-500 transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <Button onClick={onCreateProfile} size="sm" className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          New Profile
        </Button>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STATUS_TABS.map((tab) => {
          const count = tab.value === 'all'
            ? (profiles?.length ?? 0)
            : (profiles?.filter((p) => p.status === tab.value).length ?? 0);

          return (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors
                ${statusFilter === tab.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800'
                }`}
            >
              {tab.label}
              {count > 0 && (
                <span className={`ml-1.5 ${statusFilter === tab.value ? 'text-primary-foreground/80' : 'text-gray-400 dark:text-zinc-500'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Grid */}
      {filteredProfiles.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProfiles.map((profile) => (
            <ICPProfileCard
              key={profile.id}
              profile={profile}
              isSelected={profile.id === selectedProfileId}
              onSelect={onSelectProfile}
              onEdit={onEditProfile}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
              onTest={onTestProfile}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-gray-200 dark:border-zinc-800 px-6 py-12 text-center">
          <Search className="mb-2 h-6 w-6 text-gray-400 dark:text-zinc-600" />
          <p className="text-sm text-gray-500 dark:text-zinc-500">
            No profiles match your filters
          </p>
        </div>
      )}
    </div>
  );
}
