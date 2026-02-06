/**
 * Vercel API Route: Fathom Webhook Proxy
 *
 * Provides a branded webhook URL for Fathom integration.
 * Proxies webhook payloads to the Supabase Edge Function.
 *
 * Branded URL: https://use60.com/api/webhooks/fathom
 * Proxies to: {SUPABASE_URL}/functions/v1/fathom-webhook
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as crypto from 'node:crypto';

// Inline signing function - Vercel doesn't bundle shared modules properly
function hmacSha256Hex(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

function getHeader(req: VercelRequest, name: string): string | null {
  const v = (req.headers as any)[name.toLowerCase()];
  if (!v) return null;
  return Array.isArray(v) ? String(v[0]) : String(v);
}

async function readRawBody(req: VercelRequest): Promise<string> {
  // If Vercel already provided a parsed body, we may not be able to re-read the stream.
  // Prefer the stream when possible, otherwise fall back to stringifying.
  if (typeof (req as any).body === 'string') return (req as any).body;
  if (Buffer.isBuffer((req as any).body)) return ((req as any).body as Buffer).toString('utf8');

  // Try reading the stream
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of req as any) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    if (chunks.length) return Buffer.concat(chunks).toString('utf8');
  } catch {
    // ignore
  }

  // Last resort: stringify parsed body
  return JSON.stringify((req as any).body ?? {});
}

async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Fathom-Signature');
    return res.status(200).end();
  }

  // Only allow POST requests (webhooks are POST)
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Webhooks must use POST.' });
  }

  try {
    // Support environment routing: ?env=staging routes to staging Supabase
    const envParam = (req.query?.env as string | undefined)?.toLowerCase();
    const isStaging = envParam === 'staging';

    const supabaseUrl = isStaging
      ? process.env.STAGING_SUPABASE_URL
      : process.env.SUPABASE_URL;
    const supabaseServiceKey = isStaging
      ? process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY
      : process.env.SUPABASE_SERVICE_ROLE_KEY;
    const proxySecret = process.env.FATHOM_WEBHOOK_PROXY_SECRET;
    const webhookSecret = process.env.FATHOM_WEBHOOK_SECRET;
    const orgId = (req.query?.org_id as string | undefined) || (req.query?.orgId as string | undefined);

    if (!supabaseUrl) {
      console.error(`[fathom-webhook-proxy] Missing ${isStaging ? 'STAGING_' : ''}SUPABASE_URL`);
      throw new Error(`Webhook endpoint not configured for ${isStaging ? 'staging' : 'production'}`);
    }

    if (!supabaseServiceKey) {
      console.error(`[fathom-webhook-proxy] Missing ${isStaging ? 'STAGING_' : ''}SUPABASE_SERVICE_ROLE_KEY`);
      throw new Error(`Webhook endpoint not configured for ${isStaging ? 'staging' : 'production'}`);
    }

    if (!proxySecret) {
      console.error('[fathom-webhook-proxy] Missing FATHOM_WEBHOOK_PROXY_SECRET');
      throw new Error('Webhook endpoint not configured');
    }

    // Read raw body once (for signature verification + forwarding).
    const rawBody = await readRawBody(req);

    // Optional: verify Fathom’s webhook signature (recommended for external release).
    // If FATHOM_WEBHOOK_SECRET is set, we require a matching signature header.
    if (webhookSecret) {
      const sigHeader =
        getHeader(req, 'x-fathom-signature') ||
        getHeader(req, 'fathom-signature') ||
        getHeader(req, 'Fathom-Signature');

      if (!sigHeader) {
        return res.status(401).json({ success: false, error: 'Missing webhook signature' });
      }

      const expectedHex = hmacSha256Hex(webhookSecret, rawBody);
      const expected = `sha256=${expectedHex}`;

      const provided = sigHeader.trim();
      const ok = provided === expectedHex || provided === expected;
      if (!ok) {
        return res.status(401).json({ success: false, error: 'Invalid webhook signature' });
      }
    }

    const ts = Math.floor(Date.now() / 1000).toString();
    const signedPayload = `v1:${ts}:${rawBody}`;
    const sig = hmacSha256Hex(proxySecret, signedPayload);

    // Forward all relevant headers from Fathom
    const forwardHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'X-Use60-Timestamp': ts,
      'X-Use60-Signature': `v1=${sig}`,
    };

    // Forward Fathom signature header if present
    const fathomSignature = req.headers['x-fathom-signature'] || req.headers['fathom-signature'];
    if (fathomSignature) {
      forwardHeaders['X-Fathom-Signature'] = Array.isArray(fathomSignature) ? fathomSignature[0] : fathomSignature;
    }

    // Proxy to Supabase Edge Function
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/fathom-webhook${orgId ? `?org_id=${encodeURIComponent(orgId)}` : ''}`;

    console.log(`[fathom-webhook-proxy] Forwarding webhook to ${isStaging ? 'STAGING' : 'PRODUCTION'}: ${edgeFunctionUrl}`);

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
      console.error(`[fathom-webhook-proxy] Edge function error: ${response.status} - ${responseText}`);
      return res.status(response.status).json({
        success: false,
        error: responseData.error || 'Webhook processing failed',
        ...responseData,
      });
    }

    console.log('[fathom-webhook-proxy] Webhook processed successfully');

    return res.status(200).json({
      success: true,
      ...responseData,
      proxiedBy: 'use60-webhook-proxy',
      environment: isStaging ? 'staging' : 'production',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[fathom-webhook-proxy] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
      timestamp: new Date().toISOString(),
    });
  }
}

export default handler;
