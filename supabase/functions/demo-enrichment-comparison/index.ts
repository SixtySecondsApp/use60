/**
 * Demo Enrichment Comparison Edge Function
 *
 * Orchestrates side-by-side comparison of legacy vs enhanced enrichment.
 * Enhanced mode uses Agent Teams for parallel multi-source research.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders } from '../_shared/corsHelper.ts';

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json(
      {
        error: 'Method not allowed. Use POST.',
        expected: {
          method: 'POST',
          body: { mode: 'legacy|enhanced', domain: 'example.com' },
          auth: 'Bearer user JWT required',
        },
      },
      405
    );
  }

  try {
    const authHeader = req.headers.get('Authorization');

    // Demo mode: make auth optional for testing
    let userId = 'demo-user-' + Date.now();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      authHeader ? { global: { headers: { Authorization: authHeader } } } : {}
    );

    // Try to get user if auth present
    if (authHeader) {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (user) {
        userId = user.id;
        console.log('[demo] Authenticated user:', userId);
      } else {
        console.warn('[demo] Auth failed, using demo mode:', userError?.message);
      }
    } else {
      console.log('[demo] No auth, running in demo mode');
    }

    const body = await req.json().catch(() => null);
    const mode = body?.mode;
    const domain = typeof body?.domain === 'string' ? body.domain.trim() : '';

    if (!mode || !domain) {
      return json({ error: 'Missing required parameters: mode, domain' }, 400);
    }

    let result: any;
    let stats: any;
    let warning: string | null = null;

    if (mode === 'legacy') {
      // ===== LEGACY MODE: Website Scraping =====
      result = await runLegacyEnrichment(domain);
      stats = calculateStats(result);

    } else if (mode === 'enhanced') {
      // ===== ENHANCED MODE: Agent Teams =====
      try {
        result = await runEnhancedEnrichment(supabase, domain, userId, authHeader || '');
      } catch (enhancedError: any) {
        // Keep the demo page working even if downstream orchestration fails.
        console.error('[demo-enrichment-comparison] Enhanced mode fallback:', enhancedError);
        warning = `Enhanced pipeline unavailable, returned fallback demo data: ${enhancedError?.message || 'unknown error'}`;
        result = generateDomainAwareMockData(domain, extractCompanyName(domain));
      }
      stats = calculateStats(result);

    } else {
      return json({ error: `Invalid mode: ${mode}` }, 400);
    }

    return json({ result, stats, warning });

  } catch (error: any) {
    console.error('[demo-enrichment-comparison] Error:', error);
    return json({ error: error.message || 'Internal server error' }, 500);
  }
});

// ============================================================================
// Legacy Enrichment (Website Scraping)
// ============================================================================

async function runLegacyEnrichment(domain: string): Promise<any> {
  console.log(`[Legacy] Starting enrichment for ${domain}`);

  // Simulate website scraping (in reality, would call scrapeWebsite())
  await new Promise(resolve => setTimeout(resolve, 5000)); // 5 seconds

  // Return mock data with lower completeness
  return {
    company_name: extractCompanyName(domain),
    tagline: 'Automated billing for modern teams',
    description: 'Software platform for billing automation',
    industry: 'B2B SaaS',
    employee_count: '10-50',
    products: [
      { name: 'Billing Platform', description: 'Automated invoicing' }
    ],
    value_propositions: [
      'Automated billing',
      'Time-saving solution'
    ],
    competitors: [
      { name: 'Stripe Billing' }
    ],
    target_market: 'Small businesses',
    customer_types: ['SMBs'],
    key_features: ['Automated invoicing', 'Payment tracking'],
    key_people: [
      { name: 'Founder', title: 'CEO' }
    ],
    // Enhanced fields NOT populated in legacy mode
    founded_year: undefined,
    headquarters: undefined,
    funding_status: undefined,
    review_ratings: undefined,
    buying_signals_detected: undefined,
    company_milestones: undefined,
    differentiators: undefined,
    market_trends: undefined,
    leadership_backgrounds: undefined
  };
}

// ============================================================================
// Enhanced Enrichment (Agent Teams)
// ============================================================================

async function runEnhancedEnrichment(
  supabase: any,
  domain: string,
  userId: string,
  authHeader: string
): Promise<any> {
  console.log(`[Enhanced] Starting Agent Teams enrichment for ${domain}`);

  // Create a team for parallel research
  const teamName = `enrich-${domain.replace(/\./g, '-')}-${Date.now()}`;

  try {
    // Use single coordinated agent with gemini_research tool
    console.log(`[Enhanced] Starting coordinated agent with gemini_research tool`);

    // Create a fresh client with auth for function-to-function calls
    const authedClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: { Authorization: authHeader }
        }
      }
    );

    const { data, error } = await authedClient.functions.invoke('copilot-autonomous', {
      body: {
        message: `You are coordinating company research for the domain "${domain}".

Use the gemini_research tool to gather comprehensive intelligence across 5 research areas:

1. **Company Overview**: Use gemini_research with query: "Research ${domain} company: full name, tagline, detailed description, industry, employee count range, headquarters location, founded year, company type"

2. **Products & Market**: Use gemini_research with query: "Research ${domain} products and market: all products/services with descriptions, value propositions, target market segments, customer types, key features"

3. **Funding & Growth**: Use gemini_research with query: "Research ${domain} funding on Crunchbase: funding status, all funding rounds with round/amount/date/investors, company milestones, recent expansion signals"

4. **Leadership Team**: Use gemini_research with query: "Research ${domain} leadership on LinkedIn: founders and C-suite executives with full names, titles, professional backgrounds"

5. **Competition & Reviews**: Use gemini_research with query: "Research ${domain} competitive landscape: direct competitors with names/domains, differentiators, G2/Capterra/TrustPilot ratings, market trends, recent news"

After gathering research from all 5 areas, aggregate into a single JSON object with ALL fields populated.

Return ONLY valid JSON matching this structure (use null for missing fields, [] for empty arrays):
{
  "company_name": "string",
  "tagline": "string",
  "description": "string",
  "industry": "string",
  "employee_count": "string (e.g., 10-50)",
  "products": [{"name": "string", "description": "string"}],
  "value_propositions": ["string"],
  "competitors": [{"name": "string", "domain": "string"}],
  "target_market": "string",
  "customer_types": ["string"],
  "key_features": ["string"],
  "key_people": [{"name": "string", "title": "string", "background": "string"}],
  "founded_year": "string",
  "headquarters": "string",
  "company_type": "string",
  "funding_status": "string",
  "funding_rounds": [{"round": "string", "amount": "string", "date": "string", "investors": ["string"]}],
  "review_ratings": [{"platform": "string", "rating": number, "count": number}],
  "buying_signals_detected": ["string"],
  "company_milestones": [{"year": "string", "milestone": "string"}],
  "differentiators": ["string"],
  "market_trends": ["string"],
  "recent_news": [{"date": "string", "event": "string"}],
  "content_samples": [],
  "pain_points_mentioned": []
}`,
        conversation_id: `demo-enrich-${Date.now()}`,
        user_id: userId,
        force_single_agent: true
      }
    });

    if (error) {
      console.error(`[Enhanced] Agent failed:`, error);
      throw new Error(error.message || 'Agent invocation failed');
    }

    if (!data) {
      console.error('[Enhanced] No data returned from agent');
      throw new Error('No response from agent');
    }

    console.log(`[Enhanced] Agent completed, response type:`, typeof data);
    console.log(`[Enhanced] Response keys:`, Object.keys(data));

    // Check response format
    if (!data.message) {
      console.error('[Enhanced] data.message is missing. Full data:', JSON.stringify(data).substring(0, 500));
      throw new Error('Invalid response format from agent');
    }

    console.log(`[Enhanced] Parsing response...`);

    // Parse JSON response
    let enrichedData: any;
    try {
      const responseText = data.message;
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) ||
                       responseText.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        console.error('[Enhanced] No JSON found in response:', responseText.substring(0, 500));
        throw new Error('No JSON structure found in agent response');
      }

      const jsonStr = jsonMatch[1] || jsonMatch[0];
      enrichedData = JSON.parse(jsonStr);

      console.log(`[Enhanced] Successfully parsed - Company: ${enrichedData.company_name}`);
    } catch (parseError) {
      console.error('[Enhanced] Failed to parse JSON response:', parseError);
      console.error('[Enhanced] Response:', data.message?.substring(0, 500));
      throw new Error(`Failed to parse agent response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
    }

    return enrichedData;

  } catch (error: any) {
    console.error('[Enhanced] Error in Agent Teams enrichment:', error);
    throw error;
  }
}

// ============================================================================
// Result Aggregation
// ============================================================================

function aggregateAgentResults(domain: string, agentResults: any[]): any {
  // Aggregate real research results from all agents
  console.log(`[Enhanced] Aggregating ${agentResults.length} agent results`);

  const aggregated: any = {
    // Initialize with defaults
    company_name: extractCompanyName(domain),
    tagline: null,
    description: null,
    industry: null,
    employee_count: null,
    products: [],
    value_propositions: [],
    competitors: [],
    target_market: null,
    customer_types: [],
    key_features: [],
    key_people: [],
    content_samples: [],
    pain_points_mentioned: [],
    // Enhanced fields
    founded_year: null,
    headquarters: null,
    company_type: null,
    funding_status: null,
    funding_rounds: [],
    investors: [],
    valuation: null,
    review_ratings: [],
    awards: [],
    recent_news: [],
    buying_signals_detected: [],
    company_milestones: [],
    differentiators: [],
    market_trends: [],
    leadership_backgrounds: []
  };

  // Merge results from each agent
  for (const agentResult of agentResults) {
    if (!agentResult.result || agentResult.error) {
      console.log(`[Enhanced] Skipping ${agentResult.agent} - ${agentResult.error || 'no result'}`);
      continue;
    }

    const data = agentResult.result;
    console.log(`[Enhanced] Merging ${agentResult.agent} data`);

    // Company overview fields
    if (data.company_name) aggregated.company_name = data.company_name;
    if (data.tagline) aggregated.tagline = data.tagline;
    if (data.description) aggregated.description = data.description;
    if (data.industry) aggregated.industry = data.industry;
    if (data.employee_count) aggregated.employee_count = data.employee_count;
    if (data.headquarters) aggregated.headquarters = data.headquarters;
    if (data.founded_year) aggregated.founded_year = data.founded_year;
    if (data.company_type) aggregated.company_type = data.company_type;

    // Funding fields
    if (data.funding_status) aggregated.funding_status = data.funding_status;
    if (data.funding_rounds) aggregated.funding_rounds = data.funding_rounds;
    if (data.investors) aggregated.investors = data.investors;
    if (data.valuation) aggregated.valuation = data.valuation;

    // Review fields
    if (data.review_ratings) aggregated.review_ratings = data.review_ratings;
    if (data.awards) aggregated.awards = data.awards;

    // Leadership fields
    if (data.key_people) aggregated.key_people = data.key_people;
    if (data.leadership_backgrounds) aggregated.leadership_backgrounds = data.leadership_backgrounds;

    // Market fields
    if (data.competitors) aggregated.competitors = data.competitors;
    if (data.differentiators) aggregated.differentiators = data.differentiators;
    if (data.products) aggregated.products = data.products;
    if (data.value_propositions) aggregated.value_propositions = data.value_propositions;
    if (data.target_market) aggregated.target_market = data.target_market;
    if (data.customer_types) aggregated.customer_types = data.customer_types;
    if (data.key_features) aggregated.key_features = data.key_features;
    if (data.recent_news) aggregated.recent_news = data.recent_news;
    if (data.market_trends) aggregated.market_trends = data.market_trends;
    if (data.buying_signals_detected) aggregated.buying_signals_detected = data.buying_signals_detected;
    if (data.company_milestones) aggregated.company_milestones = data.company_milestones;
  }

  console.log(`[Enhanced] Aggregation complete - Company: ${aggregated.company_name}`);
  return aggregated;
}

function generateDomainAwareMockData(domain: string, companyName: string): any {
  // Use real data for known demo domains
  if (domain.includes('conturae')) {
    return {
      company_name: 'Conturae',
      tagline: 'Content that ranks, written for you',
      description: 'UK-based AI-assisted content creation platform blending expert UK and US copywriters with AI efficiency, providing businesses, marketers and agencies with high-quality SEO content that\'s authentic and on-brand',
      industry: 'Content Marketing - AI-Assisted Content Creation',
      employee_count: '10-20',
      products: [
        { name: 'AI-Assisted Content Platform', description: 'Hybrid platform combining expert human writers with AI efficiency' },
        { name: 'SEO Content Writing', description: 'Blog posts, articles, whitepapers, guides optimized for search' },
        { name: 'Copywriting Services', description: 'Web copy, product descriptions, email campaigns, ad copy' }
      ],
      value_propositions: [
        'Expert UK & US copywriters with AI efficiency',
        'Authentic, on-brand SEO content',
        'No empty AI content - human quality guaranteed',
        'Fast turnaround without compromising quality'
      ],
      competitors: [
        { name: 'Jasper AI', domain: 'jasper.ai' },
        { name: 'Copy.ai', domain: 'copy.ai' },
        { name: 'Contently', domain: 'contently.com' }
      ],
      target_market: 'Businesses, marketers, and agencies needing consistent, high-quality SEO content',
      customer_types: ['Marketing agencies', 'SMB businesses', 'Enterprise brands'],
      key_features: [
        'AI-assisted content creation',
        'Expert human writer network',
        'SEO optimization',
        'Flexible pricing (pay-per-word or subscription)',
        'Content strategy support'
      ],
      key_people: [
        { name: 'Dan Debnam', title: 'Co-Founder' },
        { name: 'Jen Timothy', title: 'Co-Founder & Operations Director' },
        { name: 'Joe Tompkinson', title: 'Co-Founder' }
      ],
      founded_year: '2022',
      headquarters: 'Barnstaple, Devon, UK',
      company_type: 'Private (Startup)',
      funding_status: 'Bootstrapped',
      funding_rounds: [],
      investors: [],
      valuation: 'Not disclosed',
      review_ratings: [],
      awards: [],
      recent_news: [
        {
          date: '2023-05',
          event: 'Launched AI-assisted content platform',
          source_url: 'https://www.conturae.com/resources/tech-startup-conturae-delivers-an-inspired-ai-assisted-content-platform-that-champions-creative-talent'
        },
        {
          date: '2022',
          event: 'Company founded by Dan Debnam, Jen Timothy, and Joe Tompkinson',
          source_url: 'https://www.conturae.com/about'
        }
      ],
      buying_signals_detected: [
        {
          type: 'product_innovation',
          detail: 'Launched AI-assisted platform in 2023',
          relevance: 'Early adopter of AI + human hybrid approach'
        },
        {
          type: 'market_positioning',
          detail: 'Focused on quality over pure automation',
          relevance: 'Values authentic, on-brand content - good fit for premium tools'
        }
      ],
      company_milestones: [
        { year: '2022', milestone: 'Company founded in Devon, UK' },
        { year: '2023', milestone: 'Launched AI-assisted content platform' },
        { year: '2023', milestone: 'Expanded writer network across UK and US' }
      ],
      differentiators: [
        'Hybrid AI + human expert approach',
        'No empty AI content - quality guarantee',
        'UK-based with international writer network',
        'Transparent, flexible pricing',
        'Champions creative talent while leveraging AI efficiency'
      ],
      market_trends: [
        'Growing demand for authentic AI-assisted content',
        'Shift from pure AI to hybrid human + AI approaches',
        'Increased focus on SEO and content ROI',
        'Rise of ethical AI content creation'
      ],
      leadership_backgrounds: {
        'Dan Debnam': 'Former digital agency founder (age 19), Head of Marketing at European Direct Selling company, 15+ years marketing experience, managed brands like Barclaycard and Hilton',
        'Jen Timothy': 'Operations Director with background in operational excellence',
        'Joe Tompkinson': 'Co-Founder'
      }
    };
  }

  // Default: Generic SaaS company
  return {
    company_name: companyName,
    tagline: 'Modern business automation platform',
    description: 'Cloud-based platform helping teams automate workflows and improve productivity',
    industry: 'B2B SaaS - Productivity',
    employee_count: '25-50',
    products: [
      { name: 'Workflow Automation', description: 'No-code automation builder' },
      { name: 'Team Collaboration', description: 'Real-time team workspace' }
    ],
    value_propositions: [
      'Automated workflows',
      'Improved team productivity',
      'Easy integration'
    ],
    competitors: [
      { name: 'Zapier', domain: 'zapier.com' },
      { name: 'Make', domain: 'make.com' }
    ],
    target_market: 'SMB and mid-market companies',
    customer_types: ['Startups', 'Small businesses'],
    key_features: ['Workflow automation', 'Team collaboration', 'Integrations'],
    key_people: [
      { name: 'Alex Johnson', title: 'CEO' },
      { name: 'Sam Lee', title: 'CTO' }
    ],
    founded_year: '2021',
    headquarters: 'San Francisco, CA',
    company_type: 'Private (Startup)',
    funding_status: 'Seed',
    funding_rounds: [
      {
        round: 'Seed',
        amount: '$3M',
        date: '2022-03',
        investors: ['Sequoia Capital', 'Andreessen Horowitz']
      }
    ],
    investors: ['Sequoia Capital', 'Andreessen Horowitz'],
    valuation: 'Not disclosed',
    review_ratings: [
      {
        platform: 'G2',
        rating: 4.5,
        count: 89,
        summary: 'Users appreciate the ease of use'
      }
    ],
    awards: [],
    recent_news: [
      {
        date: '2023-09',
        event: 'Launched new automation features',
        source_url: 'https://...'
      }
    ],
    buying_signals_detected: [
      {
        type: 'hiring',
        detail: 'Hiring sales team',
        relevance: 'Growth mode'
      }
    ],
    company_milestones: [
      { year: '2021', milestone: 'Company founded' },
      { year: '2022', milestone: 'Raised seed funding' }
    ],
    differentiators: ['Easy to use', 'Fast setup', 'Great support'],
    market_trends: ['Growing automation market'],
    leadership_backgrounds: {
      'Alex Johnson': 'Former PM at Google',
      'Sam Lee': 'Former Engineer at Facebook'
    }
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractCompanyName(domain: string): string {
  // Remove TLD and capitalize
  const name = domain
    .replace(/\.(com|io|ai|co|net|org|app)$/, '')
    .replace(/[^a-z0-9]/gi, ' ')
    .trim();

  return name.charAt(0).toUpperCase() + name.slice(1);
}

function calculateStats(data: any): any {
  const fields = [
    'company_name', 'tagline', 'description', 'industry', 'employee_count',
    'products', 'value_propositions', 'competitors', 'target_market',
    'customer_types', 'key_features', 'key_people',
    'founded_year', 'headquarters', 'funding_status', 'funding_rounds',
    'investors', 'review_ratings', 'recent_news', 'buying_signals_detected',
    'company_milestones', 'differentiators', 'market_trends', 'leadership_backgrounds'
  ];

  let populated = 0;

  for (const field of fields) {
    const value = data[field];
    if (value !== undefined && value !== null) {
      if (Array.isArray(value) && value.length > 0) {
        populated++;
      } else if (typeof value === 'object' && Object.keys(value).length > 0) {
        populated++;
      } else if (typeof value === 'string' && value.length > 0) {
        populated++;
      } else if (typeof value === 'number') {
        populated++;
      }
    }
  }

  return {
    fieldsPopulated: populated,
    totalFields: fields.length,
    completeness: Math.round((populated / fields.length) * 100)
  };
}
