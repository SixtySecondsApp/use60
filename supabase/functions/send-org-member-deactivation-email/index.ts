import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

interface MemberDeactivationEmailPayload {
  recipient_emails: string[];
  org_name: string;
  deactivated_by_name: string;
  deactivation_reason: string;
  reactivation_deadline: string;
  support_email?: string;
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
    const payload: MemberDeactivationEmailPayload = await req.json();

    console.log('[send-org-member-deactivation-email] Processing:', {
      recipient_count: payload.recipient_emails.length,
      org_name: payload.org_name,
      deactivation_reason: payload.deactivation_reason
    });

    if (!payload.recipient_emails || payload.recipient_emails.length === 0) {
      console.log('[send-org-member-deactivation-email] No recipients provided');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No recipients to notify',
          emails_sent: 0
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Prepare email variables for Encharge template
    const emailVariables = {
      org_name: payload.org_name,
      deactivated_by_name: payload.deactivated_by_name,
      deactivation_reason: payload.deactivation_reason,
      deactivated_date: new Date().toLocaleDateString(),
      reactivation_deadline: new Date(payload.reactivation_deadline).toLocaleDateString(),
      support_email: payload.support_email || 'support@use60.com',
      contact_owner_message: 'Please contact the organization owner or administrator if you have questions about this deactivation.'
    };

    // Send batch email to all members
    try {
      console.log('[send-org-member-deactivation-email] Sending emails to', payload.recipient_emails.length, 'members');

      const emailResponse = await fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/encharge-send-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
          },
          body: JSON.stringify({
            template_type: 'organization-deactivated-member',
            to_emails: payload.recipient_emails,
            variables: emailVariables
          })
        }
      );

      if (!emailResponse.ok) {
        const errorText = await emailResponse.text();
        console.error('[send-org-member-deactivation-email] Email send failed:', errorText);
        // Log but don't fail - member notification is best-effort
      } else {
        console.log('[send-org-member-deactivation-email] Emails sent successfully');
      }
    } catch (emailError) {
      console.error('[send-org-member-deactivation-email] Error sending emails:', emailError);
      // Don't fail the request if email sending fails - this is non-critical
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Member deactivation emails processed',
        emails_sent: payload.recipient_emails.length
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('[send-org-member-deactivation-email] Error:', error);

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
