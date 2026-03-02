#!/usr/bin/env npx tsx
/**
 * generate-svg.ts — Gemini 3.1 Pro SVG Animation Generator
 *
 * Calls Google Gemini 3.1 Pro to generate production-ready animated SVGs
 * following the Sixty design system and web-animations skill spec.
 *
 * Usage:
 *   npx tsx .claude/skills/web-animations/generate-svg.ts \
 *     --name "hero-orbital" \
 *     --description "Central AI hub with orbiting tool nodes..." \
 *     --viewbox "0 0 600 600" \
 *     --complexity complex \
 *     --output packages/landing/src/svg/hero-orbital.svg
 *
 * Options:
 *   --name          SVG identifier (used for CSS class prefixes)
 *   --description   Full description of the animation to generate
 *   --viewbox       SVG viewBox attribute (default: "0 0 400 300")
 *   --complexity    simple|medium|complex (sets thinking budget)
 *   --output        Output file path
 *   --colors        Custom color overrides as JSON (optional)
 *   --prompt-file   Read description from a file instead of --description
 *   --dry-run       Print the prompt without calling the API
 *   --temperature   Model temperature 0-1 (default: 0.7)
 */

import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

const GEMINI_MODEL = 'gemini-3.1-pro-preview';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const THINKING_BUDGETS: Record<string, number> = {
  simple: 2048,
  medium: 8192,
  complex: 16384,
};

// Sixty brand colors (dark-mode optimized for landing page)
const SIXTY_COLORS = {
  violet: '#8129D7',
  violetLight: '#A855F7',
  violetDark: '#6D28D9',
  blue: '#2A5EDB',
  blueLight: '#60A5FA',
  teal: '#03AD9C',
  tealLight: '#2DD4BF',
  amber: '#F59E0B',
  background: '#09090b',
  surface: '#18181b',
  textPrimary: '#F3F4F6',
  textSecondary: '#9CA3AF',
  border: '#27272a',
  white: '#FFFFFF',
  green: '#10B981',
};

// ─────────────────────────────────────────────────────────────
// Parse CLI args
// ─────────────────────────────────────────────────────────────

function parseArgs(): Record<string, string> {
  const args: Record<string, string> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : 'true';
      args[key] = val;
      if (val !== 'true') i++;
    }
  }
  return args;
}

// ─────────────────────────────────────────────────────────────
// Build prompt
// ─────────────────────────────────────────────────────────────

function buildPrompt(name: string, description: string, viewBox: string, colors: typeof SIXTY_COLORS): string {
  return `Generate a single, self-contained SVG animation of: ${description}

OUTPUT FORMAT:
- Output ONLY the raw <svg>...</svg> markup. No markdown, no explanation, no code fences.
- Your entire response must start with <svg and end with </svg>.

SVG REQUIREMENTS:
- viewBox="${viewBox}". Do NOT set fixed width or height attributes.
- Add xmlns="http://www.w3.org/2000/svg" to the root <svg> element.
- All animations MUST use CSS @keyframes inside a <style> tag within <defs>.
- Do NOT use SMIL animation (<animate>, <animateTransform>, <animateMotion>, <set>).
- Include a <title> element for accessibility.
- Do NOT include any <script> tags or external resources.
- Keep total SVG under 50KB.
- Use CSS class names prefixed with "${name}-" to avoid conflicts with other SVGs on the same page.

DESIGN SYSTEM (DARK MODE — these SVGs render on a near-black #09090b background):
- Primary Violet: ${colors.violet} (core brand, use for main elements)
- Violet Light: ${colors.violetLight} (accents, glows)
- Violet Dark: ${colors.violetDark} (deeper tones)
- Blue: ${colors.blue} (secondary elements)
- Blue Light: ${colors.blueLight} (highlights)
- Teal: ${colors.teal} (tertiary, success-adjacent)
- Teal Light: ${colors.tealLight} (accents)
- Amber Warning: ${colors.amber} (alerts, attention)
- White: ${colors.white} (text, high-contrast elements)
- Text Secondary: ${colors.textSecondary} (labels, muted text)
- Green: ${colors.green} (checkmarks, success)
- Font: system-ui, -apple-system, sans-serif

ACCESSIBILITY:
Include this at the end of your <style> block:
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}

VISUAL QUALITY:
- Use <linearGradient> and <radialGradient> for depth and richness
- Use <filter> with feGaussianBlur for glow effects (keep stdDeviation ≤ 6)
- Layer elements for depth: background effects → mid-ground elements → foreground details
- Prefer transform and opacity for smooth 60fps animations
- Make it feel alive, organic, and premium — NOT robotic or mechanical
- Think Linear.app, Stripe.com, Vercel quality
- All animations should loop seamlessly

ANIMATION GUIDELINES:
- Use cubic-bezier(0.22, 1, 0.36, 1) for entrances (easeOutQuint — the premium SaaS standard)
- Use ease-in-out or cubic-bezier(0.37, 0, 0.63, 1) for looping/breathing animations
- Keep total animation durations 3-8s for ambient loops
- Stagger multiple elements with animation-delay for organic feel
- Energy/data particles: use stroke-dasharray + stroke-dashoffset animation`;
}

// ─────────────────────────────────────────────────────────────
// Call Gemini API
// ─────────────────────────────────────────────────────────────

async function callGemini(
  prompt: string,
  apiKey: string,
  complexity: string,
  temperature: number
): Promise<string> {
  const thinkingBudget = THINKING_BUDGETS[complexity] ?? THINKING_BUDGETS.medium;

  console.log(`\n🤖 Calling Gemini (${GEMINI_MODEL})`);
  console.log(`   Thinking budget: ${thinkingBudget}`);
  console.log(`   Temperature: ${temperature}`);
  console.log(`   Prompt length: ${prompt.length} chars\n`);

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: 65536,
      thinkingConfig: {
        thinkingBudget,
      },
    },
  };

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${err}`);
  }

  const data = await response.json();

  // Extract text from response parts (skip thinking parts)
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  let svgText = '';
  for (const part of parts) {
    if (part.text) {
      svgText += part.text;
    }
  }

  return svgText.trim();
}

// ─────────────────────────────────────────────────────────────
// Extract & validate SVG
// ─────────────────────────────────────────────────────────────

function extractSvg(raw: string): string {
  // Strip markdown fences if present
  let text = raw.replace(/```(?:xml|svg|html)?\n?/g, '').replace(/```\n?$/g, '').trim();

  // Extract <svg>...</svg>
  const match = text.match(/<svg[\s\S]*<\/svg>/i);
  if (!match) {
    throw new Error('No <svg>...</svg> found in Gemini response');
  }
  return match[0];
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function validateSvg(svg: string, name: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Structure checks
  if (!svg.includes('viewBox')) errors.push('Missing viewBox attribute');
  if (!svg.includes('xmlns="http://www.w3.org/2000/svg"')) errors.push('Missing xmlns attribute');
  if (!/<title>/.test(svg)) errors.push('Missing <title> element');

  // Animation checks
  if (!/@keyframes/.test(svg)) warnings.push('No CSS @keyframes found');
  if (/<animate[\s>]/.test(svg)) errors.push('Contains SMIL <animate> — must use CSS @keyframes only');
  if (/<animateTransform[\s>]/.test(svg)) errors.push('Contains SMIL <animateTransform>');
  if (/<animateMotion[\s>]/.test(svg)) errors.push('Contains SMIL <animateMotion>');

  // Security checks
  if (/<script[\s>]/i.test(svg)) errors.push('Contains <script> tag — security violation');
  if (/javascript:/i.test(svg)) errors.push('Contains javascript: URI — security violation');

  // Accessibility
  if (!/prefers-reduced-motion/.test(svg)) warnings.push('Missing prefers-reduced-motion media query');

  // Size check
  const sizeKB = Buffer.byteLength(svg, 'utf8') / 1024;
  if (sizeKB > 50) errors.push(`SVG too large: ${sizeKB.toFixed(1)}KB (max 50KB)`);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  const name = args.name;
  const viewBox = args.viewbox ?? '0 0 400 300';
  const complexity = args.complexity ?? 'medium';
  const outputPath = args.output;
  const temperature = parseFloat(args.temperature ?? '0.7');
  const dryRun = args['dry-run'] === 'true';

  // Get description from file or arg
  let description = args.description ?? '';
  if (args['prompt-file']) {
    description = readFileSync(args['prompt-file'], 'utf-8').trim();
  }

  if (!name || !description || !outputPath) {
    console.error('Usage: generate-svg.ts --name <name> --description "<desc>" --output <path>');
    console.error('  or:  generate-svg.ts --name <name> --prompt-file <file> --output <path>');
    process.exit(1);
  }

  // Custom colors override
  let colors = { ...SIXTY_COLORS };
  if (args.colors) {
    try {
      colors = { ...colors, ...JSON.parse(args.colors) };
    } catch {
      console.warn('⚠️  Failed to parse --colors JSON, using defaults');
    }
  }

  // Build prompt
  const prompt = buildPrompt(name, description, viewBox, colors);

  if (dryRun) {
    console.log('═══ DRY RUN — PROMPT ═══\n');
    console.log(prompt);
    console.log('\n═══ END PROMPT ═══');
    process.exit(0);
  }

  // Get API key
  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ No GEMINI_API_KEY or VITE_GEMINI_API_KEY found in environment');
    process.exit(1);
  }

  try {
    // Call Gemini
    const raw = await callGemini(prompt, apiKey, complexity, temperature);

    // Extract SVG
    const svg = extractSvg(raw);

    // Validate
    const validation = validateSvg(svg, name);

    if (validation.warnings.length > 0) {
      console.log('⚠️  Warnings:');
      validation.warnings.forEach((w) => console.log(`   - ${w}`));
    }

    if (!validation.valid) {
      console.error('❌ Validation failed:');
      validation.errors.forEach((e) => console.error(`   - ${e}`));
      // Still save the file for inspection
      console.log('\n💾 Saving anyway for inspection...');
    } else {
      console.log('✅ Validation passed');
    }

    // Save
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, svg, 'utf-8');

    const sizeKB = (Buffer.byteLength(svg, 'utf8') / 1024).toFixed(1);
    console.log(`\n💾 Saved: ${outputPath} (${sizeKB}KB)`);

  } catch (err) {
    console.error(`\n❌ Error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main();
