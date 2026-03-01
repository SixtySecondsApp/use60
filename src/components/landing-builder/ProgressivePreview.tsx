/**
 * ProgressivePreview — Evolving page preview in the right panel
 *
 * Builds up a visual miniature preview as each phase completes:
 * - After Strategy: Section wireframe skeleton
 * - After Copy: Headlines laid out in sections
 * - After Visuals: Styled with colors from palette
 * - After Build: Shows "Preview ready" with link to scroll
 */

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface ProgressivePreviewProps {
  /** Accumulated outputs from each completed phase (0-indexed) */
  phaseOutputs: Record<number, string>;
  /** Current phase index (0-based) */
  currentPhase: number;
  /** Generated hero image URL (if any) */
  heroImageUrl?: string | null;
}

/**
 * Extract section names from Strategy phase output.
 */
function extractSections(strategyOutput: string): string[] {
  const sections: string[] = [];
  const patterns = [
    /(?:^|\n)\d+\.\s*\*\*([^*\n]+)\*\*/g,
    /(?:^|\n)###\s+([^\n]+)/g,
    /(?:^|\n)[-*]\s*\*\*([^*]+)\*\*/g,
  ];

  for (const pattern of patterns) {
    for (const match of strategyOutput.matchAll(pattern)) {
      const name = match[1].trim().replace(/\*\*/g, '');
      if (name && !sections.includes(name) && name.length < 60) {
        sections.push(name);
      }
    }
    if (sections.length >= 3) break;
  }

  return sections.length > 0
    ? sections
    : ['Hero', 'Problem', 'Solution', 'Social Proof', 'CTA'];
}

/**
 * Extract hex colors from Visuals phase output.
 */
function extractColors(visualsOutput: string): string[] {
  const colors: string[] = [];
  const matches = visualsOutput.matchAll(/`(#[0-9A-Fa-f]{3,8})`/g);
  for (const match of matches) {
    if (!colors.includes(match[1]) && colors.length < 8) {
      colors.push(match[1]);
    }
  }
  return colors;
}

/**
 * Extract copy headlines from Copy phase output (approved selections).
 */
function extractHeadlines(copyOutput: string): Record<string, string> {
  const headlines: Record<string, string> = {};

  // Try approved format: "## Section Name\nHeadline: ..."
  const approvedBlocks = copyOutput.split(/(?=##\s+[^\n]+)/);
  for (const block of approvedBlocks) {
    const headerMatch = block.match(/##\s+(.+)/);
    if (!headerMatch) continue;
    const headlineMatch = block.match(/Headline:\s*(.+)/);
    if (headlineMatch) {
      headlines[headerMatch[1].trim()] = headlineMatch[1].trim();
    }
  }

  // Fallback: try "### Section Name" with blockquote headline
  if (Object.keys(headlines).length === 0) {
    const sectionBlocks = copyOutput.split(/(?=###\s+[^\n]+)/);
    for (const block of sectionBlocks) {
      const headerMatch = block.match(/###\s+(.+)/);
      if (!headerMatch) continue;
      const headlineMatch = block.match(/>\s*\*\*([^*]+)\*\*/);
      if (headlineMatch) {
        headlines[headerMatch[1].trim()] = headlineMatch[1].trim();
      }
    }
  }

  return headlines;
}

export const ProgressivePreview: React.FC<ProgressivePreviewProps> = ({
  phaseOutputs,
  currentPhase,
  heroImageUrl,
}) => {
  const strategyOutput = phaseOutputs[0];
  const copyOutput = phaseOutputs[1];
  const visualsOutput = phaseOutputs[2];

  const sections = useMemo(
    () => (strategyOutput ? extractSections(strategyOutput) : []),
    [strategyOutput],
  );

  const headlines = useMemo(
    () => (copyOutput ? extractHeadlines(copyOutput) : {}),
    [copyOutput],
  );

  const colors = useMemo(
    () => (visualsOutput ? extractColors(visualsOutput) : []),
    [visualsOutput],
  );

  const hasColors = colors.length > 0;
  const primaryColor = colors[0] || '#6C63FF';
  const bgDark = colors.find(c => {
    // Find a dark color for background
    const hex = c.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return (r + g + b) / 3 < 50;
  }) || '#0D0D1A';

  if (sections.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-xs text-gray-500">
          Preview builds as you approve each phase
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border border-gray-700/50 overflow-hidden"
      style={hasColors ? { backgroundColor: bgDark } : undefined}
    >
      {/* Mini page preview */}
      <div className="p-2.5 space-y-1.5">
        {sections.map((section, i) => {
          const headline = headlines[section];
          const isHero = i === 0;

          return (
            <div
              key={section}
              className={cn(
                'rounded-md transition-all',
                isHero ? 'p-2.5' : 'p-2',
                hasColors
                  ? 'border border-gray-600/20'
                  : 'bg-gray-800/40 border border-gray-700/30',
              )}
              style={
                hasColors
                  ? {
                      backgroundColor:
                        i % 2 === 0
                          ? 'rgba(255,255,255,0.03)'
                          : 'rgba(255,255,255,0.01)',
                      borderColor: isHero ? primaryColor + '30' : undefined,
                    }
                  : undefined
              }
            >
              {/* Hero image thumbnail */}
              {isHero && heroImageUrl && (
                <div className="mb-1.5 rounded overflow-hidden">
                  <img
                    src={heroImageUrl}
                    alt="Hero"
                    className="w-full h-10 object-cover opacity-80"
                  />
                </div>
              )}

              {/* Section label */}
              <div className="flex items-center gap-1 mb-0.5">
                <div
                  className="w-1 h-1 rounded-full flex-shrink-0"
                  style={{ backgroundColor: hasColors ? primaryColor : '#6B7280' }}
                />
                <span
                  className="text-[9px] font-medium uppercase tracking-wider"
                  style={{ color: hasColors ? primaryColor + 'AA' : '#6B7280' }}
                >
                  {section}
                </span>
              </div>

              {/* Content preview */}
              {headline ? (
                <p
                  className={cn(
                    'text-[10px] font-semibold truncate leading-tight',
                    hasColors ? 'text-gray-200' : 'text-gray-400',
                  )}
                >
                  {headline}
                </p>
              ) : (
                <div className="space-y-0.5">
                  <div
                    className={cn(
                      'h-1.5 rounded-full',
                      isHero ? 'w-3/4' : 'w-1/2',
                      'bg-gray-700/40',
                    )}
                  />
                  <div className="h-1 rounded-full w-2/3 bg-gray-700/25" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Color palette strip */}
      {colors.length > 0 && (
        <div className="flex border-t border-gray-700/30">
          {colors.slice(0, 6).map((color) => (
            <div
              key={color}
              className="flex-1 h-2.5"
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
      )}

      {/* Phase indicator */}
      <div className="px-2.5 py-1.5 border-t border-gray-700/20">
        <div className="flex items-center gap-1">
          {[0, 1, 2, 3].map((phase) => (
            <div
              key={phase}
              className={cn(
                'flex-1 h-0.5 rounded-full transition-all',
                phase < currentPhase
                  ? 'bg-violet-500'
                  : phase === currentPhase
                    ? 'bg-violet-500/40'
                    : 'bg-gray-700/40',
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
