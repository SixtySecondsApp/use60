/**
 * SVG Preview
 *
 * Renders inline SVG content safely using DOMPurify with SVG profile.
 * Used in the landing page builder to show AI-generated SVG animations
 * visually instead of as raw code blocks.
 */

import React, { useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { Eye, Code } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SvgPreviewProps {
  svg: string;
}

export const SvgPreview: React.FC<SvgPreviewProps> = ({ svg }) => {
  const [showCode, setShowCode] = useState(false);

  const sanitizedSvg = useMemo(
    () =>
      DOMPurify.sanitize(svg, {
        USE_PROFILES: { html: true, svg: true, svgFilters: true },
        ADD_TAGS: ['animate', 'animateTransform', 'animateMotion', 'set'],
        ADD_ATTR: ['attributeName', 'begin', 'dur', 'end', 'fill', 'from', 'to',
          'values', 'keyTimes', 'keySplines', 'repeatCount', 'calcMode',
          'type', 'additive', 'accumulate', 'dominant-baseline', 'text-anchor'],
        FORCE_BODY: true,
      }),
    [svg],
  );

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden my-3">
      {/* Toggle bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">SVG Animation</span>
        <button
          type="button"
          onClick={() => setShowCode(!showCode)}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          {showCode ? <Eye className="w-3 h-3" /> : <Code className="w-3 h-3" />}
          {showCode ? 'Preview' : 'Code'}
        </button>
      </div>

      {showCode ? (
        <pre className="overflow-auto p-4 text-xs bg-gray-950 text-gray-300 max-h-[300px]">
          <code>{svg}</code>
        </pre>
      ) : (
        <div
          className={cn(
            'flex items-center justify-center p-6',
            'bg-white dark:bg-gray-950',
            'min-h-[120px]',
          )}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
        />
      )}
    </div>
  );
};
