import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface DeletionCheckResult {
  warning_sent: number;
  deleted: number;
  errors: string[];
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS & OPTIONS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Only allow authorized requests (cron job or manual trigger with secret)
    const authHeader = req.headers.get('authorization');
    const cronSecret = Deno.env.get('CRON_SECRET');

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.warn('[org-deletion-cron] Unauthorized request');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    const result: DeletionCheckResult = {
      warning_sent: 0,
      deleted: 0,
      errors: []
    };

    console.log('[org-deletion-cron] Starting deletion check job');

    // STEP 1: Find orgs that need day-25 warning (5 days remaining)
    console.log('[org-deletion-cron] Step 1: Finding orgs for day-25 warning');

    const now = new Date();
    const fiveDaysFromNow = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
    const twentyFiveFirstDay = new Date(fiveDaysFromNow.getTime() - 1 * 24 * 60 * 60 * 1000); // Day 25

    const { data: orgsForWarning, error: warningError } = await supabase
      .from('organizations')
      .select('id, name, deactivated_at, deletion_scheduled_at, deactivated_by')
      .eq('is_active', false)
      .not('deletion_scheduled_at', 'is', null)
      .gte('deletion_scheduled_at', twentyFiveFirstDay.toISOString())
      .lt('deletion_scheduled_at', fiveDaysFromNow.toISOString());

    if (warningError) {
      console.error('[org-deletion-cron] Error fetching orgs for warning:', warningError);
      result.errors.push(`Failed to fetch orgs for warning: ${warningError.message}`);
    } else if (orgsForWarning && orgsForWarning.length > 0) {
      console.log(`[org-deletion-cron] Found ${orgsForWarning.length} orgs for day-25 warning`);

      // Send warning emails for each org
      for (const org of orgsForWarning) {
        try {
          // Get org owner email
          const { data: ownerData } = await supabase
            .from('organization_memberships')
            .select('user_id(id, email)')
            .eq('org_id', org.id)
            .eq('role', 'owner')
            .limit(1)
            .single();

          const ownerEmail = ownerData?.user_id?.email;
          if (!ownerEmail) {
            console.warn(`[org-deletion-cron] No owner email found for org ${org.id}`);
            continue;
          }

          // Get all member emails
          const { data: memberData } = await supabase
            .from('organization_memberships')
            .select('user_id(email)')
            .eq('org_id', org.id)
            .is('member_status', null); // Active members only

          const memberEmails = memberData?.map(m => m.user_id?.email).filter(Boolean) || [];

          console.log(`[org-deletion-cron] Sending day-25 warning for org ${org.id} to ${memberEmails.length} members + owner`);

          // Send day-25 warning emails to owner and members
          const allEmails = [ownerEmail, ...memberEmails];
          let emailsSent = 0;

          for (const email of allEmails) {
            try {
              const warningResponse = await fetch(
                `${Deno.env.get('SUPABASE_URL')}/functions/v1/encharge-send-email`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
                  },
                  body: JSON.stringify({
                    template_type: 'organization_deletion_warning',
                    to_email: email,
                    to_name: email.split('@')[0],
                    variables: {
                      recipient_name: email.split('@')[0],
                      organization_name: org.name,
                      days_remaining: 5,
                      deletion_date: new Date(org.deletion_scheduled_at).toLocaleDateString(),
                      reactivation_url: `${Deno.env.get('FRONTEND_URL')}/settings/organization?orgId=${org.id}&action=reactivate`,
                      support_email: 'support@use60.com'
                    }
                  })
                }
              );

              if (warningResponse.ok) {
                emailsSent++;
              } else {
                const errorText = await warningResponse.text();
                console.error(`[org-deletion-cron] Failed to send warning to ${email} for org ${org.id}:`, errorText);
              }
            } catch (emailErr) {
              console.error(`[org-deletion-cron] Error sending warning to ${email}:`, emailErr);
            }
          }

          if (emailsSent > 0) {
            result.warning_sent++;
            console.log(`[org-deletion-cron] Warning sent to ${emailsSent} recipients for org ${org.id}`);
          }
        } catch (err) {
          console.error(`[org-deletion-cron] Error processing warning for org ${org.id}:`, err);
          result.errors.push(`Error processing org ${org.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    // STEP 2: Find and delete orgs past their deletion deadline
    console.log('[org-deletion-cron] Step 2: Finding orgs ready for deletion');

    const { data: orgsForDeletion, error: deletionError } = await supabase
      .from('organizations')
      .select('id, name, deactivated_at, deletion_scheduled_at')
      .eq('is_active', false)
      .not('deletion_scheduled_at', 'is', null)
      .lte('deletion_scheduled_at', now.toISOString());

    if (deletionError) {
      console.error('[org-deletion-cron] Error fetching orgs for deletion:', deletionError);
      result.errors.push(`Failed to fetch orgs for deletion: ${deletionError.message}`);
    } else if (orgsForDeletion && orgsForDeletion.length > 0) {
      console.log(`[org-deletion-cron] Found ${orgsForDeletion.length} orgs ready for deletion`);

      // Soft-delete orgs (cascade soft-delete to related tables)
      for (const org of orgsForDeletion) {
        try {
          console.log(`[org-deletion-cron] Deleting org ${org.id}: ${org.name}`);

          // Use RPC to perform cascading soft-delete
          const { error: deleteError } = await supabase.rpc('delete_organization_cascade', {
            p_org_id: org.id
          });

          if (deleteError) {
            // If RPC doesn't exist, fall back to direct deletion
            const { error: directError } = await supabase
              .from('organizations')
              .delete()
              .eq('id', org.id);

            if (directError) {
              console.error(`[org-deletion-cron] Failed to delete org ${org.id}:`, directError);
              result.errors.push(`Failed to delete org ${org.id}`);
              continue;
            }
          }

          result.deleted++;
          console.log(`[org-deletion-cron] Org ${org.id} deleted successfully`);

          // Send final deletion notification to owner
          try {
            const { data: ownerData } = await supabase
              .from('organization_memberships')
              .select('user_id(email)')
              .eq('org_id', org.id)
              .eq('role', 'owner')
              .limit(1)
              .single();

            if (ownerData?.user_id?.email) {
              await fetch(
                `${Deno.env.get('SUPABASE_URL')}/functions/v1/encharge-send-email`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
                  },
                  body: JSON.stringify({
                    template_type: 'organization_permanently_deleted',
                    to_email: ownerData.user_id.email,
                    to_name: ownerData.user_id.email.split('@')[0],
                    variables: {
                      recipient_name: ownerData.user_id.email.split('@')[0],
                      organization_name: org.name,
                      deleted_date: now.toLocaleDateString(),
                      support_email: 'support@use60.com'
                    }
                  })
                }
              );
            }
          } catch (emailErr) {
            console.warn(`[org-deletion-cron] Failed to send final deletion email for org ${org.id}:`, emailErr);
            // Don't fail the entire job if final email fails
          }
        } catch (err) {
          console.error(`[org-deletion-cron] Error deleting org ${org.id}:`, err);
          result.errors.push(`Error deleting org ${org.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    console.log('[org-deletion-cron] Job completed:', result);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Deletion check completed',
        ...result
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('[org-deletion-cron] Fatal error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
