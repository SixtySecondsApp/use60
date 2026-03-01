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
import { CopilotService } from '@/lib/services/copilotService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportFormat = 'html' | 'react';

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
  format?: ExportFormat;
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
// In-memory cache (separate entries for raw vs polished)
// ---------------------------------------------------------------------------

let cachedResult: ExportResult | null = null;
let cachedKey: string | null = null;
let cachedPolishedResult: ExportResult | null = null;
let cachedPolishedKey: string | null = null;

// ---------------------------------------------------------------------------
// AI polish pass
// ---------------------------------------------------------------------------

async function polishWithAI(
  baseCode: string,
  onProgress?: (status: string) => void,
): Promise<string> {
  onProgress?.('Polishing with AI...');

  try {
    const response = await CopilotService.sendMessage(
      `${EXPORT_POLISH_SYSTEM_PROMPT}\n\n--- BASE CODE ---\n${baseCode}\n--- END BASE CODE ---\n\nPolish this landing page for production. Output only the complete HTML code.`,
      {
        currentView: 'dashboard',
        userId: '', // Extracted from JWT server-side
      } as any,
    );

    const polished = response.response?.content;
    if (typeof polished === 'string' && polished.length > 100) {
      // Strip markdown code fences if AI wrapped the output
      const cleaned = polished
        .replace(/^```(?:html|tsx|jsx)?\n?/gm, '')
        .replace(/\n?```$/gm, '')
        .trim();
      return cleaned;
    }
  } catch (error) {
    onProgress?.('AI polish failed — using base code');
    console.warn('Export polish AI call failed, falling back to base code:', error);
  }

  return baseCode;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate export code from sections.
 * When polishWithAI is true, sends the base code through the AI polish pass.
 * Returns cached result if sections haven't changed.
 */
export async function generateExport(params: ExportPolishParams): Promise<ExportResult> {
  const { sections, brandConfig, companyName, polishWithAI: shouldPolish, onProgress } = params;
  const key = computeCacheKey(sections, brandConfig);

  // Return cache hit for polished
  if (shouldPolish && cachedPolishedKey === key && cachedPolishedResult) {
    return cachedPolishedResult;
  }
  // Return cache hit for raw
  if (!shouldPolish && cachedKey === key && cachedResult) {
    return cachedResult;
  }

  onProgress?.('Generating code...');

  // Generate base code from section renderer (deterministic, instant)
  const baseCode = generateBaseCode(sections, brandConfig);

  let code = baseCode;

  if (shouldPolish) {
    code = await polishWithAI(baseCode, onProgress);
  }

  onProgress?.('Preparing export...');

  const title = companyName ? `${companyName} — Landing Page` : 'Landing Page';
  const html = wrapInHtml(code, brandConfig, title);

  const result: ExportResult = {
    code,
    html,
    cachedAt: Date.now(),
  };

  // Cache result in appropriate slot
  if (shouldPolish) {
    cachedPolishedKey = key;
    cachedPolishedResult = result;
  } else {
    cachedKey = key;
    cachedResult = result;
  }

  return result;
}

/**
 * Invalidate the export cache (call when sections are edited).
 */
export function invalidateExportCache(): void {
  cachedKey = null;
  cachedResult = null;
  cachedPolishedKey = null;
  cachedPolishedResult = null;
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
 * Generate self-contained React TSX from sections.
 */
function generateReactTsx(sections: LandingSection[], brandConfig: BrandConfig): string {
  const sorted = [...sections].sort((a, b) => a.order - b.order);
  const sectionBlocks = sorted.map((s) => {
    const bodyLines = s.copy.body.split('\n').filter(Boolean);
    const bodyJsx = bodyLines.length > 1
      ? bodyLines.map((line, i) => `          <p key={${i}} className="text-base opacity-70 mb-2">${line}</p>`).join('\n')
      : `          <p className="text-base opacity-60 max-w-xl mx-auto">${s.copy.body}</p>`;

    return `      {/* ${s.type} — ${s.layout_variant} */}
      <section className="py-16 md:py-24 px-6" style={{ backgroundColor: '${s.style.bg_color}', color: '${s.style.text_color}' }}>
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">${s.copy.headline}</h2>
          <p className="text-lg opacity-80 mb-4">${s.copy.subhead}</p>
${bodyJsx}
          ${s.copy.cta ? `<a href="#" className="mt-8 inline-block px-8 py-4 rounded-full text-white font-semibold" style={{ background: '${s.style.accent_color}' }}>${s.copy.cta}</a>` : ''}
        </div>
      </section>`;
  }).join('\n\n');

  return `import React from 'react';

export default function LandingPage() {
  return (
    <div style={{ fontFamily: "'${brandConfig.font_body}', sans-serif" }}>
${sectionBlocks}
    </div>
  );
}
`;
}

/**
 * Download React TSX as a file.
 */
export function downloadReactTsx(sections: LandingSection[], brandConfig: BrandConfig, filename = 'LandingPage.tsx'): void {
  const tsx = generateReactTsx(sections, brandConfig);
  const blob = new Blob([tsx], { type: 'text/typescript' });
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
