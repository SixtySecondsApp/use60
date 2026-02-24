/**
 * cleanup-incomplete-onboarding
 *
 * Scheduled cleanup function that deletes organizations where onboarding was
 * never completed (abandoned after org creation during the enrichment phase).
 *
 * Criteria for deletion:
 * - organizations.onboarding_completed_at IS NULL
 * - organizations.created_at < NOW() - 24 hours
 * - No other active members besides the creator
 *
 * Triggered by: pg_cron daily schedule or manual admin invocation.
 * Auth: Uses CRON_SECRET header or service role key.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    // Auth: accept CRON_SECRET header or Authorization with service role key
    const cronSecret = req.headers.get('x-cron-secret')
    const authHeader = req.headers.get('authorization')

    const isAuthorized =
      (CRON_SECRET && cronSecret === CRON_SECRET) ||
      (authHeader === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`)

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Find organizations that:
    // 1. Have no onboarding_completed_at (onboarding never finished)
    // 2. Were created more than 24 hours ago
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data: incompleteOrgs, error: queryError } = await supabase
      .from('organizations')
      .select('id, name, created_by, created_at')
      .is('onboarding_completed_at', null)
      .lt('created_at', cutoff)
      .eq('is_active', true)
      .limit(100) // Process in batches to avoid timeout

    if (queryError) {
      throw new Error(`Failed to query incomplete orgs: ${queryError.message}`)
    }

    if (!incompleteOrgs || incompleteOrgs.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No incomplete onboarding organizations found',
        deleted: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let deletedCount = 0
    const errors: string[] = []

    for (const org of incompleteOrgs) {
      try {
        // Check if org has only 1 member (the creator) — don't delete orgs others have joined
        const { count: memberCount } = await supabase
          .from('organization_memberships')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', org.id)

        if (memberCount && memberCount > 1) {
          console.log(`[cleanup] Skipping org ${org.id} (${org.name}) — has ${memberCount} members`)
          continue
        }

        // Delete in dependency order
        await supabase.from('organization_enrichment').delete().eq('organization_id', org.id)
        await supabase.from('organization_skills').delete().eq('organization_id', org.id)
        await supabase.from('organization_context').delete().eq('organization_id', org.id)
        await supabase.from('organization_memberships').delete().eq('org_id', org.id)
        await supabase.from('organizations').delete().eq('id', org.id)

        // Reset the creator's onboarding progress so they can restart
        if (org.created_by) {
          await supabase
            .from('user_onboarding_progress')
            .update({ onboarding_step: 'website_input', onboarding_completed_at: null })
            .eq('user_id', org.created_by)
        }

        deletedCount++
        console.log(`[cleanup] Deleted incomplete org ${org.id} (${org.name}), created ${org.created_at}`)
      } catch (orgError) {
        const msg = `Failed to delete org ${org.id}: ${orgError.message}`
        console.error(`[cleanup] ${msg}`)
        errors.push(msg)
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Cleaned up ${deletedCount} incomplete onboarding organizations`,
      deleted: deletedCount,
      scanned: incompleteOrgs.length,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[cleanup-incomplete-onboarding] Error:', error)
    return new Response(JSON.stringify({
      error: error.message,
      timestamp: new Date().toISOString(),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
