/**
 * extract-stakeholder-roles handler
 *
 * Extracts stakeholder roles from meeting transcript/digest output.
 * Parses meeting-digest-truth-extractor output for stakeholder mentions,
 * identifies roles using LLM analysis, and saves to deal_stakeholders.
 *
 * High-confidence detections (>=0.7): auto-assigned
 * Low-confidence detections (<0.7):  saved with needs_review=true
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../../_shared/corsHelper.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

type StakeholderRole =
  | 'economic_buyer'
  | 'champion'
  | 'technical_evaluator'
  | 'end_user'
  | 'blocker'
  | 'coach'
  | 'influencer'
  | 'legal'
  | 'procurement'
  | 'unknown';

interface ExtractedStakeholder {
  name: string;
  email?: string;
  role: StakeholderRole;
  confidence: number; // 0-1
  evidence: string;
}

const ROLE_EXTRACTION_PROMPT = `You are a sales intelligence assistant. Analyze this meeting transcript and identify all external stakeholders (prospects/customers — not the seller).

For each stakeholder, determine:
1. Their name and email if mentioned
2. Their role in the buying process (choose ONE):
   - economic_buyer: has budget authority, signs contracts
   - champion: internal advocate who drives the purchase
   - technical_evaluator: evaluates technical fit, does POC
   - end_user: will use the product day-to-day
   - blocker: raising objections, slowing the deal
   - coach: helps the seller navigate the buying process
   - influencer: influences the decision without owning it
   - legal: reviews contracts, legal compliance
   - procurement: manages vendor relationships and purchasing
   - unknown: role unclear from transcript
3. Confidence score (0.0-1.0) based on how clearly the role was demonstrated
4. Brief evidence quote or observation

Respond ONLY with valid JSON array. No markdown, no explanation:
[
  {
    "name": "John Smith",
    "email": "john@example.com",
    "role": "economic_buyer",
    "confidence": 0.85,
    "evidence": "John approved the budget and said 'I'll sign off on this next week'"
  }
]

TRANSCRIPT:
`;

async function extractWithGemini(transcript: string): Promise<ExtractedStakeholder[]> {
  if (!geminiApiKey) throw new Error('GEMINI_API_KEY not set');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: ROLE_EXTRACTION_PROMPT + transcript.slice(0, 8000) }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
        },
      }),
    },
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${errText}`);
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

  // Strip any markdown code fences
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  try {
    return JSON.parse(cleaned) as ExtractedStakeholder[];
  } catch {
    return [];
  }
}

export async function handleStakeholderRoles(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    // Validate JWT and user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const { dealId, meetingId } = body;

    if (!dealId || !meetingId) {
      return new Response(
        JSON.stringify({ success: false, error: 'dealId and meetingId are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Fetch the deal for org_id
    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .select('id, clerk_org_id')
      .eq('id', dealId)
      .maybeSingle();

    if (dealError || !deal) {
      return new Response(
        JSON.stringify({ success: false, error: 'Deal not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Fetch meeting transcript
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('id, transcript_text, summary, contact_id')
      .eq('id', meetingId)
      .maybeSingle();

    if (meetingError || !meeting) {
      return new Response(
        JSON.stringify({ success: false, error: 'Meeting not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const transcript = meeting.transcript_text || meeting.summary || '';

    if (!transcript || transcript.length < 100) {
      return new Response(
        JSON.stringify({ success: true, detected: 0, message: 'Insufficient transcript data' }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Extract stakeholder roles using Gemini
    const extracted = await extractWithGemini(transcript);

    if (extracted.length === 0) {
      return new Response(
        JSON.stringify({ success: true, detected: 0, message: 'No stakeholders detected' }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Match extracted names/emails to existing contacts in the org
    const orgId = deal.clerk_org_id;
    let savedCount = 0;
    let reviewCount = 0;

    for (const stakeholder of extracted) {
      // Try to find matching contact by email
      let contactId: string | null = null;

      if (stakeholder.email) {
        const { data: contact } = await supabase
          .from('contacts')
          .select('id')
          .eq('email', stakeholder.email)
          .eq('owner_id', orgId)
          .maybeSingle();

        if (contact) contactId = contact.id;
      }

      // Fall back to name match if no email match
      if (!contactId && stakeholder.name) {
        const nameParts = stakeholder.name.trim().split(/\s+/);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        if (firstName) {
          const { data: contact } = await supabase
            .from('contacts')
            .select('id')
            .eq('owner_id', orgId)
            .ilike('first_name', firstName)
            .ilike('last_name', lastName || '%')
            .maybeSingle();

          if (contact) contactId = contact.id;
        }
      }

      // Skip if we can't match to a contact
      if (!contactId) continue;

      const needsReview = stakeholder.confidence < 0.7;
      const roleToAssign: StakeholderRole = needsReview ? 'unknown' : stakeholder.role;

      // Upsert stakeholder (update role if already exists and new confidence is higher)
      const { data: existing } = await supabase
        .from('deal_stakeholders')
        .select('id, confidence_score, role')
        .eq('deal_id', dealId)
        .eq('contact_id', contactId)
        .maybeSingle();

      if (existing) {
        // Only update role if new confidence exceeds existing
        const existingConf = existing.confidence_score || 0;
        if (stakeholder.confidence > existingConf) {
          await supabase
            .from('deal_stakeholders')
            .update({
              role: roleToAssign,
              confidence_score: stakeholder.confidence,
              needs_review: needsReview,
              auto_detected: true,
              source_meeting_id: meetingId,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
        }
      } else {
        await supabase.from('deal_stakeholders').insert({
          deal_id: dealId,
          contact_id: contactId,
          org_id: orgId,
          role: roleToAssign,
          influence: 'unknown',
          engagement_status: 'unknown',
          auto_detected: true,
          source_meeting_id: meetingId,
          confidence_score: stakeholder.confidence,
          needs_review: needsReview,
        });
      }

      savedCount++;
      if (needsReview) reviewCount++;
    }

    return new Response(
      JSON.stringify({
        success: true,
        detected: extracted.length,
        saved: savedCount,
        needs_review: reviewCount,
        meeting_id: meetingId,
      }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
}
