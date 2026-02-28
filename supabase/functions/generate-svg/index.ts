// supabase/functions/generate-svg/index.ts
// Calls Gemini 3.1 Pro to generate rich SVG animations (isometric illustrations,
// detailed UI elements, animated paths).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';
import { logAICostEvent } from '../_shared/costTracking.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GenerateSvgRequest {
  description: string;
  brand_colors?: Record<string, string>;
  complexity?: 'simple' | 'medium' | 'complex';
  viewbox?: string;
}

// ---------------------------------------------------------------------------
// Thinking budget by complexity
// ---------------------------------------------------------------------------

const THINKING_BUDGETS: Record<string, number> = {
  simple: 2048,
  medium: 8192,
  complex: 16384,
};

// ---------------------------------------------------------------------------
// SVG validation
// ---------------------------------------------------------------------------

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function validateSvg(raw: string): ValidationResult {
  const errors: string[] = [];

  const trimmed = raw.trim();

  if (!trimmed.startsWith('<svg')) {
    errors.push('SVG must start with <svg');
  }

  if (!trimmed.endsWith('</svg>')) {
    errors.push('SVG must end with </svg>');
  }

  if (!trimmed.includes('viewBox')) {
    errors.push('SVG must contain a viewBox attribute');
  }

  if (!trimmed.includes('xmlns="http://www.w3.org/2000/svg"') && !trimmed.includes("xmlns='http://www.w3.org/2000/svg'")) {
    errors.push('SVG must contain xmlns="http://www.w3.org/2000/svg"');
  }

  if (trimmed.includes('<script') || trimmed.includes('javascript:')) {
    errors.push('SVG must not contain <script> tags or javascript: URIs');
  }

  const byteSize = new TextEncoder().encode(trimmed).length;
  if (byteSize > 50_000) {
    errors.push(`SVG exceeds 50KB limit (${(byteSize / 1024).toFixed(1)}KB)`);
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Extract SVG from Gemini response (strip markdown fences if present)
// ---------------------------------------------------------------------------

function extractSvgFromResponse(text: string): string {
  // Try to extract from markdown code fences first
  const fenceMatch = text.match(/```(?:svg|xml|html)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  // Otherwise look for raw <svg>...</svg> block
  const svgMatch = text.match(/<svg[\s\S]*<\/svg>/);
  if (svgMatch) {
    return svgMatch[0].trim();
  }

  // Return the raw text as-is; validation will catch issues
  return text.trim();
}

// ---------------------------------------------------------------------------
// Build the system prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(viewbox: string, brandColors: Record<string, string>): string {
  const formattedColors = Object.entries(brandColors).length > 0
    ? Object.entries(brandColors).map(([name, hex]) => `${name}: ${hex}`).join(', ')
    : 'Use a modern, professional palette of your choice';

  return `You are an expert SVG illustrator specializing in modern, animated web graphics.
Generate a complete, self-contained SVG animation.

RULES:
- Use ONLY CSS @keyframes animations (NO SMIL animations like <animate>)
- Include <style> block inside the SVG with all CSS
- Must have viewBox attribute (use: ${viewbox})
- Must have xmlns="http://www.w3.org/2000/svg"
- Include a <title> element for accessibility
- Support prefers-reduced-motion: add @media (prefers-reduced-motion: reduce) to pause animations
- No external resources, fonts, or images
- No <script> tags
- Keep under 50KB total
- Use the brand colors provided: ${formattedColors}

STYLE GUIDE:
- Modern, premium SaaS aesthetic
- Isometric perspective for 3D objects when appropriate
- Smooth, subtle animations (2-4s duration, ease-in-out)
- Clean lines, flat or semi-flat style
- Pastel accents on dark or light backgrounds

Output ONLY the SVG code. No explanation, no markdown fences, just the raw SVG.`;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    // --- Auth ---
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return errorResponse('Unauthorized', req, 401);
    }

    // --- Parse input ---
    const body: GenerateSvgRequest = await req.json();

    if (!body.description || typeof body.description !== 'string' || body.description.trim().length === 0) {
      return errorResponse('description is required and must be a non-empty string', req, 400);
    }

    const description = body.description.trim();
    const brandColors = body.brand_colors ?? {};
    const complexity = body.complexity ?? 'medium';
    const viewbox = body.viewbox ?? '0 0 600 400';

    if (!['simple', 'medium', 'complex'].includes(complexity)) {
      return errorResponse('complexity must be one of: simple, medium, complex', req, 400);
    }

    console.log(`[generate-svg] Description: "${description.substring(0, 80)}..." | Complexity: ${complexity}`);

    // --- Gemini API key ---
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      return errorResponse('GEMINI_API_KEY is not configured on the server', req, 500);
    }

    // --- Build prompt ---
    const systemPrompt = buildSystemPrompt(viewbox, brandColors);
    const thinkingBudget = THINKING_BUDGETS[complexity] ?? THINKING_BUDGETS.medium;

    const startTime = performance.now();

    // --- Call Gemini 3.1 Pro ---
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: description }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 16384,
            thinkingConfig: {
              thinkingBudget,
            },
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const geminiError = await geminiResponse.json().catch(() => ({}));
      const message = geminiError.error?.message || geminiResponse.statusText;
      console.error(`[generate-svg] Gemini API error: ${message}`);
      return errorResponse(`Gemini API error: ${message}`, req, 502);
    }

    const geminiData = await geminiResponse.json();
    const duration = Math.round(performance.now() - startTime);

    if (geminiData.error) {
      console.error(`[generate-svg] Gemini error in response body: ${geminiData.error.message}`);
      return errorResponse(`Gemini API error: ${geminiData.error.message}`, req, 502);
    }

    // --- Extract text from response ---
    // Gemini thinking models may return multiple parts (thought + text).
    // We want the last text part that isn't a thought.
    const parts = geminiData.candidates?.[0]?.content?.parts || [];
    let responseText = '';
    for (const part of parts) {
      if (part.text && !part.thought) {
        responseText = part.text;
      }
    }

    if (!responseText) {
      // Fallback: take the last part's text regardless
      responseText = parts[parts.length - 1]?.text || '';
    }

    if (!responseText) {
      return errorResponse('No response text from Gemini', req, 502);
    }

    // --- Parse SVG ---
    const svgCode = extractSvgFromResponse(responseText);

    // --- Validate ---
    const validation = validateSvg(svgCode);
    if (!validation.valid) {
      console.warn(`[generate-svg] SVG validation failed: ${validation.errors.join('; ')}`);
      return jsonResponse(
        { error: 'Generated SVG failed validation', validation_errors: validation.errors },
        req,
        422
      );
    }

    // --- Log cost ---
    const inputTokens = geminiData.usageMetadata?.promptTokenCount || 0;
    const outputTokens = geminiData.usageMetadata?.candidatesTokenCount || 0;
    const totalTokens = geminiData.usageMetadata?.totalTokenCount || 0;

    await logAICostEvent(
      supabase,
      user.id,
      null,
      'gemini',
      'gemini-3.1-pro-preview',
      inputTokens,
      outputTokens,
      'generate-svg',
      { description: description.substring(0, 100), complexity }
    );

    console.log(`[generate-svg] Completed in ${duration}ms | ${totalTokens} tokens | complexity=${complexity}`);

    // --- Return ---
    return jsonResponse(
      {
        svg_code: svgCode,
        description: `Generated ${complexity} SVG: ${description.substring(0, 80)}`,
      },
      req,
      200
    );
  } catch (error) {
    console.error('[generate-svg] Unhandled error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return errorResponse(message, req, 500);
  }
});
