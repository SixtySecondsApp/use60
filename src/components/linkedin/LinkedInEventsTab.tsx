import { useState } from 'react'
import { useLinkedInEvents } from '@/lib/hooks/useLinkedInEvents'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Calendar, Users, MapPin, ChevronRight, Loader2 } from 'lucide-react'
import type { LinkedInEvent, EventRegistrant } from '@/lib/services/linkedinEventsService'

// ---------------------------------------------------------------------------
// Badge colour maps
// ---------------------------------------------------------------------------

const priorityColors: Record<string, string> = {
  hot: 'bg-red-500/10 text-red-400 border-red-500/20',
  warm: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  cold: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
}

const followupColors: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  drafted: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  sent: 'bg-green-500/10 text-green-400 border-green-500/20',
  replied: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LinkedInEventsTab() {
  const {
    events,
    loading,
    selectedEvent,
    registrants,
    registrantsLoading,
    loadEvents,
    selectEvent,
    connectEvent,
  } = useLinkedInEvents()

  const [connectOpen, setConnectOpen] = useState(false)
  const [connectId, setConnectId] = useState('')
  const [connectName, setConnectName] = useState('')
  const [connectLoading, setConnectLoading] = useState(false)

  // -----------------------------------------------------------------------
  // Connect Event handler
  // -----------------------------------------------------------------------

  const handleConnect = async () => {
    if (!connectId.trim() || !connectName.trim()) return
    setConnectLoading(true)
    const result = await connectEvent(connectId.trim(), connectName.trim())
    setConnectLoading(false)
    if (result) {
      setConnectOpen(false)
      setConnectId('')
      setConnectName('')
    }
  }

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 text-zinc-500 animate-spin" />
      </div>
    )
  }

  // -----------------------------------------------------------------------
  // Registrant breakdown by priority tier
  // -----------------------------------------------------------------------

  const tierBreakdown = (regs: EventRegistrant[]) => {
    const counts: Record<string, number> = { hot: 0, warm: 0, cold: 0 }
    for (const r of regs) {
      const tier = (r.priority_tier || 'cold').toLowerCase()
      counts[tier] = (counts[tier] || 0) + 1
    }
    return counts
  }

  // -----------------------------------------------------------------------
  // Event detail view (selected)
  // -----------------------------------------------------------------------

  if (selectedEvent) {
    const breakdown = tierBreakdown(registrants)

    return (
      <div className="space-y-6">
        {/* Back + title */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => selectEvent(null)}
            className="text-zinc-400 hover:text-zinc-200"
          >
            &larr; Back
          </Button>
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">{selectedEvent.event_name}</h2>
            <p className="text-sm text-zinc-500">
              {selectedEvent.event_type && (
                <Badge variant="outline" className="mr-2 text-xs text-blue-400 border-blue-500/20">
                  {selectedEvent.event_type}
                </Badge>
              )}
              {selectedEvent.start_date && new Date(selectedEvent.start_date).toLocaleDateString()}
              {selectedEvent.end_date && ` - ${new Date(selectedEvent.end_date).toLocaleDateString()}`}
            </p>
          </div>
        </div>

        {/* Priority tier breakdown */}
        <div className="grid grid-cols-3 gap-4">
          {(['hot', 'warm', 'cold'] as const).map((tier) => (
            <Card key={tier} className="border-zinc-800/60 bg-zinc-900/60">
              <CardContent className="py-4 text-center">
                <p className="text-2xl font-bold text-zinc-100">{breakdown[tier] || 0}</p>
                <Badge variant="outline" className={`mt-1 text-xs capitalize ${priorityColors[tier]}`}>
                  {tier}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Registrants table */}
        {registrantsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 text-zinc-500 animate-spin" />
          </div>
        ) : registrants.length === 0 ? (
          <Card className="border-zinc-800/60 bg-zinc-900/60">
            <CardContent className="py-12 text-center">
              <p className="text-sm text-zinc-500">No registrants found for this event.</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-zinc-800/60 bg-zinc-900/60">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800">
                  <TableHead className="text-zinc-400">Name</TableHead>
                  <TableHead className="text-zinc-400">Company</TableHead>
                  <TableHead className="text-zinc-400">Title</TableHead>
                  <TableHead className="text-zinc-400">Priority</TableHead>
                  <TableHead className="text-zinc-400">Follow-up</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {registrants.map((r) => (
                  <TableRow key={r.id} className="border-zinc-800/60 hover:bg-zinc-800/30">
                    <TableCell className="text-zinc-200 font-medium">
                      {[r.first_name, r.last_name].filter(Boolean).join(' ') || '-'}
                    </TableCell>
                    <TableCell className="text-zinc-400">{r.company || '-'}</TableCell>
                    <TableCell className="text-zinc-400">{r.job_title || '-'}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-xs capitalize ${priorityColors[(r.priority_tier || 'cold').toLowerCase()] || priorityColors.cold}`}
                      >
                        {r.priority_tier || 'cold'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-xs capitalize ${followupColors[(r.followup_status || 'pending').toLowerCase()] || followupColors.pending}`}
                      >
                        {r.followup_status || 'pending'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    )
  }

  // -----------------------------------------------------------------------
  // Event list view
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">LinkedIn Events</h2>
          <p className="text-sm text-zinc-500">
            Manage event registrations and prioritize follow-ups
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadEvents()}
            disabled={loading}
            className="gap-2"
          >
            <Loader2 className={`w-4 h-4 ${loading ? 'animate-spin' : 'hidden'}`} />
            Refresh
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setConnectOpen(true)}>
            <Calendar className="w-4 h-4" />
            Connect Event
          </Button>
        </div>
      </div>

      {/* Connect event form */}
      {connectOpen && (
        <Card className="border-zinc-800/60 bg-zinc-900/60">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-zinc-300">Connect a LinkedIn Event</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="LinkedIn Event ID"
              value={connectId}
              onChange={(e) => setConnectId(e.target.value)}
              className="bg-zinc-800/50 border-zinc-700 text-zinc-200 placeholder:text-zinc-500"
            />
            <Input
              placeholder="Event Name"
              value={connectName}
              onChange={(e) => setConnectName(e.target.value)}
              className="bg-zinc-800/50 border-zinc-700 text-zinc-200 placeholder:text-zinc-500"
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setConnectOpen(false)
                  setConnectId('')
                  setConnectName('')
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!connectId.trim() || !connectName.trim() || connectLoading}
                onClick={handleConnect}
                className="gap-2"
              >
                {connectLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Connect
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Events list */}
      {events.length === 0 ? (
        <Card className="border-zinc-800/60 bg-zinc-900/60">
          <CardContent className="py-16 text-center">
            <Calendar className="w-10 h-10 text-zinc-600 mx-auto mb-4" />
            <h3 className="text-base font-semibold text-zinc-200 mb-2">No events connected</h3>
            <p className="text-sm text-zinc-500 max-w-sm mx-auto">
              Connect a LinkedIn Event to start tracking registrations and prioritizing follow-ups.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <EventCard key={event.id} event={event} onSelect={() => selectEvent(event)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Event card sub-component
// ---------------------------------------------------------------------------

function EventCard({ event, onSelect }: { event: LinkedInEvent; onSelect: () => void }) {
  return (
    <Card
      className="border-zinc-800/60 bg-zinc-900/60 cursor-pointer hover:border-zinc-700 transition-colors"
      onClick={onSelect}
    >
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
              <Calendar className="w-4 h-4 text-blue-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-200 truncate">{event.event_name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {event.start_date && (
                  <span className="text-xs text-zinc-500">
                    {new Date(event.start_date).toLocaleDateString()}
                  </span>
                )}
                {event.event_type && (
                  <Badge variant="outline" className="text-[10px] text-blue-400 border-blue-500/20">
                    {event.event_type}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="flex items-center gap-1.5 text-zinc-400">
              <Users className="w-3.5 h-3.5" />
              <span className="text-xs">{event.registrant_count ?? 0}</span>
            </div>
            {event.organizer_name && (
              <div className="hidden sm:flex items-center gap-1.5 text-zinc-500">
                <MapPin className="w-3.5 h-3.5" />
                <span className="text-xs truncate max-w-[120px]">{event.organizer_name}</span>
              </div>
            )}
            <ChevronRight className="w-4 h-4 text-zinc-600" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
