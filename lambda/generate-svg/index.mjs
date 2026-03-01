/**
 * AWS Lambda — generate-svg
 *
 * Calls Gemini 3.1 Pro to generate rich SVG animations.
 * Deployed with a Function URL (no API Gateway needed).
 * Timeout: 300s (vs Supabase edge function 150s limit).
 *
 * CORS is handled by the Lambda Function URL config — no headers needed here.
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const THINKING_BUDGETS = { simple: 2048, medium: 8192, complex: 16384 };

// ---------------------------------------------------------------------------
// SVG helpers
// ---------------------------------------------------------------------------

function validateSvg(raw) {
  const errors = [];
  const t = raw.trim();
  if (!t.startsWith('<svg')) errors.push('SVG must start with <svg');
  if (!t.endsWith('</svg>')) errors.push('SVG must end with </svg>');
  if (!t.includes('viewBox')) errors.push('SVG must contain a viewBox attribute');
  if (!t.includes('xmlns="http://www.w3.org/2000/svg"') && !t.includes("xmlns='http://www.w3.org/2000/svg'"))
    errors.push('SVG must contain xmlns');
  if (t.includes('<script') || t.includes('javascript:'))
    errors.push('SVG must not contain scripts');
  const bytes = new TextEncoder().encode(t).length;
  if (bytes > 50_000) errors.push(`SVG exceeds 50KB (${(bytes / 1024).toFixed(1)}KB)`);
  return { valid: errors.length === 0, errors };
}

function extractSvg(text) {
  // 1. Try markdown code fences (greedy inner match)
  const fence = text.match(/```(?:svg|xml|html)?\s*\n([\s\S]*?)\n\s*```/);
  if (fence) {
    const inner = fence[1].trim();
    const svgInFence = inner.match(/<svg[\s\S]*<\/svg>/);
    if (svgInFence) return svgInFence[0].trim();
    // Fence content might be a truncated SVG — fall through to repair
    if (inner.includes('<svg')) return repairTruncatedSvg(inner);
    return inner;
  }

  // 2. Extract complete <svg>...</svg> from anywhere in the text
  const raw = text.match(/<svg[\s\S]*<\/svg>/);
  if (raw) return raw[0].trim();

  // 3. SVG starts but is truncated (hit token limit) — repair it
  const svgStart = text.match(/<svg[\s\S]*/);
  if (svgStart) return repairTruncatedSvg(svgStart[0]);

  return text.trim();
}

/**
 * Repair a truncated SVG by closing any open tags.
 * Gemini sometimes hits the output token limit mid-SVG.
 */
function repairTruncatedSvg(svg) {
  let s = svg.trim();

  // Remove any trailing incomplete tag (e.g. "<circle cx="10)
  const lastOpen = s.lastIndexOf('<');
  const lastClose = s.lastIndexOf('>');
  if (lastOpen > lastClose) {
    s = s.substring(0, lastOpen).trim();
  }

  // Close open style/defs/g tags if needed
  const openTags = ['style', 'defs', 'g', 'clipPath', 'mask', 'pattern', 'linearGradient', 'radialGradient', 'filter'];
  for (const tag of openTags) {
    const opens = (s.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length;
    const closes = (s.match(new RegExp(`</${tag}>`, 'g')) || []).length;
    for (let i = closes; i < opens; i++) {
      s += `</${tag}>`;
    }
  }

  // Ensure it ends with </svg>
  if (!s.endsWith('</svg>')) {
    s += '</svg>';
  }

  console.log('[generate-svg] Repaired truncated SVG');
  return s;
}

/**
 * Namespace all CSS class names in an SVG to prevent collisions
 * when multiple SVGs are inlined on the same page.
 * Uses a short hash of the description as the namespace prefix.
 */
function namespaceSvgClasses(svg, namespace) {
  // Find all class names used in class="..." attributes (supports multiple classes)
  const classAttrRegex = /class="([^"]+)"/g;
  const classNames = new Set();
  let m;
  while ((m = classAttrRegex.exec(svg)) !== null) {
    m[1].split(/\s+/).forEach(c => { if (c) classNames.add(c); });
  }

  if (classNames.size === 0) return svg;

  let result = svg;
  for (const cls of classNames) {
    const prefixed = `${namespace}_${cls}`;
    // Replace in class="..." attributes
    result = result.replace(
      new RegExp(`(class="[^"]*?)\\b${cls}\\b([^"]*?")`, 'g'),
      `$1${prefixed}$2`,
    );
    // Replace in <style> blocks (.className selectors)
    result = result.replace(
      new RegExp(`\\.${cls}(?=[\\s{,:])`, 'g'),
      `.${prefixed}`,
    );
  }

  return result;
}

/** Simple string hash → 6-char hex namespace */
function hashNamespace(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return 's' + Math.abs(h).toString(36).slice(0, 5);
}

function buildSystemPrompt(viewbox, brandColors) {
  const colors = Object.entries(brandColors).length > 0
    ? Object.entries(brandColors).map(([n, h]) => `${n}: ${h}`).join(', ')
    : 'Use a modern, professional palette of your choice';

  return `You are an expert SVG illustrator. Create a premium, animated SVG.

HARD RULES:
- CSS @keyframes only (SMIL <animate> allowed ONLY on gradient <stop> elements for stop-color animation)
- viewBox="${viewbox}", xmlns="http://www.w3.org/2000/svg", <title> required
- <style> block inside SVG. No external resources, fonts, images, <script>. Under 50KB.
- @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
- Brand colors: ${colors}

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
// JSON response helper
// ---------------------------------------------------------------------------

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const handler = async (event) => {
  try {
    // --- Auth (require a Bearer token) ---
    const authHeader = event.headers?.authorization || '';
    if (!authHeader.startsWith('Bearer ') || authHeader.length < 30) {
      return json(401, { error: 'Unauthorized' });
    }

    // --- Parse body ---
    const body = JSON.parse(event.body || '{}');
    const description = (body.description || '').trim();
    if (!description) {
      return json(400, { error: 'description is required' });
    }

    const brandColors = body.brand_colors || {};
    const complexity = body.complexity || 'medium';
    const viewbox = body.viewbox || '0 0 600 400';

    if (!['simple', 'medium', 'complex'].includes(complexity)) {
      return json(400, { error: 'complexity must be simple, medium, or complex' });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return json(500, { error: 'GEMINI_API_KEY not configured' });
    }

    const systemPrompt = buildSystemPrompt(viewbox, brandColors);
    const thinkingBudget = THINKING_BUDGETS[complexity] || THINKING_BUDGETS.medium;

    console.log(`[generate-svg] "${description.substring(0, 80)}..." | complexity=${complexity} | thinking=${thinkingBudget}`);
    const startTime = Date.now();

    // --- Call Gemini 3.1 Pro (no timeout — Lambda allows up to 300s) ---
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: description }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 65536,
            thinkingConfig: { thinkingBudget },
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.json().catch(() => ({}));
      const msg = err.error?.message || geminiRes.statusText;
      console.error(`[generate-svg] Gemini error: ${msg}`);
      return json(502, { error: `Gemini API error: ${msg}` });
    }

    const data = await geminiRes.json();
    const duration = Date.now() - startTime;

    if (data.error) {
      return json(502, { error: `Gemini API error: ${data.error.message}` });
    }

    // --- Extract text (skip thought parts) ---
    const parts = data.candidates?.[0]?.content?.parts || [];
    let responseText = '';
    for (const p of parts) {
      if (p.text && !p.thought) responseText = p.text;
    }
    if (!responseText) responseText = parts[parts.length - 1]?.text || '';
    if (!responseText) {
      return json(502, { error: 'No response text from Gemini' });
    }

    // --- Parse & validate ---
    console.log(`[generate-svg] Raw response starts with: ${responseText.substring(0, 200)}`);
    const svgCode = extractSvg(responseText);
    console.log(`[generate-svg] Extracted SVG starts with: ${svgCode.substring(0, 100)}`);
    const validation = validateSvg(svgCode);

    if (!validation.valid) {
      console.error(`[generate-svg] Validation failed: ${validation.errors.join('; ')}`);
      return json(422, { error: 'Generated SVG failed validation', validation_errors: validation.errors });
    }

    // Namespace CSS classes to prevent collisions when multiple SVGs are inlined
    const ns = hashNamespace(description);
    const namespacedSvg = namespaceSvgClasses(svgCode, ns);

    const tokens = data.usageMetadata?.totalTokenCount || 0;
    console.log(`[generate-svg] Done in ${duration}ms | ${tokens} tokens | complexity=${complexity} | ns=${ns}`);

    return json(200, {
      svg_code: namespacedSvg,
      description: `Generated ${complexity} SVG: ${description.substring(0, 80)}`,
    });
  } catch (err) {
    console.error('[generate-svg] Error:', err);
    return json(500, { error: err.message || 'Unknown error' });
  }
};
