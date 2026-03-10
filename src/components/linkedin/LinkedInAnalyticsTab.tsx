import LinkedInAnalyticsPage from '@/pages/LinkedInAnalytics'
import DemographicsPivot from '@/components/linkedin/DemographicsPivot'
import { useLinkedInAnalytics } from '@/lib/hooks/useLinkedInAnalytics'

// ---------------------------------------------------------------------------
// Analytics Tab — Wraps existing LinkedInAnalyticsPage + Demographics Pivot
// Phase 2 (LI-011) will strip page-level chrome for cleaner embedding.
// ---------------------------------------------------------------------------

export default function LinkedInAnalyticsTab() {
  const {
    demographics,
    loading,
    selectedPivotType,
    dateRange,
    fetchDemographics,
    setDateRange,
    exportCsv,
  } = useLinkedInAnalytics()

  return (
    <div className="space-y-6">
      <div className="-mx-4 sm:-mx-6 lg:-mx-8 -my-2">
        <LinkedInAnalyticsPage />
      </div>

      <div className="px-0">
        <DemographicsPivot
          demographics={demographics}
          loading={loading}
          selectedPivotType={selectedPivotType}
          dateRange={dateRange}
          fetchDemographics={fetchDemographics}
          setDateRange={setDateRange}
          exportCsv={exportCsv}
        />
      </div>
    </div>
  )
}
