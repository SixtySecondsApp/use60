/**
 * Invitation Service
 *
 * Manages organization invitations - creating, sending, accepting, and revoking.
 */

import { supabase } from '@/lib/supabase/clientV2';
import logger from '@/lib/utils/logger';

export interface Invitation {
  id: string;
  org_id: string;
  email: string;
  role: 'owner' | 'admin' | 'member' | 'readonly';
  invited_by: string | null;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  organization?: {
    id: string;
    name: string;
  };
}

export interface CreateInvitationParams {
  orgId: string;
  email: string;
  role: 'admin' | 'member';
}

export interface AcceptInvitationResult {
  success: boolean;
  org_id: string | null;
  org_name: string | null;
  role: string | null;
  error_message: string | null;
}

// =====================================================
// Send Invitation Email
// =====================================================

async function sendInvitationEmail(invitation: Invitation, inviterName?: string) {
  try {
    // Get organization name
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', invitation.org_id)
      .single();

    const organizationName = org?.name || 'the organization';

    // Get invitee's first name from profile or extract from email
    let inviteeName = 'there';
    const { data: inviteeProfile } = await supabase
      .from('profiles')
      .select('first_name')
      .eq('email', invitation.email.toLowerCase())
      .maybeSingle();

    if (inviteeProfile?.first_name) {
      inviteeName = inviteeProfile.first_name;
    } else {
      // Extract name from email if no profile exists
      const emailName = invitation.email.split('@')[0];
      inviteeName = emailName.charAt(0).toUpperCase() + emailName.slice(1);
    }

    // Build invitation URL
    const baseUrl = typeof window !== 'undefined'
      ? window.location.origin
      : 'https://app.use60.com'; // Default to production URL

    const invitationUrl = `${baseUrl}/invite/${invitation.token}`;

    // Generate inviter initials from name
    const name = inviterName || 'A team member';
    const initials = name
      .split(' ')
      .filter((part) => part.length > 0)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('');

    // Call encharge-send-email edge function
    const { error } = await supabase.functions.invoke('encharge-send-email', {
      body: {
        to_email: invitation.email,
        to_name: inviteeName,
        template_type: 'organization_invitation',
        variables: {
          first_name: inviteeName,
          recipient_name: inviteeName,
          organization_name: organizationName,
          inviter_name: name,
          inviter_initials: initials || 'SS',
          invitation_url: invitationUrl,
          expiry_time: '7 days',
        },
        user_id: null, // No user_id yet since invitee may not have account
      },
    });

    if (error) {
      logger.error('[InvitationService] Error sending invitation email:', error);
      // Don't throw - invitation still created even if email fails
      return false;
    }

    logger.log('[InvitationService] Invitation email sent successfully');
    return true;
  } catch (err: any) {
    logger.error('[InvitationService] Exception sending invitation email:', err);
    return false;
  }
}

// =====================================================
// Create Invitation
// =====================================================

export async function createInvitation({
  orgId,
  email,
  role,
}: CreateInvitationParams): Promise<{ data: Invitation | null; error: string | null }> {
  try {
    logger.log('[InvitationService] Creating invitation:', { orgId, email, role });

    // Check if user already exists and is a member
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    const profileId = (profileData as { id: string } | null)?.id;
    if (profileId) {
      const { data: existingMembership } = await supabase
        .from('organization_memberships')
        .select('user_id')
        .eq('org_id', orgId)
        .eq('user_id', profileId)
        .maybeSingle();

      if (existingMembership) {
        return { data: null, error: 'User is already a member of this organization' };
      }
    }

    // Check for existing pending invitation - if exists, regenerate token instead of rejecting
    // This allows admins to easily resend if user accidentally closed the tab or lost the link
    // Note: selecting specific columns to avoid auth.users permission error (invited_by FK)
    const { data: existingInvite } = await supabase
      .from('organization_invitations')
      .select('id, org_id, email, role, token, expires_at, accepted_at, created_at')
      .eq('org_id', orgId)
      .eq('email', email.toLowerCase())
      .is('accepted_at', null)
      .maybeSingle();

    if (existingInvite) {
      // If still valid (not expired), regenerate token and extend expiration
      const existingExpiry = new Date(existingInvite.expires_at);
      const now = new Date();

      // If invitation hasn't expired, reuse and regenerate token for security
      if (existingExpiry > now) {
        logger.log('[InvitationService] Reusing pending invitation and regenerating token:', existingInvite.id);

        // Update with new token and 7-day expiration
        const { data: updatedInvite, error: updateError } = await supabase
          .from('organization_invitations' as any)
          .update({
            // Generate new hex token (64-char hex string like the schema expects)
            token: Array.from(crypto.getRandomValues(new Uint8Array(32)))
              .map(b => b.toString(16).padStart(2, '0'))
              .join(''),
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          } as any)
          .eq('id', existingInvite.id)
          .select()
          .single();

        if (updateError) {
          logger.error('[InvitationService] Error regenerating token:', updateError);
          return { data: null, error: updateError.message };
        }

        const invitationData = updatedInvite as unknown as Invitation;

        // Send invitation email with new token
        const { data: { user } } = await supabase.auth.getUser();
        const inviterName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'A team member';
        await sendInvitationEmail(invitationData, inviterName);

        return { data: invitationData, error: null };
      }
      // If expired, fall through to create new one
    }

    // Get current user for invited_by
    const { data: { user } } = await supabase.auth.getUser();

    // Create the invitation with explicit token generation
    // Note: organization_invitations table is created by our migrations but not in generated types
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const { data, error } = await supabase
      .from('organization_invitations' as any)
      .insert({
        org_id: orgId,
        email: email.toLowerCase(),
        role,
        invited_by: user?.id || null,
        token, // Explicitly set the token
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      } as any)
      .select()
      .single();

    if (error) {
      logger.error('[InvitationService] Error creating invitation:', error);
      return { data: null, error: error.message };
    }

    const invitationData = data as unknown as Invitation;
    logger.log('[InvitationService] Invitation created:', invitationData?.id);

    // Send invitation email
    const inviterName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'A team member';
    await sendInvitationEmail(invitationData, inviterName);

    return { data: invitationData, error: null };
  } catch (err: any) {
    logger.error('[InvitationService] Exception creating invitation:', err);
    return { data: null, error: err.message || 'Failed to create invitation' };
  }
}

// =====================================================
// Accept Invitation
// =====================================================

export async function acceptInvitation(
  token: string
): Promise<AcceptInvitationResult> {
  try {
    logger.log('[InvitationService] Accepting invitation with token');

    // Note: accept_org_invitation is defined in our migrations but not in generated types
    // Use type assertion on the whole result to work around missing types
    const response = await (supabase.rpc as any)('accept_org_invitation', {
      p_token: token,
    }) as { data: AcceptInvitationResult[] | null; error: any };

    if (response.error) {
      logger.error('[InvitationService] Error accepting invitation:', response.error);
      return {
        success: false,
        org_id: null,
        org_name: null,
        role: null,
        error_message: response.error.message,
      };
    }

    // The function returns a table, so data will be an array
    const result = response.data?.[0] || null;

    if (!result?.success) {
      return {
        success: false,
        org_id: result?.org_id || null,
        org_name: result?.org_name || null,
        role: result?.role || null,
        error_message: result?.error_message || 'Failed to accept invitation',
      };
    }

    logger.log('[InvitationService] Invitation accepted:', result);

    // After accepting invitation, remove user from old organizations
    // This prevents users from being in multiple organizations
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        const userId = session.user.id;

        // Get all user's memberships
        const { data: allMemberships } = await supabase
          .from('organization_memberships')
          .select('org_id, role, organizations(created_by)')
          .eq('user_id', userId);

        // Find old organizations (anything except the one they just joined)
        const oldOrgs = allMemberships?.filter(m =>
          m.org_id !== result.org_id  // Not the organization they just joined
        ) || [];

        // Remove user from all other organizations
        for (const oldOrg of oldOrgs) {
          await supabase
            .from('organization_memberships')
            .delete()
            .eq('org_id', oldOrg.org_id)
            .eq('user_id', userId);

          logger.log('[InvitationService] Removed from old org:', oldOrg.org_id);
        }
        // Trigger will automatically delete empty orgs
      }
    } catch (cleanupErr) {
      logger.error('[InvitationService] Failed to cleanup old orgs:', cleanupErr);
    }

    return {
      success: true,
      org_id: result.org_id,
      org_name: result.org_name,
      role: result.role,
      error_message: null,
    };
  } catch (err: any) {
    logger.error('[InvitationService] Exception accepting invitation:', err);
    return {
      success: false,
      org_id: null,
      org_name: null,
      role: null,
      error_message: err.message || 'Failed to accept invitation',
    };
  }
}

// =====================================================
// Get Pending Invitations for Organization
// =====================================================

export async function getOrgInvitations(
  orgId: string
): Promise<{ data: Invitation[] | null; error: string | null }> {
  try {
    // Note: selecting specific columns to avoid auth.users permission error (invited_by FK)
    const { data, error } = await supabase
      .from('organization_invitations')
      .select('id, org_id, email, role, token, expires_at, accepted_at, created_at')
      .eq('org_id', orgId)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('[InvitationService] Error fetching invitations:', error);
      return { data: null, error: error.message };
    }

    return { data: data || [], error: null };
  } catch (err: any) {
    logger.error('[InvitationService] Exception fetching invitations:', err);
    return { data: null, error: err.message || 'Failed to fetch invitations' };
  }
}

// =====================================================
// Get Invitation by Token (for accept page)
// =====================================================

export async function getInvitationByToken(
  token: string
): Promise<{ data: Invitation | null; error: string | null }> {
  try {
    logger.log('[InvitationService] Looking up invitation with token:', { tokenLength: token?.length, tokenStart: token?.substring(0, 10) });

    // Strategy 1: Call edge function (uses service role, bypasses RLS)
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseAnonKey) {
      try {
        const edgeRes = await fetch(`${supabaseUrl}/functions/v1/get-invitation-by-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({ token }),
        });

        if (edgeRes.ok) {
          const result = await edgeRes.json();
          if (result.data) {
            const row = result.data;
            logger.log('[InvitationService] Invitation found via edge function:', { id: row.id, email: row.email, org_name: row.org_name });
            return { data: {
              id: row.id,
              org_id: row.org_id,
              email: row.email,
              role: row.role,
              invited_by: null,
              token: row.token,
              expires_at: row.expires_at,
              accepted_at: row.accepted_at,
              created_at: row.created_at,
              organization: row.org_name ? { id: row.org_id, name: row.org_name } : undefined,
            } as Invitation, error: null };
          }
          if (result.error) {
            return { data: null, error: result.error };
          }
        } else {
          logger.warn('[InvitationService] Edge function returned:', edgeRes.status);
        }
      } catch (edgeErr) {
        logger.warn('[InvitationService] Edge function not available, trying RPC fallback:', edgeErr);
      }
    }

    // Strategy 2: Try SECURITY DEFINER RPC (requires migration to be applied)
    const { data: rpcData, error: rpcError } = await (supabase.rpc as any)('get_invitation_by_token', {
      p_token: token,
    }) as { data: any[] | null; error: any };

    if (!rpcError && rpcData) {
      const row = rpcData?.[0] || null;
      if (!row) {
        return { data: null, error: 'Invitation not found, expired, or already used' };
      }
      logger.log('[InvitationService] Invitation found via RPC:', { id: row.id, email: row.email, org_name: row.org_name });
      return { data: {
        id: row.id,
        org_id: row.org_id,
        email: row.email,
        role: row.role,
        invited_by: null,
        token: row.token,
        expires_at: row.expires_at,
        accepted_at: row.accepted_at,
        created_at: row.created_at,
        organization: row.org_name ? { id: row.org_id, name: row.org_name } : undefined,
      } as Invitation, error: null };
    }

    if (rpcError) {
      logger.warn('[InvitationService] RPC not available, using direct query fallback:', rpcError.message);
    }

    // Strategy 3: Direct query fallback
    return await getInvitationByTokenFallback(token);
  } catch (err: any) {
    logger.error('[InvitationService] Exception fetching invitation:', err);
    return { data: null, error: err.message || 'Failed to fetch invitation' };
  }
}

// Fallback for when the get_invitation_by_token RPC doesn't exist yet
async function getInvitationByTokenFallback(
  token: string
): Promise<{ data: Invitation | null; error: string | null }> {
  // Use PostgREST embedded resource join to get org name in one query
  // This works because organization_invitations has a FK to organizations
  // and organization_invitations has RLS disabled
  const { data, error } = await supabase
    .from('organization_invitations')
    .select('id, org_id, email, role, token, expires_at, accepted_at, created_at, organizations(id, name)')
    .eq('token', token)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) {
    logger.error('[InvitationService] Fallback query error:', error);

    // If the join fails, try without the org name
    const { data: basicData, error: basicError } = await supabase
      .from('organization_invitations')
      .select('id, org_id, email, role, token, expires_at, accepted_at, created_at')
      .eq('token', token)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (basicError) return { data: null, error: basicError.message };
    if (!basicData) return { data: null, error: 'Invitation not found, expired, or already used' };

    return { data: {
      ...basicData,
      invited_by: null,
      organization: undefined,
    } as Invitation, error: null };
  }

  if (!data) return { data: null, error: 'Invitation not found, expired, or already used' };

  // Extract org from the joined data
  const org = (data as any).organizations;

  return { data: {
    id: data.id,
    org_id: data.org_id,
    email: data.email,
    role: data.role,
    token: data.token,
    expires_at: data.expires_at,
    accepted_at: data.accepted_at,
    created_at: data.created_at,
    invited_by: null,
    organization: org ? { id: org.id, name: org.name } : undefined,
  } as Invitation, error: null };
}

// =====================================================
// Revoke Invitation
// =====================================================

export async function revokeInvitation(
  invitationId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    logger.log('[InvitationService] Revoking invitation:', invitationId);

    const { error } = await supabase
      .from('organization_invitations')
      .delete()
      .eq('id', invitationId)
      .is('accepted_at', null);

    if (error) {
      logger.error('[InvitationService] Error revoking invitation:', error);
      return { success: false, error: error.message };
    }

    logger.log('[InvitationService] Invitation revoked');
    return { success: true, error: null };
  } catch (err: any) {
    logger.error('[InvitationService] Exception revoking invitation:', err);
    return { success: false, error: err.message || 'Failed to revoke invitation' };
  }
}

// =====================================================
// Complete Invite Signup (for new users signing up via invitation)
// =====================================================

export async function completeInviteSignup(
  token: string
): Promise<AcceptInvitationResult> {
  try {
    logger.log('[InvitationService] Completing invite signup with token');

    // Call the complete_invite_signup RPC function
    const response = await (supabase.rpc as any)('complete_invite_signup', {
      p_token: token,
    }) as { data: AcceptInvitationResult[] | null; error: any };

    if (response.error) {
      logger.error('[InvitationService] Error completing invite signup:', response.error);
      return {
        success: false,
        org_id: null,
        org_name: null,
        role: null,
        error_message: response.error.message,
      };
    }

    // The function returns a table, so data will be an array
    const result = response.data?.[0] || null;

    if (!result?.success) {
      return {
        success: false,
        org_id: result?.org_id || null,
        org_name: result?.org_name || null,
        role: result?.role || null,
        error_message: result?.error_message || 'Failed to complete invite signup',
      };
    }

    logger.log('[InvitationService] Invite signup completed:', result);

    return {
      success: true,
      org_id: result.org_id,
      org_name: result.org_name,
      role: result.role,
      error_message: null,
    };
  } catch (err: any) {
    logger.error('[InvitationService] Exception completing invite signup:', err);
    return {
      success: false,
      org_id: null,
      org_name: null,
      role: null,
      error_message: err.message || 'Failed to complete invite signup',
    };
  }
}

// =====================================================
// Resend Invitation (update expiry and resend email)
// =====================================================

export async function resendInvitation(
  invitationId: string
): Promise<{ data: Invitation | null; error: string | null }> {
  try {
    logger.log('[InvitationService] Resending invitation:', invitationId);

    // Update expiry date and regenerate token
    // Use type assertion to work around missing types for organization_invitations
    const response = await (supabase
      .from('organization_invitations') as any)
      .update({
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        // Generate new 64-char hex token for security (matches schema)
        token: Array.from(crypto.getRandomValues(new Uint8Array(32)))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(''),
      })
      .eq('id', invitationId)
      .is('accepted_at', null)
      .select()
      .single() as { data: Invitation | null; error: any };

    if (response.error) {
      logger.error('[InvitationService] Error resending invitation:', response.error);
      return { data: null, error: response.error.message };
    }

    const invitationData = response.data;

    // Send invitation email
    const { data: { user } } = await supabase.auth.getUser();
    const inviterName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'A team member';
    await sendInvitationEmail(invitationData, inviterName);

    logger.log('[InvitationService] Invitation resent');
    return { data: invitationData, error: null };
  } catch (err: any) {
    logger.error('[InvitationService] Exception resending invitation:', err);
    return { data: null, error: err.message || 'Failed to resend invitation' };
  }
}
