/**
 * demo-research
 *
 * Deep research for the interactive demo. Scrapes the visitor's company
 * website, uses Gemini Flash to extract WHAT THEY SELL, then generates
 * fully personalized demo content referencing their real product/service.
 *
 * This is the wow factor — the demo should feel like it already knows
 * the viewer's business.
 *
 * Input:  { url } OR { domain, company_name, visitor_name?, visitor_title? }
 * Output: Full ResearchData shape (company, demo_actions, stats)
 */

import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';

const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';

interface DemoResearchRequest {
  url?: string;
  domain?: string;
  company_name?: string;
  visitor_name?: string;
  visitor_title?: string;
}

interface ResearchData {
  company: {
    name: string;
    domain: string;
    vertical: string;
    product_summary: string;
    value_props: string[];
    employee_range?: string;
    competitors?: string[];
    icp: {
      title: string;
      company_size: string;
      industry: string;
    };
  };
  demo_actions: {
    cold_outreach: {
      target_name: string;
      target_title: string;
      target_company: string;
      personalised_hook: string;
      email_preview: string;
    };
    proposal_draft: {
      prospect_name: string;
      prospect_company: string;
      proposal_title: string;
      key_sections: string[];
    };
    meeting_prep: {
      attendee_name: string;
      attendee_company: string;
      context: string;
      talking_points: string[];
    };
    pipeline_action: {
      deal_name: string;
      deal_value: string;
      days_stale: number;
      health_score: number;
      risk_signal: string;
      suggested_action: string;
      signals: { label: string; type: 'positive' | 'warning' | 'neutral' }[];
    };
  };
  stats: {
    signals_found: number;
    actions_queued: number;
    contacts_identified: number;
    opportunities_mapped: number;
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  try {
    const body: DemoResearchRequest = await req.json();

    // Support both { url } and { domain } input shapes
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

    // Step 1: Scrape the company website
    const websiteContent = await scrapeWebsite(domain);

    // Step 2: Generate full research data using Gemini
    const companyName = body.company_name || domainToName(domain);
    const result = await generateResearchData(
      geminiKey,
      domain,
      companyName,
      websiteContent,
      body.visitor_name,
      body.visitor_title
    );

    return jsonResponse({ success: true, data: result }, req);
  } catch (err) {
    console.error('[demo-research] Error:', err);
    return errorResponse(
      err instanceof Error ? err.message : 'Internal error',
      500,
      req
    );
  }
});

// ---------------------------------------------------------------------------
// Website scraping
// ---------------------------------------------------------------------------

async function scrapeWebsite(domain: string): Promise<string> {
  try {
    const url = `https://${domain}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 60Bot/1.0)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return '';
    const html = await response.text();
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 12000);
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Generate full ResearchData from website content (or name-only fallback)
// ---------------------------------------------------------------------------

async function generateResearchData(
  apiKey: string,
  domain: string,
  companyName: string,
  websiteContent: string,
  visitorName?: string,
  visitorTitle?: string
): Promise<ResearchData> {
  const hasWebsite = websiteContent.length >= 50;
  const senderName = visitorName || 'the rep';
  const senderFirstName = (visitorName || 'Alex').split(' ')[0];

  const websiteContext = hasWebsite
    ? `Here is the homepage content from ${companyName}'s website (${domain}):

---
${websiteContent}
---

Based on this website content, extract:`
    : `The company is ${companyName} (${domain}). Based on the company name and domain, infer:`;

  const prompt = `You are researching a company for a personalized sales CRM demo. The person viewing this demo is ${senderName}${visitorTitle ? ` (${visitorTitle})` : ''} from ${companyName}. They are a SALES REP using a CRM tool called "60" to manage their pipeline.

${websiteContext}
1. WHAT ${companyName} sells — their core product or service offering
2. WHO they sell to — their ideal customer profile (ICP)
3. Their key value propositions and differentiators
4. Their industry vertical
5. Likely competitors

Then generate a complete set of personalized demo content where ${senderFirstName} from ${companyName} is selling THEIR product/service to prospects. Every piece of content should reference ${companyName}'s ACTUAL product, features, and value props${hasWebsite ? ' from the website' : ''}.

Return JSON matching this EXACT structure:
{
  "company": {
    "name": "${companyName}",
    "domain": "${domain}",
    "vertical": "The industry vertical (e.g. 'B2B SaaS', 'FinTech', 'Healthcare', 'Professional Services')",
    "product_summary": "One clear sentence describing what ${companyName} sells — their core product/service. Be specific about WHAT it does, not generic. This is critical.",
    "value_props": ["3-4 specific value propositions from ${companyName}'s actual offering — features, benefits, outcomes they deliver to customers"],
    "employee_range": "Estimated employee range (e.g. '11-50', '51-200', '201-1000')",
    "competitors": ["2-3 real competitors in ${companyName}'s space"],
    "icp": {
      "title": "The job title of ${companyName}'s ideal buyer (e.g. 'VP of Sales', 'Head of Engineering')",
      "company_size": "Target company size (e.g. '50-500 employees')",
      "industry": "Target industry"
    }
  },
  "demo_actions": {
    "cold_outreach": {
      "target_name": "Sarah Chen",
      "target_title": "A title that matches ${companyName}'s ICP buyer",
      "target_company": "A realistic prospect company name",
      "personalised_hook": "A warm, specific opening that references a previous conversation or demo. Not an introduction. Not 'I'm reaching out because'. Reference something specific from 'yesterday's call'.",
      "email_preview": "SEE EMAIL RULES BELOW — this is a FOLLOW-UP after a demo/meeting, NOT cold outreach"
    },
    "proposal_draft": {
      "prospect_name": "James Wright",
      "prospect_company": "A different realistic prospect company",
      "proposal_title": "How ${companyName}'s [specific product] helps [prospect company] achieve [specific outcome]",
      "key_sections": ["4 proposal sections referencing ${companyName}'s real capabilities"]
    },
    "meeting_prep": {
      "attendee_name": "David Park",
      "attendee_company": "A third realistic prospect company",
      "context": "Meeting context that references ${companyName}'s product and a specific feature the prospect asked about",
      "talking_points": ["4 talking points referencing ${companyName}'s REAL product features and competitive advantages"]
    },
    "pipeline_action": {
      "deal_name": "[Prospect Company] — [Deal type]",
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
- The "product_summary" must describe what ${companyName} ACTUALLY sells. Not "provides solutions" — be specific about their product/service.
- The "value_props" must be ${companyName}'s REAL value propositions${hasWebsite ? ' extracted from the website' : ''}.
- ALL email content, talking points, and proposals must reference ${companyName}'s specific product/service, not generic sales language.
- The viewer should think "wow, it knows exactly what we sell and how to position it."
- Use realistic prospect company names, not generic ones.
- Do NOT use placeholder brackets like [Name] — use actual names.

EMAIL RULES (for "email_preview" — follow these exactly):
This is a POST-MEETING FOLLOW-UP email, not cold outreach. ${senderFirstName} already had a demo/call with the prospect yesterday. The email references the conversation and proposes next steps.

The email must read like the best human SDR wrote it, not AI. Follow these rules:
1. 75-125 WORDS. Follow-ups can be slightly longer than cold emails but still concise.
2. 3rd-to-5th grade reading level. Short words. Short sentences. No jargon.
3. ONE email, ONE idea, ONE ask. Single CTA.
4. Open by referencing yesterday's conversation. "Great speaking with you yesterday" or reference a specific topic they discussed. Never "I'm reaching out" or "My name is".
5. Reference 2-3 SPECIFIC features/benefits of ${companyName}'s product that were relevant to the prospect's needs. Use bullet points.
6. End with a clear, easy next step. "Want me to send over the proposal?" or "Happy to jump on a quick call Thursday to walk through it."
7. Write like you talk. Read it out loud. No "leverage," "synergies," "streamline," "empower," "best-in-class."
8. Vary sentence length. Long sentence, then a fragment. A question. Two words.
9. Use contractions. "You're" not "you are." "Don't" not "do not."
10. NO em dashes (— or –). Use a hyphen, full stop, or rewrite as two sentences.
11. NO oxford commas. "Sales, marketing and ops" not "sales, marketing, and ops."
12. Reference ${companyName}'s SPECIFIC product features from the website. Not generic benefits.
13. Sign off as just "${senderFirstName}" — nothing else after the name.

DEAD LANGUAGE — never use these phrases in the email:
"I'm reaching out because", "I hope this email finds you well", "Allow me to introduce myself",
"I'd love to explore", "leverage", "synergies", "transforming", "cutting-edge", "revolutionize",
"just following up", "just checking in", "bumping this", "best-in-class", "streamline your workflow",
"empower your team", "industry-leading", "unique perspective", "drive meaningful engagement"

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
          maxOutputTokens: 3000,
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Gemini API error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('No content in Gemini response');
  }

  const parsed = JSON.parse(text) as ResearchData;

  // Validate critical fields
  if (!parsed.company?.name || !parsed.company?.product_summary) {
    throw new Error('Missing company name or product_summary in response');
  }
  if (!parsed.demo_actions?.cold_outreach?.email_preview) {
    throw new Error('Missing cold_outreach email_preview');
  }
  if (!parsed.demo_actions?.meeting_prep?.talking_points?.length) {
    throw new Error('Missing meeting_prep talking_points');
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
