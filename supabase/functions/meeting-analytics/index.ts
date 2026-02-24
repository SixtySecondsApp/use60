/**
 * Meeting Analytics Edge Function
 *
 * Proxies the meeting-translation Railway API. Connects to Railway PostgreSQL
 * for transcripts, insights, dashboard metrics, reporting, and semantic search.
 *
 * Required secrets: RAILWAY_DATABASE_URL, OPENAI_API_KEY (for search)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { routeRequest } from './router.ts';
import { errorResponse } from './helpers.ts';

serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req)!;
  }

  try {
    return await routeRequest(req);
  } catch (err) {
    console.error('Meeting analytics error:', err);
    return errorResponse(
      err instanceof Error ? err.message : 'Internal server error',
      500,
      req
    );
  }
});
