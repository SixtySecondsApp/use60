import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Video, Users, Clock, Wand2, TrendingUp, AlertTriangle, Plus, CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useCalendarEvents, useCreateCalendarEvent } from '@/lib/hooks/useGoogleIntegration';
import { meetingPrepBrief } from './mockData';
import type { ShotComponentProps } from './types';

// ── Helpers ──────────────────────────────────────────────────────

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;
const hours = [9, 10, 11, 12, 13, 14, 15, 16, 17];

const EVENT_COLORS = [
  { bg: 'bg-blue-500/20', border: 'border-blue-500/40', text: 'text-blue-300', ring: 'ring-blue-400' },
  { bg: 'bg-purple-500/20', border: 'border-purple-500/40', text: 'text-purple-300', ring: 'ring-purple-400' },
  { bg: 'bg-green-500/20', border: 'border-green-500/40', text: 'text-green-300', ring: 'ring-green-400' },
  { bg: 'bg-amber-500/20', border: 'border-amber-500/40', text: 'text-amber-300', ring: 'ring-amber-400' },
  { bg: 'bg-rose-500/20', border: 'border-rose-500/40', text: 'text-rose-300', ring: 'ring-rose-400' },
];

/** Returns Monday 00:00 and Friday 23:59 of the current week (local time). */
function getWeekBounds() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun … 6=Sat
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  friday.setHours(23, 59, 59, 999);

  return { monday, friday };
}

/** Map a real Google Calendar event onto a day column (0-4) and an hour row (9-17). */
interface MappedEvent {
  id: string;
  summary: string;
  startDateTime: string;
  endDateTime: string;
  attendees?: { email: string; displayName?: string }[];
  hangoutLink?: string;
  htmlLink?: string;
  status?: string;
  day: number;   // 0=Mon … 4=Fri
  hour: number;  // 9-17
  colorIdx: number;
}

function mapEvents(events: any[] | undefined, mondayDate: Date): MappedEvent[] {
  if (!events || events.length === 0) return [];

  return events
    .map((evt: any, idx: number) => {
      const start = new Date(evt.start?.dateTime || evt.start?.date);
      const dayOfWeek = start.getDay(); // 0=Sun
      const day = dayOfWeek === 0 ? -1 : dayOfWeek - 1; // Mon=0 … Fri=4; Sun=-1
      const hour = start.getHours();

      if (day < 0 || day > 4 || hour < 9 || hour > 17) return null;

      return {
        id: evt.id,
        summary: evt.summary || '(No title)',
        startDateTime: evt.start?.dateTime || evt.start?.date,
        endDateTime: evt.end?.dateTime || evt.end?.date,
        attendees: evt.attendees,
        hangoutLink: evt.hangoutLink,
        htmlLink: evt.htmlLink,
        status: evt.status,
        day,
        hour,
        colorIdx: idx % EVENT_COLORS.length,
      } satisfies MappedEvent;
    })
    .filter(Boolean) as MappedEvent[];
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDuration(startIso: string, endIso: string) {
  const mins = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60 ? `${mins % 60}m` : ''}`;
  return `${mins} min`;
}

function initials(name?: string, email?: string) {
  if (name) return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  if (email) return email.slice(0, 2).toUpperCase();
  return '??';
}

// ── Skeleton ─────────────────────────────────────────────────────

function CalendarSkeleton() {
  return (
    <div className="bg-gray-800/40 rounded-lg border border-gray-700/50 overflow-hidden">
      <div className="grid grid-cols-6 border-b border-gray-700/50">
        <div className="p-2 text-xs text-gray-500" />
        {days.map((d) => (
          <div key={d} className="p-2 text-xs font-medium text-gray-400 text-center border-l border-gray-700/30">{d}</div>
        ))}
      </div>
      <div className="relative">
        {hours.map((h) => (
          <div key={h} className="grid grid-cols-6 h-12 border-b border-gray-700/20">
            <div className="p-1 text-xs text-gray-600 text-right pr-2">{h > 12 ? `${h - 12}pm` : h === 12 ? '12pm' : `${h}am`}</div>
            {days.map((_, di) => (
              <div key={di} className="border-l border-gray-700/20 relative">
                {h % 3 === 0 && di === (h % 5) && (
                  <div className="absolute inset-x-0.5 top-0.5 rounded h-5 bg-gray-700/40 animate-pulse" />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500 text-center py-3">Loading calendar from Google...</p>
    </div>
  );
}

// ── Calendar grid ────────────────────────────────────────────────

function CalendarGrid({
  events,
  selectedEvent,
  onEventClick,
}: {
  events: MappedEvent[];
  selectedEvent: MappedEvent | null;
  onEventClick: (e: MappedEvent) => void;
}) {
  return (
    <div className="bg-gray-800/40 rounded-lg border border-gray-700/50 overflow-hidden">
      <div className="grid grid-cols-6 border-b border-gray-700/50">
        <div className="p-2 text-xs text-gray-500" />
        {days.map((d) => (
          <div key={d} className="p-2 text-xs font-medium text-gray-400 text-center border-l border-gray-700/30">{d}</div>
        ))}
      </div>
      <div className="relative">
        {hours.map((h) => (
          <div key={h} className="grid grid-cols-6 h-12 border-b border-gray-700/20">
            <div className="p-1 text-xs text-gray-600 text-right pr-2">{h > 12 ? `${h - 12}pm` : h === 12 ? '12pm' : `${h}am`}</div>
            {days.map((_, di) => (
              <div key={di} className="border-l border-gray-700/20 relative">
                {events
                  .filter((e) => e.day === di && e.hour === h)
                  .map((evt) => {
                    const c = EVENT_COLORS[evt.colorIdx];
                    return (
                      <button
                        key={evt.id}
                        onClick={() => onEventClick(evt)}
                        className={cn(
                          'absolute inset-x-0.5 top-0.5 rounded px-1.5 py-0.5 text-xs font-medium border cursor-pointer truncate z-10',
                          c.bg, c.border, c.text,
                          selectedEvent?.id === evt.id && `ring-2 ${c.ring}`,
                        )}
                      >
                        {evt.summary.split(' - ')[0]}
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
        ))}
      </div>
      {events.length === 0 && (
        <p className="text-xs text-gray-500 text-center py-3">No events this week</p>
      )}
    </div>
  );
}

// ── Step variants ────────────────────────────────────────────────

const stepVariants = {
  enter: { opacity: 0, x: 30 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -30 },
};

// ── Main component ───────────────────────────────────────────────

export default function ShotCalendarSync({ activeStep, onStepChange, isActive }: ShotComponentProps) {
  const { monday, friday } = useMemo(() => getWeekBounds(), []);
  const timeMin = monday.toISOString();
  const timeMax = friday.toISOString();

  const { data: calendarData, isLoading, refetch } = useCalendarEvents(timeMin, timeMax);
  const createEvent = useCreateCalendarEvent();

  const mappedEvents = useMemo(
    () => mapEvents(calendarData?.events, monday),
    [calendarData?.events, monday],
  );

  const [selectedEvent, setSelectedEvent] = useState<MappedEvent | null>(null);
  const [eventCreated, setEventCreated] = useState(false);

  // Auto-select first event when data loads and we're on step 1
  const effectiveSelected = selectedEvent ?? mappedEvents[0] ?? null;

  // ── Build tomorrow's 2:00-2:45 PM times ──
  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  }, []);

  const tomorrowLabel = tomorrow.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  const startISO = useMemo(() => {
    const d = new Date(tomorrow);
    d.setHours(14, 0, 0, 0);
    return d.toISOString();
  }, [tomorrow]);

  const endISO = useMemo(() => {
    const d = new Date(tomorrow);
    d.setHours(14, 45, 0, 0);
    return d.toISOString();
  }, [tomorrow]);

  async function handleCreateEvent() {
    try {
      await createEvent.mutateAsync({
        summary: '60 Demo — Follow-up Call',
        description: 'Follow-up call booked via 60 demo flow.',
        startTime: startISO,
        endTime: endISO,
      });
      setEventCreated(true);
      // Refetch calendar so the new event appears in step 4
      await refetch();
      onStepChange(4);
    } catch (err) {
      console.error('[ShotCalendarSync] Failed to create event:', err);
    }
  }

  return (
    <AnimatePresence mode="wait">
      {/* ── Step 0: Week-view calendar grid ── */}
      {activeStep === 0 && (
        <motion.div key="weekview" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Calendar</h3>
            <Badge variant="outline" className="border-green-500/40 text-green-400">Synced with Google</Badge>
          </div>
          {isLoading ? (
            <CalendarSkeleton />
          ) : (
            <CalendarGrid events={mappedEvents} selectedEvent={null} onEventClick={() => {}} />
          )}
        </motion.div>
      )}

      {/* ── Step 1: Event detail ── */}
      {activeStep === 1 && (
        <motion.div key="eventdetail" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }} className="grid grid-cols-2 gap-4">
          {isLoading ? (
            <CalendarSkeleton />
          ) : (
            <CalendarGrid events={mappedEvents} selectedEvent={effectiveSelected} onEventClick={setSelectedEvent} />
          )}
          {effectiveSelected && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 }}>
              <Card className="bg-gray-800/60 border-gray-700/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-white">{effectiveSelected.summary}</CardTitle>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock className="w-3 h-3 text-gray-500" />
                    <span className="text-xs text-gray-400">
                      {formatTime(effectiveSelected.startDateTime)} &mdash; {formatTime(effectiveSelected.endDateTime)}
                      {' '}&middot; {formatDuration(effectiveSelected.startDateTime, effectiveSelected.endDateTime)}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Attendees */}
                  {effectiveSelected.attendees && effectiveSelected.attendees.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Users className="w-3 h-3" /> Attendees</p>
                      {effectiveSelected.attendees.map((a) => (
                        <div key={a.email} className="flex items-center gap-2 py-1">
                          <Avatar className="w-6 h-6">
                            <AvatarFallback className="bg-gray-700 text-xs text-gray-300">{initials(a.displayName, a.email)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-xs text-white">{a.displayName || a.email}</p>
                            {a.displayName && <p className="text-xs text-gray-500">{a.email}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Google Meet link */}
                  {effectiveSelected.hangoutLink && (
                    <a
                      href={effectiveSelected.hangoutLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2 rounded bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
                    >
                      <Video className="w-4 h-4 text-blue-400" />
                      <span className="text-xs text-blue-300">Google Meet</span>
                      <span className="text-xs text-blue-400/60 truncate flex-1">{effectiveSelected.hangoutLink}</span>
                    </a>
                  )}

                  {/* View in Google Calendar */}
                  {effectiveSelected.htmlLink && (
                    <a
                      href={effectiveSelected.htmlLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-300 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>View in Google Calendar</span>
                    </a>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </motion.div>
      )}

      {/* ── Step 2: AI meeting prep brief ── */}
      {activeStep === 2 && (
        <motion.div key="aiprep" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
          <Card className="bg-gray-800/60 border-gray-700/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-blue-400" />
                <CardTitle className="text-sm text-white">
                  AI Meeting Prep — {effectiveSelected ? effectiveSelected.summary : meetingPrepBrief.company}
                </CardTitle>
              </div>
              <div className="flex gap-2 mt-2">
                <Badge variant="outline" className="border-amber-500/40 text-amber-400">{meetingPrepBrief.dealStage}</Badge>
                <Badge variant="outline" className="border-green-500/40 text-green-400">{meetingPrepBrief.dealValue}</Badge>
                {effectiveSelected && (
                  <Badge variant="outline" className="border-blue-500/40 text-blue-400">
                    {formatTime(effectiveSelected.startDateTime)} &mdash; {formatTime(effectiveSelected.endDateTime)}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Recent Interactions</p>
                {meetingPrepBrief.recentInteractions.map((ri, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 * i }} className="flex items-start gap-2 py-1.5">
                    <Badge variant="outline" className="text-xs border-gray-600 text-gray-400 min-w-[60px] justify-center">{ri.type}</Badge>
                    <span className="text-xs text-gray-300 flex-1">{ri.detail}</span>
                    <span className="text-xs text-gray-600 whitespace-nowrap">{ri.date}</span>
                  </motion.div>
                ))}
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Talking Points</p>
                {meetingPrepBrief.talkingPoints.map((tp, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + 0.08 * i }} className="flex items-start gap-2 py-1">
                    <CheckCircle2 className="w-3 h-3 text-blue-400 mt-0.5 flex-shrink-0" />
                    <span className="text-xs text-gray-300">{tp}</span>
                  </motion.div>
                ))}
              </div>
              <div>
                <p className="text-xs font-medium text-red-400/80 uppercase tracking-wide mb-2">Risks</p>
                {meetingPrepBrief.risks.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 py-1">
                    <AlertTriangle className="w-3 h-3 text-red-400 mt-0.5 flex-shrink-0" />
                    <span className="text-xs text-red-300/80">{r}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ── Step 3: Create event form ── */}
      {activeStep === 3 && (
        <motion.div key="createevent" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
          <Card className="bg-gray-800/60 border-gray-700/50 max-w-lg mx-auto">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-400" />
                <CardTitle className="text-sm text-white">Create Event</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Title</label>
                <div className="px-3 py-2 bg-gray-900/60 border border-gray-700/50 rounded-md text-sm text-white">60 Demo — Follow-up Call</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Date</label>
                  <div className="px-3 py-2 bg-gray-900/60 border border-gray-700/50 rounded-md text-sm text-white">{tomorrowLabel}</div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Time</label>
                  <div className="px-3 py-2 bg-gray-900/60 border border-gray-700/50 rounded-md text-sm text-white">2:00 PM — 2:45 PM</div>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="flex items-center gap-2">
                  <Video className="w-4 h-4 text-blue-400" />
                  <span className="text-sm text-blue-300">Add Google Meet</span>
                </div>
                <div className="w-9 h-5 bg-blue-600 rounded-full relative">
                  <div className="w-4 h-4 bg-white rounded-full absolute right-0.5 top-0.5" />
                </div>
              </div>
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700"
                onClick={handleCreateEvent}
                disabled={createEvent.isPending}
              >
                {createEvent.isPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </span>
                ) : (
                  'Create Event'
                )}
              </Button>
              {createEvent.isError && (
                <p className="text-xs text-red-400 text-center">Failed to create event. Please try again.</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ── Step 4: Success confirmation ── */}
      {activeStep === 4 && (
        <motion.div key="eventcreated" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="flex items-center gap-3 p-3 mb-4 rounded-lg bg-green-500/10 border border-green-500/30"
          >
            <CheckCircle2 className="w-5 h-5 text-green-400" />
            <span className="text-sm text-green-300">Event created and synced to Google Calendar</span>
          </motion.div>
          {isLoading ? (
            <CalendarSkeleton />
          ) : (
            <CalendarGrid events={mappedEvents} selectedEvent={null} onEventClick={() => {}} />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
