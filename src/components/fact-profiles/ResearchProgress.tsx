import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Globe,
  Sparkles,
  Layers,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { factProfileKeys } from '@/lib/hooks/useFactProfiles';
import { factProfileService } from '@/lib/services/factProfileService';
import { supabase } from '@/lib/supabase/clientV2';
import type { FactProfile } from '@/lib/types/factProfile';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ResearchProgressProps {
  profileId: string;
  onComplete: (profile: FactProfile) => void;
  onCancel: () => void;
}

type StageStatus = 'pending' | 'active' | 'complete';

interface Stage {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  status: StageStatus;
}

// ---------------------------------------------------------------------------
// Progress calculator (time-based fake progress)
// ---------------------------------------------------------------------------

function getEstimatedProgress(elapsedMs: number): number {
  const s = elapsedMs / 1000;
  if (s <= 5) return Math.round((s / 5) * 15);
  if (s <= 10) return 15 + Math.round(((s - 5) / 5) * 20);
  if (s <= 20) return 35 + Math.round(((s - 10) / 10) * 25);
  if (s <= 30) return 60 + Math.round(((s - 20) / 10) * 20);
  return Math.min(90, 80 + Math.round(((s - 30) / 60) * 10));
}

function getActiveStageIndex(elapsedMs: number): number {
  const s = elapsedMs / 1000;
  if (s < 5) return 0;
  if (s < 12) return 1;
  if (s < 22) return 2;
  return 2; // Stay on "Building sections" until complete
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ResearchProgress({
  profileId,
  onComplete,
  onCancel,
}: ResearchProgressProps) {
  const [progress, setProgress] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isFailed, setIsFailed] = useState(false);
  const startTimeRef = useRef(Date.now());
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use direct useQuery with refetchInterval for polling during research
  const { data: profile } = useQuery<FactProfile | null, Error>({
    queryKey: factProfileKeys.detail(profileId),
    queryFn: () => factProfileService.getProfile(profileId),
    enabled: !!profileId,
    refetchInterval: isComplete || isFailed ? false : 3000,
  });

  // Determine research status from profile data
  const researchStatus = profile?.research_status ?? 'researching';

  // Animate progress based on elapsed time
  useEffect(() => {
    if (isComplete || isFailed) return;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      setProgress(getEstimatedProgress(elapsed));
    }, 250);

    return () => clearInterval(interval);
  }, [isComplete, isFailed]);

  // Handle status changes
  useEffect(() => {
    if (researchStatus === 'complete' && !isComplete) {
      setIsComplete(true);
      setProgress(100);
      // Call onComplete after a short delay to show the success state
      completeTimerRef.current = setTimeout(() => {
        if (profile) onComplete(profile);
      }, 1000);
    } else if (researchStatus === 'failed' && !isFailed) {
      setIsFailed(true);
    }

    return () => {
      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
    };
  }, [researchStatus, isComplete, isFailed, profile, onComplete]);

  // Retry handler
  const handleRetry = useCallback(async () => {
    setIsRetrying(true);
    try {
      const { error } = await supabase.functions.invoke('research-fact-profile', {
        body: { action: 'retry', profileId },
      });
      if (error) {
        toast.error('Failed to retry research: ' + error.message);
      } else {
        // Reset state for new research attempt
        setIsFailed(false);
        setIsComplete(false);
        setProgress(0);
        startTimeRef.current = Date.now();
        toast.success('Research restarted');
      }
    } catch {
      toast.error('Failed to retry research');
    } finally {
      setIsRetrying(false);
    }
  }, [profileId]);

  // Build stages with current status
  const elapsedMs = Date.now() - startTimeRef.current;
  const activeIndex = isComplete ? 3 : isFailed ? -1 : getActiveStageIndex(elapsedMs);

  const stages: Stage[] = [
    {
      key: 'scraping',
      label: 'Scraping website',
      icon: Globe,
      status: isComplete ? 'complete' : activeIndex > 0 ? 'complete' : activeIndex === 0 ? 'active' : 'pending',
    },
    {
      key: 'analyzing',
      label: 'Analyzing data',
      icon: Sparkles,
      status: isComplete ? 'complete' : activeIndex > 1 ? 'complete' : activeIndex === 1 ? 'active' : 'pending',
    },
    {
      key: 'building',
      label: 'Building sections',
      icon: Layers,
      status: isComplete ? 'complete' : activeIndex > 2 ? 'complete' : activeIndex === 2 ? 'active' : 'pending',
    },
    {
      key: 'complete',
      label: 'Complete',
      icon: CheckCircle2,
      status: isComplete ? 'complete' : 'pending',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm"
        onClick={isFailed ? onCancel : undefined}
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm mx-4 overflow-hidden rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/95 shadow-2xl">
        {/* Gradient top border */}
        <div className="h-1 bg-gradient-to-r from-brand-violet via-violet-500 to-purple-600" />

        {/* Close / Cancel button */}
        <button
          onClick={onCancel}
          className="absolute right-3 top-4 rounded-lg p-1 text-[#94A3B8] dark:text-gray-500 hover:text-[#64748B] dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-6">
          {/* Header */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-[#1E293B] dark:text-gray-100">
              {isFailed ? 'Research Failed' : isComplete ? 'Research Complete' : 'Researching...'}
            </h3>
            <p className="text-sm text-[#64748B] dark:text-gray-400 mt-1">
              {isFailed
                ? 'Something went wrong while researching this company.'
                : isComplete
                  ? 'All sections have been populated with research data.'
                  : 'Gathering and analyzing company information.'}
            </p>
          </div>

          {/* Progress bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-[#64748B] dark:text-gray-400">
                Progress
              </span>
              <span className="text-xs font-medium text-[#64748B] dark:text-gray-400">
                {isFailed ? '--' : `${progress}%`}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all duration-500 ease-out ${
                  isFailed
                    ? 'bg-red-500 dark:bg-red-400'
                    : isComplete
                      ? 'bg-green-500 dark:bg-green-400'
                      : 'bg-brand-violet'
                }`}
                style={{ width: `${isFailed ? 100 : progress}%` }}
              />
            </div>
          </div>

          {/* Vertical stepper */}
          <div className="space-y-0">
            {stages.map((stage, index) => {
              const Icon = stage.icon;
              const isLast = index === stages.length - 1;

              return (
                <div key={stage.key} className="flex items-start gap-3">
                  {/* Dot + connector line */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
                        isFailed && stage.status !== 'complete'
                          ? 'bg-red-50 dark:bg-red-500/10 text-red-500 dark:text-red-400'
                          : stage.status === 'complete'
                            ? 'bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400'
                            : stage.status === 'active'
                              ? 'bg-violet-50 dark:bg-violet-500/10 text-brand-violet dark:text-violet-400'
                              : 'bg-gray-50 dark:bg-gray-800/50 text-[#94A3B8] dark:text-gray-500'
                      }`}
                    >
                      {stage.status === 'active' && !isFailed ? (
                        <div className="relative">
                          <Icon className="h-4 w-4" />
                          <span className="absolute -inset-1 rounded-full animate-ping bg-brand-violet/20" />
                        </div>
                      ) : (
                        <Icon className="h-4 w-4" />
                      )}
                    </div>
                    {/* Connector line */}
                    {!isLast && (
                      <div
                        className={`w-0.5 h-4 transition-colors ${
                          stage.status === 'complete'
                            ? 'bg-green-200 dark:bg-green-500/20'
                            : 'bg-gray-200 dark:bg-gray-700/50'
                        }`}
                      />
                    )}
                  </div>

                  {/* Label */}
                  <div className="flex items-center h-8">
                    <span
                      className={`text-sm font-medium transition-colors ${
                        isFailed && stage.status !== 'complete'
                          ? 'text-red-500 dark:text-red-400'
                          : stage.status === 'complete'
                            ? 'text-green-600 dark:text-green-400'
                            : stage.status === 'active'
                              ? 'text-[#1E293B] dark:text-gray-100'
                              : 'text-[#94A3B8] dark:text-gray-500'
                      }`}
                    >
                      {stage.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Error state actions */}
          {isFailed && (
            <div className="mt-6 flex items-center gap-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 p-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-500 dark:text-red-400" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-red-700 dark:text-red-300">
                  Research could not be completed. You can try again.
                </p>
              </div>
            </div>
          )}

          {/* Footer actions */}
          <div className="mt-6 flex justify-end gap-2">
            {isFailed && (
              <>
                <Button variant="outline" onClick={onCancel} size="sm">
                  Close
                </Button>
                <Button
                  onClick={handleRetry}
                  disabled={isRetrying}
                  size="sm"
                  className="bg-brand-blue hover:bg-brand-blue/90 text-white"
                >
                  {isRetrying ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Retrying...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Retry Research
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
