import { useLinkedInAdManager } from '@/lib/hooks/useLinkedInAdManager'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Crosshair, Plus, RefreshCw } from 'lucide-react'

// ---------------------------------------------------------------------------
// Audiences Tab — Matched audience management + Ops table push
// ---------------------------------------------------------------------------

export default function LinkedInAudiencesTab() {
  const { audiences, audiencesLoading, loadAudiences } = useLinkedInAdManager()

  const statusColors: Record<string, string> = {
    READY: 'bg-green-500/10 text-green-400 border-green-500/20',
    PROCESSING: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    PENDING: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    FAILED: 'bg-red-500/10 text-red-400 border-red-500/20',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Matched Audiences</h2>
          <p className="text-sm text-zinc-500">
            Create audiences from Ops tables and push to LinkedIn for ad targeting
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadAudiences?.()}
            disabled={audiencesLoading}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${audiencesLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            Create Audience
          </Button>
        </div>
      </div>

      {/* Audience list */}
      {audiencesLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 text-zinc-500 animate-spin" />
        </div>
      ) : audiences && audiences.length > 0 ? (
        <div className="space-y-3">
          {audiences.map((audience: any) => (
            <Card key={audience.id} className="border-zinc-800/60 bg-zinc-900/60">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10">
                      <Crosshair className="w-4 h-4 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-200">
                        {audience.audience_name || 'Unnamed Audience'}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {audience.audience_type === 'CONTACT_LIST' ? 'Contact List' : 'Company List'}
                        {audience.member_count != null && ` \u00b7 ${audience.member_count.toLocaleString()} members`}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={statusColors[audience.status] || 'text-zinc-500'}
                  >
                    {audience.status || 'Unknown'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-zinc-800/60 bg-zinc-900/60">
          <CardContent className="py-12 text-center">
            <Crosshair className="w-10 h-10 text-zinc-600 mx-auto mb-4" />
            <h3 className="text-base font-semibold text-zinc-200 mb-2">
              No Audiences Yet
            </h3>
            <p className="text-sm text-zinc-500 max-w-sm mx-auto">
              Create a matched audience from an Ops table to start targeting
              your best prospects on LinkedIn.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
