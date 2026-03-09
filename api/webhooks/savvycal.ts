/**
 * Vercel API Route: SavvyCal Webhook Proxy
 *
 * Provides a branded webhook URL for SavvyCal integration.
 * Proxies webhook payloads to the Supabase Edge Function.
 *
 * Branded URL: https://use60.com/api/webhooks/savvycal
 * Proxies to: {SUPABASE_URL}/functions/v1/webhook-leads/savvycal
 *
 * External-ready: Supports org-specific webhook tokens via ?token= query param.
 * Legacy mode: If no token, falls back to global webhook secret for existing installs.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, SavvyCal-Signature, X-SavvyCal-Signature');
    return res.status(200).end();
  }

  // Only allow POST requests (webhooks are POST)
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Webhooks must use POST.' });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
      console.error('[savvycal-webhook-proxy] Missing SUPABASE_URL');
      throw new Error('Webhook endpoint not configured');
    }

    if (!supabaseServiceKey) {
      console.error('[savvycal-webhook-proxy] Missing SUPABASE_SERVICE_ROLE_KEY');
      throw new Error('Webhook endpoint not configured');
    }

    // Extract org webhook token from query params (external-ready)
    const orgToken = typeof req.query.token === 'string' ? req.query.token : null;

    // Get the raw body for signature verification
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

    // Forward all relevant headers from SavvyCal
    const forwardHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseServiceKey}`,
    };

    // Forward SavvyCal signature header if present (check multiple header formats)
    const savvycalSignature =
      req.headers['savvycal-signature'] ||
      req.headers['x-savvycal-signature'] ||
      req.headers['SavvyCal-Signature'];

    if (savvycalSignature) {
      const sig = Array.isArray(savvycalSignature) ? savvycalSignature[0] : savvycalSignature;
      forwardHeaders['SavvyCal-Signature'] = sig;
    }

    // Build edge function URL with optional token
    let edgeFunctionUrl = `${supabaseUrl}/functions/v1/webhook-leads/savvycal`;
    if (orgToken) {
      edgeFunctionUrl += `?token=${encodeURIComponent(orgToken)}`;
    }

    console.log(`[savvycal-webhook-proxy] Forwarding webhook to ${edgeFunctionUrl}${orgToken ? ' (org-token)' : ' (legacy)'}`);

    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: forwardHeaders,
      body: rawBody,
    });

    const responseText = await response.text();

    // Try to parse as JSON, fallback to text
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { message: responseText };
    }

    if (!response.ok) {
      console.error(`[savvycal-webhook-proxy] Edge function error: ${response.status} - ${responseText}`);
      return res.status(response.status).json({
        success: false,
        error: responseData.error || 'Webhook processing failed',
        ...responseData,
      });
    }

    console.log('[savvycal-webhook-proxy] Webhook processed successfully');

    return res.status(200).json({
      success: true,
      ...responseData,
      proxiedBy: 'use60-webhook-proxy',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[savvycal-webhook-proxy] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
      timestamp: new Date().toISOString(),
    });
  }
}
