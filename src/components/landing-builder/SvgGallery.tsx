/**
 * SVG Gallery
 *
 * Displays generated Gemini SVGs in the visuals phase.
 * Each SVG is labelled by section name and can be approved/rejected.
 * Rejected SVGs queue for regeneration.
 */

import React, { useState, useCallback } from 'react';
import { Check, X, RefreshCw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SvgPreview } from './SvgPreview';
import { geminiSvgService, type GenerateSvgParams } from '@/lib/services/geminiSvgService';

export interface SvgAsset {
  id: string;
  sectionName: string;
  svgCode: string;
  status: 'pending' | 'approved' | 'rejected' | 'regenerating';
  description: string;
}

interface SvgGalleryProps {
  assets: SvgAsset[];
  brandColors?: Record<string, string>;
  onAssetsChange: (assets: SvgAsset[]) => void;
  onAllApproved?: (approvedAssets: SvgAsset[]) => void;
}

export const SvgGallery: React.FC<SvgGalleryProps> = ({
  assets,
  brandColors,
  onAssetsChange,
  onAllApproved,
}) => {
  const [regeneratingIds, setRegeneratingIds] = useState<Set<string>>(new Set());

  const handleApprove = useCallback((id: string) => {
    const updated = assets.map(a =>
      a.id === id ? { ...a, status: 'approved' as const } : a
    );
    onAssetsChange(updated);

    // Check if all are approved
    const allApproved = updated.every(a => a.status === 'approved');
    if (allApproved && onAllApproved) {
      onAllApproved(updated);
    }
  }, [assets, onAssetsChange, onAllApproved]);

  const handleReject = useCallback((id: string) => {
    const updated = assets.map(a =>
      a.id === id ? { ...a, status: 'rejected' as const } : a
    );
    onAssetsChange(updated);
  }, [assets, onAssetsChange]);

  const handleRegenerate = useCallback(async (id: string) => {
    const asset = assets.find(a => a.id === id);
    if (!asset) return;

    setRegeneratingIds(prev => new Set(prev).add(id));

    const params: GenerateSvgParams = {
      description: asset.description,
      brand_colors: brandColors,
      complexity: 'medium',
    };

    const result = await geminiSvgService.generate(params);

    if (result) {
      const updated = assets.map(a =>
        a.id === id ? { ...a, svgCode: result.svg_code, status: 'pending' as const } : a
      );
      onAssetsChange(updated);
    }

    setRegeneratingIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, [assets, brandColors, onAssetsChange]);

  const approvedCount = assets.filter(a => a.status === 'approved').length;
  const totalCount = assets.length;

  return (
    <div className="space-y-4">
      {/* Progress header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">
          SVG Animations
        </h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {approvedCount}/{totalCount} approved
        </span>
      </div>

      {/* SVG grid */}
      <div className="grid grid-cols-1 gap-4">
        {assets.map(asset => {
          const isRegenerating = regeneratingIds.has(asset.id);

          return (
            <div
              key={asset.id}
              className={cn(
                'rounded-xl border overflow-hidden',
                asset.status === 'approved'
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : asset.status === 'rejected'
                    ? 'border-red-500/30 bg-red-500/5'
                    : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.02]'
              )}
            >
              {/* Section label */}
              <div className="px-4 py-2 border-b border-gray-200/50 dark:border-white/5 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  {asset.sectionName}
                </span>
                {asset.status === 'approved' && (
                  <span className="text-[10px] font-medium text-emerald-500 uppercase tracking-wider flex items-center gap-1">
                    <Check className="w-3 h-3" /> Approved
                  </span>
                )}
              </div>

              {/* SVG preview */}
              <div className="p-4">
                {isRegenerating ? (
                  <div className="h-40 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
                    <span className="ml-2 text-sm text-gray-500">Regenerating...</span>
                  </div>
                ) : (
                  <SvgPreview svg={asset.svgCode} />
                )}
              </div>

              {/* Action buttons */}
              {asset.status !== 'approved' && !isRegenerating && (
                <div className="px-4 py-2 border-t border-gray-200/50 dark:border-white/5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleApprove(asset.id)}
                    className="flex-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors flex items-center justify-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" /> Approve
                  </button>
                  {asset.status === 'rejected' ? (
                    <button
                      type="button"
                      onClick={() => handleRegenerate(asset.id)}
                      className="flex-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 hover:bg-violet-500/20 transition-colors flex items-center justify-center gap-1"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Regenerate
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleReject(asset.id)}
                      className="flex-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
