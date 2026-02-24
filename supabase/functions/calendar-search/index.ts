/// <reference path="../deno.d.ts" />

/**
 * Calendar Search Edge Function
 *
 * Provides server-side full-text search for calendar events using PostgreSQL
 * GIN indexes for optimal performance.
 *
 * Endpoints:
 * - POST /calendar-search - Search calendar events with filters
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'
import {
  createSuccessResponse,
  createErrorResponse
} from '../_shared/api-utils.ts'

interface SearchRequest {
  query: string
  filters?: {
    startDate?: string
    endDate?: string
    calendarId?: string
    category?: string
  }
  limit?: number
  offset?: number
}

interface CalendarEvent {
  id: string
  title: string
  description?: string
  start_time: string
  end_time: string
  all_day: boolean
  location?: string
  category?: string
  calendar_id?: string
  attendees?: string[]
  status?: string
  created_at: string
  updated_at: string
}

serve(async (req) => {
  // Handle CORS preflight
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return createErrorResponse('Missing authorization header', 401)
    }

    // Create Supabase client with user context
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    )

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return createErrorResponse('Unauthorized', 401)
    }

    // Parse request body
    const body: SearchRequest = await req.json()
    const { query, filters = {}, limit = 50, offset = 0 } = body

    // Validate inputs
    if (!query || query.trim().length === 0) {
      return createErrorResponse('Search query is required', 400)
    }

    if (limit < 1 || limit > 100) {
      return createErrorResponse('Limit must be between 1 and 100', 400)
    }

    if (offset < 0) {
      return createErrorResponse('Offset must be non-negative', 400)
    }

    // Use the database function for full-text search
    const { data: events, error: searchError } = await supabase.rpc(
      'search_calendar_events',
      {
        p_user_id: user.id,
        p_search_query: query,
        p_start_date: filters.startDate || null,
        p_end_date: filters.endDate || null,
        p_calendar_id: filters.calendarId || null,
        p_category: filters.category || null,
      }
    )

    if (searchError) {
      console.error('Search error:', searchError)
      return createErrorResponse(
        `Search failed: ${searchError.message}`,
        500
      )
    }

    // Apply pagination
    const paginatedEvents = events.slice(offset, offset + limit)

    // Get total count for pagination metadata
    const totalCount = events.length

    // Transform database results to API format
    const formattedEvents = paginatedEvents.map((event: any) => ({
      id: event.id,
      title: event.title,
      description: event.description,
      start: event.start_time,
      end: event.end_time,
      allDay: event.all_day,
      location: event.location,
      category: event.category,
      calendarId: event.calendar_id,
      attendees: event.attendees,
      status: event.status,
      createdAt: event.created_at,
      updatedAt: event.updated_at,
    }))

    // Return results with pagination metadata
    return createSuccessResponse(
      {
        events: formattedEvents,
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasMore: offset + limit < totalCount,
        },
        query: {
          searchTerm: query,
          filters,
        },
      }
    )
  } catch (error) {
    console.error('Unexpected error:', error)
    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error occurred',
      500
    )
  }
})
