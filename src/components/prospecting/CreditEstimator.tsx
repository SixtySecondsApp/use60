import { Zap, CreditCard, AlertTriangle, Loader2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useCreditBalance } from '@/lib/hooks/useCreditBalance'
import type { ProviderOption } from '@/components/prospecting/ProviderSelector'
import type { ProspectingAction } from '@/lib/hooks/useProspectingSearch'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreditEstimatorProps {
  provider: ProviderOption
  searchType?: ProspectingAction
  onSearch: () => void
  isSearching: boolean
  providerConfigured: boolean
}

// ---------------------------------------------------------------------------
// Cost estimates (match edge function constants)
// ---------------------------------------------------------------------------

function getEstimatedCost(provider: ProviderOption, searchType?: ProspectingAction): number {
  if (provider === 'apollo') return 0.10
  if (provider === 'ai_ark') {
    return searchType === 'company_search' ? 2.5 : 12.5
  }
  // "both" = sum of both providers
  const apolloCost = 0.10
  const aiArkCost = searchType === 'company_search' ? 2.5 : 12.5
  return apolloCost + aiArkCost
}

function getCostLabel(provider: ProviderOption, searchType?: ProspectingAction): string {
  if (provider === 'apollo') return '~0.10 credits per page'
  if (provider === 'ai_ark') {
    return searchType === 'company_search'
      ? '~2.5 credits per search'
      : '~12.5 credits per search'
  }
  return '~12.6-15.0 credits (both providers)'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreditEstimator({
  provider,
  searchType,
  onSearch,
  isSearching,
  providerConfigured,
}: CreditEstimatorProps) {
  const { data: creditData, isLoading: creditsLoading } = useCreditBalance()

  const balance = creditData?.balance ?? 0
  const estimatedCost = getEstimatedCost(provider, searchType)
  const hasEnoughCredits = balance >= estimatedCost
  const canSearch = providerConfigured && hasEnoughCredits && !isSearching

  return (
    <div className="flex flex-col gap-3">
      {/* Credit info row */}
      <div className="flex items-center justify-between rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 dark:border-gray-700/50 dark:bg-gray-900/50">
        <div className="flex items-center gap-4">
          {/* Balance */}
          <div className="flex items-center gap-1.5">
            <CreditCard className="h-4 w-4 text-[#64748B] dark:text-gray-400" />
            <span className="text-sm text-[#64748B] dark:text-gray-300">Balance:</span>
            {creditsLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
            ) : (
              <span
                className={cn(
                  'text-sm font-semibold',
                  balance > 10
                    ? 'text-[#1E293B] dark:text-gray-100'
                    : balance > 0
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-red-600 dark:text-red-400'
                )}
              >
                {balance.toFixed(2)}
              </span>
            )}
          </div>

          {/* Estimated cost */}
          <div className="flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-[#64748B] dark:text-gray-400" />
            <span className="text-sm text-[#64748B] dark:text-gray-300">Cost:</span>
            <span className="text-sm text-[#1E293B] dark:text-gray-200">
              {getCostLabel(provider, searchType)}
            </span>
          </div>
        </div>

        {/* Search button */}
        <Button
          onClick={onSearch}
          disabled={!canSearch}
          size="default"
        >
          {isSearching ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Searching...
            </>
          ) : (
            <>
              <Search className="mr-2 h-4 w-4" />
              Run Search
            </>
          )}
        </Button>
      </div>

      {/* Insufficient credits warning */}
      {!creditsLoading && !hasEnoughCredits && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>
            Insufficient credits. You need at least {estimatedCost.toFixed(2)} credits but have{' '}
            {balance.toFixed(2)}.{' '}
            <a
              href="/settings/billing"
              className="font-medium underline underline-offset-2 hover:text-red-800 dark:hover:text-red-300"
            >
              Top up credits
            </a>
          </span>
        </div>
      )}
    </div>
  )
}
