/**
 * Deterministic Section Renderer
 * Converts structured LandingSection[] + BrandConfig into a complete
 * self-contained React + Tailwind component string for iframe preview.
 *
 * 16 templates: 8 section types x 2 layout variants each.
 */

import type { LandingSection, BrandConfig } from './types';

// ---------------------------------------------------------------------------
// Asset slot helpers
// ---------------------------------------------------------------------------

function renderImageSlot(section: LandingSection): string {
  if (section.image_status === 'generating') {
    return `<div class="w-full aspect-video rounded-2xl bg-gradient-to-br from-gray-200 via-gray-100 to-gray-200 animate-pulse"></div>`;
  }
  if (section.image_status === 'complete' && section.image_url) {
    return `<img src="${escapeHtml(section.image_url)}" alt="${escapeHtml(section.copy.headline)}" class="w-full rounded-2xl shadow-lg object-cover animate-fadeIn" />`;
  }
  // idle or failed — empty slot
  return '';
}

function renderSvgSlot(section: LandingSection): string {
  if (section.svg_status === 'generating') {
    return `<div class="w-full aspect-square max-w-xs mx-auto rounded-xl bg-gradient-to-tr from-gray-200 via-gray-50 to-gray-200 animate-pulse flex items-center justify-center">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" class="opacity-20"><rect x="4" y="4" width="40" height="40" rx="8" stroke="currentColor" stroke-width="2"/><circle cx="24" cy="24" r="8" stroke="currentColor" stroke-width="2"/></svg>
    </div>`;
  }
  if (section.svg_status === 'complete' && section.svg_code) {
    return `<div class="w-full max-w-xs mx-auto animate-fadeIn">${section.svg_code}</div>`;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fontUrl(brand: BrandConfig): string {
  const families = [brand.font_heading, brand.font_body]
    .filter(Boolean)
    .map((f) => f.replace(/ /g, '+') + ':wght@400;500;600;700;800')
    .join('&family=');
  return `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
}

function ctaButton(label: string, accent: string): string {
  return `<a href="#" class="inline-block px-8 py-4 rounded-full text-white font-semibold text-lg shadow-lg hover:shadow-xl transition-all duration-200 hover:-translate-y-0.5" style="background-color: ${accent}">${escapeHtml(label)}</a>`;
}

function sectionWrap(id: string, bg: string, textColor: string, inner: string): string {
  return `<section data-section-id="${escapeHtml(id)}" style="background-color: ${bg}; color: ${textColor}">${inner}</section>`;
}

// ---------------------------------------------------------------------------
// Section templates — 16 total (8 types x 2 variants)
// ---------------------------------------------------------------------------

// ----- HERO -----

function heroCenter(s: LandingSection): string {
  const asset = renderImageSlot(s) || renderSvgSlot(s);
  return `
    <div class="py-20 md:py-32 px-6">
      <div class="max-w-4xl mx-auto text-center">
        <h1 class="text-4xl md:text-6xl lg:text-7xl font-extrabold leading-tight mb-6">${escapeHtml(s.copy.headline)}</h1>
        <p class="text-lg md:text-xl opacity-80 max-w-2xl mx-auto mb-4">${escapeHtml(s.copy.subhead)}</p>
        <p class="text-base opacity-60 max-w-xl mx-auto mb-10">${escapeHtml(s.copy.body)}</p>
        <div class="mb-12">${ctaButton(s.copy.cta, s.style.accent_color)}</div>
        ${asset ? `<div class="mt-8 max-w-3xl mx-auto">${asset}</div>` : ''}
      </div>
    </div>`;
}

function heroSplitLeft(s: LandingSection): string {
  const asset = renderImageSlot(s) || renderSvgSlot(s);
  return `
    <div class="py-16 md:py-28 px-6">
      <div class="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
        <div>
          <h1 class="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-tight mb-6">${escapeHtml(s.copy.headline)}</h1>
          <p class="text-lg md:text-xl opacity-80 mb-4">${escapeHtml(s.copy.subhead)}</p>
          <p class="text-base opacity-60 mb-8">${escapeHtml(s.copy.body)}</p>
          ${ctaButton(s.copy.cta, s.style.accent_color)}
        </div>
        <div>${asset || '<div class="aspect-video rounded-2xl bg-black/5"></div>'}</div>
      </div>
    </div>`;
}

// ----- PROBLEM -----

function problemCenter(s: LandingSection): string {
  const asset = renderSvgSlot(s) || renderImageSlot(s);
  return `
    <div class="py-16 md:py-24 px-6">
      <div class="max-w-3xl mx-auto text-center">
        ${asset ? `<div class="mb-10 max-w-xs mx-auto">${asset}</div>` : ''}
        <h2 class="text-3xl md:text-4xl font-bold mb-4">${escapeHtml(s.copy.headline)}</h2>
        <p class="text-lg opacity-80 mb-4">${escapeHtml(s.copy.subhead)}</p>
        <p class="text-base opacity-60 max-w-xl mx-auto">${escapeHtml(s.copy.body)}</p>
      </div>
    </div>`;
}

function problemSplitRight(s: LandingSection): string {
  const asset = renderSvgSlot(s) || renderImageSlot(s);
  return `
    <div class="py-16 md:py-24 px-6">
      <div class="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
        <div>
          <h2 class="text-3xl md:text-4xl font-bold mb-4">${escapeHtml(s.copy.headline)}</h2>
          <p class="text-lg opacity-80 mb-4">${escapeHtml(s.copy.subhead)}</p>
          <p class="text-base opacity-60">${escapeHtml(s.copy.body)}</p>
        </div>
        <div>${asset || '<div class="aspect-square rounded-2xl bg-black/5"></div>'}</div>
      </div>
    </div>`;
}

// ----- SOLUTION -----

function solutionSplitLeft(s: LandingSection): string {
  const asset = renderImageSlot(s) || renderSvgSlot(s);
  return `
    <div class="py-16 md:py-24 px-6">
      <div class="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
        <div>${asset || '<div class="aspect-video rounded-2xl bg-black/5"></div>'}</div>
        <div>
          <h2 class="text-3xl md:text-4xl font-bold mb-4">${escapeHtml(s.copy.headline)}</h2>
          <p class="text-lg opacity-80 mb-4">${escapeHtml(s.copy.subhead)}</p>
          <p class="text-base opacity-60 mb-8">${escapeHtml(s.copy.body)}</p>
          ${ctaButton(s.copy.cta, s.style.accent_color)}
        </div>
      </div>
    </div>`;
}

function solutionSplitRight(s: LandingSection): string {
  const asset = renderImageSlot(s) || renderSvgSlot(s);
  return `
    <div class="py-16 md:py-24 px-6">
      <div class="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
        <div>
          <h2 class="text-3xl md:text-4xl font-bold mb-4">${escapeHtml(s.copy.headline)}</h2>
          <p class="text-lg opacity-80 mb-4">${escapeHtml(s.copy.subhead)}</p>
          <p class="text-base opacity-60 mb-8">${escapeHtml(s.copy.body)}</p>
          ${ctaButton(s.copy.cta, s.style.accent_color)}
        </div>
        <div>${asset || '<div class="aspect-video rounded-2xl bg-black/5"></div>'}</div>
      </div>
    </div>`;
}

// ----- FEATURES -----

function featuresCardsGrid(s: LandingSection): string {
  // Body is rendered as a single block; the grid visual comes from SVG/image assets
  const asset = renderSvgSlot(s) || renderImageSlot(s);
  const bodyParagraphs = s.copy.body
    .split('\n')
    .filter(Boolean)
    .map(
      (line, i) =>
        `<div class="p-6 rounded-2xl bg-white/60 shadow-sm border border-black/5">
          <div class="text-2xl font-bold mb-2" style="color: ${s.style.accent_color}">${String(i + 1).padStart(2, '0')}</div>
          <p class="text-base opacity-80">${escapeHtml(line)}</p>
        </div>`
    );
  // Use at least 3 cards even if body has fewer lines
  const cards = bodyParagraphs.length >= 2 ? bodyParagraphs.join('') : `<div class="col-span-full text-base opacity-70">${escapeHtml(s.copy.body)}</div>`;

  return `
    <div class="py-16 md:py-24 px-6">
      <div class="max-w-6xl mx-auto">
        <div class="text-center mb-14">
          <h2 class="text-3xl md:text-4xl font-bold mb-4">${escapeHtml(s.copy.headline)}</h2>
          <p class="text-lg opacity-80 max-w-2xl mx-auto">${escapeHtml(s.copy.subhead)}</p>
        </div>
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">${cards}</div>
        ${asset ? `<div class="mt-12 max-w-md mx-auto">${asset}</div>` : ''}
        ${s.copy.cta ? `<div class="text-center mt-12">${ctaButton(s.copy.cta, s.style.accent_color)}</div>` : ''}
      </div>
    </div>`;
}

function featuresCentered(s: LandingSection): string {
  const asset = renderImageSlot(s) || renderSvgSlot(s);
  return `
    <div class="py-16 md:py-24 px-6">
      <div class="max-w-3xl mx-auto text-center">
        <h2 class="text-3xl md:text-4xl font-bold mb-4">${escapeHtml(s.copy.headline)}</h2>
        <p class="text-lg opacity-80 mb-4">${escapeHtml(s.copy.subhead)}</p>
        <p class="text-base opacity-60 max-w-xl mx-auto mb-10">${escapeHtml(s.copy.body)}</p>
        ${asset ? `<div class="max-w-2xl mx-auto mb-10">${asset}</div>` : ''}
        ${s.copy.cta ? `<div>${ctaButton(s.copy.cta, s.style.accent_color)}</div>` : ''}
      </div>
    </div>`;
}

// ----- SOCIAL PROOF -----

function socialProofCenter(s: LandingSection): string {
  const asset = renderSvgSlot(s) || renderImageSlot(s);
  return `
    <div class="py-16 md:py-24 px-6">
      <div class="max-w-3xl mx-auto text-center">
        ${asset ? `<div class="mb-8 max-w-xs mx-auto">${asset}</div>` : ''}
        <h2 class="text-3xl md:text-4xl font-bold mb-4">${escapeHtml(s.copy.headline)}</h2>
        <blockquote class="text-xl md:text-2xl italic opacity-80 mb-4 leading-relaxed">"${escapeHtml(s.copy.subhead)}"</blockquote>
        <p class="text-base opacity-60">${escapeHtml(s.copy.body)}</p>
      </div>
    </div>`;
}

function socialProofCardsGrid(s: LandingSection): string {
  const testimonials = s.copy.body
    .split('\n')
    .filter(Boolean)
    .map(
      (line) =>
        `<div class="p-6 rounded-2xl bg-white/60 shadow-sm border border-black/5">
          <div class="text-lg mb-3 opacity-40">&ldquo;</div>
          <p class="text-base opacity-80 italic mb-4">${escapeHtml(line)}</p>
          <div class="h-px bg-black/10 mb-3"></div>
          <p class="text-sm font-medium opacity-60">Customer</p>
        </div>`
    );
  const cards = testimonials.length >= 2 ? testimonials.join('') : `<div class="col-span-full text-center text-base opacity-70 italic">"${escapeHtml(s.copy.body)}"</div>`;

  return `
    <div class="py-16 md:py-24 px-6">
      <div class="max-w-6xl mx-auto">
        <div class="text-center mb-14">
          <h2 class="text-3xl md:text-4xl font-bold mb-4">${escapeHtml(s.copy.headline)}</h2>
          <p class="text-lg opacity-80 max-w-2xl mx-auto">${escapeHtml(s.copy.subhead)}</p>
        </div>
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">${cards}</div>
      </div>
    </div>`;
}

// ----- CTA -----

function ctaCenter(s: LandingSection): string {
  const asset = renderSvgSlot(s) || renderImageSlot(s);
  return `
    <div class="py-20 md:py-28 px-6">
      <div class="max-w-3xl mx-auto text-center">
        ${asset ? `<div class="mb-8 max-w-xs mx-auto">${asset}</div>` : ''}
        <h2 class="text-3xl md:text-5xl font-bold mb-4">${escapeHtml(s.copy.headline)}</h2>
        <p class="text-lg opacity-80 mb-4">${escapeHtml(s.copy.subhead)}</p>
        <p class="text-base opacity-60 max-w-xl mx-auto mb-10">${escapeHtml(s.copy.body)}</p>
        ${ctaButton(s.copy.cta, s.style.accent_color)}
      </div>
    </div>`;
}

function ctaSplitLeft(s: LandingSection): string {
  const asset = renderImageSlot(s) || renderSvgSlot(s);
  return `
    <div class="py-16 md:py-24 px-6">
      <div class="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
        <div>
          <h2 class="text-3xl md:text-5xl font-bold mb-4">${escapeHtml(s.copy.headline)}</h2>
          <p class="text-lg opacity-80 mb-4">${escapeHtml(s.copy.subhead)}</p>
          <p class="text-base opacity-60 mb-8">${escapeHtml(s.copy.body)}</p>
          ${ctaButton(s.copy.cta, s.style.accent_color)}
        </div>
        <div>${asset || '<div class="aspect-video rounded-2xl bg-black/5"></div>'}</div>
      </div>
    </div>`;
}

// ----- FAQ -----

function faqCenter(s: LandingSection): string {
  const items = s.copy.body
    .split('\n')
    .filter(Boolean)
    .map(
      (line) =>
        `<details class="group border-b border-black/10">
          <summary class="flex items-center justify-between py-5 cursor-pointer text-lg font-medium hover:opacity-80 transition-opacity">
            <span>${escapeHtml(line.split('|')[0]?.trim() || line)}</span>
            <span class="ml-4 shrink-0 text-xl opacity-40 group-open:rotate-45 transition-transform">+</span>
          </summary>
          <div class="pb-5 text-base opacity-60">${escapeHtml(line.split('|')[1]?.trim() || '')}</div>
        </details>`
    );
  const faqHtml = items.length ? items.join('') : `<p class="text-base opacity-60">${escapeHtml(s.copy.body)}</p>`;

  return `
    <div class="py-16 md:py-24 px-6">
      <div class="max-w-3xl mx-auto">
        <div class="text-center mb-14">
          <h2 class="text-3xl md:text-4xl font-bold mb-4">${escapeHtml(s.copy.headline)}</h2>
          <p class="text-lg opacity-80">${escapeHtml(s.copy.subhead)}</p>
        </div>
        <div>${faqHtml}</div>
        ${s.copy.cta ? `<div class="text-center mt-12">${ctaButton(s.copy.cta, s.style.accent_color)}</div>` : ''}
      </div>
    </div>`;
}

function faqSplitLeft(s: LandingSection): string {
  const items = s.copy.body
    .split('\n')
    .filter(Boolean)
    .map(
      (line) =>
        `<details class="group border-b border-black/10">
          <summary class="flex items-center justify-between py-5 cursor-pointer text-lg font-medium hover:opacity-80 transition-opacity">
            <span>${escapeHtml(line.split('|')[0]?.trim() || line)}</span>
            <span class="ml-4 shrink-0 text-xl opacity-40 group-open:rotate-45 transition-transform">+</span>
          </summary>
          <div class="pb-5 text-base opacity-60">${escapeHtml(line.split('|')[1]?.trim() || '')}</div>
        </details>`
    );
  const faqHtml = items.length ? items.join('') : `<p class="text-base opacity-60">${escapeHtml(s.copy.body)}</p>`;

  return `
    <div class="py-16 md:py-24 px-6">
      <div class="max-w-6xl mx-auto grid md:grid-cols-5 gap-12">
        <div class="md:col-span-2">
          <h2 class="text-3xl md:text-4xl font-bold mb-4 md:sticky md:top-8">${escapeHtml(s.copy.headline)}</h2>
          <p class="text-lg opacity-80">${escapeHtml(s.copy.subhead)}</p>
        </div>
        <div class="md:col-span-3">${faqHtml}</div>
      </div>
    </div>`;
}

// ----- FOOTER -----

function footerCenter(s: LandingSection): string {
  return `
    <div class="py-12 md:py-16 px-6">
      <div class="max-w-4xl mx-auto text-center">
        <h3 class="text-xl font-bold mb-2">${escapeHtml(s.copy.headline)}</h3>
        <p class="text-sm opacity-60 mb-4">${escapeHtml(s.copy.subhead)}</p>
        <p class="text-xs opacity-40">${escapeHtml(s.copy.body)}</p>
        ${s.copy.cta ? `<div class="mt-6">${ctaButton(s.copy.cta, s.style.accent_color)}</div>` : ''}
      </div>
    </div>`;
}

function footerCardsGrid(s: LandingSection): string {
  const columns = s.copy.body
    .split('\n')
    .filter(Boolean)
    .map(
      (line) =>
        `<div>
          <p class="text-sm opacity-60">${escapeHtml(line)}</p>
        </div>`
    );
  const colHtml = columns.length >= 2 ? columns.join('') : `<div class="text-sm opacity-60">${escapeHtml(s.copy.body)}</div>`;

  return `
    <div class="py-12 md:py-16 px-6">
      <div class="max-w-6xl mx-auto">
        <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
          <div>
            <h3 class="text-xl font-bold mb-2">${escapeHtml(s.copy.headline)}</h3>
            <p class="text-sm opacity-60">${escapeHtml(s.copy.subhead)}</p>
          </div>
          ${colHtml}
        </div>
        <div class="border-t border-black/10 pt-6 text-center text-xs opacity-40">
          ${escapeHtml(s.copy.body ? `\u00A9 ${new Date().getFullYear()} ${s.copy.headline}` : '')}
        </div>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Template dispatcher
// ---------------------------------------------------------------------------

type TemplateKey = `${LandingSection['type']}:${LandingSection['layout_variant']}`;

const TEMPLATES: Record<string, (s: LandingSection) => string> = {
  'hero:centered': heroCenter,
  'hero:split-left': heroSplitLeft,
  'problem:centered': problemCenter,
  'problem:split-right': problemSplitRight,
  'solution:split-left': solutionSplitLeft,
  'solution:split-right': solutionSplitRight,
  'features:cards-grid': featuresCardsGrid,
  'features:centered': featuresCentered,
  'social-proof:centered': socialProofCenter,
  'social-proof:cards-grid': socialProofCardsGrid,
  'cta:centered': ctaCenter,
  'cta:split-left': ctaSplitLeft,
  'faq:centered': faqCenter,
  'faq:split-left': faqSplitLeft,
  'footer:centered': footerCenter,
  'footer:cards-grid': footerCardsGrid,
};

// Fallback map: for any section type, pick the first registered variant
const FALLBACK_TYPE: Record<string, (s: LandingSection) => string> = {
  hero: heroCenter,
  problem: problemCenter,
  solution: solutionSplitLeft,
  features: featuresCardsGrid,
  'social-proof': socialProofCenter,
  cta: ctaCenter,
  faq: faqCenter,
  footer: footerCenter,
};

function renderSection(section: LandingSection): string {
  const key: TemplateKey = `${section.type}:${section.layout_variant}`;
  const template = TEMPLATES[key] || FALLBACK_TYPE[section.type] || heroCenter;
  const inner = template(section);
  return sectionWrap(section.id, section.style.bg_color, section.style.text_color, inner);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function renderSectionsToCode(
  sections: LandingSection[],
  brandConfig: BrandConfig
): string {
  const sorted = [...sections].sort((a, b) => a.order - b.order);
  const sectionsHtml = sorted.map(renderSection).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script src="https://cdn.tailwindcss.com"><\/script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="${fontUrl(brandConfig)}" rel="stylesheet" />
  <style>
    body {
      margin: 0;
      font-family: '${brandConfig.font_body}', system-ui, sans-serif;
      color: ${brandConfig.text_color};
      background-color: ${brandConfig.bg_color};
    }
    h1, h2, h3, h4, h5, h6 {
      font-family: '${brandConfig.font_heading}', system-ui, sans-serif;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-fadeIn { animation: fadeIn 0.5s ease-out both; }
  </style>
</head>
<body>
${sectionsHtml}
</body>
</html>`;
}

export { renderImageSlot, renderSvgSlot };
