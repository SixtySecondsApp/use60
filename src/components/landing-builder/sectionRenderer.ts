/**
 * Deterministic Section Renderer (HTML Export Fallback)
 *
 * The React component renderer (ReactSectionRenderer.tsx + sections/) is now
 * the primary preview renderer. This file is kept for:
 *   1. HTML export (exportPolishAgent.ts) — generates standalone HTML download
 *   2. AI polish pass — base code for Sonnet polish prompt
 *   3. Backward compatibility — existing callers still reference renderSectionsToCode
 *
 * 31 templates: 8 original types x 3 variants + 4 new types + 3 social proof variants.
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
    return `<img src="${escapeHtml(section.image_url)}" alt="${escapeHtml(section.copy.headline)}" class="w-full rounded-2xl shadow-lg object-cover scroll-reveal" />`;
  }
  return '';
}

function renderSvgSlot(section: LandingSection): string {
  if (section.svg_status === 'generating') {
    return `<div class="w-full aspect-square max-w-xs mx-auto rounded-xl bg-gradient-to-tr from-gray-200 via-gray-50 to-gray-200 animate-pulse flex items-center justify-center">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" class="opacity-20"><rect x="4" y="4" width="40" height="40" rx="8" stroke="currentColor" stroke-width="2"/><circle cx="24" cy="24" r="8" stroke="currentColor" stroke-width="2"/></svg>
    </div>`;
  }
  if (section.svg_status === 'complete' && section.svg_code) {
    return `<div class="w-full max-w-xs mx-auto scroll-reveal">${section.svg_code}</div>`;
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
  if (!label) return '';
  return `<a href="#" class="cta-btn inline-block px-8 py-4 rounded-full text-white font-semibold text-lg transition-all duration-300 hover:-translate-y-1" style="background: linear-gradient(135deg, ${accent}, ${accent}dd); box-shadow: 0 4px 24px ${accent}44, 0 2px 8px ${accent}33;">${escapeHtml(label)}</a>`;
}

function renderMicroCopy(section: LandingSection): string {
  const micro = section.copy.micro_copy;
  if (!micro) return '';
  return `<p class="mt-3 text-sm opacity-50 tracking-wide">${escapeHtml(micro)}</p>`;
}

function sectionWrap(id: string, bg: string, textColor: string, inner: string): string {
  return `<section data-section-id="${escapeHtml(id)}" class="scroll-reveal section-border-gradient" style="background-color: ${bg}; color: ${textColor}">${inner}</section>`;
}

// ---------------------------------------------------------------------------
// Section templates — 24 total (8 types x 3 variants each)
// ---------------------------------------------------------------------------

// ----- HERO -----

function heroCenter(s: LandingSection): string {
  const asset = renderImageSlot(s) || renderSvgSlot(s);
  return `
    <div class="relative py-20 md:py-32 px-6 overflow-hidden">
      <div class="hero-orb hero-orb-1" style="background: radial-gradient(circle, ${s.style.accent_color}30 0%, transparent 70%)"></div>
      <div class="hero-orb hero-orb-2" style="background: radial-gradient(circle, ${s.style.accent_color}20 0%, transparent 70%)"></div>
      <div class="max-w-4xl mx-auto text-center relative z-10">
        <h1 class="text-4xl md:text-6xl lg:text-7xl font-extrabold leading-tight mb-6">${escapeHtml(s.copy.headline)}</h1>
        <p class="text-lg md:text-xl opacity-80 max-w-2xl mx-auto mb-4">${escapeHtml(s.copy.subhead)}</p>
        <p class="text-base opacity-60 max-w-xl mx-auto mb-10">${escapeHtml(s.copy.body)}</p>
        <div class="mb-4">${ctaButton(s.copy.cta, s.style.accent_color)}</div>
        ${renderMicroCopy(s)}
        ${asset ? `<div class="mt-12 max-w-3xl mx-auto">${asset}</div>` : ''}
      </div>
    </div>`;
}

function heroSplitLeft(s: LandingSection): string {
  const asset = renderImageSlot(s) || renderSvgSlot(s);
  return `
    <div class="relative py-16 md:py-28 px-6 overflow-hidden">
      <div class="hero-orb hero-orb-1" style="background: radial-gradient(circle, ${s.style.accent_color}25 0%, transparent 70%)"></div>
      <div class="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center relative z-10">
        <div>
          <h1 class="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-tight mb-6">${escapeHtml(s.copy.headline)}</h1>
          <p class="text-lg md:text-xl opacity-80 mb-4">${escapeHtml(s.copy.subhead)}</p>
          <p class="text-base opacity-60 mb-8">${escapeHtml(s.copy.body)}</p>
          <div>${ctaButton(s.copy.cta, s.style.accent_color)}</div>
          ${renderMicroCopy(s)}
        </div>
        <div>${asset || '<div class="aspect-video rounded-2xl bg-black/5"></div>'}</div>
      </div>
    </div>`;
}

function heroGradient(s: LandingSection): string {
  const asset = renderImageSlot(s) || renderSvgSlot(s);
  return `
    <div class="relative py-24 md:py-40 px-6 overflow-hidden" style="background: linear-gradient(135deg, ${s.style.bg_color} 0%, ${s.style.accent_color}15 50%, ${s.style.bg_color} 100%)">
      <div class="hero-orb hero-orb-1" style="background: radial-gradient(circle, ${s.style.accent_color}40 0%, transparent 70%)"></div>
      <div class="hero-orb hero-orb-2" style="background: radial-gradient(circle, ${s.style.accent_color}25 0%, transparent 70%)"></div>
      <div class="hero-orb hero-orb-3" style="background: radial-gradient(circle, ${s.style.accent_color}15 0%, transparent 70%)"></div>
      <div class="max-w-4xl mx-auto text-center relative z-10">
        <h1 class="text-5xl md:text-7xl lg:text-8xl font-extrabold leading-tight mb-8 bg-clip-text">${escapeHtml(s.copy.headline)}</h1>
        <p class="text-xl md:text-2xl opacity-80 max-w-2xl mx-auto mb-6">${escapeHtml(s.copy.subhead)}</p>
        <p class="text-base opacity-60 max-w-xl mx-auto mb-12">${escapeHtml(s.copy.body)}</p>
        <div class="mb-4">${ctaButton(s.copy.cta, s.style.accent_color)}</div>
        ${renderMicroCopy(s)}
        ${asset ? `<div class="mt-16 max-w-3xl mx-auto">${asset}</div>` : ''}
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

function problemSplitLeft(s: LandingSection): string {
  const asset = renderSvgSlot(s) || renderImageSlot(s);
  return `
    <div class="py-16 md:py-24 px-6">
      <div class="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
        <div>${asset || '<div class="aspect-square rounded-2xl bg-black/5"></div>'}</div>
        <div>
          <h2 class="text-3xl md:text-4xl font-bold mb-4">${escapeHtml(s.copy.headline)}</h2>
          <p class="text-lg opacity-80 mb-4">${escapeHtml(s.copy.subhead)}</p>
          <p class="text-base opacity-60">${escapeHtml(s.copy.body)}</p>
        </div>
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
          <div>${ctaButton(s.copy.cta, s.style.accent_color)}</div>
          ${renderMicroCopy(s)}
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
          <div>${ctaButton(s.copy.cta, s.style.accent_color)}</div>
          ${renderMicroCopy(s)}
        </div>
        <div>${asset || '<div class="aspect-video rounded-2xl bg-black/5"></div>'}</div>
      </div>
    </div>`;
}

function solutionCentered(s: LandingSection): string {
  const steps = s.copy.body
    .split('\n')
    .filter(Boolean)
    .map(
      (line, i) =>
        `<div class="flex flex-col items-center text-center stagger-card" style="animation-delay: ${i * 100}ms">
          <div class="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg mb-4" style="background: linear-gradient(135deg, ${s.style.accent_color}, ${s.style.accent_color}bb)">${i + 1}</div>
          <p class="text-base opacity-80">${escapeHtml(line)}</p>
        </div>`
    );
  const stepsHtml = steps.length >= 2
    ? `<div class="grid sm:grid-cols-2 lg:grid-cols-${Math.min(steps.length, 4)} gap-8">${steps.join('')}</div>`
    : `<p class="text-base opacity-60 max-w-xl mx-auto">${escapeHtml(s.copy.body)}</p>`;

  return `
    <div class="py-16 md:py-24 px-6">
      <div class="max-w-5xl mx-auto">
        <div class="text-center mb-14">
          <h2 class="text-3xl md:text-4xl font-bold mb-4">${escapeHtml(s.copy.headline)}</h2>
          <p class="text-lg opacity-80 max-w-2xl mx-auto">${escapeHtml(s.copy.subhead)}</p>
        </div>
        ${stepsHtml}
        ${s.copy.cta ? `<div class="text-center mt-12"><div>${ctaButton(s.copy.cta, s.style.accent_color)}</div>${renderMicroCopy(s)}</div>` : ''}
      </div>
    </div>`;
}

// ----- FEATURES -----

function featuresCardsGrid(s: LandingSection): string {
  const asset = renderSvgSlot(s) || renderImageSlot(s);
  const bodyParagraphs = s.copy.body
    .split('\n')
    .filter(Boolean)
    .map(
      (line, i) =>
        `<div class="p-6 rounded-2xl bg-white/60 shadow-sm border border-black/5 stagger-card" style="animation-delay: ${i * 100}ms">
          <div class="text-2xl font-bold mb-2" style="color: ${s.style.accent_color}">${String(i + 1).padStart(2, '0')}</div>
          <p class="text-base opacity-80">${escapeHtml(line)}</p>
        </div>`
    );
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

function featuresAlternating(s: LandingSection): string {
  const items = s.copy.body
    .split('\n')
    .filter(Boolean)
    .map(
      (line, i) => {
        const isLeft = i % 2 === 0;
        return `<div class="grid md:grid-cols-2 gap-8 items-center stagger-card" style="animation-delay: ${i * 150}ms">
          <div class="${isLeft ? '' : 'md:order-2'}">
            <div class="text-3xl font-bold mb-2 opacity-15" style="color: ${s.style.accent_color}">${String(i + 1).padStart(2, '0')}</div>
            <p class="text-base opacity-80">${escapeHtml(line)}</p>
          </div>
          <div class="${isLeft ? 'md:order-2' : ''}">
            <div class="h-px w-full" style="background: linear-gradient(90deg, transparent, ${s.style.accent_color}30, transparent)"></div>
          </div>
        </div>`;
      }
    );
  const rows = items.length >= 2
    ? `<div class="space-y-8">${items.join('')}</div>`
    : `<p class="text-base opacity-60 max-w-xl mx-auto text-center">${escapeHtml(s.copy.body)}</p>`;

  return `
    <div class="py-16 md:py-24 px-6">
      <div class="max-w-5xl mx-auto">
        <div class="text-center mb-14">
          <h2 class="text-3xl md:text-4xl font-bold mb-4">${escapeHtml(s.copy.headline)}</h2>
          <p class="text-lg opacity-80 max-w-2xl mx-auto">${escapeHtml(s.copy.subhead)}</p>
        </div>
        ${rows}
        ${s.copy.cta ? `<div class="text-center mt-12">${ctaButton(s.copy.cta, s.style.accent_color)}</div>` : ''}
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
      (line, i) =>
        `<div class="p-6 rounded-2xl bg-white/60 shadow-sm border border-black/5 stagger-card" style="animation-delay: ${i * 100}ms">
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

function socialProofLogoBanner(s: LandingSection): string {
  const items = s.copy.body
    .split('\n')
    .filter(Boolean)
    .map(
      (line) =>
        `<div class="flex items-center justify-center px-6 py-3 opacity-50 hover:opacity-80 transition-opacity">
          <span class="text-sm font-semibold tracking-wider uppercase whitespace-nowrap">${escapeHtml(line)}</span>
        </div>`
    );
  const logosHtml = items.length >= 2
    ? items.join('')
    : `<span class="text-sm opacity-50">${escapeHtml(s.copy.body)}</span>`;

  return `
    <div class="py-10 md:py-14 px-6">
      <div class="max-w-5xl mx-auto">
        <p class="text-center text-sm font-medium opacity-40 mb-8 tracking-widest uppercase">${escapeHtml(s.copy.headline)}</p>
        <div class="flex flex-wrap justify-center items-center gap-4 md:gap-8">${logosHtml}</div>
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
        <div>${ctaButton(s.copy.cta, s.style.accent_color)}</div>
        ${renderMicroCopy(s)}
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
          <div>${ctaButton(s.copy.cta, s.style.accent_color)}</div>
          ${renderMicroCopy(s)}
        </div>
        <div>${asset || '<div class="aspect-video rounded-2xl bg-black/5"></div>'}</div>
      </div>
    </div>`;
}

function ctaGradient(s: LandingSection): string {
  return `
    <div class="py-20 md:py-28 px-6 relative overflow-hidden" style="background: linear-gradient(135deg, ${s.style.accent_color}15 0%, ${s.style.bg_color} 50%, ${s.style.accent_color}10 100%)">
      <div class="hero-orb hero-orb-2" style="background: radial-gradient(circle, ${s.style.accent_color}20 0%, transparent 70%)"></div>
      <div class="max-w-3xl mx-auto text-center relative z-10">
        <h2 class="text-3xl md:text-5xl font-bold mb-4">${escapeHtml(s.copy.headline)}</h2>
        <p class="text-lg opacity-80 mb-4">${escapeHtml(s.copy.subhead)}</p>
        <p class="text-base opacity-60 max-w-xl mx-auto mb-10">${escapeHtml(s.copy.body)}</p>
        <div>${ctaButton(s.copy.cta, s.style.accent_color)}</div>
        ${renderMicroCopy(s)}
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
        `<details class="group border-b border-black/10 faq-details">
          <summary class="flex items-center justify-between py-5 cursor-pointer text-lg font-medium hover:opacity-80 transition-opacity">
            <span>${escapeHtml(line.split('|')[0]?.trim() || line)}</span>
            <span class="ml-4 shrink-0 text-xl opacity-40 group-open:rotate-45 transition-transform duration-200">+</span>
          </summary>
          <div class="faq-answer pb-5 text-base opacity-60">${escapeHtml(line.split('|')[1]?.trim() || '')}</div>
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
        `<details class="group border-b border-black/10 faq-details">
          <summary class="flex items-center justify-between py-5 cursor-pointer text-lg font-medium hover:opacity-80 transition-opacity">
            <span>${escapeHtml(line.split('|')[0]?.trim() || line)}</span>
            <span class="ml-4 shrink-0 text-xl opacity-40 group-open:rotate-45 transition-transform duration-200">+</span>
          </summary>
          <div class="faq-answer pb-5 text-base opacity-60">${escapeHtml(line.split('|')[1]?.trim() || '')}</div>
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

function faqCardsGrid(s: LandingSection): string {
  const items = s.copy.body
    .split('\n')
    .filter(Boolean)
    .map(
      (line, i) => {
        const parts = line.split('|');
        const question = parts[0]?.trim() || line;
        const answer = parts[1]?.trim() || '';
        return `<div class="p-6 rounded-2xl bg-white/60 shadow-sm border border-black/5 stagger-card" style="animation-delay: ${i * 100}ms">
          <h3 class="text-base font-semibold mb-2">${escapeHtml(question)}</h3>
          ${answer ? `<p class="text-sm opacity-60">${escapeHtml(answer)}</p>` : ''}
        </div>`;
      }
    );
  const cardsHtml = items.length >= 2
    ? items.join('')
    : `<div class="col-span-full text-base opacity-60">${escapeHtml(s.copy.body)}</div>`;

  return `
    <div class="py-16 md:py-24 px-6">
      <div class="max-w-6xl mx-auto">
        <div class="text-center mb-14">
          <h2 class="text-3xl md:text-4xl font-bold mb-4">${escapeHtml(s.copy.headline)}</h2>
          <p class="text-lg opacity-80">${escapeHtml(s.copy.subhead)}</p>
        </div>
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">${cardsHtml}</div>
        ${s.copy.cta ? `<div class="text-center mt-12">${ctaButton(s.copy.cta, s.style.accent_color)}</div>` : ''}
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

function footerSplitLeft(s: LandingSection): string {
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
        <div class="grid md:grid-cols-5 gap-8 mb-10">
          <div class="md:col-span-2">
            <h3 class="text-xl font-bold mb-2">${escapeHtml(s.copy.headline)}</h3>
            <p class="text-sm opacity-60">${escapeHtml(s.copy.subhead)}</p>
          </div>
          <div class="md:col-span-3 grid sm:grid-cols-3 gap-6">
            ${colHtml}
          </div>
        </div>
        <div class="border-t border-black/10 pt-6 text-center text-xs opacity-40">
          ${escapeHtml(s.copy.body ? `\u00A9 ${new Date().getFullYear()} ${s.copy.headline}` : '')}
        </div>
      </div>
    </div>`;
}

// ----- PRICING -----

function pricingCentered(s: LandingSection): string {
  const tiers = s.copy.body
    .split('\n')
    .filter(Boolean)
    .map((line, i) => {
      const parts = line.split('|').map(p => p.trim());
      const name = parts[0] || `Tier ${i + 1}`;
      const price = parts[1] || '';
      const features = parts.slice(2);
      const isMiddle = i === 1;
      return `<div class="p-6 rounded-2xl border ${isMiddle ? 'border-2 ring-2 scale-105' : 'border-black/10'} bg-white/60 shadow-sm stagger-card" style="${isMiddle ? `border-color: ${s.style.accent_color}; --tw-ring-color: ${s.style.accent_color}33` : ''};animation-delay: ${i * 100}ms">
        ${isMiddle ? `<div class="text-[10px] font-bold uppercase tracking-wider mb-2" style="color: ${s.style.accent_color}">Recommended</div>` : ''}
        <h3 class="text-lg font-bold mb-1">${escapeHtml(name)}</h3>
        ${price ? `<div class="text-3xl font-extrabold mb-4">${escapeHtml(price)}</div>` : ''}
        <ul class="space-y-2 text-sm opacity-70 mb-6">${features.map(f => `<li class="flex items-start gap-2"><span style="color: ${s.style.accent_color}">&#10003;</span>${escapeHtml(f)}</li>`).join('')}</ul>
        ${s.copy.cta ? ctaButton(s.copy.cta, isMiddle ? s.style.accent_color : s.style.text_color + '40') : ''}
      </div>`;
    });
  const grid = tiers.length >= 2
    ? tiers.join('')
    : `<div class="col-span-full text-base opacity-60 text-center">${escapeHtml(s.copy.body)}</div>`;

  return `
    <div class="py-16 md:py-24 px-6">
      <div class="max-w-5xl mx-auto">
        <div class="text-center mb-14">
          <h2 class="text-3xl md:text-4xl font-bold mb-4">${escapeHtml(s.copy.headline)}</h2>
          <p class="text-lg opacity-80 max-w-2xl mx-auto">${escapeHtml(s.copy.subhead)}</p>
        </div>
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 items-start">${grid}</div>
      </div>
    </div>`;
}

// ----- COMPARISON -----

function comparisonGrid(s: LandingSection): string {
  const rows = s.copy.body
    .split('\n')
    .filter(Boolean)
    .map((line, i) => {
      const cols = line.split('|').map(p => p.trim());
      const feature = cols[0] || '';
      const cells = cols.slice(1).map(c => {
        const isYes = /^(y|yes|true|✓|✔)$/i.test(c);
        const isNo = /^(n|no|false|✗|✘|-)$/i.test(c);
        if (isYes) return `<td class="px-4 py-3 text-center"><span style="color: ${s.style.accent_color}">&#10003;</span></td>`;
        if (isNo) return `<td class="px-4 py-3 text-center opacity-30">&#10007;</td>`;
        return `<td class="px-4 py-3 text-center text-sm">${escapeHtml(c)}</td>`;
      }).join('');
      return `<tr class="border-b border-black/5 stagger-card" style="animation-delay: ${i * 60}ms"><td class="px-4 py-3 font-medium text-sm">${escapeHtml(feature)}</td>${cells}</tr>`;
    });
  const tableHtml = rows.length >= 2
    ? `<table class="w-full"><tbody>${rows.join('')}</tbody></table>`
    : `<p class="text-base opacity-60 text-center">${escapeHtml(s.copy.body)}</p>`;

  return `
    <div class="py-16 md:py-24 px-6">
      <div class="max-w-4xl mx-auto">
        <div class="text-center mb-14">
          <h2 class="text-3xl md:text-4xl font-bold mb-4">${escapeHtml(s.copy.headline)}</h2>
          <p class="text-lg opacity-80 max-w-2xl mx-auto">${escapeHtml(s.copy.subhead)}</p>
        </div>
        <div class="rounded-2xl border border-black/10 overflow-hidden bg-white/60">${tableHtml}</div>
      </div>
    </div>`;
}

// ----- STATS -----

function statsCentered(s: LandingSection): string {
  const stats = s.copy.body
    .split('\n')
    .filter(Boolean)
    .map((line, i) => {
      const parts = line.split('|').map(p => p.trim());
      const value = parts[0] || '';
      const label = parts[1] || '';
      return `<div class="text-center stagger-card" style="animation-delay: ${i * 100}ms">
        <div class="text-4xl md:text-5xl font-extrabold mb-2" style="color: ${s.style.accent_color}">${escapeHtml(value)}</div>
        <div class="text-sm opacity-60">${escapeHtml(label)}</div>
      </div>`;
    });
  const grid = stats.length >= 2
    ? `<div class="grid grid-cols-2 lg:grid-cols-${Math.min(stats.length, 4)} gap-8">${stats.join('')}</div>`
    : `<p class="text-base opacity-60 text-center">${escapeHtml(s.copy.body)}</p>`;

  return `
    <div class="py-16 md:py-24 px-6">
      <div class="max-w-4xl mx-auto">
        <div class="text-center mb-14">
          <h2 class="text-3xl md:text-4xl font-bold mb-4">${escapeHtml(s.copy.headline)}</h2>
          <p class="text-lg opacity-80 max-w-2xl mx-auto">${escapeHtml(s.copy.subhead)}</p>
        </div>
        ${grid}
      </div>
    </div>`;
}

// ----- HOW IT WORKS -----

function howItWorksCentered(s: LandingSection): string {
  const steps = s.copy.body
    .split('\n')
    .filter(Boolean)
    .map((line, i) => {
      return `<div class="flex flex-col items-center text-center stagger-card" style="animation-delay: ${i * 120}ms">
        <div class="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-xl mb-4 shadow-lg" style="background: linear-gradient(135deg, ${s.style.accent_color}, ${s.style.accent_color}bb)">${i + 1}</div>
        <p class="text-base opacity-80 max-w-xs">${escapeHtml(line)}</p>
      </div>`;
    });
  const stepsHtml = steps.length >= 2
    ? `<div class="grid sm:grid-cols-2 lg:grid-cols-${Math.min(steps.length, 4)} gap-10">${steps.join('')}</div>`
    : `<p class="text-base opacity-60 text-center">${escapeHtml(s.copy.body)}</p>`;

  return `
    <div class="py-16 md:py-24 px-6">
      <div class="max-w-5xl mx-auto">
        <div class="text-center mb-14">
          <h2 class="text-3xl md:text-4xl font-bold mb-4">${escapeHtml(s.copy.headline)}</h2>
          <p class="text-lg opacity-80 max-w-2xl mx-auto">${escapeHtml(s.copy.subhead)}</p>
        </div>
        ${stepsHtml}
        ${s.copy.cta ? `<div class="text-center mt-12">${ctaButton(s.copy.cta, s.style.accent_color)}</div>` : ''}
      </div>
    </div>`;
}

// ----- SOCIAL PROOF NEW VARIANTS -----

function socialProofMetricsBar(s: LandingSection): string {
  const metrics = s.copy.body
    .split('\n')
    .filter(Boolean)
    .map((line, i) => {
      const parts = line.split('|').map(p => p.trim());
      const value = parts[0] || '';
      const label = parts[1] || '';
      return `<div class="text-center stagger-card" style="animation-delay: ${i * 100}ms">
        <div class="text-3xl font-extrabold mb-1" style="color: ${s.style.accent_color}">${escapeHtml(value)}</div>
        <div class="text-xs opacity-50 uppercase tracking-wider">${escapeHtml(label)}</div>
      </div>`;
    });
  const grid = metrics.length >= 2
    ? metrics.join('')
    : `<div class="text-base opacity-60">${escapeHtml(s.copy.body)}</div>`;

  return `
    <div class="py-10 md:py-14 px-6">
      <div class="max-w-4xl mx-auto">
        <p class="text-center text-sm font-medium opacity-40 mb-8 tracking-widest uppercase">${escapeHtml(s.copy.headline)}</p>
        <div class="flex flex-wrap justify-center items-center gap-10 md:gap-16">${grid}</div>
      </div>
    </div>`;
}

function socialProofCaseStudy(s: LandingSection): string {
  return `
    <div class="py-16 md:py-24 px-6">
      <div class="max-w-4xl mx-auto">
        <div class="p-8 md:p-12 rounded-2xl border border-black/10 bg-white/60">
          <div class="text-sm font-medium opacity-40 mb-6 uppercase tracking-wider">${escapeHtml(s.copy.headline)}</div>
          <blockquote class="text-xl md:text-2xl italic leading-relaxed mb-6 opacity-80">"${escapeHtml(s.copy.subhead)}"</blockquote>
          <p class="text-base opacity-60">${escapeHtml(s.copy.body)}</p>
          ${s.copy.cta ? `<div class="mt-8">${ctaButton(s.copy.cta, s.style.accent_color)}</div>` : ''}
        </div>
      </div>
    </div>`;
}

function socialProofReviewBadges(s: LandingSection): string {
  const reviews = s.copy.body
    .split('\n')
    .filter(Boolean)
    .map((line, i) => {
      const parts = line.split('|').map(p => p.trim());
      const source = parts[0] || '';
      const rating = parts[1] || '5';
      const stars = '★'.repeat(Math.min(Math.round(Number(rating) || 5), 5));
      return `<div class="flex flex-col items-center gap-1 stagger-card" style="animation-delay: ${i * 100}ms">
        <div class="text-lg" style="color: ${s.style.accent_color}">${stars}</div>
        <div class="text-xs font-medium opacity-50">${escapeHtml(source)}</div>
      </div>`;
    });
  const grid = reviews.length >= 2
    ? reviews.join('')
    : `<div class="text-base opacity-60">${escapeHtml(s.copy.body)}</div>`;

  return `
    <div class="py-10 md:py-14 px-6">
      <div class="max-w-4xl mx-auto text-center">
        <p class="text-sm font-medium opacity-40 mb-6 tracking-widest uppercase">${escapeHtml(s.copy.headline)}</p>
        <div class="flex flex-wrap justify-center items-center gap-8 md:gap-12">${grid}</div>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Template dispatcher
// ---------------------------------------------------------------------------

type TemplateKey = `${LandingSection['type']}:${LandingSection['layout_variant']}`;

const TEMPLATES: Record<string, (s: LandingSection) => string> = {
  // Hero (3)
  'hero:centered': heroCenter,
  'hero:split-left': heroSplitLeft,
  'hero:gradient': heroGradient,
  // Problem (3)
  'problem:centered': problemCenter,
  'problem:split-right': problemSplitRight,
  'problem:split-left': problemSplitLeft,
  // Solution (3)
  'solution:split-left': solutionSplitLeft,
  'solution:split-right': solutionSplitRight,
  'solution:centered': solutionCentered,
  // Features (3)
  'features:cards-grid': featuresCardsGrid,
  'features:centered': featuresCentered,
  'features:alternating': featuresAlternating,
  // Social Proof (3)
  'social-proof:centered': socialProofCenter,
  'social-proof:cards-grid': socialProofCardsGrid,
  'social-proof:logo-banner': socialProofLogoBanner,
  // CTA (3)
  'cta:centered': ctaCenter,
  'cta:split-left': ctaSplitLeft,
  'cta:gradient': ctaGradient,
  // FAQ (3)
  'faq:centered': faqCenter,
  'faq:split-left': faqSplitLeft,
  'faq:cards-grid': faqCardsGrid,
  // Footer (3)
  'footer:centered': footerCenter,
  'footer:cards-grid': footerCardsGrid,
  'footer:split-left': footerSplitLeft,
  // Pricing (1)
  'pricing:centered': pricingCentered,
  // Comparison (1)
  'comparison:cards-grid': comparisonGrid,
  // Stats (1)
  'stats:centered': statsCentered,
  // How It Works (1)
  'how-it-works:centered': howItWorksCentered,
  // Social Proof new variants (3)
  'social-proof:metrics-bar': socialProofMetricsBar,
  'social-proof:case-study': socialProofCaseStudy,
  'social-proof:review-badges': socialProofReviewBadges,
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
  pricing: pricingCentered,
  comparison: comparisonGrid,
  stats: statsCentered,
  'how-it-works': howItWorksCentered,
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
  <script src="https://cdn.tailwindcss.com">${'</'}script>
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

    /* Scroll-triggered reveal */
    .scroll-reveal {
      opacity: 0;
      transform: translateY(24px);
      transition: opacity 0.6s ease-out, transform 0.6s ease-out;
    }
    .scroll-reveal.revealed {
      opacity: 1;
      transform: translateY(0);
    }

    /* Staggered card entrance */
    .stagger-card {
      opacity: 0;
      transform: translateY(16px);
      transition: opacity 0.5s ease-out, transform 0.5s ease-out;
    }
    .stagger-card.revealed {
      opacity: 1;
      transform: translateY(0);
    }

    /* CTA button hover glow */
    .cta-btn {
      transition: all 0.3s ease;
    }
    .cta-btn:hover {
      transform: translateY(-3px) scale(1.02);
      filter: brightness(1.1);
    }

    /* Hero gradient orbs */
    .hero-orb {
      position: absolute;
      border-radius: 50%;
      filter: blur(80px);
      pointer-events: none;
    }
    .hero-orb-1 {
      width: 600px;
      height: 600px;
      top: -200px;
      right: -100px;
      animation: orbFloat1 8s ease-in-out infinite;
    }
    .hero-orb-2 {
      width: 400px;
      height: 400px;
      bottom: -150px;
      left: -100px;
      animation: orbFloat2 10s ease-in-out infinite;
    }
    .hero-orb-3 {
      width: 300px;
      height: 300px;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      animation: orbFloat3 12s ease-in-out infinite;
    }
    @keyframes orbFloat1 {
      0%, 100% { transform: translate(0, 0); }
      50% { transform: translate(-30px, 20px); }
    }
    @keyframes orbFloat2 {
      0%, 100% { transform: translate(0, 0); }
      50% { transform: translate(20px, -30px); }
    }
    @keyframes orbFloat3 {
      0%, 100% { transform: translate(-50%, -50%) scale(1); }
      50% { transform: translate(-50%, -50%) scale(1.15); }
    }

    /* FAQ smooth open/close */
    .faq-details .faq-answer {
      overflow: hidden;
      max-height: 0;
      opacity: 0;
      transition: max-height 0.3s ease, opacity 0.3s ease, padding 0.3s ease;
      padding-bottom: 0;
    }
    .faq-details[open] .faq-answer {
      max-height: 500px;
      opacity: 1;
      padding-bottom: 1.25rem;
    }

    /* Section gradient borders */
    .section-border-gradient {
      position: relative;
    }
    .section-border-gradient::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 10%;
      right: 10%;
      height: 1px;
      background: linear-gradient(90deg, transparent, currentColor, transparent);
      opacity: 0.06;
    }
    .section-border-gradient:last-child::after {
      display: none;
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
<script>
  // Scroll-triggered reveal with IntersectionObserver
  (function() {
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.scroll-reveal, .stagger-card').forEach(function(el) {
      observer.observe(el);
    });
  })();
${'</'}script>
</body>
</html>`;
}

export { renderImageSlot, renderSvgSlot };
