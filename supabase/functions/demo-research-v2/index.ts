/**
 * demo-research-v2
 *
 * Multi-source company research for the /t/{domain} campaign creator.
 * Fires 4 parallel enrichment calls, synthesizes with Gemini 2.5 Flash.
 *
 * Sources (all parallel, all optional):
 *   1. EXA neural search — news, funding, leadership, recent activity
 *   2. AI Ark company search — firmographics, tech stack, employee count
 *   3. Apollo org enrich — revenue, funding stage, description
 *   4. Website scrape — product details from homepage (existing approach)
 *
 * Supports SSE streaming via Accept: text/event-stream header.
 * Falls back to JSON response if SSE not requested.
 *
 * Input:  { url } OR { domain, company_name?, visitor_name?, visitor_title? }
 * Output: Full ResearchData shape (backward compatible with demo-research)
 *
 * Public endpoint — deploy with --no-verify-jwt.
 */

import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';

const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';
const PROVIDER_TIMEOUT_MS = 10_000;

interface DemoResearchRequest {
  url?: string;
  domain?: string;
  company_name?: string;
  visitor_name?: string;
  visitor_title?: string;
}

// ---------------------------------------------------------------------------
// Provider results
// ---------------------------------------------------------------------------

interface ProviderResult {
  provider: string;
  status: 'success' | 'error' | 'skipped';
  summary: string;
  data: Record<string, unknown> | null;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  try {
    const body: DemoResearchRequest = await req.json();

    let domain = body.domain;
    if (!domain && body.url) {
      domain = body.url
        .replace(/^(https?:\/\/)?(www\.)?/, '')
        .replace(/\/.*$/, '')
        .toLowerCase();
    }

    if (!domain) {
      return errorResponse('domain or url is required', 400, req);
    }

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      return errorResponse('GEMINI_API_KEY not configured', 500, req);
    }

    const companyName = body.company_name || domainToName(domain);
    const wantsSSE = req.headers.get('Accept')?.includes('text/event-stream');

    if (wantsSSE) {
      return handleSSE(req, domain, companyName, geminiKey, body);
    }

    return handleJSON(req, domain, companyName, geminiKey, body);
  } catch (err) {
    console.error('[demo-research-v2] Error:', err);
    return errorResponse(
      err instanceof Error ? err.message : 'Internal error',
      500,
      req
    );
  }
});

// ---------------------------------------------------------------------------
// JSON response mode (default)
// ---------------------------------------------------------------------------

async function handleJSON(
  req: Request,
  domain: string,
  companyName: string,
  geminiKey: string,
  body: DemoResearchRequest
) {
  const providerResults = await runAllProviders(domain, companyName);
  const research = await synthesizeWithGemini(
    geminiKey, domain, companyName, providerResults,
    body.visitor_name, body.visitor_title
  );

  return jsonResponse({ success: true, data: research }, req);
}

// ---------------------------------------------------------------------------
// SSE streaming mode
// ---------------------------------------------------------------------------

async function handleSSE(
  req: Request,
  domain: string,
  companyName: string,
  geminiKey: string,
  body: DemoResearchRequest
) {
  const cors = getCorsHeaders(req);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      try {
        // Fire all providers in parallel, emit events as each completes
        const providerResults = await runAllProvidersWithEvents(domain, companyName, send);

        // Synthesis
        send('provider', { provider: 'gemini', status: 'working', summary: 'Synthesizing intelligence...' });
        const research = await synthesizeWithGemini(
          geminiKey, domain, companyName, providerResults,
          body.visitor_name, body.visitor_title
        );
        send('provider', { provider: 'gemini', status: 'complete', summary: `Demo personalized for ${research.company.name}` });

        send('complete', { success: true, data: research });
      } catch (err) {
        send('error', { message: err instanceof Error ? err.message : 'Internal error' });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      ...cors,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// ---------------------------------------------------------------------------
// Provider orchestration
// ---------------------------------------------------------------------------

async function runAllProviders(domain: string, companyName: string): Promise<ProviderResult[]> {
  const results = await Promise.allSettled([
    runExa(domain, companyName),
    runAiArk(domain, companyName),
    runApollo(domain),
    runWebsiteScrape(domain),
  ]);

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    const names = ['exa', 'ai_ark', 'apollo', 'website'];
    console.warn(`[demo-research-v2] ${names[i]} failed:`, r.reason);
    return {
      provider: names[i],
      status: 'error' as const,
      summary: r.reason instanceof Error ? r.reason.message : 'Unknown error',
      data: null,
      durationMs: 0,
    };
  });
}

async function runAllProvidersWithEvents(
  domain: string,
  companyName: string,
  send: (event: string, data: unknown) => void,
): Promise<ProviderResult[]> {
  const providers = [
    { name: 'exa', label: 'EXA Search', fn: () => runExa(domain, companyName) },
    { name: 'ai_ark', label: 'AI Ark', fn: () => runAiArk(domain, companyName) },
    { name: 'apollo', label: 'Apollo', fn: () => runApollo(domain) },
    { name: 'website', label: 'Website', fn: () => runWebsiteScrape(domain) },
  ];

  // Emit working events
  for (const p of providers) {
    send('provider', { provider: p.name, status: 'working', summary: `Querying ${p.label}...` });
  }

  const results: ProviderResult[] = [];

  // Race all providers, emit as each finishes
  await Promise.allSettled(
    providers.map(async (p) => {
      try {
        const result = await p.fn();
        results.push(result);
        send('provider', {
          provider: p.name,
          status: result.status,
          summary: result.summary,
          durationMs: result.durationMs,
        });
      } catch (err) {
        const errResult: ProviderResult = {
          provider: p.name,
          status: 'error',
          summary: err instanceof Error ? err.message : 'Failed',
          data: null,
          durationMs: 0,
        };
        results.push(errResult);
        send('provider', { provider: p.name, status: 'error', summary: errResult.summary });
      }
    })
  );

  return results;
}

// ---------------------------------------------------------------------------
// Provider: EXA neural search
// ---------------------------------------------------------------------------

async function runExa(domain: string, companyName: string): Promise<ProviderResult> {
  const apiKey = Deno.env.get('EXA_API_KEY');
  if (!apiKey) {
    return { provider: 'exa', status: 'skipped', summary: 'EXA_API_KEY not set', data: null, durationMs: 0 };
  }

  const start = performance.now();
  const response = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({
      query: `${companyName} ${domain} company information funding news leadership team`,
      numResults: 8,
      contents: { text: { maxCharacters: 2000 } },
      useAutoprompt: true,
      type: 'neural',
    }),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`EXA ${response.status}`);
  }

  const data = await response.json();
  const resultCount = data.results?.length || 0;
  const durationMs = Math.round(performance.now() - start);

  // Extract key info for summary
  const firstTitle = data.results?.[0]?.title || '';
  const summary = resultCount > 0
    ? `Found ${resultCount} sources: ${firstTitle.slice(0, 60)}`
    : 'No results found';

  return {
    provider: 'exa',
    status: 'success',
    summary,
    data: { results: data.results },
    durationMs,
  };
}

// ---------------------------------------------------------------------------
// Provider: AI Ark company search
// ---------------------------------------------------------------------------

async function runAiArk(domain: string, companyName: string): Promise<ProviderResult> {
  const apiKey = Deno.env.get('AI_ARK_API_KEY');
  if (!apiKey) {
    return { provider: 'ai_ark', status: 'skipped', summary: 'AI_ARK_API_KEY not set', data: null, durationMs: 0 };
  }

  const start = performance.now();
  const response = await fetch('https://api.ai-ark.com/api/developer-portal/v1/companies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-TOKEN': apiKey },
    body: JSON.stringify({
      page: 0,
      size: 3,
      account: {
        domain: { any: { include: [domain] } },
      },
    }),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`AI Ark ${response.status}`);
  }

  const data = await response.json();
  const company = data.content?.[0];
  const durationMs = Math.round(performance.now() - start);

  if (!company) {
    return { provider: 'ai_ark', status: 'success', summary: 'No company match found', data: null, durationMs };
  }

  const name = company.summary?.name || companyName;
  const employees = company.summary?.staff?.total;
  const industry = company.summary?.industry;
  const techs = (company.technologies || []).slice(0, 5).map((t: { name: string }) => t.name);
  const location = company.location?.headquarter?.raw_address;

  const parts = [name];
  if (employees) parts.push(`${employees} employees`);
  if (industry) parts.push(industry);
  if (location) parts.push(location);

  return {
    provider: 'ai_ark',
    status: 'success',
    summary: parts.join(' | '),
    data: {
      name,
      industry,
      employees,
      location,
      technologies: techs,
      description: company.summary?.description,
      founded_year: company.summary?.foundedYear,
      linkedin_url: company.link?.linkedin,
      revenue: company.financial?.revenue,
    },
    durationMs,
  };
}

// ---------------------------------------------------------------------------
// Provider: Apollo org enrich
// ---------------------------------------------------------------------------

async function runApollo(domain: string): Promise<ProviderResult> {
  const apiKey = Deno.env.get('APOLLO_API_KEY');
  if (!apiKey) {
    return { provider: 'apollo', status: 'skipped', summary: 'APOLLO_API_KEY not set', data: null, durationMs: 0 };
  }

  const start = performance.now();
  const response = await fetch(`https://api.apollo.io/api/v1/organizations/enrich?domain=${encodeURIComponent(domain)}`, {
    method: 'GET',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Apollo ${response.status}`);
  }

  const data = await response.json();
  const org = data.organization;
  const durationMs = Math.round(performance.now() - start);

  if (!org) {
    return { provider: 'apollo', status: 'success', summary: 'No org match found', data: null, durationMs };
  }

  const parts = [org.name || domain];
  if (org.estimated_num_employees) parts.push(`~${org.estimated_num_employees} employees`);
  if (org.annual_revenue) parts.push(`Revenue: ${formatRevenue(org.annual_revenue)}`);
  if (org.latest_funding_stage) parts.push(org.latest_funding_stage);

  return {
    provider: 'apollo',
    status: 'success',
    summary: parts.join(' | '),
    data: {
      name: org.name,
      description: org.short_description,
      industry: org.industry,
      employees: org.estimated_num_employees,
      revenue: org.annual_revenue,
      funding_stage: org.latest_funding_stage,
      total_funding: org.total_funding,
      founded_year: org.founded_year,
      city: org.city,
      state: org.state,
      country: org.country,
      linkedin_url: org.linkedin_url,
      website_url: org.website_url,
      tech_stack: org.technology_names,
      keywords: org.keywords,
      seo_description: org.seo_description,
      logo_url: org.logo_url,
    },
    durationMs,
  };
}

// ---------------------------------------------------------------------------
// Provider: Website scrape (existing approach from demo-research)
// ---------------------------------------------------------------------------

async function runWebsiteScrape(domain: string): Promise<ProviderResult> {
  const start = performance.now();
  try {
    const url = `https://${domain}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 60Bot/1.0)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return { provider: 'website', status: 'error', summary: `HTTP ${response.status}`, data: null, durationMs: Math.round(performance.now() - start) };
    }
    const html = await response.text();
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 12000);

    const durationMs = Math.round(performance.now() - start);
    const wordCount = text.split(/\s+/).length;

    return {
      provider: 'website',
      status: 'success',
      summary: `Scraped ${wordCount} words from ${domain}`,
      data: { text },
      durationMs,
    };
  } catch {
    return {
      provider: 'website',
      status: 'error',
      summary: 'Could not reach website',
      data: null,
      durationMs: Math.round(performance.now() - start),
    };
  }
}

// ---------------------------------------------------------------------------
// Gemini synthesis
// ---------------------------------------------------------------------------

async function synthesizeWithGemini(
  apiKey: string,
  domain: string,
  companyName: string,
  providers: ProviderResult[],
  visitorName?: string,
  visitorTitle?: string,
): Promise<Record<string, unknown>> {
  const exa = providers.find(p => p.provider === 'exa');
  const aiArk = providers.find(p => p.provider === 'ai_ark');
  const apollo = providers.find(p => p.provider === 'apollo');
  const website = providers.find(p => p.provider === 'website');

  // Build context sections from each provider
  const sections: string[] = [];

  if (exa?.data) {
    const results = (exa.data.results as Array<{ title: string; text: string }>)?.slice(0, 6) || [];
    const exaText = results.map((r, i) => `[${i + 1}] ${r.title}\n${r.text}`).join('\n---\n');
    sections.push(`## EXA WEB SEARCH RESULTS (news, articles, funding)\n${exaText}`);
  }

  if (aiArk?.data) {
    sections.push(`## AI ARK FIRMOGRAPHICS\n${JSON.stringify(aiArk.data, null, 2)}`);
  }

  if (apollo?.data) {
    sections.push(`## APOLLO ORGANIZATION DATA\n${JSON.stringify(apollo.data, null, 2)}`);
  }

  if (website?.data) {
    sections.push(`## WEBSITE CONTENT (${domain})\n${(website.data.text as string).slice(0, 8000)}`);
  }

  const sourceContext = sections.length > 0
    ? sections.join('\n\n')
    : `No external data available. The company is ${companyName} (${domain}). Infer what you can from the name and domain.`;

  const senderName = visitorName || 'the rep';
  const senderFirstName = (visitorName || 'Alex').split(' ')[0];

  const prompt = `You are researching a company for a personalized sales CRM demo. The person viewing this demo is ${senderName}${visitorTitle ? ` (${visitorTitle})` : ''} from ${companyName}. They are a SALES REP using a CRM tool called "60" to manage their pipeline.

Here is intelligence gathered from multiple sources about ${companyName} (${domain}):

${sourceContext}

Based on ALL available data, produce a comprehensive research profile. Cross-reference sources - prefer specific data points over generic descriptions.

Return JSON matching this EXACT structure:
{
  "company": {
    "name": "${companyName}",
    "domain": "${domain}",
    "vertical": "The industry vertical (e.g. 'B2B SaaS', 'FinTech', 'Healthcare', 'Professional Services')",
    "product_summary": "One clear sentence describing what ${companyName} sells. Be specific about WHAT their product/service does. This is critical.",
    "value_props": ["3-4 specific value propositions from ${companyName}'s actual offering"],
    "employee_range": "Employee range (e.g. '11-50', '51-200', '201-1000') - use AI Ark/Apollo data if available",
    "competitors": ["2-3 real competitors"],
    "icp": {
      "title": "The job title of ${companyName}'s ideal buyer",
      "company_size": "Target company size",
      "industry": "Target industry"
    },
    "funding_stage": "Funding stage if known (e.g. 'Series A', 'Bootstrapped') or null",
    "funding_total": "Total funding amount if known or null",
    "revenue_range": "Revenue range if known or null",
    "tech_stack": ["Key technologies used - from AI Ark/Apollo data if available"],
    "leadership_team": [{"name": "string", "title": "string"}],
    "recent_news": ["1-3 recent news items or announcements from EXA results"],
    "founded_year": null,
    "headquarters": "City, Country if known or null"
  },
  "competitive": {
    "competitors": [
      {"name": "Competitor Name", "domain": "competitor.com", "differentiators": ["2-3 specific ways they differ from ${companyName}"]}
    ]
  },
  "demo_actions": {
    "cold_outreach": {
      "target_name": "Sarah Chen",
      "target_title": "A title that matches ${companyName}'s ICP buyer",
      "target_company": "A realistic prospect company name",
      "personalised_hook": "A warm, specific opening referencing a previous conversation. Not an introduction.",
      "email_preview": "SEE EMAIL RULES BELOW"
    },
    "proposal_draft": {
      "prospect_name": "James Wright",
      "prospect_company": "A different realistic prospect company",
      "proposal_title": "How ${companyName}'s [specific product] helps [prospect] achieve [outcome]",
      "key_sections": ["4 proposal sections referencing ${companyName}'s real capabilities"]
    },
    "meeting_prep": {
      "attendee_name": "David Park",
      "attendee_company": "A third realistic prospect company",
      "context": "Meeting context referencing ${companyName}'s product and a specific feature",
      "talking_points": ["4 talking points referencing ${companyName}'s REAL product features"]
    },
    "pipeline_action": {
      "deal_name": "[Prospect Company] - [Deal type]",
      "deal_value": "A realistic deal value as string (e.g. '$42,000')",
      "days_stale": 16,
      "health_score": 38,
      "risk_signal": "A specific risk signal referencing the deal context",
      "suggested_action": "A specific next step referencing ${companyName}'s product",
      "signals": [
        {"label": "Champion engaged", "type": "positive"},
        {"label": "Competitor evaluated", "type": "warning"},
        {"label": "Budget approved", "type": "positive"},
        {"label": "Technical review pending", "type": "warning"},
        {"label": "Usage metrics strong", "type": "positive"}
      ]
    }
  },
  "stats": {
    "signals_found": 47,
    "actions_queued": 12,
    "contacts_identified": 8,
    "opportunities_mapped": 4
  }
}

CRITICAL INSTRUCTIONS:
- "product_summary" must describe what ${companyName} ACTUALLY sells. Not "provides solutions" - be specific.
- "value_props" must be ${companyName}'s REAL value propositions from the source data.
- ALL content must reference ${companyName}'s specific product/service.
- Use real data from the sources above. If AI Ark says 200 employees, use that. If Apollo says Series B, use that.
- "recent_news" should come from EXA search results if available.
- "tech_stack" should come from AI Ark technologies or Apollo tech_stack if available.
- "competitive.competitors" should have real competitor domains (guess the .com if needed).
- Do NOT use placeholder brackets like [Name].

EMAIL RULES (for "email_preview"):
This is a POST-MEETING FOLLOW-UP email, not cold outreach. ${senderFirstName} already had a demo/call with the prospect yesterday.
1. 75-125 WORDS. Concise.
2. 3rd-to-5th grade reading level. Short words. Short sentences.
3. ONE email, ONE idea, ONE ask.
4. Open by referencing yesterday's conversation.
5. Reference 2-3 SPECIFIC features of ${companyName}'s product. Use bullet points.
6. End with a clear, easy next step.
7. Write like you talk. Use contractions.
8. NO em dashes. NO oxford commas.
9. Sign off as just "${senderFirstName}".

DEAD LANGUAGE - never use:
"I'm reaching out", "I hope this finds you well", "leverage", "synergies", "streamline", "empower", "best-in-class", "cutting-edge", "revolutionize", "industry-leading", "just following up"

Return ONLY valid JSON, no markdown fences.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4000,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Gemini API error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts
    ?.filter((p: { thought?: boolean }) => !p.thought)
    ?.map((p: { text?: string }) => p.text)
    ?.join('') || '';

  if (!text) {
    throw new Error('No content in Gemini response');
  }

  const parsed = JSON.parse(text);

  // Validate critical fields
  if (!parsed.company?.name || !parsed.company?.product_summary) {
    throw new Error('Missing company name or product_summary');
  }
  if (!parsed.demo_actions?.cold_outreach?.email_preview) {
    throw new Error('Missing cold_outreach email_preview');
  }

  // Ensure domain is correct
  parsed.company.domain = domain;

  return parsed;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function domainToName(domain: string): string {
  const cleaned = domain
    .replace(/\.(com|io|co|ai|dev|org|net|app)$/i, '')
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .trim();
  return cleaned
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatRevenue(revenue: number | null): string {
  if (!revenue) return 'Unknown';
  if (revenue >= 1_000_000_000) return `$${(revenue / 1_000_000_000).toFixed(1)}B`;
  if (revenue >= 1_000_000) return `$${(revenue / 1_000_000).toFixed(0)}M`;
  if (revenue >= 1_000) return `$${(revenue / 1_000).toFixed(0)}K`;
  return `$${revenue}`;
}
