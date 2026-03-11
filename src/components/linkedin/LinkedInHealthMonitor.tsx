import { useLinkedInIntegration } from '@/lib/hooks/useLinkedInIntegration'
import { Badge } from '@/components/ui/badge'
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Wifi,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Health Monitor — compact status bar below hub tabs
// ---------------------------------------------------------------------------

export function LinkedInHealthMonitor() {
  const { isConnected, loading, integration } = useLinkedInIntegration()

  if (loading || !isConnected || !integration) return null

  const tokenExpiresAt = integration.last_sync_at
    ? new Date(integration.last_sync_at)
    : null
  const lastSync = integration.last_sync_at
    ? new Date(integration.last_sync_at)
    : null

  // Token health
  const now = new Date()
  const tokenDaysRemaining = tokenExpiresAt
    ? Math.ceil((tokenExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null

  // Last sync relative time
  const syncAgo = lastSync ? getRelativeTime(lastSync) : null

  return (
    <div className="flex items-center gap-4 px-4 py-2 rounded-lg bg-zinc-800/40 border border-zinc-700/30 text-xs">
      {/* Connection status */}
      <StatusPill
        icon={<CheckCircle2 className="w-3 h-3 text-green-400" />}
        label="Connected"
        className="text-green-400"
      />

      {/* Ad account */}
      {integration.linkedin_ad_account_name && (
        <StatusPill
          icon={<Wifi className="w-3 h-3 text-zinc-400" />}
          label={integration.linkedin_ad_account_name}
          className="text-zinc-300"
        />
      )}

      {/* Last sync */}
      {syncAgo && (
        <StatusPill
          icon={<RefreshCw className="w-3 h-3 text-zinc-400" />}
          label={`Synced ${syncAgo}`}
          className="text-zinc-400"
        />
      )}

      {/* Token expiry */}
      {tokenDaysRemaining !== null && (
        <TokenExpiryBadge days={tokenDaysRemaining} />
      )}

      {/* Scopes */}
      {integration.scopes && integration.scopes.length > 0 && (
        <span className="text-zinc-500">
          {integration.scopes.length} scopes
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusPill({
  icon,
  label,
  className = '',
}: {
  icon: React.ReactNode
  label: string
  className?: string
}) {
  return (
    <span className={`flex items-center gap-1.5 ${className}`}>
      {icon}
      {label}
    </span>
  )
}

function TokenExpiryBadge({ days }: { days: number }) {
  if (days < 0) {
    return (
      <Badge variant="outline" className="text-red-400 border-red-500/20 gap-1">
        <XCircle className="w-3 h-3" />
        Token expired
      </Badge>
    )
  }
  if (days <= 7) {
    return (
      <Badge variant="outline" className="text-amber-400 border-amber-500/20 gap-1">
        <AlertTriangle className="w-3 h-3" />
        Token expires in {days}d
      </Badge>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-zinc-500">
      <Clock className="w-3 h-3" />
      Token: {days}d
    </span>
  )
}

function getRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMin / 60)
  const diffDays = Math.floor(diffHr / 24)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}
