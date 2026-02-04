import React, { useEffect, useState } from 'react';
import { Sparkles, CheckCircle2, AlertTriangle, RotateCcw, Loader2 } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface EnrichmentProgressBarProps {
  job: {
    id: string;
    status: string;
    total_rows: number;
    processed_rows: number;
    failed_rows: number;
    started_at: string;
  } | null;
  onRetry?: (jobId: string) => void;
}

// ============================================================================
// Helpers
// ============================================================================

function formatElapsed(startedAt: string): string {
  const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  if (elapsed < 60) return `${elapsed}s`;
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return `${mins}m ${secs}s`;
}

// ============================================================================
// Component
// ============================================================================

export function EnrichmentProgressBar({ job, onRetry }: EnrichmentProgressBarProps) {
  const [visible, setVisible] = useState(false);
  const [elapsedLabel, setElapsedLabel] = useState('');

  // Manage visibility transitions
  useEffect(() => {
    if (job) {
      // Enter: show immediately
      requestAnimationFrame(() => setVisible(true));
    }
  }, [job]);

  // Auto-hide on success (no failures) after 3 seconds
  useEffect(() => {
    if (!job) return;
    const isComplete = job.status === 'complete' || job.status === 'failed';
    const hasFailures = job.failed_rows > 0;

    if (isComplete && !hasFailures) {
      const timer = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [job]);

  // Reset visibility state when job is removed
  useEffect(() => {
    if (!job) {
      setVisible(false);
    }
  }, [job]);

  // Tick elapsed timer every second while running
  useEffect(() => {
    if (!job || (job.status !== 'running' && job.status !== 'queued')) {
      return;
    }

    const tick = () => setElapsedLabel(formatElapsed(job.started_at));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [job]);

  if (!job) return null;

  const isRunning = job.status === 'running' || job.status === 'queued';
  const isComplete = job.status === 'complete' || job.status === 'failed';
  const hasFailures = job.failed_rows > 0;
  const progress =
    job.total_rows > 0 ? Math.min((job.processed_rows / job.total_rows) * 100, 100) : 0;

  // Determine bar color
  let barColor = 'bg-violet-500'; // running
  if (isComplete && hasFailures) barColor = 'bg-amber-500';
  if (isComplete && !hasFailures) barColor = 'bg-emerald-500';

  return (
    <div
      className={`overflow-hidden transition-all duration-300 ease-out ${
        visible ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'
      }`}
    >
      <div className="relative mx-0 rounded-lg border border-gray-800 bg-gray-900/95 backdrop-blur-sm">
        {/* Progress bar track */}
        <div className="absolute inset-x-0 top-0 h-1 overflow-hidden rounded-t-lg bg-gray-800">
          <div
            className={`h-full transition-all duration-500 ease-out ${barColor} ${
              isRunning ? 'animate-pulse' : ''
            }`}
            style={{ width: `${isRunning ? progress : 100}%` }}
          />
        </div>

        {/* Content */}
        <div className="flex items-center gap-3 px-4 py-2.5 pt-3">
          {/* Icon */}
          {isRunning && (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-400" />
          )}
          {isComplete && hasFailures && (
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
          )}
          {isComplete && !hasFailures && (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          )}

          {/* Text */}
          <span className="flex-1 text-sm text-gray-300">
            {isRunning && (
              <>
                <span className="font-medium text-violet-300">Enriching...</span>{' '}
                {job.processed_rows}/{job.total_rows} rows
                {elapsedLabel && (
                  <span className="ml-2 text-gray-500">{elapsedLabel}</span>
                )}
              </>
            )}
            {isComplete && hasFailures && (
              <>
                <span className="font-medium text-amber-300">Enrichment complete</span>
                {' \u2014 '}
                {job.failed_rows} row{job.failed_rows !== 1 ? 's' : ''} failed
              </>
            )}
            {isComplete && !hasFailures && (
              <>
                <span className="font-medium text-emerald-300">Enrichment complete</span>
                {' \u2014 '}
                {job.processed_rows} row{job.processed_rows !== 1 ? 's' : ''} enriched
              </>
            )}
          </span>

          {/* Retry button (only when complete with failures) */}
          {isComplete && hasFailures && onRetry && (
            <button
              onClick={() => onRetry(job.id)}
              className="flex shrink-0 items-center gap-1.5 rounded-md bg-amber-600/20 px-3 py-1.5 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-600/30 hover:text-amber-200"
            >
              <RotateCcw className="h-3 w-3" />
              Retry Failed
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default EnrichmentProgressBar;
