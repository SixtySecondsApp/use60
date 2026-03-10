// supabase/functions/linkedin-ad-classify/index.ts
// Classifies LinkedIn ads using Gemini 2.5 Flash with structured output.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const VALID_ANGLES = [
  'pain-point', 'roi', 'social-proof', 'innovation', 'fear',
  'urgency', 'curiosity', 'authority', 'comparison', 'transformation',
] as const;

const VALID_PERSONAS = [
  'ceo', 'vp-sales', 'vp-marketing', 'developer', 'hr-leader',
  'finance-leader', 'operations', 'it-leader', 'founder', 'general-business',
] as const;

const VALID_OFFER_TYPES = [
  'demo', 'free-trial', 'whitepaper', 'webinar', 'event',
  'case-study', 'product-launch', 'pricing', 'newsletter', 'no-offer',
] as const;

const VALID_CTA_TYPES = [
  'sign-up', 'learn-more', 'register', 'download', 'watch',
  'get-started', 'contact-us', 'try-free', 'book-demo', 'no-cta',
] as const;

const VALID_CREATIVE_FORMATS = [
  'single-image', 'carousel', 'video', 'text-only', 'document',
] as const;

interface AdRow {
  id: string;
  org_id: string;
  advertiser_name: string;
  headline: string | null;
  body_text: string | null;
  cta_text: string | null;
  media_type: string;
  ad_format: string | null;
}

interface Classification {
  angle: string;
  target_persona: string;
  offer_type: string;
  cta_type: string;
  creative_format: string;
  industry_vertical: string;
  messaging_theme: string;
  confidence: number;
}

function buildClassificationPrompt(ad: AdRow): string {
  const parts = [
    `Advertiser: ${ad.advertiser_name}`,
    ad.headline ? `Headline: ${ad.headline}` : null,
    ad.body_text ? `Body: ${ad.body_text}` : null,
    ad.cta_text ? `CTA button: ${ad.cta_text}` : null,
    ad.media_type ? `Media type: ${ad.media_type}` : null,
    ad.ad_format ? `Ad format: ${ad.ad_format}` : null,
  ].filter(Boolean).join('\n');

  return `You are an expert LinkedIn advertising analyst. Classify this LinkedIn ad.

${parts}

Respond with ONLY a JSON object (no markdown, no code fences) with these fields:

- "angle": one of [${VALID_ANGLES.join(', ')}]
- "target_persona": one of [${VALID_PERSONAS.join(', ')}]
- "offer_type": one of [${VALID_OFFER_TYPES.join(', ')}]
- "cta_type": one of [${VALID_CTA_TYPES.join(', ')}]
- "creative_format": one of [${VALID_CREATIVE_FORMATS.join(', ')}]
- "industry_vertical": free text, the industry this ad targets
- "messaging_theme": 2-5 word summary of the core message
- "confidence": a number 0.0-1.0 representing your confidence in the classification`;
}

async function classifyWithGemini(ad: AdRow): Promise<Classification> {
  const prompt = buildClassificationPrompt(ad);

  const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 512,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errText}`);
  }

  const result = await response.json();
  const candidate = result.candidates?.[0];
  if (!candidate?.content?.parts?.length) {
    throw new Error('Gemini returned no content');
  }

  // Filter out thinking parts
  const textParts = candidate.content.parts.filter(
    (p: { thought?: boolean; text?: string }) => p.thought !== true && p.text
  );

  if (textParts.length === 0) {
    throw new Error('Gemini returned only thinking tokens');
  }

  const rawText = textParts.map((p: { text: string }) => p.text).join('');
  const parsed: Classification = JSON.parse(rawText);

  // Validate and clamp values
  if (!VALID_ANGLES.includes(parsed.angle as typeof VALID_ANGLES[number])) {
    parsed.angle = 'curiosity';
  }
  if (!VALID_PERSONAS.includes(parsed.target_persona as typeof VALID_PERSONAS[number])) {
    parsed.target_persona = 'general-business';
  }
  if (!VALID_OFFER_TYPES.includes(parsed.offer_type as typeof VALID_OFFER_TYPES[number])) {
    parsed.offer_type = 'no-offer';
  }
  if (!VALID_CTA_TYPES.includes(parsed.cta_type as typeof VALID_CTA_TYPES[number])) {
    parsed.cta_type = 'no-cta';
  }
  if (!VALID_CREATIVE_FORMATS.includes(parsed.creative_format as typeof VALID_CREATIVE_FORMATS[number])) {
    parsed.creative_format = 'single-image';
  }
  parsed.confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5));

  return parsed;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  if (!GEMINI_API_KEY) {
    return errorResponse('GEMINI_API_KEY not configured', req, 500);
  }

  // Authenticate via JWT
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return errorResponse('Missing authorization header', req, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  // Validate user token
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return errorResponse('Unauthorized', req, 401);
  }

  // Service role client for DB operations
  const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json();
    const { action, ad_ids, ad_id, org_id } = body;

    if (!action) {
      return errorResponse('Missing action parameter', req, 400);
    }

    if (action === 'classify_single') {
      if (!ad_id) {
        return errorResponse('Missing ad_id for classify_single', req, 400);
      }

      // Fetch the ad
      const { data: ad, error: adError } = await serviceClient
        .from('linkedin_ad_library_ads')
        .select('id, org_id, advertiser_name, headline, body_text, cta_text, media_type, ad_format')
        .eq('id', ad_id)
        .maybeSingle();

      if (adError) {
        return errorResponse(`Failed to fetch ad: ${adError.message}`, req, 500);
      }
      if (!ad) {
        return errorResponse('Ad not found', req, 404);
      }

      // Verify org membership
      const { data: membership } = await serviceClient
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .eq('org_id', ad.org_id)
        .maybeSingle();

      if (!membership) {
        return errorResponse('Not a member of this organization', req, 403);
      }

      const classification = await classifyWithGemini(ad as AdRow);

      // Upsert classification
      const { data: result, error: upsertError } = await serviceClient
        .from('linkedin_ad_library_classifications')
        .upsert(
          {
            ad_id: ad.id,
            org_id: ad.org_id,
            angle: classification.angle,
            target_persona: classification.target_persona,
            offer_type: classification.offer_type,
            cta_type: classification.cta_type,
            creative_format: classification.creative_format,
            industry_vertical: classification.industry_vertical,
            messaging_theme: classification.messaging_theme,
            confidence: classification.confidence,
            classified_by: 'ai',
            classified_at: new Date().toISOString(),
          },
          { onConflict: 'ad_id' }
        )
        .select('id, ad_id, angle, target_persona, offer_type, cta_type, creative_format, industry_vertical, messaging_theme, confidence')
        .single();

      if (upsertError) {
        return errorResponse(`Failed to save classification: ${upsertError.message}`, req, 500);
      }

      return jsonResponse({ classified: 1, classification: result }, req);
    }

    if (action === 'classify_ads') {
      // Determine which org to classify for
      let targetOrgId = org_id;

      if (!targetOrgId) {
        // Use first org the user belongs to
        const { data: membership } = await serviceClient
          .from('organization_memberships')
          .select('org_id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();

        if (!membership) {
          return errorResponse('User has no organization', req, 400);
        }
        targetOrgId = membership.org_id;
      } else {
        // Verify membership
        const { data: membership } = await serviceClient
          .from('organization_memberships')
          .select('org_id')
          .eq('user_id', user.id)
          .eq('org_id', targetOrgId)
          .maybeSingle();

        if (!membership) {
          return errorResponse('Not a member of this organization', req, 403);
        }
      }

      // Build query for unclassified ads
      let query = serviceClient
        .from('linkedin_ad_library_ads')
        .select('id, org_id, advertiser_name, headline, body_text, cta_text, media_type, ad_format')
        .eq('org_id', targetOrgId);

      if (ad_ids && ad_ids.length > 0) {
        // Classify specific ads
        query = query.in('id', ad_ids);
      }

      // Left-join filter: only ads without a classification
      // Since we can't do a left join easily, fetch existing classification ad_ids and exclude them
      const { data: existingClassifications, error: classError } = await serviceClient
        .from('linkedin_ad_library_classifications')
        .select('ad_id')
        .eq('org_id', targetOrgId);

      if (classError) {
        return errorResponse(`Failed to check existing classifications: ${classError.message}`, req, 500);
      }

      const classifiedAdIds = (existingClassifications || []).map((c: { ad_id: string }) => c.ad_id);

      if (classifiedAdIds.length > 0) {
        // Exclude already-classified ads using not-in filter
        query = query.not('id', 'in', `(${classifiedAdIds.join(',')})`);
      }

      const { data: ads, error: adsError } = await query.limit(20);

      if (adsError) {
        return errorResponse(`Failed to fetch ads: ${adsError.message}`, req, 500);
      }

      if (!ads || ads.length === 0) {
        return jsonResponse({ classified: 0, message: 'No unclassified ads found' }, req);
      }

      // Process each ad
      const results: { ad_id: string; success: boolean; error?: string }[] = [];
      const upsertRows: Record<string, unknown>[] = [];

      for (const ad of ads) {
        try {
          const classification = await classifyWithGemini(ad as AdRow);
          upsertRows.push({
            ad_id: ad.id,
            org_id: ad.org_id,
            angle: classification.angle,
            target_persona: classification.target_persona,
            offer_type: classification.offer_type,
            cta_type: classification.cta_type,
            creative_format: classification.creative_format,
            industry_vertical: classification.industry_vertical,
            messaging_theme: classification.messaging_theme,
            confidence: classification.confidence,
            classified_by: 'ai',
            classified_at: new Date().toISOString(),
          });
          results.push({ ad_id: ad.id, success: true });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          console.error(`Failed to classify ad ${ad.id}:`, message);
          results.push({ ad_id: ad.id, success: false, error: message });
        }
      }

      // Batch upsert all successful classifications
      if (upsertRows.length > 0) {
        const { error: batchError } = await serviceClient
          .from('linkedin_ad_library_classifications')
          .upsert(upsertRows, { onConflict: 'ad_id' });

        if (batchError) {
          return errorResponse(`Failed to save classifications: ${batchError.message}`, req, 500);
        }
      }

      const successCount = results.filter((r) => r.success).length;
      const failCount = results.filter((r) => !r.success).length;

      return jsonResponse({
        classified: successCount,
        failed: failCount,
        total: ads.length,
        results,
      }, req);
    }

    return errorResponse(`Unknown action: ${action}`, req, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[linkedin-ad-classify] Error:', message);
    return errorResponse(message, req, 500);
  }
});
