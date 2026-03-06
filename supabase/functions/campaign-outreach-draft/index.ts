/**
 * campaign-outreach-draft
 *
 * POST /campaign-outreach-draft
 * Body: { company, channel, prospect?, sender_name? }
 *
 * Uses Gemini 2.0 Flash to generate a short, personalized outreach message
 * promoting 60 to the prospect company. The message is conversational —
 * not a sales pitch, but a "check this out" with a personalized demo link.
 *
 * Uses enrichment data (company profile, vertical, ICP) to:
 * 1. Identify the right person/role to reach out to
 * 2. Find a genuine conversation starter
 * 3. Frame the demo link as something worth 60 seconds
 *
 * Public endpoint — deployed with --no-verify-jwt.
 * Auth is checked internally via the Authorization header.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';

const GEMINI_MODEL = 'gemini-2.0-flash';

interface CompanyData {
  name: string;
  domain: string;
  vertical?: string;
  product_summary?: string;
  value_props?: string[];
  employee_range?: string;
  competitors?: string[];
  icp?: {
    title?: string;
    company_size?: string;
    industry?: string;
  };
}

interface DraftRequest {
  company: CompanyData;
  channel: 'email' | 'linkedin' | 'slack';
  prospect?: {
    first_name?: string;
    last_name?: string;
    title?: string;
  };
  sender_name?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Missing authorization', req, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return errorResponse('Unauthorized', req, 401);
    }

    const body: DraftRequest = await req.json();
    if (!body.company?.name) {
      return errorResponse('company.name is required', req, 400);
    }

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      return errorResponse('GEMINI_API_KEY not configured', req, 500);
    }

    const draft = await generateDraft(geminiKey, body);
    return jsonResponse({ success: true, draft }, req);
  } catch (err) {
    console.error('[campaign-outreach-draft] Error:', err);
    return errorResponse(
      err instanceof Error ? err.message : 'Internal error',
      req,
      500,
    );
  }
});

async function generateDraft(
  apiKey: string,
  request: DraftRequest,
): Promise<{ subject?: string; body: string; suggested_role?: string }> {
  const { company, channel, prospect, sender_name } = request;
  const recipientName = prospect?.first_name || null;
  const senderFirst = sender_name?.split(' ')[0] || '';

  const channelGuide = {
    email: 'Write a cold email (subject + body). 4-6 sentences max for the body. Include a subject line.',
    linkedin: 'Write a LinkedIn connection message or InMail. 2-3 sentences max. No subject line needed.',
    slack: 'Write a casual Slack DM. 2-3 sentences. Direct and friendly.',
  };

  const prompt = `You're writing a short outreach message to someone at ${company.name} to get them to check out a personalized 60-second demo of "60" — an AI command center for sales teams.

ABOUT 60: AI agents that automate everything either side of the sales call. Lead research, meeting prep, follow-ups, proposals, pipeline management. The rep focuses on conversations that close. 60 handles the rest.

ABOUT THE PROSPECT COMPANY:
- Name: ${company.name}
- Domain: ${company.domain}
- Vertical: ${company.vertical || 'Unknown'}
- What they do: ${company.product_summary || 'Unknown'}
- Their value props: ${company.value_props?.join(', ') || 'Unknown'}
- Size: ${company.employee_range || 'Unknown'}
- Competitors: ${company.competitors?.join(', ') || 'Unknown'}
- Their ICP role: ${company.icp?.title || 'Unknown'}

${recipientName ? `RECIPIENT: ${recipientName}${prospect?.last_name ? ' ' + prospect.last_name : ''}${prospect?.title ? ', ' + prospect.title : ''}` : 'RECIPIENT: Unknown (use "Hi there" or similar)'}

CHANNEL: ${channel}
${channelGuide[channel]}

CRITICAL RULES:
1. DO NOT pitch. This is a conversation starter, not a sales email. Be genuinely curious about their business.
2. Reference something SPECIFIC about ${company.name} — their product, market, or a challenge companies in ${company.vertical || 'their space'} face. Show you've done homework.
3. The demo link goes where you write [LINK]. Frame it as "put together something for you" or "made this for your team" — not "check out our product".
4. If you can identify WHO at ${company.name} would care most about sales automation, suggest that role in the "suggested_role" field.
5. ${senderFirst ? `Sign off as "${senderFirst}"` : 'Sign off with just a first name placeholder like "[Name]"'}.
6. Sound like a human who's genuinely interested, not a bot following a template.

DEAD LANGUAGE — never use:
"I'm reaching out", "I hope this finds you well", "leverage", "synergies", "streamline", "empower", "best-in-class", "cutting-edge", "revolutionize", "industry-leading", "game-changer", "I'd love to explore", "drive meaningful engagement", "unique perspective", "transform your", "just following up", "bumping this"

Return valid JSON only:
{
  ${channel === 'email' ? '"subject": "short subject line",' : ''}
  "body": "the message with [LINK] where the demo link should go",
  "suggested_role": "the job title at ${company.name} most likely to buy sales automation (e.g. Head of Sales, VP Revenue, Founder)"
}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 500,
          responseMimeType: 'application/json',
        },
      }),
    },
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Gemini API error: ${response.status} ${errText}`);
  }

  const json = await response.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('No content returned from Gemini');
  }

  return JSON.parse(text);
}
