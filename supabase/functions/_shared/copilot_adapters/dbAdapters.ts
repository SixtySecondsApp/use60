import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import type {
  ActionResult,
  AdapterContext,
  CRMAdapter,
  EmailAdapter,
  EnrichmentAdapter,
  MeetingAdapter,
  NotificationAdapter,
} from './types.ts';
import { enqueueWriteback, mapFieldsToHubSpot, mapFieldsToAttio, type CrmSource } from '../enqueueWriteback.ts';
import { upsertContactIndex, upsertCompanyIndex } from '../upsertCrmIndex.ts';

type SupabaseClient = ReturnType<typeof createClient>;

function ok(data: unknown, source: string): ActionResult {
  return { success: true, data, source };
}

function fail(error: string, source: string, extra?: Partial<ActionResult>): ActionResult {
  return { success: false, data: null, error, source, ...extra };
}

function formatAdapterError(e: unknown): string {
  // Deno/Supabase errors are often plain objects (PostgREST) not Error instances.
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    const anyErr = e as Record<string, unknown>;
    const message =
      (typeof anyErr.message === 'string' && anyErr.message) ||
      (typeof anyErr.error === 'string' && anyErr.error) ||
      (typeof anyErr.details === 'string' && anyErr.details) ||
      (typeof anyErr.hint === 'string' && anyErr.hint);
    if (message) return message;
    try {
      return JSON.stringify(anyErr);
    } catch {
      return '[unknown error object]';
    }
  }
  return String(e);
}

export function createDbMeetingAdapter(client: SupabaseClient, userId: string): MeetingAdapter {
  return {
    source: 'db_meetings',
    async listMeetings(params) {
      try {
        const meetingId =
          (params as any)?.meeting_id ? String((params as any).meeting_id).trim() : null;

        // Fast path: fetch a specific meeting by id (used by sequences/skills)
        if (meetingId) {
          const { data: meeting, error: meetingError } = await client
            .from('meetings')
            .select(
              'id,title,meeting_start,meeting_end,duration_minutes,summary,transcript_text,share_url,company_id,primary_contact_id'
            )
            .eq('owner_user_id', userId)
            .eq('id', meetingId)
            .maybeSingle();

          if (meetingError) throw meetingError;

          if (!meeting) {
            return ok(
              {
                meetings: [],
                matchedOn: 'meeting_id',
                note: `No meeting found for meeting_id: ${meetingId}`,
              },
              this.source
            );
          }

          const { data: attendees, error: attendeesError } = await client
            .from('meeting_attendees')
            .select('name,email')
            .eq('meeting_id', meetingId)
            .order('created_at', { ascending: true })
            .limit(50);

          if (attendeesError) throw attendeesError;

          return ok(
            {
              meetings: [{ ...meeting, attendees: attendees || [] }],
              matchedOn: 'meeting_id',
            },
            this.source
          );
        }

        const limit = Math.min(Math.max(Number(params.limit ?? 5) || 5, 1), 20);

        let contactEmail: string | null = params.contactEmail ? String(params.contactEmail).trim().toLowerCase() : null;
        let contactId: string | null = params.contactId ? String(params.contactId).trim() : null;

        // If we have contactId but no email, look up the email
        if (!contactEmail && contactId) {
          const { data: contact, error } = await client
            .from('contacts')
            .select('email')
            .eq('id', contactId)
            .eq('owner_id', userId)
            .maybeSingle();
          if (error) throw error;
          contactEmail = contact?.email?.toLowerCase() || null;
        }

        // If we have contactEmail but no contactId, try to find the contact
        if (contactEmail && !contactId) {
          const { data: contact, error } = await client
            .from('contacts')
            .select('id')
            .eq('owner_id', userId)
            .ilike('email', contactEmail)
            .maybeSingle();
          if (!error && contact) {
            contactId = contact.id;
          }
        }

        // Strategy 1: If we have a contactId, filter by primary_contact_id
        if (contactId) {
          const { data: meetings, error: meetingsError } = await client
            .from('meetings')
            .select(
              'id,title,meeting_start,meeting_end,duration_minutes,summary,transcript_text,share_url,company_id,primary_contact_id'
            )
            .eq('owner_user_id', userId)
            .eq('primary_contact_id', contactId)
            .order('meeting_start', { ascending: false })
            .limit(limit);

          if (meetingsError) throw meetingsError;
          return ok({ meetings: meetings || [], matchedOn: 'primary_contact_id' }, this.source);
        }

        // Strategy 2: If we have a contactEmail but no contactId (not in CRM), search meeting_attendees
        if (contactEmail) {
          // Find meeting IDs where this email is an attendee
          const { data: attendeeRecords, error: attendeeError } = await client
            .from('meeting_attendees')
            .select('meeting_id')
            .ilike('email', contactEmail)
            .limit(limit);

          if (attendeeError) throw attendeeError;

          if (attendeeRecords && attendeeRecords.length > 0) {
            const meetingIds = attendeeRecords.map((a) => a.meeting_id);

            const { data: meetings, error: meetingsError } = await client
              .from('meetings')
              .select(
                'id,title,meeting_start,meeting_end,duration_minutes,summary,transcript_text,share_url,company_id,primary_contact_id'
              )
              .eq('owner_user_id', userId)
              .in('id', meetingIds)
              .order('meeting_start', { ascending: false })
              .limit(limit);

            if (meetingsError) throw meetingsError;
            return ok({ meetings: meetings || [], matchedOn: 'attendee_email' }, this.source);
          }

          // No meetings found with this attendee email
          return ok(
            {
              meetings: [],
              matchedOn: 'attendee_email',
              note: `No meetings found with attendee email: ${contactEmail}`,
            },
            this.source
          );
        }

        // Fallback: No contact identifier provided - return recent meetings
        const { data: meetings, error: meetingsError } = await client
          .from('meetings')
          .select(
            'id,title,meeting_start,meeting_end,duration_minutes,summary,transcript_text,share_url,company_id,primary_contact_id'
          )
          .eq('owner_user_id', userId)
          .order('meeting_start', { ascending: false })
          .limit(limit);

        if (meetingsError) throw meetingsError;
        return ok({ meetings: meetings || [], matchedOn: 'recent' }, this.source);
      } catch (e) {
        const msg = formatAdapterError(e);
        return fail(msg, this.source);
      }
    },

    async getBookingStats(params) {
      try {
        const period = params.period || 'this_week';
        const filterBy = params.filter_by || 'meeting_date';
        const source = params.source || 'all';
        const orgWide = params.org_wide === true && params.isAdmin === true;

        // Calculate date range based on period
        const { startDate, endDate } = calculateDateRange(period);

        // Determine which date column to filter on
        const dateColumn = filterBy === 'booking_date' ? 'created_at' : 'meeting_start';
        const calendarDateColumn = filterBy === 'booking_date' ? 'created_at' : 'start_time';

        const stats: {
          period: string;
          filter_by: string;
          startDate: string;
          endDate: string;
          scope: string;
          sources: Record<string, { count: number; items: unknown[] }>;
        } = {
          period,
          filter_by: filterBy,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          scope: orgWide ? 'organization' : 'user',
          sources: {},
        };

        // Query SavvyCal bookings from leads table
        if (source === 'all' || source === 'savvycal') {
          let memberIds: string[] = [];

          // For org-wide, get all org members first
          if (orgWide && params.orgId) {
            const { data: orgMembers } = await client
              .from('organization_memberships')
              .select('user_id')
              .eq('org_id', params.orgId);
            memberIds = (orgMembers || []).map((m) => m.user_id);
          }

          let q = client
            .from('leads')
            .select('id, meeting_title, meeting_start, contact_name, contact_email, created_at, owner_id')
            .eq('external_source', 'savvycal')
            .is('deleted_at', null)
            .gte(dateColumn, startDate.toISOString())
            .lte(dateColumn, endDate.toISOString())
            .order(dateColumn, { ascending: true });

          // Scope filtering
          if (orgWide && memberIds.length > 0) {
            q = q.in('owner_id', memberIds);
          } else {
            q = q.eq('owner_id', userId);
          }

          const { data: leads } = await q;
          stats.sources.savvycal = { count: leads?.length || 0, items: leads || [] };
        }

        // Query calendar events
        if (source === 'all' || source === 'calendar') {
          let q = client
            .from('calendar_events')
            .select('id, title, start_time, end_time, attendees_count, user_id')
            .neq('status', 'cancelled')
            .gte(calendarDateColumn, startDate.toISOString())
            .lte(calendarDateColumn, endDate.toISOString())
            .order(calendarDateColumn, { ascending: true });

          if (orgWide && params.orgId) {
            q = q.eq('org_id', params.orgId);
          } else {
            q = q.eq('user_id', userId);
          }

          const { data: events } = await q;
          stats.sources.calendar = { count: events?.length || 0, items: events || [] };
        }

        // Query completed meetings (Fathom)
        if (source === 'all' || source === 'meetings') {
          let q = client
            .from('meetings')
            .select('id, title, meeting_start, duration_minutes, owner_user_id')
            .gte('meeting_start', startDate.toISOString())
            .lte('meeting_start', endDate.toISOString())
            .order('meeting_start', { ascending: true });

          if (orgWide && params.orgId) {
            q = q.eq('org_id', params.orgId);
          } else {
            q = q.eq('owner_user_id', userId);
          }

          const { data: meetings } = await q;
          stats.sources.meetings = { count: meetings?.length || 0, items: meetings || [] };
        }

        // Calculate totals
        const totalCount = Object.values(stats.sources).reduce((sum, s) => sum + s.count, 0);

        return ok(
          {
            total_bookings: totalCount,
            ...stats,
          },
          this.source
        );
      } catch (e) {
        const msg = formatAdapterError(e);
        return fail(msg, this.source);
      }
    },

    async getMeetingCount(params) {
      try {
        const period = params.period || 'this_week';
        const timezone = params.timezone || 'UTC';
        const weekStartsOn = params.weekStartsOn ?? 1;

        const { startDate, endDate } = calculateDateRangeWithTimezone(period, timezone, weekStartsOn);

        // Count from calendar_events (Google Calendar - primary source)
        const { count: calendarCount, error: calendarError } = await client
          .from('calendar_events')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .neq('status', 'cancelled')
          .gte('start_time', startDate.toISOString())
          .lte('start_time', endDate.toISOString());

        if (calendarError) throw calendarError;

        // Count from meetings (Fathom - recorded meetings)
        const { count: meetingsCount, error: meetingsError } = await client
          .from('meetings')
          .select('id', { count: 'exact', head: true })
          .eq('owner_user_id', userId)
          .gte('meeting_start', startDate.toISOString())
          .lte('meeting_start', endDate.toISOString());

        if (meetingsError) throw meetingsError;

        return ok({
          period,
          timezone,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          counts: {
            calendar_events: calendarCount || 0,
            recorded_meetings: meetingsCount || 0,
          },
          total: (calendarCount || 0), // Primary count from calendar
          note: 'Total is from calendar events. Recorded meetings may overlap with calendar events.',
        }, this.source);
      } catch (e) {
        const msg = formatAdapterError(e);
        return fail(msg, this.source);
      }
    },

    async getNextMeeting(params) {
      try {
        const includeContext = params.includeContext ?? true;
        const now = new Date();
        const nowIso = now.toISOString();

        // Find the next meeting that is either upcoming or currently in progress.
        // Include meetings where end_time > now (still happening) even if start_time < now.
        // Use attendees_count > 1 to exclude solo calendar blocks, but fall back to
        // a broader query if that yields nothing (attendees_count may be NULL/0 for some events).
        const { data: events, error: eventsError } = await client
          .from('calendar_events')
          .select(`
            id, external_id, title, description, start_time, end_time, location, meeting_url,
            attendees, attendees_count, status, organizer_email
          `)
          .eq('user_id', userId)
          .neq('status', 'cancelled')
          .or(`start_time.gte.${nowIso},end_time.gt.${nowIso}`)
          .gt('attendees_count', 1)
          .order('start_time', { ascending: true })
          .limit(5);

        // Fallback: if strict attendees_count filter returns nothing, retry without it.
        // This catches events where attendees_count is NULL or not synced properly.
        let finalEvents = events;
        if ((!events || events.length === 0) && !eventsError) {
          const { data: fallback, error: fallbackError } = await client
            .from('calendar_events')
            .select(`
              id, external_id, title, description, start_time, end_time, location, meeting_url,
              attendees, attendees_count, status, organizer_email
            `)
            .eq('user_id', userId)
            .neq('status', 'cancelled')
            .or(`start_time.gte.${nowIso},end_time.gt.${nowIso}`)
            .order('start_time', { ascending: true })
            .limit(5);
          if (fallbackError) throw fallbackError;
          finalEvents = fallback;
        }

        if (eventsError) throw eventsError;

        if (!finalEvents || finalEvents.length === 0) {
          return ok({
            found: false,
            message: 'No upcoming meetings with attendees found',
          }, this.source);
        }

        const event = finalEvents[0];
        const startTime = new Date(event.start_time);
        const endTime = new Date(event.end_time);
        const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

        // Parse attendees
        let attendees: Array<{ email: string; name?: string; isExternal: boolean }> = [];
        if (event.attendees) {
          try {
            const attendeeList = typeof event.attendees === 'string'
              ? JSON.parse(event.attendees)
              : event.attendees;

            if (Array.isArray(attendeeList)) {
              attendees = attendeeList.map((a: { email?: string; displayName?: string }) => ({
                email: a.email || '',
                name: a.displayName || undefined,
                isExternal: !a.email?.includes('@') || !a.email?.endsWith(event.organizer_email?.split('@')[1] || ''),
              }));
            }
          } catch {
            // Attendees not parseable
          }
        }

        // Base meeting response
        const meeting = {
          id: event.id,
          externalId: event.external_id,
          title: event.title,
          description: event.description,
          startTime: event.start_time,
          endTime: event.end_time,
          durationMinutes,
          location: event.location,
          meetingUrl: event.meeting_url,
          attendees,
          attendeesCount: event.attendees_count || attendees.length,
          status: event.status,
        };

        // If context not requested, return basic meeting info
        if (!includeContext) {
          return ok({
            found: true,
            meeting,
          }, this.source);
        }

        // CRM context enrichment
        let context: {
          company: unknown;
          deals: unknown[];
          contacts: unknown[];
          recentMeetings: unknown[];
          recentActivities: unknown[];
        } = {
          company: null,
          deals: [],
          contacts: [],
          recentMeetings: [],
          recentActivities: [],
        };

        // Extract external attendee emails for CRM lookup
        const externalEmails = attendees
          .filter(a => a.isExternal && a.email)
          .map(a => a.email.toLowerCase());

        if (externalEmails.length > 0) {
          // Look up contacts by email
          const { data: contacts } = await client
            .from('contacts')
            .select(`
              id, email, first_name, last_name, full_name, title, company_id,
              relationship_health_scores(health_status, days_since_last_contact)
            `)
            .eq('owner_id', userId)
            .in('email', externalEmails);

          if (contacts && contacts.length > 0) {
            context.contacts = contacts.map((c: any) => {
              const health = Array.isArray(c.relationship_health_scores)
                ? c.relationship_health_scores[0]
                : c.relationship_health_scores;
              return {
                id: c.id,
                email: c.email,
                name: c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim(),
                title: c.title,
                healthStatus: health?.health_status,
                daysSinceLastContact: health?.days_since_last_contact,
              };
            });

            // Get company from first contact with company_id
            const contactWithCompany = contacts.find((c: any) => c.company_id);
            if (contactWithCompany) {
              const { data: company } = await client
                .from('companies')
                .select('id, name, domain, industry, size, status')
                .eq('id', contactWithCompany.company_id)
                .maybeSingle();

              if (company) {
                context.company = company;

                // OPTIMIZATION: Batch all company-dependent queries in parallel
                // This reduces 3 sequential queries to 1 parallel batch
                const [dealsResult, meetingsResult, activitiesResult] = await Promise.all([
                  // Get deals for this company
                  client
                    .from('deals')
                    .select(`
                      id, name, value, status, expected_close_date,
                      deal_stages(name),
                      deal_health_scores(health_status, risk_level)
                    `)
                    .eq('owner_id', userId)
                    .eq('company_id', company.id)
                    .eq('status', 'active')
                    .limit(5),

                  // Get recent meetings with this company
                  client
                    .from('meetings')
                    .select('id, title, meeting_start, duration_minutes, summary')
                    .eq('owner_user_id', userId)
                    .eq('company_id', company.id)
                    .order('meeting_start', { ascending: false })
                    .limit(3),

                  // Get recent activities for this company
                  client
                    .from('activities')
                    .select('id, type, description, created_at')
                    .eq('owner_id', userId)
                    .eq('company_id', company.id)
                    .order('created_at', { ascending: false })
                    .limit(5),
                ]);

                // Process deals
                if (dealsResult.data) {
                  context.deals = dealsResult.data.map((d: any) => {
                    const stage = Array.isArray(d.deal_stages) ? d.deal_stages[0] : d.deal_stages;
                    const health = Array.isArray(d.deal_health_scores) ? d.deal_health_scores[0] : d.deal_health_scores;
                    return {
                      id: d.id,
                      name: d.name,
                      value: d.value,
                      status: d.status,
                      stageName: stage?.name,
                      expectedCloseDate: d.expected_close_date,
                      healthStatus: health?.health_status,
                      riskLevel: health?.risk_level,
                    };
                  });
                }

                // Process meetings
                if (meetingsResult.data) {
                  context.recentMeetings = meetingsResult.data;
                }

                // Process activities
                if (activitiesResult.data) {
                  context.recentActivities = activitiesResult.data;
                }
              }
            }
          }
        }

        return ok({
          found: true,
          meeting,
          context,
        }, this.source);
      } catch (e) {
        const msg = formatAdapterError(e);
        return fail(msg, this.source);
      }
    },

    async getMeetingsForPeriod(params) {
      try {
        const period = params.period || 'today';
        const timezone = params.timezone || 'UTC';
        const weekStartsOn = params.weekStartsOn ?? 1;
        const includeContext = params.includeContext ?? false;
        const limit = Math.min(Math.max(Number(params.limit ?? 20) || 20, 1), 50);

        const { startDate, endDate } = calculateDateRangeWithTimezone(period, timezone, weekStartsOn);

        // Get calendar events for the period
        const { data: events, error: eventsError } = await client
          .from('calendar_events')
          .select(`
            id, external_id, title, description, start_time, end_time, location, meeting_url,
            attendees, attendees_count, status, organizer_email
          `)
          .eq('user_id', userId)
          .neq('status', 'cancelled')
          .gte('start_time', startDate.toISOString())
          .lte('start_time', endDate.toISOString())
          .order('start_time', { ascending: true })
          .limit(limit);

        if (eventsError) throw eventsError;

        // Process meetings
        const meetings = (events || []).map((event: any) => {
          const startTime = new Date(event.start_time);
          const endTime = new Date(event.end_time);
          const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

          // Parse attendees
          let attendees: Array<{ email: string; name?: string }> = [];
          if (event.attendees) {
            try {
              const attendeeList = typeof event.attendees === 'string'
                ? JSON.parse(event.attendees)
                : event.attendees;

              if (Array.isArray(attendeeList)) {
                attendees = attendeeList.map((a: { email?: string; displayName?: string }) => ({
                  email: a.email || '',
                  name: a.displayName || undefined,
                }));
              }
            } catch {
              // Attendees not parseable
            }
          }

          return {
            id: event.id,
            externalId: event.external_id,
            title: event.title,
            startTime: event.start_time,
            endTime: event.end_time,
            durationMinutes,
            location: event.location,
            meetingUrl: event.meeting_url,
            attendees,
            attendeesCount: event.attendees_count || attendees.length,
            status: event.status,
          };
        });

        // If context requested, enrich with CRM data
        if (includeContext && meetings.length > 0) {
          // Collect all unique external emails
          const allEmails = new Set<string>();
          meetings.forEach((m: any) => {
            m.attendees.forEach((a: { email: string }) => {
              if (a.email) allEmails.add(a.email.toLowerCase());
            });
          });

          if (allEmails.size > 0) {
            // Look up contacts
            const { data: contacts } = await client
              .from('contacts')
              .select('id, email, full_name, title, company_id')
              .eq('owner_id', userId)
              .in('email', Array.from(allEmails));

            const contactsByEmail = new Map(
              (contacts || []).map((c: any) => [c.email?.toLowerCase(), c])
            );

            // Enrich each meeting with contact info
            meetings.forEach((m: any) => {
              m.attendeeContext = m.attendees
                .map((a: { email: string }) => {
                  const contact = contactsByEmail.get(a.email?.toLowerCase());
                  if (contact) {
                    return {
                      email: a.email,
                      contactId: contact.id,
                      name: contact.full_name,
                      title: contact.title,
                    };
                  }
                  return null;
                })
                .filter(Boolean);
            });
          }
        }

        return ok({
          period,
          timezone,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          count: meetings.length,
          meetings,
        }, this.source);
      } catch (e) {
        const msg = formatAdapterError(e);
        return fail(msg, this.source);
      }
    },

    async getTimeBreakdown(params) {
      try {
        const period = params.period || 'this_week';
        const timezone = params.timezone || 'UTC';
        const weekStartsOn = params.weekStartsOn ?? 1;

        const { startDate, endDate } = calculateDateRangeWithTimezone(period, timezone, weekStartsOn);

        // Get calendar events for the period
        const { data: events, error: eventsError } = await client
          .from('calendar_events')
          .select('id, title, start_time, end_time, attendees_count, status')
          .eq('user_id', userId)
          .neq('status', 'cancelled')
          .gte('start_time', startDate.toISOString())
          .lte('start_time', endDate.toISOString());

        if (eventsError) throw eventsError;

        // Calculate time breakdown
        let totalMeetingMinutes = 0;
        let internalMeetings = 0;
        let internalMinutes = 0;
        let externalMeetings = 0;
        let externalMinutes = 0;
        let oneOnOneMeetings = 0;
        let oneOnOneMinutes = 0;
        let groupMeetings = 0;
        let groupMinutes = 0;
        const byDayOfWeek: Record<string, { count: number; minutes: number }> = {};

        for (const event of events || []) {
          const startTime = new Date(event.start_time);
          const endTime = new Date(event.end_time);
          const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

          totalMeetingMinutes += durationMinutes;

          // Day of week breakdown
          const dayName = startTime.toLocaleDateString('en-US', { weekday: 'short' });
          if (!byDayOfWeek[dayName]) {
            byDayOfWeek[dayName] = { count: 0, minutes: 0 };
          }
          byDayOfWeek[dayName].count++;
          byDayOfWeek[dayName].minutes += durationMinutes;

          // Categorize by attendee count (simple heuristic)
          const attendeeCount = event.attendees_count || 0;

          if (attendeeCount <= 2) {
            oneOnOneMeetings++;
            oneOnOneMinutes += durationMinutes;
          } else {
            groupMeetings++;
            groupMinutes += durationMinutes;
          }

          // Simple internal/external heuristic based on title keywords
          const title = (event.title || '').toLowerCase();
          const isInternal = title.includes('internal') ||
            title.includes('team') ||
            title.includes('standup') ||
            title.includes('sync') ||
            title.includes('1:1') ||
            title.includes('one on one');

          if (isInternal) {
            internalMeetings++;
            internalMinutes += durationMinutes;
          } else {
            externalMeetings++;
            externalMinutes += durationMinutes;
          }
        }

        // Calculate period duration
        const periodDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        const workingHoursPerDay = 8;
        const totalWorkingMinutes = periodDays * workingHoursPerDay * 60;
        const meetingPercentage = totalWorkingMinutes > 0
          ? Math.round((totalMeetingMinutes / totalWorkingMinutes) * 100)
          : 0;

        return ok({
          period,
          timezone,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          periodDays,
          summary: {
            totalMeetings: (events || []).length,
            totalMeetingMinutes,
            totalMeetingHours: Math.round(totalMeetingMinutes / 60 * 10) / 10,
            meetingPercentageOfWorkTime: meetingPercentage,
            averageMeetingMinutes: (events || []).length > 0
              ? Math.round(totalMeetingMinutes / (events || []).length)
              : 0,
          },
          breakdown: {
            internal: { count: internalMeetings, minutes: internalMinutes },
            external: { count: externalMeetings, minutes: externalMinutes },
            oneOnOne: { count: oneOnOneMeetings, minutes: oneOnOneMinutes },
            group: { count: groupMeetings, minutes: groupMinutes },
          },
          byDayOfWeek: Object.entries(byDayOfWeek).map(([day, data]) => ({
            day,
            count: data.count,
            minutes: data.minutes,
          })),
        }, this.source);
      } catch (e) {
        const msg = formatAdapterError(e);
        return fail(msg, this.source);
      }
    },
  };
}

/**
 * Helper function to calculate date range based on period string
 */
function calculateDateRange(period: string): { startDate: Date; endDate: Date } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  switch (period) {
    case 'this_week': {
      const dayOfWeek = now.getDay();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - dayOfWeek);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      return { startDate: startOfDay(startOfWeek), endDate: endOfDay(endOfWeek) };
    }
    case 'last_week': {
      const dayOfWeek = now.getDay();
      const startOfLastWeek = new Date(now);
      startOfLastWeek.setDate(now.getDate() - dayOfWeek - 7);
      const endOfLastWeek = new Date(startOfLastWeek);
      endOfLastWeek.setDate(startOfLastWeek.getDate() + 6);
      return { startDate: startOfDay(startOfLastWeek), endDate: endOfDay(endOfLastWeek) };
    }
    case 'this_month': {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { startDate: startOfDay(startOfMonth), endDate: endOfDay(endOfMonth) };
    }
    case 'last_month': {
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      return { startDate: startOfDay(startOfLastMonth), endDate: endOfDay(endOfLastMonth) };
    }
    case 'last_7_days': {
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      return { startDate: startOfDay(start), endDate: endOfDay(now) };
    }
    case 'last_30_days': {
      const start = new Date(now);
      start.setDate(now.getDate() - 29);
      return { startDate: startOfDay(start), endDate: endOfDay(now) };
    }
    default:
      return { startDate: startOfDay(now), endDate: endOfDay(now) };
  }
}

/**
 * Timezone-aware date range calculation
 * Converts relative periods (today, this_week) to UTC ranges for the user's timezone
 */
function calculateDateRangeWithTimezone(
  period: string,
  timezone: string = 'UTC',
  weekStartsOn: 0 | 1 = 1 // 0 = Sunday, 1 = Monday
): { startDate: Date; endDate: Date } {
  // Get current time in user's timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const nowUtc = new Date();
  const parts = formatter.formatToParts(nowUtc);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '0';

  // Construct the "now" in user's local date (but as a UTC Date object for calculation)
  const localYear = parseInt(getPart('year'));
  const localMonth = parseInt(getPart('month')) - 1;
  const localDay = parseInt(getPart('day'));
  const localHour = parseInt(getPart('hour'));
  const localMinute = parseInt(getPart('minute'));

  // Create a Date representing local midnight
  const localMidnight = new Date(Date.UTC(localYear, localMonth, localDay, 0, 0, 0, 0));
  const localEndOfDay = new Date(Date.UTC(localYear, localMonth, localDay, 23, 59, 59, 999));

  // Calculate timezone offset to convert local times back to UTC
  const localNow = new Date(Date.UTC(localYear, localMonth, localDay, localHour, localMinute));
  const offsetMs = localNow.getTime() - nowUtc.getTime();
  // Round to nearest minute to handle DST edge cases
  const offsetMinutes = Math.round(offsetMs / 60000);

  // Helper to convert local Date to UTC
  const localToUtc = (localDate: Date): Date => {
    return new Date(localDate.getTime() - offsetMinutes * 60000);
  };

  switch (period) {
    case 'today':
      return {
        startDate: localToUtc(localMidnight),
        endDate: localToUtc(localEndOfDay),
      };

    case 'tomorrow': {
      const tomorrowStart = new Date(localMidnight);
      tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);
      const tomorrowEnd = new Date(localEndOfDay);
      tomorrowEnd.setUTCDate(tomorrowEnd.getUTCDate() + 1);
      return {
        startDate: localToUtc(tomorrowStart),
        endDate: localToUtc(tomorrowEnd),
      };
    }

    case 'this_week': {
      // Get current day of week (0 = Sunday, 1 = Monday, etc.)
      const currentDayOfWeek = new Date(Date.UTC(localYear, localMonth, localDay)).getUTCDay();

      // Calculate days to subtract to get to week start
      let daysToSubtract: number;
      if (weekStartsOn === 1) {
        // Monday start
        daysToSubtract = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1;
      } else {
        // Sunday start
        daysToSubtract = currentDayOfWeek;
      }

      const weekStart = new Date(localMidnight);
      weekStart.setUTCDate(weekStart.getUTCDate() - daysToSubtract);

      const weekEnd = new Date(weekStart);
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
      weekEnd.setUTCHours(23, 59, 59, 999);

      return {
        startDate: localToUtc(weekStart),
        endDate: localToUtc(weekEnd),
      };
    }

    case 'next_week': {
      const currentDayOfWeek = new Date(Date.UTC(localYear, localMonth, localDay)).getUTCDay();
      let daysToSubtract: number;
      if (weekStartsOn === 1) {
        daysToSubtract = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1;
      } else {
        daysToSubtract = currentDayOfWeek;
      }

      const thisWeekStart = new Date(localMidnight);
      thisWeekStart.setUTCDate(thisWeekStart.getUTCDate() - daysToSubtract);

      const nextWeekStart = new Date(thisWeekStart);
      nextWeekStart.setUTCDate(nextWeekStart.getUTCDate() + 7);

      const nextWeekEnd = new Date(nextWeekStart);
      nextWeekEnd.setUTCDate(nextWeekEnd.getUTCDate() + 6);
      nextWeekEnd.setUTCHours(23, 59, 59, 999);

      return {
        startDate: localToUtc(nextWeekStart),
        endDate: localToUtc(nextWeekEnd),
      };
    }

    case 'last_week': {
      const currentDayOfWeek = new Date(Date.UTC(localYear, localMonth, localDay)).getUTCDay();
      let daysToSubtract: number;
      if (weekStartsOn === 1) {
        daysToSubtract = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1;
      } else {
        daysToSubtract = currentDayOfWeek;
      }

      const thisWeekStart = new Date(localMidnight);
      thisWeekStart.setUTCDate(thisWeekStart.getUTCDate() - daysToSubtract);

      const lastWeekStart = new Date(thisWeekStart);
      lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);

      const lastWeekEnd = new Date(lastWeekStart);
      lastWeekEnd.setUTCDate(lastWeekEnd.getUTCDate() + 6);
      lastWeekEnd.setUTCHours(23, 59, 59, 999);

      return {
        startDate: localToUtc(lastWeekStart),
        endDate: localToUtc(lastWeekEnd),
      };
    }

    case 'this_month': {
      const monthStart = new Date(Date.UTC(localYear, localMonth, 1, 0, 0, 0, 0));
      const monthEnd = new Date(Date.UTC(localYear, localMonth + 1, 0, 23, 59, 59, 999));
      return {
        startDate: localToUtc(monthStart),
        endDate: localToUtc(monthEnd),
      };
    }

    case 'last_month': {
      const lastMonthStart = new Date(Date.UTC(localYear, localMonth - 1, 1, 0, 0, 0, 0));
      const lastMonthEnd = new Date(Date.UTC(localYear, localMonth, 0, 23, 59, 59, 999));
      return {
        startDate: localToUtc(lastMonthStart),
        endDate: localToUtc(lastMonthEnd),
      };
    }

    // Day of week support - finds the NEXT occurrence of that day
    case 'monday':
    case 'tuesday':
    case 'wednesday':
    case 'thursday':
    case 'friday':
    case 'saturday':
    case 'sunday': {
      const dayMap: Record<string, number> = {
        sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
        thursday: 4, friday: 5, saturday: 6,
      };
      const targetDay = dayMap[period];
      const currentDayOfWeek = new Date(Date.UTC(localYear, localMonth, localDay)).getUTCDay();
      
      // Calculate days until target day (0 = today if it's that day, otherwise next occurrence)
      let daysUntil = targetDay - currentDayOfWeek;
      if (daysUntil < 0) {
        daysUntil += 7; // Next week
      }
      
      const targetStart = new Date(localMidnight);
      targetStart.setUTCDate(targetStart.getUTCDate() + daysUntil);
      
      const targetEnd = new Date(targetStart);
      targetEnd.setUTCHours(23, 59, 59, 999);
      
      return {
        startDate: localToUtc(targetStart),
        endDate: localToUtc(targetEnd),
      };
    }

    default:
      // Default to today
      return {
        startDate: localToUtc(localMidnight),
        endDate: localToUtc(localEndOfDay),
      };
  }
}

export function createDbCrmAdapter(client: SupabaseClient, userId: string): CRMAdapter {
  return {
    source: 'db_crm',
    async getContact(params) {
      try {
        const id = params.id ? String(params.id).trim() : null;
        const email = params.email ? String(params.email).trim() : null;
        const name = params.name ? String(params.name).trim() : null;

        let q = client.from('contacts').select('*').eq('owner_id', userId);
        if (id) q = q.eq('id', id);
        if (email) q = q.eq('email', email);
        if (name && !id && !email) q = q.ilike('full_name', `%${name}%`);

        const { data, error } = await q.limit(10);
        if (error) throw error;

        return ok({ contacts: data || [] }, this.source);
      } catch (e) {
        const msg = formatAdapterError(e);
        return fail(msg, this.source);
      }
    },
    async getDeal(params) {
      try {
        const id = params.id ? String(params.id).trim() : null;
        const name = params.name ? String(params.name).trim() : null;
        const closeDateFrom = params.close_date_from ? String(params.close_date_from).trim() : null;
        const closeDateTo = params.close_date_to ? String(params.close_date_to).trim() : null;
        const status = params.status ? String(params.status).trim() : null;
        const stageId = params.stage_id ? String(params.stage_id).trim() : null;
        const includeHealth = params.include_health === true;
        const limit = Math.min(Math.max(Number(params.limit ?? 10) || 10, 1), 50);

        // Base select - optionally include health data
        const selectFields = includeHealth
          ? `id,name,company,value,stage_id,status,expected_close_date,probability,created_at,updated_at,
             deal_health_scores(health_status,risk_level,days_since_last_activity,days_in_current_stage,overall_health_score)`
          : 'id,name,company,value,stage_id,status,expected_close_date,probability,created_at,updated_at';

        let q = client
          .from('deals')
          .select(selectFields)
          .eq('owner_id', userId);

        // Apply filters
        if (id) q = q.eq('id', id);
        if (name && !id) q = q.ilike('name', `%${name}%`);
        if (status) q = q.eq('status', status);
        if (stageId) q = q.eq('stage_id', stageId);
        if (closeDateFrom) q = q.gte('expected_close_date', closeDateFrom);
        if (closeDateTo) q = q.lte('expected_close_date', closeDateTo);

        const { data, error } = await q.order('expected_close_date', { ascending: true, nullsFirst: false }).limit(limit);
        if (error) throw error;

        // Flatten health data if included
        const deals = (data || []).map((deal: any) => {
          if (includeHealth && deal.deal_health_scores) {
            const health = Array.isArray(deal.deal_health_scores)
              ? deal.deal_health_scores[0]
              : deal.deal_health_scores;
            return {
              ...deal,
              health_status: health?.health_status || null,
              risk_level: health?.risk_level || null,
              days_since_last_activity: health?.days_since_last_activity || null,
              days_in_current_stage: health?.days_in_current_stage || null,
              overall_health_score: health?.overall_health_score || null,
              deal_health_scores: undefined,
            };
          }
          return deal;
        });

        return ok({ deals }, this.source);
      } catch (e) {
        const msg = formatAdapterError(e);
        return fail(msg, this.source);
      }
    },
    async updateCRM(params, ctx) {
      const source = this.source;
      try {
        if (!ctx.confirm) {
          return fail('Confirmation required for write operations', source, {
            needs_confirmation: true,
            preview: { entity: params.entity, id: params.id, updates: params.updates },
          });
        }

        if (!params.id) {
          return fail('id is required', source);
        }

        const id = String(params.id);
        const updates = params.updates || {};

        let result: any;
        let entityRecord: any;

        switch (params.entity) {
          case 'deal': {
            const { data, error } = await client
              .from('deals')
              .update(updates)
              .eq('id', id)
              .eq('owner_id', userId)
              .select('*, organization_id')
              .maybeSingle();
            if (error) throw error;
            entityRecord = data;
            result = ok({ deal: data }, source);
            break;
          }
          case 'contact': {
            const { data, error } = await client
              .from('contacts')
              .update(updates)
              .eq('id', id)
              .eq('owner_id', userId)
              .select('*, organization_id')
              .maybeSingle();
            if (error) throw error;
            entityRecord = data;
            result = ok({ contact: data }, source);
            break;
          }
          case 'task': {
            const { data, error } = await client
              .from('tasks')
              .update(updates)
              .eq('id', id)
              .or(`assigned_to.eq.${userId},created_by.eq.${userId}`)
              .select()
              .maybeSingle();
            if (error) throw error;
            // Tasks don't sync to external CRM
            return ok({ task: data }, source);
          }
          case 'activity': {
            const { data, error } = await client
              .from('activities')
              .update(updates)
              .eq('id', id)
              .eq('owner_id', userId)
              .select()
              .maybeSingle();
            if (error) throw error;
            // Activities don't sync to external CRM yet
            return ok({ activity: data }, source);
          }
          default:
            return fail(`Unsupported entity: ${String(params.entity)}`, source);
        }

        // Enqueue write-back for deals and contacts if orgId is available
        if (entityRecord && ctx.orgId && (params.entity === 'deal' || params.entity === 'contact')) {
          try {
            // Determine CRM source (check for active integrations)
            const { data: hubspotIntegration } = await client
              .from('hubspot_org_integrations')
              .select('org_id')
              .eq('org_id', ctx.orgId)
              .eq('is_active', true)
              .maybeSingle();

            const { data: attioIntegration } = await client
              .from('attio_org_integrations')
              .select('org_id')
              .eq('org_id', ctx.orgId)
              .eq('is_active', true)
              .maybeSingle();

            let crmSource: CrmSource | null = null;
            if (hubspotIntegration) {
              crmSource = 'hubspot';
            } else if (attioIntegration) {
              crmSource = 'attio';
            }

            if (crmSource) {
              // Get the external CRM record ID if it exists
              const crmRecordId = entityRecord.crm_id || entityRecord.external_id || null;

              // Map field names based on CRM source
              const mappedPayload = crmSource === 'hubspot'
                ? mapFieldsToHubSpot(params.entity as any, updates)
                : mapFieldsToAttio(params.entity as any, updates);

              // Enqueue the write-back operation
              await enqueueWriteback({
                supabase: client,
                orgId: ctx.orgId,
                crmSource,
                entityType: params.entity as any,
                operation: crmRecordId ? 'update' : 'create',
                crmRecordId: crmRecordId || undefined,
                payload: mappedPayload,
                triggeredBy: 'copilot',
                triggeredByUserId: userId,
                priority: 3, // Higher priority for copilot-triggered updates
              });

              console.log(`[dbAdapter] Enqueued ${params.entity} write-back to ${crmSource}`);

              // Also update the CRM index immediately for fast search
              try {
                if (params.entity === 'contact' && entityRecord) {
                  await upsertContactIndex({
                    supabase: client,
                    orgId: ctx.orgId,
                    crmSource,
                    crmRecordId: crmRecordId || `local_${entityRecord.id}`,
                    properties: {
                      first_name: entityRecord.first_name,
                      last_name: entityRecord.last_name,
                      email: entityRecord.email,
                      phone: entityRecord.phone,
                      company_name: entityRecord.company,
                      job_title: entityRecord.job_title,
                      updated_at: new Date().toISOString(),
                      ...updates,
                    },
                  });
                  console.log(`[dbAdapter] Updated CRM contact index for ${entityRecord.id}`);
                } else if (params.entity === 'company' && entityRecord) {
                  await upsertCompanyIndex({
                    supabase: client,
                    orgId: ctx.orgId,
                    crmSource,
                    crmRecordId: crmRecordId || `local_${entityRecord.id}`,
                    properties: {
                      name: entityRecord.name,
                      domain: entityRecord.domain,
                      industry: entityRecord.industry,
                      employee_count: entityRecord.employee_count,
                      annual_revenue: entityRecord.annual_revenue,
                      city: entityRecord.city,
                      state: entityRecord.state,
                      country: entityRecord.country,
                      updated_at: new Date().toISOString(),
                      ...updates,
                    },
                  });
                  console.log(`[dbAdapter] Updated CRM company index for ${entityRecord.id}`);
                }
              } catch (indexErr) {
                // Log but don't fail the main operation
                console.error('[dbAdapter] Failed to update CRM index:', indexErr);
              }
            }
          } catch (writebackErr) {
            // Log but don't fail the main operation
            console.error('[dbAdapter] Failed to enqueue write-back:', writebackErr);
          }
        }

        return result;
      } catch (e) {
        const msg = formatAdapterError(e);
        return fail(msg, source);
      }
    },

    async getPipelineSummary(_params) {
      try {
        const now = new Date();
        const weekEnd = new Date(now);
        weekEnd.setDate(now.getDate() + (7 - now.getDay()));
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        // Get deals with health scores and stage info
        const { data: deals, error: dealsError } = await client
          .from('deals')
          .select(`
            id, name, value, probability, stage_id, status, expected_close_date,
            deal_stages(name, probability),
            deal_health_scores(health_status, risk_level)
          `)
          .eq('owner_id', userId)
          .eq('status', 'active');

        if (dealsError) throw dealsError;

        const dealList = deals || [];

        // Calculate metrics
        let totalValue = 0;
        let weightedValue = 0;
        let atRiskCount = 0;
        let atRiskValue = 0;
        let closingThisWeekCount = 0;
        let closingThisWeekValue = 0;
        let closingThisMonthCount = 0;
        let closingThisMonthValue = 0;
        const byStage: Record<string, { name: string; count: number; value: number }> = {};

        for (const deal of dealList) {
          const value = Number(deal.value) || 0;
          totalValue += value;

          // Probability: use deal probability if set, else stage probability
          const stageData = Array.isArray(deal.deal_stages) ? deal.deal_stages[0] : deal.deal_stages;
          const prob = deal.probability ?? stageData?.probability ?? 50;
          weightedValue += value * (prob / 100);

          // Health/risk
          const healthData = Array.isArray(deal.deal_health_scores) ? deal.deal_health_scores[0] : deal.deal_health_scores;
          if (healthData?.risk_level === 'high' || healthData?.risk_level === 'critical' ||
              healthData?.health_status === 'warning' || healthData?.health_status === 'critical') {
            atRiskCount++;
            atRiskValue += value;
          }

          // Close date checks
          if (deal.expected_close_date) {
            const closeDate = new Date(deal.expected_close_date);
            if (closeDate >= now && closeDate <= weekEnd) {
              closingThisWeekCount++;
              closingThisWeekValue += value;
            }
            if (closeDate >= now && closeDate <= monthEnd) {
              closingThisMonthCount++;
              closingThisMonthValue += value;
            }
          }

          // By stage aggregation
          const stageName = stageData?.name || 'Unknown';
          if (!byStage[stageName]) {
            byStage[stageName] = { name: stageName, count: 0, value: 0 };
          }
          byStage[stageName].count++;
          byStage[stageName].value += value;
        }

        return ok({
          deal_count: dealList.length,
          total_value: totalValue,
          weighted_value: Math.round(weightedValue),
          at_risk_count: atRiskCount,
          at_risk_value: atRiskValue,
          closing_this_week: { count: closingThisWeekCount, value: closingThisWeekValue },
          closing_this_month: { count: closingThisMonthCount, value: closingThisMonthValue },
          by_stage: Object.values(byStage),
        }, this.source);
      } catch (e) {
        const msg = formatAdapterError(e);
        return fail(msg, this.source);
      }
    },

    async getPipelineDeals(params) {
      try {
        const filter = params.filter || 'closing_soon';
        const days = Number(params.days) || 14;
        const period = params.period || 'this_month';
        const includeHealth = params.include_health !== false; // Default true
        const limit = Math.min(Math.max(Number(params.limit ?? 20) || 20, 1), 50);

        const now = new Date();
        let startDate: Date;
        let endDate: Date;

        // Calculate period dates
        switch (period) {
          case 'this_week': {
            const dayOfWeek = now.getDay();
            startDate = new Date(now);
            startDate.setDate(now.getDate() - dayOfWeek);
            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 6);
            break;
          }
          case 'this_quarter': {
            const quarter = Math.floor(now.getMonth() / 3);
            startDate = new Date(now.getFullYear(), quarter * 3, 1);
            endDate = new Date(now.getFullYear(), quarter * 3 + 3, 0);
            break;
          }
          default: // this_month
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        }

        const selectFields = includeHealth
          ? `id,name,company,contact_name,contact_email,value,stage_id,status,expected_close_date,probability,created_at,updated_at,
             deal_stages(name),
             deal_health_scores(health_status,risk_level,days_since_last_activity,days_in_current_stage,overall_health_score)`
          : `id,name,company,contact_name,contact_email,value,stage_id,status,expected_close_date,probability,created_at,updated_at,
             deal_stages(name)`;

        let q = client
          .from('deals')
          .select(selectFields)
          .eq('owner_id', userId)
          .eq('status', 'active');

        // Apply filter logic
        switch (filter) {
          case 'closing_soon':
            q = q.gte('expected_close_date', startDate.toISOString().split('T')[0])
                 .lte('expected_close_date', endDate.toISOString().split('T')[0]);
            break;
          case 'at_risk':
            // Will filter after query based on health scores
            break;
          case 'stale':
            // Will filter after query based on days_since_last_activity
            break;
          case 'needs_attention':
            // Combines at_risk and stale
            break;
        }

        const { data, error } = await q.order('expected_close_date', { ascending: true, nullsFirst: false }).limit(100);
        if (error) throw error;

        // Process and filter results
        let deals = (data || []).map((deal: any) => {
          const stageData = Array.isArray(deal.deal_stages) ? deal.deal_stages[0] : deal.deal_stages;
          const healthData = Array.isArray(deal.deal_health_scores) ? deal.deal_health_scores[0] : deal.deal_health_scores;

          return {
            id: deal.id,
            name: deal.name,
            company: deal.company,
            contact_name: deal.contact_name || null,
            contact_email: deal.contact_email || null,
            value: deal.value,
            stage_name: stageData?.name || 'Unknown',
            status: deal.status,
            expected_close_date: deal.expected_close_date,
            probability: deal.probability,
            ...(includeHealth && {
              health_status: healthData?.health_status || null,
              risk_level: healthData?.risk_level || null,
              days_since_last_activity: healthData?.days_since_last_activity || null,
              days_in_current_stage: healthData?.days_in_current_stage || null,
              overall_health_score: healthData?.overall_health_score || null,
            }),
          };
        });

        // Apply post-query filters
        if (filter === 'at_risk') {
          deals = deals.filter((d: any) =>
            d.risk_level === 'high' || d.risk_level === 'critical' ||
            d.health_status === 'warning' || d.health_status === 'critical' || d.health_status === 'stalled'
          );
        } else if (filter === 'stale') {
          deals = deals.filter((d: any) =>
            (d.days_since_last_activity !== null && d.days_since_last_activity >= days) ||
            (d.days_in_current_stage !== null && d.days_in_current_stage >= days)
          );
        } else if (filter === 'needs_attention') {
          deals = deals.filter((d: any) =>
            d.risk_level === 'high' || d.risk_level === 'critical' ||
            d.health_status === 'warning' || d.health_status === 'critical' || d.health_status === 'stalled' ||
            (d.days_since_last_activity !== null && d.days_since_last_activity >= days)
          );
        }

        return ok({
          filter,
          period,
          count: deals.slice(0, limit).length,
          deals: deals.slice(0, limit),
        }, this.source);
      } catch (e) {
        const msg = formatAdapterError(e);
        return fail(msg, this.source);
      }
    },

    async getPipelineForecast(params) {
      try {
        const period = params.period || 'this_quarter';
        const now = new Date();

        let startDate: Date;
        let endDate: Date;
        let periodLabel: string;

        // Calculate period dates
        switch (period) {
          case 'this_month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            periodLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });
            break;
          case 'next_quarter': {
            const nextQuarter = Math.floor(now.getMonth() / 3) + 1;
            const year = nextQuarter > 3 ? now.getFullYear() + 1 : now.getFullYear();
            const qNum = nextQuarter > 3 ? 0 : nextQuarter;
            startDate = new Date(year, qNum * 3, 1);
            endDate = new Date(year, qNum * 3 + 3, 0);
            periodLabel = `Q${qNum + 1} ${year}`;
            break;
          }
          default: { // this_quarter
            const quarter = Math.floor(now.getMonth() / 3);
            startDate = new Date(now.getFullYear(), quarter * 3, 1);
            endDate = new Date(now.getFullYear(), quarter * 3 + 3, 0);
            periodLabel = `Q${quarter + 1} ${now.getFullYear()}`;
          }
        }

        // Get all deals with expected close date in period
        const { data: deals, error: dealsError } = await client
          .from('deals')
          .select(`
            id, name, value, probability, stage_id, status, expected_close_date,
            deal_stages(probability)
          `)
          .eq('owner_id', userId)
          .gte('expected_close_date', startDate.toISOString().split('T')[0])
          .lte('expected_close_date', endDate.toISOString().split('T')[0]);

        if (dealsError) throw dealsError;

        const dealList = deals || [];

        // Calculate forecast scenarios
        let bestCaseValue = 0;
        let bestCaseCount = 0;
        let committedValue = 0;
        let committedCount = 0;
        let mostLikelyValue = 0;
        let closedWonValue = 0;
        let closedWonCount = 0;

        // By month aggregation
        const byMonth: Record<string, { month: string; forecast: number; closed: number; deal_count: number }> = {};

        for (const deal of dealList) {
          const value = Number(deal.value) || 0;
          const stageData = Array.isArray(deal.deal_stages) ? deal.deal_stages[0] : deal.deal_stages;

          // Probability: use deal probability if set, else stage probability
          const prob = deal.probability ?? stageData?.probability ?? 50;

          if (deal.status === 'won') {
            closedWonValue += value;
            closedWonCount++;
          } else if (deal.status === 'active') {
            bestCaseValue += value;
            bestCaseCount++;
            mostLikelyValue += value * (prob / 100);

            if (prob >= 75) {
              committedValue += value;
              committedCount++;
            }
          }

          // By month
          if (deal.expected_close_date) {
            const closeDate = new Date(deal.expected_close_date);
            const monthKey = closeDate.toLocaleString('default', { month: 'short', year: 'numeric' });
            if (!byMonth[monthKey]) {
              byMonth[monthKey] = { month: monthKey, forecast: 0, closed: 0, deal_count: 0 };
            }
            if (deal.status === 'won') {
              byMonth[monthKey].closed += value;
            } else {
              byMonth[monthKey].forecast += value * (prob / 100);
            }
            byMonth[monthKey].deal_count++;
          }
        }

        return ok({
          period: periodLabel,
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
          best_case: { value: bestCaseValue, deal_count: bestCaseCount },
          committed: { value: committedValue, deal_count: committedCount },
          most_likely: { value: Math.round(mostLikelyValue), deal_count: bestCaseCount },
          closed_won: { value: closedWonValue, deal_count: closedWonCount },
          by_month: Object.values(byMonth),
        }, this.source);
      } catch (e) {
        const msg = formatAdapterError(e);
        return fail(msg, this.source);
      }
    },

    async getContactsNeedingAttention(params) {
      try {
        const daysSinceContact = Number(params.days_since_contact) || 14;
        const filter = params.filter || 'all';
        const limit = Math.min(Math.max(Number(params.limit ?? 20) || 20, 1), 50);

        // Get contacts with health scores
        const { data: contacts, error: contactsError } = await client
          .from('contacts')
          .select(`
            id, email, first_name, last_name, full_name, title, company_id, last_interaction_at,
            relationship_health_scores!inner(
              health_status, risk_level, days_since_last_contact, days_since_last_response,
              is_ghost_risk, ghost_probability_percent, risk_factors,
              total_interactions_30_days, email_count_30_days, meeting_count_30_days
            ),
            companies(name)
          `)
          .eq('owner_id', userId);

        if (contactsError) throw contactsError;

        // Process and filter contacts
        let contactList = (contacts || []).map((contact: any) => {
          const health = Array.isArray(contact.relationship_health_scores)
            ? contact.relationship_health_scores[0]
            : contact.relationship_health_scores;
          const company = Array.isArray(contact.companies) ? contact.companies[0] : contact.companies;

          return {
            id: contact.id,
            email: contact.email,
            name: contact.full_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
            title: contact.title,
            company_name: company?.name || null,
            last_interaction_at: contact.last_interaction_at,
            health_status: health?.health_status || 'unknown',
            risk_level: health?.risk_level || 'unknown',
            days_since_last_contact: health?.days_since_last_contact || null,
            is_ghost_risk: health?.is_ghost_risk || false,
            ghost_probability_percent: health?.ghost_probability_percent || null,
            risk_factors: health?.risk_factors || [],
            interactions_30_days: health?.total_interactions_30_days || 0,
          };
        });

        // Apply filters
        if (filter === 'at_risk') {
          contactList = contactList.filter((c: any) =>
            c.health_status === 'at_risk' || c.health_status === 'critical' ||
            c.risk_level === 'high' || c.risk_level === 'critical'
          );
        } else if (filter === 'ghost') {
          contactList = contactList.filter((c: any) =>
            c.is_ghost_risk || c.health_status === 'ghost'
          );
        } else {
          // 'all' - filter by days since contact
          contactList = contactList.filter((c: any) =>
            c.days_since_last_contact === null ||
            c.days_since_last_contact >= daysSinceContact ||
            c.health_status === 'at_risk' || c.health_status === 'critical' || c.health_status === 'ghost'
          );
        }

        // Sort by days since contact (descending)
        contactList.sort((a: any, b: any) => {
          const daysA = a.days_since_last_contact ?? 9999;
          const daysB = b.days_since_last_contact ?? 9999;
          return daysB - daysA;
        });

        // ---- Enrich with last meeting context per contact ----
        const limitedContacts = contactList.slice(0, limit);
        const contactIds = limitedContacts.map((c: any) => c.id).filter(Boolean);

        if (contactIds.length > 0) {
          // Fetch last meeting where contact is primary
          const { data: primaryMeetings } = await client
            .from('meetings')
            .select('id, title, summary, meeting_start, primary_contact_id, meeting_action_items(id, title, completed)')
            .in('primary_contact_id', contactIds)
            .eq('owner_user_id', userId)
            .order('meeting_start', { ascending: false });

          // Build contactId -> most recent meeting map from primary meetings
          const meetingMap: Record<string, any> = {};
          for (const m of (primaryMeetings || [])) {
            if (m.primary_contact_id && !meetingMap[m.primary_contact_id]) {
              meetingMap[m.primary_contact_id] = m;
            }
          }

          // Also check meeting_contacts junction for non-primary attendees
          const missingIds = contactIds.filter((id: string) => !meetingMap[id]);
          if (missingIds.length > 0) {
            const { data: junctionRows } = await client
              .from('meeting_contacts')
              .select('contact_id, meeting_id')
              .in('contact_id', missingIds);

            if (junctionRows && junctionRows.length > 0) {
              const meetingIds = [...new Set(junctionRows.map((r: any) => r.meeting_id))];
              const { data: junctionMeetings } = await client
                .from('meetings')
                .select('id, title, summary, meeting_start, meeting_action_items(id, title, completed)')
                .in('id', meetingIds)
                .eq('owner_user_id', userId)
                .order('meeting_start', { ascending: false });

              // Map junction meetings by meeting ID for lookup
              const junctionMeetingMap: Record<string, any> = {};
              for (const m of (junctionMeetings || [])) {
                junctionMeetingMap[m.id] = m;
              }

              // For each missing contact, find their most recent meeting
              for (const row of junctionRows) {
                if (!meetingMap[row.contact_id] && junctionMeetingMap[row.meeting_id]) {
                  meetingMap[row.contact_id] = junctionMeetingMap[row.meeting_id];
                }
              }
            }
          }

          // Merge meeting context into contacts
          for (const contact of limitedContacts) {
            const meeting = meetingMap[contact.id];
            if (meeting) {
              const pendingItems = (Array.isArray(meeting.meeting_action_items) ? meeting.meeting_action_items : [])
                .filter((item: any) => !item.completed)
                .map((item: any) => ({ id: item.id, title: item.title }));
              contact.last_meeting = {
                id: meeting.id,
                title: meeting.title,
                summary: meeting.summary ? meeting.summary.slice(0, 500) : null,
                date: meeting.meeting_start,
                pending_action_items: pendingItems,
              };
            }
          }
        }

        return ok({
          filter,
          days_threshold: daysSinceContact,
          count: limitedContacts.length,
          contacts: limitedContacts,
        }, this.source);
      } catch (e) {
        const msg = formatAdapterError(e);
        return fail(msg, this.source);
      }
    },

    async getCompanyStatus(params) {
      try {
        const companyId = params.company_id ? String(params.company_id).trim() : null;
        const companyName = params.company_name ? String(params.company_name).trim() : null;
        const domain = params.domain ? String(params.domain).trim() : null;

        if (!companyId && !companyName && !domain) {
          return fail('company_id, company_name, or domain is required', this.source);
        }

        // Find company
        let companyQuery = client
          .from('companies')
          .select('id, name, domain, website, industry, size, status, description')
          .eq('owner_id', userId);

        if (companyId) {
          companyQuery = companyQuery.eq('id', companyId);
        } else if (companyName) {
          companyQuery = companyQuery.ilike('name', `%${companyName}%`);
        } else if (domain) {
          companyQuery = companyQuery.ilike('domain', `%${domain}%`);
        }

        const { data: companies, error: companyError } = await companyQuery.limit(1);
        if (companyError) throw companyError;

        if (!companies || companies.length === 0) {
          return ok({
            found: false,
            message: `No company found matching: ${companyId || companyName || domain}`,
          }, this.source);
        }

        const company = companies[0];

        // Get contacts for this company
        const { data: contacts, error: contactsError } = await client
          .from('contacts')
          .select(`
            id, email, first_name, last_name, full_name, title,
            relationship_health_scores(health_status, days_since_last_contact)
          `)
          .eq('company_id', company.id)
          .eq('owner_id', userId)
          .limit(10);

        if (contactsError) throw contactsError;

        // Get deals for this company
        const { data: deals, error: dealsError } = await client
          .from('deals')
          .select(`
            id, name, value, status, expected_close_date, probability,
            deal_stages(name),
            deal_health_scores(health_status, risk_level)
          `)
          .eq('company_id', company.id)
          .eq('owner_id', userId)
          .limit(10);

        if (dealsError) throw dealsError;

        // Get recent meetings
        const { data: meetings, error: meetingsError } = await client
          .from('meetings')
          .select('id, title, meeting_start, duration_minutes, summary')
          .eq('company_id', company.id)
          .eq('owner_user_id', userId)
          .order('meeting_start', { ascending: false })
          .limit(5);

        if (meetingsError) throw meetingsError;

        // Process contacts
        const contactList = (contacts || []).map((c: any) => {
          const health = Array.isArray(c.relationship_health_scores)
            ? c.relationship_health_scores[0]
            : c.relationship_health_scores;
          return {
            id: c.id,
            name: c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim(),
            email: c.email,
            title: c.title,
            health_status: health?.health_status || null,
            days_since_last_contact: health?.days_since_last_contact || null,
          };
        });

        // Process deals
        let totalDealValue = 0;
        let activeDealValue = 0;
        const dealList = (deals || []).map((d: any) => {
          const stage = Array.isArray(d.deal_stages) ? d.deal_stages[0] : d.deal_stages;
          const health = Array.isArray(d.deal_health_scores) ? d.deal_health_scores[0] : d.deal_health_scores;
          totalDealValue += Number(d.value) || 0;
          if (d.status === 'active') activeDealValue += Number(d.value) || 0;
          return {
            id: d.id,
            name: d.name,
            value: d.value,
            status: d.status,
            stage_name: stage?.name || null,
            expected_close_date: d.expected_close_date,
            health_status: health?.health_status || null,
            risk_level: health?.risk_level || null,
          };
        });

        // Calculate overall health
        const atRiskDeals = dealList.filter((d: any) =>
          d.risk_level === 'high' || d.risk_level === 'critical' ||
          d.health_status === 'warning' || d.health_status === 'critical'
        );

        const contactHealth = contactList.map((c: any) => c.health_status).filter(Boolean);
        const overallHealth = atRiskDeals.length > 0 || contactHealth.includes('critical')
          ? 'at_risk'
          : contactHealth.includes('at_risk')
            ? 'needs_attention'
            : 'healthy';

        return ok({
          found: true,
          company,
          contacts: contactList,
          contact_count: contactList.length,
          deals: dealList,
          deal_count: dealList.length,
          total_deal_value: totalDealValue,
          active_deal_value: activeDealValue,
          at_risk_deal_count: atRiskDeals.length,
          recent_meetings: meetings || [],
          meeting_count: (meetings || []).length,
          overall_health: overallHealth,
        }, this.source);
      } catch (e) {
        const msg = formatAdapterError(e);
        return fail(msg, this.source);
      }
    },
  };
}

export function createDbEmailAdapter(client: SupabaseClient, userId: string): EmailAdapter {
  return {
    source: 'db_email',
    async searchEmails(params) {
      try {
        const limit = Math.min(Math.max(Number(params.limit ?? 10) || 10, 1), 20);

        // Prefer existing emails table if present. Filter by user_id.
        // We do not assume a contact foreign key; prefer contact_email matching.
        const contactEmail = params.contact_email ? String(params.contact_email).trim() : null;
        const query = params.query ? String(params.query).trim() : null;

        let q = client
          .from('emails')
          .select('id,thread_id,subject,snippet,received_at,from,to,link')
          .eq('user_id', userId)
          .order('received_at', { ascending: false })
          .limit(limit);

        if (contactEmail) {
          // best-effort: match in from/to arrays stored as text/json
          q = q.or(`from.ilike.%${contactEmail}%,to.ilike.%${contactEmail}%`);
        }

        if (query) {
          q = q.or(`subject.ilike.%${query}%,snippet.ilike.%${query}%`);
        }

        const { data, error } = await q;
        if (error) throw error;

        return ok({ emails: data || [] }, this.source);
      } catch (e) {
        const msg = formatAdapterError(e);
        return fail(msg, this.source);
      }
    },
    async draftEmail(params) {
      // Drafting via model is handled by api-copilot itself; adapter returns a structured request.
      // This keeps execute_action stable even if implementation changes later.
      return ok(
        {
          draft: {
            to: params.to || null,
            subject: params.subject || null,
            body: null,
            context: params.context || null,
            tone: params.tone || null,
          },
          note: 'draft_email is not executed in db_email adapter; api-copilot should generate copy using the writing skill + context.',
        },
        this.source
      );
    },
  };
}

export function createDbNotificationAdapter(_client: SupabaseClient): NotificationAdapter {
  return {
    source: 'notifications',
    async sendNotification(params, ctx) {
      if (!ctx.confirm) {
        return fail('Confirmation required to send notifications', this.source, {
          needs_confirmation: true,
          preview: params,
        });
      }
      // Actual Slack sending is performed by api-copilot using existing slack edge functions.
      return ok(
        {
          queued: true,
          channel: params.channel || 'slack',
          message: params.message,
          blocks: params.blocks || null,
          meta: params.meta || null,
        },
        this.source
      );
    },
  };
}

const GEMINI_MODEL = Deno.env.get('GEMINI_FLASH_MODEL') ?? Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.0-flash';
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? Deno.env.get('GOOGLE_GEMINI_API_KEY') ?? '';

/**
 * Parse Gemini JSON response with robust error handling
 */
function parseGeminiResponse(text: string): Record<string, unknown> {
  // Remove markdown code blocks if present
  const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  let jsonString = jsonMatch ? jsonMatch[1] : text;

  // Extract JSON object
  if (!jsonString.trim().startsWith('{')) {
    const objectMatch = jsonString.match(/\{[\s\S]*\}/);
    if (objectMatch) jsonString = objectMatch[0];
  }

  // Clean up - find first/last braces
  jsonString = jsonString.trim();
  const firstBrace = jsonString.indexOf('{');
  const lastBrace = jsonString.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    jsonString = jsonString.substring(firstBrace, lastBrace + 1);
  }

  // Remove trailing commas
  jsonString = jsonString.replace(/,(\s*[}\]])/g, '$1');

  return JSON.parse(jsonString);
}

export function createEnrichmentAdapter(): EnrichmentAdapter {
  return {
    source: 'gemini_enrichment',
    async enrichContact(params) {
      if (!GEMINI_API_KEY) {
        return fail('GEMINI_API_KEY not configured', this.source);
      }

      try {
        const name = params.name || params.email.split('@')[0];
        const prompt = `You are a B2B sales intelligence enrichment assistant. Given the following contact information, research and enrich it with comprehensive data for sales qualification and ICP matching.

Contact Information:
- Name: ${name}
- Email: ${params.email}
- Current Title: ${params.title || 'Not provided'}
- Company: ${params.company_name || 'Not provided'}

Return ONLY valid JSON with these fields (use null for unknown, never omit required fields):
{
  "title": "Accurate job title",
  "seniority_level": "One of: C-Suite, VP, Director, Manager, Senior IC, IC, Unknown",
  "department": "One of: Executive, Sales, Marketing, Engineering, Product, Operations, Finance, HR, Legal, IT, Customer Success, Unknown",
  "linkedin_url": "LinkedIn profile URL (format: https://linkedin.com/in/username)",
  "industry": "Industry classification",
  "years_in_role": "Estimated years in current role (number or null)",
  "decision_maker_signals": {
    "has_budget_authority": true/false,
    "is_final_decision_maker": true/false,
    "influences_purchases": true/false,
    "reports_to": "Title of their likely manager"
  },
  "professional_background": {
    "education": "Highest degree and institution if known",
    "previous_companies": ["List of notable previous employers"],
    "expertise_areas": ["Key skills and expertise areas"],
    "certifications": ["Relevant certifications"]
  },
  "social_presence": {
    "twitter_url": "Twitter/X profile URL if known",
    "personal_website": "Personal website or blog if known"
  },
  "engagement_insights": {
    "likely_pain_points": ["Common challenges for this role"],
    "conversation_starters": ["Topics they likely care about"],
    "best_contact_method": "One of: email, linkedin, phone, twitter"
  },
  "summary": "Brief professional summary (2-3 sentences including notable achievements)",
  "confidence": 0.5,
  "data_freshness": "estimated date of information accuracy (YYYY-MM or 'current')"
}`;

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${GEMINI_API_KEY}`;

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.3,
              topP: 0.8,
              maxOutputTokens: 2000,
              responseMimeType: 'application/json',
            },
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Gemini API error:', errorText);
          return fail(`Gemini API error: ${response.status}`, this.source);
        }

        const data = await response.json();
        const parts = data.candidates?.[0]?.content?.parts ?? [];
        const text = parts.map((p: { text?: string }) => p.text || '').join('').trim();

        if (!text) {
          return fail('Empty response from Gemini', this.source);
        }

        const enriched = parseGeminiResponse(text);
        return ok(
          {
            enriched_contact: {
              // Core fields
              title: enriched.title,
              seniority_level: enriched.seniority_level,
              department: enriched.department,
              linkedin_url: enriched.linkedin_url,
              industry: enriched.industry,
              years_in_role: enriched.years_in_role,
              // Decision maker signals for ICP matching
              decision_maker_signals: enriched.decision_maker_signals || {
                has_budget_authority: null,
                is_final_decision_maker: null,
                influences_purchases: null,
                reports_to: null,
              },
              // Professional background
              professional_background: enriched.professional_background || {
                education: null,
                previous_companies: [],
                expertise_areas: [],
                certifications: [],
              },
              // Social presence
              social_presence: enriched.social_presence || {
                twitter_url: null,
                personal_website: null,
              },
              // Engagement insights for sales
              engagement_insights: enriched.engagement_insights || {
                likely_pain_points: [],
                conversation_starters: [],
                best_contact_method: 'email',
              },
              summary: enriched.summary,
              confidence: enriched.confidence || 0.5,
              data_freshness: enriched.data_freshness || 'current',
            },
            original: { email: params.email, name, title: params.title, company_name: params.company_name },
          },
          this.source
        );
      } catch (e) {
        const msg = formatAdapterError(e);
        return fail(msg, this.source);
      }
    },

    async enrichCompany(params) {
      if (!GEMINI_API_KEY) {
        return fail('GEMINI_API_KEY not configured', this.source);
      }

      try {
        const prompt = `You are a B2B sales intelligence enrichment assistant. Given the following company information, research and enrich it with comprehensive data for sales qualification and ICP matching.

Company Information:
- Name: ${params.name}
- Domain: ${params.domain || 'Not provided'}
- Website: ${params.website || 'Not provided'}

Return ONLY valid JSON with these fields (use null for unknown, never omit required fields):
{
  "industry": "Standardized industry classification (e.g., SaaS, Healthcare, FinTech, E-commerce)",
  "sub_industry": "More specific industry vertical",
  "size_category": "One of: Startup (1-10), Small (11-50), Medium (51-200), Large (201-1000), Enterprise (1000+)",
  "employee_count": {
    "estimate": "Number or range like 50-100",
    "source": "LinkedIn, Crunchbase, Website, or estimated"
  },
  "revenue": {
    "range": "One of: Pre-revenue, <$1M, $1-10M, $10-50M, $50-100M, $100M-500M, $500M+, Unknown",
    "currency": "USD",
    "source": "Crunchbase, estimate, or unknown"
  },
  "funding": {
    "stage": "One of: Bootstrapped, Pre-seed, Seed, Series A, Series B, Series C+, Public, Private Equity, Unknown",
    "total_raised": "Amount if known",
    "last_round_date": "YYYY-MM if known",
    "key_investors": ["Notable investors"]
  },
  "technology_stack": {
    "categories": ["e.g., Cloud, CRM, Marketing Automation, Analytics"],
    "known_tools": ["Specific tools like Salesforce, HubSpot, AWS"],
    "tech_sophistication": "One of: Low, Medium, High, Enterprise"
  },
  "company_signals": {
    "growth_indicators": ["Recent hires, expansion, new products"],
    "challenges": ["Common pain points for this type of company"],
    "buying_triggers": ["Events that might trigger purchases"],
    "budget_cycle": "Fiscal year end if known (e.g., December, Q4)"
  },
  "market_position": {
    "competitors": ["Key competitors"],
    "differentiators": ["What makes them unique"],
    "target_market": "Their target customer profile"
  },
  "description": "Professional company description (2-3 sentences)",
  "linkedin_url": "LinkedIn company page URL",
  "website": "Official website URL",
  "address": {
    "headquarters": "HQ address",
    "other_locations": ["Other office locations"]
  },
  "phone": "Company phone number",
  "founded_year": "Year founded",
  "social_presence": {
    "twitter_url": "Twitter/X company page",
    "blog_url": "Company blog if exists"
  },
  "confidence": 0.5,
  "data_freshness": "estimated date of information accuracy (YYYY-MM or 'current')"
}`;

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${GEMINI_API_KEY}`;

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.3,
              topP: 0.8,
              maxOutputTokens: 2500,
              responseMimeType: 'application/json',
            },
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Gemini API error:', errorText);
          return fail(`Gemini API error: ${response.status}`, this.source);
        }

        const data = await response.json();
        const parts = data.candidates?.[0]?.content?.parts ?? [];
        const text = parts.map((p: { text?: string }) => p.text || '').join('').trim();

        if (!text) {
          return fail('Empty response from Gemini', this.source);
        }

        const enriched = parseGeminiResponse(text);
        return ok(
          {
            enriched_company: {
              // Core fields
              industry: enriched.industry,
              sub_industry: enriched.sub_industry,
              size_category: enriched.size_category || enriched.size,
              description: enriched.description,
              linkedin_url: enriched.linkedin_url,
              website: enriched.website,
              phone: enriched.phone,
              founded_year: enriched.founded_year,
              // Employee count for ICP matching
              employee_count: enriched.employee_count || {
                estimate: null,
                source: 'unknown',
              },
              // Revenue data for qualification
              revenue: enriched.revenue || {
                range: 'Unknown',
                currency: 'USD',
                source: 'unknown',
              },
              // Funding information
              funding: enriched.funding || {
                stage: 'Unknown',
                total_raised: null,
                last_round_date: null,
                key_investors: [],
              },
              // Technology stack for targeting
              technology_stack: enriched.technology_stack || {
                categories: [],
                known_tools: [],
                tech_sophistication: 'Unknown',
              },
              // Buying signals and pain points
              company_signals: enriched.company_signals || {
                growth_indicators: [],
                challenges: [],
                buying_triggers: [],
                budget_cycle: null,
              },
              // Competitive landscape
              market_position: enriched.market_position || {
                competitors: [],
                differentiators: [],
                target_market: null,
              },
              // Address information
              address: typeof enriched.address === 'string'
                ? { headquarters: enriched.address, other_locations: [] }
                : enriched.address || { headquarters: null, other_locations: [] },
              // Social presence
              social_presence: enriched.social_presence || {
                twitter_url: null,
                blog_url: null,
              },
              confidence: enriched.confidence || 0.5,
              data_freshness: enriched.data_freshness || 'current',
            },
            original: { name: params.name, domain: params.domain, website: params.website },
          },
          this.source
        );
      } catch (e) {
        const msg = formatAdapterError(e);
        return fail(msg, this.source);
      }
    },
  };
}

