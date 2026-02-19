// Admin S3 Metrics API
// GET /admin-s3-metrics?start_date=2026-01-01&end_date=2026-01-31&org_id=xxx
// Returns S3 usage metrics with cost projections

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // Verify admin access
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: isAdmin } = await supabase
      .from('admin_user_ids')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse query params
    const url = new URL(req.url);
    const startDate = url.searchParams.get('start_date') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = url.searchParams.get('end_date') || new Date().toISOString().split('T')[0];
    const orgId = url.searchParams.get('org_id');

    // Build query
    let query = supabase
      .from('s3_usage_metrics')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false });

    if (orgId) {
      query = query.eq('org_id', orgId);
    }

    const { data: metrics, error: metricsError } = await query;

    if (metricsError) {
      throw new Error(`Failed to fetch metrics: ${metricsError.message}`);
    }

    // Calculate totals by metric type
    const totals = {
      storage_gb: 0,
      upload_gb: 0,
      download_gb: 0,
      total_cost_usd: 0,
    };

    const dailyBreakdown: any[] = [];
    const dateMap = new Map();

    for (const metric of metrics || []) {
      if (!dateMap.has(metric.date)) {
        dateMap.set(metric.date, {
          date: metric.date,
          storage_gb: 0,
          upload_gb: 0,
          download_gb: 0,
          cost_usd: 0,
        });
      }

      const day = dateMap.get(metric.date);
      day[metric.metric_type] = metric.value;
      day.cost_usd += metric.cost_usd;
    }

    dailyBreakdown.push(...Array.from(dateMap.values()));

    // Calculate current month total
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const currentMonthCost = (metrics || [])
      .filter(m => m.date.startsWith(currentMonth))
      .reduce((sum, m) => sum + m.cost_usd, 0);

    // Project next month (current storage * 1.1 growth * $0.023/month)
    const latestStorage = (metrics || [])
      .filter(m => m.metric_type === 'storage_gb')
      .sort((a, b) => b.date.localeCompare(a.date))[0]?.value || 0;

    const nextMonthProjection = latestStorage * 1.1 * 0.023;

    return new Response(
      JSON.stringify({
        start_date: startDate,
        end_date: endDate,
        org_id: orgId || 'all',
        current_month_cost: currentMonthCost,
        next_month_projection: nextMonthProjection,
        latest_storage_gb: latestStorage,
        daily_breakdown: dailyBreakdown,
        total_records: metrics?.length || 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Admin S3 Metrics] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
