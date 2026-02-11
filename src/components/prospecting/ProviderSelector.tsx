import { CheckCircle2, XCircle, Loader2, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useApolloIntegration } from '@/lib/hooks/useApolloIntegration'
import { useAiArkIntegration } from '@/lib/hooks/useAiArkIntegration'
import type { ProspectingProvider } from '@/lib/hooks/useProspectingSearch'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProviderOption = ProspectingProvider | 'both'

interface ProviderSelectorProps {
  selected: ProviderOption
  onChange: (provider: ProviderOption) => void
  disabled?: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const PROVIDERS: { value: ProviderOption; label: string; description: string }[] = [
  { value: 'apollo', label: 'Apollo', description: 'People search' },
  { value: 'ai_ark', label: 'AI Ark', description: 'People & companies' },
  { value: 'both', label: 'Both', description: 'Side-by-side comparison' },
]

export function ProviderSelector({ selected, onChange, disabled }: ProviderSelectorProps) {
  const apollo = useApolloIntegration()
  const aiArk = useAiArkIntegration()

  const statusMap: Record<ProspectingProvider, { connected: boolean; loading: boolean }> = {
    apollo: { connected: apollo.isConnected, loading: apollo.loading },
    ai_ark: { connected: aiArk.isConnected, loading: aiArk.loading },
  }

  function getStatusForOption(option: ProviderOption) {
    if (option === 'both') {
      return {
        connected: apollo.isConnected && aiArk.isConnected,
        loading: apollo.loading || aiArk.loading,
        partial: apollo.isConnected !== aiArk.isConnected,
      }
    }
    return { ...statusMap[option], partial: false }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-[#1E293B] dark:text-gray-300">
        Search Provider
      </label>
      <div className="flex gap-2">
        {PROVIDERS.map((provider) => {
          const status = getStatusForOption(provider.value)
          const isSelected = selected === provider.value
          const isDisabled = disabled || status.loading

          return (
            <button
              key={provider.value}
              type="button"
              disabled={isDisabled}
              onClick={() => onChange(provider.value)}
              className={cn(
                'flex flex-1 flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all',
                isSelected
                  ? 'border-brand-blue bg-brand-blue/5 dark:border-brand-blue/60 dark:bg-brand-blue/10'
                  : 'border-[#E2E8F0] bg-white hover:border-gray-300 dark:border-gray-700/50 dark:bg-gray-900/80 dark:hover:border-gray-600',
                isDisabled && 'cursor-not-allowed opacity-50'
              )}
            >
              <div className="flex w-full items-center justify-between">
                <span
                  className={cn(
                    'text-sm font-medium',
                    isSelected
                      ? 'text-brand-blue dark:text-blue-300'
                      : 'text-[#1E293B] dark:text-gray-100'
                  )}
                >
                  {provider.label}
                </span>
                <StatusIcon
                  connected={status.connected}
                  loading={status.loading}
                  partial={status.partial}
                />
              </div>
              <span className="text-xs text-[#64748B] dark:text-gray-400">
                {provider.description}
              </span>
            </button>
          )
        })}
      </div>

      {/* Configuration warnings */}
      <ProviderWarnings selected={selected} statusMap={statusMap} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusIcon({
  connected,
  loading,
  partial,
}: {
  connected: boolean
  loading: boolean
  partial: boolean
}) {
  if (loading) {
    return <Loader2 className="h-4 w-4 animate-spin text-[#94A3B8] dark:text-gray-500" />
  }
  if (connected) {
    return <CheckCircle2 className="h-4 w-4 text-brand-teal dark:text-emerald-400" />
  }
  if (partial) {
    return <CheckCircle2 className="h-4 w-4 text-amber-500 dark:text-amber-400" />
  }
  return <XCircle className="h-4 w-4 text-[#94A3B8] dark:text-gray-500" />
}

function ProviderWarnings({
  selected,
  statusMap,
}: {
  selected: ProviderOption
  statusMap: Record<ProspectingProvider, { connected: boolean; loading: boolean }>
}) {
  const warnings: string[] = []

  if (selected === 'apollo' && !statusMap.apollo.connected && !statusMap.apollo.loading) {
    warnings.push('Apollo')
  }
  if (selected === 'ai_ark' && !statusMap.ai_ark.connected && !statusMap.ai_ark.loading) {
    warnings.push('AI Ark')
  }
  if (selected === 'both') {
    if (!statusMap.apollo.connected && !statusMap.apollo.loading) warnings.push('Apollo')
    if (!statusMap.ai_ark.connected && !statusMap.ai_ark.loading) warnings.push('AI Ark')
  }

  if (warnings.length === 0) return null

  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
      <XCircle className="h-3.5 w-3.5 flex-shrink-0" />
      <span>
        {warnings.join(' and ')} not configured.{' '}
        <a
          href="/settings/integrations"
          className="inline-flex items-center gap-0.5 font-medium underline underline-offset-2 hover:text-amber-800 dark:hover:text-amber-300"
        >
          Configure in Settings
          <ExternalLink className="h-3 w-3" />
        </a>
      </span>
    </div>
  )
}
