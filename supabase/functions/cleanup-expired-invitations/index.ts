import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

serve(async (req) => {
  try {
    // Verify CRON_SECRET for security
    const authHeader = req.headers.get('Authorization');
    const cronSecret = Deno.env.get('CRON_SECRET');

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[cleanup-expired-invitations] Starting cleanup job');

    // Mark invitations older than 7 days as expired
    const { data, error } = await supabase
      .from('organization_invitations')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .is('accepted_at', null)
      .lt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .select('id');

    if (error) {
      console.error('[cleanup-expired-invitations] Error:', error);
      throw error;
    }

    const expiredCount = data?.length || 0;
    console.log(`[cleanup-expired-invitations] Marked ${expiredCount} invitations as expired`);

    return new Response(
      JSON.stringify({
        success: true,
        expiredCount,
        message: `Cleanup complete: ${expiredCount} invitations expired`
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[cleanup-expired-invitations] Fatal error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
