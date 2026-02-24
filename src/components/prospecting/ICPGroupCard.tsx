import React, { useState } from 'react';
import {
  MoreVertical,
  Pencil,
  Copy,
  Play,
  Trash2,
  Clock,
  CheckCircle,
  Table,
  Building2,
  UserCircle,
  ChevronDown,
  ChevronUp,
  Plus,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import type { ICPProfile, ICPStatus, ICPTargetProvider } from '@/lib/types/prospecting';

// ---------------------------------------------------------------------------
// Status Badge Config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Partial<Record<ICPStatus, { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline' }>> = {
  active: { label: 'Active', variant: 'success' },
  archived: { label: 'Archived', variant: 'outline' },
  draft: { label: 'Draft', variant: 'secondary' },
  testing: { label: 'Testing', variant: 'warning' },
  pending_approval: { label: 'Pending', variant: 'warning' },
  approved: { label: 'Approved', variant: 'success' },
};

// ---------------------------------------------------------------------------
// Provider Label
// ---------------------------------------------------------------------------

function ProviderLabel({ provider }: { provider: ICPTargetProvider }) {
  const labels: Record<ICPTargetProvider, string> = {
    apollo: 'Apollo',
    ai_ark: 'AI Ark',
    both: 'Apollo + AI Ark',
  };
  return (
    <span className="text-xs text-[#64748B] dark:text-gray-400">{labels[provider]}</span>
  );
}

// ---------------------------------------------------------------------------
// ICP Filter Summary (firmographic)
// ---------------------------------------------------------------------------

function ICPFilterSummary({ profile }: { profile: ICPProfile }) {
  const parts: string[] = [];
  const c = profile.criteria;
  if (!c) return null;

  if (c.industries?.length) {
    parts.push(`${c.industries.length} ${c.industries.length === 1 ? 'industry' : 'industries'}`);
  }
  if (c.employee_ranges?.length) {
    const range = c.employee_ranges[0];
    parts.push(`${range.min}-${range.max} employees`);
  }
  if (c.funding_stages?.length) {
    parts.push(`${c.funding_stages.length} funding ${c.funding_stages.length === 1 ? 'stage' : 'stages'}`);
  }
  if (c.location_countries?.length) {
    parts.push(`${c.location_countries.length} ${c.location_countries.length === 1 ? 'country' : 'countries'}`);
  }

  if (parts.length === 0) return null;

  return (
    <p className="text-xs text-[#64748B] dark:text-gray-400">
      {parts.join(' · ')}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Persona Mini Card
// ---------------------------------------------------------------------------

interface PersonaMiniCardProps {
  persona: ICPProfile;
  onEdit: (persona: ICPProfile) => void;
  onDelete: (persona: ICPProfile) => void;
}

function PersonaMiniCard({ persona, onEdit, onDelete }: PersonaMiniCardProps) {
  const c = persona.criteria;
  const seniorityTitle = c?.seniority_levels?.join(', ') || '';
  const titleKeywords = c?.title_keywords?.slice(0, 2).join(', ') || '';
  const summary = seniorityTitle || titleKeywords || 'No targeting criteria';

  return (
    <div className="group relative flex items-start gap-3 rounded-lg border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 p-3 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm transition-all">
      {/* Icon */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 dark:bg-violet-950/30">
        <UserCircle className="h-4 w-4 text-violet-600 dark:text-violet-400" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <h4 className="truncate text-xs font-semibold text-[#1E293B] dark:text-gray-100">
            {persona.name}
          </h4>
          {c?.product_tag && (
            <Badge
              variant="outline"
              className="shrink-0 text-[9px] border-violet-300/50 dark:border-violet-400/50 text-violet-600 dark:text-violet-400 bg-violet-50/50 dark:bg-violet-950/30"
            >
              {c.product_tag}
            </Badge>
          )}
        </div>
        <p className="text-[10px] text-[#64748B] dark:text-gray-400 truncate">
          {summary}
        </p>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(persona);
          }}
        >
          <Pencil className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-red-600 dark:text-red-400 hover:text-red-600 dark:hover:text-red-400"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(persona);
          }}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ICPGroupCardProps {
  icpProfile: ICPProfile;
  childPersonas: ICPProfile[];
  isSelected: boolean;
  onSelect: (profile: ICPProfile) => void;
  onEdit: (profile: ICPProfile) => void;
  onDuplicate: (profile: ICPProfile) => void;
  onDelete: (profile: ICPProfile) => void;
  onTest: (profile: ICPProfile) => void;
  onCreatePersona: (parentIcpId: string) => void;
  onOpenTable?: (tableId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ICPGroupCard({
  icpProfile,
  childPersonas,
  isSelected,
  onSelect,
  onEdit,
  onDuplicate,
  onDelete,
  onTest,
  onCreatePersona,
  onOpenTable,
}: ICPGroupCardProps) {
  // Expand personas section by default if <=5, collapse if >5
  const [isExpanded, setIsExpanded] = useState(childPersonas.length <= 5);

  const statusConfig = STATUS_CONFIG[icpProfile.status] ?? STATUS_CONFIG.active;

  return (
    <div
      onClick={() => onSelect(icpProfile)}
      className={`group relative cursor-pointer overflow-hidden rounded-xl border p-5 transition-all duration-200 hover:shadow-md backdrop-blur-sm
        ${isSelected
          ? 'border-brand-blue ring-2 ring-brand-blue/30 bg-white dark:bg-gray-900/80'
          : 'border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 hover:border-gray-300 dark:hover:border-gray-600 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] dark:shadow-none'
        }`}
    >
      {/* Status banner for active profiles */}
      {icpProfile.status === 'active' && (
        <div className="mb-3 flex items-center gap-1.5 rounded-lg border border-brand-teal/20 dark:border-brand-teal/30 bg-brand-teal/5 dark:bg-brand-teal/10 px-2.5 py-1.5 text-xs font-medium text-brand-teal dark:text-emerald-300">
          <CheckCircle className="h-3 w-3" />
          Active
          {icpProfile.updated_at && (
            <span className="opacity-70">
              {new Date(icpProfile.updated_at).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      {/* Header: ICP icon + name + actions */}
      <div className="mb-3 flex items-start gap-3">
        {/* ICP Icon */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-blue/10 dark:bg-brand-blue/20">
          <Building2 className="h-5 w-5 text-brand-blue dark:text-blue-400" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="truncate text-base font-semibold text-[#1E293B] dark:text-gray-100">
              {icpProfile.name}
            </h3>
            <Badge
              variant="outline"
              className="shrink-0 text-[10px] border-brand-blue/30 dark:border-brand-blue/30 text-brand-blue dark:text-blue-400"
            >
              ICP
            </Badge>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={statusConfig.variant} className="text-[10px]">
            {statusConfig.label}
          </Badge>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              {icpProfile.linked_table_id && onOpenTable && (
                <>
                  <DropdownMenuItem onClick={() => onOpenTable(icpProfile.linked_table_id!)}>
                    <Table className="mr-2 h-4 w-4" />
                    Open Table
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={() => onEdit(icpProfile)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(icpProfile)}>
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onTest(icpProfile)}>
                <Play className="mr-2 h-4 w-4" />
                Test Now
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(icpProfile)}
                className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Description */}
      {icpProfile.description && (
        <div className="ml-13 mb-3">
          <p className="line-clamp-2 text-xs text-[#64748B] dark:text-gray-400">
            {icpProfile.description}
          </p>
        </div>
      )}

      {/* Provider + Filter summary */}
      <div className="ml-13 mb-3 flex items-center gap-2">
        <ProviderLabel provider={icpProfile.target_provider} />
        <span className="text-[#64748B] dark:text-gray-500">|</span>
        <ICPFilterSummary profile={icpProfile} />
      </div>

      {/* Linked table indicator */}
      {icpProfile.linked_table_id && onOpenTable && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenTable(icpProfile.linked_table_id!);
          }}
          className="ml-13 mb-3 flex w-[calc(100%-3.25rem)] items-center gap-2 rounded-lg border border-brand-blue/20 dark:border-brand-blue/30 bg-brand-blue/5 dark:bg-brand-blue/10 px-3 py-2 text-xs font-medium text-brand-blue dark:text-blue-400 transition-colors hover:bg-brand-blue/10 dark:hover:bg-brand-blue/20"
        >
          <Table className="h-3.5 w-3.5" />
          Open Leads Table
          <span className="ml-auto text-brand-blue/60 dark:text-blue-400/60">&rarr;</span>
        </button>
      )}

      {/* Footer: last tested */}
      <div className="ml-13 mb-4 flex items-center justify-between">
        {icpProfile.last_tested_at ? (
          <div className="flex items-center gap-1.5 text-xs text-[#64748B] dark:text-gray-400">
            <Clock className="h-3 w-3" />
            <span>
              Tested {formatDistanceToNow(new Date(icpProfile.last_tested_at), { addSuffix: true })}
            </span>
            {icpProfile.last_test_result_count != null && (
              <>
                <span className="text-[#64748B] dark:text-gray-500">&middot;</span>
                <span>{icpProfile.last_test_result_count.toLocaleString()} results</span>
              </>
            )}
          </div>
        ) : (
          <span className="text-xs text-[#64748B] dark:text-gray-400">Not tested yet</span>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            onTest(icpProfile);
          }}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-blue dark:text-blue-400 opacity-0 group-hover:opacity-100 transition-all hover:bg-brand-blue/10 dark:hover:bg-blue-500/10"
        >
          <Play className="h-3 w-3" />
          Find Leads
        </button>
      </div>

      {/* Divider */}
      <div className="mb-4 border-t border-[#E2E8F0] dark:border-gray-700/50" />

      {/* Buyer Personas Section */}
      <div>
        {/* Header with expand/collapse */}
        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="flex items-center gap-2 text-sm font-semibold text-[#1E293B] dark:text-gray-100 hover:text-brand-blue dark:hover:text-blue-400 transition-colors"
          >
            <UserCircle className="h-4 w-4" />
            Buyer Personas ({childPersonas.length})
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onCreatePersona(icpProfile.id);
            }}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Persona
          </Button>
        </div>

        {/* Personas list or empty state */}
        {isExpanded && (
          <div onClick={(e) => e.stopPropagation()}>
            {childPersonas.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#E2E8F0] dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/30 p-6 text-center">
                <UserCircle className="mx-auto mb-2 h-8 w-8 text-[#64748B] dark:text-gray-400" />
                <p className="text-xs text-[#64748B] dark:text-gray-400 mb-3">
                  No buyer personas yet — add one to target specific decision-makers
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCreatePersona(icpProfile.id);
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Create First Persona
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {childPersonas.map((persona) => (
                  <PersonaMiniCard
                    key={persona.id}
                    persona={persona}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
