import { supabase } from '@/lib/supabase/clientV2';
import { CalendarEvent } from '@/pages/Calendar';
import logger from '@/lib/utils/logger';

export interface CalendarSyncStatus {
  isRunning: boolean;
  lastSyncedAt?: Date;
  eventsCreated?: number;
  eventsUpdated?: number;
  eventsDeleted?: number;
  error?: string;
}

export interface DatabaseCalendarEvent {
  id: string;
  external_id: string | null;
  calendar_id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string;
  all_day: boolean;
  status: string;
  meeting_url: string | null;
  attendees_count: number;
  contact_id: string | null;
  contact_name: string | null;
  company_id: string | null;
  company_name: string | null;
  color: string | null;
  sync_status: string;
  creator_email: string | null;
  organizer_email: string | null;
  html_link: string | null;
  raw_data: any;
}

class CalendarService {
  /**
   * Sync calendar events from Google Calendar to database
   */
  async syncCalendarEvents(
    action: 'sync-full' | 'sync-incremental' | 'sync-historical' | 'sync-single' = 'sync-incremental',
    calendarId: string = 'primary',
    startDate?: string,
    endDate?: string
  ): Promise<CalendarSyncStatus> {
    try {
      // Get the user
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        throw new Error('User not authenticated');
      }

      // First, fetch events from Google Calendar
      const now = new Date();
      let timeMin: string;
      let timeMax: string;
      let maxResults: number;

      if (action === 'sync-single') {
        // For testing, sync last week's activity
        const oneWeekAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
        timeMin = oneWeekAgo.toISOString(); // 7 days ago
        timeMax = now.toISOString(); // until now
        maxResults = 50; // Get up to 50 events from last week
      } else {
        timeMin = startDate || new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString();
        timeMax = endDate || new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString();
        maxResults = 250;
      }

      const response = await supabase.functions.invoke('google-calendar?action=list-events', {
        body: {
          calendarId,
          timeMin,
          timeMax,
          maxResults,
          orderBy: action === 'sync-single' ? 'startTime' : undefined,
          singleEvents: true
        },
      });
      if (response.error) {
        throw response.error;
      }

      // Check if events exist in the response
      const events = response.data?.events || [];
      
      if (events.length === 0) {
        return {
          isRunning: false,
          lastSyncedAt: new Date(),
          eventsCreated: 0,
          eventsUpdated: 0,
          eventsDeleted: 0,
        };
      }
      // Process and store events in the database
      let created = 0;
      let updated = 0;

      // Get or create calendar record
      const { data: calendar, error: calFetchError } = await supabase
        .from('calendar_calendars')
        .select('id')
        .eq('user_id', userData.user.id)
        .eq('external_id', calendarId)
        .maybeSingle();

      if (calFetchError) {
        logger.error('Error fetching calendar record:', calFetchError);
      }

      let calendarDbId = calendar?.id;

      if (!calendarDbId) {
        // Get user's org_id
        const { data: membership } = await supabase
          .from('organization_memberships')
          .select('org_id')
          .eq('user_id', userData.user.id)
          .maybeSingle();

        // Create calendar record
        const { data: newCalendar, error: calCreateError } = await supabase
          .from('calendar_calendars')
          .insert({
            user_id: userData.user.id,
            org_id: membership?.org_id || null,
            external_id: calendarId,
            name: 'Primary Calendar',
            is_primary: true,
            color: '#4285F4',
            timezone: response.data.timeZone || 'UTC',
            historical_sync_completed: action === 'sync-historical'
          })
          .select('id')
          .single();

        if (calCreateError) {
          logger.error('Error creating calendar record:', calCreateError);
          throw new Error(`Failed to create calendar record: ${calCreateError.message}`);
        }

        calendarDbId = newCalendar?.id;
      }

      if (!calendarDbId) {
        throw new Error('Could not get or create calendar record');
      }

      // Get user's org_id once for all events
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', userData.user.id)
        .maybeSingle();

      const orgId = membership?.org_id || null;

      // Store events
      for (const event of events) {
        if (!event.start?.dateTime && !event.start?.date) {
          continue;
        }

        // Check if this event already exists
        // Use maybeSingle() instead of single() to avoid errors when not found
        const { data: existingEvent, error: selectError } = await supabase
          .from('calendar_events')
          .select('id')
          .eq('external_id', event.id)
          .eq('user_id', userData.user.id)
          .maybeSingle();

        if (selectError && selectError.code !== 'PGRST116') {
          logger.error('Error checking existing event:', selectError);
        }

        // Clean up HTML link - sometimes it gets truncated with "..."
        let cleanHtmlLink = event.htmlLink || null;
        if (cleanHtmlLink && cleanHtmlLink.includes('...')) {
          // If the link is truncated, try to reconstruct it or set to null
          cleanHtmlLink = null;
        }

        // Extract attendees for external check
        const attendees = event.attendees?.map((a: any) => ({
          email: a.email,
          responseStatus: a.responseStatus,
          displayName: a.displayName,
        })) || [];

        // Prepare event data - ensure all required fields are present
        const eventData: any = {
          calendar_id: calendarDbId,
          external_id: event.id,
          title: event.summary || 'Untitled Event',
          description: event.description || null,
          location: event.location || null,
          start_time: event.start.dateTime || event.start.date,
          end_time: event.end?.dateTime || event.end?.date || event.start.dateTime || event.start.date,
          all_day: !event.start.dateTime,
          status: event.status || 'confirmed',
          meeting_url: event.hangoutLink || null,
          attendees_count: attendees.length,
          attendees: attendees.length > 0 ? attendees : null,
          creator_email: event.creator?.email || null,
          organizer_email: event.organizer?.email || null,
          html_link: cleanHtmlLink,
          hangout_link: event.hangoutLink || null,
          raw_data: event,
          sync_status: 'synced',
          user_id: userData.user.id,
          org_id: orgId,  // CRITICAL: Set org_id for auto-record trigger
        };

        // Use separate insert/update instead of upsert to avoid RLS issues
        let result;
        let error;
        
        if (existingEvent) {
          // Update existing event
          const { data, error: updateError } = await supabase
            .from('calendar_events')
            .update(eventData)
            .eq('id', existingEvent.id);
          
          result = data;
          error = updateError;
        } else {
          // Insert new event
          // Log the exact data being sent
          // Try without the select() to avoid RLS issues on return
          const { data, error: insertError } = await supabase
            .from('calendar_events')
            .insert([eventData]);
          
          result = data;
          error = insertError;
        }

        if (error) {
          logger.error(`Calendar event ${existingEvent ? 'update' : 'insert'} failed:`, {
            code: error.code,
            message: error.message,
            details: error.details,
            eventId: event.id,
          });
        } else {
          if (existingEvent) {
            updated++;
          } else {
            created++;
          }
        }
      }

      // Update historical sync status if this was a historical sync
      if (action === 'sync-historical' && calendarDbId) {
        await supabase
          .from('calendar_calendars')
          .update({ historical_sync_completed: true })
          .eq('id', calendarDbId);
      }

      return {
        isRunning: false,
        lastSyncedAt: new Date(),
        eventsCreated: created,
        eventsUpdated: updated,
        eventsDeleted: 0,
      };
    } catch (error) {
      return {
        isRunning: false,
        error: error instanceof Error ? error.message : 'Sync failed',
      };
    }
  }

  /**
   * Get calendar events from database for a date range
   */
  async getEventsFromDB(
    startDate: Date,
    endDate: Date,
    calendarIds?: string[]
  ): Promise<CalendarEvent[]> {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user) {
        throw new Error('User not authenticated');
      }

      let data: DatabaseCalendarEvent[] | null = null;
      let error: any = null;

      // Try calling the RPC function first (fast path when installed)
      const rpcResult = await supabase.rpc('get_calendar_events_in_range', {
        p_user_id: user.user.id,
        p_start_date: startDate.toISOString(),
        p_end_date: endDate.toISOString(),
        p_calendar_ids: calendarIds || null,
      });

      // If the RPC doesn't exist in the target Supabase DB, fall back to a direct query.
      // PostgREST commonly returns 404 with messages like "Could not find the function ...",
      // so handle both patterns.
      const rpcMissing =
        !!rpcResult.error &&
        (rpcResult.error.code === 'PGRST202' || // PostgREST "function not found"
          rpcResult.error.message?.toLowerCase().includes('could not find the function') ||
          (rpcResult.error.message?.toLowerCase().includes('function') &&
            rpcResult.error.message?.toLowerCase().includes('does not exist')));

      if (rpcMissing) {
        // Function doesn't exist, fall back to direct query
        let query = supabase
          .from('calendar_events')
          .select(`
            id,
            external_id,
            calendar_id,
            title,
            description,
            location,
            start_time,
            end_time,
            all_day,
            status,
            meeting_url,
            attendees_count,
            contact_id,
            color,
            sync_status,
            creator_email,
            organizer_email,
            html_link,
            raw_data
          `)
          .eq('user_id', user.user.id)
          .gte('start_time', startDate.toISOString())
          .lte('end_time', endDate.toISOString())
          .order('start_time', { ascending: true });

        if (calendarIds && calendarIds.length > 0) {
          query = query.in('calendar_id', calendarIds);
        }

        const directResult = await query;
        data = directResult.data;
        error = directResult.error;
      } else {
        data = rpcResult.data;
        error = rpcResult.error;
      }

      if (error) {
        throw error;
      }

      // Transform database events to CalendarEvent format
      return (data || []).map((event: DatabaseCalendarEvent) => ({
        id: event.external_id || event.id,
        title: event.title,
        description: event.description || undefined,
        location: event.location || undefined,
        start: new Date(event.start_time),
        end: new Date(event.end_time),
        allDay: event.all_day,
        category: this.determineCategory(event),
        priority: this.determinePriority(event),
        attendees: this.extractAttendees(event),
        createdBy: event.creator_email || 'unknown',
        createdAt: new Date(),
        updatedAt: new Date(),
        color: event.color || undefined,
        contactId: event.contact_id || undefined,
        contactName: event.contact_name || undefined,
        companyId: event.company_id || undefined,
        companyName: event.company_name || undefined,
        meetingUrl: event.meeting_url || undefined,
        htmlLink: event.html_link || undefined,
      }));
    } catch (error) {
      return [];
    }
  }

  /**
   * Link a calendar event to a CRM contact
   */
  async linkEventToContact(eventId: string, contactId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('calendar_events')
        .update({ contact_id: contactId })
        .eq('id', eventId);

      if (error) {
        throw error;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Link a calendar event to a CRM deal
   */
  async linkEventToDeal(eventId: string, dealId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('calendar_events')
        .update({ deal_id: dealId })
        .eq('id', eventId);

      if (error) {
        throw error;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Clear stuck sync statuses (older than 5 minutes)
   */
  async clearStuckSyncStatus(): Promise<void> {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user) {
        return;
      }

      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      const { error } = await supabase
        .from('calendar_sync_logs')
        .update({ 
          sync_status: 'failed', 
          error_message: 'Sync timeout - automatically cleared',
          completed_at: new Date().toISOString()
        })
        .eq('user_id', user.user.id)
        .eq('sync_status', 'started')
        .lt('started_at', fiveMinutesAgo.toISOString());

      if (error) {
      } else {
      }
    } catch (error) {
    }
  }

  /**
   * Get calendar sync status with automatic stuck sync cleanup
   */
  async getSyncStatus(calendarId: string = 'primary'): Promise<CalendarSyncStatus> {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user) {
        throw new Error('User not authenticated');
      }

      // Clear any stuck syncs first
      await this.clearStuckSyncStatus();

      // Get the last sync log
      const { data, error } = await supabase
        .from('calendar_sync_logs')
        .select('*')
        .eq('user_id', user.user.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 is "no rows returned"
        throw error;
      }

      if (!data) {
        return {
          isRunning: false,
          lastSyncedAt: undefined,
        };
      }

      // Never return isRunning: true from database - only check actual mutations
      // This prevents stuck sync states from blocking the UI
      return {
        isRunning: false, // Always false - only check syncCalendar.isPending in UI
        lastSyncedAt: data.completed_at ? new Date(data.completed_at) : undefined,
        eventsCreated: data.events_created || 0,
        eventsUpdated: data.events_updated || 0,
        eventsDeleted: data.events_deleted || 0,
        error: data.error_message || undefined,
      };
    } catch (error) {
      return {
        isRunning: false,
        error: error instanceof Error ? error.message : 'Failed to get sync status',
      };
    }
  }

  /**
   * Check if initial historical sync has been completed
   */
  async isHistoricalSyncCompleted(calendarId: string = 'primary'): Promise<boolean> {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user) {
        return false;
      }

      const { data, error } = await supabase
        .from('calendar_calendars')
        .select('historical_sync_completed')
        .eq('user_id', user.user.id)
        .eq('external_id', calendarId)
        .maybeSingle();

      if (error) {
        return false;
      }

      return !!data?.historical_sync_completed;
    } catch (error) {
      return false;
    }
  }

  /**
   * Auto-link events to contacts based on email matching
   */
  async autoLinkEventsToContacts(): Promise<number> {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user) {
        throw new Error('User not authenticated');
      }

      // Get unlinked events with organizer emails
      const { data: events, error: eventsError } = await supabase
        .from('calendar_events')
        .select('id, organizer_email')
        .eq('user_id', user.user.id)
        .is('contact_id', null)
        .not('organizer_email', 'is', null)
        .limit(100);

      if (eventsError) {
        throw eventsError;
      }

      if (!events || events.length === 0) {
        return 0;
      }

      let linkedCount = 0;

      // Get all contacts for the user
      const { data: contacts, error: contactsError } = await supabase
        .from('contacts')
        .select('id, email')
        .eq('owner_id', user.user.id);  // contacts table uses owner_id, not user_id

      if (contactsError) {
        throw contactsError;
      }

      if (!contacts || contacts.length === 0) {
        return 0;
      }

      // Create email to contact ID map
      const emailToContactId = new Map<string, string>();
      contacts.forEach(contact => {
        if (contact.email) {
          emailToContactId.set(contact.email.toLowerCase(), contact.id);
        }
      });

      // Link events to contacts
      for (const event of events) {
        const contactId = emailToContactId.get(event.organizer_email.toLowerCase());
        if (contactId) {
          const { error } = await supabase
            .from('calendar_events')
            .update({ contact_id: contactId })
            .eq('id', event.id);

          if (!error) {
            linkedCount++;
          }
        }
      }

      return linkedCount;
    } catch (error) {
      return 0;
    }
  }

  // Helper methods
  private determineCategory(event: DatabaseCalendarEvent): CalendarEvent['category'] {
    const title = event.title.toLowerCase();
    const description = (event.description || '').toLowerCase();
    const combined = title + ' ' + description;

    if (combined.includes('call') || combined.includes('phone')) return 'call';
    if (combined.includes('task') || combined.includes('todo')) return 'task';
    if (combined.includes('follow') || combined.includes('follow-up')) return 'follow-up';
    if (combined.includes('deal') || combined.includes('sales')) return 'deal';
    if (combined.includes('personal') || combined.includes('lunch') || combined.includes('dinner')) return 'personal';
    
    return 'meeting';
  }

  private determinePriority(event: DatabaseCalendarEvent): 'low' | 'medium' | 'high' {
    // High priority if linked to deal or has many attendees
    if (event.company_id || event.attendees_count > 5) return 'high';
    
    // Medium priority for regular meetings
    if (event.attendees_count > 1) return 'medium';
    
    // Low priority for personal events or single attendee
    return 'low';
  }

  private extractAttendees(event: DatabaseCalendarEvent): string[] {
    // Extract attendees from raw_data if available
    if (event.raw_data?.attendees) {
      return event.raw_data.attendees.map((a: any) => a.email);
    }
    return [];
  }
}

// Export singleton instance
export const calendarService = new CalendarService();