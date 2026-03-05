/**
 * AssemblyPreview — Full-width progressive assembly preview
 *
 * Wraps LandingCodePreview iframe and adds:
 * - Section status overlay badges (generating/complete/failed)
 * - Completion highlight pulse when assets resolve
 * - Scroll-to-section when chat highlights a section
 * - Device width toggles (mobile/tablet/desktop)
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, AlertTriangle, Monitor, Tablet, Smartphone, Waves } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReactSectionRenderer } from './ReactSectionRenderer';
import type { LandingSection, BrandConfig, AssetStatus } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AssemblyPreviewProps {
  sections: LandingSection[];
  brandConfig: BrandConfig;
  highlightSectionId?: string;
  onSectionClick?: (sectionId: string) => void;
  showDividers?: boolean;
  onToggleDividers?: () => void;
  onSectionUpdate?: (sectionId: string, updates: Partial<LandingSection>) => void;
  onRegenerateAsset?: (sectionId: string, assetType: 'image' | 'svg') => void;
}

type DeviceWidth = 'mobile' | 'tablet' | 'desktop';

const DEVICE_WIDTHS: Record<DeviceWidth, number | '100%'> = {
  mobile: 375,
  tablet: 768,
  desktop: '100%',
};

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status, type }: { status: AssetStatus; type: 'image' | 'svg' }) {
  if (status === 'idle') return null;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium',
        status === 'generating' && 'bg-blue-500/20 text-blue-400',
        status === 'complete' && 'bg-emerald-500/20 text-emerald-400',
        status === 'failed' && 'bg-red-500/20 text-red-400',
      )}
    >
      {status === 'generating' && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
      {status === 'complete' && <Check className="w-2.5 h-2.5" />}
      {status === 'failed' && <AlertTriangle className="w-2.5 h-2.5" />}
      <span>{type === 'image' ? 'img' : 'svg'}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AssemblyPreview: React.FC<AssemblyPreviewProps> = ({
  sections,
  brandConfig,
  highlightSectionId,
  onSectionClick,
  showDividers = true,
  onToggleDividers,
  onSectionUpdate,
  onRegenerateAsset,
}) => {
  const [device, setDevice] = useState<DeviceWidth>('desktop');
  const [recentlyCompleted, setRecentlyCompleted] = useState<Set<string>>(new Set());
  const prevStatusRef = useRef<Map<string, { image: AssetStatus; svg: AssetStatus }>>(new Map());

  // Track completion highlights
  useEffect(() => {
    const newlyCompleted = new Set<string>();
    const prev = prevStatusRef.current;

    for (const section of sections) {
      const prevS = prev.get(section.id);
      if (prevS) {
        if (prevS.image === 'generating' && section.image_status === 'complete') {
          newlyCompleted.add(`${section.id}:image`);
        }
        if (prevS.svg === 'generating' && section.svg_status === 'complete') {
          newlyCompleted.add(`${section.id}:svg`);
        }
      }
      prev.set(section.id, { image: section.image_status, svg: section.svg_status });
    }

    if (newlyCompleted.size > 0) {
      setRecentlyCompleted((prev) => new Set([...prev, ...newlyCompleted]));
      // Clear after animation
      const timeout = setTimeout(() => {
        setRecentlyCompleted((prev) => {
          const next = new Set(prev);
          newlyCompleted.forEach((k) => next.delete(k));
          return next;
        });
      }, 800);
      return () => clearTimeout(timeout);
    }
  }, [sections]);

  // Overall stats
  const stats = useMemo(() => {
    let generating = 0;
    let complete = 0;
    let failed = 0;
    for (const s of sections) {
      if (s.image_status === 'generating') generating++;
      if (s.svg_status === 'generating') generating++;
      if (s.image_status === 'complete') complete++;
      if (s.svg_status === 'complete') complete++;
      if (s.image_status === 'failed') failed++;
      if (s.svg_status === 'failed') failed++;
    }
    const total = sections.length * 2;
    return { generating, complete, failed, total };
  }, [sections]);

  const width = DEVICE_WIDTHS[device];

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-white/[0.02] border-b border-gray-200 dark:border-white/5">
        {/* Device toggles */}
        <div className="flex items-center gap-1">
          {([
            { key: 'mobile' as DeviceWidth, icon: Smartphone, label: 'Mobile' },
            { key: 'tablet' as DeviceWidth, icon: Tablet, label: 'Tablet' },
            { key: 'desktop' as DeviceWidth, icon: Monitor, label: 'Desktop' },
          ]).map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setDevice(key)}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                device === key
                  ? 'bg-violet-500/10 text-violet-500'
                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300',
              )}
              title={label}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}

          {/* Divider toggle */}
          {onToggleDividers && (
            <>
              <div className="w-px h-4 bg-gray-200 dark:bg-white/10 mx-1" />
              <button
                type="button"
                onClick={onToggleDividers}
                className={cn(
                  'p-1.5 rounded-md transition-colors',
                  showDividers
                    ? 'bg-violet-500/10 text-violet-500'
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300',
                )}
                title={showDividers ? 'Hide section dividers' : 'Show section dividers'}
              >
                <Waves className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* Asset generation progress */}
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
          {stats.generating > 0 && (
            <span className="flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
              {stats.generating} generating
            </span>
          )}
          {stats.complete > 0 && (
            <span className="flex items-center gap-1 text-emerald-500">
              <Check className="w-3 h-3" />
              {stats.complete}/{stats.total}
            </span>
          )}
          {stats.failed > 0 && (
            <span className="flex items-center gap-1 text-red-400">
              <AlertTriangle className="w-3 h-3" />
              {stats.failed} failed
            </span>
          )}
        </div>
      </div>

      {/* Preview area */}
      <div className="flex-1 relative overflow-hidden bg-gray-100 dark:bg-gray-900/50">
        {/* Section status badges overlay */}
        <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
          {sections.map((section) => {
            const hasActivity = section.image_status !== 'idle' || section.svg_status !== 'idle';
            const isHighlighted = recentlyCompleted.has(`${section.id}:image`) || recentlyCompleted.has(`${section.id}:svg`);

            if (!hasActivity) return null;

            return (
              <div
                key={section.id}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-md bg-gray-900/80 backdrop-blur-sm transition-all',
                  highlightSectionId === section.id && 'ring-1 ring-violet-500',
                  isHighlighted && 'ring-2 ring-emerald-500 animate-pulse',
                )}
                onClick={() => onSectionClick?.(section.id)}
              >
                <span className="text-[10px] text-gray-300 font-medium mr-1">{section.type}</span>
                <StatusBadge status={section.image_status} type="image" />
                <StatusBadge status={section.svg_status} type="svg" />
              </div>
            );
          })}
        </div>

        {/* React component preview */}
        <div
          className="mx-auto h-full transition-all duration-300"
          style={{ maxWidth: typeof width === 'number' ? `${width}px` : width }}
        >
          <ReactSectionRenderer
            sections={sections}
            brandConfig={brandConfig}
            onSectionClick={onSectionClick}
            showDividers={showDividers}
            onSectionUpdate={onSectionUpdate}
            onRegenerateAsset={onRegenerateAsset}
          />
        </div>
      </div>
    </div>
  );
};

export default AssemblyPreview;
