/**
 * Handler: single_activity
 * Extracted from process-single-activity/index.ts
 *
 * Processes a single activity: finds/creates contact, finds/creates deal,
 * links activity to deal, and marks activity as processed.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders } from '../../_shared/corsHelper.ts';

// Types matching database schema
interface Activity {
  id: string;
  user_id: string;
  contact_identifier: string;
  contact_identifier_type: string;
  client_name: string;
  is_processed: boolean;
  type: string;
  amount?: number | null;
}

interface Contact {
  id: string;
  email: string;
}

interface Deal {
  id: string;
  name: string;
  stage_id: string;
  stage_changed_at?: string | null;
  contact_email: string;
  owner_id: string;
  value?: number | null;
  company?: string | null;
}

interface DealActivity {
  id: string;
  deal_id: string;
  activity_id: string;
}

export async function handleSingleActivity(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req);

  try {
    // Ensure environment variables are set
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Missing Supabase environment variables.')
    }

    // Create Supabase Admin Client
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })

    // Extract activityId from request body
    const { activityId } = await req.json()
    if (!activityId) {
        throw new Error('Missing activityId in request body.')
    }
    // --- Core Processing Logic ---

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
        .from('contacts')
        .select('*')
        .eq('email', email)
        .maybeSingle<Contact>();

    if (contactFindError) throw new Error(`Error finding contact: ${contactFindError.message}`);

    if (existingContact) {
        contact = existingContact;
    } else {
        const { data: newContact, error: contactCreateError } = await supabaseAdmin
            .from('contacts')
            .insert({ email: email })
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
        let updatedDeal = false;

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
                         dealUpdates.stage_changed_at = new Date().toISOString();
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
                } else {
                    updatedDeal = true;
                }
            } else {
            }

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
            if (!newDeal) throw new Error('Failed to create deal, insert returned null.');
            deal = newDeal;
         }

        // Explicit null check for deal before creating the link
        if (!deal) throw new Error('Deal object is unexpectedly null before creating link.');

        // 4. Create Deal Activity link
        if (deal) {
            const { error: dealActivityError } = await supabaseAdmin
                .from('deal_activities')
                .insert({
                    deal_id: deal!.id,
                    activity_id: activity.id,
                    user_id: owner_id,
                    activity_type: activity.type
                });

            if (dealActivityError) {
                if (dealActivityError.code === '23505') {
                } else {
                    throw new Error(`Error creating deal activity link: ${dealActivityError.message}`);
                }
            } else {
            }
        } else {
            throw new Error('Deal is null, cannot create activity link.');
        }

        // 5. Mark Activity as Processed
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
    return new Response(JSON.stringify({ error: (error as Error).message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
    })
  }
}
