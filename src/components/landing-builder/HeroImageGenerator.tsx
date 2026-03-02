/**
 * HeroImageGenerator — Generate hero images using Nano Banana 2 (Gemini)
 *
 * Shown during the Visuals phase. Detects hero image description
 * from AI output, lets user generate multiple style variations,
 * and select their preferred one.
 */

import React, { useState, useCallback } from 'react';
import { ImageIcon, Loader2, RefreshCw, Download, Plus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { nanoBananaService } from '@/lib/services/nanoBananaService';
import { toast } from 'sonner';

interface GeneratedImage {
  url: string;
  style: string;
}

interface HeroImageGeneratorProps {
  /** Description of the hero image from AI output */
  description: string;
  /** Brand color hex codes to include in prompt */
  brandColors?: string[];
  /** Callback when an image is selected */
  onSelected?: (imageUrl: string) => void;
}

const STYLE_PRESETS = [
  { id: 'cinematic', label: 'Cinematic', suffix: 'Cinematic lighting, dramatic depth of field, moody atmosphere.' },
  { id: 'minimal', label: 'Minimal', suffix: 'Clean, minimalist composition. Lots of negative space. Modern.' },
  { id: '3d-render', label: '3D Render', suffix: '3D rendered with glass morphism elements, soft gradients, isometric perspective.' },
  { id: 'photorealistic', label: 'Photorealistic', suffix: 'Ultra-realistic photography. Natural lighting. Professional studio quality.' },
] as const;

export const HeroImageGenerator: React.FC<HeroImageGeneratorProps> = ({
  description,
  brandColors,
  onSelected,
}) => {
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeStyle, setActiveStyle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [styleErrors, setStyleErrors] = useState<Record<string, string>>({});

  const buildPrompt = useCallback((styleId: string) => {
    const style = STYLE_PRESETS.find(s => s.id === styleId);
    let prompt = description;
    if (style) prompt += `\n${style.suffix}`;
    if (brandColors && brandColors.length > 0) {
      prompt += `\nColor palette: ${brandColors.join(', ')}.`;
    }
    prompt += '\nClean, high-end SaaS aesthetic. No text, no watermarks, no logos.';
    return prompt;
  }, [description, brandColors]);

  const handleGenerate = useCallback(async (styleId: string) => {
    setIsGenerating(true);
    setActiveStyle(styleId);
    setError(null);

    try {
      const result = await nanoBananaService.generateImage({
        prompt: buildPrompt(styleId),
        aspect_ratio: 'landscape',
        num_images: 1,
      });

      if (!result.images || result.images.length === 0) {
        throw new Error('No images returned');
      }

      const newImage: GeneratedImage = {
        url: result.images[0],
        style: STYLE_PRESETS.find(s => s.id === styleId)?.label || styleId,
      };

      setImages(prev => [...prev, newImage]);
      // Auto-select if first image
      if (images.length === 0) {
        setSelectedIdx(0);
        onSelected?.(newImage.url);
      }
    } catch (err: any) {
      const msg = err.message || 'Failed to generate image';
      setError(msg);
      setStyleErrors(prev => ({ ...prev, [styleId]: msg }));
      if (msg.includes('API key') || msg.includes('openrouter') || msg.includes('not configured')) {
        toast.error('Configure your OpenRouter API key in Settings > AI Provider Settings');
      } else {
        toast.error(msg);
      }
    } finally {
      setIsGenerating(false);
      setActiveStyle(null);
    }
  }, [buildPrompt, images.length, onSelected]);

  const handleSelect = useCallback((idx: number) => {
    setSelectedIdx(idx);
    onSelected?.(images[idx].url);
  }, [images, onSelected]);

  return (
    <div className="my-4 rounded-xl border border-gray-700/50 overflow-hidden bg-gray-900/40">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-medium text-gray-200">Hero Image</span>
        </div>
        {images.length > 0 && (
          <span className="text-xs text-gray-500">
            {selectedIdx !== null ? `Selected: ${images[selectedIdx].style}` : 'Click to select'}
          </span>
        )}
      </div>

      {/* Description preview */}
      <div className="px-4 py-2 border-b border-gray-800/50">
        <p className="text-[11px] text-gray-500 line-clamp-2">{description}</p>
      </div>

      {/* Style preset buttons */}
      <div className="px-4 py-3 border-b border-gray-800/50">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-2">
          Generate in style:
        </p>
        <div className="flex flex-wrap gap-2">
          {STYLE_PRESETS.map((style) => {
            const isActive = activeStyle === style.id && isGenerating;
            const hasImage = images.some(img => img.style === style.label);
            const styleError = styleErrors[style.id];
            return (
              <div key={style.id} className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => handleGenerate(style.id)}
                  disabled={isGenerating}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                    'border focus:outline-none focus:ring-2 focus:ring-violet-500/40',
                    isActive
                      ? 'bg-violet-500/20 text-violet-300 border-violet-500/40'
                      : styleError && !hasImage
                        ? 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
                        : hasImage
                          ? 'bg-gray-800/60 text-gray-300 border-gray-600/40 hover:bg-gray-800'
                          : 'bg-gray-800/40 text-gray-400 border-gray-700/40 hover:bg-gray-800/60 hover:text-gray-300',
                    isGenerating && !isActive && 'opacity-40 cursor-not-allowed',
                  )}
                >
                  {isActive ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : styleError && !hasImage ? (
                    <RefreshCw className="w-3 h-3" />
                  ) : hasImage ? (
                    <RefreshCw className="w-3 h-3" />
                  ) : (
                    <Plus className="w-3 h-3" />
                  )}
                  {style.label}
                </button>
                {styleError && !hasImage && !isGenerating && (
                  <span className="text-[10px] text-red-400 px-1 leading-tight">
                    {styleError.includes('quota') ? 'API quota exceeded' : styleError.includes('timeout') ? 'Request timed out' : 'Failed — click to retry'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Generated images grid */}
      {images.length > 0 && (
        <div className="p-3">
          <div className={cn(
            'grid gap-3',
            images.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
          )}>
            {images.map((img, idx) => (
              <button
                key={`${img.style}-${idx}`}
                type="button"
                onClick={() => handleSelect(idx)}
                className={cn(
                  'relative rounded-lg overflow-hidden border-2 transition-all group',
                  selectedIdx === idx
                    ? 'border-violet-500 ring-2 ring-violet-500/20'
                    : 'border-gray-700/50 hover:border-gray-600',
                )}
              >
                <img
                  src={img.url}
                  alt={`Hero - ${img.style}`}
                  className="w-full aspect-video object-cover"
                />
                {/* Style label */}
                <div className={cn(
                  'absolute bottom-0 inset-x-0 px-3 py-2 bg-gradient-to-t from-black/80 to-transparent',
                  'flex items-center justify-between',
                )}>
                  <span className="text-[11px] font-medium text-white/90">{img.style}</span>
                  {selectedIdx === idx && (
                    <Check className="w-4 h-4 text-violet-400" />
                  )}
                </div>
                {/* Download */}
                <a
                  href={img.url}
                  download={`hero-${img.style.toLowerCase()}.png`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="absolute top-2 right-2 p-1.5 rounded-md bg-black/50 text-white/70 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Download className="w-3 h-3" />
                </a>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading state */}
      {isGenerating && (
        <div className="flex items-center gap-3 px-4 py-4 border-t border-gray-800/50">
          <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
          <div>
            <p className="text-sm text-gray-300">Generating {activeStyle} style...</p>
            <p className="text-[11px] text-gray-600">This takes 15-30 seconds</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !isGenerating && (
        <div className="px-4 py-2 border-t border-red-500/20">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Empty state */}
      {images.length === 0 && !isGenerating && (
        <div className="px-4 py-4 text-center">
          <p className="text-xs text-gray-600">Click a style above to generate your hero image</p>
        </div>
      )}
    </div>
  );
};

/**
 * Extract hero image description and brand colors from AI visuals output.
 */
export function parseVisualsForImage(content: string): {
  heroDescription: string | null;
  brandColors: string[];
} {
  let heroDescription: string | null = null;

  // Match the hero image section - various heading formats
  const heroPatterns = [
    /(?:#{1,4}\s*)?(?:\d+\.\s*)?Hero Image(?:\s+Concept)?[^\n]*\n([\s\S]*?)(?=\n(?:#{1,4}\s|\d+\.\s*(?:SVG|Icon|Typography|Color))|$)/i,
    /\*\*(?:\d+\.\s*)?Hero Image(?:\s+Concept)?\*\*[^\n]*\n([\s\S]*?)(?=\n\*\*\d|$)/i,
  ];

  for (const pattern of heroPatterns) {
    const match = content.match(pattern);
    if (match) {
      heroDescription = match[1]
        .replace(/^\*\*.*?\*\*\s*/gm, '')
        .replace(/^[-*]\s*/gm, '')
        .trim()
        .split('\n')
        .filter(l => l.trim())
        .join(' ')
        .slice(0, 600);
      break;
    }
  }

  // Extract hex colors
  const brandColors: string[] = [];
  const colorMatches = content.matchAll(/`(#[0-9A-Fa-f]{3,8})`/g);
  for (const match of colorMatches) {
    if (!brandColors.includes(match[1])) {
      brandColors.push(match[1]);
    }
  }

  return { heroDescription, brandColors };
}
