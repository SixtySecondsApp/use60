/**
 * Handler: profile_names
 * Extracted from sync-profile-names/index.ts
 *
 * Fallback function to sync first_name and last_name to the profiles table.
 * Called when client-side profile sync fails during signup.
 * Uses service role key to bypass RLS restrictions.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders } from '../../_shared/corsHelper.ts';

interface SyncProfileNamesRequest {
  userId: string;
  firstName: string;
  lastName: string;
}

export async function handleProfileNames(req: Request): Promise<Response> {
  const cors = getCorsHeaders(req);

  try {
    const request: SyncProfileNamesRequest = await req.json();

    const { userId, firstName, lastName } = request;

    if (!userId || !firstName || !lastName) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields: userId, firstName, lastName',
        }),
        {
          status: 400,
          headers: { ...cors, 'Content-Type': 'application/json' },
        }
      );
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Create admin client with service role key
    const supabaseAdmin = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY
    );

    // Update profile with first_name and last_name
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      })
      .eq('id', userId)
      .select();

    if (error) {
      console.error('[sync-profile-names] Database error:', error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message || 'Failed to update profile',
        }),
        {
          status: 500,
          headers: { ...cors, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('[sync-profile-names] Profile synced for user:', userId, {
      first_name: firstName,
      last_name: lastName,
      updated_rows: data?.length || 0,
    });

    return new Response(
      JSON.stringify({
        success: true,
      }),
      {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[sync-profile-names] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      }
    );
  }
}
