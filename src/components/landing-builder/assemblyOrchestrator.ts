/**
 * Assembly Orchestrator
 *
 * Runs after Copy phase approval. Converts approved strategy + copy into
 * structured LandingSection[] data and coordinates progressive asset generation.
 *
 * parseWorkspaceToSections: strategy + copy → initial sections with layout variants
 * startAssembly: kicks off asset generation queue (shell — wired in EDIT-005)
 */

import type { LandingSection, SectionType, LayoutVariant, BrandConfig, AssetStrategy, SectionDividerType } from './types';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface AssemblyCallbacks {
  onSectionUpdate: (sectionId: string, patch: Partial<LandingSection>) => void;
  onComplete: () => void;
}

export interface AssemblyController {
  regenerateAsset(sectionId: string, assetType: 'image' | 'svg', prompt?: string): void;
  cancelAll(): void;
  getQueueStatus(): { pending: number; processing: string | null; completed: number; failed: number };
}

interface StrategySection {
  name?: string;
  type?: string;
  title?: string;
  layout?: string;
  elements?: string[];
  cta?: string;
  conversion_lever?: string;
  design_pattern?: string;
  purpose?: string;
}

// ---------------------------------------------------------------------------
// Section type inference
// ---------------------------------------------------------------------------

const SECTION_TYPE_KEYWORDS: Record<SectionType, string[]> = {
  hero: ['hero', 'header', 'above the fold', 'opening'],
  problem: ['problem', 'pain', 'challenge', 'struggle', 'cost of inaction'],
  solution: ['solution', 'how it works', 'approach', 'method'],
  features: ['feature', 'benefit', 'capability', 'what you get'],
  'social-proof': ['social proof', 'testimonial', 'case study', 'logos', 'trust', 'review'],
  cta: ['cta', 'call to action', 'get started', 'sign up', 'final', 'closing'],
  faq: ['faq', 'question', 'objection'],
  footer: ['footer'],
  pricing: ['pricing', 'plan', 'tier', 'price', 'subscription', 'free trial'],
  comparison: ['comparison', 'versus', 'compare', 'vs', 'alternative'],
  stats: ['stats', 'statistic', 'metric', 'number', 'data point', 'by the numbers'],
  'how-it-works': ['how it works', 'step', 'process', 'workflow', 'getting started'],
};

function inferSectionType(section: StrategySection, index: number, total: number): SectionType {
  // Explicit type from strategy
  if (section.type && isValidSectionType(section.type)) {
    return section.type;
  }

  // Match by name/title keywords
  const text = `${section.name ?? ''} ${section.title ?? ''} ${section.purpose ?? ''}`.toLowerCase();
  for (const [type, keywords] of Object.entries(SECTION_TYPE_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) {
      return type as SectionType;
    }
  }

  // Positional fallbacks
  if (index === 0) return 'hero';
  if (index === total - 1) return 'cta';

  return 'features';
}

function isValidSectionType(value: string): value is SectionType {
  return [
    'hero', 'problem', 'solution', 'features', 'social-proof',
    'cta', 'faq', 'footer', 'pricing', 'comparison', 'stats', 'how-it-works',
  ].includes(value);
}

// ---------------------------------------------------------------------------
// Smart asset strategy assignment
// ---------------------------------------------------------------------------

const ASSET_STRATEGY_MAP: Record<SectionType, AssetStrategy> = {
  hero: 'image',
  problem: 'svg',
  solution: 'image',
  features: 'icon',
  'social-proof': 'none',
  cta: 'svg',
  faq: 'none',
  footer: 'none',
  pricing: 'none',
  comparison: 'none',
  stats: 'none',
  'how-it-works': 'icon',
};

const DEFAULT_ICON_MAP: Record<SectionType, string> = {
  hero: '',
  problem: '',
  solution: '',
  features: '→',
  'social-proof': '',
  cta: '',
  faq: '',
  footer: '',
  pricing: '',
  comparison: '',
  stats: '',
  'how-it-works': '→',
};

// Use dividers sparingly — only at key narrative shifts to avoid visual clutter.
const DIVIDER_TRANSITIONS: Record<string, SectionDividerType> = {
  'hero→problem': 'wave',
  'solution→features': 'wave',
  'features→social-proof': 'curve',
  'pricing→cta': 'wave',
};

function assignAssetStrategy(sectionType: SectionType): AssetStrategy {
  return ASSET_STRATEGY_MAP[sectionType] ?? 'none';
}

function assignIconName(sectionType: SectionType): string | undefined {
  const icon = DEFAULT_ICON_MAP[sectionType];
  return icon || undefined;
}

function assignDivider(prevType: SectionType | null, currentType: SectionType): SectionDividerType | undefined {
  if (!prevType) return undefined;
  const key = `${prevType}→${currentType}`;
  return DIVIDER_TRANSITIONS[key] ?? undefined;
}

// ---------------------------------------------------------------------------
// Layout variant selection
// ---------------------------------------------------------------------------

function selectLayoutVariant(copy: { body: string }, section: StrategySection): LayoutVariant {
  // Check for explicit layout hint from strategy
  const layoutHint = (section.layout ?? '').toLowerCase();
  if (layoutHint.includes('gradient')) return 'gradient';
  if (layoutHint.includes('alternating')) return 'alternating';
  if (layoutHint.includes('logo') || layoutHint.includes('banner')) return 'logo-banner';
  if (layoutHint.includes('bento') || layoutHint.includes('grid') || layoutHint.includes('cards')) {
    return 'cards-grid';
  }
  if (layoutHint.includes('split')) {
    return layoutHint.includes('right') ? 'split-right' : 'split-left';
  }
  if (layoutHint.includes('centered') || layoutHint.includes('full-width')) {
    return 'centered';
  }

  // Check for sub-items (bullet points, numbered lists)
  const bulletCount = (copy.body.match(/^[-•*\d.]/gm) || []).length;
  if (bulletCount >= 3) return 'cards-grid';

  // Long body text → split layout
  if (copy.body.length > 100) {
    return 'split-left';
  }

  // Short punchy copy → centered
  return 'centered';
}

// ---------------------------------------------------------------------------
// Copy extraction
// ---------------------------------------------------------------------------

interface ExtractedCopy {
  headline: string;
  subhead: string;
  body: string;
  cta: string;
  micro_copy?: string;
}

// ---------------------------------------------------------------------------
// Parse compiled raw copy into structured sections
// ---------------------------------------------------------------------------

interface ParsedCopySection {
  headline: string;
  subhead: string;
  body: string;
  cta: string;
  micro_copy: string;
}

function parseCompiledCopyToStructured(
  copyData: Record<string, unknown>,
): Record<string, unknown> {
  // Check if copy is in the { raw: "APPROVED COPY SELECTIONS:\n\n## Hero\n..." } format
  const rawValue = copyData.raw;
  if (typeof rawValue !== 'string' || !rawValue.includes('APPROVED COPY SELECTIONS')) {
    return copyData;
  }

  // Split by ## headings to get section blocks
  const blocks = rawValue.split(/\n##\s+/);
  const result: Record<string, ParsedCopySection> = {};

  for (const block of blocks) {
    if (!block.trim()) continue;

    // First line is the section name
    const lines = block.split('\n');
    const sectionName = lines[0].replace(/[*#]/g, '').trim().toLowerCase();
    if (!sectionName || sectionName.includes('approved copy')) continue;

    const extract = (label: string): string => {
      const regex = new RegExp(`^${label}:\\s*(.+)`, 'im');
      const match = block.match(regex);
      return match?.[1]?.trim() ?? '';
    };

    // Extract body: everything between Body: and the next label or end
    const extractBody = (): string => {
      const bodyMatch = block.match(/^Body:\s*([\s\S]*?)(?=^(?:Headline|Subhead|CTA|Micro-copy):|$)/im);
      if (bodyMatch) {
        return bodyMatch[1].trim();
      }
      return extract('Body');
    };

    result[sectionName] = {
      headline: extract('Headline'),
      subhead: extract('Subhead'),
      body: extractBody(),
      cta: extract('CTA'),
      micro_copy: extract('Micro-copy'),
    };
  }

  // If we parsed at least one section, return structured data
  if (Object.keys(result).length > 0) {
    return result;
  }

  return copyData;
}

function extractSectionCopy(
  sectionName: string,
  sectionType: SectionType,
  strategyCopy: StrategySection,
  copyData: Record<string, unknown>,
): ExtractedCopy {
  const fallback: ExtractedCopy = {
    headline: strategyCopy.title ?? sectionName,
    subhead: '',
    body: '',
    cta: strategyCopy.cta ?? '',
  };

  // Try matching by section name in copy data
  const normalizedName = sectionName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedType = sectionType.toLowerCase();

  for (const [key, value] of Object.entries(copyData)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalizedKey.includes(normalizedName) || normalizedKey.includes(normalizedType)) {
      if (typeof value === 'object' && value !== null) {
        const obj = value as Record<string, unknown>;
        return {
          headline: String(obj.headline ?? obj.title ?? obj.h1 ?? fallback.headline),
          subhead: String(obj.subhead ?? obj.subtitle ?? obj.h2 ?? ''),
          body: String(obj.body ?? obj.text ?? obj.description ?? obj.content ?? ''),
          cta: String(obj.cta ?? obj.button ?? obj.cta_text ?? fallback.cta),
          micro_copy: String(obj.micro_copy ?? obj.microcopy ?? ''),
        };
      }
      if (typeof value === 'string') {
        return { ...fallback, body: value, micro_copy: undefined };
      }
    }
  }

  // Try sections array in copy data
  const sections = copyData.sections as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(sections)) {
    for (const s of sections) {
      const sName = String(s.name ?? s.section ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (sName.includes(normalizedName) || sName.includes(normalizedType)) {
        return {
          headline: String(s.headline ?? s.title ?? fallback.headline),
          subhead: String(s.subhead ?? s.subtitle ?? ''),
          body: String(s.body ?? s.text ?? s.description ?? ''),
          cta: String(s.cta ?? s.button ?? fallback.cta),
          micro_copy: String(s.micro_copy ?? s.microcopy ?? ''),
        };
      }
    }
  }

  return fallback;
}

// ---------------------------------------------------------------------------
// Brand config extraction
// ---------------------------------------------------------------------------

function extractBrandConfig(
  visuals: Record<string, unknown>,
  research: Record<string, unknown> | null,
): BrandConfig {
  const defaults: BrandConfig = {
    primary_color: '#6366f1',
    secondary_color: '#8b5cf6',
    accent_color: '#f59e0b',
    bg_color: '#0f172a',
    text_color: '#f8fafc',
    font_heading: 'Inter',
    font_body: 'Inter',
  };

  // Try brand_guidelines from research first
  const brandGuidelines = research?.brand_guidelines as Record<string, unknown> | undefined;
  if (brandGuidelines) {
    const colors = brandGuidelines.colors as Array<{ hex: string; role: string }> | undefined;
    if (Array.isArray(colors)) {
      for (const c of colors) {
        const role = c.role?.toLowerCase() ?? '';
        if (role.includes('primary')) defaults.primary_color = c.hex;
        else if (role.includes('secondary')) defaults.secondary_color = c.hex;
        else if (role.includes('accent')) defaults.accent_color = c.hex;
        else if (role.includes('background') || role.includes('bg')) defaults.bg_color = c.hex;
        else if (role.includes('text')) defaults.text_color = c.hex;
      }
    }
    const typography = brandGuidelines.typography as Array<{ family: string; usage: string }> | undefined;
    if (Array.isArray(typography)) {
      for (const t of typography) {
        const usage = t.usage?.toLowerCase() ?? '';
        if (usage.includes('heading') || usage.includes('display')) defaults.font_heading = t.family;
        else if (usage.includes('body') || usage.includes('text')) defaults.font_body = t.family;
      }
    }
  }

  // Override with visuals palette if present
  const palette = visuals.palette ?? visuals.color_palette ?? visuals.colors;
  if (typeof palette === 'object' && palette !== null) {
    const p = palette as Record<string, unknown>;
    if (p.primary) defaults.primary_color = String(p.primary);
    if (p.secondary) defaults.secondary_color = String(p.secondary);
    if (p.accent) defaults.accent_color = String(p.accent);
    if (p.background || p.bg) defaults.bg_color = String(p.background ?? p.bg);
    if (p.text) defaults.text_color = String(p.text);
  }

  // Typography from visuals
  const typography = visuals.typography as Record<string, unknown> | undefined;
  if (typography) {
    if (typography.heading || typography.headings) {
      const h = String(typography.heading ?? typography.headings);
      // Extract font family name (strip weight info like "600", "bold")
      const family = h.replace(/\d+|bold|regular|light|medium|semibold/gi, '').trim();
      if (family) defaults.font_heading = family;
    }
    if (typography.body) {
      const b = String(typography.body);
      const family = b.replace(/\d+|bold|regular|light|medium|semibold/gi, '').trim();
      if (family) defaults.font_body = family;
    }
  }

  return defaults;
}

// ---------------------------------------------------------------------------
// Strategy section extraction
// ---------------------------------------------------------------------------

function extractStrategySections(strategy: Record<string, unknown>): StrategySection[] {
  // Try explicit sections array
  if (Array.isArray(strategy.sections)) {
    return strategy.sections as StrategySection[];
  }

  // Try section_layout array
  if (Array.isArray(strategy.section_layout)) {
    return strategy.section_layout as StrategySection[];
  }

  // Try layout array
  if (Array.isArray(strategy.layout)) {
    return strategy.layout as StrategySection[];
  }

  // Build from numbered keys (e.g. section_1, section_2)
  const numbered: StrategySection[] = [];
  for (const [key, value] of Object.entries(strategy)) {
    if (/^section[_\s]?\d+$/i.test(key) && typeof value === 'object' && value !== null) {
      numbered.push(value as StrategySection);
    }
  }
  if (numbered.length > 0) return numbered;

  // Parse from raw markdown text (strategy stored as { raw: "## Section 1: Hero\n..." })
  const rawText = typeof strategy.raw === 'string' ? strategy.raw : '';
  if (rawText) {
    const headingRegex = /^#{1,3}\s*(?:\d+[.):]?\s*)?(.+)/gm;
    const parsed: StrategySection[] = [];
    let match: RegExpExecArray | null;
    while ((match = headingRegex.exec(rawText)) !== null) {
      const name = match[1].replace(/\*\*/g, '').trim();
      // Skip meta headings
      if (/^(summary|overview|notes|strategy|layout|approach)/i.test(name)) continue;
      parsed.push({ name, title: name });
    }
    if (parsed.length >= 2) return parsed;
  }

  // Fallback: standard landing page structure
  return [
    { name: 'Hero', type: 'hero' },
    { name: 'Problem', type: 'problem' },
    { name: 'Solution', type: 'solution' },
    { name: 'Features', type: 'features' },
    { name: 'Social Proof', type: 'social-proof' },
    { name: 'CTA', type: 'cta' },
  ];
}

// ---------------------------------------------------------------------------
// Section style assignment
// ---------------------------------------------------------------------------

function assignSectionStyle(
  sectionType: SectionType,
  index: number,
  brandConfig: BrandConfig,
): { bg_color: string; text_color: string; accent_color: string } {
  // Alternate between dark and light backgrounds for visual rhythm
  const isEvenSection = index % 2 === 0;

  if (sectionType === 'hero' || sectionType === 'cta') {
    return {
      bg_color: brandConfig.bg_color,
      text_color: brandConfig.text_color,
      accent_color: brandConfig.accent_color,
    };
  }

  if (isEvenSection) {
    return {
      bg_color: brandConfig.bg_color,
      text_color: brandConfig.text_color,
      accent_color: brandConfig.primary_color,
    };
  }

  // Slightly lighter bg for odd sections
  return {
    bg_color: lightenHex(brandConfig.bg_color, 10),
    text_color: brandConfig.text_color,
    accent_color: brandConfig.secondary_color,
  };
}

function lightenHex(hex: string, percent: number): string {
  const cleaned = hex.replace('#', '');
  if (cleaned.length !== 6) return hex;

  const r = Math.min(255, parseInt(cleaned.slice(0, 2), 16) + percent);
  const g = Math.min(255, parseInt(cleaned.slice(2, 4), 16) + percent);
  const b = Math.min(255, parseInt(cleaned.slice(4, 6), 16) + percent);

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseWorkspaceToSections(workspace: {
  strategy: Record<string, unknown>;
  copy: Record<string, unknown>;
  research: Record<string, unknown> | null;
  visuals: Record<string, unknown>;
}): { sections: LandingSection[]; brandConfig: BrandConfig } {
  const brandConfig = extractBrandConfig(workspace.visuals, workspace.research);
  const strategySections = extractStrategySections(workspace.strategy);
  const structuredCopy = parseCompiledCopyToStructured(workspace.copy);

  const sections: LandingSection[] = strategySections.map((ss, index) => {
    const sectionName = ss.name ?? ss.title ?? `Section ${index + 1}`;
    const sectionType = inferSectionType(ss, index, strategySections.length);
    const copy = extractSectionCopy(sectionName, sectionType, ss, structuredCopy);
    const layoutVariant = selectLayoutVariant(copy, ss);
    const prevType = index > 0 ? inferSectionType(strategySections[index - 1], index - 1, strategySections.length) : null;

    return {
      id: crypto.randomUUID(),
      type: sectionType,
      order: index,
      copy,
      layout_variant: layoutVariant,
      image_url: null,
      image_status: 'idle',
      svg_code: null,
      svg_status: 'idle',
      style: assignSectionStyle(sectionType, index, brandConfig),
      asset_strategy: assignAssetStrategy(sectionType),
      icon_name: assignIconName(sectionType),
      divider: assignDivider(prevType, sectionType),
    };
  });

  return { sections, brandConfig };
}

export function startAssembly(
  sections: LandingSection[],
  brandConfig: BrandConfig,
  callbacks: AssemblyCallbacks,
): AssemblyController {
  // Mark all sections as generating
  for (const section of sections) {
    callbacks.onSectionUpdate(section.id, {
      image_status: 'generating',
      svg_status: 'generating',
    });
  }

  // Track state for the queue status
  let cancelled = false;
  const totalAssets = sections.length * 2; // image + svg per section

  // Shell controller — actual queue processing is wired in EDIT-005
  const controller: AssemblyController = {
    regenerateAsset(sectionId: string, assetType: 'image' | 'svg', _prompt?: string) {
      if (cancelled) return;
      const statusKey = assetType === 'image' ? 'image_status' : 'svg_status';
      const urlKey = assetType === 'image' ? 'image_url' : 'svg_code';
      callbacks.onSectionUpdate(sectionId, {
        [statusKey]: 'generating',
        [urlKey]: null,
      } as Partial<LandingSection>);
    },

    cancelAll() {
      cancelled = true;
    },

    getQueueStatus() {
      if (cancelled) {
        return { pending: 0, processing: null, completed: 0, failed: 0 };
      }
      // Shell — all assets still pending until EDIT-005 wires the queue
      return {
        pending: totalAssets,
        processing: null,
        completed: 0,
        failed: 0,
      };
    },
  };

  return controller;
}
