import { useState } from 'react';
import {
  Package,
  Pencil,
  Trash2,
  Target,
  MoreHorizontal,
  Star,
  ExternalLink,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
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
import type { ProductProfile } from '@/lib/types/productProfile';

// ---------------------------------------------------------------------------
// Category badge colors
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<string, string> = {
  SaaS: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
  Service: 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400',
  Platform: 'bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400',
  Hardware: 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400',
  Consulting: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400',
  Other: 'bg-gray-50 text-gray-700 dark:bg-gray-500/10 dark:text-gray-400',
};

function getCategoryClasses(category: string): string {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.Other;
}

// ---------------------------------------------------------------------------
// Research status indicator dot
// ---------------------------------------------------------------------------

const RESEARCH_STATUS_DOT: Record<string, string> = {
  pending: 'bg-gray-400',
  researching: 'bg-amber-400 animate-pulse',
  complete: 'bg-green-500',
  failed: 'bg-red-500',
};

function ResearchDot({ status }: { status: string }) {
  const dotClass = RESEARCH_STATUS_DOT[status] ?? RESEARCH_STATUS_DOT.pending;
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${dotClass}`}
      title={`Research: ${status}`}
    />
  );
}

// ---------------------------------------------------------------------------
// Product logo / icon
// ---------------------------------------------------------------------------

function ProductAvatar({
  name,
  logoUrl,
}: {
  name: string;
  logoUrl: string | null;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  if (logoUrl && !imageFailed) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className="h-10 w-10 rounded-xl object-cover"
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-blue/10 dark:bg-brand-blue/10 text-brand-blue dark:text-blue-400">
      <Package className="h-5 w-5" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProductProfileCardProps {
  profile: ProductProfile;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onCreateICP?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProductProfileCard({
  profile,
  onClick,
  onEdit,
  onDelete,
  onCreateICP,
}: ProductProfileCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <>
      <Card
        className="group relative cursor-pointer overflow-hidden border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] dark:shadow-none hover:shadow-md transition-shadow"
        onClick={onClick}
      >
        <CardContent className="p-5">
          {/* Header: Logo + Product info + Actions */}
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <ProductAvatar name={profile.name} logoUrl={profile.logo_url} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h3 className="truncate text-sm font-semibold text-[#1E293B] dark:text-gray-100">
                    {profile.name}
                  </h3>
                  {profile.is_primary && (
                    <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
                  )}
                  <ResearchDot status={profile.research_status} />
                </div>
                {profile.category && (
                  <span
                    className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${getCategoryClasses(profile.category)}`}
                  >
                    {profile.category}
                  </span>
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
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={onClick}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onCreateICP}>
                  <Target className="mr-2 h-4 w-4" />
                  Create ICP
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

          {/* Description */}
          {profile.description && (
            <p className="mb-3 text-xs text-[#64748B] dark:text-gray-400 line-clamp-2">
              {profile.description}
            </p>
          )}

          {/* Footer: last updated */}
          <div className="flex items-center gap-1.5 text-xs text-[#64748B] dark:text-gray-400">
            <span>
              Updated{' '}
              {formatDistanceToNow(new Date(profile.updated_at), {
                addSuffix: true,
              })}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600 dark:text-red-400">
              Delete Product Profile
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the product profile &quot;{profile.name}&quot;?
              This action cannot be undone. All research data will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => {
                setShowDeleteConfirm(false);
                onDelete?.();
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
