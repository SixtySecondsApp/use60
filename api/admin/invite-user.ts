import type { VercelRequest, VercelResponse } from '@vercel/node';
// import { withOtel } from '../lib/withOtel';

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
    // Trim env vars to remove any whitespace/newlines
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!supabaseUrl || !serviceKey) {
      console.error('[invite-user] Missing environment config:', {
        hasUrl: !!supabaseUrl,
        hasServiceKey: !!serviceKey,
        url: supabaseUrl,
        // Don't log the actual key, just presence
      });
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

    const { email, first_name, last_name } = (req.body || {}) as {
      email?: string;
      first_name?: string;
      last_name?: string;
    };

    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const firstName = first_name ? String(first_name).trim() : null;
    const lastName = last_name ? String(last_name).trim() : null;

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

    // 2) Create user (auth)
    const redirectTo = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/auth/callback`;

    const createUserResp = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: normalizedEmail,
        email_confirm: true,
        user_metadata: {
          first_name: firstName,
          last_name: lastName,
          full_name: firstName && lastName ? `${firstName} ${lastName}` : null,
          invited_by_admin_id: caller.id,
        },
      }),
    });

    const createdJson = await createUserResp.json().catch(() => null);
    if (!createUserResp.ok) {
      return res.status(400).json({ error: 'Failed to create user', details: createdJson });
    }

    const newUserId = createdJson?.id as string | undefined;
    if (!newUserId) {
      return res.status(500).json({ error: 'User created but no id returned' });
    }

    // 3) Ensure profiles row exists so admin panel shows the user immediately
    await fetch(`${supabaseUrl}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        id: newUserId,
        email: normalizedEmail,
        first_name: firstName,
        last_name: lastName,
      }),
    }).catch(() => undefined);

    // 4) Generate password-setup link (recovery) and send email via encharge-send-email
    // Build the correct redirect URL for staging/production
    // On staging, use the staging domain; on production, use the production domain
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
        email: normalizedEmail,
        options: { redirectTo: correctRedirectTo },
      }),
    });

    const linkJson = await linkResp.json().catch(() => null);
    // Supabase returns action_link at the top level, not under properties
    const actionLink = linkJson?.action_link as string | undefined;
    if (!linkResp.ok || !actionLink) {
      console.error('[invite-user] Failed to generate link:', {
        status: linkResp.status,
        statusText: linkResp.statusText,
        response: linkJson,
        redirectTo: correctRedirectTo,
      });
      return res.status(500).json({
        error: 'Failed to generate password setup link',
        details: linkJson,
        status: linkResp.status,
        redirectTo: correctRedirectTo,
      });
    }

    // 5) Send welcome email via edge function
    let emailSent = false;
    let emailError = null;

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
          to_email: normalizedEmail,
          to_name: firstName || normalizedEmail.split('@')[0],
          user_id: newUserId,
          variables: {
            first_name: firstName || normalizedEmail.split('@')[0],
            last_name: lastName || '',
            action_url: actionLink,
            invitation_link: actionLink,
          },
        }),
      });

      if (!emailResp.ok) {
        const errorText = await emailResp.text().catch(() => '');
        emailError = `Email service returned ${emailResp.status}: ${errorText}`;
        console.error('[invite-user] Email sending failed:', emailError);
      } else {
        emailSent = true;
        console.log('[invite-user] Welcome email sent successfully to:', normalizedEmail);
      }
    } catch (emailErr: any) {
      emailError = emailErr?.message || 'Email sending exception';
      console.error('[invite-user] Email sending error:', emailError);
    }

    // 6) Update invitation record with email status (if invitation was created)
    // Note: This API creates auth users directly, not invitations
    // Email tracking is for the audit trail only
    if (!emailSent && emailError) {
      console.warn('[invite-user] User created but email failed:', emailError);
    }

    // Return user info and email status
    return res.status(200).json({
      success: true,
      userId: newUserId,
      email: normalizedEmail,
      firstName: firstName || normalizedEmail.split('@')[0],
      actionLink: actionLink,
      emailSent,
      emailError,
      // Still include emailParams for frontend fallback/resend
      emailParams: {
        template_type: 'welcome',
        to_email: normalizedEmail,
        to_name: firstName || normalizedEmail.split('@')[0],
        user_id: newUserId,
        variables: {
          first_name: firstName || normalizedEmail.split('@')[0],
          last_name: lastName || '',
          action_url: actionLink,
          invitation_link: actionLink,
        },
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
}

// Bypass OpenTelemetry - export handler directly (this is the version that worked)
export default handler;
// export default withOtel('api.admin.invite-user', handler);
