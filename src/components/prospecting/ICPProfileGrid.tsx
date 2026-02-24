import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  Crosshair,
  Building2,
  User,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { ICPProfileCard } from '@/components/prospecting/ICPProfileCard';
import { ICPGroupCard } from '@/components/prospecting/ICPGroupCard';
import { useICPProfiles as useICPProfilesList, useDeleteICPProfile, useDuplicateICPProfile } from '@/lib/hooks/useICPProfilesCRUD';
import type { ICPProfile, ICPStatus, ICPProfileType } from '@/lib/types/prospecting';

// ---------------------------------------------------------------------------
// Filter Tabs
// ---------------------------------------------------------------------------

const STATUS_TABS: { label: string; value: ICPStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Archived', value: 'archived' },
];

const PROFILE_TYPE_TABS: { label: string; value: ICPProfileType | 'all' | 'standalone'; icon: React.ElementType }[] = [
  { label: 'All', value: 'all', icon: Crosshair },
  { label: 'Company ICPs', value: 'icp', icon: Building2 },
  { label: 'Buyer Personas', value: 'persona', icon: User },
  { label: 'Standalone', value: 'standalone', icon: User },
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
  onCreatePersona?: (parentIcpId?: string) => void;
  onTestProfile: (profile: ICPProfile) => void;
  onOpenTable?: (tableId: string) => void;
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
  onCreatePersona,
  onTestProfile,
  onOpenTable,
}: ICPProfileGridProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ICPStatus | 'all'>('all');
  const [profileTypeFilter, setProfileTypeFilter] = useState<ICPProfileType | 'all' | 'standalone'>('all');

  const { data: profiles, isLoading } = useICPProfilesList(orgId);
  const deleteProfile = useDeleteICPProfile();
  const duplicateProfile = useDuplicateICPProfile();

  // Compute ICP groups and standalone personas
  const { icpGroups, standalonePersonas } = useMemo(() => {
    if (!profiles) return { icpGroups: [], standalonePersonas: [] };

    const icps = profiles.filter((p) => (p.profile_type || 'icp') === 'icp');
    const personas = profiles.filter((p) => p.profile_type === 'persona');

    const groups = icps.map((icp) => ({
      icp,
      children: personas.filter((p) => p.parent_icp_id === icp.id),
    }));

    const standalone = personas.filter((p) => !p.parent_icp_id);

    return { icpGroups: groups, standalonePersonas: standalone };
  }, [profiles]);

  // Filter logic with search matching across ICPs and personas
  const filteredData = useMemo(() => {
    const matchesSearch = (p: ICPProfile) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.description ?? '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = (p: ICPProfile) =>
      statusFilter === 'all' || p.status === statusFilter;

    if (profileTypeFilter === 'all') {
      // Show all ICP groups + standalone personas
      const groups = icpGroups
        .map((group) => ({
          ...group,
          children: group.children.filter((p) => matchesStatus(p)),
        }))
        .filter((group) => {
          const icpMatches = matchesSearch(group.icp) && matchesStatus(group.icp);
          const childMatches = group.children.some(matchesSearch);
          return icpMatches || childMatches;
        });

      const standalone = standalonePersonas.filter(
        (p) => matchesSearch(p) && matchesStatus(p)
      );

      return { groups, standalone };
    } else if (profileTypeFilter === 'icp') {
      // Show only ICP groups
      const groups = icpGroups
        .map((group) => ({
          ...group,
          children: group.children.filter((p) => matchesStatus(p)),
        }))
        .filter((group) => matchesSearch(group.icp) && matchesStatus(group.icp));

      return { groups, standalone: [] };
    } else if (profileTypeFilter === 'persona') {
      // Show all personas (in their ICP groups + standalone)
      const groups = icpGroups
        .map((group) => ({
          ...group,
          children: group.children.filter((p) => matchesSearch(p) && matchesStatus(p)),
        }))
        .filter((group) => group.children.length > 0);

      const standalone = standalonePersonas.filter(
        (p) => matchesSearch(p) && matchesStatus(p)
      );

      return { groups, standalone };
    } else if (profileTypeFilter === 'standalone') {
      // Show only standalone personas
      const standalone = standalonePersonas.filter(
        (p) => matchesSearch(p) && matchesStatus(p)
      );

      return { groups: [], standalone };
    }

    return { groups: [], standalone: [] };
  }, [icpGroups, standalonePersonas, searchQuery, statusFilter, profileTypeFilter]);

  // Handlers
  const handleDelete = (profile: ICPProfile) => {
    deleteProfile.mutate({
      id: profile.id,
      orgId: profile.organization_id,
      name: profile.name,
      parentIcpId: profile.parent_icp_id,
    });
  };

  const handleDuplicate = (profile: ICPProfile) => {
    duplicateProfile.mutate({ id: profile.id, newName: `${profile.name} (Copy)` });
  };

  const handleCreatePersona = (parentIcpId?: string) => {
    if (onCreatePersona) {
      onCreatePersona(parentIcpId);
    }
  };

  if (isLoading) {
    return <GridSkeleton />;
  }

  if (!profiles || profiles.length === 0) {
    return <EmptyState onCreateProfile={onCreateProfile} />;
  }

  return (
    <div className="space-y-4">
      {/* Toolbar: Search + Create Dropdown */}
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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="gap-2 shrink-0">
              <Plus className="h-4 w-4" />
              New Profile
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onCreateProfile}>
              <Building2 className="mr-2 h-4 w-4" />
              New Company ICP
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleCreatePersona()}>
              <User className="mr-2 h-4 w-4" />
              New Buyer Persona
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Profile Type Filter Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {PROFILE_TYPE_TABS.map((tab) => {
          let count = 0;
          if (tab.value === 'all') {
            count = profiles?.length ?? 0;
          } else if (tab.value === 'icp') {
            count = icpGroups.length;
          } else if (tab.value === 'persona') {
            count = (profiles?.filter((p) => p.profile_type === 'persona').length ?? 0);
          } else if (tab.value === 'standalone') {
            count = standalonePersonas.length;
          }

          const Icon = tab.icon;

          // Hide standalone tab if no standalone personas
          if (tab.value === 'standalone' && count === 0) {
            return null;
          }

          return (
            <button
              key={tab.value}
              onClick={() => setProfileTypeFilter(tab.value)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5
                ${profileTypeFilter === tab.value
                  ? 'bg-brand-blue/10 dark:bg-brand-blue/10 text-brand-blue dark:text-blue-400 border border-brand-blue/20 dark:border-brand-blue/30'
                  : 'text-[#64748B] dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50'
                }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
              {count > 0 && (
                <span className={`ml-0.5 ${profileTypeFilter === tab.value ? 'text-brand-blue dark:text-blue-400' : 'text-[#94A3B8] dark:text-gray-500'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STATUS_TABS.map((tab) => {
          const totalCount =
            filteredData.groups.reduce((sum, g) => sum + 1 + g.children.length, 0) +
            filteredData.standalone.length;

          const count =
            tab.value === 'all'
              ? totalCount
              : filteredData.groups.reduce(
                  (sum, g) =>
                    sum +
                    (g.icp.status === tab.value ? 1 : 0) +
                    g.children.filter((p) => p.status === tab.value).length,
                  0
                ) + filteredData.standalone.filter((p) => p.status === tab.value).length;

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

      {/* Hierarchical Grid */}
      {filteredData.groups.length > 0 || filteredData.standalone.length > 0 ? (
        <div className="space-y-4">
          {/* ICP Groups */}
          {filteredData.groups.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
              {filteredData.groups.map((group) => (
                <ICPGroupCard
                  key={group.icp.id}
                  icpProfile={group.icp}
                  childPersonas={group.children}
                  isSelected={group.icp.id === selectedProfileId}
                  onSelect={onSelectProfile}
                  onEdit={onEditProfile}
                  onDuplicate={handleDuplicate}
                  onDelete={handleDelete}
                  onTest={onTestProfile}
                  onCreatePersona={handleCreatePersona}
                  onOpenTable={onOpenTable}
                />
              ))}
            </div>
          )}

          {/* Standalone Personas Section */}
          {filteredData.standalone.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-[#64748B] dark:text-gray-400" />
                <h3 className="text-sm font-semibold text-[#1E293B] dark:text-gray-100">
                  Standalone Personas ({filteredData.standalone.length})
                </h3>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredData.standalone.map((persona) => (
                  <ICPProfileCard
                    key={persona.id}
                    profile={persona}
                    isSelected={persona.id === selectedProfileId}
                    onSelect={onSelectProfile}
                    onEdit={onEditProfile}
                    onDuplicate={handleDuplicate}
                    onDelete={handleDelete}
                    onTest={onTestProfile}
                    onOpenTable={onOpenTable}
                  />
                ))}
              </div>
            </div>
          )}
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
