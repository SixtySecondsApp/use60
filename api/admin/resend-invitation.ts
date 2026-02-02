import type { VercelRequest, VercelResponse } from '@vercel/node';

function getHeader(req: VercelRequest, name: string): string | null {
  const v = (req.headers as any)[name.toLowerCase()];
  if (!v) return null;
  return Array.isArray(v) ? String(v[0]) : String(v);
}

async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({
        error: 'Server not configured',
        details: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
      });
    }

    const authHeader = getHeader(req, 'authorization');
    if (!authHeader?.toLowerCase().startsWith('bearer ')) {
      return res.status(401).json({ error: 'Missing Authorization header' });
    }
    const callerJwt = authHeader.slice('bearer '.length);

    const { invitationId } = (req.body || {}) as {
      invitationId?: string;
    };

    if (!invitationId) {
      return res.status(400).json({ error: 'invitationId is required' });
    }

    // 1) Verify caller (admin) via Supabase Auth + DB
    const callerResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${callerJwt}`,
        apikey: serviceKey,
      },
    });

    if (!callerResp.ok) {
      const txt = await callerResp.text().catch(() => '');
      return res.status(401).json({ error: 'Invalid session', details: txt });
    }

    const caller = (await callerResp.json()) as { id: string; email?: string | null };

    const isAdminResp = await fetch(
      `${supabaseUrl}/rest/v1/profiles?select=is_admin&id=eq.${encodeURIComponent(caller.id)}`,
      {
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
      }
    );

    const isAdminJson = (await isAdminResp.json().catch(() => [])) as Array<{ is_admin: boolean }>;
    if (!Array.isArray(isAdminJson) || !isAdminJson[0]?.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // 2) Fetch invitation record
    const inviteResp = await fetch(
      `${supabaseUrl}/rest/v1/organization_invitations?select=*&id=eq.${encodeURIComponent(invitationId)}`,
      {
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
      }
    );

    const invitations = (await inviteResp.json().catch(() => [])) as Array<{
      id: string;
      email: string;
      resend_count: number;
      org_id: string;
    }>;

    if (!Array.isArray(invitations) || invitations.length === 0) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    const invitation = invitations[0];

    // 3) Check resend_count < 3
    if (invitation.resend_count >= 3) {
      return res.status(429).json({
        error: 'Maximum resend attempts reached',
        details: 'You can only resend an invitation 3 times. Please create a new invitation.'
      });
    }

    // 4) Fetch user details for email
    const userResp = await fetch(
      `${supabaseUrl}/rest/v1/profiles?select=id,email,first_name,last_name&email=eq.${encodeURIComponent(invitation.email)}`,
      {
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
      }
    );

    const users = (await userResp.json().catch(() => [])) as Array<{
      id: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
    }>;

    if (!Array.isArray(users) || users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];

    // 5) Generate new password-setup link
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host || 'app.use60.com';
    const isStaging = host.includes('staging');
    const correctRedirectTo = isStaging
      ? `https://staging.use60.com/auth/callback`
      : `https://app.use60.com/auth/callback`;

    const linkResp = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'invite',
        email: invitation.email,
        options: { redirectTo: correctRedirectTo },
      }),
    });

    const linkJson = await linkResp.json().catch(() => null);
    const actionLink = linkJson?.action_link as string | undefined;
    if (!linkResp.ok || !actionLink) {
      console.error('[resend-invitation] Failed to generate link:', {
        status: linkResp.status,
        response: linkJson,
      });
      return res.status(500).json({
        error: 'Failed to generate password setup link',
        details: linkJson,
      });
    }

    // 6) Resend email via edge function
    let emailSent = false;
    let emailError: string | null = null;

    try {
      const emailResp = await fetch(`${supabaseUrl}/functions/v1/encharge-send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
        body: JSON.stringify({
          template_type: 'welcome',
          to_email: invitation.email,
          to_name: user.first_name || invitation.email.split('@')[0],
          user_id: user.id,
          variables: {
            first_name: user.first_name || invitation.email.split('@')[0],
            last_name: user.last_name || '',
            action_url: actionLink,
            invitation_link: actionLink,
          },
        }),
      });

      if (!emailResp.ok) {
        const errorText = await emailResp.text().catch(() => '');
        emailError = `Email service returned ${emailResp.status}: ${errorText}`;
        console.error('[resend-invitation] Email sending failed:', {
          status: emailResp.status,
          error: errorText,
          email: invitation.email,
          invitationId,
        });
      } else {
        const emailResult = await emailResp.json().catch(() => ({}));

        if (emailResult.bounced || emailResult.complaint) {
          emailError = emailResult.bounced
            ? `Email bounced: ${emailResult.bounceReason || 'Unknown reason'}`
            : `Email complaint: ${emailResult.complaintReason || 'Unknown reason'}`;
          console.error('[resend-invitation] AWS SES bounce/complaint detected:', {
            bounced: emailResult.bounced,
            complaint: emailResult.complaint,
            email: invitation.email,
            invitationId,
          });
        } else {
          emailSent = true;
          console.log('[resend-invitation] Email resent successfully to:', invitation.email);
        }
      }
    } catch (emailErr: any) {
      emailError = emailErr?.message || 'Email sending exception';
      console.error('[resend-invitation] Email sending error:', {
        error: emailError,
        email: invitation.email,
        invitationId,
        stack: emailErr?.stack,
      });
    }

    // 7) Update invitation record with new status and increment resend_count
    const statusUpdatePayload = emailSent
      ? {
          email_status: 'sent',
          email_sent_at: new Date().toISOString(),
          email_error: null,
          resend_count: invitation.resend_count + 1,
        }
      : {
          email_status: 'failed',
          email_error: emailError || 'Unknown error',
          resend_count: invitation.resend_count + 1,
        };

    await fetch(
      `${supabaseUrl}/rest/v1/organization_invitations?id=eq.${encodeURIComponent(invitationId)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(statusUpdatePayload),
      }
    ).catch((err) => {
      console.error('[resend-invitation] Failed to update invitation status:', {
        invitationId,
        error: err?.message,
      });
    });

    console.log('[resend-invitation] Invitation status updated:', {
      invitationId,
      emailStatus: statusUpdatePayload.email_status,
      resendCount: statusUpdatePayload.resend_count,
      hasError: !!emailError,
    });

    // Return result
    return res.status(200).json({
      success: true,
      invitationId,
      email: invitation.email,
      emailSent,
      emailError: emailError || undefined,
      resendCount: statusUpdatePayload.resend_count,
      remainingAttempts: 3 - statusUpdatePayload.resend_count,
    });
  } catch (err: any) {
    console.error('[resend-invitation] Unexpected error:', err);
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
}

export default handler;
