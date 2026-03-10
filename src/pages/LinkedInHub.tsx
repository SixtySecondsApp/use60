import { useState, useEffect, lazy, Suspense } from 'react'
import { Helmet } from 'react-helmet-async'
import { useSearchParams } from 'react-router-dom'
import { Linkedin } from 'lucide-react'
import { LinkedInHubTabs, type LinkedInTab } from '@/components/linkedin/LinkedInHubTabs'
import { LinkedInHealthMonitor } from '@/components/linkedin/LinkedInHealthMonitor'
import { LinkedInOnboardingWizard } from '@/components/linkedin/LinkedInOnboardingWizard'
import { useLinkedInIntegration } from '@/lib/hooks/useLinkedInIntegration'
import { Skeleton } from '@/components/ui/skeleton'

// ---------------------------------------------------------------------------
// Lazy-loaded tab content (existing pages, no page chrome)
// ---------------------------------------------------------------------------

const LinkedInOverviewTab = lazy(() => import('@/components/linkedin/LinkedInOverviewTab'))
const LinkedInLeadsTab = lazy(() => import('@/components/linkedin/LinkedInLeadsTab'))
const LinkedInCampaignsTab = lazy(() => import('@/components/linkedin/LinkedInCampaignsTab'))
const LinkedInAnalyticsTab = lazy(() => import('@/components/linkedin/LinkedInAnalyticsTab'))
const LinkedInRevenueTab = lazy(() => import('@/components/linkedin/LinkedInRevenueTab'))
const LinkedInAdLibraryTab = lazy(() => import('@/components/linkedin/LinkedInAdLibraryTab'))
const LinkedInAudiencesTab = lazy(() => import('@/components/linkedin/LinkedInAudiencesTab'))
const LinkedInEventsTab = lazy(() => import('@/components/linkedin/LinkedInEventsTab'))
const LinkedInNetworkTab = lazy(() => import('@/components/linkedin/LinkedInNetworkTab'))

// ---------------------------------------------------------------------------
// Tab loading fallback
// ---------------------------------------------------------------------------

function TabSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-64" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Valid tab IDs for URL param parsing
// ---------------------------------------------------------------------------

const VALID_TABS: LinkedInTab[] = [
  'overview', 'leads', 'campaigns', 'analytics', 'revenue', 'ad_library', 'audiences', 'events', 'network',
]

function isValidTab(value: string | null): value is LinkedInTab {
  return value !== null && VALID_TABS.includes(value as LinkedInTab)
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function LinkedInHub() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState<LinkedInTab>(
    isValidTab(tabParam) ? tabParam : 'overview'
  )
  const { isConnected } = useLinkedInIntegration()

  // Sync tab changes to URL
  const handleTabChange = (tab: LinkedInTab) => {
    setActiveTab(tab)
    setSearchParams({ tab }, { replace: true })
  }

  // Sync URL changes to tab (e.g. browser back/forward)
  useEffect(() => {
    if (isValidTab(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam)
    }
  }, [tabParam]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Helmet><title>LinkedIn | 60</title></Helmet>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Page header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-800/60 bg-gradient-to-br from-blue-500/20 to-blue-600/20">
            <Linkedin className="h-6 w-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-zinc-100">LinkedIn</h1>
            <p className="text-sm text-zinc-500">
              Leads, campaigns, analytics, and audience management
            </p>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="mb-4">
          <LinkedInHubTabs activeTab={activeTab} onChange={handleTabChange} />
        </div>

        {/* Health monitor bar */}
        <div className="mb-6">
          <LinkedInHealthMonitor />
        </div>

        {/* Onboarding wizard (shown when not fully configured) */}
        {!isConnected && (
          <div className="mb-6">
            <LinkedInOnboardingWizard onNavigate={handleTabChange} />
          </div>
        )}

        {/* Tab content */}
        <Suspense fallback={<TabSkeleton />}>
          {activeTab === 'overview' && <LinkedInOverviewTab />}
          {activeTab === 'leads' && <LinkedInLeadsTab />}
          {activeTab === 'campaigns' && <LinkedInCampaignsTab />}
          {activeTab === 'analytics' && <LinkedInAnalyticsTab />}
          {activeTab === 'revenue' && <LinkedInRevenueTab />}
          {activeTab === 'ad_library' && <LinkedInAdLibraryTab />}
          {activeTab === 'audiences' && <LinkedInAudiencesTab />}
          {activeTab === 'events' && <LinkedInEventsTab />}
          {activeTab === 'network' && <LinkedInNetworkTab />}
        </Suspense>
      </div>
    </>
  )
}
