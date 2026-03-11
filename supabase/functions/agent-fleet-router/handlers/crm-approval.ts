/**
 * Handler: crm_approval
 * Delegates to the original agent-crm-approval logic.
 * This function handles Slack interactive payloads — it reads raw body
 * as URL-encoded form data, not JSON. The router must pass the raw request.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  handleCorsPreflightRequest,
  getCorsHeaders,
} from '../../_shared/corsHelper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SLACK_SIGNING_SECRET = Deno.env.get('SLACK_SIGNING_SECRET');

/**
 * NOTE: agent-crm-approval expects URL-encoded Slack payloads, not JSON.
 * When routed through the fleet router (which parses JSON), the original
 * Slack interactive payload must be forwarded directly to the standalone
 * agent-crm-approval function. This handler exists for completeness but
 * Slack webhooks should continue hitting agent-crm-approval directly
 * since Slack sends URL-encoded form data, not JSON with an action field.
 */
export async function handleCrmApproval(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req);

  // This is a passthrough — the CRM approval function handles Slack
  // interactive payloads which are URL-encoded, not JSON.
  // The fleet router parses JSON, so this action is only reachable
  // if someone explicitly sends { action: "crm_approval", ... } as JSON.
  // In that case, forward to the original edge function.
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const body = await req.text();

  const resp = await fetch(`${supabaseUrl}/functions/v1/agent-crm-approval`, {
    method: 'POST',
    headers: {
      'Content-Type': req.headers.get('Content-Type') || 'application/json',
      'Authorization': req.headers.get('Authorization') || `Bearer ${serviceKey}`,
      'x-slack-request-timestamp': req.headers.get('x-slack-request-timestamp') || '',
      'x-slack-signature': req.headers.get('x-slack-signature') || '',
    },
    body,
  });

  const respBody = await resp.text();
  return new Response(respBody, {
    status: resp.status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
