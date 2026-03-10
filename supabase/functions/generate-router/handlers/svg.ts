/**
 * Handler: generate-svg
 * Calls Gemini to generate rich SVG animations.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../../_shared/corsHelper.ts';
import { logAICostEvent } from '../../_shared/costTracking.ts';

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
// Extract SVG from Gemini response
// ---------------------------------------------------------------------------

function extractSvgFromResponse(text: string): string {
  const fenceMatch = text.match(/```(?:svg|xml|html)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  const svgMatch = text.match(/<svg[\s\S]*<\/svg>/);
  if (svgMatch) {
    return svgMatch[0].trim();
  }
  return text.trim();
}

// ---------------------------------------------------------------------------
// CSS class namespacing
// ---------------------------------------------------------------------------

function namespaceSvgClasses(svg: string, namespace: string): string {
  const classAttrRegex = /class="([^"]+)"/g;
  const classNames = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = classAttrRegex.exec(svg)) !== null) {
    m[1].split(/\s+/).forEach(c => { if (c) classNames.add(c); });
  }

  if (classNames.size === 0) return svg;

  let result = svg;
  for (const cls of classNames) {
    const prefixed = `${namespace}_${cls}`;
    result = result.replace(
      new RegExp(`(class="[^"]*?)\\b${cls}\\b([^"]*?")`, 'g'),
      `$1${prefixed}$2`,
    );
    result = result.replace(
      new RegExp(`\\.${cls}(?=[\\s{,:])`, 'g'),
      `.${prefixed}`,
    );
  }

  return result;
}

function hashNamespace(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return 's' + Math.abs(h).toString(36).slice(0, 5);
}

function buildSystemPrompt(viewbox: string, brandColors: Record<string, string>): string {
  const formattedColors = Object.entries(brandColors).length > 0
    ? Object.entries(brandColors).map(([name, hex]) => `${name}: ${hex}`).join(', ')
    : 'Use a modern, professional palette of your choice';

  return `You are an expert SVG illustrator. Create a premium, animated SVG.

HARD RULES:
- CSS @keyframes only (SMIL <animate> allowed ONLY on gradient <stop> elements for stop-color animation)
- viewBox="${viewbox}", xmlns="http://www.w3.org/2000/svg", <title> required
- <style> block inside SVG. No external resources, fonts, images, <script>. Under 50KB.
- @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
- Brand colors: ${formattedColors}

BROKEN IN SVG — never use:
var(), :root, ::before/::after, box-shadow, background, padding/margin/border, z-index, position, display:flex/grid, CSS 3D transforms (rotateX/rotateY/perspective), will-change, box-sizing

SVG TRANSFORM RULES:
- For SCALE and ROTATE in-place: set transform-box: fill-box; transform-origin: center; on the element
- For TRANSLATE (travel across SVG): do NOT use transform-box: fill-box — it breaks travel distance. Wrap in <g transform="translate(startX, startY)"> and animate translate on the inner element.
- For HINGE animations (lids, flaps, doors): do NOT use transform-box: fill-box. Do NOT use compound rotate-scaleY-rotate transforms (the angle math is error-prone). Instead: set transform-origin to one endpoint of the hinge edge and use a simple rotate(). Example: a flap hinged along a line from (200,180) to (300,220) — set transform-origin: 200px 180px; and rotate by the angle of that edge. For "closed" state use the rotation, for "open" use transform: none. If the fold is too complex, skip the fold animation entirely and use opacity: 0→1 fade instead.

SPATIAL MATH — think about coordinates:
- To move an object fully off-screen, measure from the object's BOTTOM edge (not top). E.g. a rocket with nose at y=230 and nozzle at y=400 in viewBox="0 0 300 500" needs translateY(-450px) to clear the top (400 + margin). Always add 50px+ margin beyond the bottom edge position.
- Traveling pulses/particles: calculate the actual pixel distance between start and end positions. If node A is at x=100 and node B is at x=400, the translate distance is 300px.
- SVG PAINT ORDER: SVG has no z-index. Elements later in the document paint ON TOP. Overlays (countdown text, HUD elements, labels) must come AFTER the objects they overlay in document order.
- Use presentation attributes (fill="red") not inline style="fill:red" so CSS can override.

QUALITY:
- Rich gradients (linearGradient + radialGradient), filter effects (feGaussianBlur, feColorMatrix, feComposite), glow/bloom
- Stagger entrances with animation-delay. Use animation-fill-mode: both.
- Easing: cubic-bezier(0.34,1.56,0.64,1) for bounce, cubic-bezier(0.16,1,0.3,1) for snap
- Line-drawing: stroke-dasharray:2000; stroke-dashoffset:2000; animate to 0
- Background texture, ambient particles, micro-details. Fill the viewBox.
- Descriptive IDs: id="rocket-body" not id="g1"

Output ONLY the raw SVG. No markdown, no explanation.`;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handleSvg(req: Request): Promise<Response> {
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

    // --- Gemini API key ---
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      return errorResponse('GEMINI_API_KEY is not configured on the server', req, 500);
    }

    // --- Build prompt ---
    const systemPrompt = buildSystemPrompt(viewbox, brandColors);
    const thinkingBudget = THINKING_BUDGETS[complexity] ?? THINKING_BUDGETS.medium;

    console.log(`[generate-svg] "${description.substring(0, 80)}..." | complexity=${complexity} | thinking=${thinkingBudget}`);

    const startTime = performance.now();

    // --- Call Gemini ---
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
    const parts = geminiData.candidates?.[0]?.content?.parts || [];
    let responseText = '';
    for (const part of parts) {
      if (part.text && !part.thought) {
        responseText = part.text;
      }
    }

    if (!responseText) {
      responseText = parts[parts.length - 1]?.text || '';
    }

    if (!responseText) {
      return errorResponse('No response text from Gemini', req, 502);
    }

    // --- Parse & validate SVG ---
    const svgCode = extractSvgFromResponse(responseText);
    const validation = validateSvg(svgCode);

    if (!validation.valid) {
      console.error(`[generate-svg] SVG validation failed: ${validation.errors.join('; ')}`);
      return jsonResponse(
        { error: 'Generated SVG failed validation', validation_errors: validation.errors },
        req,
        422
      );
    }

    const ns = hashNamespace(description);
    const namespacedSvg = namespaceSvgClasses(svgCode, ns);

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

    console.log(`[generate-svg] Completed in ${duration}ms | ${totalTokens} tokens | complexity=${complexity} | ns=${ns}`);

    // --- Return ---
    return jsonResponse(
      {
        svg_code: namespacedSvg,
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
}
