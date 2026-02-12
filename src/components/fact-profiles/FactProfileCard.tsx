import React, { useState } from 'react';
import {
  MoreVertical,
  Eye,
  Pencil,
  Search,
  Share2,
  Trash2,
  Clock,
  Building2,
  Target,
  Globe,
  Loader2,
  CheckCircle,
  AlertCircle,
  FileText,
  XCircle,
  Archive,
  Shield,
  Info,
  User,
  Briefcase,
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
import type {
  FactProfile,
  FactProfileResearchData,
  ResearchStatus,
  ApprovalStatus,
} from '@/lib/types/factProfile';
import { getLogoDevUrl } from '@/lib/utils/logoDev';

// ---------------------------------------------------------------------------
// Section completeness helper
// ---------------------------------------------------------------------------

function getSectionCompleteness(data: FactProfileResearchData): number {
  const sections = [
    data.company_overview?.name,
    data.market_position?.industry,
    data.products_services?.products?.length,
    data.team_leadership?.employee_count || data.team_leadership?.employee_range,
    data.financials?.funding_status || data.financials?.revenue_range,
    data.technology?.tech_stack?.length,
    data.ideal_customer_indicators?.target_industries?.length,
    data.recent_activity?.news?.length || data.recent_activity?.milestones?.length,
  ];
  return sections.filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// Research status badge config
// ---------------------------------------------------------------------------

const RESEARCH_STATUS_CONFIG: Record<
  ResearchStatus,
  { label: string; variant: 'secondary' | 'warning' | 'success' | 'destructive'; icon: React.ReactNode; animated?: boolean }
> = {
  pending: {
    label: 'Pending',
    variant: 'secondary',
    icon: <Clock className="h-3 w-3" />,
  },
  researching: {
    label: 'Researching',
    variant: 'warning',
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
    animated: true,
  },
  complete: {
    label: 'Complete',
    variant: 'success',
    icon: <CheckCircle className="h-3 w-3" />,
  },
  failed: {
    label: 'Failed',
    variant: 'destructive',
    icon: <AlertCircle className="h-3 w-3" />,
  },
};

// ---------------------------------------------------------------------------
// Approval status badge config
// ---------------------------------------------------------------------------

const APPROVAL_STATUS_CONFIG: Record<
  ApprovalStatus,
  { label: string; variant: 'secondary' | 'warning' | 'success' | 'destructive' | 'outline'; icon: React.ReactNode }
> = {
  draft: {
    label: 'Draft',
    variant: 'secondary',
    icon: <FileText className="h-3 w-3" />,
  },
  pending_review: {
    label: 'Pending Review',
    variant: 'warning',
    icon: <AlertCircle className="h-3 w-3" />,
  },
  approved: {
    label: 'Approved',
    variant: 'success',
    icon: <CheckCircle className="h-3 w-3" />,
  },
  changes_requested: {
    label: 'Changes Requested',
    variant: 'destructive',
    icon: <XCircle className="h-3 w-3" />,
  },
  archived: {
    label: 'Archived',
    variant: 'outline',
    icon: <Archive className="h-3 w-3" />,
  },
};

// ---------------------------------------------------------------------------
// Profile type badge
// ---------------------------------------------------------------------------

function ProfileTypeBadge({ type, isOrgProfile }: { type: FactProfile['profile_type']; isOrgProfile?: boolean }) {
  if (isOrgProfile) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
        <Shield className="h-3 w-3" />
        Your Business
      </span>
    );
  }
  if (type === 'client_org') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-blue/10 dark:bg-brand-blue/10 px-2 py-0.5 text-xs font-medium text-brand-blue dark:text-blue-400">
        <Building2 className="h-3 w-3" />
        Client Org
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 dark:bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-400">
      <Target className="h-3 w-3" />
      Target Company
    </span>
  );
}

// ---------------------------------------------------------------------------
// Company logo / avatar
// ---------------------------------------------------------------------------

function CompanyAvatar({
  name,
  logoUrl,
  domain,
}: {
  name: string;
  logoUrl: string | null;
  domain: string | null;
}) {
  const firstLetter = name.charAt(0).toUpperCase();
  const [imageFailed, setImageFailed] = useState(false);
  const resolvedLogoUrl = logoUrl || getLogoDevUrl(domain, { size: 80, format: 'png' });

  React.useEffect(() => {
    setImageFailed(false);
  }, [resolvedLogoUrl]);

  if (resolvedLogoUrl && !imageFailed) {
    return (
      <img
        src={resolvedLogoUrl}
        alt={name}
        className="h-10 w-10 rounded-xl object-cover"
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-blue/10 dark:bg-brand-blue/10 text-brand-blue dark:text-blue-400 text-lg font-semibold">
      {firstLetter}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FactProfileCardProps {
  profile: FactProfile;
  onView: (profile: FactProfile) => void;
  onEdit: (profile: FactProfile) => void;
  onResearch: (profile: FactProfile) => void;
  onShare: (profile: FactProfile) => void;
  onDelete: (profile: FactProfile) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FactProfileCard({
  profile,
  onView,
  onEdit,
  onResearch,
  onShare,
  onDelete,
}: FactProfileCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const researchConfig = RESEARCH_STATUS_CONFIG[profile.research_status] ?? RESEARCH_STATUS_CONFIG.pending;
  const approvalConfig = APPROVAL_STATUS_CONFIG[profile.approval_status] ?? APPROVAL_STATUS_CONFIG.draft;
  const sectionCount = getSectionCompleteness(profile.research_data);

  return (
    <>
      <div
        className="group relative cursor-pointer overflow-hidden rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 p-5 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] dark:shadow-none hover:shadow-md transition-shadow backdrop-blur-sm"
        onClick={() => onView(profile)}
      >
        {/* Header: Logo + Company info + Actions */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <CompanyAvatar
              name={profile.company_name}
              logoUrl={profile.company_logo_url}
              domain={profile.company_domain}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h3 className="truncate text-sm font-semibold text-[#1E293B] dark:text-gray-100">
                  {profile.company_name}
                </h3>
                {profile.is_public && (
                  <Globe className="h-3.5 w-3.5 shrink-0 text-[#64748B] dark:text-gray-400" />
                )}
              </div>
              {profile.company_domain && (
                <p className="truncate text-xs text-[#64748B] dark:text-gray-400">
                  {profile.company_domain}
                </p>
              )}
            </div>
          </div>

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
              <DropdownMenuItem onClick={() => onView(profile)}>
                <Eye className="mr-2 h-4 w-4" />
                View
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit(profile)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onResearch(profile)}>
                <Search className="mr-2 h-4 w-4" />
                Research
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onShare(profile)}>
                <Share2 className="mr-2 h-4 w-4" />
                Share
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {profile.is_org_profile ? (
                <DropdownMenuItem
                  disabled
                  className="text-[#94A3B8] dark:text-gray-500"
                  title="Cannot delete org profile"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Profile type badge */}
        <div className="mb-3 flex items-center gap-2">
          <ProfileTypeBadge type={profile.profile_type} isOrgProfile={profile.is_org_profile} />
          {profile.is_org_profile && (
            <span className="inline-flex items-center gap-1 text-[10px] text-[#94A3B8] dark:text-gray-500">
              <Info className="h-3 w-3" />
              Feeds org context
            </span>
          )}
        </div>

        {/* CRM linking chips */}
        {(profile.linked_company_domain || profile.linked_contact_id || profile.linked_deal_id) && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {profile.linked_company_domain && (
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[10px] font-medium text-[#64748B] dark:text-gray-400">
                <Globe className="h-2.5 w-2.5" />
                {profile.linked_company_domain}
              </span>
            )}
            {profile.linked_contact_id && (
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[10px] font-medium text-[#64748B] dark:text-gray-400">
                <User className="h-2.5 w-2.5" />
                Linked contact
              </span>
            )}
            {profile.linked_deal_id && (
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[10px] font-medium text-[#64748B] dark:text-gray-400">
                <Briefcase className="h-2.5 w-2.5" />
                Linked deal
              </span>
            )}
          </div>
        )}

        {/* Status badges row */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant={researchConfig.variant} className="gap-1 text-[10px]">
            {researchConfig.icon}
            {researchConfig.label}
          </Badge>
          <Badge variant={approvalConfig.variant} className="gap-1 text-[10px]">
            {approvalConfig.icon}
            {approvalConfig.label}
          </Badge>
        </div>

        {/* Section completeness */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-[#64748B] dark:text-gray-400">
              {sectionCount}/8 sections filled
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800">
            <div
              className="h-1.5 rounded-full bg-brand-teal transition-all"
              style={{ width: `${(sectionCount / 8) * 100}%` }}
            />
          </div>
        </div>

        {/* Footer: last updated + action buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-[#64748B] dark:text-gray-400">
            <Clock className="h-3 w-3" />
            <span>
              Updated{' '}
              {formatDistanceToNow(new Date(profile.updated_at), {
                addSuffix: true,
              })}
            </span>
          </div>

          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onView(profile);
              }}
              className="rounded-lg p-1.5 text-[#64748B] dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50 hover:text-[#1E293B] dark:hover:text-gray-100 transition-colors"
              title="View"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(profile);
              }}
              className="rounded-lg p-1.5 text-[#64748B] dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50 hover:text-[#1E293B] dark:hover:text-gray-100 transition-colors"
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onResearch(profile);
              }}
              className="rounded-lg p-1.5 text-[#64748B] dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50 hover:text-[#1E293B] dark:hover:text-gray-100 transition-colors"
              title="Research"
            >
              <Search className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onShare(profile);
              }}
              className="rounded-lg p-1.5 text-[#64748B] dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50 hover:text-[#1E293B] dark:hover:text-gray-100 transition-colors"
              title="Share"
            >
              <Share2 className="h-3.5 w-3.5" />
            </button>
            {profile.is_org_profile ? (
              <button
                disabled
                className="rounded-lg p-1.5 text-[#CBD5E1] dark:text-gray-600 cursor-not-allowed"
                title="Cannot delete org profile"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteConfirm(true);
                }}
                className="rounded-lg p-1.5 text-[#64748B] dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600 dark:text-red-400">
              Delete Fact Profile
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the fact profile for &quot;{profile.company_name}&quot;?
              This action cannot be undone. All research data and sources will be permanently removed.
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
