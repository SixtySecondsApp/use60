/**
 * LandingEditorPanel — Right panel for assembly mode.
 *
 * Combines SectionListPanel (top) + PropertiesPanel (bottom) in a split layout.
 * Clicking a section in the list opens its properties below for direct editing.
 */

import React, { useCallback, useState } from 'react';
import { SectionListPanel } from './SectionListPanel';
import { PropertiesPanel } from './PropertiesPanel';
import type { LandingSection } from './types';

interface LandingEditorPanelProps {
  sections: LandingSection[];
  onSectionsChange: (sections: LandingSection[]) => void;
  onRegenerateAsset: (sectionId: string, assetType: 'image' | 'svg') => void;
  onUploadAsset?: (sectionId: string, file: File) => Promise<string>;
  onCropAsset?: (sectionId: string) => void;
  selectedSectionId?: string;
  onSelectSection?: (sectionId: string) => void;
}

export const LandingEditorPanel: React.FC<LandingEditorPanelProps> = ({
  sections,
  onSectionsChange,
  onRegenerateAsset,
  onUploadAsset,
  onCropAsset,
  selectedSectionId: externalSelectedId,
  onSelectSection: externalOnSelect,
}) => {
  const [internalSelectedId, setInternalSelectedId] = useState<string | undefined>();

  const selectedId = externalSelectedId ?? internalSelectedId;
  const selectedSection = sections.find((s) => s.id === selectedId) ?? null;

  const handleSelectSection = useCallback(
    (sectionId: string) => {
      setInternalSelectedId(sectionId);
      externalOnSelect?.(sectionId);
    },
    [externalOnSelect],
  );

  const handleReorder = useCallback(
    (reordered: LandingSection[]) => {
      onSectionsChange(reordered);
    },
    [onSectionsChange],
  );

  const handleSectionUpdate = useCallback(
    (sectionId: string, patch: Partial<LandingSection>) => {
      onSectionsChange(
        sections.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)),
      );
    },
    [sections, onSectionsChange],
  );

  // Progress stats
  const totalAssets = sections.length * 2;
  const completeAssets = sections.reduce((acc, s) => {
    if (s.image_status === 'complete') acc++;
    if (s.svg_status === 'complete') acc++;
    return acc;
  }, 0);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-white/5">
      {/* Progress header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-white/5">
        <span className="text-xs font-semibold text-gray-700 dark:text-slate-300">
          Editor
        </span>
        <span className="text-[10px] text-gray-400 dark:text-slate-500">
          {completeAssets}/{totalAssets} assets
        </span>
      </div>

      {/* Section list (top half) */}
      <div className="flex-1 min-h-0 overflow-hidden border-b border-gray-200 dark:border-white/5">
        <SectionListPanel
          sections={sections}
          selectedSectionId={selectedId}
          onSelectSection={handleSelectSection}
          onReorder={handleReorder}
        />
      </div>

      {/* Properties panel (bottom half) */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <PropertiesPanel
          section={selectedSection}
          onSectionUpdate={handleSectionUpdate}
          onRegenerateAsset={onRegenerateAsset}
          onUploadAsset={onUploadAsset}
          onCropAsset={onCropAsset}
        />
      </div>
    </div>
  );
};

export default LandingEditorPanel;
