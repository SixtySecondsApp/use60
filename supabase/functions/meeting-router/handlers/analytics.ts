/**
 * Handler: analytics
 * Extracted from meeting-analytics
 *
 * Proxies the meeting-translation Railway API. The original function has its
 * own internal URL-based router with many sub-handlers. We preserve the entire
 * sub-application by delegating to its existing router.
 */

import { handleCorsPreflightRequest } from '../../_shared/corsHelper.ts';
import { routeRequest } from '../../meeting-analytics/router.ts';
import { errorResponse } from '../../meeting-analytics/helpers.ts';

export async function handleAnalytics(req: Request): Promise<Response> {
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
}
