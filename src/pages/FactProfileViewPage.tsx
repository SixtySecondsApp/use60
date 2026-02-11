/**
 * FactProfileViewPage -- Page wrapper for the read-only Fact Profile view.
 *
 * Fetches a single fact profile by ID from the URL params, handles loading
 * (skeleton shimmer) and not-found states, and delegates to FactProfileView
 * for the full read-only display.
 */

import { Helmet } from 'react-helmet-async';
import { useParams, useNavigate } from 'react-router-dom';
import { useFactProfile } from '@/lib/hooks/useFactProfiles';
import { FactProfileView } from '@/components/fact-profiles/FactProfileView';
import { ArrowLeft } from 'lucide-react';

// ---------------------------------------------------------------------------
// Skeleton shimmer component for loading state
// ---------------------------------------------------------------------------

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-gray-200/70 dark:bg-gray-700/50 ${className ?? ''}`} />
  );
}

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-gray-950">
      {/* Header skeleton */}
      <div className="border-b border-[#E2E8F0] dark:border-gray-800 bg-white dark:bg-gray-900/80">
        <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-3">
          <div className="flex items-center gap-3">
            <SkeletonBlock className="h-5 w-16" />
            <div className="h-5 w-px bg-[#E2E8F0] dark:bg-gray-700" />
            <SkeletonBlock className="h-5 w-48" />
            <div className="flex-1" />
            <SkeletonBlock className="h-8 w-20" />
            <SkeletonBlock className="h-8 w-28" />
          </div>
        </div>
      </div>

      <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-6 max-w-4xl space-y-6">
        {/* Hero skeleton */}
        <div className="rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-start gap-5">
            <SkeletonBlock className="h-20 w-20 !rounded-2xl flex-shrink-0" />
            <div className="flex-1 space-y-3 w-full">
              <SkeletonBlock className="h-8 w-64" />
              <SkeletonBlock className="h-5 w-96 max-w-full" />
              <div className="flex gap-3">
                <SkeletonBlock className="h-4 w-32" />
                <SkeletonBlock className="h-4 w-24" />
                <SkeletonBlock className="h-4 w-28" />
              </div>
              <div className="flex gap-2">
                <SkeletonBlock className="h-6 w-24 !rounded-full" />
                <SkeletonBlock className="h-6 w-32 !rounded-full" />
              </div>
            </div>
          </div>
        </div>

        {/* Section skeletons */}
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 overflow-hidden"
          >
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[#E2E8F0] dark:border-gray-700/50 bg-[#F8FAFC]/50 dark:bg-gray-800/30">
              <SkeletonBlock className="h-4 w-4" />
              <SkeletonBlock className="h-4 w-40" />
              <div className="flex-1" />
              <SkeletonBlock className="h-4 w-4 !rounded-full" />
            </div>
            <div className="px-5 py-5 space-y-3">
              <SkeletonBlock className="h-4 w-full" />
              <SkeletonBlock className="h-4 w-3/4" />
              <div className="flex gap-2">
                <SkeletonBlock className="h-7 w-20 !rounded-full" />
                <SkeletonBlock className="h-7 w-24 !rounded-full" />
                <SkeletonBlock className="h-7 w-16 !rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Not Found state
// ---------------------------------------------------------------------------

function NotFoundState() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-gray-950 flex items-center justify-center">
      <div className="text-center max-w-md px-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F8FAFC] dark:bg-gray-800 border border-[#E2E8F0] dark:border-gray-700 mx-auto mb-4">
          <ArrowLeft className="h-7 w-7 text-[#94A3B8] dark:text-gray-500" />
        </div>
        <h2 className="text-lg font-semibold text-[#1E293B] dark:text-gray-100 mb-2">
          Fact profile not found
        </h2>
        <p className="text-sm text-[#64748B] dark:text-gray-400 mb-6">
          The fact profile you are looking for does not exist or may have been deleted.
        </p>
        <button
          type="button"
          onClick={() => navigate('/fact-profiles')}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-brand-blue text-white hover:bg-brand-blue/90 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Fact Profiles
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function FactProfileViewPage() {
  const { id } = useParams<{ id: string }>();
  const { data: profile, isLoading } = useFactProfile(id);

  if (isLoading) {
    return (
      <>
        <Helmet>
          <title>Loading Fact Profile | 60</title>
        </Helmet>
        <LoadingSkeleton />
      </>
    );
  }

  if (!profile) {
    return (
      <>
        <Helmet>
          <title>Not Found | 60</title>
        </Helmet>
        <NotFoundState />
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>{profile.company_name} — Fact Profile | 60</title>
      </Helmet>
      <FactProfileView profile={profile} />
    </>
  );
}
