/**
 * ImageCropModal — Canvas-based image crop dialog
 *
 * Shows a draggable/resizable crop overlay on top of the uploaded image.
 * Supports preset aspect ratios (Free, 16:9, 4:3, 1:1).
 * No external crop library required — uses HTML Canvas API for final output.
 *
 * NOTE: react-easy-crop is NOT installed. If it gets added later, this can
 * be swapped to use it for a smoother UX with pinch-zoom support.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Crop, RectangleHorizontal, Square, Maximize } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImageCropModalProps {
  open: boolean;
  imageUrl: string;
  onCrop: (croppedBlob: Blob) => void;
  onSkip: () => void;
  onClose: () => void;
}

type AspectPreset = 'free' | '16:9' | '4:3' | '1:1';

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

const ASPECT_PRESETS: { value: AspectPreset; label: string; ratio: number | null; icon: React.ElementType }[] = [
  { value: 'free', label: 'Free', ratio: null, icon: Maximize },
  { value: '16:9', label: '16:9', ratio: 16 / 9, icon: RectangleHorizontal },
  { value: '4:3', label: '4:3', ratio: 4 / 3, icon: RectangleHorizontal },
  { value: '1:1', label: '1:1', ratio: 1, icon: Square },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clamp a value between min and max */
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/** Load an image element from a URL */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  open,
  imageUrl,
  onCrop,
  onSkip,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imgNaturalSize, setImgNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [displaySize, setDisplaySize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [cropArea, setCropArea] = useState<CropArea>({ x: 0, y: 0, width: 0, height: 0 });
  const [aspectPreset, setAspectPreset] = useState<AspectPreset>('free');
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isCropping, setIsCropping] = useState(false);
  const dragStartRef = useRef<{ mx: number; my: number; cx: number; cy: number }>({ mx: 0, my: 0, cx: 0, cy: 0 });
  const resizeStartRef = useRef<{ mx: number; my: number; cw: number; ch: number; cx: number; cy: number }>({
    mx: 0, my: 0, cw: 0, ch: 0, cx: 0, cy: 0,
  });

  // Load image and calculate display size
  useEffect(() => {
    if (!open || !imageUrl) return;

    loadImage(imageUrl).then((img) => {
      setImgNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    }).catch(() => {
      // Fallback — let the img element report size
    });
  }, [open, imageUrl]);

  // Calculate display dimensions and initial crop when the image loads
  const handleImgLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      const container = containerRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const maxW = containerRect.width;
      const maxH = containerRect.height;

      const natW = img.naturalWidth;
      const natH = img.naturalHeight;
      setImgNaturalSize({ w: natW, h: natH });

      // Fit image within container
      const scale = Math.min(maxW / natW, maxH / natH, 1);
      const dw = Math.round(natW * scale);
      const dh = Math.round(natH * scale);
      setDisplaySize({ w: dw, h: dh });

      // Default crop: 80% centered
      const cw = Math.round(dw * 0.8);
      const ch = Math.round(dh * 0.8);
      setCropArea({
        x: Math.round((dw - cw) / 2),
        y: Math.round((dh - ch) / 2),
        width: cw,
        height: ch,
      });
    },
    [],
  );

  // Apply aspect ratio constraint
  const applyAspectRatio = useCallback(
    (preset: AspectPreset) => {
      setAspectPreset(preset);
      const ratio = ASPECT_PRESETS.find((p) => p.value === preset)?.ratio;
      if (!ratio || displaySize.w === 0) return;

      // Recalculate crop area to fit ratio
      let cw = cropArea.width;
      let ch = Math.round(cw / ratio);

      if (ch > displaySize.h) {
        ch = displaySize.h;
        cw = Math.round(ch * ratio);
      }
      if (cw > displaySize.w) {
        cw = displaySize.w;
        ch = Math.round(cw / ratio);
      }

      const cx = clamp(cropArea.x, 0, displaySize.w - cw);
      const cy = clamp(cropArea.y, 0, displaySize.h - ch);

      setCropArea({ x: cx, y: cy, width: cw, height: ch });
    },
    [cropArea, displaySize],
  );

  // --- Dragging (move crop area) ---
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
      dragStartRef.current = { mx: e.clientX, my: e.clientY, cx: cropArea.x, cy: cropArea.y };
    },
    [cropArea],
  );

  // --- Resize handle (bottom-right corner) ---
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);
      resizeStartRef.current = {
        mx: e.clientX,
        my: e.clientY,
        cw: cropArea.width,
        ch: cropArea.height,
        cx: cropArea.x,
        cy: cropArea.y,
      };
    },
    [cropArea],
  );

  // Global mouse move / up handlers
  useEffect(() => {
    if (!isDragging && !isResizing) return;

    function handleMouseMove(e: MouseEvent) {
      if (isDragging) {
        const dx = e.clientX - dragStartRef.current.mx;
        const dy = e.clientY - dragStartRef.current.my;
        setCropArea((prev) => ({
          ...prev,
          x: clamp(dragStartRef.current.cx + dx, 0, displaySize.w - prev.width),
          y: clamp(dragStartRef.current.cy + dy, 0, displaySize.h - prev.height),
        }));
      }

      if (isResizing) {
        const dx = e.clientX - resizeStartRef.current.mx;
        const dy = e.clientY - resizeStartRef.current.my;
        const ratio = ASPECT_PRESETS.find((p) => p.value === aspectPreset)?.ratio;

        let newW = clamp(resizeStartRef.current.cw + dx, 40, displaySize.w - resizeStartRef.current.cx);
        let newH: number;

        if (ratio) {
          newH = Math.round(newW / ratio);
          if (newH > displaySize.h - resizeStartRef.current.cy) {
            newH = displaySize.h - resizeStartRef.current.cy;
            newW = Math.round(newH * ratio);
          }
        } else {
          newH = clamp(resizeStartRef.current.ch + dy, 40, displaySize.h - resizeStartRef.current.cy);
        }

        setCropArea((prev) => ({
          ...prev,
          width: newW,
          height: newH,
        }));
      }
    }

    function handleMouseUp() {
      setIsDragging(false);
      setIsResizing(false);
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, displaySize, aspectPreset]);

  // Perform the actual crop on a canvas
  const handleApplyCrop = useCallback(async () => {
    if (!imgNaturalSize || displaySize.w === 0) return;

    setIsCropping(true);
    try {
      const img = await loadImage(imageUrl);
      const scaleX = imgNaturalSize.w / displaySize.w;
      const scaleY = imgNaturalSize.h / displaySize.h;

      const sx = Math.round(cropArea.x * scaleX);
      const sy = Math.round(cropArea.y * scaleY);
      const sw = Math.round(cropArea.width * scaleX);
      const sh = Math.round(cropArea.height * scaleY);

      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');

      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            onCrop(blob);
          }
          setIsCropping(false);
        },
        'image/png',
        0.92,
      );
    } catch {
      setIsCropping(false);
    }
  }, [imageUrl, imgNaturalSize, displaySize, cropArea, onCrop]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crop className="w-4 h-4" />
            Crop Image
          </DialogTitle>
          <DialogDescription>
            Drag to reposition, resize from the corner handle. Pick an aspect ratio or crop freely.
          </DialogDescription>
        </DialogHeader>

        {/* Aspect ratio presets */}
        <div className="flex items-center gap-1.5">
          {ASPECT_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => applyAspectRatio(preset.value)}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors',
                aspectPreset === preset.value
                  ? 'border-violet-500 bg-violet-500/10 text-violet-600 dark:text-violet-400'
                  : 'border-gray-200 dark:border-white/10 text-gray-500 dark:text-slate-400 hover:border-gray-300 dark:hover:border-white/20',
              )}
            >
              <preset.icon className="w-3 h-3" />
              {preset.label}
            </button>
          ))}
        </div>

        {/* Crop workspace */}
        <div
          ref={containerRef}
          className="relative w-full bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden flex items-center justify-center"
          style={{ height: 360 }}
        >
          {imageUrl && (
            <div className="relative" style={{ width: displaySize.w, height: displaySize.h }}>
              {/* Base image */}
              <img
                src={imageUrl}
                alt="Image to crop"
                className="block select-none"
                style={{ width: displaySize.w, height: displaySize.h }}
                onLoad={handleImgLoad}
                draggable={false}
              />

              {/* Dim overlay (4 rects around the crop area) */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
              />

              {/* Clear crop window */}
              <div
                className="absolute cursor-move"
                style={{
                  left: cropArea.x,
                  top: cropArea.y,
                  width: cropArea.width,
                  height: cropArea.height,
                  boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
                  border: '2px solid rgba(139, 92, 246, 0.8)',
                  backgroundImage: `url(${imageUrl})`,
                  backgroundSize: `${displaySize.w}px ${displaySize.h}px`,
                  backgroundPosition: `-${cropArea.x}px -${cropArea.y}px`,
                  zIndex: 2,
                }}
                onMouseDown={handleDragStart}
              >
                {/* Grid lines (rule of thirds) */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/30" />
                  <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/30" />
                  <div className="absolute top-1/3 left-0 right-0 h-px bg-white/30" />
                  <div className="absolute top-2/3 left-0 right-0 h-px bg-white/30" />
                </div>

                {/* Resize handle (bottom-right) */}
                <div
                  className="absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-violet-500 border-2 border-white rounded-sm cursor-nwse-resize z-10"
                  onMouseDown={handleResizeStart}
                />

                {/* Corner indicators */}
                <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-white/80" />
                <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-white/80" />
                <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-white/80" />
                <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-white/80" />

                {/* Dimensions label */}
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-white bg-black/60 px-1.5 py-0.5 rounded whitespace-nowrap pointer-events-none">
                  {cropArea.width} x {cropArea.height}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="flex gap-2 sm:gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-slate-400 border border-gray-200 dark:border-white/10 rounded-md hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors"
          >
            Skip (use original)
          </button>
          <button
            type="button"
            onClick={handleApplyCrop}
            disabled={isCropping}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md transition-colors',
              isCropping
                ? 'bg-violet-500/50 text-white cursor-wait'
                : 'bg-violet-600 hover:bg-violet-700 text-white',
            )}
          >
            <Crop className="w-3 h-3" />
            {isCropping ? 'Cropping...' : 'Apply Crop'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImageCropModal;
