/**
 * useMockAgentRace
 *
 * Client-side simulation hook that drives fake SSE-like events for the
 * multi-agent demo page. Produces the same interface shape as useCopilotChat
 * so the RacePanel can swap between live and mock mode seamlessly.
 */

import { useState, useCallback, useRef } from 'react';
import type { MockAgentState, TimelineEntry } from '@/components/platform/demo/types';

// =============================================================================
// Scenario Data — Research + Sales workflows
// =============================================================================

interface MockScenarioData {
  singleAgent: {
    tools: { name: string; delayMs: number }[];
    response: string;
  };
  multiAgent: {
    agents: {
      name: string;
      displayName: string;
      icon: string;
      color: string;
      reason: string;
      tools: { name: string; delayMs: number }[];
      delayBeforeStart: number;
    }[];
    response: string;
  };
}

const SCENARIO_DATA: Record<string, MockScenarioData> = {
  // =========================================================================
  // Company Deep Dive — 4 agents, full intel report
  // Single-agent: 16 sequential tools (~14s)
  // Multi-agent: 4 parallel agents (~3s)
  // =========================================================================
  'company-deep-dive': {
    singleAgent: {
      tools: [
        { name: 'search_web', delayMs: 900 },
        { name: 'scrape_website', delayMs: 800 },
        { name: 'extract_company_info', delayMs: 700 },
        { name: 'search_crunchbase', delayMs: 900 },
        { name: 'get_funding_history', delayMs: 800 },
        { name: 'detect_tech_stack', delayMs: 1100 },
        { name: 'search_linkedin', delayMs: 900 },
        { name: 'get_leadership_team', delayMs: 800 },
        { name: 'search_news', delayMs: 700 },
        { name: 'search_news', delayMs: 700 },
        { name: 'search_competitors', delayMs: 900 },
        { name: 'get_g2_reviews', delayMs: 800 },
        { name: 'get_glassdoor_data', delayMs: 700 },
        { name: 'search_job_postings', delayMs: 600 },
        { name: 'get_social_presence', delayMs: 500 },
        { name: 'compile_report', delayMs: 800 },
      ],
      response:
        'Company report complete (16 tool calls). Stripe: $95B valuation, 8,000+ employees, Series I ($6.5B, 2023). Tech stack: Ruby, React, Go, AWS. Leadership: Patrick Collison (CEO), John Collison (President), David Singleton (CTO). Competitors: Adyen, Square, Braintree. Recent news: Launched Stripe Billing v3, expanded to 5 new markets. 4.5★ on G2 (2,800 reviews). Hiring heavily in ML and platform engineering.',
    },
    multiAgent: {
      agents: [
        {
          name: 'overview',
          displayName: 'Company Overview',
          icon: 'Building2',
          color: 'blue',
          reason: 'Pulling company basics, funding, and financials',
          tools: [
            { name: 'search_web', delayMs: 400 },
            { name: 'scrape_website', delayMs: 350 },
            { name: 'extract_company_info', delayMs: 300 },
            { name: 'search_crunchbase', delayMs: 400 },
            { name: 'get_funding_history', delayMs: 350 },
          ],
          delayBeforeStart: 50,
        },
        {
          name: 'tech_stack',
          displayName: 'Tech Stack Analyst',
          icon: 'Search',
          color: 'emerald',
          reason: 'Detecting tech stack and infrastructure',
          tools: [
            { name: 'detect_tech_stack', delayMs: 500 },
            { name: 'search_job_postings', delayMs: 350 },
            { name: 'get_social_presence', delayMs: 250 },
          ],
          delayBeforeStart: 50,
        },
        {
          name: 'people',
          displayName: 'People Intelligence',
          icon: 'Users',
          color: 'purple',
          reason: 'Mapping leadership team and org structure',
          tools: [
            { name: 'search_linkedin', delayMs: 400 },
            { name: 'get_leadership_team', delayMs: 350 },
            { name: 'get_glassdoor_data', delayMs: 300 },
          ],
          delayBeforeStart: 50,
        },
        {
          name: 'news',
          displayName: 'News & Market Intel',
          icon: 'Globe',
          color: 'amber',
          reason: 'Scanning recent news and competitive landscape',
          tools: [
            { name: 'search_news', delayMs: 350 },
            { name: 'search_news', delayMs: 300 },
            { name: 'search_competitors', delayMs: 400 },
            { name: 'get_g2_reviews', delayMs: 350 },
          ],
          delayBeforeStart: 50,
        },
      ],
      response:
        'Company deep dive done — 4 agents in parallel. Stripe: $95B valuation, 8,000+ employees, Series I ($6.5B). Stack: Ruby, React, Go, AWS. Leadership mapped (Patrick Collison CEO, John Collison President, David Singleton CTO). Competitors: Adyen, Square, Braintree. Recent: Billing v3 launch, 5 new markets. 4.5★ G2 (2,800 reviews). Hiring signal: ML + platform eng.',
    },
  },

  // =========================================================================
  // Prospect List Enrichment — 4 agents, bulk enrichment
  // Single-agent: 20 sequential tools (~18s)
  // Multi-agent: 4 parallel agents (~3.5s)
  // =========================================================================
  'prospect-list-enrich': {
    singleAgent: {
      tools: [
        { name: 'lookup_company', delayMs: 800 },
        { name: 'lookup_company', delayMs: 800 },
        { name: 'lookup_company', delayMs: 800 },
        { name: 'lookup_company', delayMs: 800 },
        { name: 'lookup_company', delayMs: 800 },
        { name: 'get_employee_count', delayMs: 600 },
        { name: 'get_employee_count', delayMs: 600 },
        { name: 'get_employee_count', delayMs: 600 },
        { name: 'get_employee_count', delayMs: 600 },
        { name: 'get_employee_count', delayMs: 600 },
        { name: 'find_decision_maker', delayMs: 900 },
        { name: 'find_decision_maker', delayMs: 900 },
        { name: 'find_decision_maker', delayMs: 900 },
        { name: 'find_decision_maker', delayMs: 900 },
        { name: 'find_decision_maker', delayMs: 900 },
        { name: 'detect_tech_stack', delayMs: 1100 },
        { name: 'detect_tech_stack', delayMs: 1100 },
        { name: 'detect_tech_stack', delayMs: 1100 },
        { name: 'score_icp_fit', delayMs: 700 },
        { name: 'compile_table', delayMs: 600 },
      ],
      response:
        'Enrichment complete (20 tool calls). 10 companies enriched: Notion (400 emp, Series C, $10B), Linear (80 emp, Series B, $400M), Vercel (300 emp, Series D, $2.5B), Supabase (100 emp, Series B, $116M), Resend (25 emp, Seed, $6M), Cal.com (35 emp, Series A, $30M), Dub.co (8 emp, Seed, $2M), Trigger.dev (15 emp, Seed, $3M), Inngest (20 emp, Series A, $12M), Neon (80 emp, Series B, $104M). Decision-makers found for all 10. ICP scores: 4 strong, 4 moderate, 2 early-stage.',
    },
    multiAgent: {
      agents: [
        {
          name: 'firmographics',
          displayName: 'Firmographics',
          icon: 'Building2',
          color: 'blue',
          reason: 'Pulling company basics and employee counts',
          tools: [
            { name: 'lookup_company', delayMs: 300 },
            { name: 'lookup_company', delayMs: 300 },
            { name: 'lookup_company', delayMs: 300 },
            { name: 'lookup_company', delayMs: 300 },
            { name: 'lookup_company', delayMs: 300 },
            { name: 'get_employee_count', delayMs: 250 },
            { name: 'get_employee_count', delayMs: 250 },
            { name: 'get_employee_count', delayMs: 250 },
          ],
          delayBeforeStart: 50,
        },
        {
          name: 'contacts',
          displayName: 'Contact Finder',
          icon: 'Users',
          color: 'rose',
          reason: 'Finding decision-makers at each company',
          tools: [
            { name: 'find_decision_maker', delayMs: 350 },
            { name: 'find_decision_maker', delayMs: 350 },
            { name: 'find_decision_maker', delayMs: 350 },
            { name: 'find_decision_maker', delayMs: 350 },
            { name: 'find_decision_maker', delayMs: 350 },
          ],
          delayBeforeStart: 50,
        },
        {
          name: 'tech_intel',
          displayName: 'Tech Intel',
          icon: 'Search',
          color: 'emerald',
          reason: 'Detecting tech stacks across all 10 companies',
          tools: [
            { name: 'detect_tech_stack', delayMs: 400 },
            { name: 'detect_tech_stack', delayMs: 400 },
            { name: 'detect_tech_stack', delayMs: 400 },
          ],
          delayBeforeStart: 50,
        },
        {
          name: 'scoring',
          displayName: 'ICP Scoring',
          icon: 'Target',
          color: 'orange',
          reason: 'Scoring ICP fit and compiling enriched table',
          tools: [
            { name: 'score_icp_fit', delayMs: 350 },
            { name: 'compile_table', delayMs: 300 },
          ],
          delayBeforeStart: 100,
        },
      ],
      response:
        'Bulk enrichment done — 4 agents in parallel. 10 companies: Notion ($10B, 400), Linear ($400M, 80), Vercel ($2.5B, 300), Supabase ($116M, 100), Resend ($6M, 25), Cal.com ($30M, 35), Dub.co ($2M, 8), Trigger.dev ($3M, 15), Inngest ($12M, 20), Neon ($104M, 80). All decision-makers found. ICP: 4 strong, 4 moderate, 2 early-stage.',
    },
  },

  // =========================================================================
  // Competitive Intelligence — 4 agents, battlecard
  // Single-agent: 16 sequential tools (~15s)
  // Multi-agent: 4 parallel agents (~3s)
  // =========================================================================
  'competitive-intel': {
    singleAgent: {
      tools: [
        { name: 'search_features', delayMs: 900 },
        { name: 'search_features', delayMs: 900 },
        { name: 'search_features', delayMs: 900 },
        { name: 'search_features', delayMs: 900 },
        { name: 'get_pricing_page', delayMs: 800 },
        { name: 'get_pricing_page', delayMs: 800 },
        { name: 'get_pricing_page', delayMs: 800 },
        { name: 'get_pricing_page', delayMs: 800 },
        { name: 'get_g2_reviews', delayMs: 700 },
        { name: 'get_g2_reviews', delayMs: 700 },
        { name: 'get_g2_reviews', delayMs: 700 },
        { name: 'get_g2_reviews', delayMs: 700 },
        { name: 'analyze_positioning', delayMs: 900 },
        { name: 'search_win_loss', delayMs: 800 },
        { name: 'search_news', delayMs: 700 },
        { name: 'compile_battlecard', delayMs: 900 },
      ],
      response:
        'Battlecard built (16 tool calls). HubSpot: best free tier but expensive at scale, 4.4★ G2. Salesforce: most enterprise features but complex/slow, 4.3★ G2. Pipedrive: clean UX, weak reporting, 4.2★ G2. Close: great for calling teams, limited integrations, 4.7★ G2. Common win reasons: our AI copilot, speed of setup, meeting intelligence. Common losses: enterprise compliance (vs Salesforce), free tier (vs HubSpot).',
    },
    multiAgent: {
      agents: [
        {
          name: 'features',
          displayName: 'Feature Comparison',
          icon: 'BarChart3',
          color: 'blue',
          reason: 'Comparing features across all 4 competitors',
          tools: [
            { name: 'search_features', delayMs: 400 },
            { name: 'search_features', delayMs: 400 },
            { name: 'search_features', delayMs: 400 },
            { name: 'search_features', delayMs: 400 },
          ],
          delayBeforeStart: 50,
        },
        {
          name: 'pricing',
          displayName: 'Pricing Analyst',
          icon: 'Search',
          color: 'emerald',
          reason: 'Pulling pricing pages and plan breakdowns',
          tools: [
            { name: 'get_pricing_page', delayMs: 350 },
            { name: 'get_pricing_page', delayMs: 350 },
            { name: 'get_pricing_page', delayMs: 350 },
            { name: 'get_pricing_page', delayMs: 350 },
          ],
          delayBeforeStart: 50,
        },
        {
          name: 'reviews',
          displayName: 'Review Analyst',
          icon: 'Target',
          color: 'amber',
          reason: 'Pulling G2 reviews and win/loss patterns',
          tools: [
            { name: 'get_g2_reviews', delayMs: 300 },
            { name: 'get_g2_reviews', delayMs: 300 },
            { name: 'get_g2_reviews', delayMs: 300 },
            { name: 'get_g2_reviews', delayMs: 300 },
            { name: 'search_win_loss', delayMs: 350 },
          ],
          delayBeforeStart: 50,
        },
        {
          name: 'positioning',
          displayName: 'Market Positioning',
          icon: 'Globe',
          color: 'purple',
          reason: 'Analyzing market positioning and recent moves',
          tools: [
            { name: 'analyze_positioning', delayMs: 400 },
            { name: 'search_news', delayMs: 300 },
            { name: 'compile_battlecard', delayMs: 350 },
          ],
          delayBeforeStart: 50,
        },
      ],
      response:
        'Battlecard ready — 4 agents in parallel. HubSpot: best free tier, expensive at scale (4.4★). Salesforce: most features, complex/slow (4.3★). Pipedrive: clean UX, weak reporting (4.2★). Close: great calling, limited integrations (4.7★). Our wins: AI copilot, fast setup, meeting intelligence. Our losses: enterprise compliance, free tier gap.',
    },
  },

  // =========================================================================
  // Account Mapping — 4 agents, org chart + signals
  // Single-agent: 14 sequential tools (~13s)
  // Multi-agent: 4 parallel agents (~2.5s)
  // =========================================================================
  'account-mapping': {
    singleAgent: {
      tools: [
        { name: 'search_company', delayMs: 800 },
        { name: 'get_org_chart', delayMs: 1100 },
        { name: 'search_linkedin', delayMs: 900 },
        { name: 'search_linkedin', delayMs: 900 },
        { name: 'search_linkedin', delayMs: 900 },
        { name: 'search_linkedin', delayMs: 900 },
        { name: 'get_mutual_connections', delayMs: 800 },
        { name: 'get_reporting_lines', delayMs: 700 },
        { name: 'search_job_postings', delayMs: 800 },
        { name: 'search_job_postings', delayMs: 800 },
        { name: 'detect_hiring_signals', delayMs: 700 },
        { name: 'search_news', delayMs: 600 },
        { name: 'get_buying_signals', delayMs: 700 },
        { name: 'compile_account_map', delayMs: 800 },
      ],
      response:
        'Account mapped (14 tool calls). Datadog org chart: Olivier Pomel (CEO), Adam Blitzer (COO/CRO — reports to CEO), VP Sales: Maria Santos (hired 6 months ago from Splunk), Head of RevOps: James Park (2 years, promoted internally), CRO reports to CEO. Recent hires: 3 AEs, 1 Sales Engineer — signals expansion. Mutual connections: 2 via Splunk alumni network. Best path in: warm intro via Maria Santos (Splunk connection) or James Park (attends SaaStr events).',
    },
    multiAgent: {
      agents: [
        {
          name: 'org_chart',
          displayName: 'Org Chart',
          icon: 'Building2',
          color: 'blue',
          reason: 'Mapping org structure and reporting lines',
          tools: [
            { name: 'search_company', delayMs: 350 },
            { name: 'get_org_chart', delayMs: 450 },
            { name: 'get_reporting_lines', delayMs: 300 },
          ],
          delayBeforeStart: 50,
        },
        {
          name: 'linkedin',
          displayName: 'LinkedIn Intel',
          icon: 'Users',
          color: 'purple',
          reason: 'Finding key people and mutual connections',
          tools: [
            { name: 'search_linkedin', delayMs: 350 },
            { name: 'search_linkedin', delayMs: 350 },
            { name: 'search_linkedin', delayMs: 350 },
            { name: 'search_linkedin', delayMs: 350 },
            { name: 'get_mutual_connections', delayMs: 300 },
          ],
          delayBeforeStart: 50,
        },
        {
          name: 'hiring',
          displayName: 'Hiring Signals',
          icon: 'Target',
          color: 'rose',
          reason: 'Scanning job postings for expansion signals',
          tools: [
            { name: 'search_job_postings', delayMs: 350 },
            { name: 'search_job_postings', delayMs: 350 },
            { name: 'detect_hiring_signals', delayMs: 300 },
          ],
          delayBeforeStart: 50,
        },
        {
          name: 'signals',
          displayName: 'Buying Signals',
          icon: 'Search',
          color: 'emerald',
          reason: 'Detecting buying signals and recent news',
          tools: [
            { name: 'search_news', delayMs: 300 },
            { name: 'get_buying_signals', delayMs: 350 },
          ],
          delayBeforeStart: 50,
        },
      ],
      response:
        'Account mapped — 4 agents in parallel. Datadog: Olivier Pomel (CEO), Adam Blitzer (COO/CRO), Maria Santos (VP Sales, ex-Splunk, 6mo), James Park (Head RevOps, 2yr). 3 new AEs + 1 SE hired — expansion signal. 2 mutual connections via Splunk alumni. Best path: warm intro via Maria (Splunk) or James (SaaStr network).',
    },
  },

  // =========================================================================
  // Market Landscape Scan — 4 agents, segment analysis
  // Single-agent: 18 sequential tools (~16s)
  // Multi-agent: 4 parallel agents (~3s)
  // =========================================================================
  'market-scan': {
    singleAgent: {
      tools: [
        { name: 'search_market', delayMs: 1000 },
        { name: 'search_market', delayMs: 1000 },
        { name: 'search_crunchbase', delayMs: 900 },
        { name: 'search_crunchbase', delayMs: 900 },
        { name: 'search_crunchbase', delayMs: 900 },
        { name: 'get_funding_data', delayMs: 800 },
        { name: 'get_funding_data', delayMs: 800 },
        { name: 'get_funding_data', delayMs: 800 },
        { name: 'get_funding_data', delayMs: 800 },
        { name: 'get_employee_growth', delayMs: 700 },
        { name: 'get_employee_growth', delayMs: 700 },
        { name: 'get_employee_growth', delayMs: 700 },
        { name: 'get_employee_growth', delayMs: 700 },
        { name: 'get_employee_growth', delayMs: 700 },
        { name: 'categorize_stage', delayMs: 600 },
        { name: 'rank_growth', delayMs: 700 },
        { name: 'search_news', delayMs: 600 },
        { name: 'compile_landscape', delayMs: 800 },
      ],
      response:
        'Market scan complete (18 tool calls). 20 AI sales tools identified. By stage: 4 Series C+ (Gong, Clari, Outreach, Salesloft), 6 Series A-B (Apollo, Lavender, Regie.ai, Orum, Nooks, Warmly), 10 Seed/Early (Tome, 11x, AiSDR, Artisan, Reggie, plus 5 more). Fastest growing: 11x (+340% headcount), Nooks (+180%), Warmly (+120%). Recent mega-rounds: Gong ($252M Series E), Clari ($225M Series F). Trending: autonomous SDR agents, real-time buyer intent, AI call coaching.',
    },
    multiAgent: {
      agents: [
        {
          name: 'discovery',
          displayName: 'Company Discovery',
          icon: 'Search',
          color: 'blue',
          reason: 'Finding 20 companies in AI sales tools space',
          tools: [
            { name: 'search_market', delayMs: 450 },
            { name: 'search_market', delayMs: 400 },
            { name: 'search_crunchbase', delayMs: 350 },
            { name: 'search_crunchbase', delayMs: 350 },
            { name: 'search_crunchbase', delayMs: 350 },
          ],
          delayBeforeStart: 50,
        },
        {
          name: 'funding',
          displayName: 'Funding Analyst',
          icon: 'BarChart3',
          color: 'emerald',
          reason: 'Pulling funding rounds and valuations',
          tools: [
            { name: 'get_funding_data', delayMs: 350 },
            { name: 'get_funding_data', delayMs: 350 },
            { name: 'get_funding_data', delayMs: 350 },
            { name: 'get_funding_data', delayMs: 350 },
            { name: 'categorize_stage', delayMs: 300 },
          ],
          delayBeforeStart: 50,
        },
        {
          name: 'growth',
          displayName: 'Growth Tracker',
          icon: 'Target',
          color: 'amber',
          reason: 'Measuring employee growth and momentum',
          tools: [
            { name: 'get_employee_growth', delayMs: 300 },
            { name: 'get_employee_growth', delayMs: 300 },
            { name: 'get_employee_growth', delayMs: 300 },
            { name: 'get_employee_growth', delayMs: 300 },
            { name: 'get_employee_growth', delayMs: 300 },
            { name: 'rank_growth', delayMs: 300 },
          ],
          delayBeforeStart: 50,
        },
        {
          name: 'ranking',
          displayName: 'Market Ranking',
          icon: 'Globe',
          color: 'orange',
          reason: 'Ranking companies and spotting trends',
          tools: [
            { name: 'search_news', delayMs: 300 },
            { name: 'compile_landscape', delayMs: 350 },
          ],
          delayBeforeStart: 100,
        },
      ],
      response:
        'Market scan done — 4 agents in parallel. 20 AI sales tools: 4 Series C+ (Gong, Clari, Outreach, Salesloft), 6 Series A-B (Apollo, Lavender, Regie.ai, Orum, Nooks, Warmly), 10 Seed/Early. Fastest: 11x (+340%), Nooks (+180%), Warmly (+120%). Trends: autonomous SDR agents, real-time intent, AI coaching.',
    },
  },

  // =========================================================================
  // Pre-Call Research — 4 agents, instant meeting prep
  // Single-agent: 14 sequential tools (~12s)
  // Multi-agent: 4 parallel agents (~2.5s)
  // =========================================================================
  'pre-call-research': {
    singleAgent: {
      tools: [
        { name: 'search_web', delayMs: 800 },
        { name: 'scrape_website', delayMs: 700 },
        { name: 'get_company_news', delayMs: 800 },
        { name: 'search_crunchbase', delayMs: 800 },
        { name: 'search_linkedin', delayMs: 900 },
        { name: 'get_career_history', delayMs: 700 },
        { name: 'get_mutual_connections', delayMs: 600 },
        { name: 'search_twitter', delayMs: 600 },
        { name: 'detect_tech_stack', delayMs: 900 },
        { name: 'get_buying_signals', delayMs: 700 },
        { name: 'search_news', delayMs: 600 },
        { name: 'get_recent_content', delayMs: 600 },
        { name: 'generate_talking_points', delayMs: 800 },
        { name: 'predict_objections', delayMs: 700 },
      ],
      response:
        'Call prep ready (14 tool calls). Sarah Chen, VP Marketing at Notion (3 years, prev. Head of Growth at Figma). Notion: 400 employees, $10B valuation, recently launched Notion AI and Notion Calendar. Tech stack: React, Node.js, PostgreSQL. She recently posted about "scaling demand gen with AI" on LinkedIn. Talking points: (1) Reference her demand gen AI post — we automate the same workflows, (2) Notion Calendar launch = they care about meeting productivity, (3) Ask about their sales-marketing handoff. Watch for: budget cycle (Q1 planning likely done), build-vs-buy objection (they\'re an eng-heavy org).',
    },
    multiAgent: {
      agents: [
        {
          name: 'company',
          displayName: 'Company Intel',
          icon: 'Building2',
          color: 'blue',
          reason: 'Pulling Notion company overview and news',
          tools: [
            { name: 'search_web', delayMs: 350 },
            { name: 'scrape_website', delayMs: 300 },
            { name: 'get_company_news', delayMs: 350 },
            { name: 'search_crunchbase', delayMs: 350 },
          ],
          delayBeforeStart: 50,
        },
        {
          name: 'contact',
          displayName: 'Contact Profile',
          icon: 'Users',
          color: 'purple',
          reason: 'Researching Sarah Chen\'s background',
          tools: [
            { name: 'search_linkedin', delayMs: 400 },
            { name: 'get_career_history', delayMs: 300 },
            { name: 'get_mutual_connections', delayMs: 250 },
            { name: 'search_twitter', delayMs: 250 },
          ],
          delayBeforeStart: 50,
        },
        {
          name: 'signals',
          displayName: 'Signal Detection',
          icon: 'Search',
          color: 'emerald',
          reason: 'Finding tech stack and buying signals',
          tools: [
            { name: 'detect_tech_stack', delayMs: 400 },
            { name: 'get_buying_signals', delayMs: 300 },
            { name: 'search_news', delayMs: 250 },
            { name: 'get_recent_content', delayMs: 250 },
          ],
          delayBeforeStart: 50,
        },
        {
          name: 'prep',
          displayName: 'Call Prep',
          icon: 'Calendar',
          color: 'amber',
          reason: 'Generating talking points and objection prep',
          tools: [
            { name: 'generate_talking_points', delayMs: 350 },
            { name: 'predict_objections', delayMs: 300 },
          ],
          delayBeforeStart: 100,
        },
      ],
      response:
        'Call prep ready — 4 agents in parallel. Sarah Chen: VP Marketing at Notion (3yr, ex-Figma). Notion: 400 emp, $10B, launched Notion AI + Calendar. She posted about "scaling demand gen with AI." Talking points: (1) AI demand gen angle, (2) Calendar = meeting productivity, (3) sales-marketing handoff. Watch: Q1 budget cycle, build-vs-buy objection.',
    },
  },

  // =========================================================================
  // SALES SCENARIOS — SMB sales workflows (longer, high-volume processes)
  // =========================================================================

  // Weekly Pipeline Cleanup — 4 agents
  // Single-agent: 24 sequential tools (~28s) | Multi-agent: 4 parallel (~7s)
  'weekly-pipeline-cleanup': {
    singleAgent: {
      tools: [
        { name: 'get_pipeline_deals', delayMs: 1300 },
        { name: 'get_pipeline_summary', delayMs: 1100 },
        { name: 'get_contacts_needing_attention', delayMs: 1000 },
        { name: 'get_deal', delayMs: 800 },
        { name: 'get_deal', delayMs: 800 },
        { name: 'get_deal', delayMs: 800 },
        { name: 'get_deal', delayMs: 800 },
        { name: 'get_deal', delayMs: 800 },
        { name: 'get_deal', delayMs: 800 },
        { name: 'get_deal', delayMs: 800 },
        { name: 'enrich_company', delayMs: 1400 },
        { name: 'enrich_company', delayMs: 1400 },
        { name: 'search_emails', delayMs: 900 },
        { name: 'search_emails', delayMs: 900 },
        { name: 'draft_email', delayMs: 1300 },
        { name: 'draft_email', delayMs: 1300 },
        { name: 'draft_email', delayMs: 1300 },
        { name: 'draft_email', delayMs: 1300 },
        { name: 'update_crm', delayMs: 600 },
        { name: 'update_crm', delayMs: 600 },
        { name: 'update_crm', delayMs: 600 },
        { name: 'create_task', delayMs: 500 },
        { name: 'create_task', delayMs: 500 },
        { name: 'create_task', delayMs: 500 },
      ],
      response: 'Pipeline audit done (24 tool calls). 32 active deals reviewed — 7 flagged stale (no activity 14+ days). Biggest risk: BrightPath Media ($42k) went dark after the proposal. GreenLeaf Co ($28k) contact left the company — enriched replacement. 4 nudge emails drafted for stuck deals. 3 deal stages updated to match reality. 3 follow-up tasks created for next week.',
    },
    multiAgent: {
      agents: [
        {
          name: 'pipeline', displayName: 'Pipeline Manager', icon: 'BarChart3', color: 'blue',
          reason: 'Auditing 32 deals and flagging stale activity',
          tools: [
            { name: 'get_pipeline_deals', delayMs: 800 }, { name: 'get_pipeline_summary', delayMs: 700 },
            { name: 'get_contacts_needing_attention', delayMs: 600 },
            { name: 'get_deal', delayMs: 400 }, { name: 'get_deal', delayMs: 400 },
            { name: 'get_deal', delayMs: 400 }, { name: 'get_deal', delayMs: 400 },
          ],
          delayBeforeStart: 100,
        },
        {
          name: 'research', displayName: 'Research & Enrichment', icon: 'Search', color: 'emerald',
          reason: 'Checking for contact and company changes',
          tools: [
            { name: 'enrich_company', delayMs: 900 }, { name: 'enrich_company', delayMs: 900 },
            { name: 'search_emails', delayMs: 600 }, { name: 'search_emails', delayMs: 600 },
          ],
          delayBeforeStart: 200,
        },
        {
          name: 'outreach', displayName: 'Outreach & Follow-up', icon: 'Mail', color: 'purple',
          reason: 'Drafting nudge emails for 4 stuck deals',
          tools: [
            { name: 'draft_email', delayMs: 900 }, { name: 'draft_email', delayMs: 900 },
            { name: 'draft_email', delayMs: 900 }, { name: 'draft_email', delayMs: 900 },
          ],
          delayBeforeStart: 300,
        },
        {
          name: 'crm_ops', displayName: 'CRM Operations', icon: 'Database', color: 'orange',
          reason: 'Updating 3 stages and creating tasks for next week',
          tools: [
            { name: 'update_crm', delayMs: 400 }, { name: 'update_crm', delayMs: 400 }, { name: 'update_crm', delayMs: 400 },
            { name: 'create_task', delayMs: 300 }, { name: 'create_task', delayMs: 300 }, { name: 'create_task', delayMs: 300 },
          ],
          delayBeforeStart: 350,
        },
      ],
      response: 'Pipeline cleanup done — 4 agents, 24 tools, all in parallel. 32 deals audited: 7 stale, 3 stages corrected. BrightPath ($42k) flagged critical — dark after proposal. GreenLeaf contact replaced, enriched the new VP. 4 nudge emails ready to send. 3 follow-up tasks queued for Monday.',
    },
  },

  // Inbound Lead Rush — 4 agents
  // Single-agent: 26 sequential tools (~32s) | Multi-agent: 4 parallel (~8s)
  'inbound-lead-rush': {
    singleAgent: {
      tools: [
        { name: 'search_leads_create_table', delayMs: 2200 },
        { name: 'enrich_contact', delayMs: 1400 }, { name: 'enrich_contact', delayMs: 1400 },
        { name: 'enrich_contact', delayMs: 1400 }, { name: 'enrich_contact', delayMs: 1400 },
        { name: 'enrich_contact', delayMs: 1400 },
        { name: 'enrich_company', delayMs: 1300 }, { name: 'enrich_company', delayMs: 1300 },
        { name: 'enrich_company', delayMs: 1300 }, { name: 'enrich_company', delayMs: 1300 },
        { name: 'enrich_company', delayMs: 1300 },
        { name: 'get_company_status', delayMs: 800 }, { name: 'get_company_status', delayMs: 800 },
        { name: 'draft_email', delayMs: 1300 }, { name: 'draft_email', delayMs: 1300 },
        { name: 'draft_email', delayMs: 1300 }, { name: 'draft_email', delayMs: 1300 },
        { name: 'draft_email', delayMs: 1300 }, { name: 'draft_email', delayMs: 1300 },
        { name: 'create_task', delayMs: 500 }, { name: 'create_task', delayMs: 500 },
        { name: 'create_task', delayMs: 500 }, { name: 'create_task', delayMs: 500 },
        { name: 'create_task', delayMs: 500 }, { name: 'create_task', delayMs: 500 },
        { name: 'create_task', delayMs: 500 },
      ],
      response: 'Webinar leads processed (26 tool calls). 14 leads scored: 5 strong ICP fit, 6 moderate, 3 poor fit. Top leads: Axon Digital (CFO attended, 80 employees, using a competitor), PeakOps (VP Marketing, 45 employees), Relay Group (CEO attended, growing fast). All 5 top leads enriched. 6 personalized follow-up emails drafted. 3-touch task cadence created for top 7 leads.',
    },
    multiAgent: {
      agents: [
        {
          name: 'prospecting', displayName: 'Prospecting', icon: 'Target', color: 'rose',
          reason: 'Pulling and scoring 14 webinar leads',
          tools: [
            { name: 'search_leads_create_table', delayMs: 1400 }, { name: 'enrich_table_column', delayMs: 800 },
            { name: 'get_company_status', delayMs: 500 }, { name: 'get_company_status', delayMs: 500 },
          ],
          delayBeforeStart: 100,
        },
        {
          name: 'research', displayName: 'Research & Enrichment', icon: 'Search', color: 'emerald',
          reason: 'Deep-enriching contacts and companies',
          tools: [
            { name: 'enrich_contact', delayMs: 700 }, { name: 'enrich_contact', delayMs: 700 },
            { name: 'enrich_contact', delayMs: 700 }, { name: 'enrich_contact', delayMs: 700 },
            { name: 'enrich_contact', delayMs: 700 },
            { name: 'enrich_company', delayMs: 800 }, { name: 'enrich_company', delayMs: 800 },
            { name: 'enrich_company', delayMs: 800 },
          ],
          delayBeforeStart: 200,
        },
        {
          name: 'outreach', displayName: 'Outreach & Follow-up', icon: 'Mail', color: 'purple',
          reason: 'Writing personalized webinar follow-up emails',
          tools: [
            { name: 'draft_email', delayMs: 800 }, { name: 'draft_email', delayMs: 800 },
            { name: 'draft_email', delayMs: 800 }, { name: 'draft_email', delayMs: 800 },
            { name: 'draft_email', delayMs: 800 }, { name: 'draft_email', delayMs: 800 },
          ],
          delayBeforeStart: 300,
        },
        {
          name: 'crm_ops', displayName: 'CRM Operations', icon: 'Database', color: 'orange',
          reason: 'Building 3-touch task cadences for top leads',
          tools: [
            { name: 'create_task', delayMs: 300 }, { name: 'create_task', delayMs: 300 },
            { name: 'create_task', delayMs: 300 }, { name: 'create_task', delayMs: 300 },
            { name: 'create_task', delayMs: 300 }, { name: 'create_task', delayMs: 300 },
            { name: 'create_task', delayMs: 300 },
          ],
          delayBeforeStart: 400,
        },
      ],
      response: 'Webinar leads handled — 4 agents, 26 tools. 14 leads scored: 5 strong ICP, 6 moderate, 3 poor. Top picks: Axon Digital (CFO, competitor user), PeakOps (VP Marketing), Relay Group (CEO, growing fast). All enriched. 6 personalized emails ready. 3-touch cadence built for top 7.',
    },
  },

  // Monthly Sales Review — 4 agents
  // Single-agent: 22 sequential tools (~26s) | Multi-agent: 4 parallel (~7s)
  'monthly-sales-review': {
    singleAgent: {
      tools: [
        { name: 'get_pipeline_deals', delayMs: 1200 }, { name: 'get_pipeline_forecast', delayMs: 1400 },
        { name: 'get_pipeline_summary', delayMs: 1100 }, { name: 'get_contacts_needing_attention', delayMs: 1000 },
        { name: 'get_meetings_for_period', delayMs: 1100 }, { name: 'get_meeting_count', delayMs: 800 },
        { name: 'get_booking_stats', delayMs: 900 }, { name: 'get_time_breakdown', delayMs: 800 },
        { name: 'get_deal', delayMs: 700 }, { name: 'get_deal', delayMs: 700 },
        { name: 'get_deal', delayMs: 700 }, { name: 'get_deal', delayMs: 700 },
        { name: 'get_deal', delayMs: 700 },
        { name: 'enrich_company', delayMs: 1400 }, { name: 'enrich_company', delayMs: 1400 },
        { name: 'enrich_contact', delayMs: 1300 }, { name: 'enrich_contact', delayMs: 1300 },
        { name: 'search_emails', delayMs: 900 }, { name: 'search_emails', delayMs: 900 },
        { name: 'draft_email', delayMs: 1500 },
        { name: 'create_task', delayMs: 500 }, { name: 'create_task', delayMs: 500 },
      ],
      response: 'Monthly review prep done (22 tool calls). $890k pipeline, $340k weighted forecast, 58% close rate (up from 52%). 23 external meetings, 4.2/week. Top 5 deals checked. Talking points drafted: 2 wins, 3 risks, 1 ask.',
    },
    multiAgent: {
      agents: [
        {
          name: 'pipeline', displayName: 'Pipeline Manager', icon: 'BarChart3', color: 'blue',
          reason: 'Pulling close rates and deal metrics',
          tools: [
            { name: 'get_pipeline_deals', delayMs: 800 }, { name: 'get_pipeline_forecast', delayMs: 900 },
            { name: 'get_pipeline_summary', delayMs: 700 }, { name: 'get_contacts_needing_attention', delayMs: 600 },
            { name: 'get_deal', delayMs: 400 }, { name: 'get_deal', delayMs: 400 },
            { name: 'get_deal', delayMs: 400 }, { name: 'get_deal', delayMs: 400 }, { name: 'get_deal', delayMs: 400 },
          ],
          delayBeforeStart: 100,
        },
        {
          name: 'meetings', displayName: 'Meeting Intelligence', icon: 'Calendar', color: 'amber',
          reason: 'Analyzing monthly meeting activity',
          tools: [
            { name: 'get_meetings_for_period', delayMs: 700 }, { name: 'get_meeting_count', delayMs: 500 },
            { name: 'get_booking_stats', delayMs: 600 }, { name: 'get_time_breakdown', delayMs: 500 },
          ],
          delayBeforeStart: 150,
        },
        {
          name: 'research', displayName: 'Research & Enrichment', icon: 'Search', color: 'emerald',
          reason: 'Checking for changes at top accounts',
          tools: [
            { name: 'enrich_company', delayMs: 800 }, { name: 'enrich_company', delayMs: 800 },
            { name: 'enrich_contact', delayMs: 700 }, { name: 'enrich_contact', delayMs: 700 },
            { name: 'search_emails', delayMs: 500 }, { name: 'search_emails', delayMs: 500 },
          ],
          delayBeforeStart: 200,
        },
        {
          name: 'outreach', displayName: 'Outreach & Follow-up', icon: 'Mail', color: 'purple',
          reason: 'Drafting review talking points',
          tools: [
            { name: 'draft_email', delayMs: 1200 },
            { name: 'create_task', delayMs: 300 }, { name: 'create_task', delayMs: 300 },
          ],
          delayBeforeStart: 300,
        },
      ],
      response: 'Review prep ready — 4 agents. Pipeline: $890k, $340k weighted, 58% close rate. 23 meetings, 4.2/week. Top 5 deals enriched. Talking points: 2 wins, 3 risks, 1 ask.',
    },
  },

  // Cold Outbound Sprint — 4 agents
  // Single-agent: 28 sequential tools (~34s) | Multi-agent: 4 parallel (~8s)
  'cold-outbound-sprint': {
    singleAgent: {
      tools: [
        { name: 'search_leads_create_table', delayMs: 2400 }, { name: 'enrich_table_column', delayMs: 1600 },
        { name: 'enrich_contact', delayMs: 1400 }, { name: 'enrich_contact', delayMs: 1400 },
        { name: 'enrich_contact', delayMs: 1400 }, { name: 'enrich_contact', delayMs: 1400 },
        { name: 'enrich_contact', delayMs: 1400 }, { name: 'enrich_contact', delayMs: 1400 },
        { name: 'enrich_contact', delayMs: 1400 }, { name: 'enrich_contact', delayMs: 1400 },
        { name: 'enrich_company', delayMs: 1300 }, { name: 'enrich_company', delayMs: 1300 },
        { name: 'enrich_company', delayMs: 1300 }, { name: 'enrich_company', delayMs: 1300 },
        { name: 'draft_email', delayMs: 1400 }, { name: 'draft_email', delayMs: 1400 },
        { name: 'draft_email', delayMs: 1400 }, { name: 'draft_email', delayMs: 1400 },
        { name: 'draft_email', delayMs: 1400 }, { name: 'draft_email', delayMs: 1400 },
        { name: 'draft_email', delayMs: 1400 }, { name: 'draft_email', delayMs: 1400 },
        { name: 'create_task', delayMs: 500 }, { name: 'create_task', delayMs: 500 },
        { name: 'create_task', delayMs: 500 }, { name: 'create_task', delayMs: 500 },
        { name: 'create_task', delayMs: 500 }, { name: 'create_task', delayMs: 500 },
      ],
      response: 'Outbound list built (28 tool calls). 25 marketing agencies found, 20-100 employees. 14 founders, 8 VPs, 3 directors enriched. Top 8 personalized emails drafted. Follow-up task sequence created for all 25.',
    },
    multiAgent: {
      agents: [
        {
          name: 'prospecting', displayName: 'Prospecting', icon: 'Target', color: 'rose',
          reason: 'Finding 25 marketing agencies',
          tools: [{ name: 'search_leads_create_table', delayMs: 1500 }, { name: 'enrich_table_column', delayMs: 900 }],
          delayBeforeStart: 100,
        },
        {
          name: 'research', displayName: 'Research & Enrichment', icon: 'Search', color: 'emerald',
          reason: 'Deep-enriching 8 decision-makers',
          tools: [
            { name: 'enrich_contact', delayMs: 600 }, { name: 'enrich_contact', delayMs: 600 },
            { name: 'enrich_contact', delayMs: 600 }, { name: 'enrich_contact', delayMs: 600 },
            { name: 'enrich_contact', delayMs: 600 }, { name: 'enrich_contact', delayMs: 600 },
            { name: 'enrich_contact', delayMs: 600 }, { name: 'enrich_contact', delayMs: 600 },
            { name: 'enrich_company', delayMs: 700 }, { name: 'enrich_company', delayMs: 700 },
            { name: 'enrich_company', delayMs: 700 }, { name: 'enrich_company', delayMs: 700 },
          ],
          delayBeforeStart: 200,
        },
        {
          name: 'outreach', displayName: 'Outreach & Follow-up', icon: 'Mail', color: 'purple',
          reason: 'Writing 8 personalized cold emails',
          tools: [
            { name: 'draft_email', delayMs: 700 }, { name: 'draft_email', delayMs: 700 },
            { name: 'draft_email', delayMs: 700 }, { name: 'draft_email', delayMs: 700 },
            { name: 'draft_email', delayMs: 700 }, { name: 'draft_email', delayMs: 700 },
            { name: 'draft_email', delayMs: 700 }, { name: 'draft_email', delayMs: 700 },
          ],
          delayBeforeStart: 300,
        },
        {
          name: 'crm_ops', displayName: 'CRM Operations', icon: 'Database', color: 'orange',
          reason: 'Building follow-up sequences for all 25',
          tools: [
            { name: 'create_task', delayMs: 250 }, { name: 'create_task', delayMs: 250 },
            { name: 'create_task', delayMs: 250 }, { name: 'create_task', delayMs: 250 },
            { name: 'create_task', delayMs: 250 }, { name: 'create_task', delayMs: 250 },
          ],
          delayBeforeStart: 400,
        },
      ],
      response: 'Outbound machine built — 4 agents, 28 tools. 25 agencies found and enriched. Top 8 cold emails ready. 3-touch cadence (day 3, 7, 14) for all 25.',
    },
  },

  // Stalled Deal Recovery — 4 agents
  // Single-agent: 27 sequential tools (~31s) | Multi-agent: 4 parallel (~8s)
  'stalled-deal-recovery': {
    singleAgent: {
      tools: [
        { name: 'get_pipeline_deals', delayMs: 1200 }, { name: 'get_contacts_needing_attention', delayMs: 1000 },
        { name: 'get_deal', delayMs: 800 }, { name: 'get_deal', delayMs: 800 },
        { name: 'get_deal', delayMs: 800 }, { name: 'get_deal', delayMs: 800 },
        { name: 'get_deal', delayMs: 800 }, { name: 'get_deal', delayMs: 800 },
        { name: 'get_deal', delayMs: 800 },
        { name: 'search_emails', delayMs: 900 }, { name: 'search_emails', delayMs: 900 },
        { name: 'search_emails', delayMs: 900 },
        { name: 'enrich_company', delayMs: 1400 }, { name: 'enrich_company', delayMs: 1400 },
        { name: 'enrich_company', delayMs: 1400 },
        { name: 'enrich_contact', delayMs: 1300 }, { name: 'enrich_contact', delayMs: 1300 },
        { name: 'draft_email', delayMs: 1400 }, { name: 'draft_email', delayMs: 1400 },
        { name: 'draft_email', delayMs: 1400 }, { name: 'draft_email', delayMs: 1400 },
        { name: 'create_activity', delayMs: 600 }, { name: 'create_activity', delayMs: 600 },
        { name: 'create_activity', delayMs: 600 },
        { name: 'update_crm', delayMs: 600 },
        { name: 'create_task', delayMs: 500 }, { name: 'create_task', delayMs: 500 },
      ],
      response: 'Stalled deal analysis done (27 tool calls). 7 deals stuck 3+ weeks ($285k total). Summit Tech ($52k) — champion on leave. Cascade HR ($38k) — evaluating competitor. Oakmont ($35k) — new VP not looped in. Re-engagement emails drafted for all 7.',
    },
    multiAgent: {
      agents: [
        {
          name: 'pipeline', displayName: 'Pipeline Manager', icon: 'BarChart3', color: 'blue',
          reason: 'Pulling 7 stalled deals',
          tools: [
            { name: 'get_pipeline_deals', delayMs: 800 }, { name: 'get_contacts_needing_attention', delayMs: 700 },
            { name: 'get_deal', delayMs: 400 }, { name: 'get_deal', delayMs: 400 },
            { name: 'get_deal', delayMs: 400 }, { name: 'get_deal', delayMs: 400 },
            { name: 'get_deal', delayMs: 400 }, { name: 'get_deal', delayMs: 400 },
            { name: 'get_deal', delayMs: 400 },
          ],
          delayBeforeStart: 100,
        },
        {
          name: 'research', displayName: 'Research & Enrichment', icon: 'Search', color: 'emerald',
          reason: 'Investigating what changed at stalled accounts',
          tools: [
            { name: 'search_emails', delayMs: 600 }, { name: 'search_emails', delayMs: 600 },
            { name: 'search_emails', delayMs: 600 },
            { name: 'enrich_company', delayMs: 800 }, { name: 'enrich_company', delayMs: 800 },
            { name: 'enrich_company', delayMs: 800 },
            { name: 'enrich_contact', delayMs: 700 }, { name: 'enrich_contact', delayMs: 700 },
          ],
          delayBeforeStart: 200,
        },
        {
          name: 'outreach', displayName: 'Outreach & Follow-up', icon: 'Mail', color: 'purple',
          reason: 'Drafting re-engagement emails',
          tools: [
            { name: 'draft_email', delayMs: 800 }, { name: 'draft_email', delayMs: 800 },
            { name: 'draft_email', delayMs: 800 }, { name: 'draft_email', delayMs: 800 },
          ],
          delayBeforeStart: 300,
        },
        {
          name: 'crm_ops', displayName: 'CRM Operations', icon: 'Database', color: 'orange',
          reason: 'Logging notes and creating tasks',
          tools: [
            { name: 'create_activity', delayMs: 400 }, { name: 'create_activity', delayMs: 400 },
            { name: 'create_activity', delayMs: 400 }, { name: 'update_crm', delayMs: 400 },
            { name: 'create_task', delayMs: 300 }, { name: 'create_task', delayMs: 300 },
          ],
          delayBeforeStart: 350,
        },
      ],
      response: 'Stalled deals investigated — 4 agents, 27 tools. 7 deals ($285k): Summit ($52k, champion on leave), Cascade ($38k, competitor eval), Oakmont ($35k, new VP). Re-engagement emails drafted. Notes logged, tasks created.',
    },
  },

  // End-of-Day Wrap-Up — 4 agents
  // Single-agent: 25 sequential tools (~30s) | Multi-agent: 4 parallel (~7s)
  'end-of-day-wrap': {
    singleAgent: {
      tools: [
        { name: 'get_meetings_for_period', delayMs: 1100 }, { name: 'get_meetings', delayMs: 1000 },
        { name: 'get_contact', delayMs: 700 }, { name: 'get_contact', delayMs: 700 },
        { name: 'get_contact', delayMs: 700 }, { name: 'get_contact', delayMs: 700 },
        { name: 'get_contact', delayMs: 700 },
        { name: 'create_activity', delayMs: 700 }, { name: 'create_activity', delayMs: 700 },
        { name: 'create_activity', delayMs: 700 }, { name: 'create_activity', delayMs: 700 },
        { name: 'create_activity', delayMs: 700 },
        { name: 'get_deal', delayMs: 800 }, { name: 'get_deal', delayMs: 800 },
        { name: 'get_deal', delayMs: 800 },
        { name: 'update_crm', delayMs: 600 }, { name: 'update_crm', delayMs: 600 },
        { name: 'update_crm', delayMs: 600 },
        { name: 'draft_email', delayMs: 1300 }, { name: 'draft_email', delayMs: 1300 },
        { name: 'draft_email', delayMs: 1300 }, { name: 'draft_email', delayMs: 1300 },
        { name: 'draft_email', delayMs: 1300 },
        { name: 'list_tasks', delayMs: 700 }, { name: 'create_task', delayMs: 500 },
      ],
      response: 'Day wrapped up (25 tool calls). 5 meetings logged. 3 deal stages updated. 5 follow-up emails drafted. Tomorrow\'s priorities set.',
    },
    multiAgent: {
      agents: [
        {
          name: 'meetings', displayName: 'Meeting Intelligence', icon: 'Calendar', color: 'amber',
          reason: 'Pulling today\'s 5 meetings',
          tools: [
            { name: 'get_meetings_for_period', delayMs: 700 }, { name: 'get_meetings', delayMs: 600 },
            { name: 'get_contact', delayMs: 400 }, { name: 'get_contact', delayMs: 400 },
            { name: 'get_contact', delayMs: 400 }, { name: 'get_contact', delayMs: 400 },
            { name: 'get_contact', delayMs: 400 },
          ],
          delayBeforeStart: 100,
        },
        {
          name: 'pipeline', displayName: 'Pipeline Manager', icon: 'BarChart3', color: 'blue',
          reason: 'Checking deal status',
          tools: [{ name: 'get_deal', delayMs: 500 }, { name: 'get_deal', delayMs: 500 }, { name: 'get_deal', delayMs: 500 }],
          delayBeforeStart: 150,
        },
        {
          name: 'outreach', displayName: 'Outreach & Follow-up', icon: 'Mail', color: 'purple',
          reason: 'Drafting follow-up emails',
          tools: [
            { name: 'draft_email', delayMs: 800 }, { name: 'draft_email', delayMs: 800 },
            { name: 'draft_email', delayMs: 800 }, { name: 'draft_email', delayMs: 800 },
            { name: 'draft_email', delayMs: 800 },
          ],
          delayBeforeStart: 250,
        },
        {
          name: 'crm_ops', displayName: 'CRM Operations', icon: 'Database', color: 'orange',
          reason: 'Logging notes and building tomorrow\'s list',
          tools: [
            { name: 'create_activity', delayMs: 350 }, { name: 'create_activity', delayMs: 350 },
            { name: 'create_activity', delayMs: 350 }, { name: 'create_activity', delayMs: 350 },
            { name: 'create_activity', delayMs: 350 },
            { name: 'update_crm', delayMs: 400 }, { name: 'update_crm', delayMs: 400 },
            { name: 'update_crm', delayMs: 400 },
            { name: 'list_tasks', delayMs: 400 }, { name: 'create_task', delayMs: 300 },
          ],
          delayBeforeStart: 300,
        },
      ],
      response: 'Day closed out — 4 agents, 25 tools. 5 meetings logged, 3 stages updated, 5 follow-ups drafted. Tomorrow\'s top 3 set.',
    },
  },
};

// =============================================================================
// Jitter helper
// =============================================================================

function jitter(baseMs: number, range = 200): number {
  return baseMs + Math.floor(Math.random() * range * 2) - range;
}

// =============================================================================
// Hook
// =============================================================================

export function useMockAgentRace(mode: 'single' | 'multi') {
  const [state, setState] = useState<MockAgentState>({
    messages: [],
    isThinking: false,
    isStreaming: false,
    activeAgents: [],
    toolsUsed: [],
    timeline: [],
    metrics: null,
  });

  const abortRef = useRef(false);
  const startTimeRef = useRef(0);

  const reset = useCallback(() => {
    abortRef.current = true;
    setState({
      messages: [],
      isThinking: false,
      isStreaming: false,
      activeAgents: [],
      toolsUsed: [],
      timeline: [],
      metrics: null,
    });
  }, []);

  const run = useCallback(
    (scenarioId: string) => {
      abortRef.current = false;
      const data = SCENARIO_DATA[scenarioId];
      if (!data) return;

      const raceStart = Date.now();
      startTimeRef.current = raceStart;
      const scenario = mode === 'single' ? data.singleAgent : data.multiAgent;

      // Initial state: user message + thinking
      setState({
        messages: [{ role: 'user', content: 'prompt' }],
        isThinking: true,
        isStreaming: false,
        activeAgents: [],
        toolsUsed: [],
        timeline: [],
        metrics: null,
      });

      if (mode === 'single') {
        // Single-agent: sequential tool execution
        const tools = data.singleAgent.tools;
        let toolIndex = 0;
        let elapsed = 500; // initial thinking time

        const runNextTool = () => {
          if (abortRef.current) return;
          if (toolIndex >= tools.length) {
            // All tools done — stream response
            const endTime = Date.now();
            setState((prev) => ({
              ...prev,
              isThinking: false,
              isStreaming: true,
              messages: [
                prev.messages[0],
                { role: 'assistant', content: data.singleAgent.response },
              ],
            }));
            setTimeout(() => {
              if (abortRef.current) return;
              setState((prev) => ({
                ...prev,
                isStreaming: false,
                metrics: {
                  startTime: raceStart,
                  endTime,
                  durationMs: endTime - raceStart,
                  toolCount: tools.length,
                  toolsUsed: tools.map((t) => t.name),
                  agentsUsed: [],
                },
              }));
            }, 600);
            return;
          }

          const tool = tools[toolIndex];
          setState((prev) => ({
            ...prev,
            isThinking: true,
            toolsUsed: [...prev.toolsUsed, tool.name],
          }));

          toolIndex++;
          setTimeout(runNextTool, jitter(tool.delayMs));
        };

        setTimeout(runNextTool, jitter(elapsed));
      } else {
        // Multi-agent: parallel agent execution
        const multiData = data.multiAgent;
        const agentCount = multiData.agents.length;
        let doneCount = 0;

        multiData.agents.forEach((agent) => {
          // Start agent after its delay
          setTimeout(() => {
            if (abortRef.current) return;

            const agentStartMs = Date.now() - raceStart;

            setState((prev) => ({
              ...prev,
              isThinking: true,
              activeAgents: [
                ...prev.activeAgents,
                {
                  name: agent.name,
                  displayName: agent.displayName,
                  icon: agent.icon,
                  color: agent.color,
                  reason: agent.reason,
                  status: 'working' as const,
                },
              ],
              timeline: [
                ...prev.timeline,
                {
                  agentName: agent.name,
                  displayName: agent.displayName,
                  color: agent.color,
                  startMs: agentStartMs,
                  endMs: null,
                },
              ],
            }));

            // Run tools sequentially within this agent
            let toolIdx = 0;
            let toolDelay = 300;

            const runAgentTool = () => {
              if (abortRef.current) return;
              if (toolIdx >= agent.tools.length) {
                // Agent done
                const agentEndMs = Date.now() - raceStart;
                doneCount++;

                setState((prev) => ({
                  ...prev,
                  activeAgents: prev.activeAgents.map((a) =>
                    a.name === agent.name ? { ...a, status: 'done' as const } : a
                  ),
                  timeline: prev.timeline.map((t) =>
                    t.agentName === agent.name ? { ...t, endMs: agentEndMs } : t
                  ),
                }));

                // If all agents done, synthesize
                if (doneCount >= agentCount) {
                  setTimeout(() => {
                    if (abortRef.current) return;
                    const endTime = Date.now();
                    setState((prev) => ({
                      ...prev,
                      isThinking: false,
                      isStreaming: true,
                      messages: [
                        prev.messages[0],
                        { role: 'assistant', content: multiData.response },
                      ],
                    }));
                    setTimeout(() => {
                      if (abortRef.current) return;
                      const allTools = multiData.agents.flatMap((a) =>
                        a.tools.map((t) => t.name)
                      );
                      setState((prev) => ({
                        ...prev,
                        isStreaming: false,
                        metrics: {
                          startTime: raceStart,
                          endTime,
                          durationMs: endTime - raceStart,
                          toolCount: allTools.length,
                          toolsUsed: allTools,
                          agentsUsed: multiData.agents.map((a) => a.displayName),
                        },
                      }));
                    }, 600);
                  }, jitter(800));
                }
                return;
              }

              const tool = agent.tools[toolIdx];
              setState((prev) => ({
                ...prev,
                toolsUsed: [...prev.toolsUsed, tool.name],
              }));

              toolIdx++;
              setTimeout(runAgentTool, jitter(tool.delayMs));
            };

            setTimeout(runAgentTool, jitter(toolDelay));
          }, jitter(agent.delayBeforeStart));
        });
      }
    },
    [mode]
  );

  return { state, run, reset };
}
