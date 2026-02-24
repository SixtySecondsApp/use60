// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts' // Reverted import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

// Reverted: Define types matching your database schema (adjust as needed)
interface Activity {
  id: string;
  user_id: string; // The user who logged the activity
  contact_identifier: string; // Email
  contact_identifier_type: string;
  client_name: string;
  is_processed: boolean;
  type: string; // Added: Ensure type is defined
  amount?: number | null; // Added: Ensure amount is defined (optional number)
  // Add other fields if needed by the logic
}

interface Contact {
  id: string;
  email: string;
  // Add other fields
}

interface Deal {
  id: string;
  name: string;
  stage_id: string; // Corrected: Use stage_id (likely a UUID)
  stage_changed_at?: string | null; // Added: Track stage changes
  contact_email: string; // Added: Assuming email is used for linking
  owner_id: string; // Added: Corresponds to activity.user_id
  value?: number | null; // Added: Deal value (optional number)
  company?: string | null; // Added: Company name (optional)
  // Removed: stage, contact_id, sales_rep_id if not directly used or named differently
}

interface DealActivity {
  id: string;
  deal_id: string;
  activity_id: string;
  // Add other fields
}

serve(async (req) => {
  // This is needed if you're planning to invoke your function from a browser.
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    // Reverted: Ensure environment variables are set
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Missing Supabase environment variables.')
    }

    // Reverted: Create Supabase Admin Client
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })

    // Reverted: Extract activityId from request body
    const { activityId } = await req.json()
    if (!activityId) {
        throw new Error('Missing activityId in request body.')
    }
    // --- Core Processing Logic --- // Reverted

    // 1. Fetch the activity
    const { data: activity, error: activityError } = await supabaseAdmin
      .from('activities')
      .select('*, type, amount') // Explicitly select type and amount
      .eq('id', activityId)
      .single<Activity>()

    if (activityError) throw new Error(`Error fetching activity: ${activityError.message}`)
    if (!activity) throw new Error(`Activity with ID ${activityId} not found.`)
    if (!activity.contact_identifier) throw new Error(`Activity ${activityId} is missing contact_identifier (email).`)
    if (activity.is_processed) {
        // Return success even if already processed to avoid repeated errors from UI
        return new Response(JSON.stringify({ message: `Activity ${activityId} already processed.` }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    }

    // Use user_id from activity, which corresponds to auth.users.id (owner_id in deals)
    const owner_id = activity.user_id;
    const email = activity.contact_identifier;
    const client_name = activity.client_name || `Deal for ${email}`; 
    // 2. Find or Create Contact
    let contact: Contact | null = null;
    const { data: existingContact, error: contactFindError } = await supabaseAdmin
        .from('contacts') // Assuming contacts table exists now
        .select('*')
        .eq('email', email)
        .maybeSingle<Contact>(); 

    if (contactFindError) throw new Error(`Error finding contact: ${contactFindError.message}`);

    if (existingContact) {
        contact = existingContact;
    } else {
        const { data: newContact, error: contactCreateError } = await supabaseAdmin
            .from('contacts')
            .insert({ email: email /* , other contact fields */ })
            .select()
            .single<Contact>();

        if (contactCreateError) throw new Error(`Error creating contact: ${contactCreateError.message}`);
        if (!newContact) throw new Error('Failed to create contact, received null.');
        contact = newContact;
    }

    // Explicit null check for contact
    if (!contact) throw new Error('Contact could not be found or created and is null.'); 

    // Check contact before proceeding
    if (contact) {
        // 3. Find or Create Deal (Now nested inside the contact check)
        let deal: Deal | null = null;
        let updatedDeal = false; // Flag to check if we updated the deal

        // --- Find existing deal (using email and owner_id) ---
        const { data: existingDeal, error: dealFindError } = await supabaseAdmin
            .from('deals')
            .select('*') 
            .eq('contact_email', contact!.email)
            .eq('owner_id', owner_id)
            .maybeSingle<Deal>();

         if (dealFindError) throw new Error(`Error finding deal: ${dealFindError.message}`);

         if (existingDeal) {
            deal = existingDeal;
            // --- Logic to potentially update stage and value --- 
            const dealUpdates: Partial<Deal> = {};
            let targetStageName: string | null = null;

            // Determine target stage based on activity
            switch (activity.type) {
                case 'sale':
                    targetStageName = 'Signed';
                    break;
                // Add other stage update mappings if needed
                // case 'meeting': targetStageName = 'SQL'; break;
                // case 'proposal': targetStageName = 'Opportunity'; break;
            }

            // 1. Check if stage needs update
            if (targetStageName) {
                const { data: stageData, error: stageError } = await supabaseAdmin
                    .from('deal_stages').select('id').eq('name', targetStageName).single();

                if (stageError || !stageData) {
                } else {
                     const targetStageId = stageData.id;
                     if (deal.stage_id !== targetStageId) {
                         dealUpdates.stage_id = targetStageId;
                         dealUpdates.stage_changed_at = new Date().toISOString(); // Also update stage change time
                     } else {
                     }
                }
            }

            // 2. Check if value needs update (only for 'sale' activities with an amount)
            if (activity.type === 'sale' && activity.amount != null) {
                if (deal.value !== activity.amount) {
                     dealUpdates.value = activity.amount;
                } else {
                }
            }

            // 3. Apply updates if any changes are needed
            if (Object.keys(dealUpdates).length > 0) {
                const { error: updateDealError } = await supabaseAdmin
                    .from('deals')
                    .update(dealUpdates)
                    .eq('id', deal.id);

                if (updateDealError) {
                    // Decide whether to throw or continue
                } else {
                    updatedDeal = true;
                    // Optionally update local deal object: deal = { ...deal, ...dealUpdates };
                }
            } else {
            }
            // --- End update logic --- 

         } else {
             // --- Create NEW Deal --- 
             let targetStageName: string;
             switch (activity.type) {
                 case 'outbound': targetStageName = 'SQL'; break;
                 case 'meeting': targetStageName = 'SQL'; break;
                 case 'proposal': targetStageName = 'Opportunity'; break;
                 case 'sale': targetStageName = 'Signed'; break;
                 default: targetStageName = 'SQL'; 
             }
             const { data: stageData, error: stageError } = await supabaseAdmin
                 .from('deal_stages').select('id').eq('name', targetStageName).single();
             if (stageError || !stageData) {
                 throw new Error(`Target stage '${targetStageName}' not found in deal_stages table. Error: ${stageError?.message}`);
             }
             const targetStageId = stageData.id;
             const { data: newDeal, error: dealCreateError } = await supabaseAdmin
                .from('deals')
                .insert({
                    name: client_name,
                    stage_id: targetStageId,
                    contact_email: contact!.email,
                    owner_id: owner_id,
                    value: activity.amount ?? 0,
                    company: client_name
                })
                .select()
                .single<Deal>();

            if (dealCreateError) throw new Error(`Error creating deal: ${dealCreateError.message}`);
            // Explicit null check for the newly created deal
            if (!newDeal) throw new Error('Failed to create deal, insert returned null.'); 
            deal = newDeal;
         }

        // Explicit null check for deal before creating the link
        if (!deal) throw new Error('Deal object is unexpectedly null before creating link.');

        // 4. Create Deal Activity link (Now nested inside contact check, needs deal check)
        // Check deal specifically before creating the link
        if (deal) {
            const { error: dealActivityError } = await supabaseAdmin
                .from('deal_activities')
                .insert({
                    deal_id: deal!.id, // Safe
                    activity_id: activity.id,
                    user_id: owner_id,
                    activity_type: activity.type
                });

            if (dealActivityError) {
                // Check for unique constraint violation (maybe it was created concurrently?)
                if (dealActivityError.code === '23505') { 
                } else {
                    throw new Error(`Error creating deal activity link: ${dealActivityError.message}`);
                }
            } else {
            }
        } else {
            // This case should theoretically not happen if create/find logic is correct, but handles null case
            throw new Error('Deal is null, cannot create activity link.'); 
        }

        // 5. Mark Activity as Processed (Still inside contact check)
        const { error: updateActivityError } = await supabaseAdmin
            .from('activities')
            .update({ is_processed: true })
            .eq('id', activity.id);

        if (updateActivityError) throw new Error(`Error updating activity status: ${updateActivityError.message}`);
        return new Response(JSON.stringify({ message: "Activity processed successfully", dealId: deal?.id ?? null }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        })

    } else { 
        throw new Error('Contact is null, cannot proceed.');
    }

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500, // Use 500 for server errors
    })
  }
})

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/process-single-activity' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
