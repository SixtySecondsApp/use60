/**
 * Unified Meeting Service
 *
 * Normalizes meeting data from multiple sources into a unified schema:
 * - Calendar Layer: Google Calendar (primary), SavvyCal (enrichment)
 * - Recorder Layer: Fathom (transcripts, summaries, action items)
 *
 * Key features:
 * - Timezone-aware date range queries
 * - SavvyCal deduplication (matches by time overlap + attendee)
 * - CRM context enrichment (attendee → contact → company → deal)
 * - Meeting type classification from SavvyCal booking links
 *
 * @see /Users/andrewbryce/.claude/plans/cosmic-drifting-newt.md
 */

import { supabase } from '@/lib/supabase/clientV2';
import type { DateRange } from '@/lib/utils/dateUtils';
import { doRangesOverlap, getDurationMinutes } from '@/lib/utils/dateUtils';
import logger from '@/lib/utils/logger';

// ============================================================================
// Types
// ============================================================================

export type MeetingSource = 'google_calendar' | 'savvycal' | 'fathom' | 'teams' | 'fireflies';
export type MeetingStatus = 'confirmed' | 'tentative' | 'cancelled' | 'completed';
export type MeetingType = 'sales' | 'client' | 'internal' | 'unknown';
export type AttendeeResponseStatus = 'accepted' | 'declined' | 'tentative' | 'needsAction';

export interface UnifiedAttendee {
  email: string;
  name?: string;
  isExternal: boolean;
  isOrganizer: boolean;
  responseStatus?: AttendeeResponseStatus;
  /** Resolved from email lookup */
  crmContactId?: string;
}

export interface ActionItem {
  id: string;
  description: string;
  owner: string;
  dueDate?: string;
  isCompleted: boolean;
  meetingId: string;
}

export interface UnifiedMeeting {
  // Core identifiers
  id: string;
  source: MeetingSource;
  sourceId: string;

  // Schedule
  title: string;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  allDay: boolean;
  status: MeetingStatus;

  // Attendees
  attendees: UnifiedAttendee[];

  // Location
  location?: string;
  meetingUrl?: string;
  htmlLink?: string;

  // Meeting type (from SavvyCal enrichment)
  meetingType: MeetingType;

  // Recorder enrichment (from Fathom)
  summary?: string;
  transcriptAvailable: boolean;
  actionItems?: ActionItem[];
  keyTopics?: string[];
  sentimentScore?: number;

  // CRM linking (resolved from attendee emails)
  crmCompanyId?: string;
  crmCompanyName?: string;
  crmDealId?: string;
  crmDealName?: string;
  crmDealStage?: string;
  crmDealValue?: number;
  crmContactIds?: string[];

  // Source-specific data
  thumbnailUrl?: string;
  embedUrl?: string;
}

export interface MeetingQueryOptions {
  /** Include CRM context enrichment */
  includeCrmContext?: boolean;
  /** Include recorder data (summary, action items) */
  includeRecorderData?: boolean;
  /** Limit number of results */
  limit?: number;
}

export interface PreviousMeeting {
  id: string;
  title: string;
  date: string;
  summary?: string;
  keyTopics?: string[];
}

// ============================================================================
// Internal Types (Database Rows)
// ============================================================================

interface CalendarEventRow {
  id: string;
  external_id: string | null;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string;
  all_day: boolean;
  status: string;
  meeting_url: string | null;
  html_link: string | null;
  attendees_count: number;
  contact_id: string | null;
  company_id: string | null;
  creator_email: string | null;
  organizer_email: string | null;
  raw_data: any;
}

interface FathomMeetingRow {
  id: string;
  fathom_recording_id: string;
  title: string | null;
  meeting_start: string | null;
  meeting_end: string | null;
  duration_minutes: number | null;
  owner_user_id: string | null;
  summary: string | null;
  transcript_text: string | null;
  share_url: string | null;
  company_id: string | null;
  primary_contact_id: string | null;
  meeting_type: string | null;
  sentiment_score: number | null;
  thumbnail_url: string | null;
  fathom_embed_url: string | null;
  calendar_invitees_type: string | null;
  provider?: string;
}

interface SavvyCalLeadRow {
  id: string;
  meeting_title: string | null;
  meeting_start: string | null;
  meeting_end: string | null;
  contact_email: string | null;
  contact_name: string | null;
  lead_source_channel: string | null;
  owner_id: string;
}

// ============================================================================
// Service
// ============================================================================

class UnifiedMeetingService {
  /**
   * Get meetings within a date range, unified from all sources
   */
  async getMeetings(
    dateRange: DateRange,
    userId: string,
    options: MeetingQueryOptions = {}
  ): Promise<UnifiedMeeting[]> {
    const { includeCrmContext = false, includeRecorderData = true, limit = 50 } = options;

    logger.log('🗓️ UnifiedMeetingService: Fetching meetings', {
      start: dateRange.start.toISOString(),
      end: dateRange.end.toISOString(),
      userId: userId.substring(0, 8) + '...',
    });

    // Fetch from all sources in parallel
    const [calendarEvents, fathomMeetings, savvyCalBookings] = await Promise.all([
      this.getCalendarEvents(dateRange, userId),
      includeRecorderData ? this.getFathomMeetings(dateRange, userId) : Promise.resolve([]),
      this.getSavvyCalBookings(dateRange, userId),
    ]);

    logger.log('📊 UnifiedMeetingService: Source counts', {
      calendar: calendarEvents.length,
      fathom: fathomMeetings.length,
      savvycal: savvyCalBookings.length,
    });

    // Normalize and merge
    const unifiedMeetings = this.mergeAndDeduplicate(
      calendarEvents,
      fathomMeetings,
      savvyCalBookings
    );

    // Sort by start time
    unifiedMeetings.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    // Limit results
    const limited = unifiedMeetings.slice(0, limit);

    // Enrich with CRM context if requested
    if (includeCrmContext) {
      await this.enrichWithCRM(limited, userId);
    }

    return limited;
  }

  /**
   * Get the next upcoming meeting for the user
   */
  async getNextMeeting(
    userId: string,
    options: MeetingQueryOptions = {}
  ): Promise<UnifiedMeeting | null> {
    const now = new Date();
    const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const meetings = await this.getMeetings(
      { start: now, end: oneWeekFromNow },
      userId,
      { ...options, limit: 1 }
    );

    return meetings[0] || null;
  }

  /**
   * Get meeting count within a date range
   */
  async getMeetingCount(dateRange: DateRange, userId: string): Promise<number> {
    // Use calendar as the primary source for counts
    const { count, error } = await supabase
      .from('calendar_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('start_time', dateRange.start.toISOString())
      .lte('start_time', dateRange.end.toISOString())
      .neq('status', 'cancelled');

    if (error) {
      logger.warn('UnifiedMeetingService: Error counting meetings', error.message);
      return 0;
    }

    return count || 0;
  }

  /**
   * Get previous meetings with a specific contact (by email)
   */
  async getPreviousMeetingsWithContact(
    contactEmail: string,
    userId: string,
    limit: number = 3
  ): Promise<PreviousMeeting[]> {
    // Search Fathom meetings by attendee
    const { data: attendeeRecords } = await supabase
      .from('meeting_attendees')
      .select('meeting_id')
      .ilike('email', contactEmail)
      .limit(limit * 2); // Fetch extra to account for filtering

    if (!attendeeRecords || attendeeRecords.length === 0) {
      return [];
    }

    const meetingIds = attendeeRecords.map((a) => a.meeting_id);

    const { data: meetings } = await supabase
      .from('meetings')
      .select('id, title, meeting_start, summary')
      .eq('owner_user_id', userId)
      .in('id', meetingIds)
      .order('meeting_start', { ascending: false })
      .limit(limit);

    if (!meetings) return [];

    return meetings.map((m) => ({
      id: m.id,
      title: m.title || 'Untitled Meeting',
      date: m.meeting_start || '',
      summary: m.summary || undefined,
    }));
  }

  // ============================================================================
  // Private: Source-Specific Fetchers
  // ============================================================================

  private async getCalendarEvents(
    dateRange: DateRange,
    userId: string
  ): Promise<CalendarEventRow[]> {
    const { data, error } = await supabase
      .from('calendar_events')
      .select(
        `id, external_id, title, description, location, start_time, end_time,
         all_day, status, meeting_url, html_link, attendees_count,
         contact_id, company_id, creator_email, organizer_email, raw_data`
      )
      .eq('user_id', userId)
      .gte('start_time', dateRange.start.toISOString())
      .lte('start_time', dateRange.end.toISOString())
      .neq('status', 'cancelled')
      .order('start_time', { ascending: true });

    if (error) {
      logger.warn('UnifiedMeetingService: Error fetching calendar events', error.message);
      return [];
    }

    return data || [];
  }

  private async getFathomMeetings(
    dateRange: DateRange,
    userId: string
  ): Promise<FathomMeetingRow[]> {
    const { data, error } = await supabase
      .from('meetings')
      .select(
        `id, fathom_recording_id, title, meeting_start, meeting_end,
         duration_minutes, owner_user_id, summary, transcript_text, share_url,
         company_id, primary_contact_id, meeting_type, sentiment_score,
         thumbnail_url, fathom_embed_url, calendar_invitees_type`
      )
      .eq('owner_user_id', userId)
      .gte('meeting_start', dateRange.start.toISOString())
      .lte('meeting_start', dateRange.end.toISOString())
      .order('meeting_start', { ascending: true });

    if (error) {
      logger.warn('UnifiedMeetingService: Error fetching Fathom meetings', error.message);
      return [];
    }

    return data || [];
  }

  private async getSavvyCalBookings(
    dateRange: DateRange,
    userId: string
  ): Promise<SavvyCalLeadRow[]> {
    const { data, error } = await supabase
      .from('leads')
      .select(
        'id, meeting_title, meeting_start, meeting_end, contact_email, contact_name, lead_source_channel, owner_id'
      )
      .eq('external_source', 'savvycal')
      .eq('owner_id', userId)
      .is('deleted_at', null)
      .gte('meeting_start', dateRange.start.toISOString())
      .lte('meeting_start', dateRange.end.toISOString())
      .order('meeting_start', { ascending: true });

    if (error) {
      logger.warn('UnifiedMeetingService: Error fetching SavvyCal bookings', error.message);
      return [];
    }

    return data || [];
  }

  // ============================================================================
  // Private: Merge and Deduplicate
  // ============================================================================

  private mergeAndDeduplicate(
    calendarEvents: CalendarEventRow[],
    fathomMeetings: FathomMeetingRow[],
    savvyCalBookings: SavvyCalLeadRow[]
  ): UnifiedMeeting[] {
    // Start with calendar events as primary source
    const meetings: UnifiedMeeting[] = calendarEvents.map((event) =>
      this.normalizeCalendarEvent(event)
    );

    // Enrich with SavvyCal meeting type (match by time overlap)
    for (const booking of savvyCalBookings) {
      const matchingMeeting = this.findMatchingMeeting(meetings, booking);
      if (matchingMeeting) {
        // Enrich with SavvyCal data
        matchingMeeting.meetingType = this.detectMeetingType(booking.lead_source_channel);
        logger.log('📎 Matched SavvyCal booking to calendar event', {
          title: matchingMeeting.title,
          type: matchingMeeting.meetingType,
        });
      }
    }

    // Enrich with Fathom recorder data (match by time overlap)
    for (const fathom of fathomMeetings) {
      const matchingMeeting = this.findMatchingMeetingByFathom(meetings, fathom);
      if (matchingMeeting) {
        // Enrich with Fathom data
        matchingMeeting.summary = fathom.summary || undefined;
        matchingMeeting.transcriptAvailable = !!fathom.transcript_text;
        matchingMeeting.sentimentScore = fathom.sentiment_score || undefined;
        matchingMeeting.thumbnailUrl = fathom.thumbnail_url || undefined;
        matchingMeeting.embedUrl = fathom.fathom_embed_url || undefined;
        matchingMeeting.crmCompanyId = fathom.company_id || undefined;

        logger.log('🎥 Matched Fathom recording to calendar event', {
          title: matchingMeeting.title,
          hasTranscript: matchingMeeting.transcriptAvailable,
        });
      } else {
        // Fathom meeting not in calendar - add as standalone
        meetings.push(this.normalizeFathomMeeting(fathom));
      }
    }

    return meetings;
  }

  private findMatchingMeeting(
    meetings: UnifiedMeeting[],
    booking: SavvyCalLeadRow
  ): UnifiedMeeting | undefined {
    if (!booking.meeting_start) return undefined;

    const bookingStart = new Date(booking.meeting_start);
    const bookingEnd = booking.meeting_end
      ? new Date(booking.meeting_end)
      : new Date(bookingStart.getTime() + 30 * 60 * 1000); // Default 30 min

    return meetings.find((meeting) => {
      return doRangesOverlap(
        { start: meeting.startTime, end: meeting.endTime },
        { start: bookingStart, end: bookingEnd },
        5 // 5 minute tolerance
      );
    });
  }

  private findMatchingMeetingByFathom(
    meetings: UnifiedMeeting[],
    fathom: FathomMeetingRow
  ): UnifiedMeeting | undefined {
    if (!fathom.meeting_start) return undefined;

    const fathomStart = new Date(fathom.meeting_start);
    const fathomEnd = fathom.meeting_end
      ? new Date(fathom.meeting_end)
      : new Date(fathomStart.getTime() + (fathom.duration_minutes || 30) * 60 * 1000);

    return meetings.find((meeting) => {
      return doRangesOverlap(
        { start: meeting.startTime, end: meeting.endTime },
        { start: fathomStart, end: fathomEnd },
        5 // 5 minute tolerance
      );
    });
  }

  // ============================================================================
  // Private: Normalizers
  // ============================================================================

  private normalizeCalendarEvent(event: CalendarEventRow): UnifiedMeeting {
    const startTime = new Date(event.start_time);
    const endTime = new Date(event.end_time);

    // Extract attendees from raw_data if available
    const attendees = this.extractAttendeesFromRawData(event.raw_data);

    return {
      id: event.id,
      source: 'google_calendar',
      sourceId: event.external_id || event.id,
      title: event.title || 'Untitled',
      startTime,
      endTime,
      durationMinutes: getDurationMinutes(startTime, endTime),
      allDay: event.all_day,
      status: this.normalizeStatus(event.status),
      attendees,
      location: event.location || undefined,
      meetingUrl: event.meeting_url || undefined,
      htmlLink: event.html_link || undefined,
      meetingType: 'unknown',
      transcriptAvailable: false,
      crmCompanyId: event.company_id || undefined,
      crmContactIds: event.contact_id ? [event.contact_id] : undefined,
    };
  }

  private normalizeFathomMeeting(fathom: FathomMeetingRow): UnifiedMeeting {
    const startTime = fathom.meeting_start ? new Date(fathom.meeting_start) : new Date();
    const endTime = fathom.meeting_end
      ? new Date(fathom.meeting_end)
      : new Date(startTime.getTime() + (fathom.duration_minutes || 30) * 60 * 1000);

    return {
      id: fathom.id,
      source: (fathom.provider === 'fireflies' ? 'fireflies' : 'fathom') as MeetingSource,
      sourceId: fathom.fathom_recording_id || fathom.id,
      title: fathom.title || 'Recorded Meeting',
      startTime,
      endTime,
      durationMinutes: fathom.duration_minutes || getDurationMinutes(startTime, endTime),
      allDay: false,
      status: 'completed',
      attendees: [],
      meetingUrl: fathom.share_url || undefined,
      meetingType: this.normalizeFathomMeetingType(fathom.meeting_type),
      summary: fathom.summary || undefined,
      transcriptAvailable: !!fathom.transcript_text,
      sentimentScore: fathom.sentiment_score || undefined,
      thumbnailUrl: fathom.thumbnail_url || undefined,
      embedUrl: fathom.fathom_embed_url || undefined,
      crmCompanyId: fathom.company_id || undefined,
      crmContactIds: fathom.primary_contact_id ? [fathom.primary_contact_id] : undefined,
    };
  }

  private normalizeStatus(status: string): MeetingStatus {
    const statusLower = status?.toLowerCase();
    if (statusLower === 'confirmed' || statusLower === 'accepted') return 'confirmed';
    if (statusLower === 'tentative') return 'tentative';
    if (statusLower === 'cancelled' || statusLower === 'canceled') return 'cancelled';
    return 'confirmed'; // Default
  }

  private normalizeFathomMeetingType(type: string | null): MeetingType {
    if (!type) return 'unknown';
    const typeLower = type.toLowerCase();
    if (typeLower.includes('discovery') || typeLower.includes('demo') || typeLower.includes('negotiation')) {
      return 'sales';
    }
    if (typeLower.includes('follow') || typeLower.includes('client')) {
      return 'client';
    }
    return 'unknown';
  }

  private detectMeetingType(leadSourceChannel: string | null): MeetingType {
    if (!leadSourceChannel) return 'unknown';

    const channel = leadSourceChannel.toLowerCase();

    // Detect meeting type from SavvyCal booking link patterns
    if (
      channel.includes('sales') ||
      channel.includes('demo') ||
      channel.includes('discovery') ||
      channel.includes('prospect')
    ) {
      return 'sales';
    }

    if (
      channel.includes('client') ||
      channel.includes('support') ||
      channel.includes('customer') ||
      channel.includes('success')
    ) {
      return 'client';
    }

    if (
      channel.includes('internal') ||
      channel.includes('team') ||
      channel.includes('1:1') ||
      channel.includes('standup')
    ) {
      return 'internal';
    }

    return 'unknown';
  }

  private extractAttendeesFromRawData(rawData: any): UnifiedAttendee[] {
    if (!rawData?.attendees) return [];

    try {
      const attendees = Array.isArray(rawData.attendees) ? rawData.attendees : [];
      return attendees.map((a: any) => ({
        email: a.email || '',
        name: a.displayName || undefined,
        isExternal: !a.email?.includes('@use60.com'), // Adjust domain as needed
        isOrganizer: a.organizer === true,
        responseStatus: this.normalizeResponseStatus(a.responseStatus),
      }));
    } catch {
      return [];
    }
  }

  private normalizeResponseStatus(status: string | undefined): AttendeeResponseStatus | undefined {
    if (!status) return undefined;
    const statusMap: Record<string, AttendeeResponseStatus> = {
      accepted: 'accepted',
      declined: 'declined',
      tentative: 'tentative',
      needsAction: 'needsAction',
    };
    return statusMap[status] || undefined;
  }

  // ============================================================================
  // Private: CRM Enrichment
  // ============================================================================

  private async enrichWithCRM(meetings: UnifiedMeeting[], userId: string): Promise<void> {
    // Collect all unique attendee emails
    const allEmails = new Set<string>();
    for (const meeting of meetings) {
      for (const attendee of meeting.attendees) {
        if (attendee.email && attendee.isExternal) {
          allEmails.add(attendee.email.toLowerCase());
        }
      }
    }

    if (allEmails.size === 0) return;

    // Batch lookup contacts by email
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, email, company_id')
      .eq('owner_id', userId)
      .in('email', Array.from(allEmails));

    if (!contacts || contacts.length === 0) return;

    // Create email → contact map
    const emailToContact = new Map<string, { id: string; company_id: string | null }>();
    for (const contact of contacts) {
      if (contact.email) {
        emailToContact.set(contact.email.toLowerCase(), {
          id: contact.id,
          company_id: contact.company_id,
        });
      }
    }

    // Collect company IDs
    const companyIds = new Set<string>();
    for (const contact of contacts) {
      if (contact.company_id) companyIds.add(contact.company_id);
    }

    // Batch lookup companies and deals
    let companyMap = new Map<string, { name: string }>();
    let dealMap = new Map<string, { id: string; name: string; stage: string; value: number }>();

    if (companyIds.size > 0) {
      const [companiesResult, dealsResult] = await Promise.all([
        supabase
          .from('companies')
          .select('id, name')
          .in('id', Array.from(companyIds)),
        supabase
          .from('deals')
          .select('id, name, stage_id, value, company_id')
          .in('company_id', Array.from(companyIds))
          .neq('status', 'closed_lost')
          .order('value', { ascending: false }),
      ]);

      if (companiesResult.data) {
        for (const company of companiesResult.data) {
          companyMap.set(company.id, { name: company.name });
        }
      }

      if (dealsResult.data) {
        for (const deal of dealsResult.data) {
          if (deal.company_id && !dealMap.has(deal.company_id)) {
            dealMap.set(deal.company_id, {
              id: deal.id,
              name: deal.name,
              stage: deal.stage_id,
              value: deal.value,
            });
          }
        }
      }
    }

    // Enrich meetings
    for (const meeting of meetings) {
      const contactIds: string[] = [];
      let primaryCompanyId: string | null = null;

      for (const attendee of meeting.attendees) {
        if (attendee.email && attendee.isExternal) {
          const contact = emailToContact.get(attendee.email.toLowerCase());
          if (contact) {
            contactIds.push(contact.id);
            attendee.crmContactId = contact.id;
            if (!primaryCompanyId && contact.company_id) {
              primaryCompanyId = contact.company_id;
            }
          }
        }
      }

      if (contactIds.length > 0) {
        meeting.crmContactIds = contactIds;
      }

      if (primaryCompanyId) {
        meeting.crmCompanyId = primaryCompanyId;
        const company = companyMap.get(primaryCompanyId);
        if (company) {
          meeting.crmCompanyName = company.name;
        }

        const deal = dealMap.get(primaryCompanyId);
        if (deal) {
          meeting.crmDealId = deal.id;
          meeting.crmDealName = deal.name;
          meeting.crmDealStage = deal.stage;
          meeting.crmDealValue = deal.value;
        }
      }
    }
  }
}

// ============================================================================
// Export Singleton
// ============================================================================

export const unifiedMeetingService = new UnifiedMeetingService();
export default unifiedMeetingService;
