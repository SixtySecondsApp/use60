/**
 * heygen-check-video — Check specific video IDs on HeyGen
 * Temporary. Deploy with --no-verify-jwt.
 */

import { jsonResponse, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { HeyGenClient } from '../_shared/heygen.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCorsPreflightRequest(req);

  const apiKey = Deno.env.get('HEYGEN_API_KEY');
  if (!apiKey) return jsonResponse({ error: 'No API key' }, req, 500);

  const heygen = new HeyGenClient(apiKey);
  const body = await req.json();
  const videoIds: string[] = body.video_ids || [];

  const results: unknown[] = [];
  for (const vid of videoIds) {
    try {
      const status = await heygen.getVideoStatus(vid);
      results.push({ video_id: vid, ...status });
    } catch (err: any) {
      results.push({ video_id: vid, error: err.message || String(err) });
    }
  }

  return jsonResponse({ results }, req);
});
