/**
 * Export Polish Agent
 *
 * Takes LandingSection[] + BrandConfig and produces polished, production-ready
 * React + Tailwind code via AI. Result is cached in workspace.polished_code
 * and invalidated when sections change.
 *
 * Used by: EditorToolbar "Copy Code" and "Download HTML" buttons
 */

import type { LandingSection, BrandConfig } from '../types';
import { renderSectionsToCode } from '../sectionRenderer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExportResult {
  code: string;
  html: string;
  cachedAt: number;
}

interface ExportPolishParams {
  sections: LandingSection[];
  brandConfig: BrandConfig;
  companyName?: string;
  polishWithAI?: boolean;
  onProgress?: (status: string) => void;
}

// ---------------------------------------------------------------------------
// System prompt for AI polish pass
// ---------------------------------------------------------------------------

export const EXPORT_POLISH_SYSTEM_PROMPT = `You are a senior frontend engineer polishing a landing page for production export.

INPUT: A functional React + Tailwind landing page component (generated from structured data).

YOUR JOB: Enhance the code for production quality while preserving ALL existing content and structure.

ENHANCE:
- Add smooth scroll-triggered animations (CSS @keyframes, Tailwind animate-*)
- Add gradient backgrounds and visual depth (blur-3xl orbs, glass-morphism cards)
- Improve spacing rhythm (consistent section padding, breathing room between elements)
- Add responsive breakpoints (mobile-first: sm:, md:, lg:, xl:)
- Add hover states and micro-interactions on CTAs and cards
- Ensure proper semantic HTML (nav, main, section, footer)
- Add aria-labels for accessibility

DO NOT:
- Change any copy text (headlines, body, CTAs) — use exact text provided
- Remove any sections or change their order
- Change the brand colours — use the exact palette
- Add external dependencies or imports
- Wrap in markdown code blocks — output raw code only
- Add comments explaining what you changed

OUTPUT: A single React component as a self-contained string. Include:
- All CSS @keyframes at the top in a <style> block
- The component function
- Export default statement`;

// ---------------------------------------------------------------------------
// Code generator (no AI — deterministic from sections)
// ---------------------------------------------------------------------------

function generateBaseCode(sections: LandingSection[], brandConfig: BrandConfig): string {
  return renderSectionsToCode(sections, brandConfig);
}

// ---------------------------------------------------------------------------
// HTML wrapper for standalone download
// ---------------------------------------------------------------------------

function wrapInHtml(reactCode: string, brandConfig: BrandConfig, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(brandConfig.font_heading)}:wght@400;600;700&family=${encodeURIComponent(brandConfig.font_body)}:wght@400;500&display=swap" rel="stylesheet" />
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            heading: ['${brandConfig.font_heading}', 'sans-serif'],
            body: ['${brandConfig.font_body}', 'sans-serif'],
          },
          colors: {
            brand: {
              primary: '${brandConfig.primary_color}',
              secondary: '${brandConfig.secondary_color}',
              accent: '${brandConfig.accent_color}',
            }
          }
        }
      }
    }
  </script>
  <style>
    body { font-family: '${brandConfig.font_body}', sans-serif; }
    h1, h2, h3, h4, h5, h6 { font-family: '${brandConfig.font_heading}', sans-serif; }
  </style>
</head>
<body>
${reactCode}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Cache key — changes when sections content changes
// ---------------------------------------------------------------------------

function computeCacheKey(sections: LandingSection[], brandConfig: BrandConfig): string {
  const content = sections.map(s => `${s.id}:${s.copy.headline}:${s.layout_variant}:${s.style.bg_color}`).join('|');
  const brand = `${brandConfig.primary_color}:${brandConfig.font_heading}`;
  return `${content}::${brand}`;
}

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

let cachedResult: ExportResult | null = null;
let cachedKey: string | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate polished export code from sections.
 * Returns cached result if sections haven't changed.
 */
export async function generateExport(params: ExportPolishParams): Promise<ExportResult> {
  const { sections, brandConfig, companyName, onProgress } = params;
  const key = computeCacheKey(sections, brandConfig);

  // Return cache hit
  if (cachedKey === key && cachedResult) {
    return cachedResult;
  }

  onProgress?.('Generating code...');

  // Generate base code from section renderer (deterministic, instant)
  const baseCode = generateBaseCode(sections, brandConfig);

  onProgress?.('Preparing export...');

  // For now, use the deterministic renderer output directly.
  // AI polish pass can be added later by sending baseCode to the AI
  // with EXPORT_POLISH_SYSTEM_PROMPT and using the response instead.
  const code = baseCode;

  const title = companyName ? `${companyName} — Landing Page` : 'Landing Page';
  const html = wrapInHtml(code, brandConfig, title);

  const result: ExportResult = {
    code,
    html,
    cachedAt: Date.now(),
  };

  // Cache result
  cachedKey = key;
  cachedResult = result;

  return result;
}

/**
 * Invalidate the export cache (call when sections are edited).
 */
export function invalidateExportCache(): void {
  cachedKey = null;
  cachedResult = null;
}

/**
 * Download HTML as a file.
 */
export function downloadHtml(html: string, filename: string = 'landing-page.html'): void {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Copy code to clipboard.
 */
export async function copyCodeToClipboard(code: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(code);
    return true;
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = code;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  }
}
