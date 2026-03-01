import React from 'react';
import { SectionWrapper } from '../shared';
import type { SectionComponentProps } from '../registry';

export function CaseStudy({ section, onSectionClick }: SectionComponentProps) {
  const { copy, style } = section;

  return (
    <SectionWrapper sectionId={section.id} bgColor={style.bg_color} textColor={style.text_color} onClick={onSectionClick}>
      <div className="py-16 md:py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">{copy.headline}</h2>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8 md:p-12">
            <div className="flex items-center gap-4 mb-6">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg text-white"
                style={{ background: `linear-gradient(135deg, ${style.accent_color}, ${style.accent_color}bb)` }}
              >
                {copy.subhead?.[0]?.toUpperCase() ?? 'C'}
              </div>
              <div>
                <div className="font-semibold">{copy.subhead}</div>
              </div>
            </div>
            <blockquote className="text-lg md:text-xl italic opacity-80 leading-relaxed mb-6">
              &ldquo;{copy.body}&rdquo;
            </blockquote>
          </div>
        </div>
      </div>
    </SectionWrapper>
  );
}
