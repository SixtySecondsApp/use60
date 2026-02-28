/**
 * Gemini SVG Service
 *
 * Frontend wrapper for the generate-svg edge function.
 * Supports single and batch SVG generation via Gemini 3.1 Pro.
 */

import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import logger from '@/lib/utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GenerateSvgParams {
  description: string;
  brand_colors?: Record<string, string>;
  complexity?: 'simple' | 'medium' | 'complex';
  viewbox?: string;
}

export interface GenerateSvgResult {
  svg_code: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isValidSvg(svg: string): boolean {
  const trimmed = svg.trim();
  return (
    trimmed.startsWith('<svg') &&
    trimmed.endsWith('</svg>') &&
    trimmed.includes('viewBox') &&
    (trimmed.includes('xmlns="http://www.w3.org/2000/svg"') ||
      trimmed.includes("xmlns='http://www.w3.org/2000/svg'")) &&
    !trimmed.includes('<script') &&
    !trimmed.includes('javascript:')
  );
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const geminiSvgService = {
  /**
   * Generate a single SVG via the generate-svg edge function.
   * Returns null on failure (with toast notification).
   */
  async generate(params: GenerateSvgParams): Promise<GenerateSvgResult | null> {
    try {
      const { data, error } = await supabase.functions.invoke('generate-svg', {
        body: {
          description: params.description,
          brand_colors: params.brand_colors,
          complexity: params.complexity ?? 'medium',
          viewbox: params.viewbox,
        },
      });

      if (error) {
        logger.error('[geminiSvg] Edge function error:', error);
        toast.error('Failed to generate SVG');
        return null;
      }

      if (data?.error) {
        logger.error('[geminiSvg] Generation error:', data.error);
        const detail = data.validation_errors?.join(', ') || data.error;
        toast.error(`SVG generation failed: ${detail}`);
        return null;
      }

      const result = data as GenerateSvgResult;

      if (!isValidSvg(result.svg_code)) {
        logger.warn('[geminiSvg] Generated SVG failed client validation');
        toast.error('Generated SVG failed validation');
        return null;
      }

      return result;
    } catch (err) {
      logger.error('[geminiSvg] Unexpected error:', err);
      toast.error('Failed to generate SVG');
      return null;
    }
  },

  /**
   * Generate multiple SVGs in parallel.
   * Returns an array of results (null for failures).
   */
  async generateBatch(
    descriptions: GenerateSvgParams[],
  ): Promise<Array<GenerateSvgResult | null>> {
    const results = await Promise.allSettled(
      descriptions.map((params) => this.generate(params)),
    );

    return results.map((r) => {
      if (r.status === 'fulfilled') return r.value;
      logger.error('[geminiSvg] Batch item rejected:', r.reason);
      return null;
    });
  },
};
