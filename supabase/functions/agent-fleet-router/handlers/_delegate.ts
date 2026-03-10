/**
 * Generic delegation helper for agent-fleet-router handlers.
 *
 * For handlers where the original function logic is too large to inline,
 * this delegates to the original standalone edge function endpoint.
 * This maintains backward compatibility during the migration period.
 */

import { getCorsHeaders } from '../../_shared/corsHelper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export function createDelegatingHandler(originalFunctionName: string) {
  return async function delegateHandler(req: Request): Promise<Response> {
    const cors = getCorsHeaders(req);
    const body = await req.text();

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/${originalFunctionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.get('Authorization') || `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'x-cron-secret': req.headers.get('x-cron-secret') || '',
      },
      body,
    });

    const respBody = await resp.text();
    return new Response(respBody, {
      status: resp.status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  };
}
