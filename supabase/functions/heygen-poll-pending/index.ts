/**
 * heygen-poll-pending — Poll HeyGen for all pending/processing videos and update DB
 * Temporary utility function. Deploy with --no-verify-jwt.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';
import { HeyGenClient } from '../_shared/heygen.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCorsPreflightRequest(req);

  const svc = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // Get all pending/processing videos
    const { data: videos, error } = await svc
      .from('heygen_videos')
      .select('id, heygen_video_id, org_id, user_id, status, dynamic_table_row_id')
      .in('status', ['pending', 'processing'])
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) return errorResponse(error.message, req, 500);
    if (!videos?.length) return jsonResponse({ message: 'No pending videos', count: 0 }, req);

    const apiKey = Deno.env.get('HEYGEN_API_KEY');
    if (!apiKey) return errorResponse('HEYGEN_API_KEY not set', req, 500);

    const heygen = new HeyGenClient(apiKey);
    const results: unknown[] = [];

    for (const video of videos) {
      if (video.heygen_video_id === 'pending') {
        results.push({ id: video.id, skipped: true, reason: 'no heygen_video_id yet' });
        continue;
      }

      try {
        const status = await heygen.getVideoStatus(video.heygen_video_id);
        console.log(`[poll] Video ${video.id} (${video.heygen_video_id}): ${status.status}`);

        if (status.status === 'completed' && status.video_url) {
          await svc.from('heygen_videos').update({
            status: 'completed',
            video_url: status.video_url,
            thumbnail_url: status.thumbnail_url || null,
            duration_seconds: status.duration || null,
          }).eq('id', video.id);

          // Write to ops table cell
          if (video.dynamic_table_row_id) {
            const { data: row } = await svc.from('dynamic_table_rows')
              .select('table_id').eq('id', video.dynamic_table_row_id).maybeSingle();
            if (row?.table_id) {
              const { data: col } = await svc.from('dynamic_table_columns')
                .select('id').eq('table_id', row.table_id).eq('column_type', 'heygen_video').maybeSingle();
              if (col?.id) {
                await svc.from('dynamic_table_cells').upsert({
                  row_id: video.dynamic_table_row_id,
                  column_id: col.id,
                  value: JSON.stringify({
                    status: 'completed',
                    video_url: status.video_url,
                    thumbnail_url: status.thumbnail_url || null,
                    duration_seconds: status.duration || null,
                    video_record_id: video.id,
                  }),
                }, { onConflict: 'row_id,column_id' });
              }
            }
          }

          results.push({ id: video.id, heygen_id: video.heygen_video_id, updated: 'completed', url: status.video_url });
        } else if (status.status === 'failed') {
          const errMsg = status.error?.message || status.error?.detail || 'Video generation failed';
          await svc.from('heygen_videos').update({ status: 'failed', error_message: errMsg }).eq('id', video.id);

          if (video.dynamic_table_row_id) {
            const { data: row } = await svc.from('dynamic_table_rows')
              .select('table_id').eq('id', video.dynamic_table_row_id).maybeSingle();
            if (row?.table_id) {
              const { data: col } = await svc.from('dynamic_table_columns')
                .select('id').eq('table_id', row.table_id).eq('column_type', 'heygen_video').maybeSingle();
              if (col?.id) {
                await svc.from('dynamic_table_cells').upsert({
                  row_id: video.dynamic_table_row_id,
                  column_id: col.id,
                  value: JSON.stringify({ status: 'failed', error_message: errMsg, video_record_id: video.id }),
                }, { onConflict: 'row_id,column_id' });
              }
            }
          }

          results.push({ id: video.id, heygen_id: video.heygen_video_id, updated: 'failed', error: errMsg });
        } else {
          results.push({ id: video.id, heygen_id: video.heygen_video_id, status: status.status, still_processing: true });
        }
      } catch (err) {
        results.push({ id: video.id, heygen_id: video.heygen_video_id, poll_error: err instanceof Error ? err.message : String(err) });
      }
    }

    return jsonResponse({ polled: videos.length, results }, req);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Internal error', req, 500);
  }
});
