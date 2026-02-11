import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

type EndpointCase =
  | 'search_company_auto'
  | 'search_people_auto'
  | 'find_similar'
  | 'answer'
  | 'websets_preview'
  | 'websets_create';

interface EndpointResult {
  name: EndpointCase;
  endpoint: string;
  status: number;
  ok: boolean;
  latency_ms: number;
  summary: string;
  sample?: Record<string, unknown>;
  error?: string;
}

interface DemoRequest {
  domain?: string;
  similarUrl?: string;
  trendTopic?: string;
  runWebsetCreate?: boolean;
}

function safeErrorMessage(raw: string): string {
  return raw.slice(0, 300);
}

async function runExaRequest(
  apiKey: string,
  endpoint: string,
  payload: Record<string, unknown>
): Promise<{ status: number; latency: number; body: unknown }> {
  const start = performance.now();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(payload),
  });

  const latency = Math.round(performance.now() - start);
  let body: unknown;
  const text = await response.text();
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  return { status: response.status, latency, body };
}

serve(async (req) => {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  const cors = getCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const EXA_API_KEY = Deno.env.get('EXA_API_KEY');
    if (!EXA_API_KEY) {
      return json({ error: 'EXA_API_KEY is not configured' }, 500);
    }

    const body = (await req.json().catch(() => ({}))) as DemoRequest;
    const domain = (body.domain || 'use60.com').trim();
    const similarUrl = (body.similarUrl || `https://${domain}`).trim();
    const trendTopic = (body.trendTopic || 'sales engagement platforms in 2026').trim();
    const runWebsetCreate = Boolean(body.runWebsetCreate);

    const cases: Array<{
      name: EndpointCase;
      endpoint: string;
      payload: Record<string, unknown>;
      summarize: (data: unknown) => { summary: string; sample?: Record<string, unknown> };
    }> = [
      {
        name: 'search_company_auto',
        endpoint: 'https://api.exa.ai/search',
        payload: {
          query: `B2B sales intelligence companies similar to ${domain}`,
          type: 'auto',
          category: 'company',
          numResults: 5,
          contents: { text: { maxCharacters: 500 } },
        },
        summarize: (data: unknown) => {
          const parsed = data as { results?: Array<{ url?: string; title?: string }> };
          const count = parsed.results?.length || 0;
          return {
            summary: `${count} company results`,
            sample: count > 0 ? { first_result: parsed.results?.[0] } : undefined,
          };
        },
      },
      {
        name: 'search_people_auto',
        endpoint: 'https://api.exa.ai/search',
        payload: {
          query: 'VP Sales at Series A SaaS startups in Europe',
          type: 'auto',
          category: 'people',
          numResults: 5,
          contents: { text: { maxCharacters: 350 } },
        },
        summarize: (data: unknown) => {
          const parsed = data as { results?: Array<{ url?: string; title?: string }> };
          const count = parsed.results?.length || 0;
          return {
            summary: `${count} people results`,
            sample: count > 0 ? { first_result: parsed.results?.[0] } : undefined,
          };
        },
      },
      {
        name: 'find_similar',
        endpoint: 'https://api.exa.ai/findSimilar',
        payload: {
          url: similarUrl,
          numResults: 5,
          contents: { text: { maxCharacters: 250 } },
        },
        summarize: (data: unknown) => {
          const parsed = data as { results?: Array<{ url?: string; title?: string }> };
          const count = parsed.results?.length || 0;
          return {
            summary: `${count} similar links`,
            sample: count > 0 ? { first_result: parsed.results?.[0] } : undefined,
          };
        },
      },
      {
        name: 'answer',
        endpoint: 'https://api.exa.ai/answer',
        payload: {
          query: `What are the key trends in ${trendTopic}?`,
          text: true,
        },
        summarize: (data: unknown) => {
          const parsed = data as { answer?: string; citations?: unknown[] };
          return {
            summary: parsed.answer ? 'answer returned' : 'no answer text',
            sample: {
              answer_preview: parsed.answer?.slice(0, 140),
              citations: Array.isArray(parsed.citations) ? parsed.citations.length : 0,
            },
          };
        },
      },
      {
        name: 'websets_preview',
        endpoint: 'https://api.exa.ai/websets/v0/websets/preview',
        payload: {
          search: {
            query: `Series A fintech companies in UK similar to ${domain}`,
            entity: { type: 'company' },
            count: 10,
          },
        },
        summarize: (data: unknown) => {
          const parsed = data as { items?: unknown[]; enrichments?: unknown[]; search?: unknown };
          return {
            summary: `preview items: ${parsed.items?.length || 0}, enrichments: ${parsed.enrichments?.length || 0}`,
            sample: {
              has_search: Boolean(parsed.search),
              items: parsed.items?.length || 0,
              enrichments: parsed.enrichments?.length || 0,
            },
          };
        },
      },
    ];

    if (runWebsetCreate) {
      cases.push({
        name: 'websets_create',
        endpoint: 'https://api.exa.ai/websets/v0/websets/',
        payload: {
          search: {
            query: `Top AI sales startups similar to ${domain}`,
            count: 3,
            entity: { type: 'company' },
          },
          metadata: { source: 'use60-exa-abilities-demo', user_id: user.id },
        },
        summarize: (data: unknown) => {
          const parsed = data as { id?: string; status?: string };
          return {
            summary: parsed.id ? `webset created (${parsed.status || 'unknown'})` : 'webset create returned no id',
            sample: parsed.id ? { webset_id: parsed.id, status: parsed.status } : undefined,
          };
        },
      });
    }

    const results: EndpointResult[] = [];

    for (const testCase of cases) {
      try {
        const { status, latency, body: resultBody } = await runExaRequest(
          EXA_API_KEY,
          testCase.endpoint,
          testCase.payload
        );

        const parsedError =
          typeof resultBody === 'string'
            ? resultBody
            : JSON.stringify(resultBody);

        if (status >= 200 && status < 300) {
          const { summary, sample } = testCase.summarize(resultBody);
          results.push({
            name: testCase.name,
            endpoint: testCase.endpoint,
            status,
            ok: true,
            latency_ms: latency,
            summary,
            sample,
          });
        } else {
          results.push({
            name: testCase.name,
            endpoint: testCase.endpoint,
            status,
            ok: false,
            latency_ms: latency,
            summary: 'request failed',
            error: safeErrorMessage(parsedError),
          });
        }
      } catch (error) {
        results.push({
          name: testCase.name,
          endpoint: testCase.endpoint,
          status: 0,
          ok: false,
          latency_ms: 0,
          summary: 'request threw exception',
          error: safeErrorMessage(error instanceof Error ? error.message : 'Unknown error'),
        });
      }
    }

    const successCount = results.filter((r) => r.ok).length;

    return json({
      tested_at: new Date().toISOString(),
      domain,
      similar_url: similarUrl,
      trend_topic: trendTopic,
      run_webset_create: runWebsetCreate,
      success_count: successCount,
      total_count: results.length,
      results,
    });
  } catch (error) {
    console.error('[exa-abilities-demo] error', error);
    return json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      500
    );
  }
});
