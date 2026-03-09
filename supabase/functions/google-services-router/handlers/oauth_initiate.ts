/**
 * Stub handler for google-oauth-initiate.
 * The original edge function directory does not exist in the codebase.
 * This handler returns a not-implemented error until the source is provided.
 */

import { getCorsHeaders } from '../../_shared/corsHelper.ts';

export async function handleOauthInitiate(req: Request): Promise<Response> {
  const cors = getCorsHeaders(req);
  return new Response(
    JSON.stringify({
      error: 'google-oauth-initiate handler not yet migrated — original function source not found in codebase',
    }),
    {
      status: 501,
      headers: { ...cors, 'Content-Type': 'application/json' },
    }
  );
}
