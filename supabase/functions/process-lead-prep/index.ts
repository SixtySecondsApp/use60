import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { getAuthContext } from "../_shared/edgeAuth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

type SupabaseClient = ReturnType<typeof createClient>;

const JSON_HEADERS = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

const OPENAI_MODEL =
  Deno.env.get("LEAD_PREP_MODEL") ??
  Deno.env.get("OPENAI_MODEL") ??
  "gpt-4o-mini";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";

const GEMINI_MODEL =
  Deno.env.get("GEMINI_FLASH_MODEL") ??
  Deno.env.get("GEMINI_MODEL") ??
  "gemini-2.5-flash";
const GEMINI_API_KEY =
  Deno.env.get("GEMINI_API_KEY") ??
  Deno.env.get("GOOGLE_GEMINI_API_KEY") ??
  "";
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
const OPENROUTER_MODEL = "google/gemini-2.5-flash";

const BATCH_LIMIT = 12;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
}

if (!OPENAI_API_KEY) {
}

if (!GEMINI_API_KEY) {
}

interface CompanyRecord {
  id: string;
  name: string;
  domain: string | null;
  website: string | null;
  industry: string | null;
  size: string | null;
  description: string | null;
  linkedin_url?: string | null;
}

interface ContactRecord {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  linkedin_url?: string | null;
}

interface OwnerRecord {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

interface LeadSourceRecord {
  id: string;
  name: string;
  source_key: string | null;
  channel: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

interface LeadRecord {
  id: string;
  contact_name: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_timezone: string | null;
  scheduler_email: string | null;
  scheduler_name: string | null;
  domain: string | null;
  status: string | null;
  priority: string | null;
  meeting_title: string | null;
  meeting_description: string | null;
  meeting_start: string | null;
  meeting_end: string | null;
  meeting_duration_minutes: number | null;
  meeting_timezone: string | null;
  metadata: Record<string, unknown> | null;
  owner_id: string | null;
  enrichment_status: string | null;
  enrichment_provider: string | null;
  prep_status: string | null;
  prep_summary: string | null;
  company_id: string | null;
  contact_id: string | null;
  source_id: string | null;
  company?: CompanyRecord | null;
  contact?: ContactRecord | null;
  owner?: OwnerRecord | null;
  source?: LeadSourceRecord | null;
}

interface CompanyResearch {
  provider: string;
  summary: string;
  headline?: string;
  key_metrics?: string[];
  strategic_priorities?: string[];
  recent_news?: string[];
  confidence?: number;
  raw?: unknown;
}

interface ProspectInfo {
  background?: string;
  role_and_responsibilities?: string;
  pain_points?: string[];
  decision_making_authority?: string;
  communication_preferences?: string;
  key_concerns?: string[];
  location?: string;
  timezone?: string;
}

interface CompanyInfo {
  business_model?: string;
  current_challenges?: string[];
  growth_trajectory?: string;
  competitive_landscape?: string;
  technology_stack?: string[];
  recent_news_highlights?: string[];
}

interface OfferInfo {
  what_they_need?: string;
  their_goals?: string[];
  timeline?: string;
  budget_indicator?: string;
  decision_criteria?: string[];
}

interface WhySixtySeconds {
  fit_assessment?: string;
  key_alignment_points?: string[];
  specific_value_propositions?: string[];
  potential_objections?: string[];
  competitive_advantages?: string[];
}

interface LeadPrepPlan {
  prospect_info?: ProspectInfo;
  company_info?: CompanyInfo;
  offer_info?: OfferInfo;
  why_sixty_seconds?: WhySixtySeconds;
}

interface NoteInsert {
  lead_id: string;
  note_type: "summary" | "insight" | "question" | "task" | "resource";
  title: string;
  body: string;
  created_by: string | null;
  is_auto_generated: boolean;
  is_pinned: boolean;
  sort_order: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface IntakeResponse {
  label: string;
  value: string;
  source: "attendee" | "scheduler";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: JSON_HEADERS,
      },
    );
  }

  try {
    // SECURITY (fail-closed): require service role, CRON_SECRET, or a valid user session.
    // Platform JWT verification is disabled for this function because internal callers
    // (e.g. other Edge Functions / webhooks) use the service role API key (sb_secret_*),
    // which is not a user JWT.
    let requestPayload: Record<string, unknown> | null = null;
    try {
      requestPayload = await req.json();
    } catch {
      requestPayload = null;
    }

    const requestedLeadIdsRaw =
      Array.isArray(requestPayload?.lead_ids)
        ? requestPayload?.lead_ids
        : typeof requestPayload?.lead_id === "string"
          ? [requestPayload.lead_id]
          : null;

    const requestedLeadIds = requestedLeadIdsRaw
      ? Array.from(new Set(requestedLeadIdsRaw.filter((id): id is string => typeof id === "string" && id.trim().length > 0)))
      : null;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    try {
      await getAuthContext(req, supabase, SERVICE_ROLE_KEY, {
        cronSecret: Deno.env.get("CRON_SECRET") ?? undefined,
      });
    } catch (_authError) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: JSON_HEADERS },
      );
    }

    // Fetch leads that need prep (optionally scoped to requested IDs)
    let leadsQuery = supabase
      .from("leads")
      .select(`
        id,
        contact_name,
        contact_first_name,
        contact_last_name,
        contact_email,
        contact_phone,
        contact_timezone,
        scheduler_email,
        scheduler_name,
        domain,
        status,
        priority,
        meeting_title,
        meeting_description,
        meeting_start,
        meeting_end,
        meeting_duration_minutes,
        meeting_timezone,
        metadata,
        owner_id,
        enrichment_status,
        enrichment_provider,
        prep_status,
        prep_summary,
        company_id,
        contact_id,
        source_id
      `)
      .order("created_at", { ascending: true });

    if (requestedLeadIds?.length) {
      leadsQuery = leadsQuery
        .in("id", requestedLeadIds)
        .limit(Math.max(requestedLeadIds.length, 1));
    } else {
      leadsQuery = leadsQuery
        .in("prep_status", ["pending", "failed"])
        .limit(BATCH_LIMIT);
    }

    const { data: leads, error } = await leadsQuery;

    if (error) {
      throw error;
    }

    if (!leads || leads.length === 0) {
      const emptyMessage = requestedLeadIds?.length
        ? "Requested leads not available for prep"
        : "No leads requiring prep";
      return new Response(
        JSON.stringify({ 
          success: true, 
          processed: 0, 
          message: emptyMessage
        }),
        {
          status: 200,
          headers: JSON_HEADERS,
        },
      );
    }

    // Fetch related data
    const ownerIds = [...new Set(leads.map(l => l.owner_id).filter(Boolean))];
    const companyIds = [...new Set(leads.map(l => l.company_id).filter(Boolean))];
    const contactIds = [...new Set(leads.map(l => l.contact_id).filter(Boolean))];

    const [companies, contacts, owners] = await Promise.all([
      companyIds.length > 0 ? supabase.from("companies").select("*").in("id", companyIds) : { data: [] },
      contactIds.length > 0 ? supabase.from("contacts").select("*").in("id", contactIds) : { data: [] },
      ownerIds.length > 0 ? supabase.from("profiles").select("id, first_name, last_name, email").in("id", ownerIds) : { data: [] },
    ]);

    // Attach related data to leads
    const enrichedLeads: LeadRecord[] = leads.map(lead => ({
      ...lead,
      company: companies.data?.find(c => c.id === lead.company_id) || null,
      contact: contacts.data?.find(c => c.id === lead.contact_id) || null,
      owner: owners.data?.find(o => o.id === lead.owner_id) || null,
    }));

    let processed = 0;

    for (const lead of enrichedLeads) {
      const now = new Date().toISOString();

      const locked = await lockLead(supabase, lead, now);
      if (!locked) {
        continue;
      }

      try {
        const companyResearch = await fetchCompanyResearch(lead);
        const plan = await generateLeadPrepPlan(lead, companyResearch);
        const prospectTimezone = lead.contact_timezone || lead.meeting_timezone;
        const prospectLocation = getTimezoneLocation(prospectTimezone);
        const meetingTime = formatMeetingTime(lead.meeting_start, prospectTimezone);
        const contactName = lead.contact_name || lead.contact?.full_name || [lead.contact_first_name, lead.contact_last_name].filter(Boolean).join(" ") || lead.contact_email || "the lead";
        const companyName = lead.company?.name || (lead.domain ? lead.domain.replace(/^www\./, "") : "the prospect");
        const summary = `Prep ready for ${contactName} (${companyName}). Meeting scheduled ${meetingTime}.${prospectLocation ? ` They are in ${prospectLocation}.` : ""}`;

        await replaceLeadPrepNotes(supabase, lead, plan, now);
        await updateLeadSuccess(supabase, lead, plan, companyResearch, summary, now);

        // Update the company fact profile with research findings (non-blocking)
        updateFactProfileResearch(supabase, lead, companyResearch, plan).catch((err) => {
          console.error(`[process-lead-prep] Fact profile update failed (non-fatal):`, err);
        });

        processed += 1;
      } catch (leadError) {
        await markLeadFailed(supabase, lead, leadError as Error, now);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed
      }),
      {
        status: 200,
        headers: JSON_HEADERS,
      },
    );
  } catch (error) {
    let errorMessage = "Unknown error";
    if (error instanceof Error) {
      errorMessage = error.message || error.name || "Unknown error";
    } else if (typeof error === "object" && error !== null) {
      try {
        errorMessage = JSON.stringify(error);
      } catch {
        errorMessage = String(error);
      }
    } else {
      errorMessage = String(error);
    }
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: JSON_HEADERS,
      },
    );
  }
});

async function lockLead(
  supabase: SupabaseClient,
  lead: LeadRecord,
  now: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("leads")
    .update({
      enrichment_status: "in_progress",
      prep_status: "in_progress",
      updated_at: now,
    })
    .eq("id", lead.id)
    .in("prep_status", ["pending", "failed"])
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

async function fetchCompanyResearch(lead: LeadRecord): Promise<CompanyResearch | null> {
  if (!GEMINI_API_KEY) {
    return null;
  }

  const companyName = lead.company?.name ?? lead.contact_name ?? null;
  const domain = lead.company?.domain ?? lead.domain ?? null;

  if (!companyName || !domain) {
    return null;
  }

  try {
    const prompt = `You are a B2B sales research assistant. Given the company "${companyName}" with domain "${domain}", provide current intelligence useful for a sales discovery call. Return valid JSON with the following fields:
{
  "summary": "One sentence description tailored to sales context",
  "headline": "Single compelling insight or trigger event",
  "key_metrics": ["List of concrete numbers or metrics if available"],
  "strategic_priorities": ["List of priorities or initiatives the company is focused on"],
  "recent_news": ["Recent news headlines or announcements relevant to the conversation"],
  "confidence": 0.0
}
Only include facts you are reasonably confident in from the last 12 months. Respond with JSON only.`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          topP: 0.8,
          maxOutputTokens: 800,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return null;
    }

    const data = await response.json();
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .map((part: Record<string, unknown>) => (typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();

    if (!text) {
      return null;
    }

    const parsed = parseJsonFromText(text);
    if (!parsed) {
      return null;
    }

    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    const headline = typeof parsed.headline === "string" ? parsed.headline.trim() : undefined;
    const confidence =
      typeof parsed.confidence === "number"
        ? parsed.confidence
        : typeof parsed.confidence === "string"
        ? Number.parseFloat(parsed.confidence)
        : undefined;

    return {
      provider: "gemini",
      summary,
      headline,
      key_metrics: toStringArray(parsed.key_metrics),
      strategic_priorities: toStringArray(parsed.strategic_priorities),
      recent_news: toStringArray(parsed.recent_news),
      confidence: Number.isFinite(confidence) ? confidence : undefined,
      raw: parsed,
    };
  } catch (error) {
    return null;
  }
}

async function generateLeadPrepPlan(
  lead: LeadRecord,
  research: CompanyResearch | null,
): Promise<LeadPrepPlan> {
  if (!GEMINI_API_KEY) {
    return buildFallbackPlan(lead, research);
  }

  try {
    const email = lead.contact_email || lead.contact?.email || lead.scheduler_email || "";
    const domain = extractDomainFromEmail(email) || lead.domain || lead.company?.domain || "";
    
    if (!email || !domain) {
      return buildFallbackPlan(lead, research);
    }

    // Extract first name and last name from lead
    const firstName = lead.contact_first_name || lead.contact?.first_name || "";
    const lastName = lead.contact_last_name || lead.contact?.last_name || "";
    const contactName = lead.contact_name || lead.contact?.full_name || "";
    
    // Use first name and last name if available, otherwise parse from contact_name or email prefix
    let prospectFirstName = firstName;
    let prospectLastName = lastName;
    
    if (!prospectFirstName && contactName) {
      const nameParts = contactName.trim().split(/\s+/);
      prospectFirstName = nameParts[0] || "";
      prospectLastName = nameParts.slice(1).join(" ") || "";
    }
    
    if (!prospectFirstName) {
      prospectFirstName = email.split("@")[0].split(".")[0] || "the prospect";
    }
    
    if (!prospectLastName && contactName) {
      const nameParts = contactName.trim().split(/\s+/);
      prospectLastName = nameParts.slice(1).join(" ") || "";
    }

    // Generate 3 sections in parallel using Gemini 2.5 Flash
    const [prospectInfo, offerInfo, whySixtySeconds] = await Promise.allSettled([
      generateProspectInfo(prospectFirstName, prospectLastName, domain),
      generateOfferInfo(domain),
      generateWhySixtySeconds(domain),
    ]);

    // Extract results (handle failures gracefully)
    const prospectInfoResult = prospectInfo.status === 'fulfilled' ? prospectInfo.value : undefined;
    const offerInfoResult = offerInfo.status === 'fulfilled' ? offerInfo.value : undefined;
    const whySixtySecondsResult = whySixtySeconds.status === 'fulfilled' ? whySixtySeconds.value : undefined;

    // Log any failures
    if (prospectInfo.status === 'rejected') {
    }
    if (offerInfo.status === 'rejected') {
    }
    if (whySixtySeconds.status === 'rejected') {
    }

    // Add location and timezone to prospect info
    const prospectTimezone = lead.contact_timezone || lead.meeting_timezone;
    const prospectLocation = getTimezoneLocation(prospectTimezone);
    const enrichedProspectInfo = prospectInfoResult ? {
      ...prospectInfoResult,
      location: prospectLocation || undefined,
      timezone: prospectTimezone || undefined,
    } : undefined;

    // If all three calls failed, fall back to static plan
    if (!prospectInfoResult && !offerInfoResult && !whySixtySecondsResult) {
      return buildFallbackPlan(lead, research);
    }

    return {
      prospect_info: enrichedProspectInfo,
      offer_info: offerInfoResult,
      why_sixty_seconds: whySixtySecondsResult,
      company_info: buildCompanyInfoFromResearch(research, lead),
    };
  } catch (error) {
    return buildFallbackPlan(lead, research);
  }
}

function extractDomainFromEmail(email: string): string | null {
  if (!email || !email.includes("@")) {
    return null;
  }
  const parts = email.split("@");
  if (parts.length !== 2) {
    return null;
  }
  return parts[1].toLowerCase().trim();
}

async function generateProspectInfo(
  firstName: string,
  lastName: string,
  domain: string,
): Promise<ProspectInfo | undefined> {
  if (!GEMINI_API_KEY && !OPENROUTER_API_KEY) {
    return undefined;
  }

  try {
    const prompt = `I am preparing for a meeting with ${firstName} ${lastName}, from ${domain}. 

Provide a concise summary in JSON format with the following structure:
{
  "role_and_responsibilities": "Brief description of their role (max 150 words)",
  "background": "Key professional background points (max 200 words)",
  "key_concerns": ["concern 1", "concern 2", "concern 3"]
}

Important: 
- Be direct and factual, no introductory phrases like "Here's a summary" or "Background:"
- Focus on actionable insights for personalizing the call
- Keep it concise and relevant`;

    const response = await callGeminiAPI(prompt);
    if (!response) {
      return undefined;
    }

    // Clean verbose intros and parse JSON first, then fall back to text parsing
    const cleanedResponse = removeVerboseIntro(response);
    return parseProspectInfoFromText(cleanedResponse);
  } catch (error) {
    return undefined;
  }
}

async function generateOfferInfo(domain: string): Promise<OfferInfo | undefined> {
  if (!GEMINI_API_KEY && !OPENROUTER_API_KEY) {
    return undefined;
  }

  try {
    const prompt = `What does ${domain} offer? Provide the answer in JSON format:

{
  "what_they_need": "Brief summary of their main services/products (max 200 words)",
  "their_goals": ["service 1", "service 2", "service 3", "service 4"],
  "decision_criteria": ["feature 1", "feature 2", "feature 3"]
}

Important:
- Be direct, no introductory phrases
- Focus on what they offer, not what they need
- Keep under 400 words total`;

    const response = await callGeminiAPI(prompt);
    if (!response) {
      return undefined;
    }

    // Clean verbose intros and parse
    const cleanedResponse = removeVerboseIntro(response);
    return parseOfferInfoFromText(cleanedResponse);
  } catch (error) {
    return undefined;
  }
}

async function generateWhySixtySeconds(domain: string): Promise<WhySixtySeconds | undefined> {
  if (!GEMINI_API_KEY && !OPENROUTER_API_KEY) {
    return undefined;
  }

  try {
    const prompt = `Sixty Seconds offers B2B focused email outreach, multichannel advertising, video creation, and smart workflows for attraction. We can work with B2C but mainly on advertising and creative support.

Where would ${domain} get the most benefit? Provide answer in JSON format:

{
  "fit_assessment": "Brief assessment of primary fit (max 150 words)",
  "key_alignment_points": ["benefit 1", "benefit 2", "benefit 3"],
  "specific_value_propositions": ["value prop 1", "value prop 2", "value prop 3"]
}

Important:
- Be direct, NO introductory phrases like "Let's break down", "Here's", "Let me", etc.
- Start directly with the assessment - no setup sentences
- Focus on specific, actionable benefits
- Keep concise and relevant`;

    const response = await callGeminiAPI(prompt);
    if (!response) {
      return undefined;
    }

    // Clean verbose intros and parse
    const cleanedResponse = removeVerboseIntro(response);
    return parseWhySixtySecondsFromText(cleanedResponse);
  } catch (error) {
    return undefined;
  }
}

async function callGeminiAPI(prompt: string, retries = 3): Promise<string | null> {
  // Try direct Gemini API first if key is configured
  if (GEMINI_API_KEY) {
    const result = await callDirectGeminiAPI(prompt, retries);
    if (result) {
      return result;
    }
  }

  // Fallback to OpenRouter if direct API fails or is not configured
  if (OPENROUTER_API_KEY) {
    return await callOpenRouterAPI(prompt, retries);
  }
  return null;
}

async function callDirectGeminiAPI(prompt: string, retries = 3): Promise<string | null> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${GEMINI_API_KEY}`;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            topP: 0.9,
            maxOutputTokens: 1000,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: { message: errorText } };
        }

        // Check if it's a retryable error (503, 429, 500)
        const isRetryable = response.status === 503 || response.status === 429 || response.status === 500;
        
        if (isRetryable && attempt < retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff, max 10s
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        return null;
      }

      const data = await response.json();
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      const text = parts
        .map((part: Record<string, unknown>) => (typeof part.text === "string" ? part.text : ""))
        .join("")
        .trim();

      if (!text) {
        return null;
      }
      return text;
    } catch (error) {
      if (attempt < retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      return null;
    }
  }

  return null;
}

async function callOpenRouterAPI(prompt: string, retries = 3): Promise<string | null> {
  const endpoint = "https://openrouter.ai/api/v1/chat/completions";
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://sixtyseconds.video",
          "X-Title": "Sixty Seconds Lead Prep",
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.7,
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: { message: errorText } };
        }

        // Check if it's a retryable error (503, 429, 500)
        const isRetryable = response.status === 503 || response.status === 429 || response.status === 500;
        
        if (isRetryable && attempt < retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff, max 10s
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        return null;
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content?.trim() || "";

      if (!text) {
        return null;
      }
      return text;
    } catch (error) {
      if (attempt < retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      return null;
    }
  }

  return null;
}

// Helper function to remove verbose introductory phrases
function removeVerboseIntro(text: string): string {
  if (!text) return text;
  
  // Remove common verbose intro patterns
  const introPatterns = [
    /^(background|okay|here's|here is|let me|i'll|i will|i can|this is|let's|lets)[:\-]?\s*/i,
    /^(background|okay|here's|here is|let me|i'll|i will|i can|this is|let's|lets)[:\-]?\s*(a|an|the|some|a concise|a brief|an overview|a summary)/i,
    /^(background|okay|here's|here is|let me|i'll|i will|i can|this is|let's|lets)[:\-]?\s*(a|an|the|some|a concise|a brief|an overview|a summary)\s+(summary|overview|information|details|brief|concise)/i,
    /^.*?(?:here's|here is|let me|i'll|i will|i can|this is|background|let's|lets)[:\-]?\s*(a|an|the|some|a concise|a brief|an overview|a summary)\s+(summary|overview|information|details|brief|concise)\s+of/i,
    // More specific patterns
    /^background:\s*(here's|here is|okay|let me|i'll|i will|i can|this is|let's|lets)\s*(a|an|the|some|a concise|a brief|an overview|a summary)\s+(summary|overview|information|details|brief|concise)\s+of/i,
    /^background:\s*(here's|here is|okay|let's|lets)\s+(a|an|the|some|a concise|a brief|an overview|a summary)\s+(summary|overview|information|details|brief|concise)/i,
    // "Let's break down" patterns
    /^let's\s+break\s+down\s+(where|how|what|why|when)\s+/i,
    /^lets\s+break\s+down\s+(where|how|what|why|when)\s+/i,
    /^let\s+me\s+break\s+down\s+(where|how|what|why|when)\s+/i,
    /^let's\s+break\s+down\s+where\s+.*?\s+would\s+get\s+the\s+most\s+benefit\s+(from|by)\s+/i,
    /^let's\s+break\s+down\s+where\s+.*?\s+would\s+get\s+the\s+most\s+benefit\s+from\s+working\s+with\s+/i,
    /^let's\s+break\s+down\s+where\s+.*?\s+would\s+get\s+the\s+most\s+benefit\s+from\s+working\s+with\s+.*?,\s+considering\s+/i,
  ];
  
  let cleaned = text.trim();
  
  for (const pattern of introPatterns) {
    cleaned = cleaned.replace(pattern, '').trim();
    // Also remove trailing ":" if it exists after removing intro
    cleaned = cleaned.replace(/^:\s*/, '').trim();
  }
  
  // Remove "Background:" prefix if it still exists
  cleaned = cleaned.replace(/^background:\s*/i, '').trim();
  
  // Remove any remaining "Let's break down" patterns that might have been missed
  cleaned = cleaned.replace(/^let's\s+break\s+down\s+/i, '').trim();
  cleaned = cleaned.replace(/^lets\s+break\s+down\s+/i, '').trim();
  
  return cleaned;
}

// Helper function to remove JSON artifacts from text (key names, quotes, braces)
function removeJSONArtifacts(text: string): string {
  if (!text) return text;
  
  let cleaned = text;
  
  // Remove malformed code blocks first (```json { or ``` {)
  cleaned = cleaned.replace(/```\s*(?:json\s*)?\{\s*/g, '');
  cleaned = cleaned.replace(/```\s*(?:json\s*)?/g, '');
  
  // Remove JSON key patterns like "key_name": or "key_name": or partial patterns like _and_responsibilities":
  cleaned = cleaned.replace(/["']?([a-z_]+)["']?\s*:\s*/gi, '');
  cleaned = cleaned.replace(/[a-z_]*_and_[a-z_]*["']?\s*:\s*/gi, '');
  
  // Remove opening braces at the start or after code blocks
  cleaned = cleaned.replace(/^\s*\{\s*/, '');
  cleaned = cleaned.replace(/\s*\{\s*/g, ' ');
  
  // Remove closing braces at the end
  cleaned = cleaned.replace(/\s*\}\s*$/, '');
  cleaned = cleaned.replace(/\s*\}\s*/g, ' ');
  
  // Remove escaped quotes that might be left over
  cleaned = cleaned.replace(/\\"/g, '"');
  
  // Remove leading/trailing quotes if they wrap the entire text
  cleaned = cleaned.replace(/^"\s*(.+?)\s*"$/s, '$1');
  
  // Clean up any remaining JSON structure artifacts
  cleaned = cleaned.replace(/\s*,\s*$/, ''); // Remove trailing commas
  cleaned = cleaned.replace(/^\s*:\s*/, ''); // Remove leading colons
  
  // Remove any remaining orphaned quotes at start/end
  cleaned = cleaned.replace(/^["']+|["']+$/g, '');
  
  // Clean up multiple spaces
  cleaned = cleaned.replace(/\s+/g, ' ');
  
  return cleaned.trim();
}

// Helper function to try parsing JSON first, then fall back to text parsing
function tryParseJSON<T>(text: string, fallbackParser: (text: string) => T | undefined): T | undefined {
  if (!text) return undefined;
  
  // Try to extract JSON from markdown code blocks first
  const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1]);
      return parsed as T;
    } catch (e) {
    }
  }
  
  // Try to extract JSON from the response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed as T;
    } catch (e) {
    }
  }
  
  // Fall back to text parsing
  return fallbackParser(text);
}

function parseProspectInfoFromText(text: string): ProspectInfo | undefined {
  if (!text) {
    return undefined;
  }
  
  // Try JSON parsing first
  const jsonResult = tryParseJSON<ProspectInfo>(text, () => undefined);
  if (jsonResult) {
    // Clean string values in the parsed JSON
    return {
      background: jsonResult.background ? removeJSONArtifacts(jsonResult.background) : undefined,
      role_and_responsibilities: jsonResult.role_and_responsibilities ? removeJSONArtifacts(jsonResult.role_and_responsibilities) : undefined,
      pain_points: jsonResult.pain_points?.map(p => removeJSONArtifacts(p)),
      decision_making_authority: jsonResult.decision_making_authority ? removeJSONArtifacts(jsonResult.decision_making_authority) : undefined,
      communication_preferences: jsonResult.communication_preferences ? removeJSONArtifacts(jsonResult.communication_preferences) : undefined,
      key_concerns: jsonResult.key_concerns?.map(c => removeJSONArtifacts(c)),
      location: jsonResult.location ? removeJSONArtifacts(jsonResult.location) : undefined,
      timezone: jsonResult.timezone ? removeJSONArtifacts(jsonResult.timezone) : undefined,
    };
  }

  // Try to extract structured sections
  const sections: Record<string, string> = {};
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  
  let currentSection = "";
  for (const line of lines) {
    // Check if this is a section header
    if (line.match(/^(background|about|profile|role|responsibilities|position|pain points|challenges|decision|authority|concerns|worries)[:\-]/i)) {
      const match = line.match(/^([^:\-]+)[:\-]\s*(.+)$/i);
      if (match) {
        currentSection = match[1].toLowerCase();
        sections[currentSection] = match[2];
      } else {
        currentSection = line.toLowerCase().replace(/[:\-].*$/, "");
      }
    } else if (currentSection && !sections[currentSection]) {
      sections[currentSection] = line;
    } else if (currentSection) {
      sections[currentSection] += " " + line;
    }
  }

  // Extract bullet points for pain points and concerns
  const bulletPoints = text.match(/[•\-\*]\s*(.+?)(?:\n|$)/g)?.map(b => b.replace(/^[•\-\*]\s*/, "").trim()) || [];
  
  // Extract background (first paragraph or section)
  const background = sections.background || sections.about || sections.profile || 
    text.split("\n\n")[0]?.trim() || 
    lines.slice(0, 3).join(" ") || 
    undefined;

  // Extract role
  const role = sections.role || sections.responsibilities || sections.position ||
    text.match(/(?:role|position|title)[:\-]?\s*(.+?)(?:\n|$)/i)?.[1]?.trim() ||
    undefined;
  
  // Clean extracted values
  const cleanedBackground = background ? removeJSONArtifacts(background) : undefined;
  const cleanedRole = role ? removeJSONArtifacts(role) : undefined;

  // Extract pain points
  const painPoints = sections["pain points"] || sections.challenges || sections.issues
    ? [sections["pain points"] || sections.challenges || sections.issues]
    : bulletPoints.length > 0
    ? bulletPoints.slice(0, 5)
    : undefined;

  // Extract decision authority
  const authority = sections.decision || sections.authority ||
    text.match(/(?:decision|authority|influence)[:\-]?\s*(.+?)(?:\n|$)/i)?.[1]?.trim() ||
    undefined;

  // Extract concerns
  const concerns = sections.concerns || sections.worries ||
    bulletPoints.length > 5
    ? bulletPoints.slice(5, 8)
    : undefined;

  return {
    background: cleanedBackground,
    role_and_responsibilities: cleanedRole,
    pain_points: painPoints?.map(p => removeJSONArtifacts(p)),
    decision_making_authority: authority ? removeJSONArtifacts(authority) : undefined,
    key_concerns: concerns?.map(c => removeJSONArtifacts(c)),
  };
}

function parseOfferInfoFromText(text: string): OfferInfo | undefined {
  if (!text) {
    return undefined;
  }
  
  // Try JSON parsing first
  const jsonResult = tryParseJSON<OfferInfo>(text, () => undefined);
  if (jsonResult) {
    // Clean string values in the parsed JSON
    return {
      what_they_need: jsonResult.what_they_need ? removeJSONArtifacts(jsonResult.what_they_need) : undefined,
      their_goals: jsonResult.their_goals?.map(g => removeJSONArtifacts(g)),
      timeline: jsonResult.timeline ? removeJSONArtifacts(jsonResult.timeline) : undefined,
      budget_indicator: jsonResult.budget_indicator ? removeJSONArtifacts(jsonResult.budget_indicator) : undefined,
      decision_criteria: jsonResult.decision_criteria?.map(c => removeJSONArtifacts(c)),
    };
  }

  // Extract bullet points (primary source of information)
  const bulletPoints = text.match(/[•\-\*]\s*(.+?)(?:\n|$)/g)?.map(b => b.replace(/^[•\-\*]\s*/, "").trim()) || [];
  
  // Extract what they offer/need (first paragraph or first bullet points)
  const whatTheyNeed = text.match(/(?:offer|provide|services|products|need|looking for)[:\-]?\s*(.+?)(?:\n\n|\n[•\-\*]|$)/i)?.[1]?.trim() ||
    bulletPoints.length > 0
    ? bulletPoints.slice(0, 3).join(". ")
    : text.split("\n\n")[0]?.trim() ||
    text.split("\n")[0]?.trim() ||
    undefined;

  // Extract goals (from bullet points or text)
  const goalsMatch = text.match(/(?:goals|objectives|aims|targets)[:\-]?\s*([^\n]+)/i);
  const goals = goalsMatch 
    ? [goalsMatch[1].trim()]
    : bulletPoints.length > 3
    ? bulletPoints.slice(3, 8)
    : bulletPoints.slice(0, 5);

  // Clean extracted values
  const cleanedWhatTheyNeed = whatTheyNeed ? removeJSONArtifacts(whatTheyNeed) : undefined;
  const cleanedGoals = goals.length > 0 ? goals.map(g => removeJSONArtifacts(g)) : undefined;
  const cleanedCriteria = bulletPoints.length > 8 ? bulletPoints.slice(8, 11).map(c => removeJSONArtifacts(c)) : undefined;
  
  return {
    what_they_need: cleanedWhatTheyNeed,
    their_goals: cleanedGoals,
    timeline: undefined,
    budget_indicator: undefined,
    decision_criteria: cleanedCriteria,
  };
}

function parseWhySixtySecondsFromText(text: string): WhySixtySeconds | undefined {
  if (!text) {
    return undefined;
  }
  
  // Try JSON parsing first
  const jsonResult = tryParseJSON<WhySixtySeconds>(text, () => undefined);
  if (jsonResult) {
    // Clean string values in the parsed JSON
    return {
      fit_assessment: jsonResult.fit_assessment ? removeJSONArtifacts(jsonResult.fit_assessment) : undefined,
      key_alignment_points: jsonResult.key_alignment_points?.map(a => removeJSONArtifacts(a)),
      specific_value_propositions: jsonResult.specific_value_propositions?.map(p => removeJSONArtifacts(p)),
      potential_objections: jsonResult.potential_objections?.map(o => removeJSONArtifacts(o)),
      competitive_advantages: jsonResult.competitive_advantages?.map(a => removeJSONArtifacts(a)),
    };
  }

  // Extract bullet points (primary source)
  const bulletPoints = text.match(/[•\-\*]\s*(.+?)(?:\n|$)/g)?.map(b => b.replace(/^[•\-\*]\s*/, "").trim()) || [];
  
  // Extract fit assessment (first paragraph, before bullets or section headers)
  const fitAssessment = text.match(/(.+?)(?:\n\n|Key|Specific|Potential|Competitive|Alignment|Value|Objection)/i)?.[1]?.trim() ||
    text.split("\n\n")[0]?.trim() ||
    (bulletPoints.length === 0 ? text.split("\n").slice(0, 3).join(" ") : undefined) ||
    undefined;

  // Extract sections by keywords
  const sections: Record<string, string[]> = {};
  let currentSection = "";
  
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    if (trimmed.match(/^(key alignment|alignment points|benefits|addresses)/i)) {
      currentSection = "alignment";
    } else if (trimmed.match(/^(value proposition|specific value|tailored value)/i)) {
      currentSection = "value";
    } else if (trimmed.match(/^(potential objection|objections|concerns|challenges)/i)) {
      currentSection = "objections";
    } else if (trimmed.match(/^(competitive advantage|advantages|differentiators|unique)/i)) {
      currentSection = "advantages";
    } else if (trimmed.match(/^[•\-\*]/)) {
      const bullet = trimmed.replace(/^[•\-\*]\s*/, "");
      if (currentSection) {
        if (!sections[currentSection]) sections[currentSection] = [];
        sections[currentSection].push(bullet);
      }
    }
  }

  // Use sections if found, otherwise use bullet points
  const alignmentPoints = sections.alignment?.length > 0 
    ? sections.alignment 
    : bulletPoints.slice(0, 3);
  
  const valueProps = sections.value?.length > 0
    ? sections.value
    : bulletPoints.slice(3, 6);
  
  const objections = sections.objections?.length > 0
    ? sections.objections
    : bulletPoints.slice(6, 8);
  
  const advantages = sections.advantages?.length > 0
    ? sections.advantages
    : bulletPoints.slice(8, 10);
  
  // Clean extracted values
  const cleanedFitAssessment = fitAssessment ? removeJSONArtifacts(fitAssessment) : undefined;
  const cleanedAlignmentPoints = alignmentPoints.length > 0 ? alignmentPoints.map(a => removeJSONArtifacts(a)) : undefined;
  const cleanedValueProps = valueProps.length > 0 ? valueProps.map(p => removeJSONArtifacts(p)) : undefined;
  const cleanedObjections = objections.length > 0 ? objections.map(o => removeJSONArtifacts(o)) : undefined;
  const cleanedAdvantages = advantages.length > 0 ? advantages.map(a => removeJSONArtifacts(a)) : undefined;
  
  return {
    fit_assessment: cleanedFitAssessment,
    key_alignment_points: cleanedAlignmentPoints,
    specific_value_propositions: cleanedValueProps,
    potential_objections: cleanedObjections,
    competitive_advantages: cleanedAdvantages,
  };
}

function buildCompanyInfoFromResearch(
  research: CompanyResearch | null,
  lead: LeadRecord,
): CompanyInfo | undefined {
  if (!research && !lead.company) {
    return undefined;
  }

  const companyDescription = lead.company?.description || null;
  const companyIndustry = lead.company?.industry || null;
  const companySize = lead.company?.size || null;
  const businessModel = companyDescription 
    ? companyDescription 
    : companyIndustry 
    ? `Operates in the ${companyIndustry} industry${companySize ? ` with ${companySize}` : ""}.`
    : undefined;

  return {
    business_model: businessModel,
    current_challenges: research?.strategic_priorities || undefined,
    growth_trajectory: research?.headline || undefined,
    competitive_landscape: companyIndustry 
      ? `Competitive landscape in ${companyIndustry} to be discussed on call`
      : undefined,
    technology_stack: companySize
      ? [`Likely using tools appropriate for ${companySize} company`]
      : undefined,
    recent_news_highlights: research?.recent_news?.slice(0, 3) || undefined,
  };
}

async function replaceLeadPrepNotes(
  supabase: SupabaseClient,
  lead: LeadRecord,
  plan: LeadPrepPlan,
  now: string,
): Promise<void> {
  await supabase
    .from("lead_prep_notes")
    .delete()
    .eq("lead_id", lead.id)
    .eq("is_auto_generated", true);

  const notes = buildLeadPrepNotes(lead, plan, now);
  if (!notes.length) {
    return;
  }

  const { error } = await supabase
    .from("lead_prep_notes")
    .insert(notes);

  if (error) {
    throw error;
  }
}

async function updateLeadSuccess(
  supabase: SupabaseClient,
  lead: LeadRecord,
  plan: LeadPrepPlan,
  research: CompanyResearch | null,
  summary: string,
  now: string,
): Promise<void> {
  const metadata = mergeMetadata(lead.metadata, {
    prep_generated_at: now,
    prep_model: GEMINI_MODEL,
    prep_ai: {
      research_provider: research?.provider ?? null,
      research_summary: research?.summary ?? null,
    },
  });

  const updatePayload: Record<string, unknown> = {
    enrichment_status: "completed",
    enrichment_provider: research ? `${research.provider}+${GEMINI_MODEL}` : GEMINI_MODEL,
    prep_status: "completed",
    prep_summary: summary,
    metadata,
    updated_at: now,
  };

  if (lead.status === "new" || lead.status === "prepping" || !lead.status) {
    updatePayload.status = "ready";
  }

  const { error } = await supabase
    .from("leads")
    .update(updatePayload)
    .eq("id", lead.id);

  if (error) {
    throw error;
  }
}

async function markLeadFailed(
  supabase: SupabaseClient,
  lead: LeadRecord,
  failure: Error,
  now: string,
): Promise<void> {
  const metadata = mergeMetadata(lead.metadata, {
    prep_failed_at: now,
    prep_last_error: failure.message,
  });

  const { error } = await supabase
    .from("leads")
    .update({
      enrichment_status: "failed",
      prep_status: "failed",
      metadata,
      updated_at: now,
    })
    .eq("id", lead.id);

  if (error) {
  }
}

function buildLeadContext(
  lead: LeadRecord,
  research: CompanyResearch | null,
): Record<string, unknown> {
  const intake = extractIntakeResponses(lead.metadata);
  const attendees = extractAttendees(lead.metadata);

  const fullName = [lead.contact_first_name, lead.contact_last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const contactName =
    lead.contact?.full_name ||
    lead.contact_name ||
    (fullName ? fullName : null) ||
    lead.contact_email ||
    null;

  const prospectTimezone = lead.contact_timezone || lead.meeting_timezone;
  const ukTime = lead.meeting_start
    ? formatMeetingTime(lead.meeting_start, prospectTimezone)
    : null;
  const prospectLocation = getTimezoneLocation(prospectTimezone);

  return {
    meeting: {
      title: lead.meeting_title ?? "Discovery Call",
      start_time: lead.meeting_start,
      end_time: lead.meeting_end,
      timezone: lead.meeting_timezone,
      uk_time: ukTime,
      prospect_timezone: prospectTimezone,
      prospect_location: prospectLocation,
      duration_minutes: lead.meeting_duration_minutes,
      description: lead.meeting_description,
      scheduler_name: lead.scheduler_name,
      scheduler_email: lead.scheduler_email,
      priority: lead.priority,
    },
    contact: contactName
      ? {
          name: contactName,
          email: lead.contact?.email ?? lead.contact_email,
          title: lead.contact?.title ?? null,
          phone: lead.contact?.phone ?? lead.contact_phone,
          linkedin_url: lead.contact?.linkedin_url ?? null,
          timezone: lead.contact_timezone,
          location: prospectLocation,
        }
      : null,
    company: lead.company
      ? {
          name: lead.company.name,
          domain: lead.company.domain ?? lead.domain,
          website: lead.company.website,
          industry: lead.company.industry,
          size: lead.company.size,
          description: lead.company.description,
          linkedin_url: lead.company.linkedin_url,
        }
      : lead.domain
      ? {
          name: lead.domain.replace(/^www\./, ""),
          domain: lead.domain,
        }
      : null,
    owner: lead.owner
      ? {
          id: lead.owner.id,
          full_name: [lead.owner.first_name, lead.owner.last_name].filter(Boolean).join(" ") || lead.owner.email || null,
          email: lead.owner.email,
        }
      : null,
    intake_responses: intake,
    attendees,
    research,
  };
}

function buildLeadPrepPrompt(context: Record<string, unknown>): string {
  return `You are a sales intelligence assistant with deep expertise in Sixty Seconds CRM platform. Generate a focused, specific intelligence brief for a sales rep preparing for a discovery call.

## About Sixty Seconds CRM Platform

Sixty Seconds is an enterprise-grade sales CRM and analytics platform designed for high-performance sales teams. Key capabilities:

**Core Platform Features:**
- 4-stage streamlined pipeline: SQL → Opportunity → Verbal → Signed (migrated from legacy 7+ stage systems)
- Automated workflow triggers for smart task generation and proposal workflows
- Real-time pipeline visibility with deal health analytics
- Executive-ready reporting and dashboards without manual spreadsheet work
- Revenue split tracking with separate one-off and MRR (Monthly Recurring Revenue) calculations
- Automated LTV (Lifetime Value) calculations: (MRR × 3) + One-off Revenue
- Smart proposal confirmation workflows that prevent accidental activity creation
- Automated task generation via PostgreSQL triggers with configurable templates
- Contact and company management with fuzzy matching and normalization
- Activity tracking for outbound activities, meetings, and proposals
- Google Calendar integration with manual sync control and event linking

**Key Differentiators:**
- **Automation-First**: Reduces manual pipeline updates by >10%, unlocking significant sales capacity
- **Financial Intelligence**: Built-in revenue split management and automated financial calculations
- **Workflow Intelligence**: Smart task generation based on activity patterns, not just manual entry
- **Admin Controls**: Role-based access with admin-only revenue splitting and deal protection
- **Performance Optimized**: 64% memory reduction, 80% fewer re-renders, 99% faster financial calculations

**Target Use Cases:**
- Sales teams spending >30% of time on manual CRM updates
- Companies needing executive-ready reporting without spreadsheet gymnastics
- Teams requiring seamless handoffs between marketing, sales, and implementation
- Organizations tracking complex revenue splits and MRR calculations
- Sales operations needing automated task generation and proposal workflows

## Lead Context
${JSON.stringify(context, null, 2)}

## Your Task
Generate ONLY the 4 essential sections below. Be SPECIFIC and ACTIONABLE. Avoid generic statements. Base everything on the actual context provided.

Return JSON ONLY matching this schema (include ONLY these 4 sections):
{
  "prospect_info": {
    "background": "Specific professional background based on their title, company, and any available context. What industry experience do they have?",
    "role_and_responsibilities": "Concrete description of their day-to-day role based on title and company context. What decisions do they make?",
    "pain_points": ["Specific pain points they likely face based on their role, company size, industry, and intake responses. Be concrete, not generic."],
    "decision_making_authority": "Specific assessment of their purchasing influence based on title, company size, and meeting context",
    "communication_preferences": "How they prefer to communicate based on meeting type, timezone, and any intake signals",
    "key_concerns": ["Specific concerns they might have based on their company situation, industry, and what they're evaluating"]
  },
  "company_info": {
    "business_model": "How they make money and operate, based on company description, industry, and research",
    "current_challenges": ["Specific business challenges based on company research, industry trends, and company size"],
    "growth_trajectory": "Are they growing, stable, or declining? Why? Based on research, recent news, and company signals",
    "competitive_landscape": "Who they compete with and their market position, based on research and industry context",
    "technology_stack": ["What CRM/sales tools they likely use based on company size, industry, and research"],
    "recent_news_highlights": ["Notable recent developments from research that are relevant to sales conversations"]
  },
  "offer_info": {
    "what_they_need": "What they're looking for based on intake responses, meeting description, and company challenges",
    "their_goals": ["Specific goals they want to achieve, extracted from intake responses and company context"],
    "timeline": "When they need this solved, based on intake responses, meeting urgency, and company signals",
    "budget_indicator": "Budget signals from intake responses, company size, and meeting context",
    "decision_criteria": ["What matters most in their decision, based on intake responses and company priorities"]
  },
  "why_sixty_seconds": {
    "fit_assessment": "2-3 sentences on overall fit. Be SPECIFIC about why Sixty Seconds matches THIS prospect's needs. Reference their actual challenges and how Sixty Seconds addresses them.",
    "key_alignment_points": ["Specific ways Sixty Seconds addresses THEIR specific needs. Reference actual features that solve their pain points."],
    "specific_value_propositions": ["Tailored value props for THIS prospect/company. What specific Sixty Seconds features solve their specific problems?"],
    "potential_objections": ["Likely objections THIS prospect might have based on their company, industry, and situation. Be specific."],
    "competitive_advantages": ["Why Sixty Seconds vs alternatives for THIS specific use case. What makes Sixty Seconds uniquely suited to them?"]
  }
}

CRITICAL REQUIREMENTS:
- Be SPECIFIC and CONCRETE. Avoid generic statements like "improve efficiency" or "better reporting"
- Reference actual data from the context: intake responses, company research, meeting details
- For "why_sixty_seconds", demonstrate deep knowledge of Sixty Seconds features and how they specifically solve THIS prospect's problems
- If information is not available, say "To be discovered on call" rather than making generic assumptions
- Meeting time format: Include UK time and prospect's local time if available (e.g., "Thu, 13 Nov, 15:00 UK time (10:00 AM EST - their local time)")
- Location: Include prospect location if timezone is available

Respond with JSON only.`;
}

function buildLeadPrepNotes(
  lead: LeadRecord,
  plan: LeadPrepPlan,
  now: string,
): NoteInsert[] {
  const notes: NoteInsert[] = [];
  const createdBy = lead.owner_id ?? lead.owner?.id ?? null;

  const pushNote = (
    note: Omit<NoteInsert, "created_at" | "updated_at" | "sort_order">,
  ) => {
    const body = note.body.trim();
    if (!body) {
      return;
    }

    notes.push({
      ...note,
      sort_order: notes.length,
      created_at: now,
      updated_at: now,
    });
  };

  // Helper function to truncate and clean text at sentence boundaries
  // We keep a generous threshold so the UI can show full insights while
  // still preventing runaway responses that would overwhelm the layout.
  const truncateText = (text: string, maxLength: number = 200): string => {
    if (!text) return "";
    const cleaned = text.trim().replace(/\s+/g, " ");

    // Always allow substantial context before truncating so we don't cut
    // legitimate insights short on the leads page.
    const MIN_TRUNCATION_THRESHOLD = 1200;
    const effectiveMax = Math.max(maxLength, MIN_TRUNCATION_THRESHOLD);

    if (cleaned.length <= effectiveMax) return cleaned;
    
    // Try to find complete sentences first (ending with . ! ?)
    const sentenceEndRegex = /[.!?]\s+/g;
    let lastSentenceEnd = -1;
    let match;
    
    while ((match = sentenceEndRegex.exec(cleaned)) !== null) {
      if (match.index + match[0].length <= effectiveMax) {
        lastSentenceEnd = match.index + match[0].length;
      } else {
        break;
      }
    }
    
    // If we found a sentence end that's reasonable (at least 60% of the limit), use it
    if (lastSentenceEnd > effectiveMax * 0.6) {
      return cleaned.slice(0, lastSentenceEnd).trim();
    }
    
    // Otherwise, find the last space, period, comma, or newline before the limit
    const truncated = cleaned.slice(0, effectiveMax);
    const lastSpace = truncated.lastIndexOf(' ');
    const lastPeriod = truncated.lastIndexOf('.');
    const lastComma = truncated.lastIndexOf(',');
    const lastNewline = truncated.lastIndexOf('\n');
    
    // Use the best cut point (prefer sentence endings, then word boundaries)
    const cutPoints = [lastPeriod, lastComma, lastNewline, lastSpace].filter(p => p > 0);
    const bestCutPoint = cutPoints.length > 0 ? Math.max(...cutPoints) : effectiveMax;
    
    // Only use the cut point if it's not too close to the start (at least 70% of the limit)
    // This ensures we don't cut off too much content
    const finalCut = bestCutPoint > effectiveMax * 0.7 ? bestCutPoint : effectiveMax;
    
    // Add 1 to include the punctuation if we cut at a period or comma
    const includePunctuation = (lastPeriod > 0 && finalCut === lastPeriod) || 
                               (lastComma > 0 && finalCut === lastComma);
    const cutLength = includePunctuation ? finalCut + 1 : finalCut;
    
    return cleaned.slice(0, cutLength).trim();
  };

  // Helper function to extract key points from verbose text
  const extractKeyPoints = (text: string, maxPoints: number = 3): string[] => {
    if (!text) return [];
    const sentences = text.split(/[.!?]\s+/).filter(s => s.trim().length > 20);
    return sentences.slice(0, maxPoints).map(s => s.trim());
  };

  // Helper to clean text - remove verbose intros, JSON artifacts, but preserve intentional bold for key info
  const cleanFieldText = (text: string | null | undefined): string => {
    if (!text) return '';
    let cleaned = removeVerboseIntro(text);
    
    // Remove malformed code blocks first (before JSON artifact removal)
    cleaned = cleaned.replace(/```\s*(?:json\s*)?\{\s*/g, '');
    cleaned = cleaned.replace(/```\s*(?:json\s*)?/g, '');
    cleaned = cleaned.replace(/```/g, ''); // Remove any remaining code block markers
    
    // Remove JSON artifacts (key names, quotes, braces)
    cleaned = removeJSONArtifacts(cleaned);
    
    // Remove any remaining malformed JSON patterns
    cleaned = cleaned.replace(/^\s*[{"']+\s*/, ''); // Remove leading quotes/braces
    cleaned = cleaned.replace(/\s*[}"']+\s*$/, ''); // Remove trailing quotes/braces
    
    // Clean up multiple spaces and normalize whitespace
    cleaned = cleaned.replace(/\s+/g, ' ');
    
    // Preserve markdown - let frontend handle rendering
    // Only clean up truly orphaned markers (at end of string without pair)
    // Don't remove properly paired **text** markers
    return cleaned.trim();
  };

  // Helper to add bold formatting for names, titles, and key terms
  const boldKeyInfo = (text: string, names: string[], titles: string[]): string => {
    if (!text) return text;
    let formatted = text;
    
    // Bold names
    names.forEach(name => {
      if (name && name.trim()) {
        const regex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        formatted = formatted.replace(regex, `**${name}**`);
      }
    });
    
    // Bold titles
    titles.forEach(title => {
      if (title && title.trim()) {
        const regex = new RegExp(`\\b${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        formatted = formatted.replace(regex, `**${title}**`);
      }
    });
    
    return formatted;
  };

  // 1. About the Prospect
  if (plan.prospect_info) {
    const prospectLines: string[] = [];
    
    // Extract prospect name and title for bold formatting
    const prospectName = lead.contact_name || lead.contact?.full_name || '';
    const prospectTitle = lead.contact?.title || plan.prospect_info.role_and_responsibilities?.split(' ').slice(0, 3).join(' ') || '';
    const names = prospectName ? prospectName.split(' ').filter(n => n.length > 2) : [];
    const titles = prospectTitle ? [prospectTitle] : [];
    
    // Role - most important, keep concise, preserve markdown, bold name/title
    if (plan.prospect_info.role_and_responsibilities) {
      let roleText = cleanFieldText(truncateText(plan.prospect_info.role_and_responsibilities, 150));
      if (roleText) {
        roleText = boldKeyInfo(roleText, names, titles);
        prospectLines.push(`**Role:** ${roleText}`);
      }
    }
    
    // Background - extract key points only, remove verbose intros, bold key info
    if (plan.prospect_info.background) {
      let cleanedBackground = cleanFieldText(plan.prospect_info.background);
      // If background is still very long after cleaning, extract key points
      if (cleanedBackground.length > 200) {
        const keyPoints = extractKeyPoints(cleanedBackground, 2);
        if (keyPoints.length > 0) {
          const cleanedPoints = keyPoints
            .map(p => cleanFieldText(p))
            .map(p => boldKeyInfo(p, names, titles))
            .filter(Boolean);
          if (cleanedPoints.length > 0) {
            prospectLines.push(`**Background:** ${cleanedPoints.join(" ")}`);
          }
        }
      } else if (cleanedBackground) {
        // If it's already concise, use it directly
        cleanedBackground = boldKeyInfo(cleanedBackground, names, titles);
        prospectLines.push(`**Background:** ${cleanedBackground}`);
      }
    }
    
    // Location & Timezone - concise
    const locationParts: string[] = [];
    if (plan.prospect_info.location) {
      locationParts.push(plan.prospect_info.location);
    }
    if (plan.prospect_info.timezone && !plan.prospect_info.timezone.includes(plan.prospect_info.location || "")) {
      locationParts.push(plan.prospect_info.timezone);
    }
    if (locationParts.length > 0) {
      prospectLines.push(`**Location:** ${locationParts.join(", ")}`);
    }
    
    // Key concerns - limit to top 3, bold key info
    if (plan.prospect_info.key_concerns?.length) {
      const topConcerns = plan.prospect_info.key_concerns
        .slice(0, 3)
        .map(c => {
          let cleaned = cleanFieldText(truncateText(c, 100));
          return boldKeyInfo(cleaned, names, titles);
        })
        .filter(Boolean);
      if (topConcerns.length > 0) {
        prospectLines.push(`**Key Points:**\n${formatBulletList(topConcerns)}`);
      }
    }

    if (prospectLines.length) {
      pushNote({
        lead_id: lead.id,
        note_type: "insight",
        title: "About the Prospect",
        body: prospectLines.join("\n\n"),
        created_by: createdBy,
        is_auto_generated: true,
        is_pinned: true,
        metadata: {
          type: "prospect_info",
        },
      });
    }
  }

  // 2. About the Company
  if (plan.company_info) {
    const companyInfoLines: string[] = [];
    if (plan.company_info.business_model) {
      companyInfoLines.push(`Business Model: ${plan.company_info.business_model}`);
    }
    if (plan.company_info.current_challenges?.length) {
      companyInfoLines.push(`Current Challenges:\n${formatBulletList(plan.company_info.current_challenges)}`);
    }
    if (plan.company_info.growth_trajectory) {
      companyInfoLines.push(`Growth Trajectory: ${plan.company_info.growth_trajectory}`);
    }
    if (plan.company_info.competitive_landscape) {
      companyInfoLines.push(`Competitive Position: ${plan.company_info.competitive_landscape}`);
    }
    if (plan.company_info.technology_stack?.length) {
      companyInfoLines.push(`Technology Stack:\n${formatBulletList(plan.company_info.technology_stack)}`);
    }
    if (plan.company_info.recent_news_highlights?.length) {
      companyInfoLines.push(`Recent Developments:\n${formatBulletList(plan.company_info.recent_news_highlights)}`);
    }

    if (companyInfoLines.length) {
      pushNote({
        lead_id: lead.id,
        note_type: "insight",
        title: "About the Company",
        body: companyInfoLines.join("\n\n"),
        created_by: createdBy,
        is_auto_generated: true,
        is_pinned: true,
        metadata: {
          type: "company_info",
        },
      });
    }
  }

  // 3. Their Offer & Needs
  if (plan.offer_info) {
    const offerLines: string[] = [];
    
    // Extract company name for bold formatting
    const companyName = lead.company?.name || lead.domain || '';
    const companyNames = companyName ? [companyName] : [];
    
    // What they offer - concise summary, bold company name
    if (plan.offer_info.what_they_need) {
      let summary = cleanFieldText(truncateText(plan.offer_info.what_they_need, 200));
      if (summary) {
        summary = boldKeyInfo(summary, companyNames, []);
        offerLines.push(`**What They Offer:** ${summary}`);
      }
    }
    
    // Key goals - limit to top 4, bold key terms
    if (plan.offer_info.their_goals?.length) {
      const topGoals = plan.offer_info.their_goals
        .slice(0, 4)
        .map(g => {
          let cleaned = cleanFieldText(truncateText(g, 80));
          return boldKeyInfo(cleaned, companyNames, []);
        })
        .filter(Boolean);
      if (topGoals.length > 0) {
        offerLines.push(`**Key Services:**\n${formatBulletList(topGoals)}`);
      }
    }
    
    // Decision criteria - top 3 only, bold key terms
    if (plan.offer_info.decision_criteria?.length) {
      const topCriteria = plan.offer_info.decision_criteria
        .slice(0, 3)
        .map(c => {
          let cleaned = cleanFieldText(truncateText(c, 80));
          return boldKeyInfo(cleaned, companyNames, []);
        })
        .filter(Boolean);
      if (topCriteria.length > 0) {
        offerLines.push(`**Notable Features:**\n${formatBulletList(topCriteria)}`);
      }
    }

    if (offerLines.length) {
      pushNote({
        lead_id: lead.id,
        note_type: "insight",
        title: "Their Offer & Needs",
        body: offerLines.join("\n\n"),
        created_by: createdBy,
        is_auto_generated: true,
        is_pinned: true,
        metadata: {
          type: "offer_info",
        },
      });
    }
  }

  // 4. Why Sixty Seconds?
  if (plan.why_sixty_seconds) {
    const whyLines: string[] = [];
    
    // Extract company name for bold formatting
    const companyName = lead.company?.name || lead.domain || '';
    const companyNames = companyName ? [companyName] : [];
    
    // Fit assessment - concise, bold company name, remove verbose intros
    if (plan.why_sixty_seconds.fit_assessment) {
      let assessment = plan.why_sixty_seconds.fit_assessment;
      // Remove verbose intros first, then clean and truncate
      assessment = removeVerboseIntro(assessment);
      assessment = cleanFieldText(truncateText(assessment, 200));
      if (assessment) {
        assessment = boldKeyInfo(assessment, companyNames, []);
        whyLines.push(`**Primary Fit:** ${assessment}`);
      }
    }
    
    // Key alignment - top 3, bold key terms
    if (plan.why_sixty_seconds.key_alignment_points?.length) {
      const topAlignments = plan.why_sixty_seconds.key_alignment_points
        .slice(0, 3)
        .map(a => {
          let cleaned = cleanFieldText(truncateText(a, 100));
          return boldKeyInfo(cleaned, companyNames, []);
        })
        .filter(Boolean);
      if (topAlignments.length > 0) {
        whyLines.push(`**Key Benefits:**\n${formatBulletList(topAlignments)}`);
      }
    }
    
    // Value props - top 3, bold key terms
    if (plan.why_sixty_seconds.specific_value_propositions?.length) {
      const topProps = plan.why_sixty_seconds.specific_value_propositions
        .slice(0, 3)
        .map(p => {
          let cleaned = cleanFieldText(truncateText(p, 100));
          return boldKeyInfo(cleaned, companyNames, []);
        })
        .filter(Boolean);
      if (topProps.length > 0) {
        whyLines.push(`**How We Help:**\n${formatBulletList(topProps)}`);
      }
    }

    if (whyLines.length) {
      pushNote({
        lead_id: lead.id,
        note_type: "insight",
        title: "Why Sixty Seconds?",
        body: whyLines.join("\n\n"),
        created_by: createdBy,
        is_auto_generated: true,
        is_pinned: true,
        metadata: {
          type: "why_sixty_seconds",
        },
      });
    }
  }

  return notes;
}

function normalizeLeadPrepPlan(raw: any, fallback: LeadPrepPlan): LeadPrepPlan {
  return {
    prospect_info: normalizeProspectInfo(raw.prospect_info, fallback.prospect_info),
    company_info: normalizeCompanyInfo(raw.company_info, fallback.company_info),
    offer_info: normalizeOfferInfo(raw.offer_info, fallback.offer_info),
    why_sixty_seconds: normalizeWhySixtySeconds(raw.why_sixty_seconds, fallback.why_sixty_seconds),
  };
}

function normalizeProspectInfo(value: unknown, fallback: ProspectInfo | undefined): ProspectInfo | undefined {
  if (!value || typeof value !== "object") return fallback;
  const obj = value as Record<string, unknown>;
  return {
    background: typeof obj.background === "string" ? obj.background.trim() : fallback?.background,
    role_and_responsibilities: typeof obj.role_and_responsibilities === "string" ? obj.role_and_responsibilities.trim() : fallback?.role_and_responsibilities,
    pain_points: Array.isArray(obj.pain_points) ? toStringArray(obj.pain_points, fallback?.pain_points ?? []) : fallback?.pain_points,
    decision_making_authority: typeof obj.decision_making_authority === "string" ? obj.decision_making_authority.trim() : fallback?.decision_making_authority,
    communication_preferences: typeof obj.communication_preferences === "string" ? obj.communication_preferences.trim() : fallback?.communication_preferences,
    key_concerns: Array.isArray(obj.key_concerns) ? toStringArray(obj.key_concerns, fallback?.key_concerns ?? []) : fallback?.key_concerns,
    location: typeof obj.location === "string" ? obj.location.trim() : fallback?.location,
    timezone: typeof obj.timezone === "string" ? obj.timezone.trim() : fallback?.timezone,
  };
}

function normalizeCompanyInfo(value: unknown, fallback: CompanyInfo | undefined): CompanyInfo | undefined {
  if (!value || typeof value !== "object") return fallback;
  const obj = value as Record<string, unknown>;
  return {
    business_model: typeof obj.business_model === "string" ? obj.business_model.trim() : fallback?.business_model,
    current_challenges: Array.isArray(obj.current_challenges) ? toStringArray(obj.current_challenges, fallback?.current_challenges ?? []) : fallback?.current_challenges,
    growth_trajectory: typeof obj.growth_trajectory === "string" ? obj.growth_trajectory.trim() : fallback?.growth_trajectory,
    competitive_landscape: typeof obj.competitive_landscape === "string" ? obj.competitive_landscape.trim() : fallback?.competitive_landscape,
    technology_stack: Array.isArray(obj.technology_stack) ? toStringArray(obj.technology_stack, fallback?.technology_stack ?? []) : fallback?.technology_stack,
    recent_news_highlights: Array.isArray(obj.recent_news_highlights) ? toStringArray(obj.recent_news_highlights, fallback?.recent_news_highlights ?? []) : fallback?.recent_news_highlights,
  };
}

function normalizeOfferInfo(value: unknown, fallback: OfferInfo | undefined): OfferInfo | undefined {
  if (!value || typeof value !== "object") return fallback;
  const obj = value as Record<string, unknown>;
  return {
    what_they_need: typeof obj.what_they_need === "string" ? obj.what_they_need.trim() : fallback?.what_they_need,
    their_goals: Array.isArray(obj.their_goals) ? toStringArray(obj.their_goals, fallback?.their_goals ?? []) : fallback?.their_goals,
    timeline: typeof obj.timeline === "string" ? obj.timeline.trim() : fallback?.timeline,
    budget_indicator: typeof obj.budget_indicator === "string" ? obj.budget_indicator.trim() : fallback?.budget_indicator,
    decision_criteria: Array.isArray(obj.decision_criteria) ? toStringArray(obj.decision_criteria, fallback?.decision_criteria ?? []) : fallback?.decision_criteria,
  };
}

function normalizeWhySixtySeconds(value: unknown, fallback: WhySixtySeconds | undefined): WhySixtySeconds | undefined {
  if (!value || typeof value !== "object") return fallback;
  const obj = value as Record<string, unknown>;
  return {
    fit_assessment: typeof obj.fit_assessment === "string" ? obj.fit_assessment.trim() : fallback?.fit_assessment,
    key_alignment_points: Array.isArray(obj.key_alignment_points) ? toStringArray(obj.key_alignment_points, fallback?.key_alignment_points ?? []) : fallback?.key_alignment_points,
    specific_value_propositions: Array.isArray(obj.specific_value_propositions) ? toStringArray(obj.specific_value_propositions, fallback?.specific_value_propositions ?? []) : fallback?.specific_value_propositions,
    potential_objections: Array.isArray(obj.potential_objections) ? toStringArray(obj.potential_objections, fallback?.potential_objections ?? []) : fallback?.potential_objections,
    competitive_advantages: Array.isArray(obj.competitive_advantages) ? toStringArray(obj.competitive_advantages, fallback?.competitive_advantages ?? []) : fallback?.competitive_advantages,
  };
}

function buildFallbackPlan(
  lead: LeadRecord,
  research: CompanyResearch | null,
): LeadPrepPlan {
  const prospectTimezone = lead.contact_timezone || lead.meeting_timezone;
  const prospectLocation = getTimezoneLocation(prospectTimezone);
  
  // Build more specific prospect info
  const prospectTitle = lead.contact?.title || null;
  const prospectBackground = prospectTitle 
    ? `Based on their title "${prospectTitle}", they likely have decision-making influence in their organization.`
    : "Role and background to be discovered on call.";
  
  // Build more specific company info
  const companyDescription = lead.company?.description || null;
  const companyIndustry = lead.company?.industry || null;
  const companySize = lead.company?.size || null;
  const businessModel = companyDescription 
    ? companyDescription 
    : companyIndustry 
    ? `Operates in the ${companyIndustry} industry${companySize ? ` with ${companySize}` : ""}.`
    : "Business model to be discovered on call.";
  
  const companyChallenges = research?.strategic_priorities?.length
    ? research.strategic_priorities.map(p => `Addressing ${p}`)
    : companyIndustry
    ? [`Common challenges in ${companyIndustry} industry`, "Scaling operations efficiently", "Maintaining competitive advantage"]
    : ["To be discovered on call"];
  
  const growthTrajectory = research?.headline
    ? research.headline
    : companySize
    ? `Company appears to be ${companySize} - growth trajectory to be confirmed on call.`
    : "Growth trajectory to be discovered on call.";
  
  // Build more specific offer info from intake
  const intake = extractIntakeResponses(lead.metadata);
  const intakeGoals = intake.filter(r => 
    r.label?.toLowerCase().includes('goal') || 
    r.label?.toLowerCase().includes('need') ||
    r.label?.toLowerCase().includes('challenge')
  ).map(r => r.value);
  
  const whatTheyNeed = intakeGoals.length
    ? intakeGoals.join(". ")
    : "To be discovered on call";
  
  const theirGoals = intakeGoals.length > 0
    ? intakeGoals
    : ["Understand how Sixty Seconds can help their sales operations", "Evaluate CRM solutions for their team"];

  const companyName = lead.company?.name || (lead.domain ? lead.domain.replace(/^www\./, "") : "the prospect");

  return {
    prospect_info: {
      background: prospectBackground,
      role_and_responsibilities: prospectTitle || "To be discovered on call",
      decision_making_authority: prospectTitle?.toLowerCase().includes('director') || prospectTitle?.toLowerCase().includes('vp') || prospectTitle?.toLowerCase().includes('head')
        ? "Likely has significant decision-making authority based on title"
        : "To be confirmed on call",
      location: prospectLocation || undefined,
      timezone: prospectTimezone || undefined,
      pain_points: prospectTitle
        ? [`Managing ${prospectTitle.toLowerCase()} responsibilities efficiently`, "Need better visibility into sales operations"]
        : ["To be discovered on call"],
    },
    company_info: {
      business_model: businessModel,
      current_challenges: companyChallenges,
      growth_trajectory: growthTrajectory,
      competitive_landscape: companyIndustry 
        ? `Competitive landscape in ${companyIndustry} to be discussed on call`
        : "To be discovered on call",
      technology_stack: companySize
        ? [`Likely using CRM tools appropriate for ${companySize} company`, "Current tech stack to be confirmed"]
        : ["To be discovered on call"],
      recent_news_highlights: research?.recent_news?.slice(0, 3) || [],
    },
    offer_info: {
      what_they_need: whatTheyNeed,
      their_goals: theirGoals,
      timeline: "To be confirmed on call",
      budget_indicator: companySize 
        ? `Company size (${companySize}) suggests budget availability - to be confirmed`
        : "To be discovered on call",
      decision_criteria: ["To be discovered on call"],
    },
    why_sixty_seconds: {
      fit_assessment: companySize && companyIndustry
        ? `${companyName} appears to be a ${companySize} company in ${companyIndustry}, which aligns well with Sixty Seconds' target market. The platform's automation-first approach and financial intelligence features would address common pain points for companies of this size.`
        : "Fit assessment to be refined based on discovery call findings.",
      key_alignment_points: [
        "Automate manual pipeline updates to unlock >10% capacity.",
        "Deliver executive-ready reporting without spreadsheet gymnastics.",
        "Create repeatable handoffs between marketing, sales, and implementation.",
      ],
      specific_value_propositions: companySize
        ? [`Sixty Seconds' automated pipeline management would reduce manual work for ${companySize} teams`, "Executive-ready reporting without spreadsheet work", "Smart task generation based on activity patterns"]
        : [
            "Automate manual pipeline updates to unlock >10% capacity.",
            "Deliver executive-ready reporting without spreadsheet gymnastics.",
            "Create repeatable handoffs between marketing, sales, and implementation.",
          ],
      potential_objections: ["To be discovered on call"],
      competitive_advantages: ["To be discovered on call"],
    },
  };
}

function formatBulletList(items: string[]): string {
  return items
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => `• ${item}`)
    .join("\n");
}

function formatMeetingTime(
  meetingStart: string | null,
  prospectTimezone: string | null,
): string {
  if (!meetingStart) {
    return "TBD";
  }

  const meetingDate = new Date(meetingStart);
  
  // Format in UK timezone (Europe/London)
  const ukTime = meetingDate.toLocaleString("en-GB", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
  
  // Format in prospect's timezone if available
  const prospectTime = prospectTimezone
    ? meetingDate.toLocaleString("en-GB", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: prospectTimezone,
      })
    : null;

  if (prospectTime && prospectTimezone) {
    // Extract timezone abbreviation (e.g., "GMT", "EST", "PST")
    const tzAbbr = prospectTimezone.split("/").pop()?.replace(/_/g, " ") || prospectTimezone;
    return `${ukTime} UK time (${prospectTime} ${tzAbbr} - their local time)`;
  }

  return `${ukTime} UK time`;
}

function getTimezoneLocation(timezone: string | null): string | null {
  if (!timezone) return null;
  
  // Map common timezones to locations
  const tzMap: Record<string, string> = {
    "America/New_York": "US East Coast",
    "America/Chicago": "US Central",
    "America/Denver": "US Mountain",
    "America/Los_Angeles": "US West Coast",
    "America/Toronto": "Canada (Eastern)",
    "America/Vancouver": "Canada (Pacific)",
    "Europe/London": "UK",
    "Europe/Paris": "Europe (Central)",
    "Europe/Berlin": "Germany",
    "Europe/Madrid": "Spain",
    "Europe/Rome": "Italy",
    "Asia/Dubai": "UAE",
    "Asia/Singapore": "Singapore",
    "Asia/Tokyo": "Japan",
    "Australia/Sydney": "Australia (East)",
    "Australia/Melbourne": "Australia (East)",
    "Pacific/Auckland": "New Zealand",
  };

  return tzMap[timezone] || timezone.split("/").pop()?.replace(/_/g, " ") || null;
}

function mergeMetadata(
  original: Record<string, unknown> | null,
  updates: Record<string, unknown>,
): Record<string, unknown> {
  const base: Record<string, unknown> = original && typeof original === "object"
    ? { ...original }
    : {};

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    base[key] = value;
  }

  return base;
}

function extractIntakeResponses(metadata: Record<string, unknown> | null): IntakeResponse[] {
  if (!metadata || typeof metadata !== "object") {
    return [];
  }

  const result: IntakeResponse[] = [];
  const savvycal = metadata.savvycal as Record<string, unknown> | undefined;
  const fields = savvycal?.fields as Record<string, unknown> | undefined;

  const attendeeFields = Array.isArray(fields?.attendee) ? (fields?.attendee as Array<Record<string, unknown>>) : [];
  const schedulerFields = Array.isArray(fields?.scheduler) ? (fields?.scheduler as Array<Record<string, unknown>>) : [];

  const normalise = (field: Record<string, unknown> | undefined, source: "attendee" | "scheduler") => {
    if (!field) return null;
    const label =
      typeof field.label === "string"
        ? field.label
        : typeof field.name === "string"
        ? field.name
        : typeof field.question === "string"
        ? field.question
        : "Custom Field";

    const rawValue =
      field.value ??
      field.answer ??
      field.response ??
      field.text ??
      null;

    if (rawValue === null || rawValue === undefined) {
      return null;
    }

    let value: string;
    if (Array.isArray(rawValue)) {
      value = rawValue
        .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
        .join(", ");
    } else if (typeof rawValue === "object") {
      value = JSON.stringify(rawValue);
    } else {
      value = String(rawValue);
    }

    if (!value.trim()) {
      return null;
    }

    return {
      label,
      value: value.trim(),
      source,
    } satisfies IntakeResponse;
  };

  attendeeFields.forEach((field) => {
    const normalized = normalise(field, "attendee");
    if (normalized) {
      result.push(normalized);
    }
  });

  schedulerFields.forEach((field) => {
    const normalized = normalise(field, "scheduler");
    if (normalized) {
      result.push(normalized);
    }
  });

  return result;
}

function extractAttendees(metadata: Record<string, unknown> | null): Array<Record<string, unknown>> {
  if (!metadata || typeof metadata !== "object") {
    return [];
  }

  const attendeesRaw = Array.isArray(metadata.attendees)
    ? (metadata.attendees as Array<Record<string, unknown>>)
    : [];

  return attendeesRaw.map((attendee) => ({
    name: typeof attendee.name === "string"
      ? attendee.name
      : typeof attendee.display_name === "string"
      ? attendee.display_name
      : undefined,
    email: typeof attendee.email === "string" ? attendee.email : undefined,
    role: attendee.is_organizer ? "organizer" : "attendee",
    time_zone: typeof attendee.time_zone === "string" ? attendee.time_zone : undefined,
    marketing_opt_in: typeof attendee.marketing_opt_in === "boolean" ? attendee.marketing_opt_in : undefined,
  }));
}

function parseJsonFromText(text: string): any | null {
  if (!text) return null;

  const trimmed = text.trim();

  const cleaned = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  const candidate = cleaned.slice(start, end + 1);

  try {
    return JSON.parse(candidate);
  } catch (_error) {
    return null;
  }
}

function toStringArray(value: unknown, fallback: string[] = []): string[] {
  if (Array.isArray(value)) {
    const result = value
      .map((item) => {
        if (typeof item === "string") {
          return item.trim();
        }
        if (typeof item === "number") {
          return item.toString();
        }
        if (item && typeof item === "object") {
          return JSON.stringify(item);
        }
        return "";
      })
      .filter((item) => Boolean(item));

    if (result.length) {
      return result;
    }
    return fallback;
  }

  if (typeof value === "string") {
    const pieces = value
      .split(/\n|•|-/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (pieces.length) {
      return pieces;
    }
  }

  return [...fallback];
}

/**
 * After successful lead prep, update the company's fact profile with research data.
 * Maps CompanyResearch + LeadPrepPlan.company fields to FactProfileResearchData sections.
 * Only updates profiles that exist and have research_status='pending' or 'researching'.
 */
async function updateFactProfileResearch(
  supabase: SupabaseClient,
  lead: LeadRecord,
  research: CompanyResearch | null,
  plan: LeadPrepPlan,
): Promise<void> {
  if (!lead.domain) return;

  // Find org_id from lead metadata or owner's org membership
  let orgId: string | null = (lead.metadata as any)?.org_id ?? null;
  if (!orgId && lead.owner_id) {
    const { data: membership } = await supabase
      .from("organization_memberships")
      .select("org_id")
      .eq("user_id", lead.owner_id)
      .limit(1)
      .maybeSingle();
    orgId = membership?.org_id ?? null;
  }
  if (!orgId) return;

  // Find the fact profile for this domain
  const { data: profile } = await supabase
    .from("client_fact_profiles")
    .select("id, research_status, research_data")
    .eq("organization_id", orgId)
    .eq("company_domain", lead.domain)
    .eq("is_org_profile", false)
    .maybeSingle();

  if (!profile) return;

  // Only update if research hasn't already been completed by a richer source
  if (profile.research_status === "complete") {
    const existingData = profile.research_data as Record<string, unknown> | null;
    if (existingData?.company_overview && (existingData.company_overview as any)?.description) {
      console.log(`[process-lead-prep] Fact profile ${profile.id} already has complete research, skipping`);
      return;
    }
  }

  // Build partial research data from lead prep findings
  const companyInfo = plan.company_info || {};
  const now = new Date().toISOString();

  const researchData: Record<string, unknown> = {
    company_overview: {
      name: lead.company?.name || lead.domain?.split(".")[0] || "",
      tagline: "",
      description: companyInfo.business_model || research?.summary || "",
      founded_year: null,
      headquarters: "",
      company_type: "",
      website: lead.company?.website || `https://${lead.domain}`,
    },
    market_position: {
      industry: lead.company?.industry || "",
      sub_industries: [],
      target_market: "",
      market_size: "",
      differentiators: [],
      competitors: companyInfo.competitive_landscape ? [companyInfo.competitive_landscape] : [],
    },
    team_leadership: {
      employee_count: null,
      employee_range: lead.company?.size || "",
      key_people: [],
      departments: [],
      hiring_signals: [],
    },
    technology: {
      tech_stack: companyInfo.technology_stack || [],
      platforms: [],
      integrations: [],
    },
    recent_activity: {
      news: (companyInfo.recent_news_highlights || research?.recent_news || []).map(
        (item: string) => ({ title: item, url: "", date: now.split("T")[0] })
      ),
      awards: [],
      milestones: research?.key_metrics || [],
      reviews_summary: {},
    },
  };

  const { error } = await supabase
    .from("client_fact_profiles")
    .update({
      research_data: researchData,
      research_status: "complete",
      research_completed_at: now,
    })
    .eq("id", profile.id);

  if (error) {
    console.error(`[process-lead-prep] Failed to update fact profile ${profile.id}:`, error);
    return;
  }

  console.log(`[process-lead-prep] Updated fact profile ${profile.id} with lead prep research`);
}
