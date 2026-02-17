/**
 * EnrichmentLoadingStep
 *
 * Animated loading step that shows progressive discovery of company data.
 * Displays tasks completing as the AI scrapes and analyzes the website.
 */

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Check, Loader } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useOnboardingV2Store } from '@/lib/stores/onboardingV2Store';

interface EnrichmentLoadingStepProps {
  domain: string;
  organizationId: string;
}

const tasks = [
  { label: 'Fetching website pages', threshold: 15, detail: 'Reading homepage and key pages...' },
  { label: 'Analyzing company information', threshold: 35, detail: 'Extracting products and services...' },
  { label: 'Identifying competitors', threshold: 55, detail: 'Researching market position...' },
  { label: 'Learning brand voice', threshold: 75, detail: 'Understanding messaging style...' },
  { label: 'Generating AI skills', threshold: 95, detail: 'Creating personalized configurations...' },
  { label: 'Finalizing profile', threshold: 100, detail: 'Almost done!' },
];

export function EnrichmentLoadingStep({ domain, organizationId: propOrgId }: EnrichmentLoadingStepProps) {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState(0);
  const [startTime] = useState(Date.now());
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showStillWorkingMessage, setShowStillWorkingMessage] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const {
    organizationId: storeOrgId,
    startEnrichment,
    enrichment,
    isEnrichmentLoading,
    enrichmentError,
    setStep,
    enrichmentSource,
    enrichmentRetryCount,
    pollingStartTime,
    resetAndCleanup,
  } = useOnboardingV2Store();

  const handleStartOver = useCallback(async () => {
    if (isResetting) return;
    setIsResetting(true);
    try {
      await resetAndCleanup(queryClient);
    } finally {
      setIsResetting(false);
    }
  }, [isResetting, resetAndCleanup, queryClient]);

  // Use organizationId from store (which gets updated when new org is created)
  // Fall back to prop if store is empty
  const organizationId = storeOrgId || propOrgId;

  // Guard: Redirect to website_input if no organizationId (cannot proceed without it)
  useEffect(() => {
    // Skip guard during manual enrichment initialization (organizationId set asynchronously)
    if (enrichmentSource === 'manual' && isEnrichmentLoading && !enrichment) {
      // Manual enrichment just started, organizationId may be pending async resolution
      return;
    }

    if (!organizationId || organizationId === '') {
      console.error(
        `[EnrichmentLoadingStep] No organizationId for ${enrichmentSource || 'unknown'} enrichment. ` +
        `Redirecting to website_input. Loading: ${isEnrichmentLoading}, Has enrichment: ${!!enrichment}`
      );
      setStep('website_input');
      return;
    }
  }, [organizationId, setStep, enrichmentSource, isEnrichmentLoading, enrichment]);

  // Start enrichment on mount (only for website-based enrichment, not manual)
  // Manual enrichment is already started in submitManualEnrichment
  useEffect(() => {
    if (!organizationId || organizationId === '') {
      return; // Guard above already handles redirect
    }

    // Skip if this is manual enrichment (no domain, and source is 'manual')
    if (!domain && enrichmentSource === 'manual') {
      console.log('EnrichmentLoadingStep: Manual enrichment already started, skipping startEnrichment');
      return;
    }

    // Only start enrichment for website-based flow
    if (domain) {
      startEnrichment(organizationId, domain);
    }
  }, [organizationId, domain, startEnrichment, enrichmentSource]);

  // Simulate progress while enrichment is running
  useEffect(() => {
    if (!isEnrichmentLoading && enrichment?.status === 'completed') {
      setProgress(100);
      return;
    }

    const interval = setInterval(() => {
      setProgress((prev) => {
        // Cap at 90% until enrichment completes
        const max = enrichment?.status === 'completed' ? 100 : 90;
        if (prev >= max) return prev;

        // Adjust speed based on enrichment status
        let increment = 2;
        if (enrichment?.status === 'scraping') increment = 1.5;
        if (enrichment?.status === 'analyzing') increment = 2.5;

        return Math.min(prev + increment, max);
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isEnrichmentLoading, enrichment?.status]);

  // Track elapsed time while loading
  useEffect(() => {
    if (!isEnrichmentLoading) return;

    const timer = setInterval(() => {
      const start = pollingStartTime || startTime;
      setElapsedTime(Math.floor((Date.now() - start) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [isEnrichmentLoading, pollingStartTime, startTime]);

  // Show "still working" message after 30 seconds
  useEffect(() => {
    if (isEnrichmentLoading || enrichment?.status === 'scraping' || enrichment?.status === 'analyzing') {
      const timer = setTimeout(() => {
        if (progress >= 80 && enrichment?.status !== 'completed') {
          setShowStillWorkingMessage(true);
        }
      }, 30000); // 30 seconds

      return () => clearTimeout(timer);
    }
  }, [isEnrichmentLoading, enrichment?.status, progress]);

  // Auto-advance when complete
  useEffect(() => {
    if (progress >= 100 && enrichment?.status === 'completed') {
      const timer = setTimeout(() => {
        setStep('enrichment_result');
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [progress, enrichment?.status, setStep]);

  if (enrichmentError) {
    const hasRetriedMultipleTimes = enrichmentRetryCount >= 2;

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md mx-auto px-4"
      >
        <div className="rounded-2xl shadow-xl border border-gray-800 bg-gray-900 p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">
            {hasRetriedMultipleTimes ? 'Unable to analyze website' : 'Enrichment failed'}
          </h2>
          <p className="text-gray-400 mb-2">{enrichmentError}</p>
          <p className="text-sm text-gray-500 mb-6">
            {hasRetriedMultipleTimes
              ? 'We recommend entering your company details manually to continue.'
              : 'Some websites block automated access. You can retry or enter your company details manually.'}
          </p>
          <div className="flex flex-col gap-3">
            {hasRetriedMultipleTimes ? (
              <>
                <button
                  onClick={() => setStep('manual_enrichment')}
                  className="px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-medium transition-colors"
                >
                  Enter Details Manually
                </button>
                <button
                  onClick={() => {
                    if (!organizationId) return;
                    if (enrichmentSource === 'manual' || !domain) {
                      location.reload();
                    } else {
                      startEnrichment(organizationId, domain, true);
                    }
                  }}
                  disabled={!organizationId}
                  className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Try Again Anyway
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    if (!organizationId) return;
                    if (enrichmentSource === 'manual' || !domain) {
                      location.reload();
                    } else {
                      startEnrichment(organizationId, domain, true);
                    }
                  }}
                  disabled={!organizationId}
                  className="px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Retry
                </button>
                <button
                  onClick={() => setStep('manual_enrichment')}
                  className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors"
                >
                  Enter Details Manually
                </button>
              </>
            )}
          </div>
          {enrichmentRetryCount > 0 && (
            <p className="text-xs text-gray-500 mt-4">
              Attempt {enrichmentRetryCount + 1} of enrichment
            </p>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="w-full max-w-md mx-auto px-4"
    >
      <div className="rounded-2xl shadow-xl border border-gray-800 bg-gray-900 p-8 sm:p-12 text-center">
        {/* Progress Circle */}
        <div className="relative w-24 h-24 mx-auto mb-8">
          <svg className="w-24 h-24 transform -rotate-90">
            <circle
              cx="48"
              cy="48"
              r="44"
              stroke="#374151"
              strokeWidth="6"
              fill="none"
            />
            <circle
              cx="48"
              cy="48"
              r="44"
              stroke="url(#gradient)"
              strokeWidth="6"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${(progress / 100) * 276.46} 276.46`}
              className="transition-all duration-200"
            />
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl font-bold text-white">{Math.round(progress)}%</span>
          </div>
        </div>

        {/* Time Display */}
        <p className="text-xs text-gray-500 mb-6">
          {progress < 90 ? (
            <>Analyzing... ({Math.floor(elapsedTime / 60)}:{(elapsedTime % 60).toString().padStart(2, '0')} elapsed)</>
          ) : (
            <>Finalizing... ({Math.floor(elapsedTime / 60)}:{(elapsedTime % 60).toString().padStart(2, '0')} elapsed)</>
          )}
        </p>

        {/* Title */}
        <h2 className="text-xl font-bold text-white mb-2">
          Analyzing {domain}
        </h2>
        <p className="text-gray-400 mb-8">
          Learning about your business to customize your assistant...
        </p>

        {/* Task List */}
        <div className="space-y-2.5 text-left">
          {tasks.map((task, i) => {
            const isDone = progress > task.threshold - 20;
            // Current task is the first incomplete one
            const isCurrentTask = !isDone && (i === 0 || tasks[i - 1] && progress > tasks[i - 1].threshold - 20);
            return (
              <motion.div
                key={i}
                className={`flex items-center gap-3 py-2 px-3 rounded-lg transition-all ${
                  isDone
                    ? 'bg-emerald-900/30 text-emerald-400'
                    : isCurrentTask
                    ? 'bg-violet-900/20 text-violet-300'
                    : 'text-gray-500'
                }`}
                animate={isCurrentTask ? { backgroundColor: ['rgb(88, 28, 135, 0.2)', 'rgb(109, 40, 217, 0.3)'] } : {}}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                {isDone ? (
                  <Check className="w-4 h-4" />
                ) : isCurrentTask ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                  >
                    <Loader className="w-4 h-4" />
                  </motion.div>
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-current" />
                )}
                <span className="text-sm font-medium">{task.label}</span>
              </motion.div>
            );
          })}
        </div>

        {/* Processing indicator when stuck at 90% */}
        {progress >= 90 && enrichment?.status !== 'completed' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 pt-4 border-t border-gray-800/50"
          >
            <div className="flex items-center justify-center gap-3">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              >
                <Loader className="w-4 h-4 text-violet-400" />
              </motion.div>
              <p className="text-xs text-gray-400">
                Finalizing analysis<motion.span
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  ...
                </motion.span>
              </p>
            </div>
          </motion.div>
        )}

        {/* Still Working Message - appears after 30 seconds */}
        {showStillWorkingMessage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-6 p-4 bg-blue-900/20 border border-blue-800/50 rounded-lg"
          >
            <p className="text-sm text-blue-300">
              <strong>Still analyzing your company...</strong>
              <br />
              Our AI is doing deep research to create the best possible assistant for you.
              This usually takes 20-40 seconds. Thank you for your patience!
            </p>
          </motion.div>
        )}

        {/* Progressive Data Preview */}
        {enrichment && (enrichment.company_name || enrichment.products?.length) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 pt-6 border-t border-gray-800"
          >
            {enrichment.company_name && (
              <p className="text-sm text-gray-400">
                Found: <span className="text-white font-medium">{enrichment.company_name}</span>
              </p>
            )}
            {enrichment.products && enrichment.products.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2 justify-center">
                {enrichment.products.slice(0, 3).map((product, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 text-xs rounded-md bg-violet-900/50 text-violet-300"
                  >
                    {product.name}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* Start Over Link */}
        <div className="mt-8 pt-6 border-t border-gray-800/50">
          <button
            onClick={handleStartOver}
            disabled={isResetting}
            className="text-xs text-gray-500 hover:text-gray-400 transition-colors disabled:opacity-50"
          >
            {isResetting ? 'Resetting...' : 'Start over'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
