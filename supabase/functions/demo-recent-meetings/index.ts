import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders } from '../_shared/corsHelper.ts';

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse limit from query params (default 10, max 20)
    const url = new URL(req.url);
    const limitParam = parseInt(url.searchParams.get('limit') || '10', 10);
    const limit = Math.min(Math.max(1, limitParam), 20);

    // Get org_id for the user
    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (!membership) {
      return new Response(JSON.stringify({ error: 'No organization found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Query recent external meetings with actual attendees
    const { data: meetings, error: meetingsError } = await supabase
      .from('calendar_events')
      .select('id, title, start_time, end_time, attendees, attendees_count, is_internal, meeting_type')
      .eq('user_id', user.id)
      .or('is_internal.eq.false,is_internal.is.null')
      .not('attendees', 'is', null)
      .gt('attendees_count', 0)
      .order('start_time', { ascending: false })
      .limit(limit);

    if (meetingsError) {
      console.error('[demo-recent-meetings] Query error:', meetingsError.message);
      return new Response(JSON.stringify({ error: 'Failed to fetch meetings' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Format response
    const formattedMeetings = (meetings || []).map((m: any) => {
      // Extract attendee names/emails from JSONB
      const attendees = Array.isArray(m.attendees) ? m.attendees : [];
      const attendeeNames = attendees
        .slice(0, 5)
        .map((a: any) => {
          if (typeof a === 'string') return a;
          return a.name || a.displayName || a.email || 'Unknown';
        });

      // Calculate duration
      let durationMinutes: number | null = null;
      if (m.start_time && m.end_time) {
        const start = new Date(m.start_time).getTime();
        const end = new Date(m.end_time).getTime();
        durationMinutes = Math.round((end - start) / 60000);
      }

      return {
        id: m.id,
        title: m.title,
        date: m.start_time,
        duration_minutes: durationMinutes,
        attendee_count: m.attendees_count || attendees.length,
        attendee_names: attendeeNames,
        meeting_type: m.meeting_type || 'external',
      };
    });

    return new Response(JSON.stringify({ meetings: formattedMeetings }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[demo-recent-meetings] Error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
