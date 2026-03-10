/**
 * Template Gallery — full-screen modal for browsing and selecting
 * pre-built landing page templates.
 *
 * US-019: Gallery UI with category filtering and template cards.
 */

import React, { useState } from 'react';
import { Layout, X, Check, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LANDING_TEMPLATES, type LandingTemplate, type TemplateCategory } from './templates';

interface TemplateGalleryProps {
  onSelect: (template: LandingTemplate) => void;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<'all' | TemplateCategory, string> = {
  all: 'All',
  saas: 'SaaS',
  agency: 'Agency',
  product: 'Product',
  event: 'Event',
  waitlist: 'Waitlist',
  portfolio: 'Portfolio',
};

const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS) as Array<'all' | TemplateCategory>;

export const TemplateGallery: React.FC<TemplateGalleryProps> = ({ onSelect, onClose }) => {
  const [activeCategory, setActiveCategory] = useState<'all' | TemplateCategory>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered =
    activeCategory === 'all'
      ? LANDING_TEMPLATES
      : LANDING_TEMPLATES.filter((t) => t.category === activeCategory);

  const handleConfirm = () => {
    const template = LANDING_TEMPLATES.find((t) => t.id === selectedId);
    if (template) onSelect(template);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-5xl mx-4 max-h-[90vh] flex flex-col rounded-2xl border border-white/10 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <Layout className="w-5 h-5 text-violet-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Choose a Template
              </h2>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Pre-built pages with sections, copy, and brand config
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-slate-400" />
          </button>
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 px-6 py-3 border-b border-gray-200 dark:border-white/10 overflow-x-auto">
          {CATEGORY_KEYS.map((key) => (
            <button
              key={key}
              onClick={() => setActiveCategory(key)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
                activeCategory === key
                  ? 'bg-violet-500 text-white'
                  : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-white/10'
              )}
            >
              {CATEGORY_LABELS[key]}
            </button>
          ))}
        </div>

        {/* Template Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((template) => {
              const isSelected = selectedId === template.id;

              return (
                <button
                  key={template.id}
                  onClick={() => setSelectedId(isSelected ? null : template.id)}
                  className={cn(
                    'group relative text-left rounded-xl border transition-all',
                    'bg-white dark:bg-white/[0.03] backdrop-blur-xl',
                    isSelected
                      ? 'border-violet-500 ring-2 ring-violet-500/30 scale-[1.02]'
                      : 'border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20 hover:scale-[1.01]',
                    'hover:shadow-lg dark:hover:shadow-violet-500/5'
                  )}
                >
                  {/* Color band header */}
                  <div
                    className="h-20 rounded-t-xl relative overflow-hidden"
                    style={{
                      background: `linear-gradient(135deg, ${template.brandConfig.primary_color}, ${template.brandConfig.secondary_color})`,
                    }}
                  >
                    {/* Section count badge */}
                    <div className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/30 backdrop-blur-sm text-white/90 text-[10px] font-medium">
                      <Layers className="w-3 h-3" />
                      {template.sectionCount} sections
                    </div>

                    {/* Selected check */}
                    {isSelected && (
                      <div className="absolute top-2.5 left-2.5 w-6 h-6 rounded-full bg-violet-500 flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 text-white" />
                      </div>
                    )}
                  </div>

                  {/* Card body */}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                        {template.name}
                      </h3>
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide flex-shrink-0',
                          'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-slate-400'
                        )}
                      >
                        {template.category}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed line-clamp-2">
                      {template.description}
                    </p>

                    {/* Section type pills */}
                    <div className="flex flex-wrap gap-1 mt-3">
                      {template.sections.map((s) => (
                        <span
                          key={s.id}
                          className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-slate-500"
                        >
                          {s.type}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-400 dark:text-slate-500 text-sm">
              No templates in this category yet.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.02]">
          <p className="text-xs text-gray-400 dark:text-slate-500">
            {selectedId
              ? `Selected: ${LANDING_TEMPLATES.find((t) => t.id === selectedId)?.name}`
              : 'Click a template to select it'}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedId}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                selectedId
                  ? 'bg-violet-500 text-white hover:bg-violet-600'
                  : 'bg-gray-200 dark:bg-white/5 text-gray-400 dark:text-slate-500 cursor-not-allowed'
              )}
            >
              Use This Template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
