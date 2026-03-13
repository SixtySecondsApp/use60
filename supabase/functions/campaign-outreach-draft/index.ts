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

const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';

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

interface ProspectIntel {
  title?: string;
  seniority?: string;
  recent_activity?: string[];
  interests?: string[];
}

interface DraftRequest {
  company: CompanyData;
  channel: 'email' | 'linkedin' | 'slack';
  prospect?: {
    first_name?: string;
    last_name?: string;
    title?: string;
  };
  prospect_intel?: ProspectIntel;
  sender_name?: string;
  mode?: 'single' | 'sequence';
  include_video?: boolean;
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

    if (body.mode === 'sequence' && body.channel === 'email') {
      const sequence = await generateSequence(geminiKey, body);
      return jsonResponse({ success: true, sequence }, req);
    }

    const draft = await generateDraft(geminiKey, body);

    // Generate video script alongside text draft when requested
    let video_script: string | null = null;
    if (body.include_video) {
      video_script = await generateVideoScript(geminiKey, body, draft.body);
    }

    return jsonResponse({ success: true, draft, video_script }, req);
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

  const { prospect_intel } = request;

  // Build prospect intelligence section
  const prospectIntelSection = prospect_intel
    ? `\nPROSPECT INTELLIGENCE (from enrichment — use this to personalize):
- Title: ${prospect_intel.title || 'Unknown'}
- Seniority: ${prospect_intel.seniority || 'Unknown'}
- Recent activity: ${prospect_intel.recent_activity?.join('; ') || 'None found'}
- Interests: ${prospect_intel.interests?.join(', ') || 'None found'}
${prospect_intel.recent_activity?.length ? 'Reference their recent activity or interests naturally in the message. This shows you did your homework.' : ''}`
    : '';

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
${(company as Record<string, unknown>).funding_stage ? `- Funding: ${(company as Record<string, unknown>).funding_stage}` : ''}
${(company as Record<string, unknown>).recent_news ? `- Recent news: ${((company as Record<string, unknown>).recent_news as string[])?.slice(0, 2).join('; ')}` : ''}

${recipientName ? `RECIPIENT: ${recipientName}${prospect?.last_name ? ' ' + prospect.last_name : ''}${prospect?.title ? ', ' + prospect.title : ''}` : 'RECIPIENT: Unknown (use "Hi there" or similar)'}${prospectIntelSection}

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

// ---------------------------------------------------------------------------
// Multi-touch sequence generator (SCC-008)
// ---------------------------------------------------------------------------

async function generateSequence(
  apiKey: string,
  request: DraftRequest,
): Promise<{ touches: Array<{ day: number; subject: string; body: string }>; suggested_role?: string }> {
  const { company, prospect, prospect_intel, sender_name } = request;
  const recipientName = prospect?.first_name || 'there';
  const senderFirst = sender_name?.split(' ')[0] || 'Alex';

  const prospectContext = prospect_intel
    ? `\nPROSPECT INTEL: Title: ${prospect_intel.title || 'Unknown'}, Seniority: ${prospect_intel.seniority || 'Unknown'}, Recent activity: ${prospect_intel.recent_activity?.join('; ') || 'None'}, Interests: ${prospect_intel.interests?.join(', ') || 'None'}`
    : '';

  const prompt = `Generate a 3-email outreach sequence for someone at ${company.name} to get them to check out a personalized demo of "60" (AI command center for sales teams).

COMPANY: ${company.name} (${company.domain}), ${company.vertical || 'Unknown vertical'}
What they do: ${company.product_summary || 'Unknown'}
Size: ${company.employee_range || 'Unknown'}
${(company as Record<string, unknown>).funding_stage ? `Funding: ${(company as Record<string, unknown>).funding_stage}` : ''}
${(company as Record<string, unknown>).recent_news ? `Recent news: ${((company as Record<string, unknown>).recent_news as string[])?.slice(0, 2).join('; ')}` : ''}

RECIPIENT: ${recipientName}${prospect?.last_name ? ' ' + prospect.last_name : ''}${prospect?.title ? ', ' + prospect.title : ''}${prospectContext}

SEQUENCE STRUCTURE:
- Touch 1 (Day 0): Personalized intro + demo link [LINK]. Reference their specific product/market. Conversational.
- Touch 2 (Day 3): Value-add follow-up. Share a relevant insight about their industry or a challenge they face. Reference any recent news or funding. Include [LINK] again.
- Touch 3 (Day 7): Break-up email. Short. Direct. Last chance framing. Social proof angle if possible. Include [LINK].

EACH EMAIL must use DIFFERENT angles — don't repeat the same pitch. Each references different aspects of ${company.name}'s business.

RULES:
1. 50-100 words per email. Short sentences. Write like you talk.
2. NO em dashes. NO oxford commas. Use contractions.
3. Sign off as "${senderFirst}".
4. Sound human, not AI. No "leverage", "synergies", "streamline", "empower".
5. [LINK] placeholder where the demo link goes.

Return valid JSON:
{
  "touches": [
    {"day": 0, "subject": "subject line", "body": "email body with [LINK]"},
    {"day": 3, "subject": "subject line", "body": "email body with [LINK]"},
    {"day": 7, "subject": "subject line", "body": "email body with [LINK]"}
  ],
  "suggested_role": "job title most likely to buy sales automation"
}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 1500,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    },
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Gemini sequence error: ${response.status} ${errText}`);
  }

  const json = await response.json();
  const text = json.candidates?.[0]?.content?.parts
    ?.filter((p: { thought?: boolean }) => !p.thought)
    ?.map((p: { text?: string }) => p.text)
    ?.join('') || '';

  if (!text) {
    throw new Error('No content returned from Gemini sequence');
  }

  return JSON.parse(text);
}

// ---------------------------------------------------------------------------
// Video script generator (HG-011)
// ---------------------------------------------------------------------------

async function generateVideoScript(
  apiKey: string,
  request: DraftRequest,
  emailBody: string,
): Promise<string> {
  const { company, prospect, sender_name } = request;
  const recipientName = prospect?.first_name || 'there';
  const senderFirst = sender_name?.split(' ')[0] || '';

  const prompt = `Write a 15-20 second video script for a personalized outreach video.

CONTEXT: This is a short video where a sales rep's AI avatar speaks directly to the prospect. It accompanies this email:
---
${emailBody}
---

RECIPIENT: ${recipientName}${prospect?.last_name ? ' ' + prospect.last_name : ''} at ${company.name}
SENDER: ${senderFirst || 'the rep'}

RULES:
1. 3-4 sentences MAX. Must be under 20 seconds when spoken aloud.
2. Start with "Hey ${recipientName}" — make it feel personal, like a quick video message.
3. Reference ONE specific thing about ${company.name} (their product, market, or challenge).
4. End with a soft CTA: "check out the link" or "take a look when you get a sec".
5. Sound natural and conversational — this is being SPOKEN, not read.
6. NO formal greetings. NO "I hope this finds you well". NO corporate language.

Return ONLY the script text, no JSON wrapping.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 200,
        },
      }),
    },
  );

  if (!response.ok) {
    console.error('[campaign-outreach-draft] Video script generation failed:', response.status);
    return `Hey ${recipientName}, I put together a quick demo showing how 60 could help ${company.name} automate the sales work around your calls. Take a look when you get a sec.`;
  }

  const json = await response.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  return text || `Hey ${recipientName}, quick video for you — I put together something showing how 60 could help ${company.name}. Take a look when you get a chance.`;
}
