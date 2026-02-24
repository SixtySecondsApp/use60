// supabase/functions/_shared/exaSearch.ts
// Exa semantic search integration for company research enrichment
// Uses Exa for search + Gemini for structured extraction (best of both worlds)

interface ExaSearchResult {
  result: CompanyEnrichmentData | null;
  cost: number;
  duration: number;
  error: string | null;
}

interface CompanyEnrichmentData {
  company_name: string | null;
  description: string | null;
  industry: string | null;
  employee_count_range: string | null;
  founded_year: number | null;
  headquarters_location: string | null;
  website_url: string | null;
  linkedin_url: string | null;
  funding_stage: string | null;
  funding_total: string | null;
  key_investors: string[] | null;
  leadership_team: Array<{ name: string; title: string; background: string }> | null;
  products_services: string[] | null;
  customer_segments: string[] | null;
  key_competitors: string[] | null;
  competitive_differentiators: string[] | null;
  tech_stack: string[] | null;
  recent_news: string[] | null;
  glassdoor_rating: number | null;
}

interface ExaResult {
  url: string;
  title: string;
  text: string;
  highlights?: string[];
  score: number;
}

interface ExaAPIResponse {
  results: ExaResult[];
  autopromptString?: string;
}

/**
 * Execute Exa semantic search for company research
 * Uses Exa for neural search, then Gemini for structured extraction
 * @param domain - Company domain to research
 * @returns Search results with enrichment data, cost, and duration
 */
export async function executeExaSearch(domain: string): Promise<ExaSearchResult> {
  const EXA_API_KEY = Deno.env.get('EXA_API_KEY');
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

  if (!EXA_API_KEY) {
    return {
      result: null,
      cost: 0,
      duration: 0,
      error: 'EXA_API_KEY not configured'
    };
  }

  const startTime = performance.now();

  try {
    // Step 1: Use Exa's neural search to find relevant content
    console.log(`[exaSearch] Starting Exa search for ${domain}`);
    const exaResponse = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': EXA_API_KEY
      },
      body: JSON.stringify({
        query: `Comprehensive company information for ${domain}: leadership team, funding history, employee count, industry, products, customers, competitors, technology stack, recent news and announcements`,
        numResults: 15, // More results for better coverage
        contents: {
          text: { maxCharacters: 3000 }, // More content per result
          highlights: true
        },
        useAutoprompt: true, // Exa's AI query expansion
        type: 'neural' // Semantic search
      })
    });

    if (!exaResponse.ok) {
      const errorText = await exaResponse.text();
      throw new Error(`Exa API error: ${exaResponse.status} - ${errorText}`);
    }

    const exaData: ExaAPIResponse = await exaResponse.json();
    console.log(`[exaSearch] Exa returned ${exaData.results.length} results`);

    // Step 2: Use Gemini to extract structured data from Exa results
    // This gives us the best of both: Exa's semantic search + Gemini's structured extraction
    const enrichmentData = await extractStructuredDataFromExaResults(exaData.results, domain, GEMINI_API_KEY);

    const duration = Math.round(performance.now() - startTime);

    // Exa pricing: $5 per 1000 searches
    // Note: We're also using Gemini for extraction, but that cost is minimal (~$0.001)
    const cost = 0.005 + 0.001; // Exa search + Gemini extraction

    console.log(`[exaSearch] Completed in ${duration}ms, cost: $${cost.toFixed(6)}`);

    return {
      result: enrichmentData,
      cost,
      duration,
      error: null
    };

  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    console.error('[exaSearch] Error:', error);
    return {
      result: null,
      cost: 0,
      duration,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Use Gemini to extract structured data from Exa search results
 * This is much more accurate than regex-based extraction
 */
async function extractStructuredDataFromExaResults(
  results: ExaResult[],
  domain: string,
  geminiApiKey?: string
): Promise<CompanyEnrichmentData> {
  if (!geminiApiKey) {
    // Fallback to basic extraction if Gemini not available
    console.warn('[exaSearch] GEMINI_API_KEY not set, using basic extraction');
    return parseExaResultsBasic(results, domain);
  }

  // Combine all search results into context
  const searchContext = results
    .slice(0, 10) // Use top 10 results
    .map((r, i) => `[Result ${i + 1}] ${r.title}\n${r.text}`)
    .join('\n\n---\n\n');

  const prompt = `Extract company information for domain "${domain}" from these search results.

Return JSON with these exact fields (use null for fields you cannot find):
{
  "company_name": "string",
  "description": "string (comprehensive company description)",
  "industry": "string",
  "employee_count_range": "string (e.g., 11-50, 51-200, 201-500)",
  "founded_year": number,
  "headquarters_location": "string (city, country)",
  "website_url": "string",
  "linkedin_url": "string",
  "funding_stage": "string (e.g., Seed, Series A, Series B, Bootstrapped)",
  "funding_total": "string (e.g., $5M, $50M)",
  "key_investors": ["string"] or null,
  "leadership_team": [{"name": "string", "title": "string", "background": "string"}] or null,
  "products_services": ["string"] or null,
  "customer_segments": ["string"] or null,
  "key_competitors": ["string"] or null,
  "competitive_differentiators": ["string"] or null,
  "tech_stack": ["string"] or null,
  "recent_news": ["string (headline or brief)"] or null,
  "glassdoor_rating": number or null
}

Search Results:
${searchContext}

Extract all available information. Return ONLY valid JSON, no markdown.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini extraction failed: ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('No response from Gemini');
    }

    // Parse JSON response
    const enrichmentData = JSON.parse(text);
    console.log('[exaSearch] Successfully extracted structured data via Gemini');

    return enrichmentData;

  } catch (error) {
    console.error('[exaSearch] Gemini extraction failed, falling back to basic parsing:', error);
    return parseExaResultsBasic(results, domain);
  }
}

/**
 * Basic fallback extraction using simple patterns
 * Used when Gemini is not available
 */
function parseExaResultsBasic(results: ExaResult[], domain: string): CompanyEnrichmentData {
  const combinedText = results
    .map(r => `${r.title}\n${r.text}`)
    .join('\n\n');

  return {
    company_name: results[0]?.title?.split(/[-|:]/)[0]?.trim() || domain.split('.')[0],
    description: results[0]?.text?.substring(0, 200) || null,
    industry: null,
    employee_count_range: null,
    founded_year: extractFoundedYear(combinedText),
    headquarters_location: null,
    website_url: domain.startsWith('http') ? domain : `https://${domain}`,
    linkedin_url: null,
    funding_stage: null,
    funding_total: null,
    key_investors: null,
    leadership_team: null,
    products_services: null,
    customer_segments: null,
    key_competitors: null,
    competitive_differentiators: null,
    tech_stack: null,
    recent_news: results.slice(0, 5).map(r => r.title),
    glassdoor_rating: null
  };
}

/**
 * Extract founded year from text using simple pattern matching
 */
function extractFoundedYear(text: string): number | null {
  const patterns = [
    /founded\s*in\s*(\d{4})/i,
    /established\s*in\s*(\d{4})/i,
    /since\s*(\d{4})/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}
