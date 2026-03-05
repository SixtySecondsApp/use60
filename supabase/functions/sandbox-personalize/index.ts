/**
 * sandbox-personalize
 *
 * Generates AI-personalized email drafts and meeting prep content
 * for the interactive sandbox demo. Uses Gemini Flash for speed.
 *
 * Input: company name, visitor info, deal context
 * Output: email draft (subject + body) and meeting prep content
 */

import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';

const GEMINI_MODEL = 'gemini-2.0-flash';

interface PersonalizeRequest {
  company_name: string;
  company_domain?: string;
  company_vertical?: string;
  company_summary?: string;
  visitor_name?: string;
  visitor_title?: string;
  visitor_email?: string;
  deal_value?: number;
  employee_range?: string;
}

interface PersonalizeResponse {
  email_draft: {
    subject: string;
    body: string;
  };
  meeting_prep: {
    company_overview: string;
    talking_points: string[];
    risk_signals: string[];
    questions_to_ask: string[];
    deal_context: string;
  };
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  try {
    const body: PersonalizeRequest = await req.json();

    if (!body.company_name) {
      return errorResponse('company_name is required', 400, req);
    }

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      return errorResponse('GEMINI_API_KEY not configured', 500, req);
    }

    const result = await generatePersonalizedContent(geminiKey, body);

    return jsonResponse({ success: true, data: result }, req);
  } catch (err) {
    console.error('[sandbox-personalize] Error:', err);
    return errorResponse(
      err instanceof Error ? err.message : 'Internal error',
      500,
      req
    );
  }
});

async function generatePersonalizedContent(
  apiKey: string,
  input: PersonalizeRequest
): Promise<PersonalizeResponse> {
  const visitorName = input.visitor_name || 'the prospect';
  const firstName = visitorName.split(' ')[0] || 'there';
  const companyName = input.company_name;
  const vertical = input.company_vertical || 'technology';
  const dealValue = input.deal_value ? `$${(input.deal_value / 1000).toFixed(0)}K` : '$95K';
  const employeeRange = input.employee_range || '51-200';

  const prompt = `You are writing sales content for a CRM AI platform called "60". Generate personalized content for a sales demo targeting ${companyName}.

Context:
- Company: ${companyName} (${input.company_domain || 'unknown domain'})
- Industry: ${vertical}
- Size: ${employeeRange} employees
- Contact: ${visitorName}, ${input.visitor_title || 'Decision Maker'}
- Deal value: ${dealValue}
${input.company_summary ? `- About: ${input.company_summary}` : ''}

Generate a JSON response with this exact structure:
{
  "email_draft": {
    "subject": "Brief, natural email subject line about following up on a demo/proposal",
    "body": "A warm, professional follow-up email from 'Alex' (the sales rep) to '${firstName}' at ${companyName}. Reference their specific industry (${vertical}), mention the platform demo they had, include 3-4 bullet points about what 60 would do for them specifically, and end with a clear next step. Keep it under 200 words. Use first name only. Sound human, not robotic."
  },
  "meeting_prep": {
    "company_overview": "2-3 sentence overview of ${companyName} as a ${vertical} company with ${employeeRange} employees, mentioning their likely sales challenges",
    "talking_points": ["5 specific talking points tailored to ${companyName}'s likely needs in ${vertical}"],
    "risk_signals": ["3 potential risks or objections to watch for with a ${employeeRange}-employee ${vertical} company"],
    "questions_to_ask": ["3 discovery questions specific to ${companyName}'s situation"],
    "deal_context": "One sentence summarizing the ${dealValue} deal at proposal stage with ${companyName}"
  }
}

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
          maxOutputTokens: 1500,
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

  const parsed = JSON.parse(text) as PersonalizeResponse;

  // Validate structure
  if (!parsed.email_draft?.subject || !parsed.email_draft?.body) {
    throw new Error('Invalid email_draft structure');
  }
  if (!parsed.meeting_prep?.talking_points?.length) {
    throw new Error('Invalid meeting_prep structure');
  }

  return parsed;
}
