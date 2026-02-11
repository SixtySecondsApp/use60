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
          className="h-40 animate-pulse rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80"
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
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 px-6 py-16 text-center shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] dark:shadow-none backdrop-blur-sm">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-blue/10 dark:bg-brand-blue/10">
        <Crosshair className="h-7 w-7 text-brand-blue dark:text-blue-400" />
      </div>
      <h3 className="mb-1 text-lg font-semibold text-[#1E293B] dark:text-white">
        Create your first ICP profile
      </h3>
      <p className="mb-6 max-w-sm text-sm text-[#64748B] dark:text-gray-400">
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
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B] dark:text-gray-500" />
          <input
            type="text"
            placeholder="Search profiles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 py-2 pl-10 pr-4 text-sm text-[#1E293B] dark:text-gray-100 placeholder-[#94A3B8] dark:placeholder-gray-500 transition-colors focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue backdrop-blur-sm"
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
                  ? 'bg-[#37bd7e]/10 text-[#1E293B] dark:text-white'
                  : 'text-[#64748B] dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50'
                }`}
            >
              {tab.label}
              {count > 0 && (
                <span className={`ml-1.5 ${statusFilter === tab.value ? 'text-[#37bd7e]' : 'text-[#94A3B8] dark:text-gray-500'}`}>
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
        <div className="flex flex-col items-center justify-center rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 px-6 py-12 text-center backdrop-blur-sm">
          <Search className="mb-2 h-6 w-6 text-[#94A3B8] dark:text-gray-500" />
          <p className="text-sm text-[#64748B] dark:text-gray-400">
            No profiles match your filters
          </p>
        </div>
      )}
    </div>
  );
}
