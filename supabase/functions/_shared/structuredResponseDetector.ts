/**
 * Structured Response Detector (shared module)
 *
 * Extracted from api-copilot/index.ts to enable reuse by copilot-autonomous
 * and other edge functions. Maps tool executions, user intents, and sequence
 * results into rich structured response panels for the Copilot UI.
 *
 * Exports:
 *   - detectAndStructureResponse()  – main entry point
 *   - All supporting types (StructuredResponse, ToolExecutionDetail, etc.)
 *   - Helper structuring functions for individual response types
 *   - Utility functions (calendar helpers, gmail helpers, text extraction)
 */

import { isValidUUID } from './api-utils.ts'

// ---------------------------------------------------------------------------
// Environment variables (read once at module load)
// ---------------------------------------------------------------------------
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? Deno.env.get('GOOGLE_GEMINI_API_KEY') ?? ''
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || ''
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || ''

// ---------------------------------------------------------------------------
// Exported type interfaces
// ---------------------------------------------------------------------------

export interface ChatRequestContext {
  userId: string
  currentView?: 'dashboard' | 'contact' | 'pipeline'
  contactId?: string
  dealIds?: string[]
  taskId?: string
  orgId?: string
  temporalContext?: TemporalContextPayload
}

export interface TemporalContextPayload {
  isoString?: string
  localeString?: string
  date?: string
  time?: string
  timezone?: string
  offsetMinutes?: number
}

export interface ToolExecutionDetail {
  toolName: string
  args: any
  result: any
  latencyMs: number
  success: boolean
  error?: string
  capability?: string
  provider?: string
}

export interface StructuredResponse {
  type: string
  summary?: string
  data?: any
  actions?: Array<{
    id: string
    label: string
    type: string
    icon?: string
    callback: string
    params?: any
  }>
  metadata?: any
}

export interface ContactData {
  id: string
  full_name?: string
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  title?: string
  company_id?: string
  companies?: {
    name?: string
  }
}

export interface TaskData {
  id: string
  ticket_id?: string
  title: string
  description?: string
  type?: string
  priority?: string
  status?: string
  submitted_by?: string
  created_at?: string
  updated_at?: string
}

export interface GmailMessageSummary {
  id: string
  threadId?: string
  subject: string
  snippet: string
  date: string
  direction: 'sent' | 'received' | 'unknown'
  from: string[]
  to: string[]
  historyId?: string
  link?: string
}

export interface ContactResolutionResult {
  contact: ContactData | null
  contactEmail: string | null
  contactName: string | null
  searchTerm: string | null
}

export interface AvailabilityRequestDetails {
  start: Date
  end: Date
  durationMinutes: number
  workingHoursStart: string
  workingHoursEnd: string
  excludeWeekends: boolean
  description: string
}

// ---------------------------------------------------------------------------
// Calendar date/time helpers
// ---------------------------------------------------------------------------

export function clampDurationMinutes(value: number): number {
  if (!value || Number.isNaN(value)) {
    return 60
  }
  return Math.min(240, Math.max(15, Math.round(value)))
}

export function normalizeTimeInput(value: string | undefined, fallback: string): string {
  const pattern = /^([01]?\d|2[0-3]):([0-5]\d)$/
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (pattern.test(trimmed)) {
      const [hours, minutes] = trimmed.split(':')
      return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`
    }
  }
  return fallback
}

export function parseDateInput(value?: string, fallback?: Date): Date {
  if (value) {
    const parsed = new Date(value)
    if (!isNaN(parsed.getTime())) {
      return parsed
    }
  }
  return fallback ? new Date(fallback) : new Date()
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

export function addMinutes(date: Date, minutes: number): Date {
  const result = new Date(date)
  result.setTime(result.getTime() + minutes * 60000)
  return result
}

export function getZonedDateParts(
  date: Date,
  timeZone: string
): { year: number; month: number; day: number; weekday: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short'
  })

  const partValues: Record<string, string> = {}
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') {
      partValues[part.type] = part.value
    }
  }

  const weekdayMap: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6
  }

  const weekday = weekdayMap[(partValues.weekday || '').slice(0, 3).toLowerCase()] ?? 0

  return {
    year: Number(partValues.year),
    month: Number(partValues.month),
    day: Number(partValues.day),
    weekday
  }
}

export function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  const offsetMinutes = getTimezoneOffsetMinutes(timeZone, utcDate)
  return new Date(utcDate.getTime() - offsetMinutes * 60000)
}

export function getTimezoneOffsetMinutes(timeZone: string, date: Date): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })

  const partValues: Record<string, string> = {}
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') {
      partValues[part.type] = part.value
    }
  }

  const asUTC = Date.UTC(
    Number(partValues.year),
    Number(partValues.month) - 1,
    Number(partValues.day),
    Number(partValues.hour),
    Number(partValues.minute),
    Number(partValues.second)
  )

  return (asUTC - date.getTime()) / 60000
}

export function startOfZonedDay(date: Date, timeZone: string): Date {
  const parts = getZonedDateParts(date, timeZone)
  return zonedDateTimeToUtc(parts.year, parts.month, parts.day, 0, 0, 0, timeZone)
}

export function endOfZonedDay(date: Date, timeZone: string): Date {
  const parts = getZonedDateParts(date, timeZone)
  return zonedDateTimeToUtc(parts.year, parts.month, parts.day, 23, 59, 59, timeZone)
}

export function zonedTimeOnDate(date: Date, timeString: string, timeZone: string): Date {
  const parts = getZonedDateParts(date, timeZone)
  const [hours = '0', minutes = '0'] = timeString.split(':')
  const hourNum = Math.min(23, Math.max(0, parseInt(hours, 10) || 0))
  const minuteNum = Math.min(59, Math.max(0, parseInt(minutes, 10) || 0))
  return zonedDateTimeToUtc(parts.year, parts.month, parts.day, hourNum, minuteNum, 0, timeZone)
}

export function mergeIntervals(intervals: Array<{ start: Date; end: Date }>): Array<{ start: Date; end: Date }> {
  if (!intervals.length) {
    return []
  }
  const sorted = intervals
    .map(interval => ({
      start: new Date(interval.start.getTime()),
      end: new Date(interval.end.getTime())
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  const merged: Array<{ start: Date; end: Date }> = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]
    const last = merged[merged.length - 1]
    if (current.start <= last.end) {
      if (current.end > last.end) {
        last.end = current.end
      }
    } else {
      merged.push(current)
    }
  }
  return merged
}

export function calculateFreeSlotsForDay(
  dayStart: Date,
  dayEnd: Date,
  busyIntervals: Array<{ start: Date; end: Date }>,
  durationMinutes: number
): Array<{ start: Date; end: Date; durationMinutes: number }> {
  const available: Array<{ start: Date; end: Date; durationMinutes: number }> = []
  const merged = mergeIntervals(busyIntervals)
  let cursor = new Date(dayStart)

  for (const interval of merged) {
    if (interval.start > cursor) {
      const gapMinutes = (interval.start.getTime() - cursor.getTime()) / 60000
      if (gapMinutes >= durationMinutes) {
        available.push({
          start: new Date(cursor),
          end: new Date(interval.start),
          durationMinutes: gapMinutes
        })
      }
    }
    if (interval.end > cursor) {
      cursor = new Date(interval.end)
    }
  }

  if (cursor < dayEnd) {
    const gapMinutes = (dayEnd.getTime() - cursor.getTime()) / 60000
    if (gapMinutes >= durationMinutes) {
      available.push({
        start: new Date(cursor),
        end: new Date(dayEnd),
        durationMinutes: gapMinutes
      })
    }
  }

  return available
}

export function startOfWeekZoned(date: Date, timeZone: string): Date {
  const start = startOfZonedDay(date, timeZone)
  const { weekday } = getZonedDateParts(date, timeZone)
  const daysToSubtract = (weekday + 6) % 7
  return addDays(start, -daysToSubtract)
}

export function endOfWeekZoned(startOfWeek: Date, timeZone: string): Date {
  return endOfZonedDay(addDays(startOfWeek, 6), timeZone)
}

export function getNextWeekdayDate(targetDay: number, preferNextWeek: boolean, timeZone: string, currentDate: Date = new Date()): Date {
  const todayStart = startOfZonedDay(currentDate, timeZone)
  const { weekday } = getZonedDateParts(todayStart, timeZone)
  let daysAhead = (targetDay - weekday + 7) % 7
  if (daysAhead === 0 && !preferNextWeek) {
    return todayStart
  }
  if (preferNextWeek) {
    daysAhead = daysAhead === 0 ? 7 : daysAhead + 7
  }
  return addDays(todayStart, daysAhead || 7)
}

export function isSameZonedDay(date: Date, timeZone: string, currentDate: Date = new Date()): boolean {
  const partsA = getZonedDateParts(date, timeZone)
  const partsB = getZonedDateParts(currentDate, timeZone)
  return partsA.year === partsB.year && partsA.month === partsB.month && partsA.day === partsB.day
}

export function formatHumanReadableRange(start: Date, end: Date, timeZone: string): string {
  const startFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  })
  const endFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric'
  })
  const sameDay = isSameZonedDay(start, timeZone) && isSameZonedDay(end, timeZone)
  if (sameDay) {
    return startFormatter.format(start)
  }
  return `${startFormatter.format(start)} and ${endFormatter.format(end)}`
}

export function formatAvailabilitySlotSummary(
  slot: { startTime: string; endTime: string },
  timeZone: string
): string {
  const start = new Date(slot.startTime)
  const end = new Date(slot.endTime)
  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  })
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit'
  })
  return `${dayFormatter.format(start)} at ${timeFormatter.format(start)} – ${timeFormatter.format(end)}`
}

export function extractDurationFromMessage(messageLower: string): number | null {
  if (!messageLower) return null
  const durationMatch = messageLower.match(/(\d+)\s*(?:-?\s*)(minute|minutes|min|mins|hour|hours|hr|hrs)/)
  if (durationMatch && durationMatch[1]) {
    const value = parseInt(durationMatch[1], 10)
    if (!isNaN(value)) {
      if (durationMatch[2].includes('hour') || durationMatch[2].includes('hr')) {
        return clampDurationMinutes(value * 60)
      }
      return clampDurationMinutes(value)
    }
  }
  if (messageLower.includes('half hour') || messageLower.includes('half-hour')) {
    return 30
  }
  if (messageLower.includes('quarter hour') || messageLower.includes('quarter-hour')) {
    return 15
  }
  return null
}

export function inferAvailabilityRequestFromMessage(
  message: string | undefined,
  timeZone: string,
  currentDate: Date = new Date()
): AvailabilityRequestDetails {
  const lower = (message || '').toLowerCase()
  const duration = extractDurationFromMessage(lower) ?? 60
  const workingHoursStart = lower.includes('early morning') ? '08:00' : '09:00'
  const workingHoursEnd = lower.includes('evening') ? '19:00' : '17:00'
  const excludeWeekends = !(lower.includes('weekend') || lower.includes('weekends'))

  let description = 'over the next week'
  let start = startOfZonedDay(currentDate, timeZone)
  let end = endOfZonedDay(addDays(start, 6), timeZone)

  if (lower.includes('today')) {
    start = startOfZonedDay(currentDate, timeZone)
    end = endOfZonedDay(currentDate, timeZone)
    return {
      start,
      end,
      durationMinutes: duration,
      workingHoursStart,
      workingHoursEnd,
      excludeWeekends,
      description: `today (${formatHumanReadableRange(start, end, timeZone)})`
    }
  }

  if (lower.includes('tomorrow')) {
    const tomorrow = addDays(currentDate, 1)
    start = startOfZonedDay(tomorrow, timeZone)
    end = endOfZonedDay(tomorrow, timeZone)
    return {
      start,
      end,
      durationMinutes: duration,
      workingHoursStart,
      workingHoursEnd,
      excludeWeekends,
      description: `tomorrow (${formatHumanReadableRange(start, end, timeZone)})`
    }
  }

  if (lower.includes('next week')) {
    const nextWeekStart = startOfWeekZoned(addDays(currentDate, 7), timeZone)
    start = nextWeekStart
    end = endOfWeekZoned(nextWeekStart, timeZone)
    return {
      start,
      end,
      durationMinutes: duration,
      workingHoursStart,
      workingHoursEnd,
      excludeWeekends,
      description: `next week (${formatHumanReadableRange(start, end, timeZone)})`
    }
  }

  if (lower.includes('this week')) {
    start = startOfWeekZoned(currentDate, timeZone)
    end = endOfWeekZoned(start, timeZone)
    return {
      start,
      end,
      durationMinutes: duration,
      workingHoursStart,
      workingHoursEnd,
      excludeWeekends,
      description: `this week (${formatHumanReadableRange(start, end, timeZone)})`
    }
  }

  const dayMap: Array<{ key: string; index: number }> = [
    { key: 'sunday', index: 0 },
    { key: 'monday', index: 1 },
    { key: 'tuesday', index: 2 },
    { key: 'wednesday', index: 3 },
    { key: 'thursday', index: 4 },
    { key: 'friday', index: 5 },
    { key: 'saturday', index: 6 }
  ]

  for (const day of dayMap) {
    if (lower.includes(day.key)) {
      const preferNextWeek = lower.includes('next week') || lower.includes(`next ${day.key}`) || lower.includes('this coming')
      const dayDate = getNextWeekdayDate(day.index, preferNextWeek, timeZone, currentDate)
      start = startOfZonedDay(dayDate, timeZone)
      end = endOfZonedDay(dayDate, timeZone)
      return {
        start,
        end,
        durationMinutes: duration,
        workingHoursStart,
        workingHoursEnd,
        excludeWeekends,
        description: `on ${formatHumanReadableRange(start, end, timeZone)}`
      }
    }
  }

  return {
    start,
    end,
    durationMinutes: duration,
    workingHoursStart,
    workingHoursEnd,
    excludeWeekends,
    description
  }
}

// ---------------------------------------------------------------------------
// Timezone helper
// ---------------------------------------------------------------------------

export async function getUserTimezone(client: any, userId: string): Promise<string> {
  try {
    const { data: calendarData, error: calendarError } = await client
      .from('calendar_calendars')
      .select('timezone')
      .eq('user_id', userId)
      .eq('external_id', 'primary')
      .maybeSingle()

    if (!calendarError && calendarData?.timezone) {
      console.log('[TIMEZONE] Using timezone from calendar integration:', calendarData.timezone)
      return calendarData.timezone
    }
  } catch (_err) {
    // Ignore errors - table might not exist
  }

  try {
    const { data: settingsData, error: settingsError } = await client
      .from('user_settings')
      .select('preferences')
      .eq('user_id', userId)
      .maybeSingle()

    if (!settingsError && settingsData?.preferences?.timezone) {
      const tz = settingsData.preferences.timezone
      console.log('[TIMEZONE] Using timezone from user_settings:', tz)
      return tz
    }
  } catch (_err) {
    // Ignore errors
  }

  try {
    const { data: profileData, error: profileError } = await client
      .from('profiles')
      .select('timezone')
      .eq('id', userId)
      .maybeSingle()

    if (!profileError && profileData?.timezone) {
      console.log('[TIMEZONE] Using timezone from profiles:', profileData.timezone)
      return profileData.timezone
    }
  } catch (_err) {
    // Ignore missing column or table errors
  }

  console.log('[TIMEZONE] Using default timezone: Europe/London')
  return 'Europe/London'
}

// ---------------------------------------------------------------------------
// Text extraction helpers
// ---------------------------------------------------------------------------

export function extractNameAndCompanyFromMessage(
  message: string
): { nameCandidate: string | null; companyCandidate: string | null } {
  const atPattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+at\s+([A-Z][\w& ]+)/i
  const atMatch = message.match(atPattern)
  if (atMatch && atMatch[1]) {
    return {
      nameCandidate: atMatch[1].trim(),
      companyCandidate: atMatch[2]?.trim() || null
    }
  }

  const patterns = [
    /emails?\s+from\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i,
    /emails?\s+to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i,
    /with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i,
    /about\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i,
    /regarding\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i
  ]

  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match && match[1]) {
      return { nameCandidate: match[1].trim(), companyCandidate: null }
    }
  }

  return { nameCandidate: null, companyCandidate: null }
}

export function extractEmailLimitFromMessage(message: string): number {
  const limitPattern = /last\s+(\d+)\s+emails?/i
  const fallbackPattern = /(\d+)\s+(?:recent|latest)\s+emails?/i
  const match = message.match(limitPattern) || message.match(fallbackPattern)
  if (match && match[1]) {
    const parsed = parseInt(match[1], 10)
    if (!isNaN(parsed)) {
      return Math.min(Math.max(parsed, 3), 20)
    }
  }
  return 10
}

export function detectEmailDirection(messageLower: string): 'sent' | 'received' | 'both' {
  if (
    messageLower.includes('emails to') ||
    messageLower.includes('email to') ||
    messageLower.includes('that i sent') ||
    messageLower.includes('i sent') ||
    messageLower.includes('from me')
  ) {
    return 'sent'
  }
  if (
    messageLower.includes('emails from') ||
    messageLower.includes('email from') ||
    messageLower.includes('from ') && messageLower.includes('email')
  ) {
    return 'received'
  }
  return 'both'
}

export function extractDateRangeFromMessage(
  messageLower: string
): { startDate?: string | null; endDate?: string | null } {
  const now = new Date()
  const startOfDay = (date: Date) => {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    return d
  }
  const endOfDay = (date: Date) => {
    const d = new Date(date)
    d.setHours(23, 59, 59, 999)
    return d
  }
  const subtractDays = (days: number) => {
    const d = new Date(now)
    d.setDate(d.getDate() - days)
    return d
  }

  if (messageLower.includes('today')) {
    return { startDate: startOfDay(now).toISOString(), endDate: endOfDay(now).toISOString() }
  }

  if (messageLower.includes('yesterday')) {
    const yesterday = subtractDays(1)
    return { startDate: startOfDay(yesterday).toISOString(), endDate: endOfDay(yesterday).toISOString() }
  }

  const daysMatch = messageLower.match(/last\s+(\d+)\s+days?/)
  if (daysMatch && daysMatch[1]) {
    const days = parseInt(daysMatch[1], 10)
    if (!isNaN(days)) {
      return { startDate: subtractDays(days).toISOString(), endDate: null }
    }
  }

  if (messageLower.includes('last week')) {
    return { startDate: subtractDays(7).toISOString(), endDate: null }
  }

  if (messageLower.includes('last two weeks')) {
    return { startDate: subtractDays(14).toISOString(), endDate: null }
  }

  if (messageLower.includes('last month')) {
    return { startDate: subtractDays(30).toISOString(), endDate: null }
  }

  return {}
}

export function extractLabelFromMessage(message: string): string | null {
  const quotedLabel = message.match(/label\s+(?:named\s+)?["']([^"']+)["']/i)
  if (quotedLabel && quotedLabel[1]) {
    return quotedLabel[1].trim()
  }

  const simpleLabel = message.match(/label\s+(?:called\s+)?([A-Za-z0-9 \-_]+)/i)
  if (simpleLabel && simpleLabel[1]) {
    const label = simpleLabel[1].trim()
    if (label) {
      return label.replace(/\?$/, '').trim()
    }
  }

  return null
}

export function extractTaskLimit(message: string): number | null {
  const numberPatterns = [
    /(?:show|list|get|find|display)\s+(?:me\s+)?(\d+)\s+(?:task|todo)/i,
    /(\d+)\s+(?:task|todo|high\s+priority\s+task)/i,
    /(?:first|top)\s+(\d+)/i
  ];

  for (const pattern of numberPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (num > 0 && num <= 100) {
        return num;
      }
    }
  }

  return null;
}

export function isAvailabilityQuestion(messageLower: string): boolean {
  if (!messageLower) return false

  const triggerPhrases = [
    'when am i free',
    'when am i available',
    'when do i have time',
    'when can i meet',
    'find a free slot',
    'find availability',
    'free on',
    'free next',
    'available on',
    'available next',
    'do i have time',
    'open slots',
    'open time',
    'find time to meet',
    'find time next week'
  ]

  const calendarEventPhrases = [
    'what\'s on my calendar',
    'what\'s on my schedule',
    'what meetings',
    'what events',
    'show me my calendar',
    'show me my schedule',
    'calendar on',
    'schedule on',
    'meetings on',
    'events on'
  ]

  const weekdayKeywords = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  const containsTrigger = triggerPhrases.some(phrase => messageLower.includes(phrase))
  const containsCalendarEvent = calendarEventPhrases.some(phrase => messageLower.includes(phrase))
  const mentionsFree = messageLower.includes('free') || messageLower.includes('availability') || messageLower.includes('available')
  const mentionsWeekday = weekdayKeywords.some(day => messageLower.includes(day))
  const mentionsRelativeWeek = messageLower.includes('next week') || messageLower.includes('this week')

  return containsTrigger || containsCalendarEvent || (mentionsFree && (mentionsWeekday || mentionsRelativeWeek))
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

export function extractRecommendations(content: string): any[] {
  const recommendations: any[] = []
  const actionPatterns = [
    /(?:suggest|recommend|consider|you should|next step)[\s\S]{0,200}/gi
  ]
  return recommendations
}

// ---------------------------------------------------------------------------
// Gmail helpers
// ---------------------------------------------------------------------------

export function extractEmailsFromHeader(header?: string): string[] {
  if (!header) return []
  const matches = header.match(/[\w.+-]+@[\w.-]+\.\w+/g)
  if (!matches) return []
  return matches.map(email => email.trim())
}

export function sanitizeSubject(subject?: string): string {
  if (!subject || !subject.trim()) return '(No subject)'
  return subject.trim()
}

export function determineDirection(
  contactEmail: string | null,
  fromList: string[],
  toList: string[]
): 'sent' | 'received' | 'unknown' {
  if (!contactEmail) return 'unknown'
  const normalized = contactEmail.toLowerCase()
  if (fromList.some(email => email.toLowerCase() === normalized)) return 'received'
  if (toList.some(email => email.toLowerCase() === normalized)) return 'sent'
  return 'unknown'
}

export function toUnixTimestamp(dateString?: string | null): number | null {
  if (!dateString) return null
  const parsed = new Date(dateString)
  if (isNaN(parsed.getTime())) return null
  return Math.floor(parsed.getTime() / 1000)
}

export async function refreshGmailAccessToken(
  client: any,
  integrationId: string,
  userId: string,
  refreshToken?: string | null
): Promise<{ accessToken: string; expiresAt: string }> {
  if (!refreshToken) {
    throw new Error('No refresh token available for Gmail integration. Please reconnect your Google account.')
  }

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('Google OAuth credentials are not configured on the server.')
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(payload.error_description || payload.error?.message || 'Failed to refresh Gmail token')
  }

  const expiresAtDate = new Date()
  expiresAtDate.setSeconds(expiresAtDate.getSeconds() + (payload.expires_in || 3600))

  await client
    .from('google_integrations')
    .update({
      access_token: payload.access_token,
      expires_at: expiresAtDate.toISOString()
    })
    .eq('id', integrationId)

  return {
    accessToken: payload.access_token,
    expiresAt: expiresAtDate.toISOString()
  }
}

export async function getGmailAccessToken(
  client: any,
  userId: string
): Promise<{ accessToken: string; integrationId: string }> {
  const { data: integration, error } = await client
    .from('google_integrations')
    .select('id, access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !integration) {
    throw new Error('Google integration not found. Connect your Gmail account in Settings.')
  }

  let accessToken = integration.access_token
  const expiresAt = integration.expires_at ? new Date(integration.expires_at) : null
  const needsRefresh = !accessToken || (expiresAt && expiresAt.getTime() <= Date.now() + 60_000)

  if (needsRefresh) {
    const refreshed = await refreshGmailAccessToken(client, integration.id, userId, integration.refresh_token)
    accessToken = refreshed.accessToken
  }

  return { accessToken, integrationId: integration.id }
}

export async function searchGmailMessages(
  client: any,
  userId: string,
  options: {
    contactEmail?: string | null
    query?: string | null
    limit?: number
    direction?: 'sent' | 'received' | 'both'
    startDate?: string | null
    endDate?: string | null
    label?: string | null
  }
): Promise<{ messages: GmailMessageSummary[]; source: 'gmail' }> {
  const { accessToken } = await getGmailAccessToken(client, userId)
  const limit = Math.min(Math.max(options.limit || 10, 1), 20)

  const qParts: string[] = []
  if (options.contactEmail) {
    const normalizedEmail = options.contactEmail.trim()
    if (options.direction === 'sent') {
      qParts.push(`to:${normalizedEmail}`)
    } else if (options.direction === 'received') {
      qParts.push(`from:${normalizedEmail}`)
    } else {
      qParts.push(`(from:${normalizedEmail} OR to:${normalizedEmail})`)
    }
  }

  if (options.query) {
    const safeQuery = options.query.replace(/"/g, '').trim()
    if (safeQuery) qParts.push(`"${safeQuery}"`)
  }

  if (options.label) {
    const safeLabel = options.label.replace(/"/g, '').trim()
    if (safeLabel) qParts.push(`label:"${safeLabel}"`)
  }

  const after = toUnixTimestamp(options.startDate || null)
  const before = toUnixTimestamp(options.endDate || null)
  if (after) qParts.push(`after:${after}`)
  if (before) qParts.push(`before:${before}`)

  const params = new URLSearchParams({
    maxResults: String(limit)
  })
  if (qParts.length > 0) {
    params.set('q', qParts.join(' '))
  }

  const listResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  if (listResponse.status === 404) {
    return { messages: [], source: 'gmail' }
  }

  const listPayload = await listResponse.json().catch(() => ({}))
  if (!listResponse.ok) {
    throw new Error(listPayload.error?.message || 'Failed to fetch Gmail messages')
  }

  const messageRefs = (listPayload.messages || []).slice(0, limit)
  if (messageRefs.length === 0) {
    return { messages: [], source: 'gmail' }
  }

  const baseHeaders = ['Subject', 'From', 'To', 'Date']

  const detailedResults = await Promise.allSettled(
    messageRefs.map(async (msg: any) => {
      const detailUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`)
      detailUrl.searchParams.set('format', 'metadata')
      baseHeaders.forEach(header => detailUrl.searchParams.append('metadataHeaders', header))

      const detailResponse = await fetch(detailUrl.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      })

      if (!detailResponse.ok) {
        return null
      }

      const detail = await detailResponse.json()
      const headerList = detail.payload?.headers || []
      const getHeader = (name: string) => headerList.find((h: any) => h.name === name)?.value || ''
      const subject = sanitizeSubject(getHeader('Subject'))
      const snippet = detail.snippet || ''
      const sentDate = getHeader('Date')
      const date = sentDate
        ? new Date(sentDate).toISOString()
        : detail.internalDate
          ? new Date(Number(detail.internalDate)).toISOString()
          : new Date().toISOString()
      const fromList = extractEmailsFromHeader(getHeader('From'))
      const toList = extractEmailsFromHeader(getHeader('To'))

      return {
        id: detail.id,
        threadId: detail.threadId,
        subject,
        snippet,
        date,
        from: fromList,
        to: toList,
        historyId: detail.historyId,
        direction: determineDirection(options.contactEmail || null, fromList, toList),
        link: detail.threadId ? `https://mail.google.com/mail/u/0/#inbox/${detail.threadId}` : undefined
      } as GmailMessageSummary
    })
  )

  const messages: GmailMessageSummary[] = []
  for (const result of detailedResults) {
    if (result.status === 'fulfilled' && result.value) {
      messages.push(result.value)
    }
  }

  return { messages, source: 'gmail' }
}

export async function fetchEmailActivitiesFallback(
  client: any,
  userId: string,
  contactId?: string | null,
  limit: number = 10
): Promise<GmailMessageSummary[]> {
  if (!contactId) return []

  const { data, error } = await client
    .from('activities')
    .select('id, details, date')
    .eq('user_id', userId)
    .eq('contact_id', contactId)
    .eq('type', 'email')
    .order('date', { ascending: false })
    .limit(limit)

  if (error || !data) {
    if (error) console.error('Error fetching fallback activities:', error)
    return []
  }

  return data.map((activity: any) => ({
    id: activity.id,
    subject: sanitizeSubject(activity.details?.substring(0, 80) || 'Email'),
    snippet: activity.details || '',
    date: activity.date,
    direction: 'unknown' as const,
    from: [],
    to: [],
    historyId: undefined,
    threadId: undefined,
    link: undefined
  }))
}

// ---------------------------------------------------------------------------
// Calendar sync + availability
// ---------------------------------------------------------------------------

export async function ensureCalendarSynced(
  client: any,
  userId: string,
  startDate?: string,
  endDate?: string
): Promise<void> {
  try {
    let syncStatus: any = null
    try {
      const { data, error } = await client
        .from('user_sync_status')
        .select('calendar_last_synced_at, calendar_sync_token')
        .eq('user_id', userId)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') {
        console.error('[CALENDAR-SYNC] Error checking sync status:', error)
      } else {
        syncStatus = data
      }
    } catch (tableError: any) {
      console.log('[CALENDAR-SYNC] user_sync_status table may not exist, will attempt sync anyway')
    }

    const needsSync = !syncStatus?.calendar_last_synced_at ||
      (Date.now() - new Date(syncStatus.calendar_last_synced_at).getTime()) > 5 * 60 * 1000

    if (needsSync) {
      console.log('[CALENDAR-SYNC] Triggering sync for user:', userId, {
        hasSyncStatus: !!syncStatus,
        lastSynced: syncStatus?.calendar_last_synced_at,
        syncToken: syncStatus?.calendar_sync_token ? 'present' : 'missing'
      })

      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

      if (!supabaseUrl || !supabaseServiceKey) {
        console.error('[CALENDAR-SYNC] Missing Supabase configuration')
        return
      }

      const syncResponse = await fetch(`${supabaseUrl}/functions/v1/google-calendar-sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
          'X-Internal-Call': 'true',
        },
        body: JSON.stringify({
          action: 'incremental-sync',
          syncToken: syncStatus?.calendar_sync_token,
          startDate,
          endDate,
          userId,
        }),
      })

      if (!syncResponse.ok) {
        const errorText = await syncResponse.text()
        let errorData: any = {}
        try {
          errorData = JSON.parse(errorText)
        } catch {
          errorData = { message: errorText }
        }
        console.error('[CALENDAR-SYNC] Sync failed:', {
          status: syncResponse.status,
          statusText: syncResponse.statusText,
          error: errorData
        })
        return
      }

      const syncResult = await syncResponse.json()
      console.log('[CALENDAR-SYNC] Sync completed:', {
        success: syncResult.success,
        stats: syncResult.stats,
        syncToken: syncResult.syncToken ? 'present' : 'missing'
      })
    } else {
      console.log('[CALENDAR-SYNC] Sync not needed, last synced:', syncStatus?.calendar_last_synced_at)
    }
  } catch (error: any) {
    console.error('[CALENDAR-SYNC] Error checking/syncing calendar:', {
      message: error.message,
      stack: error.stack
    })
  }
}

export async function handleCalendarAvailability(args: any, client: any, userId: string): Promise<any> {
  const {
    startDate,
    endDate,
    durationMinutes = 60,
    workingHoursStart = '09:00',
    workingHoursEnd = '17:00',
    excludeWeekends = true
  } = args || {}

  await ensureCalendarSynced(client, userId, startDate, endDate)

  const timezone = await getUserTimezone(client, userId)
  const normalizedDuration = clampDurationMinutes(durationMinutes)
  const safeStartTime = normalizeTimeInput(workingHoursStart, '09:00')
  const safeEndTime = normalizeTimeInput(workingHoursEnd, '17:00')

  const now = new Date()
  const parsedStart = parseDateInput(startDate, now)
  const parsedEnd = parseDateInput(endDate, addDays(parsedStart, 7))

  let rangeStart = startOfZonedDay(parsedStart, timezone)
  let rangeEnd = endOfZonedDay(parsedEnd, timezone)
  const maxRangeDays = 30
  if (rangeEnd.getTime() - rangeStart.getTime() > maxRangeDays * 24 * 60 * 60 * 1000) {
    rangeEnd = endOfZonedDay(addDays(rangeStart, maxRangeDays), timezone)
  }
  if (rangeEnd <= rangeStart) {
    rangeEnd = endOfZonedDay(addDays(rangeStart, 1), timezone)
  }

  console.log('[CALENDAR-AVAILABILITY] Querying events:', {
    userId,
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
    timezone
  })

  const { data: rawEvents, error } = await client
    .from('calendar_events')
    .select(`
      id,
      title,
      start_time,
      end_time,
      location,
      status,
      meeting_url,
      deal_id,
      contact_id,
      attendees:calendar_attendees(name, email)
    `)
    .eq('user_id', userId)
    .lt('start_time', rangeEnd.toISOString())
    .gt('end_time', rangeStart.toISOString())
    .neq('status', 'cancelled')
    .neq('sync_status', 'deleted')
    .order('start_time', { ascending: true })

  if (error) {
    console.error('[CALENDAR-AVAILABILITY] Query error:', error)
    throw new Error(`Failed to read calendar events: ${error.message}`)
  }

  console.log('[CALENDAR-AVAILABILITY] Found events:', {
    count: rawEvents?.length || 0,
    events: rawEvents?.slice(0, 5).map((e: any) => ({
      title: e.title,
      start: e.start_time,
      end: e.end_time
    }))
  })

  let meetingFallbackEvents: any[] = []
  if (!rawEvents || rawEvents.length === 0) {
    const { data: meetingRows, error: meetingError } = await client
      .from('meetings')
      .select(`
        id,
        title,
        meeting_start,
        meeting_end,
        duration_minutes,
        owner_user_id,
        company_id,
        primary_contact_id
      `)
      .eq('owner_user_id', userId)
      .gte('meeting_start', rangeStart.toISOString())
      .lte('meeting_start', rangeEnd.toISOString())

    if (!meetingError && meetingRows && meetingRows.length > 0) {
      meetingFallbackEvents = meetingRows
        .filter(meeting => meeting.meeting_start)
        .map(meeting => {
          const startIso = meeting.meeting_start
          const endIso =
            meeting.meeting_end ||
            (meeting.meeting_start && meeting.duration_minutes
              ? new Date(new Date(meeting.meeting_start).getTime() + meeting.duration_minutes * 60000).toISOString()
              : meeting.meeting_start)

          return {
            id: `meeting-${meeting.id}`,
            title: meeting.title || 'Meeting',
            start_time: startIso,
            end_time: endIso,
            location: null,
            status: 'confirmed',
            meeting_url: null,
            deal_id: meeting.company_id,
            contact_id: meeting.primary_contact_id,
            attendees: [],
            source: 'meetings'
          }
        })
    }
  }

  const combinedEvents = [...(rawEvents || []), ...meetingFallbackEvents]

  const normalizedEvents = combinedEvents
    .map(event => {
      const start = new Date(event.start_time)
      const end = new Date(event.end_time)
      return {
        ...event,
        start,
        end
      }
    })
    .filter(event => !isNaN(event.start.getTime()) && !isNaN(event.end.getTime()))
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  const availabilitySlots: Array<{ start: string; end: string; durationMinutes: number }> = []
  const allSlots: Array<{ start: Date; end: Date; durationMinutes: number; slotType: '60min' | '30min' }> = []

  let dayCursor = new Date(rangeStart)
  while (dayCursor <= rangeEnd) {
    const { weekday } = getZonedDateParts(dayCursor, timezone)
    if (!(excludeWeekends && (weekday === 0 || weekday === 6))) {
      const dayWorkStart = zonedTimeOnDate(dayCursor, safeStartTime, timezone)
      let dayWorkEnd = zonedTimeOnDate(dayCursor, safeEndTime, timezone)
      if (dayWorkEnd <= dayWorkStart) {
        dayWorkEnd = addMinutes(dayWorkStart, 8 * 60)
      }

      const overlappingEvents = normalizedEvents
        .map(event => ({
          start: new Date(Math.max(event.start.getTime(), dayWorkStart.getTime())),
          end: new Date(Math.min(event.end.getTime(), dayWorkEnd.getTime()))
        }))
        .filter(interval => interval.end > interval.start)

      const mergedBusy = mergeIntervals(overlappingEvents)

      const freeSlots60 = calculateFreeSlotsForDay(dayWorkStart, dayWorkEnd, mergedBusy, 60)
      const freeSlots30 = calculateFreeSlotsForDay(dayWorkStart, dayWorkEnd, mergedBusy, 30)

      for (const slot of freeSlots60) {
        allSlots.push({ ...slot, slotType: '60min' })
      }

      for (const slot30 of freeSlots30) {
        const overlapsWithSlot60 = freeSlots60.some(slot60 =>
          slot30.start.getTime() === slot60.start.getTime()
        )
        if (!overlapsWithSlot60 && slot30.durationMinutes < 60) {
          allSlots.push({ ...slot30, slotType: '30min' })
        }
      }
    }

    dayCursor = addDays(dayCursor, 1)
  }

  allSlots.sort((a, b) => a.start.getTime() - b.start.getTime())

  const totalFreeMinutes = allSlots.reduce((sum, slot) => sum + slot.durationMinutes, 0)
  const totalBusyMinutes = normalizedEvents.reduce((sum, event) => {
    const diff = Math.max(0, event.end.getTime() - event.start.getTime())
    return sum + diff / 60000
  }, 0)

  for (const slot of allSlots.slice(0, 25)) {
    availabilitySlots.push({
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
      durationMinutes: slot.durationMinutes
    })
  }

  const busySlots = normalizedEvents.map(event => ({
    id: event.id,
    title: event.title || 'Busy',
    start: event.start.toISOString(),
    end: event.end.toISOString()
  }))

  return {
    success: true,
    availableSlots: availabilitySlots,
    totalAvailableSlots: allSlots.length,
    busySlots,
    events: combinedEvents,
    summary: {
      totalFreeMinutes,
      totalBusyMinutes,
      totalFreeHours: Number((totalFreeMinutes / 60).toFixed(1)),
      totalBusyHours: Number((totalBusyMinutes / 60).toFixed(1)),
      meetingCount: normalizedEvents.length
    },
    range: {
      start: rangeStart.toISOString(),
      end: rangeEnd.toISOString()
    },
    timezone,
    durationMinutes: normalizedDuration,
    workingHours: {
      start: safeStartTime,
      end: safeEndTime
    },
    excludeWeekends: !!excludeWeekends
  }
}

// ---------------------------------------------------------------------------
// Contact resolution
// ---------------------------------------------------------------------------

export async function resolveContactReference(
  client: any,
  userId: string,
  userMessage: string,
  context?: ChatRequestContext
): Promise<ContactResolutionResult> {
  let contact: ContactData | null = null
  let contactEmail: string | null = null
  let contactName: string | null = null
  let searchTerm: string | null = null

  if (context?.contactId && isValidUUID(context.contactId)) {
    const { data } = await client
      .from('contacts')
      .select('id, first_name, last_name, full_name, email, company_id, companies:company_id(id, name)')
      .eq('id', context.contactId)
      .eq('owner_id', userId)
      .maybeSingle()
    if (data) {
      contact = data as ContactData
    }
  }

  const emailPattern = /[\w\.-]+@[\w\.-]+\.\w+/
  const emailMatch = userMessage.match(emailPattern)
  if (emailMatch) {
    contactEmail = emailMatch[0].toLowerCase()
    if (!contact) {
      const { data } = await client
        .from('contacts')
        .select('id, first_name, last_name, full_name, email, company_id, companies:company_id(id, name)')
        .eq('email', contactEmail)
        .eq('owner_id', userId)
        .maybeSingle()
      if (data) {
        contact = data as ContactData
      }
    }
  }

  if (!contact) {
    const { nameCandidate, companyCandidate } = extractNameAndCompanyFromMessage(userMessage)
    if (nameCandidate) {
      searchTerm = nameCandidate
      let contactsQuery = client
        .from('contacts')
        .select('id, first_name, last_name, full_name, email, company_id, companies:company_id(id, name)')
        .eq('owner_id', userId)
      const nameParts = nameCandidate.split(/\s+/).filter(Boolean)
      if (nameParts.length > 1) {
        const first = nameParts[0]
        const last = nameParts.slice(1).join(' ')
        contactsQuery = contactsQuery.or(`full_name.ilike.%${nameCandidate}%,first_name.ilike.%${first}%,last_name.ilike.%${last}%`)
      } else {
        contactsQuery = contactsQuery.or(`first_name.ilike.%${nameCandidate}%,full_name.ilike.%${nameCandidate}%`)
      }
      if (companyCandidate) {
        contactsQuery = contactsQuery.ilike('companies.name', `%${companyCandidate}%`)
      }
      const { data: contacts } = await contactsQuery.limit(5)
      if (contacts && contacts.length > 0) {
        contact = contacts[0] as ContactData
      }
    }
  }

  if (contact && contact.email) {
    contactEmail = contact.email
  }

  if (!contactName) {
    contactName = contact?.full_name || `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim() || searchTerm || contactEmail
  }

  return {
    contact,
    contactEmail,
    contactName,
    searchTerm
  }
}

// ---------------------------------------------------------------------------
// Helper structuring functions (extracted from api-copilot/index.ts)
// Each function builds a rich structured response for a specific intent.
// ---------------------------------------------------------------------------

/**
 * Structure activity creation response with contact search
 */
export async function structureActivityCreationResponse(
  client: any,
  userId: string,
  userMessage: string,
  activityType: 'proposal' | 'meeting' | 'sale' | 'outbound'
): Promise<any> {
  try {
    // Extract contact name from message
    // Patterns: "add proposal for Paul Lima", "create meeting with John Smith", etc.
    const namePatterns = [
      /(?:for|with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /([A-Z][a-z]+\s+[A-Z][a-z]+)/, // Full name pattern
      /(?:proposal|meeting|sale|outbound)\s+(?:for|with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i
    ]

    let contactName: string | null = null
    for (const pattern of namePatterns) {
      const match = userMessage.match(pattern)
      if (match && match[1]) {
        contactName = match[1].trim()
        break
      }
    }

    // Extract date information
    const todayPattern = /(?:for|on)\s+(?:today|now)/i
    const tomorrowPattern = /(?:for|on)\s+tomorrow/i
    const datePattern = /(?:for|on)\s+(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)/i

    let activityDate: string | null = null
    if (todayPattern.test(userMessage)) {
      activityDate = new Date().toISOString()
    } else if (tomorrowPattern.test(userMessage)) {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      activityDate = tomorrow.toISOString()
    } else if (datePattern.test(userMessage)) {
      const dateMatch = userMessage.match(datePattern)
      if (dateMatch && dateMatch[1]) {
        // Try to parse the date
        const parsedDate = new Date(dateMatch[1])
        if (!isNaN(parsedDate.getTime())) {
          activityDate = parsedDate.toISOString()
        }
      }
    }

    // If no date specified, default to today
    if (!activityDate) {
      activityDate = new Date().toISOString()
    }

    // If no contact name found, return contact selection response
    if (!contactName) {
      return {
        type: 'contact_selection',
        summary: `I'd like to help you create a ${activityType}. Please select the contact:`,
        data: {
          activityType,
          activityDate,
          requiresContactSelection: true,
          prefilledName: '',
          prefilledEmail: ''
        },
        actions: [],
        metadata: {
          timeGenerated: new Date().toISOString(),
          dataSource: ['user_message']
        }
      }
    }

    // Search for contacts matching the name
    const nameParts = contactName.split(/\s+/)
    const firstName = nameParts[0] || ''
    const lastName = nameParts.slice(1).join(' ') || ''

    // Build search query
    let contactsQuery = client
      .from('contacts')
      .select('id, first_name, last_name, full_name, email, company_id, companies:company_id(id, name)')
      .eq('owner_id', userId)

    // Search by first and last name
    if (firstName && lastName) {
      contactsQuery = contactsQuery.or(`first_name.ilike.%${firstName}%,last_name.ilike.%${lastName}%,full_name.ilike.%${contactName}%`)
    } else if (firstName) {
      contactsQuery = contactsQuery.or(`first_name.ilike.%${firstName}%,full_name.ilike.%${firstName}%`)
    } else {
      // If no name parts, search by full name
      contactsQuery = contactsQuery.ilike('full_name', `%${contactName}%`)
    }

    const { data: contacts, error: contactsError } = await contactsQuery.limit(10)

    if (contactsError) {
      console.error('Error searching contacts:', contactsError)
      // Return contact selection response on error
      return {
        type: 'contact_selection',
        summary: `I'd like to help you create a ${activityType} for ${contactName}. Please select the contact:`,
        data: {
          activityType,
          activityDate,
          requiresContactSelection: true,
          prefilledName: contactName,
          prefilledEmail: ''
        },
        actions: [],
        metadata: {
          timeGenerated: new Date().toISOString(),
          dataSource: ['user_message']
        }
      }
    }

    // If no contacts found or multiple contacts found, return contact selection response
    if (!contacts || contacts.length === 0 || contacts.length > 1) {
      return {
        type: 'contact_selection',
        summary: contacts && contacts.length > 1
          ? `I found ${contacts.length} contacts matching "${contactName}". Please select the correct one:`
          : `I couldn't find a contact matching "${contactName}". Please select or create a contact:`,
        data: {
          activityType,
          activityDate,
          requiresContactSelection: true,
          prefilledName: contactName,
          prefilledEmail: '',
          suggestedContacts: contacts || []
        },
        actions: [],
        metadata: {
          timeGenerated: new Date().toISOString(),
          dataSource: ['contacts_search'],
          matchCount: contacts?.length || 0
        }
      }
    }

    // Single contact found - return success response with contact info
    const contact = contacts[0]
    return {
      type: 'activity_creation',
      summary: `I found ${contact.full_name || `${contact.first_name} ${contact.last_name}`.trim()}. Ready to create the ${activityType}.`,
      data: {
        activityType,
        activityDate,
        contact: {
          id: contact.id,
          name: contact.full_name || `${contact.first_name} ${contact.last_name}`.trim(),
          email: contact.email,
          company: contact.companies?.name || null,
          companyId: contact.company_id || null
        },
        requiresContactSelection: false
      },
      actions: [
        {
          id: 'create-activity',
          label: `Create ${activityType.charAt(0).toUpperCase() + activityType.slice(1)}`,
          type: 'primary',
          callback: 'create_activity',
          params: {
            type: activityType,
            date: activityDate,
            contactId: contact.id
          }
        }
      ],
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: ['contacts_search'],
        matchCount: 1
      }
    }
  } catch (error) {
    console.error('Error in structureActivityCreationResponse:', error)
    // Return contact selection response on error
    return {
      type: 'contact_selection',
      summary: `I'd like to help you create a ${activityType}. Please select the contact:`,
      data: {
        activityType,
        activityDate: new Date().toISOString(),
        requiresContactSelection: true,
        prefilledName: '',
        prefilledEmail: ''
      },
      actions: [],
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: ['error_fallback']
      }
    }
  }
}

export async function structureEmailDraftResponse(
  client: any,
  userId: string,
  userMessage: string,
  aiContent: string,
  context: any
): Promise<any> {
  try {
    console.log('[EMAIL-DRAFT] Structuring email draft response for:', userMessage)

    // Detect if user wants email based on their last meeting
    const hasLastMeetingReference =
      /last meeting|recent meeting|recent call|today'?s meeting|our meeting|our call|the meeting|my meeting/i.test(userMessage)

    console.log('[EMAIL-DRAFT] Has last meeting reference:', hasLastMeetingReference)

    // Extract contact/recipient information from message
    const namePatterns = [
      /(?:email|write|draft|send).*(?:to|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /follow[- ]?up.*(?:with|to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*(?:'s|about|regarding)/i
    ]

    let recipientName: string | null = null
    for (const pattern of namePatterns) {
      const match = userMessage.match(pattern)
      if (match && match[1]) {
        recipientName = match[1].trim()
        break
      }
    }

    // Search for matching contact
    let contact: any = null
    let contactEmail: string | null = null
    let companyName: string | null = null

    if (recipientName) {
      const nameParts = recipientName.split(/\s+/)
      const firstName = nameParts[0] || ''
      const lastName = nameParts.slice(1).join(' ') || ''

      let contactsQuery = client
        .from('contacts')
        .select('id, first_name, last_name, full_name, email, company_id, companies:company_id(id, name)')
        .eq('owner_id', userId)

      if (firstName && lastName) {
        contactsQuery = contactsQuery.or(`first_name.ilike.%${firstName}%,last_name.ilike.%${lastName}%,full_name.ilike.%${recipientName}%`)
      } else if (firstName) {
        contactsQuery = contactsQuery.or(`first_name.ilike.%${firstName}%,full_name.ilike.%${firstName}%`)
      }

      const { data: contacts } = await contactsQuery.limit(1)

      if (contacts && contacts.length > 0) {
        contact = contacts[0]
        contactEmail = contact.email
        companyName = contact.companies?.name || null
        recipientName = contact.full_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim()
      }
    }

    // If user references "last meeting", fetch it with transcript/summary
    let lastMeeting: any = null
    if (hasLastMeetingReference) {
      console.log('[EMAIL-DRAFT] Fetching last meeting with transcript for user:', userId)

      // First try: Look for meetings with transcript/summary (no date filter - get most recent)
      const { data: meetings, error: meetingError } = await client
        .from('meetings')
        .select(`
          id, title, summary, transcript_text, meeting_start,
          meeting_action_items(id, title, completed),
          meeting_attendees(name, email, is_external)
        `)
        .eq('owner_user_id', userId)
        .or('transcript_text.not.is.null,summary.not.is.null')
        .order('meeting_start', { ascending: false })
        .limit(5)

      if (meetingError) {
        console.error('[EMAIL-DRAFT] Error fetching last meeting:', meetingError)
      } else if (meetings && meetings.length > 0) {
        // Pick the first meeting that actually has content
        lastMeeting = meetings.find((m: any) => m.transcript_text || m.summary) || meetings[0]
        console.log('[EMAIL-DRAFT] Found last meeting:', lastMeeting.title, '- Has summary:', !!lastMeeting.summary, '- Has transcript:', !!lastMeeting.transcript_text, '- Date:', lastMeeting.meeting_start)
      } else {
        // Fallback: Get ANY recent meeting even without transcript/summary
        console.log('[EMAIL-DRAFT] No meetings with content, trying any recent meeting...')
        const { data: anyMeetings } = await client
          .from('meetings')
          .select(`
            id, title, summary, transcript_text, meeting_start,
            meeting_action_items(id, title, completed),
            meeting_attendees(name, email, is_external)
          `)
          .eq('owner_user_id', userId)
          .order('meeting_start', { ascending: false })
          .limit(1)
        
        if (anyMeetings && anyMeetings.length > 0) {
          lastMeeting = anyMeetings[0]
          console.log('[EMAIL-DRAFT] Using most recent meeting (no content):', lastMeeting.title)
        }
      }
      
      // Process attendees if we found a meeting
      if (lastMeeting) {
        console.log('[EMAIL-DRAFT] Processing meeting:', lastMeeting?.title, '- Has summary:', !!lastMeeting?.summary, '- Has transcript:', !!lastMeeting?.transcript_text)
        console.log('[EMAIL-DRAFT] Meeting attendees:', JSON.stringify(lastMeeting.meeting_attendees))

        // For "last meeting" requests, ALWAYS use meeting attendee as recipient (overwrite any previous)
        if (lastMeeting.meeting_attendees?.length > 0) {
          // First try to find explicitly marked external attendee
          let targetAttendee = lastMeeting.meeting_attendees.find((a: any) => a.is_external === true)

          // If no external flag, find any attendee with an email that looks external
          if (!targetAttendee) {
            // Get user's email to exclude them
            const { data: userProfile } = await client
              .from('profiles')
              .select('email')
              .eq('id', userId)
              .maybeSingle()

            const userEmail = userProfile?.email?.toLowerCase() || ''

            // Find first attendee that isn't the user
            targetAttendee = lastMeeting.meeting_attendees.find((a: any) =>
              a.email && a.email.toLowerCase() !== userEmail
            )

            console.log('[EMAIL-DRAFT] No is_external flag, searching for non-user attendee. User email:', userEmail)
          }

          if (targetAttendee && targetAttendee.email) {
            recipientName = targetAttendee.name || recipientName
            contactEmail = targetAttendee.email
            console.log('[EMAIL-DRAFT] Using meeting attendee as recipient:', recipientName, contactEmail)
          } else {
            console.log('[EMAIL-DRAFT] No suitable attendee found with email')
          }
        }
      } else {
        console.log('[EMAIL-DRAFT] No meetings found with transcript or summary')
      }
    }

    // Get last interaction with this contact if we found one
    let lastInteraction = 'No previous interaction recorded'
    let lastInteractionDate = ''

    // If we found a meeting via "last meeting" reference, use that as last interaction
    if (lastMeeting) {
      const meetingTitle = lastMeeting.title || 'Recent meeting'
      const meetingDate = lastMeeting.meeting_start
        ? new Date(lastMeeting.meeting_start).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
        : 'recently'
      lastInteraction = `Meeting: ${meetingTitle} (${meetingDate})`
      lastInteractionDate = lastMeeting.meeting_start
    }

    if (contact?.id) {
      // Check for recent meetings
      const { data: recentMeetings } = await client
        .from('meetings')
        .select('id, title, start_time')
        .eq('owner_user_id', userId)
        .contains('attendee_emails', contact.email ? [contact.email] : [])
        .order('start_time', { ascending: false })
        .limit(1)

      if (recentMeetings && recentMeetings.length > 0) {
        const meeting = recentMeetings[0]
        lastInteraction = `Meeting: ${meeting.title}`
        lastInteractionDate = meeting.start_time
      }

      // Check for recent activities/communications
      const { data: recentActivities } = await client
        .from('activities')
        .select('id, type, notes, created_at')
        .eq('user_id', userId)
        .eq('contact_id', contact.id)
        .order('created_at', { ascending: false })
        .limit(1)

      if (recentActivities && recentActivities.length > 0) {
        const activity = recentActivities[0]
        if (!lastInteractionDate || new Date(activity.created_at) > new Date(lastInteractionDate)) {
          lastInteraction = `${activity.type}: ${activity.notes?.substring(0, 50) || 'No details'}...`
          lastInteractionDate = activity.created_at
        }
      }
    }

    // Determine email tone
    let tone: 'professional' | 'friendly' | 'concise' = 'professional'
    if (/casual|friendly|informal/i.test(userMessage)) {
      tone = 'friendly'
    } else if (/brief|short|quick|concise/i.test(userMessage)) {
      tone = 'concise'
    }

    // Determine email purpose and generate subject/body
    let subject = 'Following up'
    let body = ''
    let keyPoints: string[] = []

    const isFollowUp = /follow[- ]?up/i.test(userMessage)
    const isMeetingRelated = /meeting|call|chat|discuss/i.test(userMessage)
    const isProposalRelated = /proposal|quote|pricing|offer/i.test(userMessage)

    // Helper function to extract key points from meeting
    const extractMeetingKeyPoints = (meeting: any): string[] => {
      const points: string[] = []

      // From summary - handle JSON format with markdown_formatted field
      if (meeting.summary) {
        let summaryText = meeting.summary

        // Try to parse as JSON if it looks like JSON
        if (typeof summaryText === 'string' && (summaryText.startsWith('{') || summaryText.startsWith('{'))) {
          try {
            const parsed = JSON.parse(summaryText)
            summaryText = parsed.markdown_formatted || parsed.summary || summaryText
          } catch (e) {
            // Not JSON, use as-is
            console.log('[EMAIL-DRAFT] Summary is not JSON, using raw text')
          }
        } else if (typeof summaryText === 'object' && summaryText.markdown_formatted) {
          summaryText = summaryText.markdown_formatted
        }

        // Extract key takeaways section if present
        const keyTakeawaysMatch = summaryText.match(/##\s*Key\s*Takeaways?\s*\n([\s\S]*?)(?=\n##|$)/i)
        if (keyTakeawaysMatch) {
          const takeawaysSection = keyTakeawaysMatch[1]
          // Extract bullet points, clean markdown links and formatting
          const bulletPoints = takeawaysSection
            .split('\n')
            .filter((l: string) => l.trim().match(/^[-*]\s+/))
            .map((l: string) => {
              // Remove bullet, links [text](url), and bold **text**
              return l
                .replace(/^[-*]\s+/, '')
                .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
                .replace(/\*\*([^*]+)\*\*/g, '$1')
                .replace(/^\*\*([^:]+):\*\*\s*/, '')
                .trim()
            })
            .filter((l: string) => l.length > 10 && l.length < 200)
            .slice(0, 4)
          points.push(...bulletPoints)
        }

        // Fallback: extract from Next Steps section
        if (points.length === 0) {
          const nextStepsMatch = summaryText.match(/##\s*Next\s*Steps?\s*\n([\s\S]*?)(?=\n##|$)/i)
          if (nextStepsMatch) {
            const stepsSection = nextStepsMatch[1]
            const stepPoints = stepsSection
              .split('\n')
              .filter((l: string) => l.trim().match(/^[-*]\s+/))
              .map((l: string) => l.replace(/^[-*]\s+/, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').trim())
              .filter((l: string) => l.length > 10 && l.length < 200)
              .slice(0, 3)
            points.push(...stepPoints)
          }
        }

        // Last fallback: extract Meeting Purpose
        if (points.length === 0) {
          const purposeMatch = summaryText.match(/##\s*Meeting\s*Purpose\s*\n([\s\S]*?)(?=\n##|$)/i)
          if (purposeMatch) {
            const purpose = purposeMatch[1]
              .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
              .replace(/\*\*([^*]+)\*\*/g, '$1')
              .trim()
            if (purpose.length > 10 && purpose.length < 200) {
              points.push(purpose)
            }
          }
        }

        console.log('[EMAIL-DRAFT] Extracted key points from summary:', points.length)
      }

      // From action items - include uncompleted ones
      if (meeting.meeting_action_items?.length > 0) {
        const actionItems = meeting.meeting_action_items
          .filter((item: any) => !item.completed)
          .slice(0, 3)
          .map((item: any) => item.title)
        points.push(...actionItems)
      }

      return points.length > 0 ? points : ['Discuss next steps', 'Review key decisions']
    }

    // Fetch user's writing style for personalized email generation
    const { data: writingStyle } = await client
      .from('user_writing_styles')
      .select('name, tone_description, examples, style_metadata')
      .eq('user_id', userId)
      .eq('is_default', true)
      .maybeSingle()
    
    // Fetch user's name for email signature
    const { data: userProfile } = await client
      .from('profiles')
      .select('first_name, last_name, email')
      .eq('id', userId)
      .maybeSingle()
    
    const userName = userProfile 
      ? `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim() || userProfile.email?.split('@')[0] || 'Your Name'
      : 'Your Name'
    
    console.log('[EMAIL-DRAFT] User writing style found:', !!writingStyle, writingStyle?.name)
    console.log('[EMAIL-DRAFT] User name for signature:', userName)

    // Generate email based on meeting context if available
    if ((isFollowUp || hasLastMeetingReference) && lastMeeting && (lastMeeting.summary || lastMeeting.transcript_text)) {
      // USE AI to generate a proper email based on meeting content and user's writing style
      console.log('[EMAIL-DRAFT] Generating AI email from meeting transcript/summary')
      
      const meetingTitle = lastMeeting.title || 'our recent conversation'
      const meetingDate = lastMeeting.meeting_start
        ? new Date(lastMeeting.meeting_start).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
        : 'recently'

      keyPoints = extractMeetingKeyPoints(lastMeeting)
      
      // Get uncompleted action items
      const uncompletedActions = lastMeeting.meeting_action_items?.filter((a: any) => !a.completed) || []
      
      // Build style instruction from user's writing style
      let styleInstruction = 'Write in a professional but warm and personable tone.'
      if (writingStyle) {
        const styleParts: string[] = []
        styleParts.push(`\n## USER'S PERSONAL WRITING STYLE - YOU MUST MATCH THIS EXACTLY`)
        styleParts.push(`Style: ${writingStyle.name}`)
        styleParts.push(`Tone: ${writingStyle.tone_description}`)
        
        const meta = writingStyle.style_metadata as any
        if (meta?.tone_characteristics) {
          styleParts.push(`Characteristics: ${meta.tone_characteristics}`)
        }
        if (meta?.vocabulary_profile) {
          styleParts.push(`Vocabulary: ${meta.vocabulary_profile}`)
        }
        if (meta?.greeting_style) {
          styleParts.push(`Greeting style: Use "${meta.greeting_style}" style greetings`)
        }
        if (meta?.signoff_style) {
          styleParts.push(`Sign-off style: Use "${meta.signoff_style}" style sign-offs`)
        }
        
        if (writingStyle.examples && Array.isArray(writingStyle.examples) && writingStyle.examples.length > 0) {
          const snippets = (writingStyle.examples as string[]).slice(0, 2).map((ex: string) => 
            ex.length > 200 ? ex.substring(0, 200) + '...' : ex
          )
          styleParts.push(`\nEXAMPLES OF HOW THIS USER WRITES:\n${snippets.map((s: string) => `"${s}"`).join('\n')}`)
        }
        
        styleParts.push(`\n**CRITICAL: The email MUST sound like this user wrote it. Copy their vocabulary, greeting style, sign-off patterns, and overall tone exactly.**`)
        styleInstruction = styleParts.join('\n')
      }

      // Get current date for accurate date references
      const today = new Date()
      const currentDateStr = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

      // Prepare meeting content - prefer transcript but use summary as fallback
      let meetingContent = ''
      if (lastMeeting.transcript_text) {
        // Truncate transcript if too long (keep first 3000 chars for context)
        const transcript = lastMeeting.transcript_text.length > 3000 
          ? lastMeeting.transcript_text.substring(0, 3000) + '... [transcript truncated]'
          : lastMeeting.transcript_text
        meetingContent = `MEETING TRANSCRIPT:\n${transcript}`
      } else if (lastMeeting.summary) {
        let summaryText = lastMeeting.summary
        if (typeof summaryText === 'object' && summaryText.markdown_formatted) {
          summaryText = summaryText.markdown_formatted
        } else if (typeof summaryText === 'string' && summaryText.startsWith('{')) {
          try {
            const parsed = JSON.parse(summaryText)
            summaryText = parsed.markdown_formatted || parsed.summary || summaryText
          } catch (e) {
            // Use as-is
          }
        }
        meetingContent = `MEETING SUMMARY:\n${summaryText}`
      }

      // Adjust tone based on user's base style
      let toneAdjustment = ''
      if (tone === 'friendly') {
        toneAdjustment = `\nTONE ADJUSTMENT: Make this email slightly MORE casual and warm than the user's normal style. Add a friendly touch while keeping their voice.`
      } else if (tone === 'concise') {
        toneAdjustment = `\nTONE ADJUSTMENT: Make this email MORE brief and direct than the user's normal style. Cut any fluff, keep only essentials.`
      } else if (tone === 'professional') {
        toneAdjustment = `\nTONE ADJUSTMENT: Make this email slightly MORE formal than the user's normal style. Keep it polished and business-appropriate.`
      }

      const prompt = `You are writing a follow-up email after a meeting. Generate a personalized, context-aware email.

TODAY'S DATE: ${currentDateStr}

SENDER NAME: ${userName}
RECIPIENT: ${recipientName || 'the attendee'}
RECIPIENT EMAIL: ${contactEmail || 'unknown'}
MEETING TITLE: ${meetingTitle}
MEETING DATE: ${meetingDate}

${meetingContent}

${uncompletedActions.length > 0 ? `AGREED ACTION ITEMS:\n${uncompletedActions.map((a: any) => `- ${a.title}`).join('\n')}` : ''}

${styleInstruction}
${toneAdjustment}

INSTRUCTIONS:
1. Write a follow-up email that references SPECIFIC things discussed in the meeting
2. Mention any action items or next steps that were agreed upon
3. Be concise (2-3 paragraphs max)
4. Sound natural and human - NOT like a template
5. Include specific details from the conversation to show you were paying attention
6. Propose a clear next step
7. Sign off with the sender's actual name: "${userName}"

Return ONLY a JSON object in this exact format (no markdown, no code blocks):
{"subject": "Your subject line here", "body": "Full email body here"}

The body MUST include proper greeting and sign off with "${userName}" (not "[Your Name]" or placeholders).`

      try {
        // Use Gemini for email generation
        if (GEMINI_API_KEY) {
          console.log('[EMAIL-DRAFT] Calling Gemini to generate personalized email...')
          const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                  temperature: 0.7,
                  maxOutputTokens: 1000,
                  responseMimeType: 'application/json'
                }
              })
            }
          )

          if (geminiResponse.ok) {
            const geminiData = await geminiResponse.json()
            const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || ''
            console.log('[EMAIL-DRAFT] Gemini response received, length:', responseText.length)
            
            try {
              const emailJson = JSON.parse(responseText)
              if (emailJson.subject && emailJson.body) {
                subject = emailJson.subject
                body = emailJson.body
                console.log('[EMAIL-DRAFT] ✅ AI-generated email parsed successfully')
              }
            } catch (parseError) {
              console.error('[EMAIL-DRAFT] Failed to parse Gemini response:', parseError)
              // Try to extract JSON from response
              const jsonMatch = responseText.match(/\{[\s\S]*\}/)
              if (jsonMatch) {
                try {
                  const emailJson = JSON.parse(jsonMatch[0])
                  if (emailJson.subject && emailJson.body) {
                    subject = emailJson.subject
                    body = emailJson.body
                    console.log('[EMAIL-DRAFT] ✅ AI-generated email extracted from response')
                  }
                } catch (e) {
                  console.error('[EMAIL-DRAFT] Could not extract JSON from response')
                }
              }
            }
          } else {
            console.error('[EMAIL-DRAFT] Gemini API error:', geminiResponse.status)
          }
        }
      } catch (aiError) {
        console.error('[EMAIL-DRAFT] AI email generation failed:', aiError)
      }

      // Fallback if AI generation failed
      if (!body || body.includes('[Add key')) {
        console.log('[EMAIL-DRAFT] Using fallback template with meeting context')
        let discussionPoints = ''
        if (keyPoints.length > 0) {
          discussionPoints = `\n\nKey points from our discussion:\n${keyPoints.map(p => `• ${p}`).join('\n')}`
        }

        let actionItemsSection = ''
        if (uncompletedActions.length > 0) {
          actionItemsSection = `\n\nAs discussed, here are the action items we agreed on:\n${uncompletedActions.slice(0, 4).map((a: any) => `• ${a.title}`).join('\n')}`
        }

        subject = `Following up on ${meetingTitle}`
        body = `Hi ${recipientName || '[Name]'},

Thank you for taking the time to meet with me on ${meetingDate}. I wanted to follow up on our conversation about ${meetingTitle.replace(/^Meeting with /i, '').replace(/^Call with /i, '')}.${discussionPoints}${actionItemsSection}

Please let me know if you have any questions or if there's anything else I can help with.

Best regards`
      }

      console.log('[EMAIL-DRAFT] Generated email from meeting context:', { meetingTitle, keyPointsCount: keyPoints.length, hasActionItems: uncompletedActions.length > 0, usedAI: !body.includes('Best regards') || body.length > 500 })
    } else if (isFollowUp && isMeetingRelated) {
      // No meeting found - try harder to find ANY recent meeting
      console.log('[EMAIL-DRAFT] No meeting with content found, trying broader search...')
      
      const { data: anyMeetings } = await client
        .from('meetings')
        .select('id, title, summary, transcript_text, meeting_start')
        .eq('owner_user_id', userId)
        .order('meeting_start', { ascending: false })
        .limit(5)
      
      console.log('[EMAIL-DRAFT] Broader search found meetings:', anyMeetings?.length || 0)
      if (anyMeetings) {
        anyMeetings.forEach((m: any) => {
          console.log('[EMAIL-DRAFT] - Meeting:', m.title, 'has_summary:', !!m.summary, 'has_transcript:', !!m.transcript_text)
        })
      }

      // Fallback if no meeting found but user mentioned meeting
      subject = `Following up on our recent conversation`
      keyPoints = ['Thank them for their time', 'Recap key discussion points', 'Outline next steps']
      body = `Hi ${recipientName || '[Name]'},

Thank you for taking the time to speak with me recently. I wanted to follow up on our conversation and ensure we're aligned on the next steps.

I'd love to hear your thoughts on what we discussed. Please let me know if you have any questions or if there's anything else I can help with.

Best regards`
    } else if (isFollowUp && isProposalRelated) {
      subject = `Following up on our proposal`
      keyPoints = ['Reference the proposal', 'Ask if they have questions', 'Offer to discuss further']
      body = `Hi ${recipientName || '[Name]'},

I wanted to follow up on the proposal I sent over. I hope you've had a chance to review it.

Please let me know if you have any questions or would like to discuss any aspect of the proposal in more detail.

Looking forward to hearing from you.

Best regards`
    } else if (isFollowUp) {
      subject = `Following up`
      keyPoints = ['Reference last interaction', 'State purpose clearly', 'Include call to action']
      body = `Hi ${recipientName || '[Name]'},

I hope this message finds you well. I wanted to follow up on our previous conversation.

[Add context from your last interaction]

Would you have time for a quick call this week to discuss further?

Best regards`
    } else {
      subject = 'Reaching out'
      keyPoints = ['Introduce yourself/purpose', 'Provide value proposition', 'Clear call to action']
      body = `Hi ${recipientName || '[Name]'},

I hope this email finds you well.

[State your purpose for reaching out]

I'd love to schedule a brief call to discuss how we might be able to help.

Best regards`
    }

    // Calculate best send time (business hours, avoid Monday morning and Friday afternoon)
    const now = new Date()
    let sendTime = new Date()
    const hour = now.getHours()
    const day = now.getDay()

    // If it's outside business hours, suggest next business day at 9am
    if (hour < 9 || hour > 17 || day === 0 || day === 6) {
      sendTime.setDate(sendTime.getDate() + (day === 6 ? 2 : day === 0 ? 1 : 0))
      sendTime.setHours(9, 0, 0, 0)
    } else {
      // Suggest sending in 30 minutes
      sendTime.setMinutes(sendTime.getMinutes() + 30)
    }

    const response = {
      type: 'email',
      summary: recipientName
        ? `Here's a draft email for ${recipientName}. Review and customize before sending.`
        : `Here's a draft email. Add recipient details and customize before sending.`,
      data: {
        email: {
          to: contactEmail ? [contactEmail] : [],
          cc: [],
          subject,
          body,
          tone,
          sendTime: sendTime.toISOString()
        },
        context: {
          contactName: recipientName || 'Unknown',
          lastInteraction,
          lastInteractionDate: lastInteractionDate || new Date().toISOString(),
          dealValue: undefined,
          keyPoints,
          warnings: recipientName ? undefined : ['No recipient specified - please add email address']
        },
        suggestions: [
          {
            label: 'Make it shorter',
            action: 'shorten' as const,
            description: 'Condense the email to key points only'
          },
          {
            label: 'Change tone to friendly',
            action: 'change_tone' as const,
            description: 'Make the email more casual and approachable'
          },
          {
            label: 'Add calendar link',
            action: 'add_calendar_link' as const,
            description: 'Include a scheduling link for easy booking'
          }
        ]
      },
      actions: [
        {
          label: 'Send Email',
          type: 'send_email',
          primary: true,
          disabled: !contactEmail
        },
        {
          label: 'Edit in Gmail',
          type: 'edit_in_gmail',
          href: contactEmail ? `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(contactEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : undefined
        },
        {
          label: 'Copy to Clipboard',
          type: 'copy_email'
        }
      ],
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: contact ? ['contacts', 'meetings', 'activities'] : ['user_message'],
        contactId: contact?.id,
        recipientEmail: contactEmail
      }
    }

    console.log('[EMAIL-DRAFT] Generated email response for:', recipientName || 'unknown recipient')
    return response

  } catch (error) {
    console.error('[EMAIL-DRAFT] Error structuring email draft:', error)
    // Return a basic email template on error
    return {
      type: 'email',
      summary: 'Here\'s a draft email template. Customize it for your needs.',
      data: {
        email: {
          to: [],
          subject: 'Following up',
          body: `Hi [Name],

I hope this message finds you well. I wanted to follow up on our previous conversation.

[Add your message here]

Best regards`,
          tone: 'professional' as const
        },
        context: {
          contactName: 'Unknown',
          lastInteraction: 'Unable to retrieve',
          lastInteractionDate: new Date().toISOString(),
          keyPoints: ['Add recipient', 'Customize message', 'Review before sending'],
          warnings: ['Could not load contact information']
        },
        suggestions: []
      },
      actions: [],
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: ['error_fallback']
      }
    }
  }
}

/**
 * Structure task creation response with contact search
 */
export async function structureTaskCreationResponse(
  client: any,
  userId: string,
  userMessage: string
): Promise<any> {
  try {
    // Extract task title/description from message
    // Patterns: "create a task to follow up with Paul", "remind me to call John", etc.
    const taskTitlePatterns = [
      /(?:create|add|new|set).*task.*(?:to|for|about)\s+(.+)/i,
      /remind\s+me\s+(?:to\s+)?(?:follow\s+up\s+)?(?:with\s+)?(.+)/i,
      /remind\s+(?:me\s+)?(?:to\s+)?(?:follow\s+up\s+)?(?:with\s+)?(.+)/i,
      /task\s+to\s+(.+)/i,
      /follow\s+up\s+(?:with\s+)?(.+)/i,
      /follow-up\s+(?:with\s+)?(.+)/i,
      /(?:call|email|meet|contact|reach out to)\s+(.+)/i
    ]
    
    let taskTitle: string | null = null
    for (const pattern of taskTitlePatterns) {
      const match = userMessage.match(pattern)
      if (match && match[1]) {
        taskTitle = match[1].trim()
        // Remove date/time references and common phrases from title
        taskTitle = taskTitle
          .replace(/\s+(?:tomorrow|today|next week|in \d+ days?|on \w+day).*$/i, '')
          .replace(/\s+about\s+the\s+proposal.*$/i, '')
          .replace(/\s+regarding.*$/i, '')
          .trim()
        break
      }
    }
    
    // If no title found, try to extract from "remind me to [action]"
    if (!taskTitle) {
      const remindMatch = userMessage.match(/remind\s+me\s+(?:to\s+)?(.+?)(?:\s+tomorrow|\s+today|\s+about|$)/i)
      if (remindMatch && remindMatch[1]) {
        taskTitle = remindMatch[1].trim()
      } else {
        taskTitle = 'Follow-up task'
      }
    }
    
    // Extract contact name from message
    // Improved patterns to catch "remind me to follow up with Paul"
    const namePatterns = [
      /follow\s+up\s+with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /follow-up\s+with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /remind\s+me\s+(?:to\s+)?(?:follow\s+up\s+)?with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /(?:with|to|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /([A-Z][a-z]+\s+[A-Z][a-z]+)/, // Full name pattern
      /([A-Z][a-z]+)(?:\s+tomorrow|\s+today|\s+next|\s+about|\s+regarding)/i // Single name before date/context
    ]
    
    let contactName: string | null = null
    for (const pattern of namePatterns) {
      const match = userMessage.match(pattern)
      if (match && match[1]) {
        contactName = match[1].trim()
        // Clean up the name - remove common words that might have been captured
        contactName = contactName
          .replace(/^(?:to|for|with|about|regarding)\s+/i, '')
          .replace(/\s+(?:tomorrow|today|next|about|the|proposal|regarding).*$/i, '')
          .trim()
        if (contactName && contactName.length > 1) {
          break
        }
      }
    }
    
    // Fallback: try to extract a capitalized name (likely a person's name)
    if (!contactName) {
      const capitalizedNameMatch = userMessage.match(/\b([A-Z][a-z]+)(?:\s+(?:tomorrow|today|about|the|proposal))?/i)
      if (capitalizedNameMatch && capitalizedNameMatch[1]) {
        const potentialName = capitalizedNameMatch[1]
        // Only use if it's not a common word
        const commonWords = ['remind', 'follow', 'create', 'add', 'task', 'tomorrow', 'today', 'about', 'the']
        if (!commonWords.includes(potentialName.toLowerCase())) {
          contactName = potentialName
        }
      }
    }
    
    // Extract date information
    const todayPattern = /(?:for|on|by)\s+(?:today|now)/i
    const tomorrowPattern = /(?:for|on|by)\s+tomorrow/i
    const nextWeekPattern = /(?:for|on|by)\s+next\s+week/i
    const daysPattern = /(?:in|for)\s+(\d+)\s+days?/i
    const datePattern = /(?:for|on|by)\s+(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)/i
    
    let dueDate: string | null = null
    if (todayPattern.test(userMessage)) {
      dueDate = new Date().toISOString()
    } else if (tomorrowPattern.test(userMessage)) {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      dueDate = tomorrow.toISOString()
    } else if (nextWeekPattern.test(userMessage)) {
      const nextWeek = new Date()
      nextWeek.setDate(nextWeek.getDate() + 7)
      dueDate = nextWeek.toISOString()
    } else if (daysPattern.test(userMessage)) {
      const daysMatch = userMessage.match(daysPattern)
      if (daysMatch && daysMatch[1]) {
        const days = parseInt(daysMatch[1], 10)
        const futureDate = new Date()
        futureDate.setDate(futureDate.getDate() + days)
        dueDate = futureDate.toISOString()
      }
    } else if (datePattern.test(userMessage)) {
      const dateMatch = userMessage.match(datePattern)
      if (dateMatch && dateMatch[1]) {
        const parsedDate = new Date(dateMatch[1])
        if (!isNaN(parsedDate.getTime())) {
          dueDate = parsedDate.toISOString()
        }
      }
    }
    
    // Extract priority
    let priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium'
    if (/\burgent\b/i.test(userMessage) || /\bhigh priority\b/i.test(userMessage)) {
      priority = 'urgent'
    } else if (/\bhigh\b/i.test(userMessage) && !/\bhigh priority\b/i.test(userMessage)) {
      priority = 'high'
    } else if (/\blow\b/i.test(userMessage)) {
      priority = 'low'
    }
    
    // Extract task type
    let taskType: 'call' | 'email' | 'meeting' | 'follow_up' | 'demo' | 'proposal' | 'general' = 'follow_up'
    if (/\bcall\b/i.test(userMessage)) {
      taskType = 'call'
    } else if (/\bemail\b/i.test(userMessage)) {
      taskType = 'email'
    } else if (/\bmeeting\b/i.test(userMessage)) {
      taskType = 'meeting'
    } else if (/\bdemo\b/i.test(userMessage)) {
      taskType = 'demo'
    } else if (/\bproposal\b/i.test(userMessage)) {
      taskType = 'proposal'
    }
    
    // If no contact name found, return contact selection response
    if (!contactName) {
      return {
        type: 'contact_selection',
        summary: `I'd like to help you create a task. Please select the contact:`,
        data: {
          activityType: 'task',
          activityDate: dueDate || new Date().toISOString(),
          requiresContactSelection: true,
          prefilledName: '',
          prefilledEmail: '',
          taskTitle,
          taskType,
          priority
        },
        actions: [],
        metadata: {
          timeGenerated: new Date().toISOString(),
          dataSource: ['user_message']
        }
      }
    }
    
    // Search for contacts matching the name
    const nameParts = contactName.split(/\s+/)
    const firstName = nameParts[0] || ''
    const lastName = nameParts.slice(1).join(' ') || ''
    
    // Build search query
    let contactsQuery = client
      .from('contacts')
      .select('id, first_name, last_name, full_name, email, company_id, companies:company_id(id, name)')
      .eq('owner_id', userId)
    
    // Search by first and last name
    if (firstName && lastName) {
      contactsQuery = contactsQuery.or(`first_name.ilike.%${firstName}%,last_name.ilike.%${lastName}%,full_name.ilike.%${contactName}%`)
    } else if (firstName) {
      contactsQuery = contactsQuery.or(`first_name.ilike.%${firstName}%,full_name.ilike.%${firstName}%`)
    } else {
      // If no name parts, search by full name
      contactsQuery = contactsQuery.ilike('full_name', `%${contactName}%`)
    }
    
    const { data: contacts, error: contactsError } = await contactsQuery.limit(10)
    
    if (contactsError) {
      console.error('Error searching contacts:', contactsError)
      // Return contact selection response on error
      return {
        type: 'contact_selection',
        summary: `I'd like to help you create a task for ${contactName}. Please select the contact:`,
        data: {
          activityType: 'task',
          activityDate: dueDate || new Date().toISOString(),
          requiresContactSelection: true,
          prefilledName: contactName,
          prefilledEmail: '',
          taskTitle,
          taskType,
          priority
        },
        actions: [],
        metadata: {
          timeGenerated: new Date().toISOString(),
          dataSource: ['user_message']
        }
      }
    }
    
    // Format contacts for frontend
    const formattedContacts = (contacts || []).map((contact: any) => ({
      id: contact.id,
      name: contact.full_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email || 'Unknown',
      email: contact.email,
      company: contact.companies?.name || null
    }))
    
    // If no contacts found or multiple contacts found, return contact selection response
    if (!contacts || contacts.length === 0 || contacts.length > 1) {
      return {
        type: 'contact_selection',
        summary: contacts && contacts.length > 1
          ? `I found ${contacts.length} contacts matching "${contactName}". Please select the correct one:`
          : `I couldn't find a contact matching "${contactName}". Please select or create a contact:`,
        data: {
          activityType: 'task',
          activityDate: dueDate || new Date().toISOString(),
          requiresContactSelection: true,
          prefilledName: contactName,
          prefilledEmail: '',
          suggestedContacts: formattedContacts,
          taskTitle,
          taskType,
          priority
        },
        actions: [],
        metadata: {
          timeGenerated: new Date().toISOString(),
          dataSource: ['contacts_search'],
          matchCount: contacts?.length || 0
        }
      }
    }
    
    // Single contact found - check if proposal is mentioned and search for proposals
    const contact = contacts[0]
    const mentionsProposal = /\bproposal\b/i.test(userMessage)
    
    // If proposal is mentioned, search for related proposals
    if (mentionsProposal) {
      // Search for proposals related to this contact
      // Try multiple search strategies: contact_id, client_name, contact_identifier
      let proposalsQuery = client
        .from('activities')
        .select(`
          id,
          type,
          client_name,
          details,
          amount,
          date,
          deal_id,
          company_id,
          contact_id,
          deals:deal_id(id, name, value, stage_id)
        `)
        .eq('user_id', userId)
        .eq('type', 'proposal')
      
      // Build OR query for multiple search criteria
      const searchConditions: string[] = []
      
      // Search by contact_id if available
      if (contact.id) {
        searchConditions.push(`contact_id.eq.${contact.id}`)
      }
      
      // Search by client_name matching contact name
      searchConditions.push(`client_name.ilike.%${contactName}%`)
      
      // Search by contact_identifier (email) if available
      if (contact.email) {
        searchConditions.push(`contact_identifier.ilike.%${contact.email}%`)
      }
      
      // Apply OR conditions
      if (searchConditions.length > 0) {
        proposalsQuery = proposalsQuery.or(searchConditions.join(','))
      }
      
      const { data: proposals, error: proposalsError } = await proposalsQuery
        .order('date', { ascending: false })
        .limit(10)
      
      if (!proposalsError && proposals && proposals.length > 0) {
        // Found proposals - return proposal selection response
        return {
          type: 'proposal_selection',
          summary: `I found ${proposals.length} proposal${proposals.length > 1 ? 's' : ''} for ${contact.full_name || `${contact.first_name} ${contact.last_name}`.trim()}. Please select the one to follow up on:`,
          data: {
            contact: {
              id: contact.id,
              name: contact.full_name || `${contact.first_name} ${contact.last_name}`.trim(),
              email: contact.email,
              company: contact.companies?.name || null,
              companyId: contact.company_id || null
            },
            proposals: proposals.map((proposal: any) => ({
              id: proposal.id,
              clientName: proposal.client_name,
              details: proposal.details,
              amount: proposal.amount,
              date: proposal.date,
              dealId: proposal.deal_id,
              dealName: proposal.deals?.name || null,
              dealValue: proposal.deals?.value || null
            })),
            taskTitle,
            taskType,
            priority,
            dueDate: dueDate || null
          },
          actions: [],
          metadata: {
            timeGenerated: new Date().toISOString(),
            dataSource: ['proposals_search'],
            proposalCount: proposals.length
          }
        }
      }
    }
    
    // No proposals found or proposal not mentioned - return task creation response
    return {
      type: 'task_creation',
      summary: `I found ${contact.full_name || `${contact.first_name} ${contact.last_name}`.trim()}. Ready to create the task.`,
      data: {
        title: taskTitle,
        description: `Task: ${taskTitle}`,
        dueDate: dueDate || null,
        priority,
        taskType,
        contact: {
          id: contact.id,
          name: contact.full_name || `${contact.first_name} ${contact.last_name}`.trim(),
          email: contact.email,
          company: contact.companies?.name || null,
          companyId: contact.company_id || null
        },
        requiresContactSelection: false
      },
      actions: [
        {
          id: 'create-task',
          label: 'Create Task',
          type: 'primary',
          callback: 'create_task',
          params: {
            title: taskTitle,
            dueDate: dueDate || null,
            contactId: contact.id,
            priority,
            taskType
          }
        }
      ],
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: ['contacts_search'],
        matchCount: 1
      }
    }
  } catch (error) {
    console.error('Error in structureTaskCreationResponse:', error)
    // Return contact selection response on error
    return {
      type: 'contact_selection',
      summary: `I'd like to help you create a task. Please select the contact:`,
      data: {
        activityType: 'task',
        activityDate: new Date().toISOString(),
        requiresContactSelection: true,
        prefilledName: '',
        prefilledEmail: '',
        taskTitle: 'Follow-up task',
        taskType: 'follow_up',
        priority: 'medium'
      },
      actions: [],
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: ['error_fallback']
      }
    }
  }
}

/**
 * Structure contact response with all connections
 */
export async function structureContactResponse(
  client: any,
  userId: string,
  aiContent: string,
  contactEmail: string | null,
  userMessage: string
): Promise<StructuredResponse | null> {
  try {
    // Find contact by email or name
    let contact: ContactData | null = null
    
    if (contactEmail) {
      const { data: contactByEmail } = await client
        .from('contacts')
        .select(`
          id,
          first_name,
          last_name,
          full_name,
          email,
          phone,
          title,
          company_id,
          companies:company_id(id, name)
        `)
        .eq('email', contactEmail)
        .eq('owner_id', userId)
        .maybeSingle()
      
      contact = contactByEmail as ContactData | null
    }
    
    // If no contact found by email, try searching by name
    if (!contact) {
      const nameMatch = userMessage.match(/(?:about|info on|tell me about|show me|find|lookup)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i)
      if (nameMatch) {
        const nameParts = nameMatch[1].split(' ')
        const firstName = nameParts[0]
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null
        
        let query = client
          .from('contacts')
          .select(`
            id,
            first_name,
            last_name,
            full_name,
            email,
            phone,
            title,
            company_id,
            companies:company_id(id, name)
          `)
          .eq('first_name', firstName)
          .eq('owner_id', userId)
        
        if (lastName) {
          query = query.eq('last_name', lastName)
        }
        
        const { data: contactByName } = await query.maybeSingle()
        contact = contactByName as ContactData | null
      }
    }
    
    if (!contact) {
      return null // Let AI handle it as text response
    }
    
    const contactId = contact.id
    
    // Fetch all related data in parallel
    const [
      emailsResult,
      dealsResult,
      activitiesResult,
      meetingsResult,
      tasksResult
    ] = await Promise.allSettled([
      // Fetch recent emails - try Gmail integration first, fallback to activities
      (async () => {
        // Check if Gmail integration exists
        const { data: gmailIntegration } = await client
          .from('user_integrations')
          .select('id, access_token')
          .eq('user_id', userId)
          .eq('service', 'gmail')
          .eq('status', 'active')
          .maybeSingle()
        
        if (gmailIntegration && contact?.email) {
          try {
            // Fetch emails from Gmail API
            const gmailResponse = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=from:${contact?.email || ''} OR to:${contact?.email || ''}&maxResults=10`,
              {
                headers: {
                  'Authorization': `Bearer ${gmailIntegration.access_token}`
                }
              }
            )
            
            if (gmailResponse.ok) {
              const gmailData = await gmailResponse.json()
              const messages = gmailData.messages || []
              
              // Fetch full message details for each
              const emailDetails = await Promise.all(
                messages.slice(0, 5).map(async (msg: any) => {
                  try {
                    const msgRes = await fetch(
                      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`,
                      {
                        headers: {
                          'Authorization': `Bearer ${gmailIntegration.access_token}`
                        }
                      }
                    )
                    if (!msgRes.ok) return null
                    const msgData = await msgRes.json()
                    
                    const headers = msgData.payload?.headers || []
                    const fromHeader = headers.find((h: any) => h.name === 'From')
                    const subjectHeader = headers.find((h: any) => h.name === 'Subject')
                    const dateHeader = headers.find((h: any) => h.name === 'Date')
                    
                    const snippet = msgData.snippet || ''
                    const direction = fromHeader?.value?.toLowerCase().includes(contact?.email?.toLowerCase() || '') ? 'sent' : 'received'
                    
                    return {
                      id: msg.id,
                      type: 'email',
                      notes: subjectHeader?.value || 'No subject',
                      date: dateHeader?.value ? new Date(dateHeader.value).toISOString() : new Date().toISOString(),
                      created_at: dateHeader?.value ? new Date(dateHeader.value).toISOString() : new Date().toISOString(),
                      snippet: snippet.substring(0, 200),
                      subject: subjectHeader?.value || 'No subject',
                      direction
                    }
                  } catch {
                    return null
                  }
                })
              )
              
              return { data: emailDetails.filter(Boolean), error: null }
            }
          } catch (error) {
            // Fallback to activities
          }
        }
        
        // Fallback: use activities that are emails
        return await client
          .from('activities')
          .select('id, type, details, date, created_at')
          .eq('contact_id', contactId)
          .eq('type', 'email')
          .order('date', { ascending: false })
          .limit(10)
      })(),
      
      // Fetch deals
      client
        .from('deals')
        .select(`
          id,
          name,
          value,
          stage_id,
          probability,
          expected_close_date,
          deal_stages:stage_id(name)
        `)
        .or(`primary_contact_id.eq.${contactId},contact_email.eq.${contact.email}`)
        .eq('owner_id', userId)
        .order('created_at', { ascending: false }),
      
      // Fetch activities
      client
        .from('activities')
        .select('id, type, details, date')
        .eq('contact_id', contactId)
        .order('date', { ascending: false })
        .limit(10),
      
      // Fetch meetings
      client
        .from('meetings')
        .select(`
          id,
          title,
          summary,
          meeting_start,
          transcript_text
        `)
        .or(`primary_contact_id.eq.${contactId},company_id.eq.${contact.company_id}`)
        .eq('owner_user_id', userId)
        .order('meeting_start', { ascending: false })
        .limit(10),
      
      // Fetch tasks
      client
        .from('tasks')
        .select('id, title, status, priority, due_date')
        .eq('contact_id', contactId)
        .in('status', ['todo', 'in_progress'])
        .order('due_date', { ascending: true })
        .limit(10)
    ])
    
    const emails = emailsResult.status === 'fulfilled' ? emailsResult.value.data || [] : []
    const deals = dealsResult.status === 'fulfilled' ? dealsResult.value.data || [] : []
    const activities = activitiesResult.status === 'fulfilled' ? activitiesResult.value.data || [] : []
    const meetings = meetingsResult.status === 'fulfilled' ? meetingsResult.value.data || [] : []
    const tasks = tasksResult.status === 'fulfilled' ? tasksResult.value.data || [] : []
    
    // Format emails
    const emailSummaries = emails.slice(0, 5).map((email: any) => ({
      id: email.id,
      subject: email.subject || email.notes?.substring(0, 50) || 'Email',
      summary: email.snippet || email.notes?.substring(0, 200) || '',
      date: email.date || email.created_at,
      direction: email.direction || 'sent',
      snippet: email.snippet || email.notes?.substring(0, 100)
    }))
    
    // Format deals
    const formattedDeals = deals.map((deal: any) => {
      // Calculate health score (simplified)
      const daysSinceUpdate = deal.updated_at 
        ? Math.floor((Date.now() - new Date(deal.updated_at).getTime()) / (1000 * 60 * 60 * 24))
        : 30
      const healthScore = Math.max(0, 100 - (daysSinceUpdate * 2) - (100 - deal.probability))
      
      return {
        id: deal.id,
        name: deal.name,
        value: deal.value || 0,
        stage: deal.deal_stages?.name || 'Unknown',
        probability: deal.probability || 0,
        closeDate: deal.expected_close_date,
        healthScore: Math.round(healthScore)
      }
    })
    
    // Format activities
    const formattedActivities = activities.slice(0, 10).map((activity: any) => ({
      id: activity.id,
      type: activity.type,
      notes: activity.details, // Use 'details' field from activities table
      date: activity.date
    }))
    
    // Format meetings
    const formattedMeetings = meetings.map((meeting: any) => ({
      id: meeting.id,
      title: meeting.title || 'Meeting',
      date: meeting.meeting_start,
      summary: meeting.summary,
      hasTranscript: !!meeting.transcript_text
    }))
    
    // Format tasks
    const formattedTasks = tasks.map((task: any) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueDate: task.due_date
    }))
    
    // Calculate metrics
    const activeDeals = formattedDeals.filter((d: any) => d.probability > 0 && d.probability < 100)
    const totalDealValue = formattedDeals.reduce((sum: number, d: any) => sum + (d.value || 0), 0)
    const upcomingMeetings = formattedMeetings.filter((m: any) => {
      const meetingDate = new Date(m.date)
      return meetingDate >= new Date()
    })
    
    const metrics = {
      totalDeals: formattedDeals.length,
      totalDealValue,
      activeDeals: activeDeals.length,
      recentEmails: emailSummaries.length,
      upcomingMeetings: upcomingMeetings.length,
      pendingTasks: formattedTasks.length
    }
    
    // Generate summary
    const summary = `Here's everything I found about ${contact.full_name || contact.first_name || contact.email}:`
    
    // Generate actions
    const actions: Array<{
      id: string
      label: string
      type: string
      icon: string
      callback: string
      params?: any
    }> = []
    if (formattedDeals.length > 0) {
      actions.push({
        id: 'view-deals',
        label: `View ${formattedDeals.length} Deal${formattedDeals.length > 1 ? 's' : ''}`,
        type: 'primary' as const,
        icon: 'briefcase',
        callback: `/crm/contacts/${contactId}`
      })
    }
    if (formattedTasks.length > 0) {
      actions.push({
        id: 'view-tasks',
        label: `View ${formattedTasks.length} Task${formattedTasks.length > 1 ? 's' : ''}`,
        type: 'secondary' as const,
        icon: 'check-circle',
        callback: `/crm/tasks?contact=${contactId}`
      })
    }
    
    return {
      type: 'contact',
      summary,
      data: {
        contact: {
          id: contact.id,
          name: contact.full_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email,
          email: contact.email,
          phone: contact.phone,
          title: contact.title,
          company: contact.companies?.name,
          companyId: contact.company_id
        },
        emails: emailSummaries,
        deals: formattedDeals,
        activities: formattedActivities,
        meetings: formattedMeetings,
        tasks: formattedTasks,
        metrics
      },
      actions,
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: ['contacts', 'deals', 'activities', 'meetings', 'tasks'],
        confidence: 90
      }
    }
  } catch (error) {
    return null
  }
}

/**
 * Structure communication history response (emails)
 */
export async function structureCommunicationHistoryResponse(
  client: any,
  userId: string,
  userMessage: string,
  context?: ChatRequestContext
): Promise<StructuredResponse | null> {
  try {
    const messageLower = userMessage.toLowerCase()
    const { contact, contactEmail, contactName, searchTerm } = await resolveContactReference(client, userId, userMessage, context)
    const contactId = contact?.id || null
    const labelFilter = extractLabelFromMessage(userMessage)
    const limit = extractEmailLimitFromMessage(userMessage)
    const direction = detectEmailDirection(messageLower)
    const { startDate, endDate } = extractDateRangeFromMessage(messageLower)

    let emails: GmailMessageSummary[] = []
    const dataSource: string[] = []
    let warning: string | null = null

    try {
      const gmailResult = await searchGmailMessages(client, userId, {
        contactEmail,
        query: contactEmail ? null : searchTerm || null,
        limit,
        direction,
        startDate: startDate || null,
        endDate: endDate || null,
        label: labelFilter || null
      })
      emails = gmailResult.messages
      dataSource.push('gmail')
    } catch (error) {
      warning = error.message || 'Unable to reach Gmail'
      console.error('[COMM-HISTORY] Gmail fetch failed:', error)
      if (contact?.id) {
        const fallback = await fetchEmailActivitiesFallback(client, userId, contact.id, limit)
        if (fallback.length) {
          emails = fallback
          dataSource.push('activities')
        }
      }
    }

    const sortedEmails = [...emails].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    const communications = sortedEmails.map(email => ({
      id: email.id,
      type: 'email' as const,
      subject: email.subject,
      summary: email.snippet,
      date: email.date,
      direction: email.direction,
      participants: [...new Set([...email.from, ...email.to])]
    }))

    const timeline = sortedEmails.map(email => ({
      id: `${email.id}-timeline`,
      date: email.date,
      type: 'email',
      title: `${email.direction === 'received' ? 'Received' : email.direction === 'sent' ? 'Sent' : 'Email'}: ${email.subject}`,
      description: email.snippet,
      relatedTo: contactName || contactEmail || searchTerm || undefined
    }))

    const mostRecent = sortedEmails[0]
    const emailsSent = sortedEmails.filter(email => email.direction === 'sent').length
    const summaryStats = {
      totalCommunications: communications.length,
      emailsSent,
      callsMade: 0,
      meetingsHeld: 0,
      lastContact: mostRecent?.date,
      communicationFrequency: communications.length >= limit
        ? 'high'
        : communications.length >= Math.max(3, Math.floor(limit / 2))
          ? 'medium'
          : 'low'
    }

    const overdueFollowUps: Array<{
      id: string
      type: 'email'
      title: string
      dueDate: string
      daysOverdue: number
      contactId?: string
      contactName?: string
      dealId?: string
      dealName?: string
    }> = []
    if (contactId && mostRecent) {
      const daysSince = Math.floor((Date.now() - new Date(mostRecent.date).getTime()) / (1000 * 60 * 60 * 24))
      if (daysSince >= 5) {
        overdueFollowUps.push({
          id: `followup-${mostRecent.id}`,
          type: 'email',
          title: `Follow up with ${contactName || 'this contact'}`,
          dueDate: mostRecent.date,
          daysOverdue: daysSince,
          contactId,
          contactName: contactName || undefined
        })
      }
    }

    const nextActions: Array<{
      id: string
      type: 'email'
      title: string
      dueDate?: string
      priority: 'high' | 'medium' | 'low'
      contactId?: string
      contactName?: string
      dealId?: string
      dealName?: string
    }> = []
    if (contactId) {
      nextActions.push({
        id: 'send-follow-up',
        type: 'email',
        title: `Draft a follow-up to ${contactName || 'this contact'}`,
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        priority: 'high',
        contactId,
        contactName: contactName || undefined
      })
    }

    const actions: Array<{
      id: string
      label: string
      type: 'primary' | 'secondary' | 'tertiary'
      icon: string
      callback: string
      params?: any
    }> = []
    if (contactId) {
      actions.push({
        id: 'view-contact',
        label: 'Open Contact',
        type: 'primary',
        icon: 'user',
        callback: `/crm/contacts/${contactId}`
      })
      actions.push({
        id: 'create-follow-up-task',
        label: 'Create Follow-up Task',
        type: 'secondary',
        icon: 'check-square',
        callback: 'create_task',
        params: {
          title: `Follow up with ${contactName || 'contact'}`,
          contactId,
          taskType: 'email',
          priority: 'high'
        }
      })
    }
    if (mostRecent?.link) {
      actions.push({
        id: 'open-gmail-thread',
        label: 'Open in Gmail',
        type: 'tertiary',
        icon: 'mail',
        callback: mostRecent.link
      })
    }

    const scopeDescription = labelFilter
      ? `tagged "${labelFilter}"`
      : contactName
        ? `with ${contactName}`
        : contactEmail
          ? `with ${contactEmail}`
          : 'from your inbox'

    const summary = communications.length
      ? `Here are the last ${communications.length} emails ${scopeDescription}.`
      : warning
        ? `I couldn't load Gmail data ${scopeDescription}: ${warning}.`
        : `I couldn't find any recent emails ${scopeDescription}.`

    return {
      type: 'communication_history',
      summary,
      data: {
        contactId,
        contactName: contactName || undefined,
        communications,
        timeline,
        overdueFollowUps,
        nextActions,
        summary: summaryStats
      },
      actions,
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: dataSource.length ? dataSource : ['gmail_unavailable'],
        totalCount: communications.length,
        warning
      }
    }
  } catch (error) {
    console.error('[COMM-HISTORY] Failed to structure response:', error)
    return null
  }
}

/**
 * Structure pipeline response from deals data
 */
export async function structurePipelineResponse(
  client: any,
  userId: string,
  aiContent: string,
  userMessage?: string
): Promise<any> {
  try {
    // Fetch all active deals
    const { data: deals, error } = await client
      .from('deals')
      .select(`
        id,
        name,
        value,
        stage_id,
        status,
        expected_close_date,
        probability,
        created_at,
        updated_at,
        deal_stages(name)
      `)
      .eq('owner_id', userId)  // Correct column name is owner_id
      .eq('status', 'active')
      .order('value', { ascending: false })

    if (error) {
      return null
    }
    
    if (!deals || deals.length === 0) {
      return null
    }
    // Calculate health scores and categorize deals
    const now = new Date()
    const criticalDeals: any[] = []
    const highPriorityDeals: any[] = []
    const healthyDeals: any[] = []
    const dataIssues: any[] = []

    let totalValue = 0
    let dealsAtRisk = 0
    let closingThisWeek = 0
    let totalHealthScore = 0

    for (const deal of deals) {
      totalValue += deal.value || 0
      
      // Calculate health score (0-100)
      const daysSinceUpdate = Math.floor((now.getTime() - new Date(deal.updated_at).getTime()) / (1000 * 60 * 60 * 24))
      const daysUntilClose = deal.expected_close_date 
        ? Math.floor((new Date(deal.expected_close_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null
      
      // Health score factors
      const recencyScore = Math.max(0, 100 - daysSinceUpdate * 5) // Lose 5 points per day
      const probabilityScore = deal.probability || 0
      const valueScore = Math.min(100, (deal.value || 0) / 1000) // 1 point per $1k, max 100
      
      const healthScore = Math.round((recencyScore * 0.4 + probabilityScore * 0.4 + valueScore * 0.2))
      totalHealthScore += healthScore

      // Check for data issues
      if (!deal.expected_close_date) {
        dataIssues.push({
          type: 'missing_close_date',
          dealId: deal.id,
          dealName: deal.name,
          description: 'No close date set'
        })
      }
      
      if (deal.probability < 30) {
        dataIssues.push({
          type: 'low_probability',
          dealId: deal.id,
          dealName: deal.name,
          description: `Low probability (${deal.probability}%)`
        })
      }
      
      if (daysSinceUpdate > 30) {
        dataIssues.push({
          type: 'stale_deal',
          dealId: deal.id,
          dealName: deal.name,
          description: `No updates in ${daysSinceUpdate} days`
        })
      }

      // Determine urgency
      let urgency: 'critical' | 'high' | 'medium' | 'low' = 'medium'
      let reason = ''

      // Critical: High value, closing soon, or low health
      if (daysUntilClose !== null && daysUntilClose <= 7 && daysUntilClose >= 0) {
        closingThisWeek++
        if (deal.value >= 10000 || healthScore < 50) {
          urgency = 'critical'
          reason = `Closing in ${daysUntilClose} days with ${healthScore} health score`
          criticalDeals.push({
            id: deal.id,
            name: deal.name,
            value: deal.value,
            stage: deal.deal_stages?.name || 'Unknown',
            probability: deal.probability || 0,
            closeDate: deal.expected_close_date,
            daysUntilClose,
            healthScore,
            urgency,
            reason
          })
          dealsAtRisk++
          continue
        }
      }

      // High priority: High value, no close date, or been in stage too long
      if (
        deal.value >= 10000 ||
        (!deal.expected_close_date && daysSinceUpdate > 14) ||
        healthScore < 60
      ) {
        urgency = 'high'
        if (!deal.expected_close_date) {
          reason = `No close date set, been in ${deal.deal_stages?.name || 'current'} stage ${daysSinceUpdate} days`
        } else if (daysSinceUpdate > 14) {
          reason = `No recent activity (${daysSinceUpdate} days since update)`
        } else {
          reason = `Health score of ${healthScore} needs attention`
        }
        highPriorityDeals.push({
          id: deal.id,
          name: deal.name,
          value: deal.value,
          stage: deal.deal_stages?.name || 'Unknown',
          probability: deal.probability || 0,
          closeDate: deal.expected_close_date,
          daysUntilClose,
          healthScore,
          urgency,
          reason
        })
        if (healthScore < 60) dealsAtRisk++
        continue
      }

      // Healthy deals
      healthyDeals.push({
        id: deal.id,
        name: deal.name,
        value: deal.value,
        stage: deal.deal_stages?.name || 'Unknown',
        probability: deal.probability || 0,
        closeDate: deal.expected_close_date,
        daysUntilClose,
        healthScore,
        urgency: 'low',
        reason: 'On track'
      })
    }

    const avgHealthScore = deals.length > 0 ? Math.round(totalHealthScore / deals.length) : 0

    // Generate summary
    const summary = `I've analyzed your pipeline. Here's what needs attention:`

    // Generate actions
    const actions: Array<{
      id: string
      label: string
      type: string
      icon: string
      callback: string
      params?: any
    }> = []
    if (criticalDeals.length > 0) {
      actions.push({
        id: 'focus-critical',
        label: `Focus on ${criticalDeals[0].name}`,
        type: 'primary',
        icon: 'target',
        callback: '/api/copilot/actions/focus-deal',
        params: { dealId: criticalDeals[0].id }
      })
    }
    
    const dealsWithoutCloseDate = deals.filter(d => !d.expected_close_date).length
    if (dealsWithoutCloseDate > 0) {
      actions.push({
        id: 'set-close-dates',
        label: `Set Close Dates (${dealsWithoutCloseDate} deals)`,
        type: 'secondary',
        icon: 'calendar',
        callback: '/api/copilot/actions/bulk-update-dates'
      })
    }

    // Check if user asked for a specific number - if not, show stats first
    // Extract number from user message (e.g., "show me 5 deals" -> 5)
    let requestedNumber: number | null = null;
    if (userMessage) {
      const numberPatterns = [
        /(?:show|list|get|find|display)\s+(?:me\s+)?(\d+)\s+(?:deal|deals)/i,
        /(\d+)\s+(?:deal|deals|high\s+priority)/i,
        /(?:first|top)\s+(\d+)/i
      ];
      
      for (const pattern of numberPatterns) {
        const match = userMessage.match(pattern);
        if (match && match[1]) {
          const num = parseInt(match[1], 10);
          if (num > 0 && num <= 100) {
            requestedNumber = num;
            break;
          }
        }
      }
    }
    
    // Show stats first if no specific number requested and there are many deals
    const showStatsFirst = !requestedNumber && (criticalDeals.length + highPriorityDeals.length) > 10;

    return {
      type: 'pipeline',
      summary,
      data: {
        criticalDeals: criticalDeals.slice(0, 10), // Limit to top 10
        highPriorityDeals: highPriorityDeals.slice(0, 10),
        healthyDeals: healthyDeals.slice(0, 5), // Show a few healthy ones
        dataIssues: dataIssues.slice(0, 10),
        metrics: {
          totalValue,
          totalDeals: deals.length,
          avgHealthScore,
          dealsAtRisk,
          closingThisWeek
        },
        showStatsFirst
      },
      actions,
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: ['deals', 'deal_stages'],
        confidence: 85
      }
    }
  } catch (error) {
    return null
  }
}

/**
 * Structure task response from tasks data
 */
export async function structureTaskResponse(
  client: any,
  userId: string,
  aiContent: string,
  userMessage?: string
): Promise<StructuredResponse | null> {
  // Store original message for summary enhancement
  const originalMessage = userMessage
  try {
    // Extract requested limit from user message
    const requestedLimit = userMessage ? extractTaskLimit(userMessage) : null;
    const limitPerCategory = requestedLimit || 5; // Default to 5 if no specific number requested
    // Fetch tasks assigned to or created by user
    const { data: tasks, error } = await client
      .from('tasks')
      .select(`
        id,
        title,
        description,
        status,
        priority,
        due_date,
        task_type,
        created_at,
        updated_at,
        contact_id,
        deal_id,
        company_id,
        meeting_id,
        contacts:contact_id(id, first_name, last_name),
        deals:deal_id(id, name),
        companies:company_id(id, name),
        meetings:meeting_id(id, title)
      `)
      .or(`assigned_to.eq.${userId},created_by.eq.${userId}`)
      .order('priority', { ascending: false })
      .order('due_date', { ascending: true })

    if (error) {
      return null
    }
    
    if (!tasks || tasks.length === 0) {
      return null
    }

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    
    const urgentTasks: any[] = []
    const highPriorityTasks: any[] = []
    const dueToday: any[] = []
    const overdue: any[] = []
    const upcoming: any[] = []
    const completed: any[] = []

    let totalTasks = tasks.length
    let urgentCount = 0
    let highPriorityCount = 0
    let dueTodayCount = 0
    let overdueCount = 0
    let completedToday = 0

    for (const task of tasks) {
      // Skip completed tasks unless specifically requested
      if (task.status === 'completed') {
        const completedDate = new Date(task.updated_at)
        if (completedDate >= today) {
          completedToday++
          completed.push({
            id: task.id,
            title: task.title,
            description: task.description,
            status: task.status,
            priority: task.priority,
            dueDate: task.due_date,
            isOverdue: false,
            taskType: task.task_type || 'general',
            contactId: task.contact_id,
            contactName: task.contacts ? `${task.contacts.first_name || ''} ${task.contacts.last_name || ''}`.trim() : undefined,
            dealId: task.deal_id,
            dealName: task.deals?.name,
            companyId: task.company_id,
            companyName: task.companies?.name,
            meetingId: task.meeting_id,
            meetingName: task.meetings?.title,
            createdAt: task.created_at,
            updatedAt: task.updated_at
          })
        }
        continue
      }

      // Calculate days until due
      let daysUntilDue: number | undefined
      let isOverdue = false
      if (task.due_date) {
        const dueDate = new Date(task.due_date)
        // Only calculate if date is valid
        if (!isNaN(dueDate.getTime())) {
          const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate())
          daysUntilDue = Math.floor((dueDateOnly.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
          // Only mark as overdue if it's reasonably in the past (not more than 1 year)
          // This prevents false positives from data errors
          isOverdue = daysUntilDue < 0 && daysUntilDue > -365
        }
      }

      const taskItem = {
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        dueDate: task.due_date,
        daysUntilDue,
        isOverdue,
        taskType: task.task_type || 'general',
        contactId: task.contact_id,
        contactName: task.contacts ? `${task.contacts.first_name || ''} ${task.contacts.last_name || ''}`.trim() : undefined,
        dealId: task.deal_id,
        dealName: task.deals?.name,
        companyId: task.company_id,
        companyName: task.companies?.name,
        meetingId: task.meeting_id,
        meetingName: task.meetings?.title,
        createdAt: task.created_at,
        updatedAt: task.updated_at
      }

      // Count metrics first
      if (task.priority === 'urgent') urgentCount++
      if (task.priority === 'high') highPriorityCount++

      // Categorize tasks (overdue takes precedence)
      if (isOverdue) {
        overdue.push(taskItem)
        overdueCount++
      } else if (daysUntilDue === 0) {
        dueToday.push(taskItem)
        dueTodayCount++
      } else if (task.priority === 'urgent') {
        urgentTasks.push(taskItem)
      } else if (task.priority === 'high') {
        highPriorityTasks.push(taskItem)
      } else if (daysUntilDue !== undefined && daysUntilDue > 0 && daysUntilDue <= 7) {
        upcoming.push(taskItem)
      }
    }

    // Calculate completion rate
    const activeTasks = tasks.filter(t => t.status !== 'completed').length
    const completionRate = totalTasks > 0 ? Math.round((completedToday / totalTasks) * 100) : 0

    // Generate summary - for general prioritize questions, mention both tasks and pipeline
    let summary = `I've analyzed your tasks. Here's what needs your attention:`
    
    // If this is a general "prioritize" question, enhance the summary
    if (originalMessage && (
      originalMessage.toLowerCase().includes('what should i prioritize') ||
      originalMessage.toLowerCase().includes('prioritize today')
    )) {
      summary = `I've analyzed your tasks for today. Here's what needs your immediate attention. You may also want to check your pipeline for deals that need follow-up.`
    }

    // Generate actions
    const actions: Array<{
      id: string
      label: string
      type: string
      icon: string
      callback: string
      params?: any
    }> = []
    if (overdue.length > 0) {
      actions.push({
        id: 'focus-overdue',
        label: `Focus on ${overdue.length} Overdue Task${overdue.length > 1 ? 's' : ''}`,
        type: 'primary',
        icon: 'alert-circle',
        callback: '/crm/tasks?filter=overdue'
      })
    }
    
    if (dueToday.length > 0) {
      actions.push({
        id: 'view-due-today',
        label: `View ${dueToday.length} Due Today`,
        type: 'secondary',
        icon: 'calendar',
        callback: '/crm/tasks?filter=due_today'
      })
    }

    if (urgentTasks.length > 0) {
      actions.push({
        id: 'view-urgent',
        label: `View ${urgentTasks.length} Urgent Task${urgentTasks.length > 1 ? 's' : ''}`,
        type: 'secondary',
        icon: 'flag',
        callback: '/crm/tasks?filter=urgent'
      })
    }

    // Use the limit extracted from user message or default
    // If user asked for a specific number, prioritize showing that many total across all categories
    // Otherwise, show up to limitPerCategory per category
    
    let urgentLimit = limitPerCategory;
    let highPriorityLimit = limitPerCategory;
    let dueTodayLimit = limitPerCategory;
    let overdueLimit = limitPerCategory;
    let upcomingLimit = limitPerCategory;
    
    // If user specified a number, distribute it intelligently
    if (requestedLimit) {
      // Prioritize: overdue > due today > urgent > high priority > upcoming
      const totalRequested = requestedLimit;
      overdueLimit = Math.min(overdue.length, Math.max(1, Math.ceil(totalRequested * 0.3)));
      dueTodayLimit = Math.min(dueToday.length, Math.max(1, Math.ceil(totalRequested * 0.25)));
      urgentLimit = Math.min(urgentTasks.length, Math.max(1, Math.ceil(totalRequested * 0.2)));
      highPriorityLimit = Math.min(highPriorityTasks.length, Math.max(1, Math.ceil(totalRequested * 0.15)));
      const remaining = totalRequested - overdueLimit - dueTodayLimit - urgentLimit - highPriorityLimit;
      upcomingLimit = Math.max(0, Math.min(upcoming.length, remaining));
      
      // Ensure we don't exceed the requested total
      const currentTotal = overdueLimit + dueTodayLimit + urgentLimit + highPriorityLimit + upcomingLimit;
      if (currentTotal > totalRequested) {
        // Reduce from least priority category
        const excess = currentTotal - totalRequested;
        upcomingLimit = Math.max(0, upcomingLimit - excess);
      }
    }
    
    // Show stats first if no specific number requested and there are many tasks
    const showStatsFirst = !requestedLimit && (urgentTasks.length + highPriorityTasks.length + overdue.length + dueToday.length) > 10;

    return {
      type: 'task',
      summary,
      data: {
        urgentTasks: urgentTasks.slice(0, urgentLimit),
        highPriorityTasks: highPriorityTasks.slice(0, highPriorityLimit),
        dueToday: dueToday.slice(0, dueTodayLimit),
        overdue: overdue.slice(0, overdueLimit),
        upcoming: upcoming.slice(0, upcomingLimit),
        completed: completed.slice(0, 3), // Show fewer completed
        showStatsFirst,
        metrics: {
          totalTasks,
          urgentCount,
          highPriorityCount,
          dueTodayCount,
          overdueCount,
          completedToday,
          completionRate
        }
      },
      actions,
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: ['tasks', 'contacts', 'deals', 'companies'],
        confidence: 90
      }
    }
  } catch (error) {
    return null
  }
}

/**
 * Structure calendar event search results for Copilot UI
 */
export async function structureCalendarSearchResponse(
  client: any,
  userId: string,
  calendarReadResult: any,
  userMessage: string,
  temporalContext?: TemporalContextPayload
): Promise<StructuredResponse | null> {
  try {
    const timezone = await getUserTimezone(client, userId)
    const currentDate = temporalContext?.isoString
      ? new Date(temporalContext.isoString)
      : new Date()

    // Extract events from the calendar_read result
    const events = calendarReadResult?.events || []

    if (events.length === 0) {
      return null // Let AI respond with "no events found"
    }

    console.log('[CALENDAR-SEARCH] Structuring response for', events.length, 'events')

    // Map events to the format expected by CalendarResponse component
    const meetings = events.map((event: any) => {
      const startTime = event.start_time
      const endTime = event.end_time
      const startDateObj = new Date(startTime)
      let status: 'past' | 'today' | 'upcoming' = 'upcoming'

      if (startDateObj.getTime() < currentDate.getTime()) {
        status = 'past'
      } else if (isSameZonedDay(startDateObj, timezone, currentDate)) {
        status = 'today'
      }

      const attendees = (event.attendees || []).map((att: any) => ({
        name: att.name || att.email || 'Attendee',
        email: att.email || ''
      }))

      return {
        id: event.id,
        title: event.title || 'Calendar Event',
        attendees,
        startTime,
        endTime,
        status,
        location: event.location || undefined,
        hasPrepBrief: false,
        dealId: event.deal_id || undefined,
        contactId: event.contact_id || undefined
      }
    })

    // Generate appropriate summary
    const summary = events.length === 1
      ? `I found your ${events[0].title || 'event'}.`
      : `I found ${events.length} event${events.length === 1 ? '' : 's'}.`

    // Add relevant actions
    const actions: Array<{
      id: string
      label: string
      type: 'primary' | 'secondary' | 'tertiary'
      icon: string
      callback: string
      params?: any
    }> = [
      {
        id: 'open-calendar',
        label: 'Open Calendar',
        type: 'primary',
        icon: 'calendar',
        callback: '/calendar'
      }
    ]

    return {
      type: 'calendar',
      summary,
      data: {
        meetings,
        availability: [] // No availability slots for search results
      },
      actions,
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: ['calendar_events'],
        timezone,
        eventCount: events.length
      }
    }
  } catch (error) {
    console.error('[CALENDAR-SEARCH] Error structuring response:', error)
    return null
  }
}

/**
 * Deterministic "next meeting prep" response.
 * Finds the user's next upcoming calendar event and returns a meeting_prep structured response
 * that the frontend can render as the Meeting Prep panel.
 */
export async function structureNextMeetingPrepResponse(
  client: any,
  userId: string,
  orgId: string | null,
  temporalContext?: TemporalContextPayload
): Promise<StructuredResponse | null> {
  try {
    const now = temporalContext?.isoString ? new Date(temporalContext.isoString) : new Date()
    const windowEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    // Fetch next upcoming event from our locally-synced calendar_events table.
    // Include events that match org_id OR have null org_id (personal calendar events)
    // This ensures personal calendar events aren't filtered out when querying in org context.
    console.log('[MEETING-PREP] Querying next meeting:', {
      userId,
      orgId,
      now: now.toISOString(),
      windowEnd: windowEnd.toISOString()
    })

    let eventQuery = client
      .from('calendar_events')
      .select(
        'id, title, start_time, end_time, location, description, meeting_url, html_link, raw_data, contact_id, deal_id, company_id, org_id'
      )
      .eq('user_id', userId)
      .gt('start_time', now.toISOString())
      .lt('start_time', windowEnd.toISOString())

    // Include events that match org_id OR have null org_id (personal calendar events)
    if (orgId) {
      eventQuery = eventQuery.or(`org_id.eq.${orgId},org_id.is.null`)
    }

    // Apply ordering and limit after all filters
    eventQuery = eventQuery
      .order('start_time', { ascending: true })
      .limit(1)
      .maybeSingle()

    const { data: event, error: eventError } = await eventQuery

    console.log('[MEETING-PREP] Query result:', {
      found: !!event,
      eventId: event?.id,
      eventTitle: event?.title,
      eventStart: event?.start_time,
      eventOrgId: event?.org_id,
      error: eventError?.message
    })
    if (eventError) throw new Error(`Failed to load next meeting: ${eventError.message}`)

    if (!event) {
      return {
        type: 'calendar',
        summary: 'No upcoming meetings found in the next 30 days.',
        data: { meetings: [], availability: [] },
        actions: [
          {
            id: 'open-calendar',
            label: 'Open Calendar',
            type: 'primary',
            icon: 'calendar',
            callback: '/calendar',
          },
        ],
        metadata: {
          timeGenerated: new Date().toISOString(),
          dataSource: ['calendar_events'],
          range: { start: now.toISOString(), end: windowEnd.toISOString() },
        },
      }
    }

    // Resolve user email for attendee filtering
    const { data: profile } = await client
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .maybeSingle()
    const userEmail = profile?.email ? String(profile.email).toLowerCase() : null

    const rawAttendees = event.raw_data?.attendees || []
    const attendees = (rawAttendees || [])
      .map((a: any) => ({
        name: a?.displayName || a?.email || 'Attendee',
        email: a?.email || '',
      }))
      .filter((a: any) => a.email || a.name)
      .slice(0, 25)

    // Pick a best-effort "counterparty" attendee (not the user) to infer contact if needed
    const counterpartyEmail =
      attendees.find((a: any) => a.email && userEmail && String(a.email).toLowerCase() !== userEmail)?.email ||
      attendees.find((a: any) => a.email)?.email ||
      null

    // Resolve contact (prefer explicit link, then infer by attendee email)
    let contactRow: any = null

    if (event.contact_id) {
      let contactQuery = client
        .from('contacts')
        .select('id, full_name, first_name, last_name, email, company_id, title, phone')
        .eq('id', event.contact_id)
        .eq('owner_id', userId)  // CRITICAL: contacts uses owner_id, NOT user_id
        .maybeSingle()
      if (orgId) contactQuery = contactQuery.eq('org_id', orgId)

      const { data: c, error: cErr } = await contactQuery
      if (cErr) throw new Error(`Failed to load linked contact: ${cErr.message}`)
      contactRow = c
    }

    if (!contactRow && counterpartyEmail) {
      let inferredQuery = client
        .from('contacts')
        .select('id, full_name, first_name, last_name, email, company_id, title, phone')
        .eq('owner_id', userId)  // CRITICAL: contacts uses owner_id, NOT user_id
        .ilike('email', counterpartyEmail)
        .maybeSingle()
      if (orgId) inferredQuery = inferredQuery.eq('org_id', orgId)

      const { data: c2 } = await inferredQuery
      contactRow = c2
    }

    const contactName =
      contactRow?.full_name ||
      `${contactRow?.first_name || ''} ${contactRow?.last_name || ''}`.trim() ||
      counterpartyEmail ||
      'Unknown contact'

    // Company name (optional)
    let companyName: string | undefined = undefined
    if (contactRow?.company_id) {
      let companyQuery = client.from('companies').select('name').eq('id', contactRow.company_id).maybeSingle()
      if (orgId) companyQuery = companyQuery.eq('org_id', orgId)
      const { data: co } = await companyQuery
      if (co?.name) companyName = String(co.name)
    }

    // Deal context (optional)
    let dealInfo: any = undefined
    if (event.deal_id) {
      let dealQuery = client
        .from('deals')
        .select('id, name, value, stage_id, probability, owner_id')
        .eq('id', event.deal_id)
        .eq('owner_id', userId)
        .maybeSingle()
      if (orgId) dealQuery = dealQuery.eq('org_id', orgId)

      const { data: dealRow } = await dealQuery

      if (dealRow?.id) {
        // Best-effort stage name
        let stageName = String(dealRow.stage_id || 'Unknown')
        if (dealRow.stage_id) {
          const { data: stageRow } = await client
            .from('deal_stages')
            .select('name')
            .eq('id', dealRow.stage_id)
            .maybeSingle()
          if (stageRow?.name) stageName = String(stageRow.name)
        }

        dealInfo = {
          id: String(dealRow.id),
          name: String(dealRow.name || 'Deal'),
          value: Number(dealRow.value || 0),
          stage: stageName,
          probability: Number(dealRow.probability || 0),
          closeDate: undefined,
          healthScore: 50,
        }
      }
    }

    const meeting = {
      id: String(event.id),
      title: String(event.title || 'Meeting'),
      startTime: String(event.start_time),
      endTime: String(event.end_time),
      attendees,
      location: event.location || undefined,
      description: event.description || undefined,
    }

    const contact = {
      id: String(contactRow?.id || ''),
      name: contactName,
      email: String(contactRow?.email || counterpartyEmail || ''),
      company: companyName,
      title: contactRow?.title || undefined,
      phone: contactRow?.phone || undefined,
    }

    // ==========================================
    // ENHANCED PREP DATA: Fetch rich context
    // ==========================================
    
    // Fetch last interactions (activities + meetings)
    const lastInteractions: Array<{
      id: string
      type: 'email' | 'call' | 'meeting' | 'note'
      date: string
      summary: string
      keyPoints?: string[]
    }> = []
    
    // Track action items mentioned in transcripts/summaries for completion checking
    const mentionedActionItems: Array<{
      text: string
      meetingId: string
      meetingTitle: string
      meetingDate: string
      completed: boolean
    }> = []
    
    if (companyName || contactRow?.id) {
      // Get recent activities
      let activitiesQuery = client
        .from('activities')
        .select('id, type, notes, created_at, client_name')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5)
      
      if (orgId) {
        activitiesQuery = activitiesQuery.eq('org_id', orgId)
      }
      // Prefer contact_id filter if available (more specific), otherwise use company name
      if (contactRow?.id) {
        activitiesQuery = activitiesQuery.eq('contact_id', contactRow.id)
      } else if (companyName) {
        activitiesQuery = activitiesQuery.ilike('company_name', `%${companyName}%`)
      }
      
      const { data: activities } = await activitiesQuery
      
      if (activities) {
        for (const act of activities) {
          lastInteractions.push({
            id: String(act.id),
            type: act.type === 'meeting' ? 'meeting' : act.type === 'call' ? 'call' : act.type === 'email' ? 'email' : 'note',
            date: new Date(act.created_at).toISOString(),
            summary: act.notes || `${act.type} with ${act.client_name || contactName}`,
          })
        }
      }
      
      // Get recent meetings with structured summaries and transcripts
      let meetingsQuery = client
        .from('meetings')
        .select(`
          id,
          title,
          start_time,
          notes,
          summary,
          transcript_text,
          owner_user_id,
          meeting_structured_summaries (
            topics_discussed,
            objections_raised,
            outcome_signals
          ),
          meeting_action_items (
            id,
            title,
            completed
          )
        `)
        .eq('owner_user_id', userId)
        .order('start_time', { ascending: false })
        .limit(5)
      
      if (orgId) {
        meetingsQuery = meetingsQuery.eq('org_id', orgId)
      }
      // Prefer contact_id filter if available (more specific), otherwise use company name in title
      if (contactRow?.id) {
        meetingsQuery = meetingsQuery.eq('contact_id', contactRow.id)
      } else if (companyName) {
        meetingsQuery = meetingsQuery.ilike('title', `%${companyName}%`)
      }
      
      const { data: recentMeetings } = await meetingsQuery
      
      if (recentMeetings) {
        for (const m of recentMeetings) {
          // Skip the current meeting
          if (String(m.id) === String(event.id)) continue
          
          const structuredSummary = (m as any).meeting_structured_summaries?.[0]
          const topics = structuredSummary?.topics_discussed || []
          const keyTopics = topics.slice(0, 3)
          
          // Extract action items from transcript/summary
          const transcriptText = m.transcript_text || m.summary || ''
          if (transcriptText) {
            // Look for patterns like "I said I would:", "I will:", "I'll:", "I promised to:", etc.
            const actionItemPatterns = [
              /(?:I said I would|I will|I'll|I promised to|I committed to|I agreed to)[:;]\s*([^\.\n]+)/gi,
              /(?:I'm going to|I'm planning to|I intend to)[:;]\s*([^\.\n]+)/gi,
              /(?:action item|next step|follow up)[:;]\s*([^\.\n]+)/gi,
            ]
            
            for (const pattern of actionItemPatterns) {
              const matches = transcriptText.matchAll(pattern)
              for (const match of matches) {
                if (match[1]) {
                  const actionText = match[1].trim()
                  // Check if this action item exists in meeting_action_items and is completed
                  const meetingActionItems = (m as any).meeting_action_items || []
                  const matchingActionItem = meetingActionItems.find((ai: any) => 
                    actionText.toLowerCase().includes(ai.title.toLowerCase()) || 
                    ai.title.toLowerCase().includes(actionText.toLowerCase())
                  )
                  
                  mentionedActionItems.push({
                    text: actionText,
                    meetingId: String(m.id),
                    meetingTitle: m.title || 'Meeting',
                    meetingDate: new Date(m.start_time).toISOString(),
                    completed: matchingActionItem?.completed || false,
                  })
                }
              }
            }
          }
          
          // Also check structured action items from meeting_action_items
          const meetingActionItems = (m as any).meeting_action_items || []
          for (const ai of meetingActionItems) {
            // Only include if it's mentioned in transcript/summary or if it's a user-created action item
            const mentionedInText = transcriptText.toLowerCase().includes(ai.title.toLowerCase())
            if (mentionedInText || !transcriptText) {
              mentionedActionItems.push({
                text: ai.title,
                meetingId: String(m.id),
                meetingTitle: m.title || 'Meeting',
                meetingDate: new Date(m.start_time).toISOString(),
                completed: ai.completed || false,
              })
            }
          }
          
          // Build summary from structured data if available
          let summaryText = m.summary || m.notes || m.title || 'Meeting'
          if (keyTopics.length > 0) {
            summaryText += ` - Topics: ${keyTopics.join(', ')}`
          }
          
          lastInteractions.push({
            id: String(m.id),
            type: 'meeting',
            date: new Date(m.start_time).toISOString(),
            summary: summaryText,
            keyPoints: keyTopics,
          })
        }
      }
      
      // Also check tasks table for completed action items
      if (mentionedActionItems.length > 0 && (contactRow?.id || dealInfo?.id)) {
        let tasksQuery = client
          .from('tasks')
          .select('id, title, status')
          .eq('user_id', userId)
          .eq('status', 'done')
          .limit(20)
        
        if (orgId) tasksQuery = tasksQuery.eq('org_id', orgId)
        if (contactRow?.id) tasksQuery = tasksQuery.eq('contact_id', contactRow.id)
        if (dealInfo?.id) tasksQuery = tasksQuery.eq('deal_id', dealInfo.id)
        
        const { data: completedTasks } = await tasksQuery
        if (completedTasks) {
          // Match mentioned action items with completed tasks
          for (const mentioned of mentionedActionItems) {
            const matchingTask = completedTasks.find((t: any) =>
              mentioned.text.toLowerCase().includes(t.title.toLowerCase()) ||
              t.title.toLowerCase().includes(mentioned.text.toLowerCase())
            )
            if (matchingTask && !mentioned.completed) {
              mentioned.completed = true
            }
          }
        }
      }
    }
    
    // Sort by date (most recent first) and limit to 5
    lastInteractions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    const lastInteractionsFinal = lastInteractions.slice(0, 5)
    
    // Fetch deal risk signals
    const risks: string[] = []
    if (dealInfo?.id) {
      let risksQuery = client
        .from('deal_risk_signals')
        .select('title, description, severity')
        .eq('deal_id', dealInfo.id)
        .eq('status', 'active')
        .order('severity', { ascending: false })
        .limit(5)
      
      if (orgId) risksQuery = risksQuery.eq('org_id', orgId)
      
      const { data: riskSignals } = await risksQuery
      if (riskSignals) {
        for (const signal of riskSignals) {
          const severity = signal.severity === 'critical' ? '🚨' : signal.severity === 'high' ? '⚠️' : ''
          risks.push(`${severity} ${signal.title || signal.description || 'Risk identified'}`)
        }
      }
    }
    
    // Fetch action items (tasks related to contact/deal)
    const actionItems: Array<{
      id: string
      title: string
      status: 'pending' | 'completed'
      assignedTo?: string
      dueDate?: string
      fromMeeting?: string
    }> = []
    
    if (contactRow?.id || dealInfo?.id) {
      // Build base query with type assertion for proper inference
      type TaskRow = { id: string; title: string; status: string; due_date: string | null; assigned_to: string | null; contact_id: string | null; deal_id: string | null }
      
      let baseQuery = client
        .from('tasks')
        .select('id, title, status, due_date, assigned_to, contact_id, deal_id')
        .eq('user_id', userId)
        .in('status', ['todo', 'in_progress'])
        .order('due_date', { ascending: true })
        .limit(5)
      
      if (orgId) {
        baseQuery = baseQuery.eq('org_id', orgId)
      }
      // Filter by contact_id or deal_id (can match either)
      if (contactRow?.id && dealInfo?.id) {
        baseQuery = baseQuery.or(`contact_id.eq.${contactRow.id},deal_id.eq.${dealInfo.id}`)
      } else if (contactRow?.id) {
        baseQuery = baseQuery.eq('contact_id', contactRow.id)
      } else if (dealInfo?.id) {
        baseQuery = baseQuery.eq('deal_id', dealInfo.id)
      }
      
      const { data: tasks } = await baseQuery as { data: TaskRow[] | null }
      if (tasks) {
        for (const task of tasks) {
          actionItems.push({
            id: String(task.id),
            title: String(task.title),
            status: task.status === 'done' ? 'completed' : 'pending',
            dueDate: task.due_date ? new Date(task.due_date).toISOString() : undefined,
          })
        }
      }
    }
    
    // Calculate relationship duration and previous meetings count
    let relationshipDuration = '—'
    let previousMeetings = 0
    let lastMeetingDate: string | undefined = undefined
    
    if (contactRow?.id) {
      // Get contact creation date
      const { data: contactData } = await client
        .from('contacts')
        .select('created_at')
        .eq('id', contactRow.id)
        .maybeSingle()
      
      if (contactData?.created_at) {
        const contactCreated = new Date(contactData.created_at)
        const daysSince = Math.floor((now.getTime() - contactCreated.getTime()) / (1000 * 60 * 60 * 24))
        if (daysSince < 30) relationshipDuration = `${daysSince} days`
        else if (daysSince < 365) relationshipDuration = `${Math.floor(daysSince / 30)} months`
        else relationshipDuration = `${Math.floor(daysSince / 365)} years`
      }
      
      // Count previous meetings
      let meetingsCountQuery = client
        .from('meetings')
        .select('id, start_time', { count: 'exact' })
        .eq('owner_user_id', userId)
        .eq('contact_id', contactRow.id)
        .lt('start_time', event.start_time)
      
      if (orgId) {
        meetingsCountQuery = meetingsCountQuery.eq('org_id', orgId)
      }
      
      const { data: prevMeetings, count } = await meetingsCountQuery
      previousMeetings = count || 0
      
      // Get last meeting date
      if (prevMeetings && prevMeetings.length > 0) {
        const sorted = prevMeetings.sort((a: any, b: any) => 
          new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
        )
        lastMeetingDate = sorted[0].start_time
      }
    }
    
    // Generate talking points and discovery questions using Claude (if API key available)
    let talkingPoints: string[] = []
    let discoveryQuestions: string[] = []
    let opportunities: string[] = []
    
    if (ANTHROPIC_API_KEY) {
      try {
        // Build context for AI
        const contextParts: string[] = []
        if (meeting.title) contextParts.push(`Meeting: ${meeting.title}`)
        if (companyName) contextParts.push(`Company: ${companyName}`)
        if (dealInfo) {
          contextParts.push(`Deal: ${dealInfo.name} - Stage: ${dealInfo.stage} - Value: ${dealInfo.value}`)
        }
        if (lastInteractionsFinal.length > 0) {
          contextParts.push(`Recent interactions: ${lastInteractionsFinal.slice(0, 3).map(i => i.summary).join('; ')}`)
        }
        if (risks.length > 0) {
          contextParts.push(`Risks: ${risks.slice(0, 3).join('; ')}`)
        }
        
        // Add action items context - mention completed ones
        const completedActionItems = mentionedActionItems.filter(ai => ai.completed)
        const pendingActionItems = mentionedActionItems.filter(ai => !ai.completed)
        
        if (completedActionItems.length > 0) {
          contextParts.push(`Completed action items from previous meetings: ${completedActionItems.slice(0, 3).map(ai => `"${ai.text}" (from ${ai.meetingTitle})`).join('; ')}`)
        }
        if (pendingActionItems.length > 0) {
          contextParts.push(`Pending action items: ${pendingActionItems.slice(0, 3).map(ai => `"${ai.text}" (from ${ai.meetingTitle})`).join('; ')}`)
        }
        
        const context = contextParts.join('\n')
        
        // Generate talking points and discovery questions in one call
        const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1000,
            temperature: 0.5,
            system: 'You are a sales preparation assistant. Generate specific, actionable talking points and discovery questions for an upcoming meeting. When action items from previous meetings have been completed, acknowledge them naturally (e.g., "I mentioned I would do X, and I\'ve completed it"). Return ONLY valid JSON.',
            messages: [{
              role: 'user',
              content: `Generate meeting prep for this meeting:

${context}

Generate:
1. 3-4 specific talking points that address risks, move the deal forward, and build on previous conversations. If there are completed action items, naturally acknowledge them (e.g., "I said I would: {action_item} and I have completed it").
2. 3-4 discovery questions appropriate for the deal stage (if applicable) or general discovery
3. 2-3 opportunities or positive signals to leverage

Return JSON: {
  "talkingPoints": ["point1", "point2", "point3"],
  "discoveryQuestions": ["question1", "question2", "question3"],
  "opportunities": ["opportunity1", "opportunity2"]
}`
            }],
          }),
        })
        
        if (aiResponse.ok) {
          const result = await aiResponse.json()
          const content = result.content[0]?.text
          const parsed = JSON.parse(content)
          talkingPoints = parsed.talkingPoints || []
          discoveryQuestions = parsed.discoveryQuestions || []
          opportunities = parsed.opportunities || []
        }
      } catch (error) {
        console.error('[MEETING-PREP] Error generating AI content:', error)
      }
    }
    
    // Fallback talking points if AI failed
    if (talkingPoints.length === 0) {
      talkingPoints = [
        'Review any previous discussions and follow up on open items',
        'Understand their current priorities and challenges',
        'Identify next steps to move the conversation forward',
      ]
      if (risks.length > 0) {
        talkingPoints.unshift('Address any timeline or budget concerns directly')
      }
    }
    
    // Fallback discovery questions if AI failed
    if (discoveryQuestions.length === 0) {
      if (dealInfo?.stage) {
        const stageLower = dealInfo.stage.toLowerCase()
        if (stageLower.includes('sql') || stageLower.includes('qualification')) {
          discoveryQuestions = [
            'What specific challenges are you trying to solve?',
            'Who else is involved in this decision?',
            'What does your timeline look like?',
          ]
        } else if (stageLower.includes('opportunity') || stageLower.includes('proposal')) {
          discoveryQuestions = [
            'What feedback do you have on the proposal?',
            'Are there any concerns we haven\'t addressed?',
            'Who else needs to see this before you can move forward?',
          ]
        } else {
          discoveryQuestions = [
            'What are your main priorities for this call?',
            'What questions do you have for us?',
            'What would make this meeting successful for you?',
          ]
        }
      } else {
        discoveryQuestions = [
          'What are your main priorities for this call?',
          'What questions do you have for us?',
          'What would make this meeting successful for you?',
        ]
      }
    }
    
    // Fallback opportunities if AI failed
    if (opportunities.length === 0 && dealInfo) {
      opportunities = [
        `Deal is in ${dealInfo.stage} stage with ${dealInfo.probability}% probability`,
        `Deal value: ${dealInfo.value}`,
      ]
    }

    return {
      type: 'meeting_prep',
      summary: `Meeting prep: ${meeting.title}`,
      data: {
        meeting,
        contact,
        deal: dealInfo,
        lastInteractions: lastInteractionsFinal,
        talkingPoints,
        discoveryQuestions,
        actionItems,
        risks,
        opportunities,
        context: {
          relationshipDuration,
          previousMeetings,
          lastMeetingDate,
          dealStage: dealInfo?.stage,
          dealValue: dealInfo?.value,
        },
      },
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: ['calendar_events', 'activities', 'meetings', 'tasks', 'deal_risk_signals'],
      },
    }
  } catch (error) {
    console.error('[MEETING-PREP] Error structuring next meeting prep response:', error)
    return null
  }
}

/**
 * Structure calendar availability info for Copilot UI
 */
export async function structureCalendarAvailabilityResponse(
  client: any,
  userId: string,
  userMessage?: string,
  temporalContext?: TemporalContextPayload
): Promise<StructuredResponse | null> {
  try {
    const timezone = await getUserTimezone(client, userId)
    // Use temporal context date if available, otherwise fall back to current date
    const currentDate = temporalContext?.isoString 
      ? new Date(temporalContext.isoString) 
      : new Date()
    const request = inferAvailabilityRequestFromMessage(userMessage, timezone, currentDate)

    const availabilityResult = await handleCalendarAvailability(
      {
        startDate: request.start.toISOString(),
        endDate: request.end.toISOString(),
        durationMinutes: request.durationMinutes,
        workingHoursStart: request.workingHoursStart,
        workingHoursEnd: request.workingHoursEnd,
        excludeWeekends: request.excludeWeekends
      },
      client,
      userId
    )

    if (!availabilityResult) {
      return null
    }

    const now = currentDate
    const meetings = (availabilityResult.events || []).map((event: any) => {
      const startTime = event.start_time
      const endTime = event.end_time
      const startDateObj = new Date(startTime)
      let status: 'past' | 'today' | 'upcoming' = 'upcoming'
      if (startDateObj.getTime() < now.getTime()) {
        status = 'past'
      } else if (isSameZonedDay(startDateObj, timezone, currentDate)) {
        status = 'today'
      }

      const attendees = (event.attendees || []).map((att: any) => ({
        name: att.name || att.email || 'Attendee',
        email: att.email || ''
      }))

      return {
        id: event.id,
        title: event.title || 'Calendar Event',
        attendees,
        startTime,
        endTime,
        status,
        location: event.location || undefined,
        hasPrepBrief: false,
        dealId: event.deal_id || undefined,
        contactId: event.contact_id || undefined
      }
    }).slice(0, 10)

    const availabilitySlots = (availabilityResult.availableSlots || []).map((slot: any) => ({
      startTime: slot.start,
      endTime: slot.end,
      duration: slot.durationMinutes
    }))

    const slotSummary = availabilitySlots.length > 0
      ? formatAvailabilitySlotSummary(availabilitySlots[0], timezone)
      : null

    const summary = availabilitySlots.length > 0
      ? `You're free ${slotSummary}. I found ${availabilitySlots.length} open slot${availabilitySlots.length === 1 ? '' : 's'} ${request.description}.`
      : `No ${request.durationMinutes}-minute blocks are available ${request.description}. Try expanding the range or adjusting working hours.`

    const actions: Array<{
      id: string
      label: string
      type: 'primary' | 'secondary' | 'tertiary'
      icon: string
      callback: string
      params?: any
    }> = [
      {
        id: 'open-calendar',
        label: 'Open Calendar',
        type: 'primary',
        icon: 'calendar',
        callback: '/calendar'
      }
    ]

    if (availabilitySlots.length > 0) {
      actions.push({
        id: 'copy-availability',
        label: 'Copy availability summary',
        type: 'secondary',
        icon: 'clipboard',
        callback: 'copilot://copy-availability',
        params: {
          timezone,
          slots: availabilitySlots.slice(0, 3)
        }
      })
    }

    return {
      type: 'calendar',
      summary,
      data: {
        meetings,
        availability: availabilitySlots
      },
      actions,
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: ['calendar_events'],
        timezone,
        dateRange: availabilityResult.range,
        requestedDurationMinutes: availabilityResult.durationMinutes,
        workingHours: availabilityResult.workingHours,
        slotsEvaluated: availabilityResult.totalAvailableSlots,
        totalFreeMinutes: availabilityResult.summary?.totalFreeMinutes,
        totalBusyMinutes: availabilityResult.summary?.totalBusyMinutes
      }
    }
  } catch (error) {
    console.error('[STRUCTURED] Error building calendar availability response', error)
    return null
  }
}

/**
 * Shared helpers for calendar availability calculations
 */
export async function structureRoadmapResponse(
  client: any,
  userId: string,
  aiContent: string,
  userMessage: string
): Promise<any | null> {
  try {
    // Try to extract roadmap item from AI content (tool result may be in the content)
    // Look for JSON in the content that matches roadmap item structure
    let roadmapItem: TaskData | null = null
    
    // Try to parse roadmap item from AI content
    try {
      // Look for JSON objects in the content
      const jsonMatch = aiContent.match(/\{[\s\S]*"roadmapItem"[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        if (parsed.roadmapItem) {
          roadmapItem = parsed.roadmapItem
        } else if (parsed.success && parsed.roadmapItem) {
          roadmapItem = parsed.roadmapItem
        }
      }
    } catch (e) {
      // JSON parsing failed, continue to fetch from DB
    }
    
    // If not found in content, fetch the most recent roadmap item created by user
    if (!roadmapItem) {
      const { data: recentItems, error } = await client
        .from('roadmap_suggestions')
        .select('*')
        .eq('submitted_by', userId)
        .order('created_at', { ascending: false })
        .limit(1)
      
      if (error || !recentItems || recentItems.length === 0) {
        return null
      }
      
      roadmapItem = recentItems[0] as TaskData
    }
    
    if (!roadmapItem) {
      return null
    }
    
    // Extract title from user message if available
    const titleMatch = userMessage.match(/roadmap item for:\s*(.+)/i) || 
                      userMessage.match(/add.*roadmap.*for:\s*(.+)/i) ||
                      userMessage.match(/create.*roadmap.*for:\s*(.+)/i)
    
    const summary = titleMatch 
      ? `I'll create a roadmap item for: ${titleMatch[1].trim()}`
      : `I've successfully created a roadmap item.`
    
    return {
      type: 'roadmap',
      summary: summary || 'Roadmap item created successfully',
      data: {
        roadmapItem: {
          id: roadmapItem.id,
          ticket_id: roadmapItem.ticket_id || null,
          title: roadmapItem.title,
          description: roadmapItem.description || null,
          type: roadmapItem.type || 'feature',
          priority: roadmapItem.priority || 'medium',
          status: roadmapItem.status || 'submitted',
          submitted_by: roadmapItem.submitted_by,
          created_at: roadmapItem.created_at,
          updated_at: roadmapItem.updated_at
        },
        success: true,
        message: `Roadmap item "${roadmapItem.title}" created successfully`
      },
      actions: [
        {
          id: 'view-roadmap',
          label: 'View Roadmap',
          type: 'secondary' as const,
          icon: 'file-text',
          callback: '/admin/roadmap',
          params: {}
        }
      ],
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: ['roadmap_suggestions'],
        confidence: 95
      }
    }
  } catch (error) {
    return null
  }
}

/**
 * Structure action summary response from successful tool executions
 * Groups create/update/delete operations and presents them in a user-friendly format
 */
export async function structureActionSummaryResponse(
  client: any,
  userId: string,
  writeOperations: ToolExecutionDetail[],
  userMessage: string
): Promise<StructuredResponse | null> {
  try {
    const actions: Array<{
      id: string
      label: string
      type: string
      icon: string
      callback: string
      params?: any
    }> = []
    
    const actionItems: Array<{
      entityType: string
      operation: string
      entityId?: string
      entityName?: string
      details?: string
      success: boolean
    }> = []
    
    let dealsUpdated = 0
    let clientsUpdated = 0
    let tasksCreated = 0
    let activitiesCreated = 0
    let contactsUpdated = 0
    let calendarEventsUpdated = 0
    
    // Process each write operation
    for (const exec of writeOperations) {
      const [entity, operation] = exec.toolName.split('_')
      const result = exec.result
      
      if (!result || !result.success) continue
      
      let entityType = entity
      let entityId: string | undefined
      let entityName: string | undefined
      let details: string | undefined
      
      // Extract entity information based on operation type
      if (operation === 'create') {
        if (entity === 'pipeline' && result.deal) {
          entityType = 'deal'
          entityId = result.deal.id
          entityName = result.deal.name || result.deal.company
          dealsUpdated++
        } else if (entity === 'clients' && result.client) {
          entityType = 'client'
          entityId = result.client.id
          entityName = result.client.company_name
          if (result.client.subscription_amount) {
            details = `Subscription: £${parseFloat(result.client.subscription_amount).toLocaleString()}/month`
          }
          clientsUpdated++
        } else if (entity === 'tasks' && result.task) {
          entityType = 'task'
          entityId = result.task.id
          entityName = result.task.title
          tasksCreated++
        } else if (entity === 'activities' && result.activity) {
          entityType = 'activity'
          entityId = result.activity.id
          entityName = result.activity.client_name || result.activity.type
          activitiesCreated++
        } else if (entity === 'leads' && result.contact) {
          entityType = 'contact'
          entityId = result.contact.id
          entityName = result.contact.full_name || result.contact.email
          if (result.contact.company_id) {
            details = `Created contact with company link`
          }
          contactsUpdated++
        } else if (entity === 'calendar' && result.event) {
          entityType = 'calendar_event'
          entityId = result.event.id
          entityName = result.event.title
          // Format the event time
          if (result.event.start_time) {
            const startTime = new Date(result.event.start_time)
            const timeStr = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
            const dateStr = startTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
            details = `Scheduled for ${dateStr} at ${timeStr}`
          } else {
            details = 'Event created successfully'
          }
          calendarEventsUpdated++
        }
      } else if (operation === 'update') {
        if (entity === 'pipeline' && result.deal) {
          entityType = 'deal'
          entityId = result.deal.id
          entityName = result.deal.name || result.deal.company
          // Check if status was updated to 'won'
          if (exec.args.status === 'won') {
            details = 'Marked as closed won'
          } else {
            details = 'Updated successfully'
          }
          dealsUpdated++
        } else if (entity === 'clients' && result.client) {
          entityType = 'client'
          entityId = result.client.id
          entityName = result.client.company_name
          if (exec.args.subscription_amount !== undefined) {
            details = `Subscription updated to £${parseFloat(exec.args.subscription_amount).toLocaleString()}/month`
          } else {
            details = 'Updated successfully'
          }
          clientsUpdated++
        } else if (entity === 'leads' && result.contact) {
          entityType = 'contact'
          entityId = result.contact.id
          entityName = result.contact.full_name || result.contact.email || result.contact.first_name
          // Try to detect what was updated
          if (exec.args.company_id || exec.args.company) {
            details = `Company updated to ${exec.args.company || 'linked company'}`
          } else {
            details = 'Contact updated successfully'
          }
          contactsUpdated++
        } else if (entity === 'calendar' && result.event) {
          entityType = 'calendar_event'
          entityId = result.event.id
          entityName = result.event.title
          // Try to detect what was updated
          if (exec.args.start_time || exec.args.end_time) {
            const startTime = exec.args.start_time ? new Date(exec.args.start_time) : null
            if (startTime) {
              const timeStr = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
              details = `Rescheduled to ${timeStr}`
            } else {
              details = 'Event updated successfully'
            }
          } else {
            details = 'Event updated successfully'
          }
          calendarEventsUpdated++
        }
      }
      
      if (entityId) {
        actionItems.push({
          entityType,
          operation,
          entityId,
          entityName,
          details,
          success: true
        })
      }
    }
    
    // Generate summary text
    const actionCounts: string[] = []
    if (dealsUpdated > 0) actionCounts.push(`${dealsUpdated} deal${dealsUpdated > 1 ? 's' : ''}`)
    if (clientsUpdated > 0) actionCounts.push(`${clientsUpdated} client${clientsUpdated > 1 ? 's' : ''}`)
    if (contactsUpdated > 0) actionCounts.push(`${contactsUpdated} contact${contactsUpdated > 1 ? 's' : ''}`)
    if (tasksCreated > 0) actionCounts.push(`${tasksCreated} task${tasksCreated > 1 ? 's' : ''}`)
    if (activitiesCreated > 0) actionCounts.push(`${activitiesCreated} activit${activitiesCreated > 1 ? 'ies' : 'y'}`)
    if (calendarEventsUpdated > 0) actionCounts.push(`${calendarEventsUpdated} calendar event${calendarEventsUpdated > 1 ? 's' : ''}`)
    
    const summary = actionCounts.length > 0
      ? `I've successfully completed your request. Updated ${actionCounts.join(', ')}.`
      : "I've completed the requested actions."
    
    // Generate quick actions
    if (dealsUpdated > 0) {
      actions.push({
        id: 'view-pipeline',
        label: 'View Pipeline',
        type: 'primary',
        icon: 'briefcase',
        callback: '/crm/pipeline'
      })
    }
    
    if (clientsUpdated > 0) {
      actions.push({
        id: 'view-clients',
        label: 'View Clients',
        type: 'secondary',
        icon: 'users',
        callback: '/crm/clients'
      })
    }
    
    if (contactsUpdated > 0) {
      actions.push({
        id: 'view-contacts',
        label: 'View Contacts',
        type: 'secondary',
        icon: 'users',
        callback: '/crm/contacts'
      })
    }
    
    if (tasksCreated > 0) {
      actions.push({
        id: 'view-tasks',
        label: 'View Tasks',
        type: 'secondary',
        icon: 'check-circle',
        callback: '/crm/tasks'
      })
    }

    if (calendarEventsUpdated > 0) {
      actions.push({
        id: 'view-calendar',
        label: 'View Calendar',
        type: 'secondary',
        icon: 'calendar',
        callback: '/calendar'
      })
    }

    return {
      type: 'action_summary',
      summary,
      data: {
        actionsCompleted: actionItems.length,
        actionItems,
        metrics: {
          dealsUpdated,
          clientsUpdated,
          contactsUpdated,
          tasksCreated,
          activitiesCreated,
          calendarEventsUpdated
        }
      },
      actions,
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: ['tool_executions'],
        confidence: 100
      }
    }
  } catch (error) {
    console.error('[ACTION-SUMMARY] Error generating action summary:', error)
    return null
  }
}

/**
 * Structure sales coach response with performance analysis
 */
export async function structureSalesCoachResponse(
  client: any,
  userId: string,
  aiContent: string,
  userMessage: string,
  requestingUserId?: string
): Promise<StructuredResponse | null> {
  try {
    console.log('[SALES-COACH] Starting structureSalesCoachResponse:', {
      userId,
      requestingUserId,
      userMessage: userMessage.substring(0, 100),
      isAdminQuery: requestingUserId && requestingUserId !== userId
    })
    
    // Check if requesting user is admin (if different from target user)
    const isAdminQuery = requestingUserId && requestingUserId !== userId
    let targetUserName = 'You'
    
    if (isAdminQuery) {
      console.log('[SALES-COACH] Admin query detected, verifying permissions...')
      // Verify requesting user is admin
      const { data: requestingUser } = await client
        .from('profiles')
        .select('is_admin')
        .eq('id', requestingUserId)
        .single()
      
      if (!requestingUser?.is_admin) {
        console.log('[SALES-COACH] ❌ Permission denied - requesting user is not admin')
        return null // Permission denied
      }
      
      console.log('[SALES-COACH] ✅ Admin permission verified')
      
      // Get target user's name for display
      const { data: targetUser } = await client
        .from('profiles')
        .select('first_name, last_name, email')
        .eq('id', userId)
        .single()
      
      if (targetUser) {
        targetUserName = targetUser.first_name && targetUser.last_name
          ? `${targetUser.first_name} ${targetUser.last_name}`
          : targetUser.email || 'User'
        console.log('[SALES-COACH] Target user name:', targetUserName)
      } else {
        console.log('[SALES-COACH] ⚠️ Target user not found:', userId)
      }
    }
    
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()
    const currentDay = now.getDate()
    
    // Previous month (same day)
    const previousMonth = currentMonth === 0 ? 11 : currentMonth - 1
    const previousYear = currentMonth === 0 ? currentYear - 1 : currentYear
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December']
    
    // Calculate date ranges
    const currentStart = new Date(currentYear, currentMonth, 1)
    const currentEnd = new Date(currentYear, currentMonth, currentDay, 23, 59, 59)
    const previousStart = new Date(previousYear, previousMonth, 1)
    const previousEnd = new Date(previousYear, previousMonth, currentDay, 23, 59, 59)
    
    console.log('[SALES-COACH] Date ranges calculated:', {
      current: { start: currentStart.toISOString(), end: currentEnd.toISOString() },
      previous: { start: previousStart.toISOString(), end: previousEnd.toISOString() },
      targetUserId: userId
    })
    
    // Fetch deals for current month
    console.log('[SALES-COACH] Fetching current month deals for user:', userId)
    const { data: currentDeals, error: currentDealsError } = await client
      .from('deals')
      .select('id, name, value, stage, close_date, created_at')
      .eq('user_id', userId)
      .gte('created_at', currentStart.toISOString())
      .lte('created_at', currentEnd.toISOString())
      .order('close_date', { ascending: false })
    
    if (currentDealsError) {
      console.error('[SALES-COACH] ❌ Error fetching current deals:', currentDealsError)
    } else {
      console.log('[SALES-COACH] ✅ Current month deals fetched:', currentDeals?.length || 0)
    }
    
    // Fetch deals for previous month
    console.log('[SALES-COACH] Fetching previous month deals for user:', userId)
    const { data: previousDeals, error: previousDealsError } = await client
      .from('deals')
      .select('id, name, value, stage, close_date, created_at')
      .eq('user_id', userId)
      .gte('created_at', previousStart.toISOString())
      .lte('created_at', previousEnd.toISOString())
      .order('close_date', { ascending: false })
    
    if (previousDealsError) {
      console.error('[SALES-COACH] ❌ Error fetching previous deals:', previousDealsError)
    } else {
      console.log('[SALES-COACH] ✅ Previous month deals fetched:', previousDeals?.length || 0)
    }
    
    // Fetch activities for current month
    console.log('[SALES-COACH] Fetching current month activities for user:', userId)
    const { data: currentActivities, error: currentActivitiesError } = await client
      .from('activities')
      .select('id, type, created_at')
      .eq('user_id', userId)
      .gte('created_at', currentStart.toISOString())
      .lte('created_at', currentEnd.toISOString())
    
    if (currentActivitiesError) {
      console.error('[SALES-COACH] ❌ Error fetching current activities:', currentActivitiesError)
    } else {
      console.log('[SALES-COACH] ✅ Current month activities fetched:', currentActivities?.length || 0)
    }
    
    // Fetch activities for previous month
    console.log('[SALES-COACH] Fetching previous month activities for user:', userId)
    const { data: previousActivities, error: previousActivitiesError } = await client
      .from('activities')
      .select('id, type, created_at')
      .eq('user_id', userId)
      .gte('created_at', previousStart.toISOString())
      .lte('created_at', previousEnd.toISOString())
    
    if (previousActivitiesError) {
      console.error('[SALES-COACH] ❌ Error fetching previous activities:', previousActivitiesError)
    } else {
      console.log('[SALES-COACH] ✅ Previous month activities fetched:', previousActivities?.length || 0)
    }
    
    // Fetch meetings for current month
    console.log('[SALES-COACH] Fetching current month meetings for user:', userId)
    const { data: currentMeetings, error: currentMeetingsError } = await client
      .from('meetings')
      .select('id, created_at')
      .eq('owner_user_id', userId)
      .gte('created_at', currentStart.toISOString())
      .lte('created_at', currentEnd.toISOString())
    
    if (currentMeetingsError) {
      console.error('[SALES-COACH] ❌ Error fetching current meetings:', currentMeetingsError)
    } else {
      console.log('[SALES-COACH] ✅ Current month meetings fetched:', currentMeetings?.length || 0)
    }
    
    // Fetch meetings for previous month
    console.log('[SALES-COACH] Fetching previous month meetings for user:', userId)
    const { data: previousMeetings, error: previousMeetingsError } = await client
      .from('meetings')
      .select('id, created_at')
      .eq('owner_user_id', userId)
      .gte('created_at', previousStart.toISOString())
      .lte('created_at', previousEnd.toISOString())
    
    if (previousMeetingsError) {
      console.error('[SALES-COACH] ❌ Error fetching previous meetings:', previousMeetingsError)
    } else {
      console.log('[SALES-COACH] ✅ Previous month meetings fetched:', previousMeetings?.length || 0)
    }
    
    // Calculate metrics
    const currentClosed = (currentDeals || []).filter(d => d.stage === 'Signed' && d.close_date)
    const previousClosed = (previousDeals || []).filter(d => d.stage === 'Signed' && d.close_date)
    
    const currentRevenue = currentClosed.reduce((sum, d) => sum + (d.value || 0), 0)
    const previousRevenue = previousClosed.reduce((sum, d) => sum + (d.value || 0), 0)
    
    const currentMeetingsCount = (currentMeetings || []).length
    const previousMeetingsCount = (previousMeetings || []).length
    
    const currentOutbound = (currentActivities || []).filter(a => a.type === 'outbound').length
    const previousOutbound = (previousActivities || []).filter(a => a.type === 'outbound').length
    
    const currentTotalActivities = (currentActivities || []).length
    const previousTotalActivities = (previousActivities || []).length
    
    const currentAvgDealValue = currentClosed.length > 0 ? currentRevenue / currentClosed.length : 0
    const previousAvgDealValue = previousClosed.length > 0 ? previousRevenue / previousClosed.length : 0
    
    // Get active pipeline value
    const { data: activeDeals } = await client
      .from('deals')
      .select('id, name, value, stage')
      .eq('user_id', userId)
      .in('stage', ['SQL', 'Opportunity', 'Verbal'])
    
    const pipelineValue = (activeDeals || []).reduce((sum, d) => sum + (d.value || 0), 0)
    
    // Calculate comparisons
    const calculateChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0
      return ((current - previous) / previous) * 100
    }
    
    const salesChange = calculateChange(currentRevenue, previousRevenue)
    const activitiesChange = calculateChange(currentTotalActivities, previousTotalActivities)
    const pipelineChange = 0 // Would need previous pipeline value
    
    const salesComparison = {
      current: currentRevenue,
      previous: previousRevenue,
      change: salesChange,
      changeType: salesChange > 0 ? 'increase' : salesChange < 0 ? 'decrease' : 'neutral',
      verdict: salesChange > 0 
        ? `Significantly Better - You've closed ${formatCurrency(currentRevenue)} in ${monthNames[currentMonth]} vs ${formatCurrency(previousRevenue)} in ${monthNames[previousMonth]} at the same point.`
        : salesChange < 0
        ? `Below Pace - You closed ${formatCurrency(currentRevenue)} vs ${formatCurrency(previousRevenue)} in ${monthNames[previousMonth]}.`
        : 'Similar performance to previous month.'
    }
    
    const activitiesComparison = {
      current: currentTotalActivities,
      previous: previousTotalActivities,
      change: activitiesChange,
      changeType: activitiesChange > 0 ? 'increase' : activitiesChange < 0 ? 'decrease' : 'neutral',
      verdict: activitiesChange > 0
        ? `Higher Activity - ${currentTotalActivities} activities vs ${previousTotalActivities} in ${monthNames[previousMonth]}.`
        : activitiesChange < 0
        ? `Slightly Below Pace - ${currentTotalActivities} activities vs ${previousTotalActivities} in ${monthNames[previousMonth]}.`
        : 'Similar activity level to previous month.'
    }
    
    const pipelineComparison = {
      current: pipelineValue,
      previous: pipelineValue, // Would need to fetch previous
      change: 0,
      changeType: 'neutral' as const,
      verdict: `Strong pipeline with ${formatCurrency(pipelineValue)} in active opportunities.`
    }
    
    // Determine overall performance
    let overall: 'significantly_better' | 'better' | 'similar' | 'worse' | 'significantly_worse' = 'similar'
    if (salesChange > 50) overall = 'significantly_better'
    else if (salesChange > 0) overall = 'better'
    else if (salesChange < -50) overall = 'significantly_worse'
    else if (salesChange < 0) overall = 'worse'
    
    // Generate insights
    const insights: Array<{
      id: string
      type: 'positive' | 'warning' | 'opportunity'
      title: string
      description: string
      impact: 'high' | 'medium' | 'low'
    }> = []
    
    if (currentRevenue > previousRevenue) {
      insights.push({
        id: 'revenue-growth',
        type: 'positive' as const,
        title: 'Revenue Generation',
        description: `You're ahead on closed sales in ${monthNames[currentMonth]} (+${formatCurrency(currentRevenue - previousRevenue)} vs ${monthNames[previousMonth]}).`,
        impact: 'high' as const
      })
    }
    
    if (currentTotalActivities < previousTotalActivities) {
      insights.push({
        id: 'activity-pace',
        type: 'warning' as const,
        title: 'Activity Level',
        description: `${monthNames[previousMonth]} had higher activity volume - you may want to maintain that pace.`,
        impact: 'medium' as const
      })
    }
    
    if (activeDeals && activeDeals.length > 0) {
      const highValueDeals = activeDeals.filter(d => (d.value || 0) >= 8000)
      if (highValueDeals.length > 0) {
        insights.push({
          id: 'opportunity-quality',
          type: 'opportunity' as const,
          title: 'Opportunity Quality',
          description: `Strong pipeline with ${highValueDeals.length} $8K+ deals in Opportunity stage.`,
          impact: 'high' as const
        })
      }
    }
    
    // Generate recommendations
    const recommendations: Array<{
      id: string
      priority: 'high' | 'medium' | 'low'
      title: string
      description: string
      actionItems: string[]
    }> = []
    
    if (activeDeals && activeDeals.length > 0) {
      recommendations.push({
        id: 'focus-opportunities',
        priority: 'high' as const,
        title: 'Focus on High-Value Opportunities',
        description: 'Keep the momentum on the $8K+ opportunities in your pipeline.',
        actionItems: [
          'Review and prioritize high-value deals',
          'Schedule follow-ups for Opportunity stage deals',
          'Move deals from Opportunity to closure'
        ]
      })
    }
    
    if (currentTotalActivities < previousTotalActivities) {
      recommendations.push({
        id: 'increase-activity',
        priority: 'medium' as const,
        title: 'Maintain Activity Pace',
        description: 'Maintain or increase outbound activity to match previous month\'s pace.',
        actionItems: [
          'Schedule more outbound calls',
          'Increase email outreach',
          'Set daily activity goals'
        ]
      })
    }
    
    console.log('[SALES-COACH] Calculating metrics...', {
      currentClosed: currentClosed.length,
      previousClosed: previousClosed.length,
      currentRevenue,
      previousRevenue,
      currentMeetingsCount,
      previousMeetingsCount,
      currentTotalActivities,
      previousTotalActivities,
      pipelineValue
    })
    
    const response = {
      type: 'sales_coach',
      summary: isAdminQuery 
        ? `${targetUserName}'s performance comparison: ${monthNames[currentMonth]} ${currentYear} (through day ${currentDay}) vs ${monthNames[previousMonth]} ${previousYear} (through day ${currentDay})`
        : `Performance comparison: ${monthNames[currentMonth]} ${currentYear} (through day ${currentDay}) vs ${monthNames[previousMonth]} ${previousYear} (through day ${currentDay})`,
      data: {
        comparison: {
          sales: salesComparison,
          activities: activitiesComparison,
          pipeline: pipelineComparison,
          overall
        },
        metrics: {
          currentMonth: {
            closedDeals: currentClosed.length,
            totalRevenue: currentRevenue,
            averageDealValue: currentAvgDealValue,
            meetings: currentMeetingsCount,
            outboundActivities: currentOutbound,
            totalActivities: currentTotalActivities,
            pipelineValue,
            deals: (currentDeals || []).map(d => ({
              id: d.id,
              name: d.name,
              value: d.value || 0,
              stage: d.stage,
              closedDate: d.close_date
            }))
          },
          previousMonth: {
            closedDeals: previousClosed.length,
            totalRevenue: previousRevenue,
            averageDealValue: previousAvgDealValue,
            meetings: previousMeetingsCount,
            outboundActivities: previousOutbound,
            totalActivities: previousTotalActivities,
            pipelineValue: 0, // Would need to fetch
            deals: (previousDeals || []).map(d => ({
              id: d.id,
              name: d.name,
              value: d.value || 0,
              stage: d.stage,
              closedDate: d.close_date
            }))
          }
        },
        insights,
        recommendations,
        period: {
          current: { month: monthNames[currentMonth], year: currentYear, day: currentDay },
          previous: { month: monthNames[previousMonth], year: previousYear, day: currentDay }
        }
      },
      actions: [],
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: ['deals', 'activities', 'meetings'],
        confidence: 90
      }
    }
    
    console.log('[SALES-COACH] ✅ Response generated successfully:', {
      type: response.type,
      hasData: !!response.data,
      hasComparison: !!response.data?.comparison,
      hasMetrics: !!response.data?.metrics,
      hasInsights: !!response.data?.insights?.length,
      hasRecommendations: !!response.data?.recommendations?.length,
      summary: response.summary?.substring(0, 100)
    })
    
    return response
  } catch (error) {
    console.error('[SALES-COACH] ❌ Exception in structureSalesCoachResponse:', error)
    return null
  }
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Pipeline Outreach Helpers
// ---------------------------------------------------------------------------

/**
 * Enriches pipeline outreach drafts with last meeting context per contact.
 * For each draft, resolves the contact by email or name, then fetches their
 * most recent meeting with pending action items.
 */
async function enrichPipelineOutreachDrafts(
  structured: StructuredResponse,
  client: any,
  userId: string,
): Promise<StructuredResponse> {
  try {
    const data = structured.data as any
    const drafts = data?.email_drafts
    if (!Array.isArray(drafts) || drafts.length === 0) return structured

    for (const draft of drafts) {
      try {
        let contactId = draft.contactId

        // Resolve contact if we don't have a contactId
        if (!contactId && draft.to) {
          const { data: contact } = await client
            .from('contacts')
            .select('id')
            .eq('email', draft.to)
            .eq('owner_id', userId)
            .maybeSingle()
          contactId = contact?.id
        }
        if (!contactId && draft.contactName) {
          const { data: contact } = await client
            .from('contacts')
            .select('id')
            .ilike('full_name', draft.contactName)
            .eq('owner_id', userId)
            .maybeSingle()
          contactId = contact?.id
        }

        if (!contactId) continue

        // Backfill contactId on the draft if we resolved it
        if (!draft.contactId) draft.contactId = contactId

        // Fetch most recent meeting for this contact
        let meeting = null

        // Try primary_contact_id first
        const { data: primaryMeeting } = await client
          .from('meetings')
          .select('id, title, summary, meeting_start, meeting_action_items(id, title, completed)')
          .eq('primary_contact_id', contactId)
          .eq('owner_user_id', userId)
          .order('meeting_start', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (primaryMeeting) {
          meeting = primaryMeeting
        } else {
          // Check meeting_contacts junction
          const { data: junctionRow } = await client
            .from('meeting_contacts')
            .select('meeting_id')
            .eq('contact_id', contactId)
            .limit(1)
            .maybeSingle()

          if (junctionRow?.meeting_id) {
            const { data: junctionMeeting } = await client
              .from('meetings')
              .select('id, title, summary, meeting_start, meeting_action_items(id, title, completed)')
              .eq('id', junctionRow.meeting_id)
              .eq('owner_user_id', userId)
              .maybeSingle()
            meeting = junctionMeeting
          }
        }

        if (meeting) {
          const pendingItems = (Array.isArray(meeting.meeting_action_items) ? meeting.meeting_action_items : [])
            .filter((item: any) => !item.completed)
            .map((item: any) => ({ id: item.id, title: item.title }))

          draft.meetingContext = {
            meetingId: meeting.id,
            meetingTitle: meeting.title,
            meetingDate: meeting.meeting_start,
            meetingSummary: meeting.summary ? meeting.summary.slice(0, 500) : null,
            pendingActionItems: pendingItems,
          }
        }
      } catch (draftErr) {
        // Log but don't fail the whole response for one draft
        console.warn('[PIPELINE-OUTREACH] Failed to enrich draft:', draft.contactName, draftErr)
      }
    }

    return structured
  } catch (err) {
    console.warn('[PIPELINE-OUTREACH] Enrichment failed, returning unenriched:', err)
    return structured
  }
}

/**
 * Detects whether the AI response contains pipeline health data + multiple
 * email drafts — the "pipeline outreach" combo.
 */
function detectPipelineOutreachContent(messageLower: string, aiContent: string): boolean {
  const contentLower = aiContent.toLowerCase()

  // Must have pipeline / deal health indicators
  const hasPipelineContext =
    contentLower.includes('pipeline health') ||
    contentLower.includes('pipeline summary') ||
    contentLower.includes('pipeline overview') ||
    contentLower.includes('stale deal') ||
    contentLower.includes('deals needing attention') ||
    contentLower.includes('at-risk deal') ||
    contentLower.includes('deals at risk') ||
    (contentLower.includes('pipeline') && contentLower.includes('health score'))

  // Must have multiple email drafts (look for 2+ "Subject:" lines)
  const subjectMatches = aiContent.match(/\bsubject\s*:/gi) || []
  const hasMultipleEmails = subjectMatches.length >= 2

  // Or user explicitly asked for pipeline + emails/outreach/follow-up
  const userAskedPipelineOutreach =
    (messageLower.includes('pipeline') || messageLower.includes('stale') || messageLower.includes('at risk') || messageLower.includes('at-risk')) &&
    (messageLower.includes('email') || messageLower.includes('outreach') || messageLower.includes('follow up') || messageLower.includes('follow-up') || messageLower.includes('followup'))

  return (hasPipelineContext && hasMultipleEmails) || (userAskedPipelineOutreach && hasMultipleEmails)
}

/**
 * Parses pipeline health summary + email drafts from AI markdown content
 * into a structured pipeline_outreach response.
 */
function parsePipelineOutreachFromContent(aiContent: string): StructuredResponse | null {
  try {
    // ---- Extract pipeline summary metrics ----
    const staleMatch = aiContent.match(/(\d+)\s*(?:stale|inactive|dormant)\s*deal/i)
    const totalDealsMatch = aiContent.match(/(\d+)\s*(?:total|active)?\s*deal/i)
    const healthScoreMatch = aiContent.match(/health\s*score[:\s]*(\d+)/i)
    const zeroInteractionMatch = aiContent.match(/(\d+)\s*(?:deal|contact)s?\s*(?:with\s*)?(?:no|zero)\s*(?:interaction|contact|activity)/i)

    const staleCount = staleMatch ? parseInt(staleMatch[1], 10) : 0
    const totalDeals = totalDealsMatch ? parseInt(totalDealsMatch[1], 10) : staleCount
    const healthScore = healthScoreMatch ? parseInt(healthScoreMatch[1], 10) : undefined
    const zeroInteractionCount = zeroInteractionMatch ? parseInt(zeroInteractionMatch[1], 10) : undefined

    // Determine risk level from content or infer from stale ratio
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'medium'
    const contentLower = aiContent.toLowerCase()
    if (contentLower.includes('critical') || contentLower.includes('urgent')) riskLevel = 'critical'
    else if (contentLower.includes('high risk') || contentLower.includes('high-risk')) riskLevel = 'high'
    else if (contentLower.includes('low risk') || contentLower.includes('healthy')) riskLevel = 'low'
    else if (totalDeals > 0 && staleCount / totalDeals > 0.5) riskLevel = 'high'

    // ---- Extract email drafts ----
    // Split on "Subject:" boundaries to find individual drafts
    const emailBlocks = aiContent.split(/(?=(?:^|\n)(?:#{1,4}\s*)?(?:\d+[\.\)]\s*)?(?:Email|Draft|Follow[- ]?up)?[^:\n]*?\bSubject\s*:)/i)

    const emailDrafts: Array<{
      contactName: string
      company?: string
      to?: string
      subject: string
      body: string
      urgency: 'high' | 'medium' | 'low'
      strategyNotes?: string
      lastInteraction?: string
      daysSinceContact?: number
    }> = []

    for (const block of emailBlocks) {
      const subjectMatch = block.match(/\bSubject\s*:\s*(.+?)(?:\n|$)/i)
      if (!subjectMatch) continue

      const subject = subjectMatch[1].trim().replace(/^\*+|\*+$/g, '')

      // Extract "To:" if present
      const toMatch = block.match(/\bTo\s*:\s*(.+?)(?:\n|$)/i)
      const to = toMatch ? toMatch[1].trim().replace(/^\*+|\*+$/g, '') : undefined

      // Extract contact name — look for name patterns
      const nameFromTo = to?.replace(/<[^>]+>/g, '').trim()
      const nameFromHeader = block.match(/(?:for|to|contact|name)\s*:\s*\**([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\**/i)
      const contactName = nameFromTo || nameFromHeader?.[1] || 'Contact'

      // Extract company
      const companyMatch = block.match(/(?:company|organization|org)\s*:\s*\**(.+?)\**(?:\n|$)/i)
      const company = companyMatch ? companyMatch[1].trim() : undefined

      // Extract body — everything after "Body:" or between subject and next section
      let body = ''
      const bodyMatch = block.match(/\bBody\s*:\s*([\s\S]*?)(?=\n(?:---|\*\*|#{1,4}\s|Strategy|Note|Urgency|Last|Days)|$)/i)
      if (bodyMatch) {
        body = bodyMatch[1].trim()
      } else {
        // Fallback: take content after Subject line, skip metadata lines
        const afterSubject = block.substring(block.indexOf(subjectMatch[0]) + subjectMatch[0].length)
        const lines = afterSubject.split('\n')
        const bodyLines: string[] = []
        let foundContent = false
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) { if (foundContent) bodyLines.push(''); continue }
          if (/^(To|From|CC|BCC|Company|Organization|Urgency|Priority|Strategy|Note|Last|Days)\s*:/i.test(trimmed)) continue
          if (/^(#{1,4}\s|---|\*\*\*)/.test(trimmed)) break
          foundContent = true
          bodyLines.push(trimmed)
        }
        body = bodyLines.join('\n').trim()
      }

      if (!body && !subject) continue

      // Extract urgency
      let urgency: 'high' | 'medium' | 'low' = 'medium'
      const urgencyMatch = block.match(/(?:urgency|priority)\s*:\s*\**(\w+)\**/i)
      if (urgencyMatch) {
        const u = urgencyMatch[1].toLowerCase()
        if (u === 'high' || u === 'urgent' || u === 'critical') urgency = 'high'
        else if (u === 'low') urgency = 'low'
      }

      // Extract strategy notes
      const strategyMatch = block.match(/(?:strategy|approach|note)\s*:\s*(.+?)(?:\n|$)/i)
      const strategyNotes = strategyMatch ? strategyMatch[1].trim().replace(/^\*+|\*+$/g, '') : undefined

      // Extract last interaction / days since contact
      const lastInteractionMatch = block.match(/(?:last (?:interaction|contact|activity))\s*:\s*(.+?)(?:\n|$)/i)
      const lastInteraction = lastInteractionMatch ? lastInteractionMatch[1].trim() : undefined

      const daysMatch = block.match(/(\d+)\s*days?\s*(?:since|ago|without)/i)
      const daysSinceContact = daysMatch ? parseInt(daysMatch[1], 10) : undefined

      emailDrafts.push({
        contactName,
        company,
        to,
        subject,
        body,
        urgency,
        strategyNotes,
        lastInteraction,
        daysSinceContact,
      })
    }

    // Need at least 2 drafts to qualify as pipeline outreach
    if (emailDrafts.length < 2) return null

    const draftCount = emailDrafts.length
    return {
      type: 'pipeline_outreach',
      summary: `Here's your pipeline health summary with ${draftCount} follow-up email${draftCount !== 1 ? 's' : ''} ready to review.`,
      data: {
        pipeline_summary: {
          stale_count: staleCount,
          total_deals: totalDeals,
          risk_level: riskLevel,
          health_score: healthScore,
          zero_interaction_count: zeroInteractionCount,
        },
        email_drafts: emailDrafts,
      },
      actions: [
        {
          id: 'queue-all',
          label: 'Add All to Action Centre',
          type: 'secondary',
          callback: 'queue_all_emails',
          params: { count: draftCount },
        },
      ],
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: ['pipeline', 'email', 'crm'],
      },
    }
  } catch (err) {
    console.error('[PIPELINE-OUTREACH] Error parsing content:', err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Main entry point: detectAndStructureResponse
// ---------------------------------------------------------------------------

/**
 * Detects the appropriate structured response type based on user message,
 * AI content, tool executions, and sequence results.
 *
 * This is the shared version extracted from api-copilot/index.ts.
 * It preserves all 48+ response type mappings.
 *
 * @param userMessage - The user's original message
 * @param aiContent - The AI's text response
 * @param client - Supabase client
 * @param userId - The user ID
 * @param toolsUsed - List of tool names used
 * @param requestingUserId - Admin user making the request (optional)
 * @param context - Chat request context (optional)
 * @param toolExecutions - Detailed tool execution metadata
 */
export async function detectAndStructureResponse(
  userMessage: string,
  aiContent: string,
  client: any,
  userId: string,
  toolsUsed: string[] = [],
  requestingUserId?: string,
  context?: ChatRequestContext,
  toolExecutions: ToolExecutionDetail[] = [],
): Promise<StructuredResponse | null> {
  const messageLower = userMessage.toLowerCase()
  const originalMessage = userMessage

  // ---------------------------------------------------------------------------
  // Sequence-aware structured responses
  // ---------------------------------------------------------------------------
  if (toolExecutions && toolExecutions.length > 0) {
    console.log('[STRUCTURED] Processing toolExecutions:', {
      count: toolExecutions.length,
      tools: toolExecutions.map((e: any) => ({
        name: e.toolName,
        success: e.success,
        action: e.args?.action,
        hasResult: !!e.result
      }))
    })

    const allSeqExecs = toolExecutions
      .filter((e) => e.toolName === 'execute_action' && (e as any).args?.action === 'run_sequence')

    const runSeqExec = allSeqExecs.slice(-1)[0] as any

    const seqKey = runSeqExec?.args?.params?.sequence_key
      ? String(runSeqExec.args.params.sequence_key)
      : null

    const seqResult = runSeqExec?.result?.data || runSeqExec?.result || null
    const finalOutputs = seqResult?.final_output?.outputs || seqResult?.outputs || null

    if (seqKey) {
      console.log('[STRUCTURED] Processing sequence response:', {
        seqKey,
        runSeqSuccess: runSeqExec?.success,
        hasResult: !!seqResult,
        hasFinalOutputs: !!finalOutputs,
        outputKeys: finalOutputs ? Object.keys(finalOutputs) : [],
        resultKeys: seqResult ? Object.keys(seqResult) : [],
        resultError: runSeqExec?.result?.error || null
      })

      // Pipeline Focus Tasks
      if (seqKey === 'seq-pipeline-focus-tasks') {
        const dealsFromOutputs = finalOutputs?.pipeline_deals?.deals ||
                                  finalOutputs?.pipeline_deals ||
                                  seqResult?.pipeline_deals?.deals ||
                                  seqResult?.pipeline_deals ||
                                  []
        const deals = Array.isArray(dealsFromOutputs) ? dealsFromOutputs : []
        const topDeal = deals[0] || null
        const taskPreview = finalOutputs?.task_preview || seqResult?.task_preview || null

        return {
          type: 'pipeline_focus_tasks',
          summary: deals.length > 0
            ? `Here are the deals to focus on and the task I can create for you.`
            : 'Your pipeline looks healthy! No urgent deals need attention right now.',
          data: {
            sequenceKey: seqKey,
            isSimulation: seqResult?.is_simulation === true,
            executionId: seqResult?.execution_id,
            deal: topDeal,
            taskPreview,
          },
          actions: [],
          metadata: {
            timeGenerated: new Date().toISOString(),
            dataSource: ['sequence', 'crm'],
          },
        }
      }

      // Deal Rescue Pack
      if (seqKey === 'seq-deal-rescue-pack') {
        const deal = Array.isArray(finalOutputs?.deal?.deals) ? finalOutputs.deal.deals[0] : null
        const plan = finalOutputs?.plan || null
        const taskPreview = finalOutputs?.task_previews || null

        return {
          type: 'deal_rescue_pack',
          summary: 'Here\u2019s the deal diagnosis + rescue plan, and the task I can create.',
          data: {
            sequenceKey: seqKey,
            isSimulation: seqResult?.is_simulation === true,
            executionId: seqResult?.execution_id,
            deal,
            plan,
            taskPreview,
          },
          actions: [],
          metadata: {
            timeGenerated: new Date().toISOString(),
            dataSource: ['sequence', 'crm'],
          },
        }
      }

      // Next Meeting Command Center
      if (seqKey === 'seq-next-meeting-command-center') {
        const nextMeeting = finalOutputs?.next_meeting?.meeting || null
        const prepTaskPreview = finalOutputs?.prep_task_preview || null

        return {
          type: 'next_meeting_command_center',
          summary: 'Here\u2019s your next meeting brief and a prep checklist task ready to create.',
          data: {
            sequenceKey: seqKey,
            isSimulation: seqResult?.is_simulation === true,
            executionId: seqResult?.execution_id,
            meeting: nextMeeting,
            brief: finalOutputs?.brief || null,
            prepTaskPreview,
          },
          actions: [],
          metadata: {
            timeGenerated: new Date().toISOString(),
            dataSource: ['sequence', 'calendar', 'crm'],
          },
        }
      }

      // Post-Meeting Follow-Up Pack
      if (seqKey === 'seq-post-meeting-followup-pack') {
        const meeting = Array.isArray(finalOutputs?.meeting_data?.meetings)
          ? finalOutputs.meeting_data.meetings[0]
          : null

        const contact = Array.isArray(finalOutputs?.contact_data?.contacts)
          ? finalOutputs.contact_data.contacts[0]
          : null

        return {
          type: 'post_meeting_followup_pack',
          summary: 'Here\u2019s your follow-up pack (email, Slack update, and tasks) ready to send/create.',
          data: {
            sequenceKey: seqKey,
            isSimulation: seqResult?.is_simulation === true,
            executionId: seqResult?.execution_id,
            meeting,
            contact,
            digest: finalOutputs?.digest || null,
            pack: finalOutputs?.pack || null,
            emailPreview: finalOutputs?.email_preview || null,
            slackPreview: finalOutputs?.slack_preview || null,
            taskPreview: finalOutputs?.task_preview || null,
          },
          actions: [],
          metadata: {
            timeGenerated: new Date().toISOString(),
            dataSource: ['sequence', 'meetings', 'crm', 'email', 'messaging'],
          },
        }
      }

      // Deal MAP Builder
      if (seqKey === 'seq-deal-map-builder') {
        const deal = Array.isArray(finalOutputs?.deal?.deals) ? finalOutputs.deal.deals[0] : null
        const openTasks = finalOutputs?.open_tasks || null
        const plan = finalOutputs?.plan || null
        const taskPreview = finalOutputs?.task_previews || null

        return {
          type: 'deal_map_builder',
          summary: 'Here\'s a Mutual Action Plan (MAP) for this deal, with milestones and the top task ready to create.',
          data: {
            sequenceKey: seqKey,
            isSimulation: seqResult?.is_simulation === true,
            executionId: seqResult?.execution_id,
            deal,
            openTasks,
            plan,
            taskPreview,
          },
          actions: [],
          metadata: {
            timeGenerated: new Date().toISOString(),
            dataSource: ['sequence', 'crm', 'tasks'],
          },
        }
      }

      // Daily Focus Plan
      if (seqKey === 'seq-daily-focus-plan') {
        const pipelineDeals = finalOutputs?.pipeline_deals || null
        const contactsNeedingAttention = finalOutputs?.contacts_needing_attention || null
        const openTasks = finalOutputs?.open_tasks || null
        const plan = finalOutputs?.plan || null
        const taskPreview = finalOutputs?.task_previews || null

        return {
          type: 'daily_focus_plan',
          summary: 'Here\'s your daily focus plan: priorities, next best actions, and the top task ready to create.',
          data: {
            sequenceKey: seqKey,
            isSimulation: seqResult?.is_simulation === true,
            executionId: seqResult?.execution_id,
            pipelineDeals,
            contactsNeedingAttention,
            openTasks,
            plan,
            taskPreview,
          },
          actions: [],
          metadata: {
            timeGenerated: new Date().toISOString(),
            dataSource: ['sequence', 'crm', 'tasks'],
          },
        }
      }

      // Follow-Up Zero Inbox
      if (seqKey === 'seq-followup-zero-inbox') {
        const emailThreads = finalOutputs?.email_threads || null
        const triage = finalOutputs?.triage || null
        const replyDrafts = finalOutputs?.reply_drafts || null
        const emailPreview = finalOutputs?.email_preview || null
        const taskPreview = finalOutputs?.task_preview || null

        return {
          type: 'followup_zero_inbox',
          summary: 'Here are the email threads needing response, reply drafts, and a follow-up task ready to create.',
          data: {
            sequenceKey: seqKey,
            isSimulation: seqResult?.is_simulation === true,
            executionId: seqResult?.execution_id,
            emailThreads,
            triage,
            replyDrafts,
            emailPreview,
            taskPreview,
          },
          actions: [],
          metadata: {
            timeGenerated: new Date().toISOString(),
            dataSource: ['sequence', 'email', 'crm', 'tasks'],
          },
        }
      }

      // Deal Slippage Guardrails
      if (seqKey === 'seq-deal-slippage-guardrails') {
        const atRiskDeals = finalOutputs?.at_risk_deals || null
        const diagnosis = finalOutputs?.diagnosis || null
        const taskPreview = finalOutputs?.task_preview || null
        const slackPreview = finalOutputs?.slack_preview || null

        return {
          type: 'deal_slippage_guardrails',
          summary: 'Here are the at-risk deals, rescue actions, and a rescue task + Slack update ready to create/post.',
          data: {
            sequenceKey: seqKey,
            isSimulation: seqResult?.is_simulation === true,
            executionId: seqResult?.execution_id,
            atRiskDeals,
            diagnosis,
            taskPreview,
            slackPreview,
          },
          actions: [],
          metadata: {
            timeGenerated: new Date().toISOString(),
            dataSource: ['sequence', 'crm', 'tasks', 'messaging'],
          },
        }
      }

      // Catch Me Up (Daily Brief)
      if (seqKey === 'seq-catch-me-up') {
        console.log('[STRUCTURED] seq-catch-me-up - finalOutputs keys:', finalOutputs ? Object.keys(finalOutputs) : 'null')
        console.log('[STRUCTURED] seq-catch-me-up - seqResult keys:', seqResult ? Object.keys(seqResult) : 'null')

        const hour = new Date().getHours()
        const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'

        const extractArray = (key: string, subKey: string) => {
          if (finalOutputs?.[key]?.[subKey] && Array.isArray(finalOutputs[key][subKey])) {
            return finalOutputs[key][subKey]
          }
          if (finalOutputs?.[key] && Array.isArray(finalOutputs[key])) {
            return finalOutputs[key]
          }
          if (seqResult?.[key]?.[subKey] && Array.isArray(seqResult[key][subKey])) {
            return seqResult[key][subKey]
          }
          if (seqResult?.[key] && Array.isArray(seqResult[key])) {
            return seqResult[key]
          }
          return []
        }

        const meetingsToday = extractArray('meetings_today', 'meetings')
        const meetingsTomorrow = extractArray('meetings_tomorrow', 'meetings')
        const staleDeals = extractArray('stale_deals', 'deals')
        const closingSoonDeals = extractArray('closing_soon_deals', 'deals')
        const contactsNeedingAttention = extractArray('contacts_needing_attention', 'contacts')
        const pendingTasks = extractArray('pending_tasks', 'tasks')
        const dailyBrief = finalOutputs?.daily_brief || seqResult?.daily_brief || null

        const priorityDeals = [...staleDeals, ...closingSoonDeals].slice(0, 5)

        const greeting = timeOfDay === 'morning'
          ? "Good morning! Here's your day ahead."
          : timeOfDay === 'afternoon'
          ? "Here's your afternoon update."
          : "Wrapping up the day. Here's your summary."

        const schedule = meetingsToday.map((m: any) => ({
          id: m.id || '',
          title: m.title || m.summary || 'Meeting',
          startTime: m.start_time || m.meeting_start || '',
          endTime: m.end_time || m.meeting_end || '',
          attendees: m.attendees?.map((a: any) => a.email || a.name) || [],
          linkedDealId: m.deal_id || null,
          linkedDealName: m.deal_name || null,
          meetingUrl: m.meeting_url || m.conference_link || null,
        }))

        const formattedDeals = priorityDeals.map((d: any) => ({
          id: d.id || '',
          name: d.name || '',
          value: d.value || d.amount || null,
          stage: d.stage_name || d.stage || null,
          daysStale: d.days_stale || d.days_since_activity || null,
          closeDate: d.expected_close_date || d.close_date || null,
          healthStatus: d.health_status || (d.days_stale > 7 ? 'stale' : 'healthy'),
          company: d.company_name || d.company || null,
          contactName: d.contact_name || null,
          contactEmail: d.contact_email || null,
        }))

        const formattedContacts = contactsNeedingAttention.map((c: any) => ({
          id: c.id || '',
          name: c.full_name || c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown',
          email: c.email || null,
          company: c.company_name || c.company || null,
          lastContactDate: c.last_contact_date || c.last_activity_date || c.last_interaction_at || null,
          daysSinceContact: c.days_since_last_contact || null,
          healthStatus: c.health_status || 'unknown',
          riskLevel: c.risk_level || 'unknown',
          riskFactors: c.risk_factors || [],
          reason: c.reason || (c.risk_level === 'high' ? 'high risk' : c.health_status === 'ghost' ? 'going dark' : 'needs follow-up'),
        }))

        const formattedTasks = pendingTasks.map((t: any) => ({
          id: t.id || '',
          title: t.title || '',
          dueDate: t.due_date || null,
          priority: t.priority || 'medium',
          status: t.status || 'pending',
          linkedDealId: t.deal_id || null,
          linkedContactId: t.contact_id || null,
        }))

        const meetingCount = schedule.length
        const dealCount = formattedDeals.length
        const taskCount = formattedTasks.length
        const summary = dailyBrief?.summary ||
          `You have ${meetingCount} meeting${meetingCount !== 1 ? 's' : ''} today` +
          (dealCount > 0 ? `, ${dealCount} deal${dealCount !== 1 ? 's' : ''} needing attention` : '') +
          (taskCount > 0 ? `, and ${taskCount} pending task${taskCount !== 1 ? 's' : ''}` : '') +
          '.'

        return {
          type: 'daily_brief',
          summary,
          data: {
            sequenceKey: seqKey,
            isSimulation: seqResult?.is_simulation === true,
            executionId: seqResult?.execution_id,
            greeting,
            timeOfDay,
            schedule,
            priorityDeals: formattedDeals,
            contactsNeedingAttention: formattedContacts,
            tasks: formattedTasks,
            tomorrowPreview: timeOfDay === 'evening' ? meetingsTomorrow.map((m: any) => ({
              id: m.id || '',
              title: m.title || m.summary || 'Meeting',
              startTime: m.start_time || m.meeting_start || '',
            })) : undefined,
            summary,
          },
          actions: [],
          metadata: {
            timeGenerated: new Date().toISOString(),
            dataSource: ['sequence', 'calendar', 'crm', 'tasks'],
          },
        }
      }
    }

    // Dynamic table creation (via execute_action or dedicated search_leads tool)
    const dynamicTableExec = toolExecutions
      .filter((e: any) => e?.success && (
        (e?.toolName === 'execute_action' && e?.args?.action === 'search_leads_create_table') ||
        (e?.toolName === 'search_leads')
      ))
      .slice(-1)[0] as any;

    if (dynamicTableExec?.result?.data) {
      const dtResult = dynamicTableExec.result.data;
      return {
        type: 'dynamic_table',
        summary: `Created an Ops "${dtResult.table_name || 'Untitled'}" with ${dtResult.row_count || 0} leads.`,
        data: {
          table_id: dtResult.table_id,
          table_name: dtResult.table_name || 'Untitled Table',
          row_count: dtResult.row_count || 0,
          column_count: dtResult.column_count || 0,
          source_type: dtResult.source_type || 'apollo',
          enriched_count: dtResult.enriched_count || 0,
          preview_rows: dtResult.preview_rows || [],
          preview_columns: dtResult.preview_columns || [],
          query_description: dtResult.query_description || '',
        },
        actions: [
          {
            id: 'open-table',
            label: 'Open Table',
            type: 'primary',
            callback: 'open_dynamic_table',
            params: { table_id: dtResult.table_id },
          },
          {
            id: 'add-enrichment',
            label: 'Add Enrichment',
            type: 'secondary',
            callback: 'add_enrichment',
            params: { table_id: dtResult.table_id },
          },
        ],
        metadata: {
          timeGenerated: new Date().toISOString(),
          dataSource: ['dynamic_tables', 'apollo'],
        },
      };
    }

    // Ops table list
    const listOpsExec = toolExecutions
      .filter((e: any) => e?.toolName === 'execute_action' && e?.success && e?.args?.action === 'list_ops_tables')
      .slice(-1)[0] as any;

    if (listOpsExec?.result?.data?.tables) {
      const tables = listOpsExec.result.data.tables;
      return {
        type: 'ops_table_list',
        summary: `Found ${tables.length} ops table${tables.length !== 1 ? 's' : ''}.`,
        data: {
          tables: tables.map((t: any) => ({
            id: t.id,
            name: t.name,
            description: t.description,
            source_type: t.source_type,
            row_count: t.row_count,
            updated_at: t.updated_at,
          })),
          count: tables.length,
        },
        actions: tables.slice(0, 3).map((t: any) => ({
          id: `open-table-${t.id}`,
          label: t.name || 'Open Table',
          type: 'secondary',
          callback: 'open_dynamic_table',
          params: { table_id: t.id },
        })),
        metadata: {
          timeGenerated: new Date().toISOString(),
          dataSource: ['dynamic_tables'],
        },
      };
    }

    // Ops table detail (get_ops_table)
    const getOpsExec = toolExecutions
      .filter((e: any) => e?.toolName === 'execute_action' && e?.success && e?.args?.action === 'get_ops_table')
      .slice(-1)[0] as any;

    if (getOpsExec?.result?.data) {
      const tbl = getOpsExec.result.data;
      return {
        type: 'ops_table_detail',
        summary: `Table "${tbl.name}" has ${tbl.columns?.length || 0} columns and ${tbl.row_count || 0} rows.`,
        data: {
          table_id: tbl.id,
          table_name: tbl.name,
          description: tbl.description,
          source_type: tbl.source_type,
          row_count: tbl.row_count,
          columns: tbl.columns || [],
        },
        actions: [
          {
            id: 'open-table',
            label: 'Open Table',
            type: 'primary',
            callback: 'open_dynamic_table',
            params: { table_id: tbl.id },
          },
          {
            id: 'add-enrichment',
            label: 'Add Enrichment',
            type: 'secondary',
            callback: 'add_enrichment',
            params: { table_id: tbl.id },
          },
        ],
        metadata: {
          timeGenerated: new Date().toISOString(),
          dataSource: ['dynamic_tables'],
        },
      };
    }

    // Ops table data (get_ops_table_data)
    const tableDataExec = toolExecutions
      .filter((e: any) => e?.toolName === 'execute_action' && e?.success && e?.args?.action === 'get_ops_table_data')
      .slice(-1)[0] as any;

    if (tableDataExec?.result?.data) {
      const td = tableDataExec.result.data;
      return {
        type: 'ops_table_data',
        summary: `Showing ${td.row_count || 0} rows from "${td.table_name}".`,
        data: {
          table_name: td.table_name,
          columns: td.columns || [],
          rows: td.rows || [],
          row_count: td.row_count,
          offset: td.offset,
          limit: td.limit,
        },
        actions: [
          {
            id: 'open-table',
            label: 'Open Full Table',
            type: 'primary',
            callback: 'open_dynamic_table',
            params: { table_id: tableDataExec.args?.params?.table_id },
          },
        ],
        metadata: {
          timeGenerated: new Date().toISOString(),
          dataSource: ['dynamic_tables'],
        },
      };
    }

    // Ops table creation result
    const createOpsExec = toolExecutions
      .filter((e: any) => e?.toolName === 'execute_action' && e?.success && e?.args?.action === 'create_ops_table')
      .slice(-1)[0] as any;

    if (createOpsExec?.result?.data?.table_id) {
      const cr = createOpsExec.result.data;
      return {
        type: 'ops_table_created',
        summary: cr.message || `Created ops table "${cr.name}".`,
        data: {
          table_id: cr.table_id,
          table_name: cr.name,
          column_count: cr.column_count,
        },
        actions: [
          {
            id: 'open-table',
            label: 'Open Table',
            type: 'primary',
            callback: 'open_dynamic_table',
            params: { table_id: cr.table_id },
          },
        ],
        metadata: {
          timeGenerated: new Date().toISOString(),
          dataSource: ['dynamic_tables'],
        },
      };
    }

    // Enrichment status
    const enrichStatusExec = toolExecutions
      .filter((e: any) => e?.toolName === 'execute_action' && e?.success && e?.args?.action === 'get_enrichment_status')
      .slice(-1)[0] as any;

    if (enrichStatusExec?.result?.data?.jobs) {
      const jobs = enrichStatusExec.result.data.jobs;
      const activeJobs = jobs.filter((j: any) => j.status === 'running' || j.status === 'pending');
      return {
        type: 'ops_enrichment_status',
        summary: `${jobs.length} enrichment job${jobs.length !== 1 ? 's' : ''} found${activeJobs.length > 0 ? ` (${activeJobs.length} active)` : ''}.`,
        data: {
          jobs,
          count: jobs.length,
          active_count: activeJobs.length,
        },
        actions: enrichStatusExec.args?.params?.table_id ? [
          {
            id: 'open-table',
            label: 'Open Table',
            type: 'primary',
            callback: 'open_dynamic_table',
            params: { table_id: enrichStatusExec.args.params.table_id },
          },
        ] : [],
        metadata: {
          timeGenerated: new Date().toISOString(),
          dataSource: ['enrichment_jobs'],
        },
      };
    }

    // Ops insights
    const insightsExec = toolExecutions
      .filter((e: any) => e?.toolName === 'execute_action' && e?.success && e?.args?.action === 'get_ops_insights')
      .slice(-1)[0] as any;

    if (insightsExec?.result?.data) {
      const insData = insightsExec.result.data;
      const insights = insData.insights || [];
      return {
        type: 'ops_insights',
        summary: `${insights.length} insight${insights.length !== 1 ? 's' : ''} generated${insData.cached ? ' (cached)' : ''}.`,
        data: {
          insights,
          count: insights.length,
          cached: insData.cached || false,
        },
        actions: insightsExec.args?.params?.table_id ? [
          {
            id: 'open-table',
            label: 'Open Table',
            type: 'secondary',
            callback: 'open_dynamic_table',
            params: { table_id: insightsExec.args.params.table_id },
          },
        ] : [],
        metadata: {
          timeGenerated: new Date().toISOString(),
          dataSource: ['ops_table_insights'],
        },
      };
    }

    // Ops sync results (hubspot, attio, instantly)
    const syncExec = toolExecutions
      .filter((e: any) => e?.toolName === 'execute_action' && e?.success &&
        ['sync_ops_hubspot', 'sync_ops_attio', 'push_ops_to_instantly'].includes(e?.args?.action))
      .slice(-1)[0] as any;

    if (syncExec?.result?.data) {
      const syncAction = syncExec.args.action;
      const providerMap: Record<string, string> = {
        sync_ops_hubspot: 'HubSpot',
        sync_ops_attio: 'Attio',
        push_ops_to_instantly: 'Instantly',
      };
      const provider = providerMap[syncAction] || 'Integration';
      return {
        type: 'ops_sync_result',
        summary: `${provider} sync completed successfully.`,
        data: {
          provider,
          action: syncAction,
          result: syncExec.result.data,
        },
        actions: syncExec.args?.params?.table_id ? [
          {
            id: 'open-table',
            label: 'Open Table',
            type: 'primary',
            callback: 'open_dynamic_table',
            params: { table_id: syncExec.args.params.table_id },
          },
        ] : [],
        metadata: {
          timeGenerated: new Date().toISOString(),
          dataSource: ['dynamic_tables', syncAction],
        },
      };
    }

    // Ops rules list
    const rulesExec = toolExecutions
      .filter((e: any) => e?.toolName === 'execute_action' && e?.success && e?.args?.action === 'list_ops_rules')
      .slice(-1)[0] as any;

    if (rulesExec?.result?.data?.rules) {
      const rules = rulesExec.result.data.rules;
      return {
        type: 'ops_rules_list',
        summary: `${rules.length} automation rule${rules.length !== 1 ? 's' : ''} found.`,
        data: {
          rules: rules.map((r: any) => ({
            id: r.id,
            name: r.name,
            trigger_type: r.trigger_type,
            action_type: r.action_type,
            is_enabled: r.is_enabled,
            consecutive_failures: r.consecutive_failures,
          })),
          count: rules.length,
        },
        actions: rulesExec.args?.params?.table_id ? [
          {
            id: 'open-table',
            label: 'Open Table',
            type: 'secondary',
            callback: 'open_dynamic_table',
            params: { table_id: rulesExec.args.params.table_id },
          },
        ] : [],
        metadata: {
          timeGenerated: new Date().toISOString(),
          dataSource: ['ops_rules'],
        },
      };
    }

    // AI query result
    const aiQueryExec = toolExecutions
      .filter((e: any) => e?.toolName === 'execute_action' && e?.success && e?.args?.action === 'ai_query_ops_table')
      .slice(-1)[0] as any;

    if (aiQueryExec?.result?.data) {
      return {
        type: 'ops_ai_query_result',
        summary: 'AI analysis of table data completed.',
        data: aiQueryExec.result.data,
        actions: aiQueryExec.args?.params?.table_id ? [
          {
            id: 'open-table',
            label: 'Open Table',
            type: 'secondary',
            callback: 'open_dynamic_table',
            params: { table_id: aiQueryExec.args.params.table_id },
          },
        ] : [],
        metadata: {
          timeGenerated: new Date().toISOString(),
          dataSource: ['ops_table_ai_query'],
        },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Meetings list from get_meetings_for_period
  // ---------------------------------------------------------------------------
  if (toolExecutions && toolExecutions.length > 0) {
    const meetingsForPeriodExec = toolExecutions
      .filter((e: any) => e?.toolName === 'execute_action' && e?.success && e?.args?.action === 'get_meetings_for_period')
      .slice(-1)[0] as any

    const raw = meetingsForPeriodExec?.result?.data || null
    const rawMeetings = Array.isArray(raw?.meetings) ? raw.meetings : []

    if (raw && rawMeetings.length >= 0) {
      let userEmailDomain: string | null = null
      try {
        const { data: profile } = await client
          .from('profiles')
          .select('email')
          .eq('id', userId)
          .maybeSingle()
        const email = profile?.email ? String(profile.email) : ''
        const domain = email.includes('@') ? email.split('@')[1] : ''
        userEmailDomain = domain || null
      } catch {
        userEmailDomain = null
      }

      const rawPeriod = raw?.period ? String(raw.period).toLowerCase() : 'today'
      const validPeriods = ['today', 'tomorrow', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'this_week', 'next_week']
      const period = validPeriods.includes(rawPeriod) ? rawPeriod : 'today'

      const periodLabels: Record<string, string> = {
        today: 'today',
        tomorrow: 'tomorrow',
        monday: 'Monday',
        tuesday: 'Tuesday',
        wednesday: 'Wednesday',
        thursday: 'Thursday',
        friday: 'Friday',
        saturday: 'Saturday',
        sunday: 'Sunday',
        this_week: 'this week',
        next_week: 'next week',
      }
      const periodLabel = periodLabels[period] || period

      const meetings = rawMeetings.map((m: any) => {
        const attendeesRaw = Array.isArray(m.attendees) ? m.attendees : []
        const organizerEmail = m.organizer_email ? String(m.organizer_email) : null

        const attendees = attendeesRaw
          .map((a: any) => {
            const email = a?.email ? String(a.email) : ''
            const name = a?.name ? String(a.name) : undefined

            const isOrganizer = organizerEmail ? email.toLowerCase() === organizerEmail.toLowerCase() : false
            const isExternal = userEmailDomain
              ? !email.toLowerCase().endsWith(`@${userEmailDomain.toLowerCase()}`)
              : false

            const ctx = Array.isArray(m.attendeeContext) ? m.attendeeContext : []
            const ctxMatch = ctx.find((x: any) => x?.email && String(x.email).toLowerCase() === email.toLowerCase())
            const crmContactId = ctxMatch?.contactId ? String(ctxMatch.contactId) : undefined

            return {
              email,
              name,
              isExternal,
              isOrganizer,
              crmContactId,
            }
          })
          .filter((a: any) => !!a.email)

        const hasExternal = attendees.some((a: any) => a.isExternal === true)
        const meetingType = hasExternal ? 'sales' : 'internal'

        const statusRaw = m?.status ? String(m.status) : 'confirmed'
        const status =
          statusRaw === 'tentative' ? 'tentative' :
          statusRaw === 'cancelled' ? 'cancelled' :
          'confirmed'

        return {
          id: String(m.id),
          source: 'google_calendar',
          title: m?.title ? String(m.title) : 'Meeting',
          startTime: String(m.startTime || m.start_time || ''),
          endTime: String(m.endTime || m.end_time || ''),
          durationMinutes: Number(m.durationMinutes || m.duration_minutes || 0) || 0,
          attendees,
          location: m?.location ? String(m.location) : undefined,
          meetingUrl: m?.meetingUrl ? String(m.meetingUrl) : undefined,
          meetingType,
          status,
        }
      })

      const totalDurationMinutes = meetings.reduce((sum: number, m: any) => sum + (Number(m.durationMinutes) || 0), 0)
      const external = meetings.filter((m: any) => m.meetingType === 'sales').length
      const internal = meetings.length - external

      return {
        type: 'meeting_list',
        summary: `Here are your meetings for ${periodLabel}.`,
        data: {
          meetings,
          period,
          periodLabel,
          totalCount: meetings.length,
          totalDurationMinutes,
          breakdown: {
            internal,
            external,
            withDeals: 0,
          },
        },
        actions: [],
        metadata: {
          timeGenerated: new Date().toISOString(),
          dataSource: ['calendar'],
        },
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Availability question
  // ---------------------------------------------------------------------------
  if (isAvailabilityQuestion(messageLower)) {
    const availabilityStructured = await structureCalendarAvailabilityResponse(
      client,
      userId,
      userMessage,
      context?.temporalContext
    )
    if (availabilityStructured) {
      return availabilityStructured
    }
  }

  // ---------------------------------------------------------------------------
  // calendar_read tool execution
  // ---------------------------------------------------------------------------
  if (toolExecutions && toolExecutions.length > 0) {
    const calendarReadExecution = toolExecutions.find(exec =>
      exec.toolName === 'calendar_read' && exec.success
    )

    if (calendarReadExecution && calendarReadExecution.result) {
      console.log('[CALENDAR-SEARCH] Found calendar_read execution, structuring response')
      const calendarStructured = await structureCalendarSearchResponse(
        client,
        userId,
        calendarReadExecution.result,
        userMessage,
        context?.temporalContext
      )
      if (calendarStructured) {
        return calendarStructured
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Write operations -> action summary
  // ---------------------------------------------------------------------------
  if (toolExecutions && toolExecutions.length > 0) {
    const writeOperations = toolExecutions.filter(exec => {
      if (!exec.success) return false
      const toolName = exec.toolName
      return toolName.includes('_create') || toolName.includes('_update') || toolName.includes('_delete')
    })

    if (writeOperations.length > 0) {
      console.log('[ACTION-SUMMARY] Found write operations, generating action summary:', writeOperations.map(e => e.toolName))
      const actionSummary = await structureActionSummaryResponse(client, userId, writeOperations, userMessage)
      if (actionSummary) {
        return actionSummary
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Pipeline outreach detection (batch emails from pipeline health review)
  // Must fire BEFORE single-email detection to capture multi-draft responses
  // ---------------------------------------------------------------------------
  const isPipelineOutreachContent = detectPipelineOutreachContent(messageLower, aiContent)
  if (isPipelineOutreachContent) {
    console.log('[PIPELINE-OUTREACH] Detected pipeline health + email drafts in response')
    let structured = parsePipelineOutreachFromContent(aiContent)
    if (structured) {
      structured = await enrichPipelineOutreachDrafts(structured, client, userId)
      return structured
    }
  }

  // ---------------------------------------------------------------------------
  // Email draft detection
  // ---------------------------------------------------------------------------
  const isEmailDraftRequest =
    (messageLower.includes('draft') && messageLower.includes('email')) ||
    (messageLower.includes('write') && messageLower.includes('email')) ||
    (messageLower.includes('follow-up') && messageLower.includes('email')) ||
    (messageLower.includes('follow up') && messageLower.includes('email')) ||
    (messageLower.includes('followup') && messageLower.includes('email')) ||
    messageLower.includes('email to') ||
    messageLower.includes('compose email') ||
    (messageLower.includes('send') && messageLower.includes('email'))

  if (isEmailDraftRequest) {
    console.log('[EMAIL-DRAFT] Detected email draft request:', userMessage)
    const structured = await structureEmailDraftResponse(client, userId, userMessage, aiContent, context)
    if (structured) {
      return structured
    }
  }

  // ---------------------------------------------------------------------------
  // Task creation detection
  // ---------------------------------------------------------------------------
  const taskCreationKeywords = [
    'create a task', 'add a task', 'new task', 'create task', 'add task',
    'remind me to', 'remind me', 'remind to', 'remind',
    'schedule a task', 'set a task', 'task to',
    'todo to', 'to-do to', 'follow up with', 'follow-up with',
    'follow up', 'follow-up', 'followup'
  ]

  const isPipelineFocusTaskRequest =
    (messageLower.includes('deal') || messageLower.includes('deals') || messageLower.includes('pipeline')) &&
    (messageLower.includes('focus') || messageLower.includes('priorit')) &&
    (messageLower.includes('schedule') || messageLower.includes('task') || messageLower.includes('tasks')) &&
    (messageLower.includes('engage') || messageLower.includes('outreach') || messageLower.includes('follow up') || messageLower.includes('follow-up'))

  const isAffirmativeConfirmation =
    /^(yes|yep|yeah|y|ok|okay|sure|do it|go ahead|confirm|approved|create it|create the task|yes create|yes create a task)\b/i.test(
      userMessage.trim()
    )

  const isAboutEmail = messageLower.includes('email')

  const isTaskCreationRequest =
    !isAboutEmail && !isPipelineFocusTaskRequest && !isAffirmativeConfirmation && (
      taskCreationKeywords.some(keyword => messageLower.includes(keyword)) ||
      (messageLower.includes('task') && (messageLower.includes('create') || messageLower.includes('add') || messageLower.includes('for') || messageLower.includes('to'))) ||
      (messageLower.includes('remind') && (messageLower.includes('to') || messageLower.includes('me') || messageLower.includes('about'))) ||
      (messageLower.includes('follow') && (messageLower.includes('up') || messageLower.includes('with'))) ||
      (messageLower.includes('reminder') && (messageLower.includes('for') || messageLower.includes('about')))
    )

  if (isTaskCreationRequest) {
    const structured = await structureTaskCreationResponse(client, userId, userMessage)
    return structured
  }

  // ---------------------------------------------------------------------------
  // Meeting prep detection (exclude from activity creation)
  // ---------------------------------------------------------------------------
  const meetingPrepKeywords = [
    'prep me for', 'prep for', 'prepare me for', 'prepare for',
    'brief me for', 'briefing for', 'brief me on', 'brief on',
    'ready for meeting', 'ready me for', 'get ready for',
    'meeting prep', 'meeting briefing', 'meeting preparation',
    'help me prepare', 'what should i know'
  ]
  const isMeetingPrepRequest = meetingPrepKeywords.some(keyword => messageLower.includes(keyword)) ||
    (messageLower.includes('prep') && messageLower.includes('meeting')) ||
    (messageLower.includes('prepare') && messageLower.includes('meeting')) ||
    (messageLower.includes('brief') && messageLower.includes('meeting'))

  // ---------------------------------------------------------------------------
  // Activity creation detection
  // ---------------------------------------------------------------------------
  const proposalKeywords = ['add a proposal', 'create proposal', 'add proposal', 'proposal for', 'new proposal']
  const meetingKeywords = ['add a meeting', 'create meeting', 'add meeting', 'meeting with', 'new meeting']
  const saleKeywords = ['add a sale', 'create sale', 'add sale', 'sale for', 'new sale']
  const outboundKeywords = ['add outbound', 'create outbound', 'outbound for', 'new outbound']

  const isProposalRequest = proposalKeywords.some(keyword => messageLower.includes(keyword)) ||
    (messageLower.includes('proposal') && (messageLower.includes('add') || messageLower.includes('create') || messageLower.includes('for')))
  const isMeetingRequest = !isMeetingPrepRequest && (meetingKeywords.some(keyword => messageLower.includes(keyword)) ||
    (messageLower.includes('meeting') && (messageLower.includes('add') || messageLower.includes('create') || messageLower.includes('with'))))
  const isSaleRequest = saleKeywords.some(keyword => messageLower.includes(keyword)) ||
    (messageLower.includes('sale') && (messageLower.includes('add') || messageLower.includes('create') || messageLower.includes('for')))
  const isOutboundRequest = outboundKeywords.some(keyword => messageLower.includes(keyword)) ||
    (messageLower.includes('outbound') && (messageLower.includes('add') || messageLower.includes('create') || messageLower.includes('for')))

  if ((isProposalRequest || isMeetingRequest || isSaleRequest || isOutboundRequest)) {
    const activityType = isProposalRequest ? 'proposal' : isMeetingRequest ? 'meeting' : isSaleRequest ? 'sale' : 'outbound'
    const structured = await structureActivityCreationResponse(client, userId, userMessage, activityType)
    return structured
  }

  // ---------------------------------------------------------------------------
  // Pipeline queries
  // ---------------------------------------------------------------------------
  const isPipelineQuery =
    messageLower.includes('pipeline') ||
    messageLower.includes('deal') ||
    messageLower.includes('deals') ||
    (messageLower.includes('what should i prioritize') && (messageLower.includes('pipeline') || messageLower.includes('deal'))) ||
    messageLower.includes('needs attention') ||
    messageLower.includes('at risk') ||
    messageLower.includes('pipeline health') ||
    (messageLower.includes('show me my') && (messageLower.includes('deal') || messageLower.includes('pipeline')))

  if (isPipelineQuery && !isPipelineFocusTaskRequest) {
    const structured = await structurePipelineResponse(client, userId, aiContent, userMessage)
    return structured
  }

  // ---------------------------------------------------------------------------
  // Email history queries
  // ---------------------------------------------------------------------------
  const emailHistoryKeywords = [
    'last email', 'last emails', 'recent email', 'recent emails',
    'emails from', 'emails with', 'emails have', 'emails did',
    'email history', 'communication history', 'email thread',
    'gmail', 'inbox', 'messages from', 'latest emails', 'label'
  ]

  const genericEmailQuery =
    messageLower.includes('email') && (
      messageLower.includes('show') ||
      messageLower.includes('find') ||
      messageLower.includes('list') ||
      messageLower.includes('last') ||
      messageLower.includes('past') ||
      messageLower.includes('recent') ||
      messageLower.includes('what') ||
      messageLower.includes('have i had') ||
      messageLower.includes('label') ||
      messageLower.includes('this evening') ||
      messageLower.includes('tonight') ||
      messageLower.includes('today') ||
      messageLower.includes('hours')
    )

  const wantsEmailHistory =
    emailHistoryKeywords.some(keyword => messageLower.includes(keyword)) ||
    genericEmailQuery

  if (wantsEmailHistory) {
    const structured = await structureCommunicationHistoryResponse(client, userId, userMessage, context)
    if (structured) {
      return structured
    }
  }

  // ---------------------------------------------------------------------------
  // Calendar/meeting queries
  // ---------------------------------------------------------------------------
  const weekdayKeywords = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  const calendarBaseKeywords = [
    'meeting', 'calendar', 'schedule', 'availability', 'free time',
    'free slot', 'free slots', 'when am i free', 'am i free',
    'when am i available', 'when am i open', 'available on', 'available next',
    'find time', 'find availability', 'book time', 'open slot',
    'free this', 'free next', 'free on'
  ]
  const mentionsWeekday = weekdayKeywords.some(keyword => messageLower.includes(keyword))
  const mentionsFreeOrAvailable = messageLower.includes('free') || messageLower.includes('available')
  const isCalendarQuery =
    calendarBaseKeywords.some(keyword => messageLower.includes(keyword)) ||
    (mentionsFreeOrAvailable && mentionsWeekday) ||
    (mentionsFreeOrAvailable && messageLower.includes('next week')) ||
    (mentionsFreeOrAvailable && messageLower.includes('this week'))

  if (isCalendarQuery) {
    const availabilityKeywords = [
      'when am i free', 'free this', 'free on', 'find time',
      'find availability', 'availability', 'free time', 'open slot',
      'book time', 'available on', 'next free', 'available slots'
    ]

    const wantsAvailability =
      availabilityKeywords.some(keyword => messageLower.includes(keyword)) ||
      (messageLower.includes('free') && (messageLower.includes('when') || messageLower.includes('what'))) ||
      messageLower.includes('free on') ||
      messageLower.includes('open time')

    if (wantsAvailability) {
      const structured = await structureCalendarAvailabilityResponse(
        client,
        userId,
        userMessage,
        context?.temporalContext
      )
      if (structured) {
        return structured
      }
    }

    return null
  }

  // ---------------------------------------------------------------------------
  // Task queries
  // ---------------------------------------------------------------------------
  const taskKeywords = [
    'task', 'tasks', 'todo', 'to-do', 'to do',
    'high priority task', 'priority task', 'urgent task',
    'my task', 'my tasks', 'list task', 'list tasks',
    'show task', 'show tasks', 'what task', 'what tasks',
    'due today', 'overdue', 'pending task', 'completed task',
    'task list', 'task summary', 'task overview'
  ]

  const hasTaskKeyword = taskKeywords.some(keyword => messageLower.includes(keyword))

  const taskPhrases = [
    (messageLower.includes('list') && (messageLower.includes('task') || messageLower.includes('priority') || messageLower.includes('todo'))),
    (messageLower.includes('show') && (messageLower.includes('task') || messageLower.includes('my task') || messageLower.includes('priority'))),
    (messageLower.includes('what') && (messageLower.includes('task') || messageLower.includes('todo'))),
    (messageLower.includes('high priority') && (messageLower.includes('task') || messageLower.includes('show') || messageLower.includes('list'))),
    (messageLower.includes('urgent') && (messageLower.includes('task') || messageLower.includes('todo'))),
    messageLower.includes('due today'),
    messageLower.includes('overdue task'),
    messageLower.includes('task backlog'),
    messageLower.includes('what should i prioritize'),
    messageLower.includes('prioritize today'),
    messageLower.includes('what to prioritize')
  ]

  const hasTaskPhrase = taskPhrases.some(phrase => phrase === true)

  if ((hasTaskKeyword || hasTaskPhrase)) {
    const structured = await structureTaskResponse(client, userId, aiContent, userMessage)
    return structured
  }

  // ---------------------------------------------------------------------------
  // Activity / lead / contact queries
  // ---------------------------------------------------------------------------
  if (
    messageLower.includes('activity') ||
    messageLower.includes('activities') ||
    (messageLower.includes('follow-up') && !messageLower.includes('task'))
  ) {
    return null
  }

  if (
    messageLower.includes('lead') ||
    messageLower.includes('new contact') ||
    messageLower.includes('qualification')
  ) {
    return null
  }

  const emailPattern = /[\w\.-]+@[\w\.-]+\.\w+/
  const hasEmail = emailPattern.test(userMessage)
  const contactKeywords = ['contact', 'person', 'about', 'info on', 'tell me about', 'show me', 'lookup', 'find']
  const hasContactKeyword = contactKeywords.some(keyword => messageLower.includes(keyword))

  if ((hasEmail || (hasContactKeyword && (messageLower.includes('@') || messageLower.includes('email'))))) {
    const emailMatch = userMessage.match(emailPattern)
    const contactEmail = emailMatch ? emailMatch[0] : null

    const structured = await structureContactResponse(client, userId, aiContent, contactEmail, userMessage)
    return structured
  }

  // ---------------------------------------------------------------------------
  // Roadmap creation
  // ---------------------------------------------------------------------------
  if (
    (messageLower.includes('roadmap') ||
    messageLower.includes('add a roadmap') ||
    messageLower.includes('create roadmap') ||
    messageLower.includes('roadmap item') ||
    toolsUsed.includes('roadmap_create')) 
  ) {
    const structured = await structureRoadmapResponse(client, userId, aiContent, userMessage)
    return structured
  }

  // ---------------------------------------------------------------------------
  // Sales coach / performance queries
  // ---------------------------------------------------------------------------
  const hasPerformanceKeyword =
    messageLower.includes('performance') ||
    messageLower.includes('how am i doing') ||
    messageLower.includes('how is my performance') ||
    messageLower.includes('sales coach') ||
    (messageLower.includes('compare') && (messageLower.includes('month') || messageLower.includes('period'))) ||
    (messageLower.includes('this month') && messageLower.includes('last month')) ||
    (messageLower.includes('this week') && (messageLower.includes('performance') || messageLower.includes('doing') || messageLower.includes('stats') || messageLower.includes('sales')))

  const userNamePerformancePatterns = [
    /([A-Z][a-z]+)(?:'s|'|s)?\s+(?:performance|doing|performing|stats|data|results|sales)(?:\s+this\s+(?:week|month))?/i,
    /(?:can you show|show me|how is|what is|tell me about|view|see|i'd like to see)\s+([A-Z][a-z]+)(?:'s|'|s)?\s+(?:performance|doing|performing|stats|data|results|sales)(?:\s+this\s+(?:week|month))?/i,
    /([A-Z][a-z]+)(?:'s|'|s)?\s+(?:sales\s+)?performance(?:\s+this\s+(?:week|month))?/i
  ]

  const hasUserNamePerformancePattern = userNamePerformancePatterns.some(pattern => pattern.test(userMessage))

  if ((hasPerformanceKeyword || hasUserNamePerformancePattern)) {
    const structured = await structureSalesCoachResponse(client, userId, aiContent, userMessage, requestingUserId)
    return structured
  }

  // ---------------------------------------------------------------------------
  // Fallback classifier
  // ---------------------------------------------------------------------------
  const intentCategories = {
    meetings: [
      'meeting', 'meetings', 'call', 'calls', 'calendar', 'schedule',
      'appointment', 'sync', 'check-in', 'standup', 'demo', 'presentation'
    ],
    deals: [
      'deal', 'deals', 'pipeline', 'opportunity', 'opportunities',
      'forecast', 'revenue', 'close', 'closing', 'quota', 'stage', 'stages'
    ],
    tasks: [
      'task', 'tasks', 'todo', 'to-do', 'to do', 'reminder', 'reminders',
      'action item', 'action items', 'overdue', 'due'
    ],
    contacts: [
      'contact', 'contacts', 'person', 'people', 'relationship', 'relationships',
      'stakeholder', 'stakeholders', 'decision maker', 'champion'
    ],
    emails: [
      'email', 'emails', 'inbox', 'reply', 'replies', 'follow-up', 'follow up',
      'draft', 'message', 'outreach', 'communication'
    ],
    activities: [
      'activity', 'activities', 'log', 'logged', 'call log', 'note', 'notes',
      'proposal', 'proposals', 'outbound'
    ]
  }

  let detectedCategory: string | null = null
  let maxMatches = 0

  for (const [category, keywords] of Object.entries(intentCategories)) {
    const matches = keywords.filter(kw => messageLower.includes(kw)).length
    if (matches > maxMatches) {
      maxMatches = matches
      detectedCategory = category
    }
  }

  if (detectedCategory && maxMatches > 0) {
    const categoryToResponseType: Record<string, string> = {
      meetings: 'meeting_list',
      deals: 'pipeline',
      tasks: 'task',
      contacts: 'contact',
      emails: 'email',
      activities: 'activity_breakdown'
    }

    const responseType = categoryToResponseType[detectedCategory]

    return {
      type: responseType || 'text_with_links',
      summary: aiContent.slice(0, 200),
      data: {
        content: aiContent,
        category: detectedCategory,
        fallbackApplied: true
      },
      actions: [],
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: ['fallback_classifier'],
        confidence: Math.min(100, maxMatches * 30),
        warning: 'Structured using fallback classification. Specific patterns may provide richer responses.',
        detectedIntent: detectedCategory
      }
    }
  }

  return null
}
