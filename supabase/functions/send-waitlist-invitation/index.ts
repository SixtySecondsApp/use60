/**
 * Send Waitlist Invitation Edge Function
 *
 * Creates auth user and generates invitation link.
 * Returns emailParams for frontend to send via encharge-send-email.
 *
 * Flow:
 * 1. Validate waitlist entry exists
 * 2. Check if user already has an account
 * 3. Create auth user and generate invitation link
 * 4. Update waitlist entry with invitation tracking
 * 5. Return emailParams for frontend to send
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { verifyCronSecret } from '../_shared/edgeAuth.ts';

interface InvitationRequest {
  entryId: string;
  adminUserId: string;
  adminNotes?: string;
}

interface InvitationResponse {
  success: boolean;
  error?: string;
  invitedUserId?: string;
  emailParams?: {
    template_type: string;
    to_email: string;
    to_name: string;
    user_id: string;
    variables: {
      first_name: string;
      last_name?: string;
      action_url: string;
      invitation_link: string;
    };
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS headers for local development
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  // Auth: require cron secret
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!verifyCronSecret(req, cronSecret)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    // Initialize Supabase Admin client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Parse request body
    const { entryId, adminUserId, adminNotes }: InvitationRequest = await req.json();

    if (!entryId || !adminUserId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required parameters: entryId and adminUserId'
        } as InvitationResponse),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        }
      );
    }

    // 1. Get waitlist entry
    const { data: entry, error: fetchError } = await supabaseAdmin
      .from('meetings_waitlist')
      .select('id, email, full_name, company_name, user_id')
      .eq('id', entryId)
      .single();

    if (fetchError || !entry) {
      console.error('Failed to fetch waitlist entry:', fetchError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Waitlist entry not found'
        } as InvitationResponse),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        }
      );
    }

    // 2. Check if user already exists - check waitlist link first
    if (entry.user_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `${entry.email} already has an account. They can log in at ${Deno.env.get('SITE_URL')}/login`
        } as InvitationResponse),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        }
      );
    }

    // Check if email exists in auth.users (might not be linked to waitlist)
    const { data: userExists, error: checkError } = await supabaseAdmin.rpc('check_user_exists_by_email', {
      p_email: entry.email
    });

    if (checkError) {
      console.error('Error checking if user exists:', checkError);
      // Continue anyway - better to try invitation than block
    }

    if (userExists) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `${entry.email} already has an account but isn't linked to this waitlist entry. Please contact support.`
        } as InvitationResponse),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        }
      );
    }

    // 3. Parse name
    const nameParts = (entry.full_name || '').trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    console.log(`Creating auth user for ${entry.email} (${entry.full_name})`);

    // 4. Create auth user
    const { data: createUserData, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email: entry.email,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        full_name: entry.full_name,
        company_name: entry.company_name || '',
        waitlist_entry_id: entryId,
        invited_by_admin_id: adminUserId,
        source: 'waitlist_invitation'
      }
    });

    if (createUserError) {
      console.error('Failed to create auth user:', createUserError);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to create account: ${createUserError.message}`
        } as InvitationResponse),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        }
      );
    }

    const invitedUserId = createUserData?.user?.id;
    if (!invitedUserId) {
      console.error('User created but no id returned');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'User created but no id returned'
        } as InvitationResponse),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        }
      );
    }

    console.log(`Created auth user ${invitedUserId} for ${entry.email}`);

    // 5. Generate password setup link
    const redirectTo = `${Deno.env.get('SITE_URL')}/auth/callback?waitlist_entry=${entryId}`;
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email: entry.email,
      options: {
        redirectTo: redirectTo
      }
    });

    if (inviteError) {
      console.error('Failed to generate invitation link:', inviteError);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to generate invitation: ${inviteError.message}`
        } as InvitationResponse),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        }
      );
    }

    const invitationUrl = inviteData?.properties?.action_link;
    if (!invitationUrl) {
      console.error('Invitation link generation succeeded but no link returned');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invitation failed: no link generated'
        } as InvitationResponse),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        }
      );
    }

    console.log(`Generated invitation link for ${entry.email}, user ID: ${invitedUserId}`);

    // 6. Update waitlist entry with invitation tracking
    const invitedAt = new Date();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration

    const { error: updateError } = await supabaseAdmin
      .from('meetings_waitlist')
      .update({
        status: 'released',
        user_id: invitedUserId,
        invited_at: invitedAt.toISOString(),
        invitation_expires_at: expiresAt.toISOString(),
        invited_user_id: invitedUserId,
        granted_access_at: invitedAt.toISOString(),
        granted_by: adminUserId,
        admin_notes: adminNotes || null
      })
      .eq('id', entryId);

    if (updateError) {
      console.error('Failed to update waitlist entry:', updateError);
      // Don't fail - user was already created successfully
    }

    // 7. Log admin action (optional - table may not exist)
    try {
      await supabaseAdmin.from('waitlist_admin_actions').insert({
        waitlist_entry_id: entryId,
        admin_user_id: adminUserId,
        action_type: 'grant_access',
        action_details: {
          type: 'invitation',
          invited_user_id: invitedUserId,
          invitation_expires_at: expiresAt.toISOString()
        },
        notes: adminNotes,
        new_value: {
          status: 'released',
          invited_at: invitedAt.toISOString()
        }
      });
    } catch (logError) {
      console.warn('Failed to log admin action:', logError);
    }

    // 8. Return success with emailParams for frontend to send
    return new Response(
      JSON.stringify({
        success: true,
        invitedUserId: invitedUserId,
        emailParams: {
          template_type: 'waitlist_invite',
          to_email: entry.email,
          to_name: firstName || entry.email.split('@')[0],
          user_id: invitedUserId,
          variables: {
            first_name: firstName || entry.email.split('@')[0],
            last_name: lastName || '',
            action_url: invitationUrl,
            invitation_link: invitationUrl,
            magic_link: invitationUrl,  // Add magic_link as alias for template compatibility
          },
        }
      } as InvitationResponse),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      }
    );

  } catch (error) {
    console.error('Unexpected error in send-waitlist-invitation:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      } as InvitationResponse),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      }
    );
  }
});
