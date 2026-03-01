/**
 * Progressive Preview
 *
 * Wraps the deterministic section renderer with an iframe preview and adds:
 * - Section status overlay badges (generating/complete/failed)
 * - Completion highlight animation (green ring that fades after 800ms)
 * - Scroll-to-section when highlightSectionId changes
 * - Device width toggles (mobile/tablet/desktop)
 */

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Check, AlertTriangle, Smartphone, Monitor, Tablet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { renderSectionsToCode } from './sectionRenderer';
import type { LandingSection, BrandConfig, AssetStatus } from './types';

export interface ProgressivePreviewProps {
  sections: LandingSection[];
  brandConfig: BrandConfig;
  highlightSectionId?: string;
  onSectionClick?: (sectionId: string) => void;
}

type DeviceWidth = 'mobile' | 'tablet' | 'desktop';

const DEVICE_WIDTHS: Record<DeviceWidth, string> = {
  mobile: '375px',
  tablet: '768px',
  desktop: '100%',
};

function getOverallStatus(section: LandingSection): AssetStatus {
  if (section.image_status === 'generating' || section.svg_status === 'generating') return 'generating';
  if (section.image_status === 'failed' || section.svg_status === 'failed') return 'failed';
  if (section.image_status === 'complete' || section.svg_status === 'complete') return 'complete';
  return 'idle';
}

export function ProgressivePreview({
  sections,
  brandConfig,
  highlightSectionId,
  onSectionClick,
}: ProgressivePreviewProps) {
  const [deviceWidth, setDeviceWidth] = useState<DeviceWidth>('desktop');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const prevStatusRef = useRef<Map<string, AssetStatus>>(new Map());
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

  const code = useMemo(
    () => renderSectionsToCode(sections, brandConfig),
    [sections, brandConfig],
  );

  // Inject a scroll-to-section script when highlightSectionId changes
  const codeWithScroll = useMemo(() => {
    if (!highlightSectionId) return code;
    const scrollScript = `<script>
      (function() {
        var el = document.querySelector('[data-section-id="${highlightSectionId}"]');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      })();
    <\/script>`;
    return code.replace('</body>', scrollScript + '</body>');
  }, [code, highlightSectionId]);

  // Track status transitions: generating -> complete triggers highlight
  useEffect(() => {
    const newCompleted = new Set<string>();
    for (const section of sections) {
      const currentStatus = getOverallStatus(section);
      const prevStatus = prevStatusRef.current.get(section.id);
      if (prevStatus === 'generating' && currentStatus === 'complete') {
        newCompleted.add(section.id);
      }
    }

    // Update prev status map every render
    const nextMap = new Map<string, AssetStatus>();
    for (const section of sections) {
      nextMap.set(section.id, getOverallStatus(section));
    }
    prevStatusRef.current = nextMap;

    if (newCompleted.size > 0) {
      setCompletedIds((prev) => new Set([...prev, ...newCompleted]));
      const timer = setTimeout(() => {
        setCompletedIds((prev) => {
          const next = new Set(prev);
          for (const id of newCompleted) next.delete(id);
          return next;
        });
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [sections]);

  const sorted = useMemo(
    () => [...sections].sort((a, b) => a.order - b.order),
    [sections],
  );

  const handleIframeLoad = useCallback(() => {
    if (!onSectionClick || !iframeRef.current) return;
    try {
      const doc = iframeRef.current.contentDocument;
      if (!doc) return;
      doc.querySelectorAll('[data-section-id]').forEach((el) => {
        el.addEventListener('click', () => {
          const id = el.getAttribute('data-section-id');
          if (id) onSectionClick(id);
        });
      });
    } catch {
      // cross-origin restriction — ignore
    }
  }, [onSectionClick]);

  return (
    <div className="relative flex flex-col h-full">
      {/* Toolbar */}
      <div className={cn(
        'flex items-center justify-between px-3 py-2 border-b',
        'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700',
      )}>
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
          Preview
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setDeviceWidth('mobile')}
            className={cn(
              'p-1.5 rounded transition-colors',
              deviceWidth === 'mobile' ? 'text-blue-500' : 'text-gray-400 hover:text-gray-600',
            )}
            title="Mobile (375px)"
          >
            <Smartphone className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setDeviceWidth('tablet')}
            className={cn(
              'p-1.5 rounded transition-colors',
              deviceWidth === 'tablet' ? 'text-blue-500' : 'text-gray-400 hover:text-gray-600',
            )}
            title="Tablet (768px)"
          >
            <Tablet className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setDeviceWidth('desktop')}
            className={cn(
              'p-1.5 rounded transition-colors',
              deviceWidth === 'desktop' ? 'text-blue-500' : 'text-gray-400 hover:text-gray-600',
            )}
            title="Desktop (full width)"
          >
            <Monitor className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Preview area with overlay badges */}
      <div className="relative flex-1 flex justify-center bg-gray-100 dark:bg-gray-950 overflow-hidden">
        <iframe
          ref={iframeRef}
          srcDoc={codeWithScroll}
          sandbox="allow-scripts allow-same-origin"
          title="Landing Page Preview"
          className="bg-white border-0 h-full"
          style={{ width: DEVICE_WIDTHS[deviceWidth] }}
          onLoad={handleIframeLoad}
        />

        {/* Section status badges — positioned absolutely over the iframe */}
        <div className="absolute inset-0 pointer-events-none">
          {sorted.map((section, index) => {
            const status = getOverallStatus(section);
            if (status === 'idle') return null;

            const isJustCompleted = completedIds.has(section.id);
            // Approximate vertical offset based on section order
            const topPercent = sorted.length > 0
              ? (index / sorted.length) * 100
              : 0;

            return (
              <div
                key={section.id}
                className={cn(
                  'absolute right-3 flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium shadow-sm transition-all duration-300',
                  status === 'generating' && 'bg-white/90 dark:bg-gray-800/90 text-blue-600',
                  status === 'complete' && 'bg-white/90 dark:bg-gray-800/90 text-green-600',
                  status === 'failed' && 'bg-white/90 dark:bg-gray-800/90 text-red-600',
                  isJustCompleted && 'ring-2 ring-green-400 animate-pulse',
                )}
                style={{ top: `calc(${topPercent}% + 8px)` }}
              >
                {status === 'generating' && <Loader2 className="w-3 h-3 animate-spin" />}
                {status === 'complete' && <Check className="w-3 h-3" />}
                {status === 'failed' && <AlertTriangle className="w-3 h-3" />}
                <span className="capitalize">{section.type}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
