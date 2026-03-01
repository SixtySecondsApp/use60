/**
 * Gemini SVG Service
 *
 * Frontend wrapper for SVG generation via Gemini 3.1 Pro.
 * Uses Lambda Function URL when VITE_GENERATE_SVG_URL is set (no timeout issues),
 * falls back to Supabase edge function otherwise.
 */

import { supabase, getSupabaseAuthToken } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import logger from '@/lib/utils/logger';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const LAMBDA_URL = import.meta.env.VITE_GENERATE_SVG_URL as string | undefined;

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
// Lambda caller
// ---------------------------------------------------------------------------

async function callLambda(
  url: string,
  token: string,
  params: GenerateSvgParams,
): Promise<{ data: any; error: any }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      description: params.description,
      brand_colors: params.brand_colors,
      complexity: params.complexity ?? 'medium',
      viewbox: params.viewbox,
    }),
  });

  // Lambda Function URL can return plain text on crashes — handle gracefully
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    return { data: null, error: { error: text || `Lambda returned ${res.status}` } };
  }

  if (!res.ok) {
    return { data: null, error: body };
  }

  return { data: body, error: null };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const geminiSvgService = {
  /**
   * Generate a single SVG.
   * Uses Lambda when VITE_GENERATE_SVG_URL is set, otherwise Supabase edge function.
   * Returns null on failure (with toast notification).
   */
  async generate(params: GenerateSvgParams, _retryCount = 0): Promise<GenerateSvgResult | null> {
    try {
      const token = await getSupabaseAuthToken();
      if (!token) {
        logger.error('[geminiSvg] No auth token available');
        toast.error('Please sign in to generate SVGs');
        return null;
      }

      let data: any;
      let error: any;

      if (LAMBDA_URL) {
        // --- Lambda path (300s timeout, no wall-clock issues) ---
        ({ data, error } = await callLambda(LAMBDA_URL, token, params));

        if (error) {
          // Retry once on network failure
          if (_retryCount < 1 && !error.error) {
            logger.warn('[geminiSvg] Lambda connection failed, retrying in 2s...');
            await new Promise(r => setTimeout(r, 2000));
            return this.generate(params, _retryCount + 1);
          }

          if (error.validation_errors) {
            logger.error('[geminiSvg] SVG validation failed:', error.validation_errors);
            toast.error(`SVG validation failed: ${error.validation_errors.join(', ')}`);
            return null;
          }

          logger.error('[geminiSvg] Lambda error:', error);
          toast.error(error.error || 'Failed to generate SVG');
          return null;
        }
      } else {
        // --- Supabase edge function fallback ---
        ({ data, error } = await supabase.functions.invoke('generate-svg', {
          body: {
            description: params.description,
            brand_colors: params.brand_colors,
            complexity: params.complexity ?? 'medium',
            viewbox: params.viewbox,
          },
          headers: { Authorization: `Bearer ${token}` },
        }));

        if (error) {
          const isFetchError = error?.name === 'FunctionsFetchError' ||
            (error instanceof Error && error.message?.includes('Failed to send a request'));
          if (isFetchError && _retryCount < 1) {
            logger.warn('[geminiSvg] Connection failed, retrying in 2s...');
            await new Promise(r => setTimeout(r, 2000));
            return this.generate(params, _retryCount + 1);
          }

          const errorBody = typeof error === 'object' && error?.context?.body
            ? await error.context.body.json().catch(() => null)
            : null;
          if (errorBody?.validation_errors) {
            logger.error('[geminiSvg] SVG validation failed:', errorBody.validation_errors);
            toast.error(`SVG validation failed: ${errorBody.validation_errors.join(', ')}`);
            return null;
          }
          logger.error('[geminiSvg] Edge function error:', error);
          toast.error('Failed to generate SVG');
          return null;
        }
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
   * Generate multiple SVGs with limited concurrency.
   * Returns an array of results (null for failures).
   */
  async generateBatch(
    descriptions: GenerateSvgParams[],
    concurrency = 2,
  ): Promise<Array<GenerateSvgResult | null>> {
    const results: Array<GenerateSvgResult | null> = new Array(descriptions.length).fill(null);
    let index = 0;

    const worker = async () => {
      while (index < descriptions.length) {
        const i = index++;
        try {
          results[i] = await this.generate(descriptions[i]);
        } catch (err) {
          logger.error(`[geminiSvg] Batch item ${i} rejected:`, err);
          results[i] = null;
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(concurrency, descriptions.length) },
      () => worker(),
    );
    await Promise.all(workers);

    return results;
  },
};
