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
  scenarioId?: string;
  domain?: string;
  similarUrl?: string;
  trendTopic?: string;
  runWebsetCreate?: boolean;
}

interface OpsTableBlueprint {
  name: string;
  purpose: string;
  columns: string[];
}

interface UsableOutputs {
  account_targets: Array<{ name: string; url: string; snippet?: string; rank_score: number; why_matched: string }>;
  persona_targets: Array<{ name: string; url: string; role_hint?: string; seniority_hint: string; why_fit: string }>;
  competitive_links: Array<{ title: string; url: string }>;
  intent_signals: Array<{ signal: string; strength: 'high' | 'medium' | 'context'; evidence?: string }>;
  trend_summary: { answer: string; citation_count: number; citations: Array<{ title: string; url: string }> };
  websets_setup: {
    query: string;
    criteria: string[];
    enrichments: string[];
    recommended_columns: string[];
    can_create_webset: boolean;
    webset_id?: string;
  };
}

interface ScenarioPanel {
  key: 'accountDiscovery' | 'personaDiscovery' | 'intentIntel' | 'websetsPlan';
  title: string;
  status: 'success' | 'partial' | 'fallback' | 'error';
  using_fallback_data: boolean;
  what_happened: string;
  why_this_matters: string;
  what_to_do_next: string[];
}

function safeErrorMessage(raw: string): string {
  return raw.slice(0, 300);
}

function toObject(data: unknown): Record<string, unknown> {
  return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
}

function extractSearchRows(
  raw: unknown,
  max = 5
): Array<{ name: string; url: string; snippet?: string }> {
  const obj = toObject(raw);
  const results = Array.isArray(obj.results) ? obj.results : [];
  return results.slice(0, max).map((item) => {
    const row = toObject(item);
    return {
      name: String(row.title || row.name || row.url || 'Unknown'),
      url: String(row.url || ''),
      snippet: typeof row.text === 'string' ? row.text.slice(0, 180) : undefined,
    };
  }).filter((r) => Boolean(r.url));
}

function deriveSeniority(title: string): string {
  const lowered = title.toLowerCase();
  if (lowered.includes('chief') || lowered.includes('c-level') || lowered.includes('ceo')) return 'executive';
  if (lowered.includes('vp') || lowered.includes('head')) return 'senior';
  if (lowered.includes('director')) return 'mid-senior';
  return 'unknown';
}

function extractPeopleRows(
  raw: unknown,
  max = 5
): Array<{ name: string; url: string; role_hint?: string; seniority_hint: string; why_fit: string }> {
  const obj = toObject(raw);
  const results = Array.isArray(obj.results) ? obj.results : [];
  return results.slice(0, max).map((item) => {
    const row = toObject(item);
    const title = String(row.title || row.name || row.url || 'Unknown');
    return {
      name: title,
      url: String(row.url || ''),
      role_hint: title,
      seniority_hint: deriveSeniority(title),
      why_fit: 'Title suggests commercial ownership or buying influence.',
    };
  }).filter((r) => Boolean(r.url));
}

function extractWebsetPreview(raw: unknown): { criteria: string[]; enrichments: string[] } {
  const obj = toObject(raw);
  const search = toObject(obj.search);
  const criteriaRaw = Array.isArray(search.criteria) ? search.criteria : [];
  const enrichmentsRaw = Array.isArray(obj.enrichments) ? obj.enrichments : [];

  const criteria = criteriaRaw
    .map((c) => {
      const row = toObject(c);
      return typeof row.description === 'string' ? row.description : '';
    })
    .filter(Boolean)
    .slice(0, 8);

  const enrichments = enrichmentsRaw
    .map((e) => {
      const row = toObject(e);
      return typeof row.description === 'string' ? row.description : '';
    })
    .filter(Boolean)
    .slice(0, 8);

  return { criteria, enrichments };
}

function extractAnswer(raw: unknown): { answer: string; citation_count: number; citations: Array<{ title: string; url: string }> } {
  const obj = toObject(raw);
  const answer = typeof obj.answer === 'string' ? obj.answer : '';
  const citations = Array.isArray(obj.citations) ? obj.citations : [];
  const topCitations = citations
    .slice(0, 4)
    .map((c) => {
      const item = toObject(c);
      return {
        title: String(item.title || item.url || 'Source'),
        url: String(item.url || ''),
      };
    })
    .filter((c) => Boolean(c.url));
  const citationCount = citations.length;
  return { answer: answer.slice(0, 400), citation_count: citationCount, citations: topCitations };
}

function fallbackAccountTargets(domain: string): Array<{ name: string; url: string; snippet?: string; rank_score: number; why_matched: string }> {
  return [
    { name: `Example Prospect 1 (${domain})`, url: `https://${domain}`, snippet: 'Sample account generated due to sparse endpoint data.', rank_score: 72, why_matched: 'Domain-adjacent and likely relevant to ICP.' },
    { name: 'Demo Prospect 2', url: 'https://www.gong.io', snippet: 'Revenue intelligence platform with active GTM motion.', rank_score: 68, why_matched: 'Strong overlap with sales-intelligence use cases.' },
  ];
}

function fallbackPersonas(): Array<{ name: string; url: string; role_hint?: string; seniority_hint: string; why_fit: string }> {
  return [
    { name: 'VP Sales (sample persona)', url: 'https://www.linkedin.com', role_hint: 'VP Sales', seniority_hint: 'senior', why_fit: 'Likely owner of outbound tooling and process decisions.' },
    { name: 'Head of Revenue Ops (sample persona)', url: 'https://www.linkedin.com', role_hint: 'Head of Revenue Operations', seniority_hint: 'senior', why_fit: 'Strong influence over enrichment workflows and stack choices.' },
  ];
}

function deriveIntentSignals(
  trendAnswer: string,
  competitiveLinks: Array<{ title: string; url: string }>
): Array<{ signal: string; strength: 'high' | 'medium' | 'context'; evidence?: string }> {
  const signals: Array<{ signal: string; strength: 'high' | 'medium' | 'context'; evidence?: string }> = [];
  if (trendAnswer.toLowerCase().includes('hiring')) {
    signals.push({ signal: 'Hiring expansion detected in market narrative', strength: 'high', evidence: 'Trend summary references hiring momentum.' });
  }
  if (trendAnswer.toLowerCase().includes('ai')) {
    signals.push({ signal: 'AI adoption priority in target segment', strength: 'high', evidence: 'Trend summary includes AI adoption themes.' });
  }
  if (competitiveLinks.length > 0) {
    signals.push({ signal: 'Dense competitive cluster around your seed account', strength: 'medium', evidence: `Found ${competitiveLinks.length} related companies/pages.` });
  }
  if (signals.length === 0) {
    signals.push({ signal: 'Monitor product launches and leadership changes', strength: 'context', evidence: 'No explicit intent signals extracted; use cadence-based monitoring.' });
  }
  return signals.slice(0, 4);
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
    const scenarioId = (body.scenarioId || 'search-1').trim();
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
    const rawByCase: Partial<Record<EndpointCase, unknown>> = {};

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
          rawByCase[testCase.name] = resultBody;
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

    const accountTargetsRaw = extractSearchRows(rawByCase.search_company_auto, 5);
    const accountTargets = accountTargetsRaw.map((row, idx) => ({
      ...row,
      rank_score: Math.max(55, 90 - idx * 7),
      why_matched: row.snippet
        ? 'Semantic overlap with target ICP and domain context.'
        : 'Strong similarity signal from Exa retrieval.',
    }));

    const peopleTargets = extractPeopleRows(rawByCase.search_people_auto, 5);
    const competitiveLinks = extractSearchRows(rawByCase.find_similar, 5).map((row) => ({
      title: row.name,
      url: row.url,
    }));
    const trendSummary = extractAnswer(rawByCase.answer);
    const websetPreview = extractWebsetPreview(rawByCase.websets_preview);
    const websetCreateObj = toObject(rawByCase.websets_create);

    const usingAccountFallback = accountTargets.length === 0;
    const usingPeopleFallback = peopleTargets.length === 0;
    const usingTrendFallback = trendSummary.answer.length === 0;
    const usingWebsetFallback = websetPreview.criteria.length === 0 && websetPreview.enrichments.length === 0;

    const finalAccountTargets = usingAccountFallback ? fallbackAccountTargets(domain) : accountTargets;
    const finalPeopleTargets = usingPeopleFallback ? fallbackPersonas() : peopleTargets;
    const finalTrendSummary = usingTrendFallback
      ? {
          answer:
            'Sample insight: Teams showing hiring growth, new GTM tooling evaluation, and expansion announcements tend to have stronger near-term buying intent for prospecting platforms.',
          citation_count: 0,
          citations: [],
        }
      : trendSummary;

    const intentSignals = deriveIntentSignals(finalTrendSummary.answer, competitiveLinks);

    const usableOutputs: UsableOutputs = {
      account_targets: finalAccountTargets,
      persona_targets: finalPeopleTargets,
      competitive_links: competitiveLinks,
      intent_signals: intentSignals,
      trend_summary: finalTrendSummary,
      websets_setup: {
        query: `Series A fintech companies in UK similar to ${domain}`,
        criteria: websetPreview.criteria.length
          ? websetPreview.criteria
          : ['Company is in target segment', 'Evidence of active GTM motion'],
        enrichments: websetPreview.enrichments.length
          ? websetPreview.enrichments
          : ['LinkedIn URL', 'Funding stage', 'Headcount estimate', 'Intent summary'],
        recommended_columns: [
          'company_name',
          'website',
          'linkedin_url',
          'hq_location',
          'funding_stage',
          'employee_range',
          'why_matched',
          'source_url',
        ],
        can_create_webset: Boolean(rawByCase.websets_create),
        webset_id: typeof websetCreateObj.id === 'string' ? String(websetCreateObj.id) : undefined,
      },
    };

    const blueprints: OpsTableBlueprint[] = [
      {
        name: 'Exa Account Discovery',
        purpose: 'Find high-fit companies for outbound ICP campaigns.',
        columns: [
          'company_name',
          'website',
          'industry',
          'employee_range',
          'funding_stage',
          'hq_location',
          'why_matched',
          'source_url',
        ],
      },
      {
        name: 'Exa Persona Discovery',
        purpose: 'Find likely buyer personas inside target accounts.',
        columns: [
          'person_name',
          'title',
          'company',
          'linkedin_url',
          'seniority',
          'region',
          'contact_priority',
          'reason_fit',
        ],
      },
    ];

    const recommendations = [
      'Prioritize the top 3 ranked accounts and draft outreach angles using intent signals.',
      'Use persona discovery to map at least one decision-maker and one champion per account.',
      'Use Websets Preview to confirm criteria before spending credits on create.',
      'For production rollout, gate Webset create behind a confirm step and budget checks.',
    ];

    const scenarioPanels: ScenarioPanel[] = [
      {
        key: 'accountDiscovery',
        title: 'Account Discovery',
        status: usingAccountFallback ? 'fallback' : 'success',
        using_fallback_data: usingAccountFallback,
        what_happened: usingAccountFallback
          ? 'Account endpoint returned sparse data, so sample account targets were generated to continue the flow.'
          : `Retrieved ${finalAccountTargets.length} target accounts from company and similarity search.`,
        why_this_matters: 'This gives your team a prioritized account list aligned to your ICP.',
        what_to_do_next: ['Review top ranked accounts', 'Pick 3 accounts for immediate outreach sequencing'],
      },
      {
        key: 'personaDiscovery',
        title: 'Persona Discovery',
        status: usingPeopleFallback ? 'fallback' : 'success',
        using_fallback_data: usingPeopleFallback,
        what_happened: usingPeopleFallback
          ? 'People endpoint returned sparse data, so sample personas were injected to preserve demo continuity.'
          : `Identified ${finalPeopleTargets.length} likely buyer personas from people search.`,
        why_this_matters: 'Accounts are only actionable when tied to reachable decision-makers.',
        what_to_do_next: ['Map each persona to target account', 'Select primary outreach owner per persona'],
      },
      {
        key: 'intentIntel',
        title: 'Intent Intelligence',
        status: usingTrendFallback ? 'partial' : 'success',
        using_fallback_data: usingTrendFallback,
        what_happened: usingTrendFallback
          ? 'Trend answer was sparse, so a fallback intent narrative was generated.'
          : `Extracted ${intentSignals.length} intent signals and ${finalTrendSummary.citation_count} citations.`,
        why_this_matters: 'Intent context improves timing and personalization for outreach.',
        what_to_do_next: ['Use high-strength signals as opening hooks', 'Build a signal-based prioritization queue'],
      },
      {
        key: 'websetsPlan',
        title: 'Websets Strategy',
        status: usingWebsetFallback ? 'partial' : 'success',
        using_fallback_data: usingWebsetFallback,
        what_happened: usableOutputs.websets_setup.can_create_webset
          ? `Preview complete and Webset run created (${usableOutputs.websets_setup.webset_id || 'id unavailable'}).`
          : 'Preview complete. Create step not executed in this run.',
        why_this_matters: 'Websets turns one-off discovery into a repeatable pipeline.',
        what_to_do_next: ['Finalize criteria vs enrichments', 'Run create after approval and budget check'],
      },
    ];

    const nextActions = [
      'Accounts to target this week: start with rank score >= 75.',
      'Decision-makers to contact: prioritize seniority_hint in {senior, executive}.',
      'Signals indicating outreach timing: use high-strength intent signals first.',
      'Websets strategy to automate discovery: promote preview criteria into a recurring monitor.',
    ];

    return json({
      tested_at: new Date().toISOString(),
      domain,
      similar_url: similarUrl,
      trend_topic: trendTopic,
      run_webset_create: runWebsetCreate,
      success_count: successCount,
      total_count: results.length,
      results,
      usable_outputs: usableOutputs,
      ops_table_blueprints: blueprints,
      implementation_recommendations: recommendations,
      scenario_id: scenarioId,
      scenario_panels: scenarioPanels,
      next_actions: nextActions,
    });
  } catch (error) {
    console.error('[exa-abilities-demo] error', error);
    return json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      500
    );
  }
});
