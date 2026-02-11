// supabase/functions/research-comparison/index.ts
// Head-to-head comparison of Gemini 3 Flash vs Exa for company research enrichment

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { executeGeminiSearch } from '../_shared/geminiSearch.ts';
import { executeExaSearch } from '../_shared/exaSearch.ts';

// Permissive CORS headers for development and production
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Total enrichment fields to track completeness
const TOTAL_FIELDS = 19;

// List of all enrichment fields for completeness calculation
const ENRICHMENT_FIELDS = [
  'company_name',
  'description',
  'industry',
  'employee_count_range',
  'founded_year',
  'headquarters_location',
  'website_url',
  'linkedin_url',
  'funding_stage',
  'funding_total',
  'key_investors',
  'leadership_team',
  'products_services',
  'customer_segments',
  'key_competitors',
  'competitive_differentiators',
  'tech_stack',
  'recent_news',
  'glassdoor_rating',
];

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create Supabase client with user's JWT
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! }
        }
      }
    );

    // Verify user authentication
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    console.log(`[research-comparison] User ${user.id} starting comparison`);

    // Parse request body
    const { domain } = await req.json();
    if (!domain) {
      throw new Error('domain is required');
    }

    console.log(`[research-comparison] Comparing providers for domain: ${domain}`);

    // Get user's organization
    const { data: membership, error: membershipError } = await supabase
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError) {
      throw membershipError;
    }

    if (!membership) {
      throw new Error('User not in organization');
    }

    const organizationId = membership.org_id;
    console.log(`[research-comparison] Organization: ${organizationId}`);

    // Run both providers in parallel
    console.log(`[research-comparison] Running Gemini and Exa in parallel...`);
    const [geminiResults, exaResults] = await Promise.all([
      executeGeminiSearch(domain).catch(e => ({
        result: null,
        cost: 0,
        duration: 0,
        error: e.message
      })),
      executeExaSearch(domain).catch(e => ({
        result: null,
        cost: 0,
        duration: 0,
        error: e.message
      }))
    ]);

    console.log(`[research-comparison] Gemini completed in ${geminiResults.duration}ms with error: ${geminiResults.error || 'none'}`);
    console.log(`[research-comparison] Exa completed in ${exaResults.duration}ms with error: ${exaResults.error || 'none'}`);

    // Calculate quality scores (field completeness)
    const geminiFields = geminiResults.result ? countPopulatedFields(geminiResults.result) : 0;
    const exaFields = exaResults.result ? countPopulatedFields(exaResults.result) : 0;

    const geminiCompleteness = (geminiFields / TOTAL_FIELDS) * 100;
    const exaCompleteness = (exaFields / TOTAL_FIELDS) * 100;

    console.log(`[research-comparison] Gemini: ${geminiFields}/${TOTAL_FIELDS} fields (${geminiCompleteness.toFixed(1)}%)`);
    console.log(`[research-comparison] Exa: ${exaFields}/${TOTAL_FIELDS} fields (${exaCompleteness.toFixed(1)}%)`);

    // Determine winner based on quality > speed > cost
    let winner: 'gemini' | 'exa' | 'tie' | 'both_failed';

    if (!geminiResults.result && !exaResults.result) {
      winner = 'both_failed';
      console.log(`[research-comparison] Winner: both_failed (both providers failed)`);
    } else if (!geminiResults.result) {
      winner = 'exa';
      console.log(`[research-comparison] Winner: exa (Gemini failed)`);
    } else if (!exaResults.result) {
      winner = 'gemini';
      console.log(`[research-comparison] Winner: gemini (Exa failed)`);
    } else {
      // Calculate composite scores
      // Quality is weighted 2x (most important)
      // Speed is normalized (lower is better, converted to score)
      // Cost is weighted 10x (multiplier to make it comparable)
      const geminiScore = geminiCompleteness * 2 - (geminiResults.duration / 1000) - (geminiResults.cost * 10);
      const exaScore = exaCompleteness * 2 - (exaResults.duration / 1000) - (exaResults.cost * 10);

      console.log(`[research-comparison] Gemini score: ${geminiScore.toFixed(2)}, Exa score: ${exaScore.toFixed(2)}`);

      // If scores are within 5 points, call it a tie
      if (Math.abs(geminiScore - exaScore) < 5) {
        winner = 'tie';
        console.log(`[research-comparison] Winner: tie (scores within 5 points)`);
      } else {
        winner = geminiScore > exaScore ? 'gemini' : 'exa';
        console.log(`[research-comparison] Winner: ${winner} (higher composite score)`);
      }
    }

    // Extract company name from either result
    const companyName = geminiResults.result?.company_name || exaResults.result?.company_name || null;

    // Save comparison results to database
    const { data: run, error: insertError } = await supabase
      .from('research_comparison_runs')
      .insert({
        organization_id: organizationId,
        user_id: user.id,
        domain,
        company_name: companyName,

        // Gemini results
        gemini_result: geminiResults.result,
        gemini_cost: geminiResults.cost,
        gemini_duration_ms: geminiResults.duration,
        gemini_fields_populated: geminiFields,
        gemini_completeness: geminiCompleteness,
        gemini_error: geminiResults.error,

        // Exa results
        exa_result: exaResults.result,
        exa_cost: exaResults.cost,
        exa_duration_ms: exaResults.duration,
        exa_fields_populated: exaFields,
        exa_completeness: exaCompleteness,
        exa_error: exaResults.error,

        // Comparison
        winner,
        quality_score_gemini: geminiCompleteness,
        quality_score_exa: exaCompleteness
      })
      .select()
      .single();

    if (insertError) {
      console.error('[research-comparison] Error saving to database:', insertError);
      throw insertError;
    }

    console.log(`[research-comparison] Comparison saved with ID: ${run.id}`);

    return new Response(JSON.stringify(run), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[research-comparison] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error occurred' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

/**
 * Count how many fields are populated in the enrichment data
 * @param data - Enrichment data object
 * @returns Number of populated fields
 */
function countPopulatedFields(data: any): number {
  let count = 0;

  for (const field of ENRICHMENT_FIELDS) {
    const value = data[field];

    // Field is considered populated if:
    // - Not null, undefined, or empty string
    // - Arrays have at least one element
    // - Objects have at least one key
    if (value !== null && value !== undefined && value !== '') {
      if (Array.isArray(value)) {
        if (value.length > 0) count++;
      } else if (typeof value === 'object') {
        if (Object.keys(value).length > 0) count++;
      } else {
        count++;
      }
    }
  }

  return count;
}
