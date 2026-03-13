import { useLinkedInIntegration } from '@/lib/hooks/useLinkedInIntegration'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Users, CheckCircle2, Clock, ArrowRight, Settings } from 'lucide-react'
import { LinkedInConfigModal } from '@/components/integrations/LinkedInConfigModal'
import { useState } from 'react'

// ---------------------------------------------------------------------------
// Leads Tab — Lead source config + recent lead activity
// ---------------------------------------------------------------------------

export default function LinkedInLeadsTab() {
  const {
    isConnected,
    loading,
    leadSources,
    connectLinkedIn,
  } = useLinkedInIntegration()
  const [configOpen, setConfigOpen] = useState(false)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 text-zinc-500 animate-spin" />
      </div>
    )
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Users className="w-10 h-10 text-zinc-600 mb-4" />
        <h3 className="text-base font-semibold text-zinc-200 mb-2">
          Connect LinkedIn to Start Capturing Leads
        </h3>
        <p className="text-sm text-zinc-500 max-w-sm mb-6">
          Incoming lead gen form submissions and event registrations will appear here
          once your LinkedIn account is connected.
        </p>
        <Button onClick={connectLinkedIn} className="gap-2">
          Connect LinkedIn
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Lead sources header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Lead Sources</h2>
          <p className="text-sm text-zinc-500">
            Active lead gen forms and event registrations syncing into 60
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setConfigOpen(true)} className="gap-2">
          <Settings className="w-4 h-4" />
          Configure
        </Button>
      </div>

      {/* Lead sources list */}
      {leadSources && leadSources.length > 0 ? (
        <div className="space-y-3">
          {leadSources.map((source: any) => (
            <Card key={source.id} className="border-zinc-800/60 bg-zinc-900/60">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                      <Users className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-200">
                        {source.form_name || 'Unnamed Form'}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {source.source_type === 'ad_form' ? 'Ad Lead Gen Form' : 'Event Registration'}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className={source.is_active ? 'text-green-400 border-green-500/20' : 'text-zinc-500'}>
                    {source.is_active ? 'Active' : 'Paused'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-zinc-800/60 bg-zinc-900/60">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-zinc-500">
              No lead sources configured yet. Click Configure to set up form syncing.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Recent leads placeholder */}
      <Card className="border-zinc-800/60 bg-zinc-900/60">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Recent Leads
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-500 text-center py-6">
            Recent lead activity will appear here as leads are captured.
          </p>
        </CardContent>
      </Card>

      {configOpen && (
        <LinkedInConfigModal
          open={configOpen}
          onOpenChange={setConfigOpen}
        />
      )}
    </div>
  )
}
