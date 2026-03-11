/**
 * cc-model-compare — Side-by-side Gemini model comparison
 *
 * Runs the same prompt through two Gemini models in parallel and returns
 * both results with timing and token metrics.
 *
 * POST { task, context?, model_a?, model_b? }
 * Returns { model_a: { result, ms, model }, model_b: { result, ms, model } }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders } from '../_shared/corsHelper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Task presets that mirror real functions in the codebase
const TASK_PRESETS: Record<string, { system: string; user: (ctx: string) => string }> = {
  email_draft: {
    system: `You are a sales email assistant. Draft a concise follow-up email based on the context provided.
Return valid JSON: { "to": "<email>", "subject": "<subject>", "body_html": "<html body>", "reasoning": "<why this email>" }
Rules: 3-5 sentences max. Natural tone. No corporate jargon. No emdashes.`,
    user: (ctx) => `Context: ${ctx}\n\nDraft the follow-up email. Return JSON only.`,
  },
  meeting_summary: {
    system: `You are a meeting intelligence assistant. Summarise the meeting context into a structured brief.
Return valid JSON: { "summary": "<2-3 sentences>", "key_decisions": ["..."], "action_items": ["..."], "risks": ["..."], "next_steps": ["..."] }`,
    user: (ctx) => `Meeting context:\n${ctx}\n\nSummarise. Return JSON only.`,
  },
  lead_enrichment: {
    system: `You are a B2B sales research assistant. Extract structured company intelligence from the provided text.
Return valid JSON: { "company_name": "", "industry": "", "employee_count": "", "funding_stage": "", "key_products": [""], "target_market": "", "recent_news": [""], "technologies": [""], "competitive_position": "" }
Only include fields you can confidently extract. Use null for unknown fields.`,
    user: (ctx) => `Raw research text:\n${ctx}\n\nExtract structured intelligence. Return JSON only.`,
  },
  deal_risk_analysis: {
    system: `You are a sales pipeline analyst. Assess deal risk based on the signals provided.
Return valid JSON: { "risk_level": "low|medium|high|critical", "risk_score": 0-100, "risk_factors": ["..."], "recommended_actions": ["..."], "days_until_critical": null|number, "confidence": 0.0-1.0 }`,
    user: (ctx) => `Deal signals:\n${ctx}\n\nAssess the deal risk. Return JSON only.`,
  },
  response_classification: {
    system: `You are an email response classifier. Classify the intent of a reply email.
Return valid JSON: { "intent": "positive|negative|question|objection|scheduling|not_interested|auto_reply", "sentiment": -1.0 to 1.0, "needs_reply": true|false, "urgency": "low|medium|high", "key_phrases": ["..."], "suggested_action": "" }`,
    user: (ctx) => `Email reply:\n${ctx}\n\nClassify. Return JSON only.`,
  },
};

// Sample contexts for each task
const SAMPLE_CONTEXTS: Record<string, string> = {
  email_draft: `Contact: James Bedford, CEO at TechFlow Solutions. Met last Tuesday to discuss their lead generation needs. They're spending 40k/month on LinkedIn ads with poor conversion. Interested in our AI-powered outreach but concerned about deliverability. Asked for pricing by end of week. Has a team of 12 SDRs. Budget approved for Q2.`,
  meeting_summary: `45-minute call with Sarah Chen (VP Sales, Acme Corp). Discussed migrating from Salesforce to our platform. Key pain: their current CRM takes 3 clicks to log a call. She wants a pilot with 5 reps starting March 15. Concerns: data migration timeline (they have 50k contacts), SSO integration with Okta. Agreed to send SOW by Friday. She'll loop in their IT lead Dave for security review. Budget: 2k/seat/year, 50 seats. Competitor mentioned: Gong (they demoed last week but found it "too expensive"). Red flag: their CFO hasn't signed off yet.`,
  lead_enrichment: `Conturae is a B2B SaaS company based in London, UK. Founded in 2021 by former McKinsey consultants. They build AI-powered proposal automation software for professional services firms. Recently raised a $12M Series A led by Balderton Capital. The platform integrates with Salesforce, HubSpot, and Microsoft Dynamics. They have about 85 employees and serve clients including Deloitte, KPMG, and PwC. Their main competitors are Qwilr and PandaDoc. They use React, Node.js, and PostgreSQL in their tech stack. Recent press coverage in TechCrunch about their AI features.`,
  deal_risk_analysis: `Deal: Enterprise license for GlobalBank. Value: $240k ARR. Stage: Negotiation (60 days in pipeline). Last activity: 12 days ago (email sent, no reply). Champion (VP Ops) went on leave 2 weeks ago. Legal review started but no updates. Competitor Gong gave a demo last week. Budget cycle ends March 31. 3 stakeholders haven't attended any calls. Original close date was Feb 28 (missed). Procurement asked for 2 additional references. Security questionnaire 80% complete.`,
  response_classification: `Hi Tom, Thanks for the follow-up. I've had a chance to review the proposal with our team. The pricing looks reasonable but we have a few questions: 1) Can you break out the implementation costs separately? 2) What's the typical onboarding timeline for a team our size (25 reps)? 3) Do you offer quarterly billing instead of annual? We're keen to move forward but need these clarified before I can take it to our CFO for final sign-off. Could we hop on a quick 15-min call Thursday afternoon? Best, Sarah`,
};

async function callGemini(model: string, systemPrompt: string, userPrompt: string): Promise<{ text: string; ms: number }> {
  const start = performance.now();

  const resp = await fetch(
    `${GEMINI_API_BASE}/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
      }),
    },
  );

  const ms = Math.round(performance.now() - start);

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`${model} error ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts
    ?.filter((p: Record<string, unknown>) => !p.thought)
    ?.map((p: Record<string, unknown>) => p.text)
    ?.join('') ?? '';

  return { text, ms };
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors });

    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors });

    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }), { status: 500, headers: cors });
    }

    const body = await req.json();
    const task = body.task as string;
    const customContext = body.context as string | undefined;
    const modelA = body.model_a || 'gemini-2.5-flash';
    const modelB = body.model_b || 'gemini-3.1-flash-lite-preview';

    const preset = TASK_PRESETS[task];
    if (!preset) {
      return new Response(JSON.stringify({
        error: `Unknown task. Available: ${Object.keys(TASK_PRESETS).join(', ')}`,
      }), { status: 400, headers: cors });
    }

    const context = customContext || SAMPLE_CONTEXTS[task] || 'No context provided.';
    const systemPrompt = preset.system;
    const userPrompt = preset.user(context);

    // Run both models in parallel
    const [resultA, resultB] = await Promise.all([
      callGemini(modelA, systemPrompt, userPrompt).catch(e => ({ text: `ERROR: ${e.message}`, ms: 0 })),
      callGemini(modelB, systemPrompt, userPrompt).catch(e => ({ text: `ERROR: ${e.message}`, ms: 0 })),
    ]);

    // Try to parse JSON from responses
    const parseJson = (text: string) => {
      try {
        const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        return JSON.parse(cleaned);
      } catch {
        return null;
      }
    };

    const parsedA = parseJson(resultA.text);
    const parsedB = parseJson(resultB.text);

    return new Response(JSON.stringify({
      task,
      context: context.slice(0, 500),
      model_a: {
        model: modelA,
        ms: resultA.ms,
        raw: resultA.text,
        parsed: parsedA,
        valid_json: parsedA !== null,
        char_count: resultA.text.length,
      },
      model_b: {
        model: modelB,
        ms: resultB.ms,
        raw: resultB.text,
        parsed: parsedB,
        valid_json: parsedB !== null,
        char_count: resultB.text.length,
      },
    }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[cc-model-compare] Error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
