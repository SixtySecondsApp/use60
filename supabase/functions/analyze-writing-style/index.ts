/**
 * Analyze Writing Style Edge Function
 *
 * Fetches sent emails from Gmail and analyzes them with Claude to extract
 * the user's unique writing style for AI personalization.
 *
 * Actions:
 * - fetch-emails: Get last N sent emails from Gmail
 * - analyze: Run AI analysis on email content
 * - save: Persist extracted style to database
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getGoogleIntegration, refreshGoogleAccessToken } from '../_shared/googleOAuth.ts';
import { checkCreditBalance, logAICostEvent } from '../_shared/costTracking.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ============================================================================
// Types
// ============================================================================

interface EmailForTraining {
  id: string;
  subject: string;
  body: string;
  snippet: string;
  recipient: string;
  sent_at: string;
  word_count: number;
}

interface ExtractedStyle {
  name: string;
  tone_description: string;
  tone: {
    formality: number;
    directness: number;
    warmth: number;
  };
  structure: {
    avg_sentence_length: number;
    preferred_length: 'brief' | 'moderate' | 'detailed';
    uses_bullets: boolean;
  };
  vocabulary: {
    complexity: 'simple' | 'professional' | 'technical';
    common_phrases: string[];
    industry_terms: string[];
  };
  greetings_signoffs: {
    greetings: string[];
    signoffs: string[];
  };
  example_excerpts: string[];
  analysis_confidence: number;
}

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Invalid authentication token');
    }

    // Parse request body
    const requestBody = await req.json();
    const { action } = requestBody;

    let response;

    switch (action) {
      case 'fetch-emails':
        response = await fetchSentEmails(supabase, user.id, requestBody.count || 20);
        break;

      case 'analyze': {
        // Get org for credit check
        const { data: membership } = await supabase
          .from('organization_memberships')
          .select('org_id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle()
        const orgId = membership?.org_id ?? null

        if (orgId) {
          const balanceCheck = await checkCreditBalance(supabase, orgId)
          if (!balanceCheck.allowed) {
            return new Response(JSON.stringify({ success: false, error: 'Insufficient credits. Please top up to continue.' }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }
        }

        response = await analyzeEmails(requestBody.emails)

        // Log AI cost event after successful analysis
        if (orgId && response.success) {
          await logAICostEvent(
            supabase, user.id, orgId, 'anthropic', 'claude-sonnet-4-20250514',
            0, 0, 'content_generation'
          )
        }
        break
      }

      case 'save':
        response = await saveStyle(supabase, user.id, requestBody);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[analyze-writing-style] Error:', errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        status: 200, // Return 200 to allow client to parse error
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// ============================================================================
// Fetch Sent Emails from Gmail
// ============================================================================

async function fetchSentEmails(
  supabase: any,
  userId: string,
  count: number
): Promise<{ success: boolean; emails?: EmailForTraining[]; error?: string }> {
  try {
    // Get Google access token
    const { accessToken } = await getGoogleIntegration(supabase, userId);

    // Query Gmail for sent emails (last 90 days)
    const query = 'in:sent newer_than:90d';
    const params = new URLSearchParams({
      q: query,
      maxResults: String(Math.min(count * 2, 50)), // Fetch extra to account for filtering
    });

    const listResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );

    if (!listResponse.ok) {
      const errorData = await listResponse.json();
      throw new Error(`Gmail API error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const listData = await listResponse.json();

    if (!listData.messages || listData.messages.length === 0) {
      return { success: true, emails: [] };
    }

    // Fetch full details for each message
    const emailPromises = listData.messages.map(async (msg: any) => {
      try {
        const msgResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          }
        );

        if (!msgResponse.ok) return null;

        const msgData = await msgResponse.json();
        return parseEmailForTraining(msgData);
      } catch {
        return null;
      }
    });

    const rawEmails = await Promise.all(emailPromises);
    const parsedEmails = rawEmails.filter((e): e is EmailForTraining => e !== null);

    // Filter emails
    const filteredEmails = filterEmails(parsedEmails);

    // Take only the requested count
    const finalEmails = filteredEmails.slice(0, count);

    console.log(`[analyze-writing-style] Fetched ${listData.messages.length} messages, ` +
      `parsed ${parsedEmails.length}, filtered to ${filteredEmails.length}, returning ${finalEmails.length}`);

    return { success: true, emails: finalEmails };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[fetchSentEmails] Error:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

// ============================================================================
// Parse Email for Training
// ============================================================================

function parseEmailForTraining(msgData: any): EmailForTraining | null {
  const headers = msgData.payload?.headers || [];

  const getHeader = (name: string): string => {
    return headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
  };

  const subject = getHeader('Subject') || '(No Subject)';
  const to = getHeader('To');
  const date = getHeader('Date');

  // Extract body
  const body = extractBody(msgData.payload);
  if (!body) return null;

  // Extract original content (remove quoted text)
  const originalContent = extractOriginalContent(body);
  if (!originalContent || originalContent.length < 30) return null;

  const wordCount = originalContent.split(/\s+/).length;

  return {
    id: msgData.id,
    subject,
    body: originalContent,
    snippet: msgData.snippet || originalContent.substring(0, 150),
    recipient: extractEmail(to),
    sent_at: date ? new Date(date).toISOString() : new Date().toISOString(),
    word_count: wordCount,
  };
}

// ============================================================================
// Filter Emails (remove auto-replies, forwards, etc.)
// ============================================================================

function filterEmails(emails: EmailForTraining[]): EmailForTraining[] {
  return emails.filter(email => {
    const subject = email.subject.toLowerCase();

    // Skip auto-replies
    if (/^(auto:|out of office|ooo:|automatic reply|away:)/i.test(subject)) {
      return false;
    }

    // Skip forwards
    if (/^(fwd:|fw:|forwarded:)/i.test(subject)) {
      return false;
    }

    // Skip very short emails
    if (email.word_count < 30) {
      return false;
    }

    // Skip very long emails (likely templates or newsletters)
    if (email.word_count > 1500) {
      return false;
    }

    // Skip calendar responses
    if (/^(accepted:|declined:|tentative:)/i.test(subject)) {
      return false;
    }

    // Skip automated notifications
    if (/^(re: \[.*\]|notification:|alert:)/i.test(subject)) {
      return false;
    }

    return true;
  });
}

// ============================================================================
// Extract Original Content (remove quoted text from threads)
// ============================================================================

function extractOriginalContent(body: string): string {
  let content = body;

  // Remove Gmail-style quoted content
  content = content.replace(/On .{10,100} wrote:[\s\S]*/i, '');

  // Remove Outlook-style quoted content
  content = content.replace(/From: .{5,100}\nSent:[\s\S]*/i, '');
  content = content.replace(/---+\s*Original Message\s*---+[\s\S]*/i, '');

  // Remove line-level quoting
  content = content.replace(/^>.*$/gm, '');

  // Remove signature blocks
  content = content.replace(/^--\s*\n[\s\S]*/m, '');
  content = content.replace(/^_{3,}[\s\S]*/m, '');

  // Clean up extra whitespace
  content = content.replace(/\n{3,}/g, '\n\n').trim();

  return content;
}

// ============================================================================
// Analyze Emails with Claude
// ============================================================================

async function analyzeEmails(
  emails: Array<{ subject: string; body: string }>
): Promise<{ success: boolean; style?: ExtractedStyle; error?: string }> {
  try {
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    if (emails.length < 3) {
      throw new Error('Need at least 3 emails for analysis');
    }

    // Build the analysis prompt
    const emailSamples = emails.slice(0, 15).map((e, i) => `
--- EMAIL ${i + 1} ---
Subject: ${e.subject}
Body:
${e.body.substring(0, 1500)}
`).join('\n');

    const prompt = `Analyze these ${emails.length} sent emails and extract the writer's unique voice and communication style.

IMPORTANT: Focus on HOW they write, not WHAT they write about. Look for consistent patterns across all emails.

EMAILS TO ANALYZE:
${emailSamples}

Analyze and return a JSON object with this EXACT structure (no additional text):
{
  "name": "2-4 word style name (e.g., 'Direct & Professional', 'Warm Conversational')",
  "tone_description": "2-3 sentences describing the writing style, sentence patterns, and voice characteristics",
  "tone": {
    "formality": <1-5 integer, 1=very casual, 5=very formal>,
    "directness": <1-5 integer, 1=very diplomatic, 5=very direct>,
    "warmth": <1-5 integer, 1=cold/businesslike, 5=very warm/friendly>
  },
  "structure": {
    "avg_sentence_length": <number of words>,
    "preferred_length": "brief" | "moderate" | "detailed",
    "uses_bullets": <boolean>
  },
  "vocabulary": {
    "complexity": "simple" | "professional" | "technical",
    "common_phrases": ["phrase1", "phrase2", "phrase3"],
    "industry_terms": ["term1", "term2"]
  },
  "greetings_signoffs": {
    "greetings": ["greeting1", "greeting2"],
    "signoffs": ["signoff1", "signoff2"]
  },
  "example_excerpts": ["1-2 sentence excerpt that exemplifies the style", "another example", "third example"],
  "analysis_confidence": <0.0-1.0 float>
}

Return ONLY valid JSON, no markdown formatting or explanation.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Claude API error: ${errorData.error?.message || response.status}`);
    }

    const data = await response.json();
    const responseText = data.content[0].text;

    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse AI response as JSON');
    }

    const style = JSON.parse(jsonMatch[0]) as ExtractedStyle;

    // Validate required fields
    if (!style.name || !style.tone_description) {
      throw new Error('Invalid style response: missing required fields');
    }

    console.log(`[analyze-writing-style] Successfully extracted style: ${style.name}`);

    return { success: true, style };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[analyzeEmails] Error:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

// ============================================================================
// Save Style to Database
// ============================================================================

async function saveStyle(
  supabase: any,
  userId: string,
  requestBody: {
    name: string;
    tone_description: string;
    examples: string[];
    style_metadata: any;
    is_default?: boolean;
    source_email_count?: number;
  }
): Promise<{ success: boolean; style_id?: string; error?: string }> {
  try {
    const { name, tone_description, examples, style_metadata, is_default, source_email_count } = requestBody;

    // If setting as default, unset other defaults first
    if (is_default) {
      await supabase
        .from('user_writing_styles')
        .update({ is_default: false })
        .eq('user_id', userId);
    }

    // Insert the new style
    // Build insert data - try with new columns first (if migration has been run)
    const baseInsertData: any = {
      user_id: userId,
      name,
      tone_description,
      examples,
      is_default: is_default ?? false,
    };

    // Try inserting with all columns first (including new ones from migration)
    const fullInsertData = {
      ...baseInsertData,
      style_metadata: style_metadata || {},
      source: 'email_training',
      source_email_count: source_email_count || examples.length,
      trained_at: new Date().toISOString(),
    };

    let { data, error } = await supabase
      .from('user_writing_styles')
      .insert(fullInsertData)
      .select('id')
      .single();

    // If error indicates missing column (PGRST error codes or message patterns), retry without new columns
    if (error) {
      const errorMsg = error.message?.toLowerCase() || '';
      const errorCode = error.code || '';
      
      // Check if error is about missing column (common patterns)
      const isColumnError = 
        errorCode === '42703' || // PostgreSQL undefined column
        errorMsg.includes('column') && errorMsg.includes('does not exist') ||
        errorMsg.includes('could not find') && errorMsg.includes('column') ||
        errorMsg.includes('source');
      
      if (isColumnError) {
        console.log('[saveStyle] Migration not applied yet, retrying without new columns');
        // Fallback: insert without new columns (migration hasn't been run)
        const fallbackData = {
          ...baseInsertData,
          // Only include style_metadata if column exists (try it, but don't fail if it doesn't)
          ...(style_metadata ? { style_metadata } : {}),
        };
        
        const retryResult = await supabase
          .from('user_writing_styles')
          .insert(fallbackData)
          .select('id')
          .single();
        
        if (retryResult.error) {
          // If this also fails, it's a real error
          throw new Error(`Database error: ${retryResult.error.message}`);
        }
        
        data = retryResult.data;
        error = null;
      } else {
        // Real error, not a missing column issue
        throw new Error(`Database error: ${error.message}`);
      }
    }

    console.log(`[analyze-writing-style] Saved style: ${data.id}`);

    return { success: true, style_id: data.id };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[saveStyle] Error:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractEmail(emailString: string): string {
  const match = emailString.match(/<(.+)>/);
  return match ? match[1] : emailString.trim();
}

function extractBody(payload: any): string {
  if (!payload) return '';

  const decodeBase64 = (data: string) => {
    try {
      return atob(data.replace(/-/g, '+').replace(/_/g, '/'));
    } catch {
      return '';
    }
  };

  let textBody = '';
  let htmlBody = '';

  const extractFromParts = (parts: any[]) => {
    for (const part of parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        textBody = decodeBase64(part.body.data);
      } else if (part.mimeType === 'text/html' && part.body?.data) {
        htmlBody = decodeBase64(part.body.data);
      } else if (part.parts) {
        extractFromParts(part.parts);
      }
    }
  };

  if (payload.parts) {
    extractFromParts(payload.parts);
  } else if (payload.mimeType === 'text/plain' && payload.body?.data) {
    textBody = decodeBase64(payload.body.data);
  } else if (payload.mimeType === 'text/html' && payload.body?.data) {
    htmlBody = decodeBase64(payload.body.data);
  }

  // Prefer plain text, fall back to stripped HTML
  if (textBody) return textBody;
  if (htmlBody) return stripHtml(htmlBody);
  return '';
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
