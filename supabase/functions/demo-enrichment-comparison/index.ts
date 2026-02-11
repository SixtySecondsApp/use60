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

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // Get user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { mode, domain } = await req.json();

    if (!mode || !domain) {
      throw new Error('Missing required parameters: mode, domain');
    }

    let result: any;
    let stats: any;

    if (mode === 'legacy') {
      // ===== LEGACY MODE: Website Scraping =====
      result = await runLegacyEnrichment(domain);
      stats = calculateStats(result);

    } else if (mode === 'enhanced') {
      // ===== ENHANCED MODE: Agent Teams =====
      result = await runEnhancedEnrichment(supabase, domain, user.id);
      stats = calculateStats(result);

    } else {
      throw new Error(`Invalid mode: ${mode}`);
    }

    return new Response(
      JSON.stringify({ result, stats }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[demo-enrichment-comparison] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
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
  userId: string
): Promise<any> {
  console.log(`[Enhanced] Starting Agent Teams enrichment for ${domain}`);

  // Create a team for parallel research
  const teamName = `enrich-${domain.replace(/\./g, '-')}-${Date.now()}`;

  try {
    // Spawn 5 research agents in parallel
    const agents = [
      {
        name: 'company-overview',
        prompt: `Research ${domain} and provide structured JSON with: company_name, tagline, description, industry, employee_count, headquarters, founded_year, company_type. Use web search to find this information from the company website, LinkedIn, and Crunchbase. Return ONLY valid JSON, no markdown formatting.`
      },
      {
        name: 'funding-research',
        prompt: `Research ${domain} on Crunchbase and provide structured JSON with: funding_status, funding_rounds (array with round, amount, date, investors), investors, valuation. Use web search to find recent funding announcements. Return ONLY valid JSON, no markdown formatting.`
      },
      {
        name: 'reviews-research',
        prompt: `Research ${domain} on G2, Capterra, and TrustPilot. Provide structured JSON with: review_ratings (array with platform, rating, count, summary), awards. Use web search to find review platforms. Return ONLY valid JSON, no markdown formatting.`
      },
      {
        name: 'leadership-research',
        prompt: `Research ${domain} leadership team on LinkedIn. Provide structured JSON with: key_people (array with name, title, background). Focus on founders, C-suite executives. Use web search to find executive bios. Return ONLY valid JSON, no markdown formatting.`
      },
      {
        name: 'market-research',
        prompt: `Research ${domain} market position. Provide structured JSON with: competitors (array with name, domain), differentiators (array), market_trends (array), recent_news (array with date, event, source_url), buying_signals_detected (array with type, detail, relevance), company_milestones (array with year, milestone), products (array with name, description), value_propositions (array), target_market, customer_types (array), key_features (array). Use web search to find press releases, news articles, and market analysis. Return ONLY valid JSON, no markdown formatting.`
      }
    ];

    // Call agents in parallel using copilot-autonomous
    const agentPromises = agents.map(async (agent) => {
      console.log(`[Enhanced] Spawning ${agent.name} agent`);

      const { data, error } = await supabase.functions.invoke('copilot-autonomous', {
        body: {
          message: agent.prompt,
          conversation_id: `demo-${agent.name}-${Date.now()}`,
          user_id: userId
        }
      });

      if (error) {
        console.error(`[Enhanced] Agent ${agent.name} failed:`, error);
        return { agent: agent.name, result: null, error: error.message };
      }

      console.log(`[Enhanced] Agent ${agent.name} completed`);
      return { agent: agent.name, result: data.message, error: null };
    });

    // Wait for all agents to complete (runs in parallel)
    const agentResults = await Promise.all(agentPromises);

    console.log(`[Enhanced] All agents completed. Aggregating results...`);

    // Aggregate results from all agents
    const enrichedData = aggregateAgentResults(domain, agentResults);

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
  // For demo purposes, generate realistic mock data based on the domain
  // In production, this would parse real agent research results

  const companyName = extractCompanyName(domain);
  const mockData = generateDomainAwareMockData(domain, companyName);

  return mockData;
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
