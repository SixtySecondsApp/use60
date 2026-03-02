/**
 * Brand Styles Utility
 *
 * Extracts CSS generation (fonts, base styles, keyframes) from sectionRenderer.ts
 * for reuse in both HTML export and React iframe preview.
 */

import type { BrandConfig } from './types';

export function fontUrl(brand: BrandConfig): string {
  const families = [brand.font_heading, brand.font_body]
    .filter(Boolean)
    .map((f) => f.replace(/ /g, '+') + ':wght@400;500;600;700;800')
    .join('&family=');
  return `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
}

export function generateBaseStyles(brand: BrandConfig): string {
  return `
    body {
      margin: 0;
      font-family: '${brand.font_body}', system-ui, sans-serif;
      color: ${brand.text_color};
      background-color: ${brand.bg_color};
    }
    h1, h2, h3, h4, h5, h6 {
      font-family: '${brand.font_heading}', system-ui, sans-serif;
    }

    .scroll-reveal {
      opacity: 0; transform: translateY(24px);
      transition: opacity 0.6s ease-out, transform 0.6s ease-out;
    }
    .scroll-reveal.revealed { opacity: 1; transform: translateY(0); }
    .stagger-card {
      opacity: 0; transform: translateY(16px);
      transition: opacity 0.5s ease-out, transform 0.5s ease-out;
    }
    .stagger-card.revealed { opacity: 1; transform: translateY(0); }
    .cta-btn { transition: all 0.3s ease; }
    .cta-btn:hover { transform: translateY(-3px) scale(1.02); filter: brightness(1.1); }
    .hero-orb { position: absolute; border-radius: 50%; filter: blur(80px); pointer-events: none; }
    .hero-orb-1 { width: 600px; height: 600px; top: -200px; right: -100px; animation: orbFloat1 8s ease-in-out infinite; }
    .hero-orb-2 { width: 400px; height: 400px; bottom: -150px; left: -100px; animation: orbFloat2 10s ease-in-out infinite; }
    .hero-orb-3 { width: 300px; height: 300px; top: 50%; left: 50%; transform: translate(-50%, -50%); animation: orbFloat3 12s ease-in-out infinite; }
    @keyframes orbFloat1 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(-30px, 20px); } }
    @keyframes orbFloat2 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(20px, -30px); } }
    @keyframes orbFloat3 { 0%, 100% { transform: translate(-50%, -50%) scale(1); } 50% { transform: translate(-50%, -50%) scale(1.15); } }
    .faq-details .faq-answer {
      overflow: hidden; max-height: 0; opacity: 0;
      transition: max-height 0.3s ease, opacity 0.3s ease, padding 0.3s ease;
      padding-bottom: 0;
    }
    .faq-details[open] .faq-answer { max-height: 500px; opacity: 1; padding-bottom: 1.25rem; }
    .section-border-gradient { position: relative; }
    .section-border-gradient::after {
      content: ''; position: absolute; bottom: 0; left: 10%; right: 10%; height: 1px;
      background: linear-gradient(90deg, transparent, currentColor, transparent); opacity: 0.06;
    }
    .section-border-gradient:last-child::after { display: none; }
    .hover-lift { transition: transform 0.3s ease, box-shadow 0.3s ease; }
    .hover-lift:hover { transform: translateY(-4px) scale(1.01); box-shadow: 0 12px 24px rgba(0,0,0,0.12); }
    @keyframes counter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .animate-counter { animation: counter 0.6s ease-out both; }
    @keyframes table-row-slide { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
    .animate-table-row-slide { animation: table-row-slide 0.4s ease-out both; }
    @keyframes stagger-child { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
    .animate-stagger-child { animation: stagger-child 0.5s ease-out both; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .animate-fadeIn { animation: fadeIn 0.5s ease-out both; }

    /* Inline edit hover hints */
    [data-section-id] h1:hover,
    [data-section-id] h2:hover,
    [data-section-id] p:hover,
    [data-section-id] .cta-btn:hover {
      outline: 1px dashed rgba(139, 92, 246, 0.3);
      outline-offset: 2px;
      border-radius: 4px;
      cursor: pointer;
    }
    [contenteditable="true"] {
      outline: 2px solid #8b5cf6 !important;
      outline-offset: 2px;
      border-radius: 4px;
      cursor: text;
    }
    [contenteditable="true"]:focus {
      outline: 2px solid #8b5cf6 !important;
    }
    [data-divider-for]:hover {
      outline: 1px dashed rgba(139, 92, 246, 0.3);
      outline-offset: -2px;
      border-radius: 4px;
      cursor: pointer;
    }
  `;
}

export function generateHeadHtml(brand: BrandConfig): string {
  return `
    <script src="https://cdn.tailwindcss.com"><\/script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="${fontUrl(brand)}" rel="stylesheet" />
    <style>${generateBaseStyles(brand)}</style>
  `;
}

export function generateScrollScript(): string {
  return `
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
  `;
}
