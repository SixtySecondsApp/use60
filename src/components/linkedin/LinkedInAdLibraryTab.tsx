import AdLibrary from '@/pages/AdLibrary'
import AdLibraryInsights from '@/components/linkedin/AdLibraryInsights'
import { useAdLibrary } from '@/lib/hooks/useAdLibrary'

// ---------------------------------------------------------------------------
// Ad Library Tab — Wraps existing AdLibrary page + Insights panel
// Phase 2 (LI-011) will strip page-level chrome for cleaner embedding.
// ---------------------------------------------------------------------------

export default function LinkedInAdLibraryTab() {
  const {
    trends,
    trendsLoading,
    fetchTrends,
    likelyWinners,
    winnersLoading,
    fetchWinners,
    watchlist,
  } = useAdLibrary()

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 -my-2">
      <AdLibrary />
      <AdLibraryInsights
        trends={trends}
        likelyWinners={likelyWinners}
        watchlist={watchlist}
        trendsLoading={trendsLoading}
        winnersLoading={winnersLoading}
        onFetchTrends={fetchTrends}
        onFetchWinners={fetchWinners}
      />
    </div>
  )
}
