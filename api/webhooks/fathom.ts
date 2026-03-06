/**
 * Vercel API Route: Fathom Webhook Proxy
 *
 * Provides branded webhook URLs for Fathom integration across all environments.
 * Detects environment from Host header or ?env= query param.
 *
 * Webhook URLs (registered in Fathom dashboard):
 *   Production:  https://app.use60.com/api/webhooks/fathom
 *   Staging:     https://staging.use60.com/api/webhooks/fathom
 *   Development: https://dev.use60.com/api/webhooks/fathom
 *
 * Each proxies to the correct Supabase Edge Function with HMAC signature.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as crypto from 'node:crypto';

function hmacSha256Hex(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

async function readRawBody(req: VercelRequest): Promise<string> {
  if (typeof (req as any).body === 'string') return (req as any).body;
  if (Buffer.isBuffer((req as any).body)) return ((req as any).body as Buffer).toString('utf8');

  const chunks: Buffer[] = [];
  try {
    for await (const chunk of req as any) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    if (chunks.length) return Buffer.concat(chunks).toString('utf8');
  } catch {
    // ignore
  }

  return JSON.stringify((req as any).body ?? {});
}

type EnvName = 'production' | 'staging' | 'development';

/**
 * Detect environment from Host header, falling back to ?env= query param.
 */
function detectEnvironment(req: VercelRequest): EnvName {
  // Explicit query param override
  const envParam = (req.query?.env as string | undefined)?.toLowerCase();
  if (envParam === 'staging') return 'staging';
  if (envParam === 'dev' || envParam === 'development') return 'development';

  // Detect from Host header
  const host = req.headers.host || '';
  if (host.includes('staging.use60.com')) return 'staging';
  if (host.includes('dev.use60.com')) return 'development';

  return 'production';
}

/**
 * Get Supabase URL + service role key + webhook proxy secret for the environment.
 */
function getEnvConfig(env: EnvName) {
  switch (env) {
    case 'staging':
      return {
        supabaseUrl: process.env.STAGING_SUPABASE_URL,
        serviceKey: process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY,
        proxySecret: process.env.STAGING_FATHOM_WEBHOOK_PROXY_SECRET || process.env.FATHOM_WEBHOOK_PROXY_SECRET,
      };
    case 'development':
      return {
        supabaseUrl: process.env.DEV_SUPABASE_URL,
        serviceKey: process.env.DEV_SUPABASE_SERVICE_ROLE_KEY,
        proxySecret: process.env.DEV_FATHOM_WEBHOOK_PROXY_SECRET || process.env.FATHOM_WEBHOOK_PROXY_SECRET,
      };
    default:
      return {
        supabaseUrl: process.env.SUPABASE_URL,
        serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        proxySecret: process.env.FATHOM_WEBHOOK_PROXY_SECRET,
      };
  }
}

async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Fathom-Signature');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Webhooks must use POST.' });
  }

  try {
    const env = detectEnvironment(req);
    const { supabaseUrl, serviceKey, proxySecret } = getEnvConfig(env);
    const orgId = (req.query?.org_id as string | undefined) || (req.query?.orgId as string | undefined);

    if (!supabaseUrl) {
      console.error(`[fathom-webhook-proxy] Missing SUPABASE_URL for ${env}`);
      throw new Error(`Webhook endpoint not configured for ${env}`);
    }

    if (!serviceKey) {
      console.error(`[fathom-webhook-proxy] Missing SERVICE_ROLE_KEY for ${env}`);
      throw new Error(`Webhook endpoint not configured for ${env}`);
    }

    if (!proxySecret) {
      console.error(`[fathom-webhook-proxy] Missing WEBHOOK_PROXY_SECRET for ${env}`);
      throw new Error(`Webhook endpoint not configured for ${env}`);
    }

    const rawBody = await readRawBody(req);

    const ts = Math.floor(Date.now() / 1000).toString();
    const signedPayload = `v1:${ts}:${rawBody}`;
    const sig = hmacSha256Hex(proxySecret, signedPayload);

    const forwardHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
      'X-Use60-Timestamp': ts,
      'X-Use60-Signature': `v1=${sig}`,
    };

    const fathomSignature = req.headers['x-fathom-signature'] || req.headers['fathom-signature'];
    if (fathomSignature) {
      forwardHeaders['X-Fathom-Signature'] = Array.isArray(fathomSignature) ? fathomSignature[0] : fathomSignature;
    }

    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/fathom-webhook${orgId ? `?org_id=${encodeURIComponent(orgId)}` : ''}`;

    console.log(`[fathom-webhook-proxy] Forwarding to ${env.toUpperCase()}: ${edgeFunctionUrl}`);

    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: forwardHeaders,
      body: rawBody,
    });

    const responseText = await response.text();

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

    console.log(`[fathom-webhook-proxy] Webhook processed successfully (${env})`);

    return res.status(200).json({
      success: true,
      ...responseData,
      proxiedBy: 'use60-webhook-proxy',
      environment: env,
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
