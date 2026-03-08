/**
 * fathom-ops-router — Consolidated router for Fathom operational edge functions.
 *
 * Consolidates 7 fathom-* functions behind a single endpoint.
 * Each request must include an `action` field in the JSON body.
 *
 * Excluded (remain standalone):
 *   - fathom-cron-sync      (cron trigger)
 *   - fathom-token-refresh   (cron trigger)
 *   - fathom-oauth-callback  (OAuth redirect endpoint)
 *   - fathom-webhook         (webhook endpoint)
 */

import { getCorsHeaders } from '../_shared/corsHelper.ts';

// Handler imports
import { handleOauthToken } from './handlers/oauth_token.ts';
import { handleConnectedEmail } from './handlers/connected_email.ts';
import { handleDisconnect } from './handlers/disconnect.ts';
import { handleSelfMap } from './handlers/self_map.ts';
import { handleSync } from './handlers/sync.ts';
import { handleTranscriptRetry } from './handlers/transcript_retry.ts';
import { handleUpdateUserMapping } from './handlers/update_user_mapping.ts';

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  oauth_token: handleOauthToken,
  connected_email: handleConnectedEmail,
  disconnect: handleDisconnect,
  self_map: handleSelfMap,
  sync: handleSync,
  transcript_retry: handleTranscriptRetry,
  update_user_mapping: handleUpdateUserMapping,
};

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const bodyText = await req.text();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    const action = body.action as string;
    if (!action || !HANDLERS[action]) {
      return new Response(
        JSON.stringify({
          error: `Invalid or missing action. Must be one of: ${Object.keys(HANDLERS).join(', ')}`,
          received: action ?? null,
        }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // Reconstruct a new Request so the handler can call req.json() / req.text()
    const handlerReq = new Request(req.url, {
      method: req.method,
      headers: req.headers,
      body: bodyText,
    });

    return await HANDLERS[action](handlerReq);
  } catch (error: unknown) {
    console.error('[fathom-ops-router] Router error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message ?? 'Internal error' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }
});
