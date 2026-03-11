/**
 * SeoSettingsPanel — Side sheet for managing SEO metadata and analytics tracking.
 *
 * Two tabs:
 *   1. SEO — title, description, keywords, OG image preview
 *   2. Analytics — GTM, Facebook Pixel, custom head scripts
 *
 * Auto-saves on blur (debounced) via the onUpdate callback.
 * Covers US-022.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Search,
  BarChart3,
  X,
  Image as ImageIcon,
  Tag,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { SeoConfig } from './types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SeoSettingsPanelProps {
  open: boolean;
  onClose: () => void;
  seoConfig: SeoConfig;
  onUpdate: (config: SeoConfig) => void;
}

// ---------------------------------------------------------------------------
// Character counter helper
// ---------------------------------------------------------------------------

function CharCount({ current, max }: { current: number; max: number }) {
  const isOver = current > max;
  return (
    <span
      className={cn(
        'text-[11px] tabular-nums',
        isOver ? 'text-red-500' : current > max * 0.9 ? 'text-amber-500' : 'text-gray-400 dark:text-slate-500',
      )}
    >
      {current}/{max}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Keywords input (comma-separated, rendered as tags)
// ---------------------------------------------------------------------------

function KeywordsInput({
  keywords,
  onChange,
}: {
  keywords: string[];
  onChange: (keywords: string[]) => void;
}) {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if ((e.key === 'Enter' || e.key === ',') && inputValue.trim()) {
        e.preventDefault();
        const newKeyword = inputValue.trim().replace(/,/g, '');
        if (newKeyword && !keywords.includes(newKeyword)) {
          onChange([...keywords, newKeyword]);
        }
        setInputValue('');
      }
      if (e.key === 'Backspace' && !inputValue && keywords.length > 0) {
        onChange(keywords.slice(0, -1));
      }
    },
    [inputValue, keywords, onChange],
  );

  const handleRemove = useCallback(
    (keyword: string) => {
      onChange(keywords.filter((k) => k !== keyword));
    },
    [keywords, onChange],
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {keywords.map((kw) => (
          <Badge
            key={kw}
            variant="secondary"
            className="gap-1 pr-1 text-xs"
          >
            {kw}
            <button
              type="button"
              onClick={() => handleRemove(kw)}
              className="ml-0.5 hover:text-red-500 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </Badge>
        ))}
      </div>
      <Input
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a keyword and press Enter"
        className="text-sm"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SeoSettingsPanel: React.FC<SeoSettingsPanelProps> = ({
  open,
  onClose,
  seoConfig,
  onUpdate,
}) => {
  // Local draft state — synced to parent on blur (debounced)
  const [draft, setDraft] = useState<SeoConfig>(seoConfig);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync incoming config when it changes externally
  useEffect(() => {
    setDraft(seoConfig);
  }, [seoConfig]);

  // Debounced auto-save on blur
  const flushUpdate = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onUpdate(draft);
    }, 400);
  }, [draft, onUpdate]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Field updaters
  const updateField = useCallback(
    <K extends keyof SeoConfig>(field: K, value: SeoConfig[K]) => {
      setDraft((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="!top-16 !h-[calc(100vh-4rem)] w-[400px] sm:w-[440px] p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-gray-200 dark:border-white/5">
          <SheetTitle className="text-base font-semibold">Page Settings</SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="seo" className="flex-1 flex flex-col min-h-0">
          <div className="px-5 pt-3">
            <TabsList className="w-full">
              <TabsTrigger value="seo" className="flex-1 gap-1.5">
                <Search className="w-3.5 h-3.5" />
                SEO
              </TabsTrigger>
              <TabsTrigger value="analytics" className="flex-1 gap-1.5">
                <BarChart3 className="w-3.5 h-3.5" />
                Analytics
              </TabsTrigger>
            </TabsList>
          </div>

          {/* --- SEO Tab --- */}
          <TabsContent value="seo" className="flex-1 overflow-y-auto px-5 pb-5 mt-0">
            <div className="space-y-5 pt-4">
              {/* Title */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Page Title
                  </label>
                  <CharCount current={draft.title.length} max={60} />
                </div>
                <Input
                  value={draft.title}
                  onChange={(e) => updateField('title', e.target.value)}
                  onBlur={flushUpdate}
                  placeholder="Your page title"
                  className="text-sm"
                  maxLength={80}
                />
                <p className="text-[11px] text-gray-400 dark:text-slate-500">
                  Appears in browser tab and search results. Keep under 60 characters.
                </p>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Meta Description
                  </label>
                  <CharCount current={draft.description.length} max={160} />
                </div>
                <Textarea
                  value={draft.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  onBlur={flushUpdate}
                  placeholder="A brief description of your page for search engines"
                  className="text-sm min-h-[72px] resize-none"
                  maxLength={200}
                />
              </div>

              {/* Keywords */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" />
                  Keywords
                </label>
                <KeywordsInput
                  keywords={draft.keywords ?? []}
                  onChange={(keywords) => {
                    updateField('keywords', keywords);
                    // Flush immediately on keyword add/remove
                    onUpdate({ ...draft, keywords });
                  }}
                />
              </div>

              {/* Canonical URL */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Canonical URL
                </label>
                <Input
                  value={draft.canonical_url ?? ''}
                  onChange={(e) => updateField('canonical_url', e.target.value || undefined)}
                  onBlur={flushUpdate}
                  placeholder="https://yoursite.com/page"
                  className="text-sm"
                />
                <p className="text-[11px] text-gray-400 dark:text-slate-500">
                  Set if this page is accessible at multiple URLs.
                </p>
              </div>

              {/* OG Image */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5" />
                  Social Preview Image
                </label>
                {draft.og_image_url ? (
                  <div className="space-y-2">
                    <div className="relative rounded-lg overflow-hidden border border-gray-200 dark:border-white/10">
                      <img
                        src={draft.og_image_url}
                        alt="OG preview"
                        className="w-full h-auto aspect-[1200/630] object-cover"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        updateField('og_image_url', undefined);
                        onUpdate({ ...draft, og_image_url: undefined });
                      }}
                      className="text-xs text-red-500 hover:text-red-600 transition-colors"
                    >
                      Remove image
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-white/[0.03] border border-dashed border-gray-300 dark:border-white/10">
                    <ImageIcon className="w-8 h-8 text-gray-300 dark:text-slate-600" />
                    <div>
                      <p className="text-xs text-gray-500 dark:text-slate-400">
                        Auto-generate on publish
                      </p>
                      <p className="text-[11px] text-gray-400 dark:text-slate-500">
                        A branded 1200x630 image will be created from your headline.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* --- Analytics Tab --- */}
          <TabsContent value="analytics" className="flex-1 overflow-y-auto px-5 pb-5 mt-0">
            <div className="space-y-5 pt-4">
              {/* GTM */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Google Tag Manager Container ID
                </label>
                <Input
                  value={draft.gtm_id ?? ''}
                  onChange={(e) => updateField('gtm_id', e.target.value || undefined)}
                  onBlur={flushUpdate}
                  placeholder="GTM-XXXXXX"
                  className="text-sm font-mono"
                />
                <p className="text-[11px] text-gray-400 dark:text-slate-500">
                  Adds GTM script to the page head and noscript to body.
                </p>
              </div>

              {/* Facebook Pixel */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Facebook Pixel ID
                </label>
                <Input
                  value={draft.facebook_pixel_id ?? ''}
                  onChange={(e) => updateField('facebook_pixel_id', e.target.value || undefined)}
                  onBlur={flushUpdate}
                  placeholder="123456789"
                  className="text-sm font-mono"
                />
                <p className="text-[11px] text-gray-400 dark:text-slate-500">
                  Tracks page views and enables Facebook ad targeting.
                </p>
              </div>

              {/* Custom Head Scripts */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Custom Head Scripts
                </label>
                <Textarea
                  value={draft.custom_head_script ?? ''}
                  onChange={(e) => updateField('custom_head_script', e.target.value || undefined)}
                  onBlur={flushUpdate}
                  placeholder="<!-- Paste tracking scripts here -->"
                  className="text-sm font-mono min-h-[120px] resize-y"
                />
                <p className="text-[11px] text-gray-400 dark:text-slate-500">
                  Raw HTML/JS injected into the page &lt;head&gt;. Use for analytics, chat widgets, etc.
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
};

export default SeoSettingsPanel;
