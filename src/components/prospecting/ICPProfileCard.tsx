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
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
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
// Filter Summary
// ---------------------------------------------------------------------------

function FilterSummary({ profile }: { profile: ICPProfile }) {
  const parts: string[] = [];
  const c = profile.criteria;
  if (!c) return null;

  const isPersona = profile.profile_type === 'persona';

  if (isPersona) {
    // Persona profiles: show demographic summary (seniority, departments, titles, product_tag)
    if (c.seniority_levels?.length) {
      parts.push(c.seniority_levels.join(', '));
    }
    if (c.departments?.length) {
      parts.push(`${c.departments.length} ${c.departments.length === 1 ? 'dept' : 'depts'}`);
    }
    if (c.title_keywords?.length) {
      parts.push(`${c.title_keywords.length} title ${c.title_keywords.length === 1 ? 'keyword' : 'keywords'}`);
    }
    if (c.product_tag) {
      parts.push(`Product: ${c.product_tag}`);
    }
  } else {
    // ICP profiles: show firmographic summary (industries, employee ranges)
    if (c.industries?.length) {
      parts.push(`${c.industries.length} ${c.industries.length === 1 ? 'industry' : 'industries'}`);
    }
    if (c.employee_ranges?.length) {
      const range = c.employee_ranges[0];
      parts.push(`${range.min}-${range.max} employees`);
    }
  }

  if (parts.length === 0) return null;

  return (
    <p className="text-xs text-[#64748B] dark:text-gray-400 truncate">
      {parts.join(' \u00B7 ')}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ICPProfileCardProps {
  profile: ICPProfile;
  isSelected: boolean;
  onSelect: (profile: ICPProfile) => void;
  onEdit: (profile: ICPProfile) => void;
  onDuplicate: (profile: ICPProfile) => void;
  onDelete: (profile: ICPProfile) => void;
  onTest: (profile: ICPProfile) => void;
  onOpenTable?: (tableId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ICPProfileCard({
  profile,
  isSelected,
  onSelect,
  onEdit,
  onDuplicate,
  onDelete,
  onTest,
  onOpenTable,
}: ICPProfileCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const statusConfig = STATUS_CONFIG[profile.status] ?? STATUS_CONFIG.active;

  return (
    <>
      <div
        onClick={() => onSelect(profile)}
        className={`group relative cursor-pointer overflow-hidden rounded-xl border p-5 transition-all duration-200 hover:shadow-md backdrop-blur-sm
          ${isSelected
            ? 'border-brand-blue ring-2 ring-brand-blue/30 bg-white dark:bg-gray-900/80'
            : 'border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 hover:border-gray-300 dark:hover:border-gray-600 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] dark:shadow-none'
          }`}
      >
        {/* Status banner for active profiles */}
        {profile.status === 'active' && (
          <div className="mb-3 flex items-center gap-1.5 rounded-lg border border-brand-teal/20 dark:border-brand-teal/30 bg-brand-teal/5 dark:bg-brand-teal/10 px-2.5 py-1.5 text-xs font-medium text-brand-teal dark:text-emerald-300">
            <CheckCircle className="h-3 w-3" />
            Active
            {profile.updated_at && (
              <span className="opacity-70">
                {new Date(profile.updated_at).toLocaleDateString()}
              </span>
            )}
          </div>
        )}

        {/* Header: name + actions */}
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="truncate text-sm font-semibold text-[#1E293B] dark:text-gray-100">
                {profile.name}
              </h3>
              <Badge
                variant="outline"
                className="shrink-0 text-[10px] border-brand-blue/30 dark:border-brand-blue/30 text-brand-blue dark:text-blue-400"
              >
                {(profile.profile_type || 'icp').toUpperCase()}
              </Badge>
              {profile.criteria?.product_tag && (
                <Badge
                  variant="outline"
                  className="shrink-0 text-[10px] border-violet-300/50 dark:border-violet-400/50 text-violet-600 dark:text-violet-400 bg-violet-50/50 dark:bg-violet-950/30"
                >
                  {profile.criteria.product_tag}
                </Badge>
              )}
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
                {profile.linked_table_id && onOpenTable && (
                  <>
                    <DropdownMenuItem onClick={() => onOpenTable(profile.linked_table_id!)}>
                      <Table className="mr-2 h-4 w-4" />
                      Open Table
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={() => onEdit(profile)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDuplicate(profile)}>
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onTest(profile)}>
                  <Play className="mr-2 h-4 w-4" />
                  Test Now
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setShowDeleteConfirm(true)}
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
        {profile.description && (
          <p className="mb-3 line-clamp-2 text-xs text-[#64748B] dark:text-gray-400">
            {profile.description}
          </p>
        )}

        {/* Provider + Filter summary */}
        <div className="mb-3 flex items-center gap-2">
          <ProviderLabel provider={profile.target_provider} />
          <span className="text-[#64748B] dark:text-gray-500">|</span>
          <FilterSummary profile={profile} />
        </div>

        {/* Linked table indicator */}
        {profile.linked_table_id && onOpenTable && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenTable(profile.linked_table_id!);
            }}
            className="mb-3 flex w-full items-center gap-2 rounded-lg border border-brand-blue/20 dark:border-brand-blue/30 bg-brand-blue/5 dark:bg-brand-blue/10 px-3 py-2 text-xs font-medium text-brand-blue dark:text-blue-400 transition-colors hover:bg-brand-blue/10 dark:hover:bg-brand-blue/20"
          >
            <Table className="h-3.5 w-3.5" />
            Open Leads Table
            <span className="ml-auto text-brand-blue/60 dark:text-blue-400/60">&rarr;</span>
          </button>
        )}

        {/* Footer: last tested + find more button */}
        <div className="flex items-center justify-between">
          {profile.last_tested_at ? (
            <div className="flex items-center gap-1.5 text-xs text-[#64748B] dark:text-gray-400">
              <Clock className="h-3 w-3" />
              <span>
                Tested {formatDistanceToNow(new Date(profile.last_tested_at), { addSuffix: true })}
              </span>
              {profile.last_test_result_count != null && (
                <>
                  <span className="text-[#64748B] dark:text-gray-500">&middot;</span>
                  <span>{profile.last_test_result_count.toLocaleString()} results</span>
                </>
              )}
            </div>
          ) : (
            <span className="text-xs text-[#64748B] dark:text-gray-400">Not tested yet</span>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              onTest(profile);
            }}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-blue dark:text-blue-400 opacity-0 group-hover:opacity-100 transition-all hover:bg-brand-blue/10 dark:hover:bg-blue-500/10"
          >
            <Play className="h-3 w-3" />
            Find Leads
          </button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600 dark:text-red-400">
              {profile.profile_type === 'persona' ? 'Delete Buyer Persona' : 'Delete Company ICP'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{profile.name}&quot;? This action cannot be undone.
              Any search history linked to this {profile.profile_type === 'persona' ? 'persona' : 'ICP'} will be preserved but unlinked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => {
                setShowDeleteConfirm(false);
                onDelete(profile);
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
