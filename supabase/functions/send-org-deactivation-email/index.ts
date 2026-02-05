import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface DeactivationEmailPayload {
  org_id: string;
  org_name: string;
  deactivated_by_name: string;
  deactivation_reason: string;
  deactivated_at: string;
  reactivation_deadline: string;
  member_emails: string[];
  owner_email?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    const payload: DeactivationEmailPayload = await req.json();

    console.log('[send-org-deactivation-email] Received payload:', {
      org_id: payload.org_id,
      org_name: payload.org_name,
      member_count: payload.member_emails.length,
      reactivation_deadline: payload.reactivation_deadline
    });

    // Get owner's email from organization_memberships
    let ownerEmail = payload.owner_email;
    if (!ownerEmail) {
      const { data: ownerData } = await supabase
        .from('organization_memberships')
        .select('user_id(email)')
        .eq('org_id', payload.org_id)
        .eq('role', 'owner')
        .limit(1)
        .single();

      if (ownerData?.user_id) {
        ownerEmail = ownerData.user_id.email;
      }
    }

    // Build reactivation URL (owner can click to reactivate)
    const reactivationUrl = `${Deno.env.get('FRONTEND_URL')}/settings/organization?orgId=${payload.org_id}&action=reactivate`;

    // Prepare email variables for Encharge
    const ownerEmailVariables = {
      org_name: payload.org_name,
      deactivated_by_name: payload.deactivated_by_name,
      deactivation_reason: payload.deactivation_reason,
      deactivated_at: new Date(payload.deactivated_at).toLocaleDateString(),
      reactivation_deadline: new Date(payload.reactivation_deadline).toLocaleDateString(),
      days_remaining: 30,
      reactivation_url: reactivationUrl,
      support_email: 'support@use60.com'
    };

    const memberEmailVariables = {
      org_name: payload.org_name,
      deactivated_by_name: payload.deactivated_by_name,
      deactivation_reason: payload.deactivation_reason,
      deactivated_at: new Date(payload.deactivated_at).toLocaleDateString(),
      reactivation_deadline: new Date(payload.reactivation_deadline).toLocaleDateString(),
      days_remaining: 30,
      support_email: 'support@use60.com'
    };

    // Send owner confirmation email with reactivation button
    if (ownerEmail) {
      try {
        console.log('[send-org-deactivation-email] Sending owner email to:', ownerEmail);

        const ownerEmailResponse = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/encharge-send-email`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
            },
            body: JSON.stringify({
              template_type: 'organization_deactivated_owner',
              to_email: ownerEmail,
              to_name: payload.deactivated_by_name,
              variables: {
                ...ownerEmailVariables,
                recipient_name: ownerEmail.split('@')[0],
                organization_name: payload.org_name,
                deletion_date: new Date(payload.reactivation_deadline).toLocaleDateString()
              }
            })
          }
        );

        if (!ownerEmailResponse.ok) {
          const errorText = await ownerEmailResponse.text();
          console.error('[send-org-deactivation-email] Owner email failed:', errorText);
        } else {
          console.log('[send-org-deactivation-email] Owner email sent successfully');
        }
      } catch (ownerEmailError) {
        console.error('[send-org-deactivation-email] Error sending owner email:', ownerEmailError);
        // Don't fail the entire request if owner email fails
      }
    }

    // Send member notification emails (individual)
    if (payload.member_emails.length > 0) {
      try {
        console.log('[send-org-deactivation-email] Sending member emails to:', payload.member_emails.length, 'members');

        let memberEmailsSent = 0;
        for (const memberEmail of payload.member_emails) {
          try {
            const memberEmailResponse = await fetch(
              `${Deno.env.get('SUPABASE_URL')}/functions/v1/encharge-send-email`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
                },
                body: JSON.stringify({
                  template_type: 'organization_deactivated_member',
                  to_email: memberEmail,
                  to_name: memberEmail.split('@')[0],
                  variables: {
                    ...memberEmailVariables,
                    recipient_name: memberEmail.split('@')[0],
                    organization_name: payload.org_name,
                    organization_owner_email: ownerEmail || 'support@use60.com'
                  }
                })
              }
            );

            if (memberEmailResponse.ok) {
              memberEmailsSent++;
            } else {
              const errorText = await memberEmailResponse.text();
              console.error('[send-org-deactivation-email] Member email failed for', memberEmail, ':', errorText);
            }
          } catch (singleMemberError) {
            console.error('[send-org-deactivation-email] Error sending member email to', memberEmail, ':', singleMemberError);
          }
        }

        console.log('[send-org-deactivation-email] Member emails sent successfully to', memberEmailsSent, 'of', payload.member_emails.length, 'members');
      } catch (memberEmailError) {
        console.error('[send-org-deactivation-email] Error sending member emails:', memberEmailError);
        // Don't fail the entire request if member emails fail
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Deactivation emails sent',
        owner_notified: !!ownerEmail,
        members_notified: payload.member_emails.length
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('[send-org-deactivation-email] Error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
