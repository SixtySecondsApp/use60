import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { captureException } from '../_shared/sentryEdge.ts';
import { checkCreditBalance, logAICostEvent } from '../_shared/costTracking.ts';

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const GEMINI_MODEL =
  Deno.env.get("GEMINI_FLASH_MODEL") ??
  Deno.env.get("GEMINI_MODEL") ??
  "gemini-2.5-flash";
const GEMINI_API_KEY =
  Deno.env.get("GEMINI_API_KEY") ??
  Deno.env.get("GOOGLE_GEMINI_API_KEY") ??
  "";

const JSON_HEADERS = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

/**
 * Robust JSON parser for Gemini responses
 * Handles markdown code blocks, trailing text, and malformed JSON
 */
function parseGeminiJSONResponse(text: string): any {
  // Remove markdown code blocks if present
  const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  let jsonString = jsonMatch ? jsonMatch[1] : text;
  
  // Try to extract JSON object from text
  if (!jsonString.trim().startsWith('{')) {
    const objectMatch = jsonString.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      jsonString = objectMatch[0];
    }
  }
  
  // Clean up common issues - remove text before/after JSON
  jsonString = jsonString.trim();
  const firstBrace = jsonString.indexOf('{');
  const lastBrace = jsonString.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    jsonString = jsonString.substring(firstBrace, lastBrace + 1);
  }
  
  // Try parsing first
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    // If parsing fails, try to repair common JSON issues
    try {
      let repaired = jsonString;
      
      // Fix unterminated strings by finding and closing them
      // This handles cases where quotes or newlines break the JSON structure
      let inString = false;
      let escapeNext = false;
      let result: string[] = [];
      
      for (let i = 0; i < repaired.length; i++) {
        const char = repaired[i];
        
        if (escapeNext) {
          result.push(char);
          escapeNext = false;
          continue;
        }
        
        if (char === '\\') {
          result.push(char);
          escapeNext = true;
          continue;
        }
        
        if (char === '"') {
          inString = !inString;
          result.push(char);
          continue;
        }
        
        if (inString) {
          // Inside a string - escape problematic characters
          if (char === '\n' || char === '\r') {
            result.push('\\n');
          } else if (char === '\t') {
            result.push('\\t');
          } else {
            result.push(char);
          }
        } else {
          result.push(char);
        }
      }
      
      // If we ended inside a string, close it
      if (inString) {
        result.push('"');
      }
      
      repaired = result.join('');
      
      // Remove trailing commas
      repaired = repaired.replace(/,(\s*[}\]])/g, '$1');
      
      return JSON.parse(repaired);
    } catch (repairError) {
      // Last resort: try to extract just the fields we need using regex
      const result: any = {};
      
      // Extract fields using regex patterns that handle escaped characters
      // Use patterns that match escaped sequences properly
      const fieldPatterns: Record<string, RegExp> = {
        title: /"title"\s*:\s*"((?:[^"\\]|\\.)*)"/,
        linkedin_url: /"linkedin_url"\s*:\s*"((?:[^"\\]|\\.)*)"/,
        industry: /"industry"\s*:\s*"((?:[^"\\]|\\.)*)"/,
        summary: /"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/,
        description: /"description"\s*:\s*"((?:[^"\\]|\\.)*)"/,
        size: /"size"\s*:\s*"((?:[^"\\]|\\.)*)"/,
        linkedin_url_company: /"linkedin_url"\s*:\s*"((?:[^"\\]|\\.)*)"/,
        address: /"address"\s*:\s*"((?:[^"\\]|\\.)*)"/,
        phone: /"phone"\s*:\s*"((?:[^"\\]|\\.)*)"/,
        confidence: /"confidence"\s*:\s*([0-9.]+)/,
      };
      
      for (const [field, pattern] of Object.entries(fieldPatterns)) {
        const match = jsonString.match(pattern);
        if (match && match[1]) {
          if (field === 'confidence') {
            result.confidence = parseFloat(match[1]);
          } else {
            // Unescape the string value
            const value = match[1]
              .replace(/\\n/g, '\n')
              .replace(/\\t/g, '\t')
              .replace(/\\"/g, '"')
              .replace(/\\\\/g, '\\');
            
            // Map field names
            if (field === 'linkedin_url_company') {
              result.linkedin_url = value;
            } else {
              result[field] = value;
            }
          }
        }
      }
      
      // If we got at least one field, return it
      if (Object.keys(result).length > 0) {
        return result;
      }
      
      throw new Error(`JSON parse failed: ${error instanceof Error ? error.message : 'Unknown error'}. Repair also failed: ${repairError instanceof Error ? repairError.message : 'Unknown error'}`);
    }
  }
}

interface ContactData {
  first_name?: string;
  last_name?: string;
  email: string;
  phone?: string;
  title?: string;
  company_name?: string;
  company_id?: string;
}

interface CompanyData {
  name: string;
  domain?: string;
  website?: string;
  industry?: string;
  size?: string;
}

interface EnrichmentRequest {
  type: 'contact' | 'company';
  id: string;
  contact_data?: ContactData;
  company_data?: CompanyData;
}

interface EnrichedContactData {
  title?: string;
  linkedin_url?: string;
  industry?: string;
  summary?: string;
  confidence?: number;
}

interface EnrichedCompanyData {
  industry?: string;
  size?: 'startup' | 'small' | 'medium' | 'large' | 'enterprise';
  description?: string;
  linkedin_url?: string;
  address?: string;
  phone?: string;
  confidence?: number;
}

interface UsageMetrics {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Call Gemini API to enrich contact data
 */
async function enrichContactWithGemini(
  contactData: ContactData
): Promise<{ enrichedData: EnrichedContactData | null; usage: UsageMetrics | null }> {
  if (!GEMINI_API_KEY) {
    return { enrichedData: null, usage: null };
  }

  try {
    const name = [contactData.first_name, contactData.last_name]
      .filter(Boolean)
      .join(' ') || contactData.email.split('@')[0];
    
    const prompt = `You are a B2B sales data enrichment assistant. Given the following contact information, enrich it with accurate, professional data.

Contact Information:
- Name: ${name}
- Email: ${contactData.email}
- Phone: ${contactData.phone || 'Not provided'}
- Current Title: ${contactData.title || 'Not provided'}
- Company: ${contactData.company_name || 'Not provided'}

CRITICAL: You must return ONLY valid JSON. No markdown code blocks, no explanatory text, no trailing commas. All string values must be properly escaped (use \\n for newlines, \\" for quotes).

Return a JSON object with these fields (omit any fields you cannot determine):
{
  "title": "Accurate job title (if missing or generic, suggest a specific title)",
  "linkedin_url": "LinkedIn profile URL if you can infer it (format: https://linkedin.com/in/username)",
  "industry": "Industry classification (e.g., Technology, Healthcare, Finance, etc.)",
  "summary": "Brief professional summary (1-2 sentences). Escape all quotes and newlines properly.",
  "confidence": 0.5
}

Example of valid JSON:
{"title": "Software Engineer", "industry": "Technology", "summary": "Experienced developer", "confidence": 0.8}`;

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
          temperature: 0.3,
          topP: 0.8,
          maxOutputTokens: 800,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", errorText);
      return { enrichedData: null, usage: null };
    }

    const data = await response.json();
    const usageMetadata = data.usageMetadata || {};
    const usage: UsageMetrics = {
      inputTokens: usageMetadata.promptTokenCount || 0,
      outputTokens: usageMetadata.candidatesTokenCount || 0,
    };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .map((part: Record<string, unknown>) => (typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();

    if (!text) {
      console.error("Empty response from Gemini API");
      return { enrichedData: null, usage };
    }

    // Parse JSON response with robust error handling
    try {
      const parsed = parseGeminiJSONResponse(text);
      return {
        enrichedData: {
          title: parsed.title,
          linkedin_url: parsed.linkedin_url,
          industry: parsed.industry,
          summary: parsed.summary,
          confidence: parsed.confidence || 0.5,
        },
        usage,
      };
    } catch (parseError) {
      console.error("Failed to parse Gemini response:", parseError);
      console.error("Raw response text:", text.substring(0, 500)); // Log first 500 chars for debugging
      return { enrichedData: null, usage };
    }
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return { enrichedData: null, usage: null };
  }
}

/**
 * Call Gemini API to enrich company data
 */
async function enrichCompanyWithGemini(
  companyData: CompanyData
): Promise<{ enrichedData: EnrichedCompanyData | null; usage: UsageMetrics | null }> {
  if (!GEMINI_API_KEY) {
    return { enrichedData: null, usage: null };
  }

  try {
    const prompt = `You are a B2B sales data enrichment assistant. Given the following company information, enrich it with accurate, professional data.

Company Information:
- Name: ${companyData.name}
- Domain: ${companyData.domain || 'Not provided'}
- Website: ${companyData.website || 'Not provided'}
- Current Industry: ${companyData.industry || 'Not provided'}
- Current Size: ${companyData.size || 'Not provided'}

CRITICAL: You must return ONLY valid JSON. No markdown code blocks, no explanatory text, no trailing commas. All string values must be properly escaped (use \\n for newlines, \\" for quotes).

Return a JSON object with these fields (omit any fields you cannot determine):
{
  "industry": "Standardized industry classification (Technology, Healthcare, Finance, Retail, Manufacturing, etc.)",
  "size": "Company size estimate: one of startup, small, medium, large, or enterprise",
  "description": "Professional company description (2-3 sentences). Escape all quotes and newlines properly.",
  "linkedin_url": "LinkedIn company page URL if you can infer it (format: https://linkedin.com/company/companyname)",
  "address": "Company headquarters address if available",
  "phone": "Company phone number if available",
  "confidence": 0.5
}

Example of valid JSON:
{"industry": "Technology", "size": "medium", "description": "Leading software company", "confidence": 0.8}`;

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
          temperature: 0.3,
          topP: 0.8,
          maxOutputTokens: 1000,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", errorText);
      return { enrichedData: null, usage: null };
    }

    const data = await response.json();
    const usageMetadata = data.usageMetadata || {};
    const usage: UsageMetrics = {
      inputTokens: usageMetadata.promptTokenCount || 0,
      outputTokens: usageMetadata.candidatesTokenCount || 0,
    };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .map((part: Record<string, unknown>) => (typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();

    if (!text) {
      console.error("Empty response from Gemini API");
      return { enrichedData: null, usage };
    }

    // Parse JSON response with robust error handling
    try {
      const parsed = parseGeminiJSONResponse(text);
      return {
        enrichedData: {
          industry: parsed.industry,
          size: parsed.size,
          description: parsed.description,
          linkedin_url: parsed.linkedin_url,
          address: parsed.address,
          phone: parsed.phone,
          confidence: parsed.confidence || 0.5,
        },
        usage,
      };
    } catch (parseError) {
      console.error("Failed to parse Gemini response:", parseError);
      console.error("Raw response text:", text.substring(0, 500)); // Log first 500 chars for debugging
      return { enrichedData: null, usage };
    }
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return { enrichedData: null, usage: null };
  }
}

/**
 * Update contact in database with enriched data
 */
async function updateContact(
  supabase: SupabaseClient,
  contactId: string,
  enrichedData: EnrichedContactData,
  userId: string
): Promise<boolean> {
  const updateData: Record<string, unknown> = {};
  
  if (enrichedData.title) updateData.title = enrichedData.title;
  if (enrichedData.linkedin_url) updateData.linkedin_url = enrichedData.linkedin_url;
  if (enrichedData.industry) updateData.notes = `Industry: ${enrichedData.industry}${enrichedData.summary ? `\n\n${enrichedData.summary}` : ''}`;
  
  // Only update fields that are missing or if confidence is high
  if (Object.keys(updateData).length === 0) {
    return false;
  }

  const { error } = await supabase
    .from('contacts')
    .update(updateData)
    .eq('id', contactId)
    .eq('owner_id', userId); // Ensure user owns the contact

  if (error) {
    console.error("Error updating contact:", error);
    return false;
  }

  return true;
}

/**
 * Update company in database with enriched data
 */
async function updateCompany(
  supabase: SupabaseClient,
  companyId: string,
  enrichedData: EnrichedCompanyData,
  userId: string
): Promise<boolean> {
  const updateData: Record<string, unknown> = {};
  
  if (enrichedData.industry) updateData.industry = enrichedData.industry;
  if (enrichedData.size) updateData.size = enrichedData.size;
  if (enrichedData.description) updateData.description = enrichedData.description;
  if (enrichedData.linkedin_url) updateData.linkedin_url = enrichedData.linkedin_url;
  if (enrichedData.address) updateData.address = enrichedData.address;
  if (enrichedData.phone) updateData.phone = enrichedData.phone;
  
  if (Object.keys(updateData).length === 0) {
    return false;
  }

  const { error } = await supabase
    .from('companies')
    .update(updateData)
    .eq('id', companyId)
    .eq('owner_id', userId); // Ensure user owns the company

  if (error) {
    console.error("Error updating company:", error);
    return false;
  }

  return true;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let orgId: string | null = null;
    // Get user from authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: JSON_HEADERS }
      );
    }

    // Create Supabase client
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Get authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: JSON_HEADERS }
      );
    }

    // Check credit balance before proceeding
    try {
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (membership?.org_id) {
        orgId = membership.org_id;
        const creditCheck = await checkCreditBalance(supabase, membership.org_id);
        if (!creditCheck.allowed) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'insufficient_credits',
              message: creditCheck.message || 'Your organization has run out of AI credits. Please top up to continue.',
              balance: creditCheck.balance,
            }),
            { status: 402, headers: JSON_HEADERS }
          );
        }
      }
    } catch (e) {
      // fail open: enrichment should still work if credit check fails
    }

    // Parse request body
    const body: EnrichmentRequest = await req.json();

    if (!body.type || !body.id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing type or id" }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    let enrichedData: EnrichedContactData | EnrichedCompanyData | null = null;
    let usage: UsageMetrics | null = null;
    let updated = false;

    if (body.type === 'contact') {
      if (!body.contact_data) {
        return new Response(
          JSON.stringify({ success: false, error: "Missing contact_data" }),
          { status: 400, headers: JSON_HEADERS }
        );
      }

      const contactResult = await enrichContactWithGemini(body.contact_data);
      enrichedData = contactResult.enrichedData;
      usage = contactResult.usage;
      
      if (enrichedData) {
        updated = await updateContact(
          supabase,
          body.id,
          enrichedData as EnrichedContactData,
          user.id
        );
      }
    } else if (body.type === 'company') {
      if (!body.company_data) {
        return new Response(
          JSON.stringify({ success: false, error: "Missing company_data" }),
          { status: 400, headers: JSON_HEADERS }
        );
      }

      const companyResult = await enrichCompanyWithGemini(body.company_data);
      enrichedData = companyResult.enrichedData;
      usage = companyResult.usage;
      
      if (enrichedData) {
        updated = await updateCompany(
          supabase,
          body.id,
          enrichedData as EnrichedCompanyData,
          user.id
        );
      }
    } else {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid type. Must be 'contact' or 'company'" }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    if (!enrichedData) {
      return new Response(
        JSON.stringify({ success: false, error: "Failed to enrich data" }),
        { status: 500, headers: JSON_HEADERS }
      );
    }

    if (orgId && usage && (usage.inputTokens > 0 || usage.outputTokens > 0)) {
      await logAICostEvent(
        supabase,
        user.id,
        orgId,
        'gemini',
        GEMINI_MODEL,
        usage.inputTokens,
        usage.outputTokens,
        body.type === 'contact' ? 'enrich_crm_contact' : 'enrich_crm_company',
        { source: 'enrich-crm-record' }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        enriched_data: enrichedData,
        confidence: enrichedData.confidence,
        updated,
      }),
      { status: 200, headers: JSON_HEADERS }
    );
  } catch (error) {
    console.error("Error in enrich-crm-record:", error);
    await captureException(error, {
      tags: {
        function: 'enrich-crm-record',
        integration: 'gemini',
      },
    });
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      { status: 500, headers: JSON_HEADERS }
    );
  }
});

