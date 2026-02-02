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

    // 2) Get caller's organization for rate limiting checks
    const membershipResp = await fetch(
      `${supabaseUrl}/rest/v1/organization_memberships?select=org_id&user_id=eq.${encodeURIComponent(caller.id)}`,
      {
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
      }
    );
    const memberships = (await membershipResp.json().catch(() => [])) as Array<{ org_id: string }>;
    const orgId = memberships?.[0]?.org_id;

    // 3) Rate limiting checks - BEFORE creating user
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Check admin rate limit (10 invites per 24 hours)
    const adminCountResp = await fetch(
      `${supabaseUrl}/rest/v1/invite_attempts?select=id&admin_id=eq.${encodeURIComponent(caller.id)}&attempted_at=gte.${encodeURIComponent(twentyFourHoursAgo)}`,
      {
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          Prefer: 'count=exact',
        },
      }
    );
    const adminContentRange = adminCountResp.headers.get('content-range');
    let adminInviteCount = 0;
    if (adminContentRange) {
      const match = adminContentRange.match(/\/(\d+)$/);
      if (match) adminInviteCount = parseInt(match[1], 10);
    }

    const ADMIN_LIMIT = 10;
    if (adminInviteCount >= ADMIN_LIMIT) {
      const resetTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const hoursUntilReset = Math.ceil((resetTime.getTime() - Date.now()) / (1000 * 60 * 60));
      console.warn('[invite-user] Admin rate limit exceeded:', {
        adminId: caller.id,
        adminEmail: caller.email,
        count: adminInviteCount,
        limit: ADMIN_LIMIT,
      });
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `You have reached the limit of ${ADMIN_LIMIT} invitations per day. You can send more invitations in ${hoursUntilReset} hours.`,
        limit: ADMIN_LIMIT,
        current: adminInviteCount,
        resetInHours: hoursUntilReset,
      });
    }

    // Check organization rate limit (50 invites per 24 hours)
    if (orgId) {
      const orgCountResp = await fetch(
        `${supabaseUrl}/rest/v1/invite_attempts?select=id&organization_id=eq.${encodeURIComponent(orgId)}&attempted_at=gte.${encodeURIComponent(twentyFourHoursAgo)}`,
        {
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
            Prefer: 'count=exact',
          },
        }
      );
      const orgContentRange = orgCountResp.headers.get('content-range');
      let orgInviteCount = 0;
      if (orgContentRange) {
        const match = orgContentRange.match(/\/(\d+)$/);
        if (match) orgInviteCount = parseInt(match[1], 10);
      }

      const ORG_LIMIT = 50;
      if (orgInviteCount >= ORG_LIMIT) {
        const resetTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const hoursUntilReset = Math.ceil((resetTime.getTime() - Date.now()) / (1000 * 60 * 60));
        console.warn('[invite-user] Organization rate limit exceeded:', {
          orgId,
          adminId: caller.id,
          count: orgInviteCount,
          limit: ORG_LIMIT,
        });
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: `Your organization has reached the limit of ${ORG_LIMIT} invitations per day. You can send more invitations in ${hoursUntilReset} hours.`,
          limit: ORG_LIMIT,
          current: orgInviteCount,
          resetInHours: hoursUntilReset,
        });
      }
    }

    // 4) Create user (auth)
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
      // Track failed attempt
      await fetch(`${supabaseUrl}/rest/v1/invite_attempts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          admin_id: caller.id,
          invited_email: normalizedEmail,
          organization_id: orgId || null,
          success: false,
          error_message: JSON.stringify(createdJson),
        }),
      }).catch((err) => console.error('[invite-user] Failed to track failed attempt:', err));

      return res.status(400).json({ error: 'Failed to create user', details: createdJson });
    }

    const newUserId = createdJson?.id as string | undefined;
    if (!newUserId) {
      // Track failed attempt
      await fetch(`${supabaseUrl}/rest/v1/invite_attempts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          admin_id: caller.id,
          invited_email: normalizedEmail,
          organization_id: orgId || null,
          success: false,
          error_message: 'User created but no id returned',
        }),
      }).catch((err) => console.error('[invite-user] Failed to track failed attempt:', err));

      return res.status(500).json({ error: 'User created but no id returned' });
    }

    // 5) Ensure profiles row exists so admin panel shows the user immediately
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

    // 6) Create invitation record for tracking
    let invitationId: string | null = null;
    if (orgId) {
      const inviteResp = await fetch(`${supabaseUrl}/rest/v1/organization_invitations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          org_id: orgId,
          email: normalizedEmail,
          role: 'member',
          invited_by: caller.id,
          email_status: 'pending',
        }),
      });
      const inviteJson = await inviteResp.json().catch(() => null);
      if (inviteResp.ok && Array.isArray(inviteJson) && inviteJson[0]?.id) {
        invitationId = inviteJson[0].id;
      }
    }

    // 7) Generate password-setup link (recovery) and send email via encharge-send-email
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

    // 8) Send welcome email via edge function with AWS SES error handling
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
        console.error('[invite-user] AWS SES email sending failed:', {
          status: emailResp.status,
          error: errorText,
          email: normalizedEmail,
          invitationId,
        });
      } else {
        const emailResult = await emailResp.json().catch(() => ({}));

        // Check for SES-specific errors (bounce/complaint)
        if (emailResult.bounced || emailResult.complaint) {
          emailError = emailResult.bounced
            ? `Email bounced: ${emailResult.bounceReason || 'Unknown reason'}`
            : `Email complaint: ${emailResult.complaintReason || 'Unknown reason'}`;
          console.error('[invite-user] AWS SES bounce/complaint detected:', {
            bounced: emailResult.bounced,
            complaint: emailResult.complaint,
            email: normalizedEmail,
            invitationId,
          });
        } else {
          emailSent = true;
          console.log('[invite-user] Welcome email sent successfully to:', normalizedEmail);
        }
      }
    } catch (emailErr: any) {
      emailError = emailErr?.message || 'Email sending exception';
      console.error('[invite-user] AWS SES email sending error:', {
        error: emailError,
        email: normalizedEmail,
        invitationId,
        stack: emailErr?.stack,
      });
    }

    // 9) Update invitation record with email status
    if (invitationId) {
      const statusUpdatePayload = emailSent
        ? {
            email_status: 'sent',
            email_sent_at: new Date().toISOString(),
            email_error: null,
          }
        : {
            email_status: 'failed',
            email_error: emailError || 'Unknown error',
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
        console.error('[invite-user] Failed to update invitation status:', {
          invitationId,
          error: err?.message,
        });
      });

      console.log('[invite-user] Invitation status updated:', {
        invitationId,
        emailStatus: statusUpdatePayload.email_status,
        hasError: !!emailError,
      });
    }

    if (!emailSent && emailError) {
      console.warn('[invite-user] User created but email failed:', {
        email: normalizedEmail,
        userId: newUserId,
        error: emailError,
        invitationId,
      });
    }

    // 10) Track successful invitation attempt
    await fetch(`${supabaseUrl}/rest/v1/invite_attempts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        admin_id: caller.id,
        invited_email: normalizedEmail,
        organization_id: orgId || null,
        success: true,
        error_message: null,
      }),
    }).catch((err) => {
      console.error('[invite-user] Failed to track successful attempt:', err);
      // Non-blocking - don't fail the invitation if tracking fails
    });

    // Return user info and email status
    return res.status(200).json({
      success: true,
      userId: newUserId,
      email: normalizedEmail,
      firstName: firstName || normalizedEmail.split('@')[0],
      actionLink: actionLink,
      invitationId,
      emailSent,
      emailError: emailError || undefined,
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
