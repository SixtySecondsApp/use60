/**
 * Vercel API Route: LinkedIn Webhook Proxy
 *
 * Provides branded webhook URLs for LinkedIn Lead Gen integration.
 * Detects environment from Host header or ?env= query param.
 *
 * Webhook URLs (registered in LinkedIn Campaign Manager):
 *   Production:  https://app.use60.com/api/webhooks/linkedin
 *   Staging:     https://staging.use60.com/api/webhooks/linkedin
 *   Development: https://dev.use60.com/api/webhooks/linkedin
 *
 * Each proxies to the correct Supabase Edge Function (webhook-linkedin)
 * preserving the LinkedIn signature header for HMAC verification.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as crypto from 'node:crypto';

function computeChallengeResponse(challengeCode: string, clientSecret: string): string {
  return crypto.createHmac('sha256', clientSecret).update(challengeCode, 'utf8').digest('hex');
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

function detectEnvironment(req: VercelRequest): EnvName {
  const envParam = (req.query?.env as string | undefined)?.toLowerCase();
  if (envParam === 'staging') return 'staging';
  if (envParam === 'dev' || envParam === 'development') return 'development';

  const host = req.headers.host || '';
  if (host.includes('staging.use60.com')) return 'staging';
  if (host.includes('dev.use60.com')) return 'development';

  return 'production';
}

function getEnvConfig(env: EnvName) {
  switch (env) {
    case 'staging':
      return {
        supabaseUrl: process.env.STAGING_SUPABASE_URL,
        serviceKey: process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY,
      };
    case 'development':
      return {
        supabaseUrl: process.env.DEV_SUPABASE_URL,
        serviceKey: process.env.DEV_SUPABASE_SERVICE_ROLE_KEY,
      };
    default:
      return {
        supabaseUrl: process.env.SUPABASE_URL,
        serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      };
  }
}

async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-LI-Signature');
    return res.status(200).end();
  }

  // LinkedIn webhook validation: GET with challengeCode query param
  // Must return { challengeCode, challengeResponse } where challengeResponse = HMAC-SHA256(challengeCode, clientSecret)
  if (req.method === 'GET') {
    const challengeCode = req.query?.challengeCode as string | undefined;
    if (challengeCode) {
      const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
      if (!clientSecret) {
        console.error('[linkedin-webhook-proxy] Missing LINKEDIN_CLIENT_SECRET');
        return res.status(500).json({ error: 'Webhook not configured' });
      }
      const challengeResponse = computeChallengeResponse(challengeCode, clientSecret);
      console.log('[linkedin-webhook-proxy] Validation challenge received, responding with HMAC');
      return res.status(200).json({ challengeCode, challengeResponse });
    }
    return res.status(200).json({ status: 'ok', service: 'linkedin-webhook-proxy' });
  }

  // LinkedIn also validates via POST with challengeCode in the body
  if (req.method === 'POST') {
    try {
      const rawBody = await readRawBody(req);
      let parsedBody: Record<string, unknown> = {};
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        // not JSON, continue
      }

      // Handle validation challenge (POST variant)
      if (parsedBody.challengeCode) {
        const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
        if (!clientSecret) {
          console.error('[linkedin-webhook-proxy] Missing LINKEDIN_CLIENT_SECRET');
          return res.status(500).json({ error: 'Webhook not configured' });
        }
        const challengeResponse = computeChallengeResponse(String(parsedBody.challengeCode), clientSecret);
        console.log('[linkedin-webhook-proxy] Validation challenge received (POST), responding with HMAC');
        return res.status(200).json({ challengeCode: parsedBody.challengeCode, challengeResponse });
      }

      // Real webhook event — forward to Supabase
      const env = detectEnvironment(req);
      const { supabaseUrl, serviceKey } = getEnvConfig(env);

      if (!supabaseUrl) {
        console.error(`[linkedin-webhook-proxy] Missing SUPABASE_URL for ${env}`);
        throw new Error(`Webhook endpoint not configured for ${env}`);
      }

      if (!serviceKey) {
        console.error(`[linkedin-webhook-proxy] Missing SERVICE_ROLE_KEY for ${env}`);
        throw new Error(`Webhook endpoint not configured for ${env}`);
      }

      // Forward all relevant headers, especially the LinkedIn signature
      const forwardHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      };

      // Preserve LinkedIn signature header for HMAC verification in the edge function
      const liSignature = req.headers['x-li-signature'];
      if (liSignature) {
        forwardHeaders['X-LI-Signature'] = Array.isArray(liSignature) ? liSignature[0] : liSignature;
      }

      const edgeFunctionUrl = `${supabaseUrl}/functions/v1/webhook-linkedin`;

      console.log(`[linkedin-webhook-proxy] Forwarding to ${env.toUpperCase()}: ${edgeFunctionUrl}`);

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
        console.error(`[linkedin-webhook-proxy] Edge function error: ${response.status} - ${responseText}`);
        return res.status(response.status).json({
          success: false,
          error: responseData.error || 'Webhook processing failed',
          ...responseData,
        });
      }

      console.log(`[linkedin-webhook-proxy] Webhook processed successfully (${env})`);

      return res.status(200).json({
        success: true,
        ...responseData,
        proxiedBy: 'use60-webhook-proxy',
        environment: env,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[linkedin-webhook-proxy] Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Internal server error',
        timestamp: new Date().toISOString(),
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default handler;
