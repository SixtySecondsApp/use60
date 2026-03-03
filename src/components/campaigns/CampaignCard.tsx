import React, { useState } from 'react';
import {
  Send,
  Eye,
  MessageSquare,
  MoreVertical,
  Pause,
  Play,
  Trash2,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { campaignStatusLabel, formatCampaignDate } from './campaignUtils';
import type { Campaign, CampaignAnalytics, CampaignStatus } from '@/lib/types/campaign';

interface Props {
  campaign: Campaign;
  analytics?: CampaignAnalytics;
  onSelect: (campaign: Campaign) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
  isPausing?: boolean;
  isResuming?: boolean;
  isDeleting?: boolean;
}

function statusBadgeVariant(status: CampaignStatus): 'success' | 'warning' | 'default' | 'secondary' {
  switch (status) {
    case 1: return 'success';
    case 2: return 'warning';
    case 3: return 'default';
    default: return 'secondary';
  }
}

export function CampaignCard({
  campaign,
  analytics,
  onSelect,
  onPause,
  onResume,
  onDelete,
  isPausing,
  isResuming,
  isDeleting,
}: Props) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const statusLabel = campaignStatusLabel(campaign.status);
  const date = formatCampaignDate(campaign.timestamp || campaign.created_at);
  const isActive = campaign.status === 1;
  const isPaused = campaign.status === 2;

  return (
    <>
      <div
        className="group flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 px-4 py-3 transition-colors hover:border-gray-300 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        onClick={() => onSelect(campaign)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onSelect(campaign)}
      >
        {/* Status dot */}
        <div
          className={`h-2 w-2 shrink-0 rounded-full ${
            campaign.status === 1
              ? 'bg-emerald-400'
              : campaign.status === 2
              ? 'bg-amber-400'
              : campaign.status === 3
              ? 'bg-blue-400'
              : 'bg-gray-400 dark:bg-gray-500'
          }`}
        />

        {/* Name + meta */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{campaign.name}</p>
          <div className="mt-0.5 flex items-center gap-3">
            <Badge variant={statusBadgeVariant(campaign.status)} className="text-[10px] px-1.5 py-0.5 rounded">
              {statusLabel}
            </Badge>
            {date && <span className="text-xs text-gray-400 dark:text-gray-500">{date}</span>}
          </div>
        </div>

        {/* Analytics mini-row */}
        {analytics && (
          <div className="hidden sm:flex items-center gap-4 shrink-0">
            <StatPill icon={Send} value={analytics.emails_sent_count ?? 0} label="Sent" color="text-violet-500 dark:text-violet-400" />
            <StatPill icon={Eye} value={analytics.open_count_unique ?? 0} label="Opens" color="text-amber-500 dark:text-amber-400" />
            <StatPill icon={MessageSquare} value={analytics.reply_count_unique ?? 0} label="Replies" color="text-emerald-500 dark:text-emerald-400" />
          </div>
        )}

        {/* Leads count badge */}
        {analytics?.leads_count != null && (
          <div className="hidden md:flex flex-col items-end shrink-0 text-right">
            <span className="text-sm font-medium text-gray-900 dark:text-white">{analytics.leads_count}</span>
            <span className="text-[10px] text-gray-400 dark:text-gray-500">leads</span>
          </div>
        )}

        {/* Actions dropdown */}
        <div
          className="shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex h-7 w-7 items-center justify-center rounded text-gray-400 dark:text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-label="Campaign actions"
              >
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">Open campaign menu</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {isActive && (
                <DropdownMenuItem
                  onClick={() => onPause(campaign.id)}
                  disabled={isPausing}
                  className="gap-2 text-amber-600 dark:text-amber-400 focus:text-amber-600 dark:focus:text-amber-400"
                >
                  {isPausing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Pause className="h-3.5 w-3.5" />
                  )}
                  Pause
                </DropdownMenuItem>
              )}
              {isPaused && (
                <DropdownMenuItem
                  onClick={() => onResume(campaign.id)}
                  disabled={isResuming}
                  className="gap-2 text-emerald-600 dark:text-emerald-400 focus:text-emerald-600 dark:focus:text-emerald-400"
                >
                  {isResuming ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  Resume
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isDeleting}
                className="gap-2 text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
              >
                {isDeleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600 group-hover:text-gray-500 dark:group-hover:text-gray-400 transition-colors" />
      </div>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &ldquo;{campaign.name}&rdquo; from Instantly. This cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowDeleteConfirm(false);
                onDelete(campaign.id);
              }}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function StatPill({
  icon: Icon,
  value,
  label,
  color,
}: {
  icon: React.ElementType;
  value: number;
  label: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <Icon className={`h-3 w-3 ${color}`} />
      <span className="text-xs text-gray-600 dark:text-gray-300">{value}</span>
      <span className="text-[10px] text-gray-400 dark:text-gray-600">{label}</span>
    </div>
  );
}
