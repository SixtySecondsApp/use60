import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { matchOrCreateCompany } from '../_shared/companyMatching.ts'
import { selectPrimaryContact, determineMeetingCompany } from '../_shared/primaryContactSelection.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Fathom Company Backfill Edge Function
 *
 * Purpose: Backfill company and contact links for existing Fathom meetings
 *
 * This function:
 * 1. Finds all meetings without company_id or primary_contact_id
 * 2. Processes their attendees to match/create companies and contacts
 * 3. Determines primary contact and company for each meeting
 * 4. Creates meeting_contacts junction records
 * 5. Updates contact and company insights
 */

interface BackfillRequest {
  user_id?: string // Optional: backfill for specific user
  meeting_ids?: string[] // Optional: backfill specific meetings
  limit?: number // Optional: limit number of meetings to process
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client with service role key (bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request
    const { user_id, meeting_ids, limit = 100 }: BackfillRequest = await req.json()
    // Build query for meetings to backfill
    let query = supabase
      .from('meetings')
      .select('id, owner_user_id, company_id, primary_contact_id, fathom_recording_id, title, meeting_start, summary')
      .or('company_id.is.null,primary_contact_id.is.null')
      .eq('sync_status', 'synced')
      .order('meeting_start', { ascending: false })
      .limit(limit)

    if (user_id) {
      query = query.eq('owner_user_id', user_id)
    }

    if (meeting_ids && meeting_ids.length > 0) {
      query = query.in('id', meeting_ids)
    }

    const { data: meetings, error: meetingsError } = await query

    if (meetingsError) {
      throw new Error(`Failed to fetch meetings: ${meetingsError.message}`)
    }

    if (!meetings || meetings.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No meetings found to backfill',
          processed: 0,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }
    let successCount = 0
    let errorCount = 0
    const errors: any[] = []

    // Process each meeting
    for (const meeting of meetings) {
      try {
        // Get meeting attendees
        const { data: attendees, error: attendeesError } = await supabase
          .from('meeting_attendees')
          .select('name, email, is_external')
          .eq('meeting_id', meeting.id)
          .eq('is_external', true)

        if (attendeesError) {
          throw new Error(`Failed to fetch attendees: ${attendeesError.message}`)
        }

        if (!attendees || attendees.length === 0) {
          continue
        }
        const externalContactIds: string[] = []

        // Process each external attendee
        for (const attendee of attendees) {
          if (!attendee.email) {
            continue
          }
          // 1. Match or create company
          const { company } = await matchOrCreateCompany(supabase, attendee.email, meeting.owner_user_id, attendee.name)

          if (company) {
          }

          // 2. Find or create contact
          const { data: existingContact } = await supabase
            .from('contacts')
            .select('id, company_id')
            .eq('user_id', meeting.owner_user_id)
            .eq('email', attendee.email)
            .single()

          if (existingContact) {
            // Update company_id if missing
            if (!existingContact.company_id && company) {
              await supabase
                .from('contacts')
                .update({ company_id: company.id, updated_at: new Date().toISOString() })
                .eq('id', existingContact.id)
            }

            externalContactIds.push(existingContact.id)
          } else {
            // Create new contact
            const { data: newContact, error: contactError } = await supabase
              .from('contacts')
              .insert({
                user_id: meeting.owner_user_id,
                name: attendee.name,
                email: attendee.email,
                company_id: company?.id || null,
                source: 'fathom_backfill',
                first_seen_at: meeting.meeting_start,
              })
              .select('id')
              .single()

            if (contactError) {
            } else if (newContact) {
              externalContactIds.push(newContact.id)
            }
          }
        }

        // Determine primary contact and company
        if (externalContactIds.length > 0) {
          const primaryContactId = await selectPrimaryContact(supabase, externalContactIds, meeting.owner_user_id)

          if (primaryContactId) {
            const meetingCompanyId = await determineMeetingCompany(
              supabase,
              externalContactIds,
              primaryContactId,
              meeting.owner_user_id
            )

            // Update meeting
            await supabase
              .from('meetings')
              .update({
                primary_contact_id: primaryContactId,
                company_id: meetingCompanyId,
                updated_at: new Date().toISOString(),
              })
              .eq('id', meeting.id)
            // Create meeting_contacts junction records
            const meetingContactRecords = externalContactIds.map((contactId) => ({
              meeting_id: meeting.id,
              contact_id: contactId,
              is_primary: contactId === primaryContactId,
              role: 'attendee',
            }))

            const { error: junctionError } = await supabase
              .from('meeting_contacts')
              .upsert(meetingContactRecords, { onConflict: 'meeting_id,contact_id' })

            if (junctionError) {
            } else {
            }

            // Trigger insights aggregation by calling the functions
            if (meetingCompanyId) {
              await supabase.rpc('aggregate_company_meeting_insights', {
                p_company_id: meetingCompanyId,
              })
            }

            for (const contactId of externalContactIds) {
              await supabase.rpc('aggregate_contact_meeting_insights', {
                p_contact_id: contactId,
              })
            }
          }
        }

        successCount++
      } catch (error) {
        errorCount++
        const errorMsg = error instanceof Error ? error.message : String(error)
        errors.push({
          meeting_id: meeting.id,
          error: errorMsg,
        })
      }
    }
    return new Response(
      JSON.stringify({
        success: true,
        processed: successCount,
        errors: errorCount,
        error_details: errors,
        message: `Backfilled ${successCount} meetings with ${errorCount} errors`,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
