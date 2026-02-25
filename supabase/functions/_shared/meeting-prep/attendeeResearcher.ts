/**
 * attendeeResearcher.ts — Attendee + company research for pre-meeting briefings.
 *
 * Pipeline:
 *   1. Exa people search for each attendee → LinkedIn URL  (~1s parallel)
 *   2. Apify actor 2SyF0bVxmgGr8IVCZ scrapes full LinkedIn profile  (~15-30s parallel)
 *      Falls back to Exa snippet if no Apify token configured.
 *   3. Exa company search for each unique domain  (~1s parallel, runs alongside step 2)
 *   4. Single Gemini 2.5 Flash call → structured AttendeeResearch + CompanyResearch  (~3s)
 *
 * Total with Apify: ~20-35s.  Total Exa-only: ~5-8s.
 */

const APIFY_ACTOR_ID = '2SyF0bVxmgGr8IVCZ';

// ============================================================================
// Types
// ============================================================================

export interface AttendeeResearch {
  email: string;
  name: string;
  title: string | null;
  company: string | null;
  linkedin_url: string | null;
  background: string | null;
  /** Raw Apify LinkedIn profile if available — passed straight to Gemini */
  _apifyProfile?: Record<string, unknown>;
}

export interface CompanyResearch {
  domain: string;
  name: string | null;
  what_they_do: string | null;
  industry: string | null;
  employee_count: string | null;
  funding: string | null;
  recent_news: string | null;
  linkedin_url: string | null;
}

export interface ResearchResults {
  attendees: AttendeeResearch[];
  companies: CompanyResearch[];
  durationMs: number;
  source: 'apify+exa' | 'exa-only';
}

// ============================================================================
// Exa helpers
// ============================================================================

async function exaSearch(
  query: string,
  exaKey: string,
  numResults = 3,
  maxChars = 1000,
): Promise<Array<{ title: string; url: string; text: string }>> {
  const response = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: { 'x-api-key': exaKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      type: 'auto',
      numResults,
      contents: { text: { maxCharacters: maxChars } },
    }),
  });
  if (!response.ok) throw new Error(`Exa ${response.status}: ${response.statusText}`);
  const data = await response.json() as { results?: Array<{ title?: string; url?: string; text?: string }> };
  return (data.results || []).map(r => ({
    title: r.title || '',
    url: r.url || '',
    text: r.text || '',
  }));
}

/** Extract the first linkedin.com/in/... URL from Exa results */
function extractLinkedInUrl(results: Array<{ url: string }>): string | null {
  for (const r of results) {
    if (r.url.includes('linkedin.com/in/')) return r.url;
  }
  return null;
}

/** Extract the first linkedin.com/company/... URL from Exa results */
function extractCompanyLinkedInUrl(results: Array<{ url: string }>): string | null {
  for (const r of results) {
    if (r.url.includes('linkedin.com/company/')) return r.url;
  }
  return null;
}

/** Combine Exa results into a single text block */
function flattenResults(results: Array<{ title: string; url: string; text: string }>): string {
  return results.map(r => `[${r.title}] (${r.url})\n${r.text}`).join('\n\n---\n\n');
}

// ============================================================================
// Apify LinkedIn scraper
// ============================================================================

async function scrapeLinkedIn(
  linkedInUrl: string,
  apifyToken: string,
): Promise<Record<string, unknown> | null> {
  const response = await fetch(
    `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/run-sync-get-dataset-items?token=${apifyToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileUrls: [linkedInUrl] }),
    },
  );
  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(`Apify ${response.status}: ${err.slice(0, 200)}`);
  }
  const items = await response.json() as unknown[];
  const profile = Array.isArray(items) && items.length > 0 ? items[0] : null;
  return profile as Record<string, unknown> | null;
}

// ============================================================================
// Gemini extraction
// ============================================================================

async function callGemini(prompt: string, geminiKey: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1500,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    },
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(`Gemini error: ${err.error?.message || response.statusText}`);
  }
  const data = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ thought?: boolean; text?: string }> } }>;
  };
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.filter(p => !p.thought).map(p => p.text || '').join('');
}

function parseJson<T>(text: string): T | null {
  try {
    const m = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? (m[1] || m[0]) : text) as T;
  } catch {
    return null;
  }
}

// ============================================================================
// Main
// ============================================================================

/**
 * Research external attendees and their companies.
 *
 * @param attendees   [{email, name}] — external attendees only (rep already filtered out)
 * @param exaKey      EXA_API_KEY
 * @param geminiKey   GEMINI_API_KEY
 * @param apifyToken  Org's Apify API token (from integration_credentials), or null to skip
 */
export async function researchAttendees(
  attendees: Array<{ email: string; name: string }>,
  exaKey: string,
  geminiKey: string,
  apifyToken: string | null,
): Promise<ResearchResults> {
  const start = performance.now();

  if (attendees.length === 0) {
    return { attendees: [], companies: [], durationMs: 0, source: 'exa-only' };
  }

  // Extract unique non-generic company domains
  const domainSet = new Set<string>();
  for (const att of attendees) {
    const domain = att.email.split('@')[1]?.toLowerCase();
    if (domain && !isGenericDomain(domain)) domainSet.add(domain);
  }

  // ---- Phase 1 + 3 in parallel: Exa person searches + company searches ----
  // Phase 1: find LinkedIn URLs per person
  const exaPersonResults = new Map<string, Array<{ title: string; url: string; text: string }>>();
  // Phase 3a: company context (general)
  const exaCompanyResults = new Map<string, string>();
  // Phase 3b: company LinkedIn URL (targeted search)
  const companyLinkedInUrls = new Map<string, string | null>();

  const exaSearches: Promise<void>[] = [];

  for (const att of attendees) {
    const namePart = att.name && att.name !== att.email ? att.name : '';
    const domain = att.email.split('@')[1] || '';
    const query = namePart
      ? `"${namePart}" ${domain} linkedin`
      : `${att.email} linkedin profile`;

    exaSearches.push(
      exaSearch(query, exaKey, 3, 800)
        .then(r => { exaPersonResults.set(att.email, r); })
        .catch(err => {
          console.warn(`[attendeeResearcher] Exa person search failed for ${att.email}:`, err);
          exaPersonResults.set(att.email, []);
        }),
    );
  }

  for (const domain of domainSet) {
    // General company context search
    const query = `${domain} company overview products services what they do`;
    exaSearches.push(
      exaSearch(query, exaKey, 3, 1200)
        .then(r => { exaCompanyResults.set(domain, flattenResults(r)); })
        .catch(err => {
          console.warn(`[attendeeResearcher] Exa company search failed for ${domain}:`, err);
          exaCompanyResults.set(domain, '');
        }),
    );

    // Targeted LinkedIn company page search
    exaSearches.push(
      exaSearch(`${domain} linkedin.com/company`, exaKey, 3, 200)
        .then(r => { companyLinkedInUrls.set(domain, extractCompanyLinkedInUrl(r)); })
        .catch(() => { companyLinkedInUrls.set(domain, null); }),
    );
  }

  await Promise.all(exaSearches);

  // ---- Phase 2: Apify LinkedIn scrape (if token available) ----
  const apifyProfiles = new Map<string, Record<string, unknown>>();
  let usedApify = false;

  if (apifyToken) {
    const apifyJobs: Promise<void>[] = [];

    for (const att of attendees) {
      const personResults = exaPersonResults.get(att.email) || [];
      const linkedInUrl = extractLinkedInUrl(personResults);

      if (linkedInUrl) {
        apifyJobs.push(
          scrapeLinkedIn(linkedInUrl, apifyToken)
            .then(profile => {
              if (profile) {
                apifyProfiles.set(att.email, profile);
                usedApify = true;
              }
            })
            .catch(err => {
              console.warn(`[attendeeResearcher] Apify scrape failed for ${att.email}:`, err);
            }),
        );
      }
    }

    await Promise.allSettled(apifyJobs);
  }

  // ---- Phase 4: Gemini extracts structured profiles from all data ----
  const attendeeBlocks = attendees.map(att => {
    const apifyProfile = apifyProfiles.get(att.email);
    const exaResults = exaPersonResults.get(att.email) || [];
    const domain = att.email.split('@')[1] || '';
    const companyContext = exaCompanyResults.get(domain) || '';
    const companyLinkedIn = companyLinkedInUrls.get(domain) || null;

    if (apifyProfile) {
      // Full Apify profile — give Gemini the structured data directly
      return `PERSON: ${att.name || att.email} (${att.email})
Apify LinkedIn data (structured):
${JSON.stringify({
  fullName: apifyProfile.fullName,
  headline: apifyProfile.headline,
  jobTitle: apifyProfile.jobTitle,
  companyName: apifyProfile.companyName,
  companyIndustry: apifyProfile.companyIndustry,
  companySize: apifyProfile.companySize,
  companyLinkedInUrl: apifyProfile.companyLinkedInUrl || apifyProfile.companyUrl || companyLinkedIn || null,
  about: typeof apifyProfile.about === 'string' ? apifyProfile.about?.slice(0, 500) : null,
  addressWithCountry: apifyProfile.addressWithCountry,
  linkedinUrl: apifyProfile.linkedinUrl,
  experiences: Array.isArray(apifyProfile.experiences)
    ? (apifyProfile.experiences as Array<Record<string, unknown>>).slice(0, 3).map(e => ({
        title: e.title, companyName: e.companyName, duration: e.duration,
      }))
    : [],
  education: Array.isArray(apifyProfile.educations)
    ? (apifyProfile.educations as Array<Record<string, unknown>>).slice(0, 2).map(e => ({
        title: e.title, subtitle: e.subtitle,
      }))
    : [],
}, null, 2)}

Company (${domain}) web context:
${companyContext || '(none)'}
${companyLinkedIn ? `Company LinkedIn: ${companyLinkedIn}` : ''}`;
    } else {
      // No Apify — use Exa search snippets
      return `PERSON: ${att.name || att.email} (${att.email})
Exa web search results:
${flattenResults(exaResults) || '(no results)'}

Company (${domain}) web context:
${companyContext || '(none)'}
${companyLinkedIn ? `Company LinkedIn: ${companyLinkedIn}` : ''}`;
    }
  }).join('\n\n========\n\n');

  const prompt = `You are extracting structured data about meeting attendees and their companies from research data.

${attendeeBlocks}

Extract real information. If something is not clearly found, use null. Do not invent details.

Return ONLY a JSON object:
{
  "attendees": [
    {
      "email": "exact email",
      "name": "full name",
      "title": "current job title or null",
      "company": "current company name or null",
      "linkedin_url": "linkedin.com/in/... URL or null",
      "background": "2-3 sentence summary of who this person is — specific and useful for a sales rep preparing for a call. Include their current role, relevant experience, and any context that helps understand their perspective."
    }
  ],
  "companies": [
    {
      "domain": "exact domain",
      "name": "company name",
      "what_they_do": "1-2 sentences: what the company does, their product/service, who they sell to",
      "industry": "industry category e.g. 'Insurance & Financial Services', 'SaaS / B2B Software', 'Healthcare', 'Consulting' or null",
      "employee_count": "approximate size e.g. '50-200' or '5,000+' or null",
      "funding": "funding stage or total raised e.g. 'Series B ($24M)', 'Public (NYSE: INTG)', 'Bootstrapped' or null",
      "recent_news": "notable recent developments, partnerships, growth signals, or executive hires — or null",
      "linkedin_url": "linkedin.com/company/... URL if found in the data, or null"
    }
  ]
}`;

  let parsed: { attendees?: unknown[]; companies?: unknown[] } | null = null;
  try {
    const geminiText = await callGemini(prompt, geminiKey);
    parsed = parseJson(geminiText);
  } catch (err) {
    console.warn('[attendeeResearcher] Gemini extraction failed:', err);
  }

  const resultAttendees: AttendeeResearch[] = attendees.map(att => {
    const found = ((parsed?.attendees || []) as AttendeeResearch[])
      .find(a => a.email === att.email);
    return {
      email: att.email,
      name: found?.name || att.name || att.email,
      title: found?.title || null,
      company: found?.company || null,
      linkedin_url: found?.linkedin_url || null,
      background: found?.background || null,
    };
  });

  const resultCompanies: CompanyResearch[] = [...domainSet].map(domain => {
    const found = ((parsed?.companies || []) as CompanyResearch[])
      .find(c => c.domain === domain);
    return {
      domain,
      name: found?.name || null,
      what_they_do: found?.what_they_do || null,
      industry: found?.industry || null,
      employee_count: found?.employee_count || null,
      funding: found?.funding || null,
      recent_news: found?.recent_news || null,
      // Prefer Gemini-extracted URL, fall back to direct Exa result
      linkedin_url: found?.linkedin_url || companyLinkedInUrls.get(domain) || null,
    };
  });

  const durationMs = Math.round(performance.now() - start);
  console.log(
    `[attendeeResearcher] Done in ${durationMs}ms — ` +
    `${attendees.length} attendee(s), ${domainSet.size} company/companies, ` +
    `apify=${usedApify ? apifyProfiles.size + ' profiles' : 'not used'}`,
  );

  return {
    attendees: resultAttendees,
    companies: resultCompanies,
    durationMs,
    source: usedApify ? 'apify+exa' : 'exa-only',
  };
}

// ============================================================================
// Format for briefing prompt
// ============================================================================

export function formatResearchForPrompt(research: ResearchResults): string {
  const lines: string[] = [];

  for (const att of research.attendees) {
    lines.push(`ATTENDEE: ${att.name} (${att.email})`);
    if (att.title) lines.push(`  Title: ${att.title}`);
    if (att.company) lines.push(`  Company: ${att.company}`);
    if (att.linkedin_url) lines.push(`  LinkedIn: ${att.linkedin_url}`);
    if (att.background) lines.push(`  Background: ${att.background}`);
    lines.push('');
  }

  for (const co of research.companies) {
    lines.push(`COMPANY: ${co.name || co.domain} (${co.domain})`);
    if (co.what_they_do) lines.push(`  What they do: ${co.what_they_do}`);
    if (co.industry) lines.push(`  Industry: ${co.industry}`);
    if (co.employee_count) lines.push(`  Size: ${co.employee_count} employees`);
    if (co.funding) lines.push(`  Funding: ${co.funding}`);
    if (co.recent_news) lines.push(`  Recent news: ${co.recent_news}`);
    if (co.linkedin_url) lines.push(`  LinkedIn: ${co.linkedin_url}`);
    lines.push('');
  }

  return lines.join('\n').trim();
}

// ============================================================================
// Helpers
// ============================================================================

function isGenericDomain(domain: string): boolean {
  const generic = new Set([
    'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com',
    'hotmail.co.uk', 'outlook.com', 'live.com', 'icloud.com', 'me.com',
    'mac.com', 'protonmail.com', 'proton.me', 'hey.com', 'fastmail.com',
  ]);
  return generic.has(domain);
}
