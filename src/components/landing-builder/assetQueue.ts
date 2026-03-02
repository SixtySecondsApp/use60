/**
 * Asset Generation Queue
 *
 * Priority queue for background asset generation during progressive assembly.
 * Processes serially to avoid rate limiting. Priority order:
 *   1. Hero section image (first thing user sees)
 *   2. Above-fold SVGs
 *   3. Remaining images (top → bottom)
 *   4. Remaining SVGs (top → bottom)
 *   5. User-requested regenerations (jump to front)
 */

import { nanoBananaService } from '@/lib/services/nanoBananaService';
import { geminiSvgService } from '@/lib/services/geminiSvgService';
import type { LandingSection, BrandConfig } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AssetQueueItem {
  sectionId: string;
  assetType: 'image' | 'svg';
  priority: number;
  prompt: string;
  brandColors?: Record<string, string>;
  userOverride?: string;
  retryCount: number;
}

export interface AssetQueueCallbacks {
  onStart: (sectionId: string, assetType: 'image' | 'svg') => void;
  onComplete: (sectionId: string, assetType: 'image' | 'svg', result: string) => void;
  onError: (sectionId: string, assetType: 'image' | 'svg', error: Error, willRetry: boolean) => void;
  onQueueComplete: (stats: QueueStats) => void;
}

export interface QueueStats {
  total: number;
  completed: number;
  failed: number;
  placeholders: number;
}

// ---------------------------------------------------------------------------
// Prompt simplifier (for retry attempts)
// ---------------------------------------------------------------------------

const COMPLEXITY_KEYWORDS = [
  'intricate', 'complex', 'multi-step', 'particle effects', 'particles',
  'elaborate', 'detailed animation', 'physics-based', 'fluid simulation',
  'morphing', 'kaleidoscope', '3D', 'parallax', 'cinematic',
];

function simplifyPrompt(original: string): string {
  let simplified = original;
  for (const keyword of COMPLEXITY_KEYWORDS) {
    simplified = simplified.replace(new RegExp(keyword, 'gi'), '');
  }
  // Clean up double spaces
  simplified = simplified.replace(/\s{2,}/g, ' ').trim();
  // Append simplification hint
  return `${simplified}. Keep the design clean and simple.`;
}

// ---------------------------------------------------------------------------
// Static placeholder SVG (fallback on double failure)
// ---------------------------------------------------------------------------

function generatePlaceholderSvg(section: LandingSection): string {
  const { accent_color, bg_color } = section.style;
  return `<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="300" fill="${bg_color}" rx="8"/>
  <circle cx="200" cy="130" r="40" fill="${accent_color}" opacity="0.3"/>
  <rect x="120" y="190" width="160" height="12" rx="6" fill="${accent_color}" opacity="0.2"/>
  <rect x="150" y="215" width="100" height="8" rx="4" fill="${accent_color}" opacity="0.15"/>
</svg>`;
}

// ---------------------------------------------------------------------------
// Image prompt builder
// ---------------------------------------------------------------------------

function buildImagePrompt(section: LandingSection, brandConfig: BrandConfig): string {
  const typeDescriptions: Record<string, string> = {
    hero: 'hero banner image for a modern SaaS landing page',
    problem: 'image illustrating a business problem or pain point',
    solution: 'image showing a solution or product in action',
    features: 'clean feature showcase image',
    'social-proof': 'professional testimonial or social proof image',
    cta: 'call-to-action promotional image',
    faq: 'helpful support or FAQ illustration',
    footer: 'minimal footer decorative image',
  };

  return `Generate a ${typeDescriptions[section.type] || 'professional image'}. ` +
    `Context: "${section.copy.headline}". ` +
    `Brand colors: primary ${brandConfig.primary_color}, accent ${brandConfig.accent_color}. ` +
    `Style: modern, clean, professional. No text in the image. Photorealistic.`;
}

// ---------------------------------------------------------------------------
// SVG prompt builder
// ---------------------------------------------------------------------------

function buildSvgPrompt(section: LandingSection, brandConfig: BrandConfig): string {
  const typeDescriptions: Record<string, string> = {
    hero: 'animated hero accent graphic with smooth entrance animations',
    problem: 'subtle animated illustration showing a pain point',
    solution: 'animated graphic showing transformation or improvement',
    features: 'animated icon or diagram showcasing capabilities',
    'social-proof': 'animated decorative element for testimonials',
    cta: 'eye-catching animated accent for call-to-action',
    faq: 'animated question mark or help icon',
    footer: 'subtle animated footer decoration',
  };

  return `Create an SVG animation: ${typeDescriptions[section.type] || 'decorative animation'}. ` +
    `Context: "${section.copy.headline}". ` +
    `Use colors: ${brandConfig.primary_color}, ${brandConfig.accent_color}, ${brandConfig.secondary_color}. ` +
    `Smooth CSS animations. viewBox="0 0 400 300". Keep under 5KB.`;
}

// ---------------------------------------------------------------------------
// Queue class
// ---------------------------------------------------------------------------

export class AssetGenerationQueue {
  private queue: AssetQueueItem[] = [];
  private processing: AssetQueueItem | null = null;
  private cancelled = false;
  private callbacks: AssetQueueCallbacks;
  private stats: QueueStats = { total: 0, completed: 0, failed: 0, placeholders: 0 };

  constructor(callbacks: AssetQueueCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Populate the queue from sections and brand config.
   * Priority: hero image → above-fold SVGs → remaining images → remaining SVGs.
   */
  populateFromSections(sections: LandingSection[], brandConfig: BrandConfig): void {
    this.queue = [];
    let priority = 0;

    const sorted = [...sections].sort((a, b) => a.order - b.order);

    // Skip sections with asset_strategy 'icon' or 'none' — they don't need generation
    const needsAsset = (section: LandingSection, type: 'image' | 'svg'): boolean => {
      const strategy = section.asset_strategy;
      if (strategy === 'icon' || strategy === 'none') return false;
      if (strategy === 'image' && type === 'svg') return false;
      if (strategy === 'svg' && type === 'image') return false;
      return true;
    };

    // Hero image first
    const hero = sorted.find(s => s.type === 'hero');
    if (hero && needsAsset(hero, 'image')) {
      this.queue.push({
        sectionId: hero.id,
        assetType: 'image',
        priority: priority++,
        prompt: buildImagePrompt(hero, brandConfig),
        brandColors: {
          primary: brandConfig.primary_color,
          accent: brandConfig.accent_color,
          secondary: brandConfig.secondary_color,
        },
        retryCount: 0,
      });
    }

    // Above-fold SVGs (first 2 sections)
    for (const section of sorted.slice(0, 2)) {
      if (!needsAsset(section, 'svg')) continue;
      this.queue.push({
        sectionId: section.id,
        assetType: 'svg',
        priority: priority++,
        prompt: buildSvgPrompt(section, brandConfig),
        brandColors: {
          primary: brandConfig.primary_color,
          accent: brandConfig.accent_color,
          secondary: brandConfig.secondary_color,
        },
        retryCount: 0,
      });
    }

    // Remaining images (skip hero if already added)
    for (const section of sorted) {
      if (section.type === 'hero') continue; // already added
      if (!needsAsset(section, 'image')) continue;
      this.queue.push({
        sectionId: section.id,
        assetType: 'image',
        priority: priority++,
        prompt: buildImagePrompt(section, brandConfig),
        brandColors: {
          primary: brandConfig.primary_color,
          accent: brandConfig.accent_color,
          secondary: brandConfig.secondary_color,
        },
        retryCount: 0,
      });
    }

    // Remaining SVGs (skip first 2)
    for (const section of sorted.slice(2)) {
      if (!needsAsset(section, 'svg')) continue;
      this.queue.push({
        sectionId: section.id,
        assetType: 'svg',
        priority: priority++,
        prompt: buildSvgPrompt(section, brandConfig),
        brandColors: {
          primary: brandConfig.primary_color,
          accent: brandConfig.accent_color,
          secondary: brandConfig.secondary_color,
        },
        retryCount: 0,
      });
    }

    this.stats.total = this.queue.length;
  }

  /**
   * Enqueue a single item (e.g., user-requested regen).
   */
  enqueue(item: AssetQueueItem): void {
    this.queue.push(item);
    this.stats.total++;
    this.queue.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Bump a section+asset to front of queue (user-requested regen).
   */
  prioritise(sectionId: string, assetType: 'image' | 'svg', promptOverride?: string): void {
    // Remove existing item for this section+asset
    this.queue = this.queue.filter(
      i => !(i.sectionId === sectionId && i.assetType === assetType),
    );

    const minPriority = this.queue.length > 0 ? Math.min(...this.queue.map(i => i.priority)) : 0;

    this.queue.unshift({
      sectionId,
      assetType,
      priority: minPriority - 1,
      prompt: promptOverride || '',
      retryCount: 0,
      userOverride: promptOverride,
    });
  }

  /**
   * Cancel a specific item.
   */
  cancel(sectionId: string, assetType: 'image' | 'svg'): void {
    this.queue = this.queue.filter(
      i => !(i.sectionId === sectionId && i.assetType === assetType),
    );
  }

  /**
   * Cancel all pending items.
   */
  cancelAll(): void {
    this.cancelled = true;
    this.queue = [];
  }

  /**
   * Get current queue status.
   */
  getStatus(): { pending: number; processing: string | null; completed: number; failed: number } {
    return {
      pending: this.queue.length,
      processing: this.processing ? `${this.processing.sectionId}:${this.processing.assetType}` : null,
      completed: this.stats.completed,
      failed: this.stats.failed,
    };
  }

  /**
   * Start processing the queue serially.
   */
  async process(): Promise<QueueStats> {
    this.cancelled = false;

    while (this.queue.length > 0 && !this.cancelled) {
      const item = this.queue.shift()!;
      this.processing = item;

      this.callbacks.onStart(item.sectionId, item.assetType);

      try {
        const result = await this.generateAsset(item);

        if (result) {
          this.stats.completed++;
          this.callbacks.onComplete(item.sectionId, item.assetType, result);
        } else if (item.retryCount < 1) {
          // First failure → retry with simplified prompt
          const simplified = simplifyPrompt(item.prompt);
          this.callbacks.onError(item.sectionId, item.assetType, new Error('Generation failed'), true);

          this.queue.unshift({
            ...item,
            prompt: simplified,
            retryCount: item.retryCount + 1,
          });
        } else {
          // Second failure → placeholder
          this.stats.failed++;
          this.stats.placeholders++;
          this.callbacks.onError(
            item.sectionId,
            item.assetType,
            new Error('Generation failed after retry — using placeholder'),
            false,
          );
        }
      } catch (err) {
        if (item.retryCount < 1) {
          this.callbacks.onError(item.sectionId, item.assetType, err as Error, true);
          this.queue.unshift({
            ...item,
            prompt: simplifyPrompt(item.prompt),
            retryCount: item.retryCount + 1,
          });
        } else {
          this.stats.failed++;
          this.stats.placeholders++;
          this.callbacks.onError(item.sectionId, item.assetType, err as Error, false);
        }
      }

      this.processing = null;
    }

    this.callbacks.onQueueComplete(this.stats);
    return this.stats;
  }

  // -------------------------------------------------------------------------
  // Private: generate a single asset
  // -------------------------------------------------------------------------

  private async generateAsset(item: AssetQueueItem): Promise<string | null> {
    if (item.assetType === 'image') {
      const result = await nanoBananaService.generateImage({
        prompt: item.userOverride || item.prompt,
        aspect_ratio: 'landscape',
      });
      return result.images?.[0] ?? null;
    }

    // SVG generation
    const result = await geminiSvgService.generate({
      description: item.userOverride || item.prompt,
      brand_colors: item.brandColors,
      complexity: 'medium',
    });
    return result?.svg_code ?? null;
  }
}

export { buildImagePrompt, buildSvgPrompt, simplifyPrompt, generatePlaceholderSvg };
