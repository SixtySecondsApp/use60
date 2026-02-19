// Update S3 Metrics
// Daily cron job to calculate and store S3 usage metrics
// Runs at midnight UTC

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

const STORAGE_COST_PER_GB_MONTH = 0.023;
const STORAGE_COST_PER_GB_DAY = STORAGE_COST_PER_GB_MONTH / 30;
const DOWNLOAD_COST_PER_GB = 0.09;
const UPLOAD_COST_PER_GB = 0; // Free

serve(async (req) => {
  // Handle CORS
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('[S3 Metrics] Calculating daily metrics...');

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Get all organizations
    const { data: orgs, error: orgsError } = await supabase
      .from('organizations')
      .select('id, name');

    if (orgsError) {
      throw new Error(`Failed to fetch organizations: ${orgsError.message}`);
    }

    if (!orgs || orgs.length === 0) {
      console.log('[S3 Metrics] No organizations found');
      return new Response(
        JSON.stringify({ message: 'No organizations to process' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[S3 Metrics] Processing ${orgs.length} organizations`);

    const results = [];

    for (const org of orgs) {
      try {
        console.log(`[S3 Metrics] Processing org: ${org.name} (${org.id})`);

        // 1. Calculate total storage (sum of all s3_file_size_bytes)
        const { data: storageData, error: storageError } = await supabase
          .from('recordings')
          .select('s3_file_size_bytes')
          .eq('org_id', org.id)
          .eq('s3_upload_status', 'complete');

        if (storageError) {
          console.error(`[S3 Metrics] Storage query error for ${org.id}:`, storageError);
          continue;
        }

        const totalBytes = storageData?.reduce((sum, r) => sum + (r.s3_file_size_bytes || 0), 0) || 0;
        const storageGB = totalBytes / 1e9; // Convert to GB
        const storageCost = storageGB * STORAGE_COST_PER_GB_DAY;

        console.log(`[S3 Metrics] ${org.name}: ${storageGB.toFixed(2)} GB storage, $${storageCost.toFixed(4)}/day`);

        // Upsert storage metric
        await supabase
          .from('s3_usage_metrics')
          .upsert({
            org_id: org.id,
            date: today,
            metric_type: 'storage_gb',
            value: storageGB,
            cost_usd: storageCost,
          }, {
            onConflict: 'org_id,date,metric_type',
          });

        // 2. Calculate uploads in last 24 hours
        const { data: uploadData, error: uploadError } = await supabase
          .from('recordings')
          .select('s3_file_size_bytes')
          .eq('org_id', org.id)
          .eq('s3_upload_status', 'complete')
          .gte('s3_upload_completed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

        if (uploadError) {
          console.error(`[S3 Metrics] Upload query error for ${org.id}:`, uploadError);
          continue;
        }

        const uploadBytes = uploadData?.reduce((sum, r) => sum + (r.s3_file_size_bytes || 0), 0) || 0;
        const uploadGB = uploadBytes / 1e9;
        const uploadCost = uploadGB * UPLOAD_COST_PER_GB; // Free

        console.log(`[S3 Metrics] ${org.name}: ${uploadGB.toFixed(2)} GB uploaded (24h), $${uploadCost.toFixed(4)}`);

        // Upsert upload metric
        await supabase
          .from('s3_usage_metrics')
          .upsert({
            org_id: org.id,
            date: today,
            metric_type: 'upload_gb',
            value: uploadGB,
            cost_usd: uploadCost,
          }, {
            onConflict: 'org_id,date,metric_type',
          });

        // 3. Estimate downloads (50% of storage watched per month = ~1.7% daily)
        // This is an estimate until we integrate CloudWatch
        const estimatedDownloadGB = storageGB * 0.017; // ~1.7% daily
        const downloadCost = estimatedDownloadGB * DOWNLOAD_COST_PER_GB;

        console.log(`[S3 Metrics] ${org.name}: ${estimatedDownloadGB.toFixed(2)} GB downloads (estimated), $${downloadCost.toFixed(4)}`);

        // Upsert download metric
        await supabase
          .from('s3_usage_metrics')
          .upsert({
            org_id: org.id,
            date: today,
            metric_type: 'download_gb',
            value: estimatedDownloadGB,
            cost_usd: downloadCost,
          }, {
            onConflict: 'org_id,date,metric_type',
          });

        results.push({
          org_id: org.id,
          org_name: org.name,
          storage_gb: storageGB,
          upload_gb: uploadGB,
          download_gb: estimatedDownloadGB,
          total_cost: storageCost + uploadCost + downloadCost,
        });
      } catch (error) {
        console.error(`[S3 Metrics] Error processing org ${org.id}:`, error);
        results.push({
          org_id: org.id,
          org_name: org.name,
          error: error.message,
        });
      }
    }

    const totalCost = results.reduce((sum, r) => sum + (r.total_cost || 0), 0);
    console.log(`[S3 Metrics] Complete: ${results.length} orgs, $${totalCost.toFixed(4)} total daily cost`);

    return new Response(
      JSON.stringify({
        success: true,
        date: today,
        organizations: results.length,
        total_daily_cost: totalCost,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[S3 Metrics] Error:', error);
    return new Response(
      JSON.stringify({
        error: error.message,
        details: error.stack,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
