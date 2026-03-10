import LinkedInRevenue from '@/pages/LinkedInRevenue'
import CampaignQualityView from '@/components/linkedin/CampaignQualityView'

// ---------------------------------------------------------------------------
// Revenue Tab — Wraps existing LinkedInRevenue page
// Phase 2 (LI-011) will strip page-level chrome for cleaner embedding.
// LI-018: Campaign quality dashboard added below revenue content.
// ---------------------------------------------------------------------------

export default function LinkedInRevenueTab() {
  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 -my-2">
      <LinkedInRevenue />
      <div className="px-4 sm:px-6 lg:px-8 pb-6">
        <CampaignQualityView />
      </div>
    </div>
  )
}
