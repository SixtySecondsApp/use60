/**
 * Auto Re-Enrich Edge Function
 * 
 * ENRICH-001: Periodically re-scrape websites to keep company data fresh.
 * 
 * Runs as a weekly/monthly cron job and:
 * 1. Finds orgs with company_website set and stale enrichment
 * 2. Calls deep-enrich-organization with force=true
 * 3. Tracks last_enriched_at in organizations table
 * 
 * @see docs/PRD_PROACTIVE_AI_TEAMMATE.md
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// ============================================================================
// Configuration
// ============================================================================

// Default: re-enrich if data is older than 30 days
const DEFAULT_STALE_DAYS = 30;

// Maximum orgs to process per run (to prevent timeouts)
const MAX_ORGS_PER_RUN = 10;

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await req.json().catch(() => ({}));
    const { 
      action = 'check_and_enrich',
      organizationId,
      staleDays = DEFAULT_STALE_DAYS,
      force = false,
    } = body;

    let response;

    switch (action) {
      case 'check_and_enrich':
        // Find and re-enrich stale orgs
        response = await checkAndEnrichStaleOrgs(supabase, staleDays);
        break;

      case 'enrich_single':
        // Re-enrich a specific org
        if (!organizationId) {
          throw new Error('organizationId required for enrich_single action');
        }
        response = await enrichSingleOrg(supabase, organizationId, force);
        break;

      case 'get_status':
        // Get enrichment status for all orgs
        response = await getEnrichmentStatus(supabase);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[auto-re-enrich] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================================
// Check and Enrich Stale Organizations
// ============================================================================

async function checkAndEnrichStaleOrgs(
  supabase: any,
  staleDays: number
): Promise<{ success: boolean; processed: number; enriched: string[]; skipped: string[] }> {
  console.log(`[ReEnrich] Checking for orgs with enrichment older than ${staleDays} days...`);

  const staleDate = new Date();
  staleDate.setDate(staleDate.getDate() - staleDays);

  // Find orgs that need re-enrichment
  const { data: orgs, error: orgsError } = await supabase
    .from('organizations')
    .select('id, name, company_website, last_enriched_at')
    .not('company_website', 'is', null)
    .or(`last_enriched_at.is.null,last_enriched_at.lt.${staleDate.toISOString()}`)
    .limit(MAX_ORGS_PER_RUN);

  if (orgsError) {
    throw new Error(`Failed to fetch organizations: ${orgsError.message}`);
  }

  const enriched: string[] = [];
  const skipped: string[] = [];

  for (const org of orgs || []) {
    try {
      console.log(`[ReEnrich] Processing org: ${org.name} (${org.id})`);
      
      // Extract domain from website URL
      let domain = org.company_website;
      try {
        const url = new URL(org.company_website.startsWith('http') 
          ? org.company_website 
          : `https://${org.company_website}`);
        domain = url.hostname.replace('www.', '');
      } catch {
        // Use as-is if not a valid URL
      }

      // Call deep-enrich-organization with force=true
      const { error: enrichError } = await supabase.functions.invoke('deep-enrich-organization', {
        body: {
          action: 'start',
          organization_id: org.id,
          domain,
          force: true,
        },
      });

      if (enrichError) {
        console.error(`[ReEnrich] Failed to enrich ${org.name}:`, enrichError);
        skipped.push(org.id);
      } else {
        console.log(`[ReEnrich] Successfully triggered enrichment for ${org.name}`);
        enriched.push(org.id);
      }

    } catch (err) {
      console.error(`[ReEnrich] Error processing org ${org.id}:`, err);
      skipped.push(org.id);
    }
  }

  console.log(`[ReEnrich] Complete. Enriched: ${enriched.length}, Skipped: ${skipped.length}`);

  return {
    success: true,
    processed: (orgs || []).length,
    enriched,
    skipped,
  };
}

// ============================================================================
// Enrich Single Organization
// ============================================================================

async function enrichSingleOrg(
  supabase: any,
  organizationId: string,
  force: boolean
): Promise<{ success: boolean; message: string }> {
  console.log(`[ReEnrich] Manual re-enrich requested for org: ${organizationId}`);

  // Get org details
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('name, company_website')
    .eq('id', organizationId)
    .single();

  if (orgError || !org) {
    throw new Error('Organization not found');
  }

  if (!org.company_website) {
    throw new Error('Organization has no company_website set');
  }

  // Extract domain
  let domain = org.company_website;
  try {
    const url = new URL(org.company_website.startsWith('http') 
      ? org.company_website 
      : `https://${org.company_website}`);
    domain = url.hostname.replace('www.', '');
  } catch {
    // Use as-is
  }

  // Trigger enrichment
  const { error: enrichError } = await supabase.functions.invoke('deep-enrich-organization', {
    body: {
      action: 'start',
      organization_id: organizationId,
      domain,
      force: true,
    },
  });

  if (enrichError) {
    throw new Error(`Enrichment failed: ${enrichError.message}`);
  }

  return {
    success: true,
    message: `Re-enrichment triggered for ${org.name}`,
  };
}

// ============================================================================
// Get Enrichment Status
// ============================================================================

async function getEnrichmentStatus(supabase: any): Promise<{
  success: boolean;
  stats: {
    totalOrgs: number;
    enrichedOrgs: number;
    staleOrgs: number;
    neverEnrichedOrgs: number;
  };
  orgs: any[];
}> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Get all orgs with website
  const { data: orgs, error: orgsError } = await supabase
    .from('organizations')
    .select(`
      id,
      name,
      company_website,
      last_enriched_at,
      organization_enrichment(status, updated_at)
    `)
    .not('company_website', 'is', null)
    .order('last_enriched_at', { ascending: true, nullsFirst: true });

  if (orgsError) {
    throw new Error(`Failed to fetch organizations: ${orgsError.message}`);
  }

  const stats = {
    totalOrgs: orgs?.length || 0,
    enrichedOrgs: 0,
    staleOrgs: 0,
    neverEnrichedOrgs: 0,
  };

  for (const org of orgs || []) {
    if (!org.last_enriched_at) {
      stats.neverEnrichedOrgs++;
    } else if (new Date(org.last_enriched_at) < thirtyDaysAgo) {
      stats.staleOrgs++;
    } else {
      stats.enrichedOrgs++;
    }
  }

  return {
    success: true,
    stats,
    orgs: orgs || [],
  };
}
