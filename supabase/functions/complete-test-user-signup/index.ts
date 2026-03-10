/**
 * Complete Test User Signup Edge Function
 *
 * Public endpoint that completes the test user signup flow:
 * 1. Validates the magic link token
 * 2. Creates auth user with email + password
 * 3. Creates profile record
 * 4. Links user to the pre-created organization (owner for new orgs, member for existing)
 * 5. Marks onboarding as complete (skips onboarding)
 * 6. Grants credits if test user flag is set
 * 7. Marks token as used
 * 8. Seeds demo data for test users
 */

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface SignupRequest {
  token: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
}

serve(async (req) => {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const request: SignupRequest = await req.json();

    // --- Validate request ---
    if (!request.token || !request.email || !request.password || !request.first_name || !request.last_name) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: token, email, password, first_name, last_name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (request.password.length < 6) {
      return new Response(
        JSON.stringify({ success: false, error: 'Password must be at least 6 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });

    // --- Step 1: Validate token ---
    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from('test_user_magic_links')
      .select('id, token, org_id, email, is_test_user, credit_amount, expires_at, used_at, created_by')
      .eq('token', request.token)
      .maybeSingle();

    if (tokenError) {
      console.error('Token lookup error:', tokenError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to validate token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!tokenData) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or expired token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (new Date() > new Date(tokenData.expires_at)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Token has expired' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (tokenData.used_at) {
      return new Response(
        JSON.stringify({ success: false, error: 'Token has already been used' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify email matches token
    if (request.email.toLowerCase() !== tokenData.email.toLowerCase()) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email does not match the invitation' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- Step 2: Check if user already exists ---
    let userId: string;
    let isExistingUser = false;

    // Look up existing user by email via profiles table first
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', request.email.toLowerCase())
      .maybeSingle();

    if (existingProfile) {
      // User exists in profiles — reset them for a fresh start with the magic link org
      userId = existingProfile.id;
      isExistingUser = true;
      console.log('Existing user found via profile:', userId, 'for email:', request.email);

      // Update their password to what they entered on the signup form
      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: request.password,
      });
      if (updateErr) {
        console.error('Password update error (non-fatal):', updateErr);
      }

      // Remove all existing org memberships so they start fresh
      const { error: cleanupErr } = await supabaseAdmin
        .from('organization_memberships')
        .delete()
        .eq('user_id', userId);
      if (cleanupErr) {
        console.error('Membership cleanup error (non-fatal):', cleanupErr);
      } else {
        console.log('Cleaned up old memberships for user:', userId);
      }
    } else {
      // No profile found — try to create auth user
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: request.email.toLowerCase(),
        password: request.password,
        email_confirm: true,
        user_metadata: {
          first_name: request.first_name.trim(),
          last_name: request.last_name.trim(),
          full_name: `${request.first_name.trim()} ${request.last_name.trim()}`,
        },
      });

      if (authError) {
        // If user already exists in auth.users (orphaned — profile was deleted but auth wasn't),
        // look them up via the auth_users view and reclaim the account
        if (authError.message?.includes('already been registered')) {
          console.log('Auth user exists without profile, reclaiming:', request.email);
          const { data: orphanedUser } = await supabaseAdmin
            .from('auth_users_view')
            .select('id')
            .eq('email', request.email.toLowerCase())
            .maybeSingle();

          // Fallback: query auth.users directly (service role can access this)
          let orphanedId = orphanedUser?.id;
          if (!orphanedId) {
            const { data: directLookup } = await supabaseAdmin.rpc('get_auth_user_id_by_email', {
              p_email: request.email.toLowerCase(),
            });
            orphanedId = directLookup;
          }

          // Last resort: list all users and find by email
          if (!orphanedId) {
            const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
            const match = listData?.users?.find(
              (u: any) => u.email?.toLowerCase() === request.email.toLowerCase()
            );
            orphanedId = match?.id;
          }

          if (!orphanedId) {
            console.error('Could not find orphaned auth user for:', request.email);
            return new Response(
              JSON.stringify({ success: false, error: 'Account exists but could not be recovered. Contact support.' }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          userId = orphanedId;
          isExistingUser = true;

          // Update password and metadata for the reclaimed account
          await supabaseAdmin.auth.admin.updateUserById(userId, {
            password: request.password,
            user_metadata: {
              first_name: request.first_name.trim(),
              last_name: request.last_name.trim(),
              full_name: `${request.first_name.trim()} ${request.last_name.trim()}`,
            },
          });

          // Clean up any lingering memberships
          await supabaseAdmin
            .from('organization_memberships')
            .delete()
            .eq('user_id', userId);

          console.log('Reclaimed orphaned auth user:', userId);
        } else {
          console.error('Auth user creation error:', authError);
          return new Response(
            JSON.stringify({ success: false, error: 'Failed to create account: ' + authError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        userId = authData.user.id;
      }
    }

    // --- Step 3: Create profile (defensive upsert) ---
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: userId,
        email: request.email.toLowerCase(),
        first_name: request.first_name.trim(),
        last_name: request.last_name.trim(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (profileError) {
      console.error('Profile creation error:', profileError);
      // Non-fatal — profile trigger may handle it
    }

    // --- Step 4: Create organization membership ---
    // First user in the org becomes 'owner'; subsequent users join as 'member'
    const { count: existingMemberCount } = await supabaseAdmin
      .from('organization_memberships')
      .select('user_id', { count: 'exact', head: true })
      .eq('org_id', tokenData.org_id);

    const membershipRole = (existingMemberCount ?? 0) > 0 ? 'member' : 'owner';
    console.log(`Assigning role '${membershipRole}' (existing members: ${existingMemberCount ?? 0})`);

    const { error: membershipError } = await supabaseAdmin
      .from('organization_memberships')
      .upsert({
        org_id: tokenData.org_id,
        user_id: userId,
        role: membershipRole,
      }, { onConflict: 'org_id,user_id' });

    if (membershipError) {
      console.error('Membership creation error:', membershipError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to link account to organization' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- Step 5: Mark onboarding as complete (skip onboarding) ---
    const { error: onboardingError } = await supabaseAdmin
      .from('user_onboarding_progress')
      .upsert({
        user_id: userId,
        onboarding_step: 'complete',
        onboarding_completed_at: new Date().toISOString(),
        skipped_onboarding: false,
      }, { onConflict: 'user_id' });

    if (onboardingError) {
      console.error('Onboarding progress error:', onboardingError);
      // Non-fatal — user can still proceed
    }

    // --- Step 6: Grant credits if test user ---
    if (tokenData.is_test_user && tokenData.credit_amount > 0) {
      try {
        // Use add_credits directly (admin_grant_credits requires auth.uid() context)
        const { error: creditError } = await supabaseAdmin.rpc('add_credits', {
          p_org_id: tokenData.org_id,
          p_amount: tokenData.credit_amount,
          p_type: 'bonus',
          p_description: 'Test user provisioning — magic link signup',
          p_stripe_session_id: null,
          p_created_by: tokenData.created_by,
        });

        if (creditError) {
          console.error('Credit grant error:', creditError);
          // Non-fatal — admin can grant credits manually later
        } else {
          console.log('Granted', tokenData.credit_amount, 'credits to org', tokenData.org_id);
        }
      } catch (creditErr) {
        console.error('Credit grant exception:', creditErr);
      }
    }

    // --- Step 7: Mark token as used ---
    const { error: markUsedError } = await supabaseAdmin
      .from('test_user_magic_links')
      .update({
        used_at: new Date().toISOString(),
        activated_user_id: userId,
      })
      .eq('id', tokenData.id);

    if (markUsedError) {
      console.error('Failed to mark token as used:', markUsedError);
      // Non-fatal — token validation checks used_at anyway
    }

    // No email verification needed — admin-created test users are auto-confirmed

    // --- Step 8: Seed demo data (fire-and-forget, non-blocking) ---
    // Trigger seeding but don't wait — user gets instant response.
    // seed-demo-data has its own idempotency guard and will skip if org already has data.
    if (tokenData.is_test_user) {
      const seedUrl = `${SUPABASE_URL}/functions/v1/seed-demo-data`;
      fetch(seedUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          org_id: tokenData.org_id,
          user_id: userId,
        }),
      }).then(res => {
        if (!res.ok) console.error('seed-demo-data call failed:', res.status);
        else console.log('seed-demo-data triggered for org:', tokenData.org_id);
      }).catch(err => {
        console.error('Failed to trigger seed-demo-data:', err);
      });
    }

    console.log('Test user signup complete:', request.email, 'org:', tokenData.org_id, 'existing:', isExistingUser);

    return new Response(
      JSON.stringify({
        success: true,
        message: isExistingUser
          ? 'Your account has been linked to the organization. You can log in now.'
          : 'Account created! You can log in now.',
        org_id: tokenData.org_id,
        existing_user: isExistingUser,
        role: membershipRole,
        show_tour: true,  // Signal frontend to trigger product tour after login
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error completing test user signup:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
