/**
 * ProfileVersionHistory — Shared version history panel for all profile types.
 *
 * Shows a list of version snapshots with timestamps, change summaries,
 * expandable JSON preview, and revert functionality with confirmation dialog.
 * Works generically for fact_profile, product_profile, and icp_profile.
 */

import React, { useState } from 'react';
import { Clock, RotateCcw, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { useProfileVersions, useRevertToVersion } from '@/lib/hooks/useProfileVersions';
import type { ProfileType } from '@/lib/types/profileVersion';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProfileVersionHistoryProps {
  profileType: ProfileType;
  profileId: string;
  currentVersion: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProfileVersionHistory({
  profileType,
  profileId,
  currentVersion,
}: ProfileVersionHistoryProps) {
  const { data: versions = [], isLoading } = useProfileVersions(profileType, profileId);
  const revertMutation = useRevertToVersion(profileType);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [revertTarget, setRevertTarget] = useState<{ id: string; versionNumber: number } | null>(null);

  const handleRevert = () => {
    if (!revertTarget) return;
    revertMutation.mutate(
      { profileId, versionId: revertTarget.id },
      { onSuccess: () => setRevertTarget(null) }
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-[#94A3B8] dark:text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading version history...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Current version indicator */}
      <div className="px-3 py-2 rounded-lg bg-brand-blue/5 dark:bg-brand-blue/10 border border-brand-blue/20 dark:border-brand-blue/30">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-brand-blue dark:text-blue-400">
            Current: Version {currentVersion}
          </span>
        </div>
      </div>

      {versions.length === 0 ? (
        <div className="p-6 text-center text-sm text-[#94A3B8] dark:text-gray-500">
          No previous versions yet. Versions are created automatically when content changes.
        </div>
      ) : (
        <div className="space-y-2">
          {versions.map((version) => {
            const versionNumber = 'version_number' in version ? version.version_number : 0;
            const isExpanded = expandedId === version.id;

            return (
              <div
                key={version.id}
                className="border border-[#E2E8F0] dark:border-gray-700/50 rounded-lg overflow-hidden hover:border-[#CBD5E1] dark:hover:border-gray-600 transition-colors"
              >
                {/* Version header */}
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : version.id)}
                    className="text-[#64748B] dark:text-gray-400 hover:text-[#1E293B] dark:hover:text-gray-100 transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[#1E293B] dark:text-gray-100">
                        Version {versionNumber}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-[#94A3B8] dark:text-gray-500">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    {version.change_summary && (
                      <p className="text-xs text-[#64748B] dark:text-gray-400 mt-0.5 truncate">
                        {version.change_summary}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setRevertTarget({ id: version.id, versionNumber })}
                    className="flex-shrink-0 p-1.5 rounded-lg text-brand-blue dark:text-blue-400 hover:bg-brand-blue/10 dark:hover:bg-brand-blue/10 transition-colors"
                    title="Revert to this version"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </div>

                {/* Expanded snapshot preview */}
                {isExpanded && (
                  <div className="border-t border-[#E2E8F0] dark:border-gray-700/50 px-3 py-2 bg-[#F8FAFC] dark:bg-gray-800/30">
                    <pre className="text-xs text-[#64748B] dark:text-gray-400 overflow-auto max-h-64 whitespace-pre-wrap">
                      {JSON.stringify(version.snapshot, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Revert confirmation dialog */}
      <AlertDialog open={!!revertTarget} onOpenChange={(open) => !open && setRevertTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revert to Version {revertTarget?.versionNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              Your current data will be saved as a new version before reverting.
              This action creates a snapshot of the current state, so no data is lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              onClick={handleRevert}
              disabled={revertMutation.isPending}
              className="bg-brand-blue hover:bg-brand-blue/90 text-white"
            >
              {revertMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Reverting...
                </>
              ) : (
                <>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Revert
                </>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
