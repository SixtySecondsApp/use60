/**
 * PublicFactProfile -- Public-facing read-only fact profile page with approval flow.
 *
 * Route: /share/fact-profile/:token
 * No auth required. All data fetched via share_token.
 *
 * States:
 *   1. Loading       -- Skeleton shimmer while fetching
 *   2. Expired       -- Link has expired
 *   3. PasswordGate  -- Password required before showing content
 *   4. NotFound      -- Invalid token
 *   5. Unlocked      -- Profile visible with approval section
 *   6. Submitted     -- After approval/changes requested (thank you)
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/lib/supabase/clientV2';
import { usePublicFactProfile } from '@/lib/hooks/useFactProfiles';
import { getLogoDevUrl } from '@/lib/utils/logoDev';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type {
  FactProfile,
  CompanyOverviewSection,
  MarketPositionSection,
  ProductsServicesSection,
  TeamLeadershipSection,
  FinancialsSection,
  TechnologySection,
  IdealCustomerIndicatorsSection,
  RecentActivitySection,
} from '@/lib/types/factProfile';
import {
  Lock,
  Clock,
  FileQuestion,
  CheckCircle2,
  AlertCircle,
  Circle,
  Building2,
  TrendingUp,
  Package,
  Users,
  DollarSign,
  Cpu,
  Target,
  Newspaper,
  Globe,
  ExternalLink,
  MapPin,
  Calendar,
  Briefcase,
  Link2,
  Send,
  Eye,
  Loader2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Section completeness checkers (mirrors FactProfileView)
// ---------------------------------------------------------------------------

function isOverviewComplete(s: CompanyOverviewSection | undefined): boolean {
  return !!(s?.name && s?.description);
}
function isMarketComplete(s: MarketPositionSection | undefined): boolean {
  return !!(s?.industry && s?.differentiators?.length);
}
function isProductsComplete(s: ProductsServicesSection | undefined): boolean {
  return !!(s?.products?.length || s?.key_features?.length);
}
function isTeamComplete(s: TeamLeadershipSection | undefined): boolean {
  return !!(s?.key_people?.length || s?.employee_range);
}
function isFinancialsComplete(s: FinancialsSection | undefined): boolean {
  return !!(s?.revenue_range || s?.funding_status || s?.total_raised);
}
function isTechComplete(s: TechnologySection | undefined): boolean {
  return !!(s?.tech_stack?.length);
}
function isICPComplete(s: IdealCustomerIndicatorsSection | undefined): boolean {
  return !!(s?.pain_points?.length || s?.value_propositions?.length);
}
function isActivityComplete(s: RecentActivitySection | undefined): boolean {
  return !!(s?.news?.length || s?.milestones?.length);
}

// ---------------------------------------------------------------------------
// Small helpers (matching FactProfileView design system)
// ---------------------------------------------------------------------------

function PillBadge({
  children,
  color = 'default',
}: {
  children: React.ReactNode;
  color?: 'default' | 'blue' | 'violet' | 'teal' | 'amber';
}) {
  const colorMap: Record<string, string> = {
    default:
      'bg-[#F8FAFC] dark:bg-gray-800 text-[#1E293B] dark:text-gray-200 border-[#E2E8F0] dark:border-gray-700',
    blue: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20',
    violet:
      'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-500/20',
    teal: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20',
    amber:
      'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20',
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${colorMap[color]}`}
    >
      {children}
    </span>
  );
}

function FieldDisplay({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number | null | undefined;
  icon?: React.ReactNode;
}) {
  if (!value && value !== 0) return null;
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium text-[#64748B] dark:text-gray-400 flex items-center gap-1.5">
        {icon}
        {label}
      </dt>
      <dd className="text-sm text-[#1E293B] dark:text-gray-100">{value}</dd>
    </div>
  );
}

function TagList({
  label,
  tags,
  color = 'default',
}: {
  label: string;
  tags: string[] | undefined;
  color?: 'default' | 'blue' | 'violet' | 'teal' | 'amber';
}) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className="space-y-2">
      <dt className="text-xs font-medium text-[#64748B] dark:text-gray-400">{label}</dt>
      <dd className="flex flex-wrap gap-1.5">
        {tags.map((tag, i) => (
          <PillBadge key={`${tag}-${i}`} color={color}>
            {tag}
          </PillBadge>
        ))}
      </dd>
    </div>
  );
}

function SectionCard({
  title,
  icon,
  isComplete,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  isComplete: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[#E2E8F0] dark:border-gray-700/50 bg-[#F8FAFC]/50 dark:bg-gray-800/30">
        <span className="flex-shrink-0 text-[#64748B] dark:text-gray-400">{icon}</span>
        <h2 className="flex-1 text-sm font-semibold text-[#1E293B] dark:text-gray-100">{title}</h2>
        {isComplete ? (
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-brand-teal" />
        ) : (
          <Circle className="h-4 w-4 flex-shrink-0 text-[#94A3B8] dark:text-gray-500" />
        )}
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

function EmptySection() {
  return (
    <p className="text-sm text-[#94A3B8] dark:text-gray-500 italic">No data available</p>
  );
}

function HeroAvatar({
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
  const resolvedLogoUrl = logoUrl || getLogoDevUrl(domain, { size: 160, format: 'png' });

  useEffect(() => {
    setImageFailed(false);
  }, [resolvedLogoUrl]);

  if (resolvedLogoUrl && !imageFailed) {
    return (
      <img
        src={resolvedLogoUrl}
        alt={name}
        className="h-20 w-20 rounded-2xl object-cover ring-4 ring-white dark:ring-gray-900 shadow-lg"
        onError={() => setImageFailed(true)}
      />
    );
  }
  return (
    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-blue/10 dark:bg-brand-blue/10 text-brand-blue dark:text-blue-400 text-3xl font-bold ring-4 ring-white dark:ring-gray-900 shadow-lg">
      {firstLetter}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-[#E2E8F0] dark:bg-gray-700/50 ${className ?? ''}`} />
  );
}

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-gray-950">
      <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-6 max-w-4xl space-y-6">
        {/* Hero skeleton */}
        <div className="rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-start gap-5">
            <SkeletonBlock className="h-20 w-20 !rounded-2xl flex-shrink-0" />
            <div className="flex-1 w-full space-y-3">
              <SkeletonBlock className="h-8 w-64" />
              <SkeletonBlock className="h-4 w-96 max-w-full" />
              <div className="flex gap-3">
                <SkeletonBlock className="h-4 w-28" />
                <SkeletonBlock className="h-4 w-28" />
                <SkeletonBlock className="h-4 w-28" />
              </div>
            </div>
          </div>
        </div>
        {/* Section skeletons */}
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 overflow-hidden"
          >
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[#E2E8F0] dark:border-gray-700/50 bg-[#F8FAFC]/50 dark:bg-gray-800/30">
              <SkeletonBlock className="h-4 w-4" />
              <SkeletonBlock className="h-4 w-36" />
            </div>
            <div className="px-5 py-5 space-y-3">
              <SkeletonBlock className="h-4 w-full" />
              <SkeletonBlock className="h-4 w-3/4" />
              <SkeletonBlock className="h-4 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Centered message card (for expired / not found / submitted states)
// ---------------------------------------------------------------------------

function CenteredCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 p-8 sm:p-10 max-w-md w-full text-center space-y-4">
        <div className="flex justify-center">{icon}</div>
        <h1 className="text-xl font-semibold text-[#1E293B] dark:text-gray-100">{title}</h1>
        <p className="text-sm text-[#64748B] dark:text-gray-400">{description}</p>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Password Gate
// ---------------------------------------------------------------------------

function PasswordGate({
  token,
  onUnlocked,
}: {
  token: string;
  onUnlocked: () => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setLoading(true);
    setError('');

    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        'fact-profile-approve',
        {
          body: {
            action: 'verify_password',
            share_token: token,
            password: password.trim(),
          },
        }
      );

      if (fnError) {
        setError('Failed to verify password. Please try again.');
        return;
      }

      if (data?.verified) {
        onUnlocked();
      } else {
        setError('Incorrect password');
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 p-8 sm:p-10 max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F8FAFC] dark:bg-gray-800">
            <Lock className="h-7 w-7 text-[#64748B] dark:text-gray-400" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-[#1E293B] dark:text-gray-100">
            This profile is password protected
          </h1>
          <p className="text-sm text-[#64748B] dark:text-gray-400">
            Enter the password to view this fact profile.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError('');
              }}
              placeholder="Enter password"
              className={`w-full rounded-lg border px-4 py-2.5 text-sm text-[#1E293B] dark:text-gray-100 bg-white dark:bg-gray-900 placeholder-[#94A3B8] dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-blue/50 transition-colors ${
                error
                  ? 'border-red-300 dark:border-red-500/50'
                  : 'border-[#E2E8F0] dark:border-gray-700'
              }`}
              autoFocus
            />
            {error && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
          </div>
          <Button
            type="submit"
            className="w-full bg-brand-blue hover:bg-brand-blue/90"
            disabled={loading || !password.trim()}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Lock className="h-4 w-4 mr-2" />
            )}
            Unlock
          </Button>
        </form>
        <p className="text-xs text-[#94A3B8] dark:text-gray-500">
          Powered by 60
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Approval Section
// ---------------------------------------------------------------------------

function ApprovalSection({
  profile,
  token,
  onSubmitted,
}: {
  profile: FactProfile;
  token: string;
  onSubmitted: (action: 'approved' | 'changes_requested') => void;
}) {
  const [mode, setMode] = useState<'idle' | 'feedback'>('idle');
  const [reviewerName, setReviewerName] = useState('');
  const [feedbackText, setFeedbackText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Already approved -- show banner
  if (profile.approval_status === 'approved') {
    return (
      <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-5 py-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-[#1E293B] dark:text-gray-100">
              This profile was approved
              {profile.approved_by ? ` by ${profile.approved_by}` : ''}
            </p>
            {profile.approved_at && (
              <p className="text-xs text-[#64748B] dark:text-gray-400 mt-0.5">
                {new Date(profile.approved_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Changes already requested -- show banner
  if (profile.approval_status === 'changes_requested') {
    return (
      <div className="rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 px-5 py-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-[#1E293B] dark:text-gray-100">
              Changes have been requested
              {profile.approved_by ? ` by ${profile.approved_by}` : ''}
            </p>
            {profile.approval_feedback && (
              <p className="text-sm text-orange-700 dark:text-orange-300 mt-1.5 whitespace-pre-wrap">
                {profile.approval_feedback}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Not in pending_review -- don't show approval section
  if (profile.approval_status !== 'pending_review') {
    return null;
  }

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('fact-profile-approve', {
        body: {
          action: 'approve',
          share_token: token,
          reviewer_name: reviewerName.trim() || undefined,
        },
      });

      if (error || !data?.success) {
        toast.error(data?.error || 'Failed to approve profile');
        return;
      }

      onSubmitted('approved');
    } catch {
      toast.error('An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestChanges = async () => {
    if (!feedbackText.trim()) {
      toast.error('Please provide feedback on what needs to change.');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('fact-profile-approve', {
        body: {
          action: 'request_changes',
          share_token: token,
          reviewer_name: reviewerName.trim() || undefined,
          feedback: feedbackText.trim(),
        },
      });

      if (error || !data?.success) {
        toast.error(data?.error || 'Failed to submit feedback');
        return;
      }

      onSubmitted('changes_requested');
    } catch {
      toast.error('An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[#E2E8F0] dark:border-gray-700/50 bg-[#F8FAFC]/50 dark:bg-gray-800/30">
        <span className="flex-shrink-0 text-[#64748B] dark:text-gray-400">
          <Eye className="h-4 w-4" />
        </span>
        <h2 className="flex-1 text-sm font-semibold text-[#1E293B] dark:text-gray-100">
          Review & Approve
        </h2>
      </div>

      <div className="px-5 py-5 space-y-5">
        <div>
          <p className="text-sm text-[#1E293B] dark:text-gray-100 font-medium">
            Is this information accurate?
          </p>
          <p className="text-sm text-[#64748B] dark:text-gray-400 mt-1">
            Please review the details above and let us know if the information is correct.
          </p>
        </div>

        {/* Reviewer name input */}
        <div className="space-y-1.5">
          <label
            htmlFor="reviewer-name"
            className="text-xs font-medium text-[#64748B] dark:text-gray-400"
          >
            Your name (optional)
          </label>
          <input
            id="reviewer-name"
            type="text"
            value={reviewerName}
            onChange={(e) => setReviewerName(e.target.value)}
            placeholder="Enter your name"
            className="w-full max-w-sm rounded-lg border border-[#E2E8F0] dark:border-gray-700 px-3 py-2 text-sm text-[#1E293B] dark:text-gray-100 bg-white dark:bg-gray-900 placeholder-[#94A3B8] dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-blue/50 transition-colors"
          />
        </div>

        {/* Feedback textarea (shown when "Request Changes" is clicked) */}
        {mode === 'feedback' && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label
                htmlFor="feedback"
                className="text-xs font-medium text-[#64748B] dark:text-gray-400"
              >
                What needs to change?
              </label>
              <textarea
                id="feedback"
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Describe what information is incorrect or needs updating..."
                rows={4}
                className="w-full rounded-lg border border-[#E2E8F0] dark:border-gray-700 px-3 py-2 text-sm text-[#1E293B] dark:text-gray-100 bg-white dark:bg-gray-900 placeholder-[#94A3B8] dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-blue/50 transition-colors resize-none"
                autoFocus
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={handleRequestChanges}
                disabled={submitting || !feedbackText.trim()}
                variant="outline"
                className="border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Submit Feedback
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setMode('idle');
                  setFeedbackText('');
                }}
                disabled={submitting}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Action buttons (shown when not in feedback mode) */}
        {mode === 'idle' && (
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={handleApprove}
              disabled={submitting}
              className="bg-brand-teal hover:bg-brand-teal/90 text-white"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Approve
            </Button>
            <Button
              variant="outline"
              onClick={() => setMode('feedback')}
              disabled={submitting}
              className="border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20"
            >
              <AlertCircle className="h-4 w-4 mr-2" />
              Request Changes
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Profile Content (8 sections -- mirrors FactProfileView without navigation)
// ---------------------------------------------------------------------------

function ProfileContent({
  profile,
  token,
  onSubmitted,
}: {
  profile: FactProfile;
  token: string;
  onSubmitted: (action: 'approved' | 'changes_requested') => void;
}) {
  const rd = profile.research_data;
  const overview = rd?.company_overview;
  const market = rd?.market_position;
  const products = rd?.products_services;
  const team = rd?.team_leadership;
  const financials = rd?.financials;
  const technology = rd?.technology;
  const icp = rd?.ideal_customer_indicators;
  const activity = rd?.recent_activity;

  const hasOverviewData = !!(
    overview?.name ||
    overview?.description ||
    overview?.tagline ||
    overview?.headquarters ||
    overview?.founded_year ||
    overview?.company_type ||
    overview?.website
  );
  const hasMarketData = !!(
    market?.industry ||
    market?.target_market ||
    market?.market_size ||
    market?.sub_industries?.length ||
    market?.differentiators?.length ||
    market?.competitors?.length
  );
  const hasProductsData = !!(
    products?.products?.length ||
    products?.key_features?.length ||
    products?.use_cases?.length ||
    products?.pricing_model
  );
  const hasTeamData = !!(
    team?.employee_count ||
    team?.employee_range ||
    team?.key_people?.length ||
    team?.departments?.length ||
    team?.hiring_signals?.length
  );
  const hasFinancialsData = !!(
    financials?.revenue_range ||
    financials?.funding_status ||
    financials?.total_raised ||
    financials?.valuation ||
    financials?.investors?.length ||
    financials?.funding_rounds?.length
  );
  const hasTechData = !!(
    technology?.tech_stack?.length ||
    technology?.platforms?.length ||
    technology?.integrations?.length
  );
  const hasICPData = !!(
    icp?.target_industries?.length ||
    icp?.target_company_sizes?.length ||
    icp?.target_roles?.length ||
    icp?.buying_signals?.length ||
    icp?.pain_points?.length ||
    icp?.value_propositions?.length
  );
  const hasActivityData = !!(
    activity?.news?.length || activity?.awards?.length || activity?.milestones?.length
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-gray-950">
      {/* Branded header bar */}
      <div className="border-b border-[#E2E8F0] dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
        <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-brand-blue" />
              <span className="text-sm font-medium text-[#1E293B] dark:text-gray-100">
                Shared Fact Profile
              </span>
              <span className="text-[#94A3B8] dark:text-gray-500 text-sm">
                {profile.company_name}
              </span>
            </div>
            <span className="text-xs text-[#94A3B8] dark:text-gray-500">
              Powered by 60
            </span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-6 max-w-4xl space-y-6">
        {/* Hero section */}
        <div className="rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-start gap-5">
            <HeroAvatar
              name={profile.company_name}
              logoUrl={profile.company_logo_url}
              domain={profile.company_domain}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-3 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-bold text-[#1E293B] dark:text-gray-100 leading-tight">
                  {profile.company_name}
                </h1>
                {market?.industry && (
                  <Badge variant="default" className="mt-1">
                    {market.industry}
                  </Badge>
                )}
              </div>

              {overview?.tagline && (
                <p className="mt-2 text-base text-[#64748B] dark:text-gray-400 leading-relaxed">
                  {overview.tagline}
                </p>
              )}

              {/* Meta row */}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[#64748B] dark:text-gray-400">
                {profile.company_domain && (
                  <span className="inline-flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5" />
                    {profile.company_domain}
                  </span>
                )}
                {overview?.website && (
                  <a
                    href={
                      overview.website.startsWith('http')
                        ? overview.website
                        : `https://${overview.website}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-brand-blue hover:text-brand-blue/80 transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Website
                  </a>
                )}
                {overview?.headquarters && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    {overview.headquarters}
                  </span>
                )}
                {overview?.founded_year && (
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Founded {overview.founded_year}
                  </span>
                )}
                {overview?.company_type && (
                  <span className="inline-flex items-center gap-1.5">
                    <Briefcase className="h-3.5 w-3.5" />
                    {overview.company_type}
                  </span>
                )}
              </div>

              {/* Profile type badge */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {profile.profile_type === 'client_org' ? (
                  <Badge variant="default" className="gap-1">
                    <Building2 className="h-3 w-3" />
                    Client Org
                  </Badge>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 dark:bg-violet-500/10 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-400 border border-violet-200 dark:border-violet-500/20">
                    <Target className="h-3 w-3" />
                    Target Company
                  </span>
                )}
                {profile.research_status === 'complete' && (
                  <Badge variant="success" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Research Complete
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 1. Company Overview */}
        <SectionCard
          title="Company Overview"
          icon={<Building2 className="h-4 w-4" />}
          isComplete={isOverviewComplete(overview)}
        >
          {hasOverviewData ? (
            <div className="space-y-4">
              {overview?.description && (
                <p className="text-sm text-[#1E293B] dark:text-gray-100 leading-relaxed whitespace-pre-wrap">
                  {overview.description}
                </p>
              )}
              <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <FieldDisplay
                  label="Headquarters"
                  value={overview?.headquarters}
                  icon={<MapPin className="h-3 w-3" />}
                />
                <FieldDisplay
                  label="Founded"
                  value={overview?.founded_year}
                  icon={<Calendar className="h-3 w-3" />}
                />
                <FieldDisplay
                  label="Company Type"
                  value={overview?.company_type}
                  icon={<Briefcase className="h-3 w-3" />}
                />
                {overview?.website && (
                  <div className="space-y-1">
                    <dt className="text-xs font-medium text-[#64748B] dark:text-gray-400 flex items-center gap-1.5">
                      <Globe className="h-3 w-3" />
                      Website
                    </dt>
                    <dd>
                      <a
                        href={
                          overview.website.startsWith('http')
                            ? overview.website
                            : `https://${overview.website}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-brand-blue hover:text-brand-blue/80 inline-flex items-center gap-1 transition-colors"
                      >
                        {overview.website}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          ) : (
            <EmptySection />
          )}
        </SectionCard>

        {/* 2. Market Position */}
        <SectionCard
          title="Market Position"
          icon={<TrendingUp className="h-4 w-4" />}
          isComplete={isMarketComplete(market)}
        >
          {hasMarketData ? (
            <dl className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <FieldDisplay label="Industry" value={market?.industry} />
                <FieldDisplay label="Target Market" value={market?.target_market} />
                <FieldDisplay label="Market Size" value={market?.market_size} />
              </div>
              <TagList label="Sub-Industries" tags={market?.sub_industries} color="blue" />
              <TagList label="Differentiators" tags={market?.differentiators} color="teal" />
              {market?.competitors && market.competitors.length > 0 && (
                <div className="space-y-2">
                  <dt className="text-xs font-medium text-[#64748B] dark:text-gray-400">
                    Competitors
                  </dt>
                  <dd className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {market.competitors.map((comp, i) => (
                      <div
                        key={`${comp}-${i}`}
                        className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-[#E2E8F0] dark:border-gray-700/50 bg-[#F8FAFC] dark:bg-gray-800/50 hover:border-brand-blue/30 dark:hover:border-brand-blue/30 transition-colors"
                      >
                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-semibold flex-shrink-0">
                          {comp.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-[#1E293B] dark:text-gray-100 truncate">
                          {comp}
                        </span>
                      </div>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          ) : (
            <EmptySection />
          )}
        </SectionCard>

        {/* 3. Products & Services */}
        <SectionCard
          title="Products & Services"
          icon={<Package className="h-4 w-4" />}
          isComplete={isProductsComplete(products)}
        >
          {hasProductsData ? (
            <dl className="space-y-4">
              <TagList label="Products" tags={products?.products} color="violet" />
              <TagList label="Key Features" tags={products?.key_features} color="blue" />
              <TagList label="Use Cases" tags={products?.use_cases} color="teal" />
              <FieldDisplay label="Pricing Model" value={products?.pricing_model} />
            </dl>
          ) : (
            <EmptySection />
          )}
        </SectionCard>

        {/* 4. Team & Leadership */}
        <SectionCard
          title="Team & Leadership"
          icon={<Users className="h-4 w-4" />}
          isComplete={isTeamComplete(team)}
        >
          {hasTeamData ? (
            <div className="space-y-5">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldDisplay
                  label="Employee Count"
                  value={team?.employee_count}
                  icon={<Users className="h-3 w-3" />}
                />
                <FieldDisplay label="Employee Range" value={team?.employee_range} />
              </dl>

              {team?.key_people && team.key_people.length > 0 && (
                <div className="space-y-2">
                  <dt className="text-xs font-medium text-[#64748B] dark:text-gray-400">
                    Key People
                  </dt>
                  <dd className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {team.key_people.map((person, i) => (
                      <div
                        key={`${person.name}-${i}`}
                        className="flex items-center gap-3 px-3 py-3 rounded-lg border border-[#E2E8F0] dark:border-gray-700/50 bg-[#F8FAFC] dark:bg-gray-800/50"
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-blue/10 dark:bg-brand-blue/10 text-brand-blue dark:text-blue-400 text-sm font-semibold flex-shrink-0">
                          {person.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[#1E293B] dark:text-gray-100 truncate">
                            {person.name}
                          </p>
                          {person.title && (
                            <p className="text-xs text-[#64748B] dark:text-gray-400 truncate">
                              {person.title}
                            </p>
                          )}
                        </div>
                        {person.linkedin && (
                          <a
                            href={
                              person.linkedin.startsWith('http')
                                ? person.linkedin
                                : `https://${person.linkedin}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-shrink-0 text-[#94A3B8] dark:text-gray-500 hover:text-brand-blue dark:hover:text-blue-400 transition-colors"
                            title="LinkedIn"
                          >
                            <Link2 className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    ))}
                  </dd>
                </div>
              )}

              <TagList label="Departments" tags={team?.departments} />
              <TagList label="Hiring Signals" tags={team?.hiring_signals} color="amber" />
            </div>
          ) : (
            <EmptySection />
          )}
        </SectionCard>

        {/* 5. Financials */}
        <SectionCard
          title="Financials"
          icon={<DollarSign className="h-4 w-4" />}
          isComplete={isFinancialsComplete(financials)}
        >
          {hasFinancialsData ? (
            <div className="space-y-5">
              <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <FieldDisplay label="Revenue Range" value={financials?.revenue_range} />
                <FieldDisplay label="Funding Status" value={financials?.funding_status} />
                <FieldDisplay label="Total Raised" value={financials?.total_raised} />
                <FieldDisplay label="Valuation" value={financials?.valuation} />
              </dl>

              <TagList label="Investors" tags={financials?.investors} color="violet" />

              {financials?.funding_rounds && financials.funding_rounds.length > 0 && (
                <div className="space-y-2">
                  <dt className="text-xs font-medium text-[#64748B] dark:text-gray-400">
                    Funding Rounds
                  </dt>
                  <dd>
                    <div className="overflow-hidden rounded-lg border border-[#E2E8F0] dark:border-gray-700/50">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-[#F8FAFC] dark:bg-gray-800/50">
                            <th className="text-left px-4 py-2.5 text-xs font-medium text-[#64748B] dark:text-gray-400">
                              Round
                            </th>
                            <th className="text-left px-4 py-2.5 text-xs font-medium text-[#64748B] dark:text-gray-400">
                              Amount
                            </th>
                            <th className="text-left px-4 py-2.5 text-xs font-medium text-[#64748B] dark:text-gray-400">
                              Date
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8F0] dark:divide-gray-700/50">
                          {financials.funding_rounds.map((fr, i) => (
                            <tr
                              key={i}
                              className="hover:bg-[#F8FAFC] dark:hover:bg-gray-800/30 transition-colors"
                            >
                              <td className="px-4 py-2.5 font-medium text-[#1E293B] dark:text-gray-100">
                                {fr.round}
                              </td>
                              <td className="px-4 py-2.5 text-[#1E293B] dark:text-gray-100">
                                {fr.amount || (
                                  <span className="text-[#94A3B8] dark:text-gray-500">--</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-[#64748B] dark:text-gray-400">
                                {fr.date || (
                                  <span className="text-[#94A3B8] dark:text-gray-500">--</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </dd>
                </div>
              )}
            </div>
          ) : (
            <EmptySection />
          )}
        </SectionCard>

        {/* 6. Technology */}
        <SectionCard
          title="Technology"
          icon={<Cpu className="h-4 w-4" />}
          isComplete={isTechComplete(technology)}
        >
          {hasTechData ? (
            <dl className="space-y-4">
              <TagList label="Tech Stack" tags={technology?.tech_stack} color="violet" />
              <TagList label="Platforms" tags={technology?.platforms} color="blue" />
              <TagList label="Integrations" tags={technology?.integrations} color="teal" />
            </dl>
          ) : (
            <EmptySection />
          )}
        </SectionCard>

        {/* 7. Ideal Customer Indicators */}
        <SectionCard
          title="Ideal Customer Indicators"
          icon={<Target className="h-4 w-4" />}
          isComplete={isICPComplete(icp)}
        >
          {hasICPData ? (
            <dl className="space-y-4">
              <TagList label="Target Industries" tags={icp?.target_industries} color="blue" />
              <TagList label="Target Company Sizes" tags={icp?.target_company_sizes} />
              <TagList label="Target Roles" tags={icp?.target_roles} color="violet" />
              <TagList label="Buying Signals" tags={icp?.buying_signals} color="amber" />
              <TagList label="Pain Points" tags={icp?.pain_points} color="default" />
              <TagList label="Value Propositions" tags={icp?.value_propositions} color="teal" />
            </dl>
          ) : (
            <EmptySection />
          )}
        </SectionCard>

        {/* 8. Recent Activity */}
        <SectionCard
          title="Recent Activity"
          icon={<Newspaper className="h-4 w-4" />}
          isComplete={isActivityComplete(activity)}
        >
          {hasActivityData ? (
            <div className="space-y-5">
              {activity?.news && activity.news.length > 0 && (
                <div className="space-y-2">
                  <dt className="text-xs font-medium text-[#64748B] dark:text-gray-400">News</dt>
                  <dd className="space-y-2">
                    {activity.news.map((item, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 px-4 py-3 rounded-lg border border-[#E2E8F0] dark:border-gray-700/50 bg-[#F8FAFC] dark:bg-gray-800/50"
                      >
                        <Newspaper className="h-4 w-4 text-[#94A3B8] dark:text-gray-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          {item.url ? (
                            <a
                              href={
                                item.url.startsWith('http') ? item.url : `https://${item.url}`
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium text-brand-blue hover:text-brand-blue/80 transition-colors inline-flex items-center gap-1"
                            >
                              {item.title}
                              <ExternalLink className="h-3 w-3 flex-shrink-0" />
                            </a>
                          ) : (
                            <p className="text-sm font-medium text-[#1E293B] dark:text-gray-100">
                              {item.title}
                            </p>
                          )}
                        </div>
                        {item.date && (
                          <span className="flex-shrink-0 inline-flex items-center gap-1 text-xs text-[#64748B] dark:text-gray-400 bg-white dark:bg-gray-900/50 px-2 py-0.5 rounded-full border border-[#E2E8F0] dark:border-gray-700">
                            <Calendar className="h-3 w-3" />
                            {item.date}
                          </span>
                        )}
                      </div>
                    ))}
                  </dd>
                </div>
              )}

              <TagList label="Awards" tags={activity?.awards} color="amber" />
              <TagList label="Milestones" tags={activity?.milestones} color="teal" />
            </div>
          ) : (
            <EmptySection />
          )}
        </SectionCard>

        {/* Approval Section */}
        <ApprovalSection profile={profile} token={token} onSubmitted={onSubmitted} />

        {/* Footer meta */}
        <div className="text-center py-4">
          <p className="text-xs text-[#94A3B8] dark:text-gray-500">
            Version {profile.version} &middot; Last updated{' '}
            {new Date(profile.updated_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
            {profile.share_views > 0 && (
              <>
                {' '}
                &middot; {profile.share_views} {profile.share_views === 1 ? 'view' : 'views'}
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function PublicFactProfile() {
  const { token } = useParams<{ token: string }>();
  const { data: profile, isLoading, error } = usePublicFactProfile(token);

  const [passwordUnlocked, setPasswordUnlocked] = useState(false);
  const [submittedAction, setSubmittedAction] = useState<'approved' | 'changes_requested' | null>(
    null
  );
  const [viewTracked, setViewTracked] = useState(false);

  // Track view on first load (fire-and-forget)
  const trackView = useCallback(async () => {
    if (!token || viewTracked) return;
    setViewTracked(true);
    try {
      await supabase.functions.invoke('fact-profile-approve', {
        body: { action: 'track_view', share_token: token },
      });
    } catch {
      // Silent failure -- view tracking is non-critical
    }
  }, [token, viewTracked]);

  useEffect(() => {
    if (profile && !isLoading) {
      trackView();
    }
  }, [profile, isLoading, trackView]);

  // ---- Loading state ----
  if (isLoading) {
    return (
      <>
        <Helmet>
          <title>Fact Profile | 60</title>
        </Helmet>
        <LoadingSkeleton />
      </>
    );
  }

  // ---- Not found ----
  if (error || !profile) {
    return (
      <>
        <Helmet>
          <title>Not Found | 60</title>
        </Helmet>
        <CenteredCard
          icon={
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F8FAFC] dark:bg-gray-800">
              <FileQuestion className="h-7 w-7 text-[#94A3B8] dark:text-gray-500" />
            </div>
          }
          title="Profile not found"
          description="This link may be invalid or the profile is no longer shared. Please check the URL or contact the profile owner."
        />
      </>
    );
  }

  // ---- Expired ----
  if (profile.share_expires_at && new Date(profile.share_expires_at) < new Date()) {
    return (
      <>
        <Helmet>
          <title>Link Expired | 60</title>
        </Helmet>
        <CenteredCard
          icon={
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-900/20">
              <Clock className="h-7 w-7 text-amber-600 dark:text-amber-400" />
            </div>
          }
          title="This link has expired"
          description="Contact the profile owner for a new link to view this fact profile."
        />
      </>
    );
  }

  // ---- Password required ----
  if (profile.share_password_hash && !passwordUnlocked) {
    return (
      <>
        <Helmet>
          <title>Password Required | 60</title>
        </Helmet>
        <PasswordGate token={token!} onUnlocked={() => setPasswordUnlocked(true)} />
      </>
    );
  }

  // ---- Submitted (thank you) ----
  if (submittedAction) {
    return (
      <>
        <Helmet>
          <title>Thank You | 60</title>
        </Helmet>
        <CenteredCard
          icon={
            submittedAction === 'approved' ? (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/20">
                <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
              </div>
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 dark:bg-orange-900/20">
                <AlertCircle className="h-7 w-7 text-orange-600 dark:text-orange-400" />
              </div>
            )
          }
          title={
            submittedAction === 'approved'
              ? 'Thank you! The profile has been approved.'
              : 'Thank you! Your feedback has been submitted.'
          }
          description={
            submittedAction === 'approved'
              ? 'The profile owner has been notified of your approval.'
              : 'The profile owner will review your feedback and make the necessary updates.'
          }
        >
          <p className="text-xs text-[#94A3B8] dark:text-gray-500 pt-2">
            Powered by 60
          </p>
        </CenteredCard>
      </>
    );
  }

  // ---- Unlocked -- show profile with approval ----
  return (
    <>
      <Helmet>
        <title>{profile.company_name} - Fact Profile | 60</title>
      </Helmet>
      <ProfileContent
        profile={profile}
        token={token!}
        onSubmitted={(action) => setSubmittedAction(action)}
      />
    </>
  );
}
