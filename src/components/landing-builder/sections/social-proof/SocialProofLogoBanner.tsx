import React from 'react';
import { SectionWrapper } from '../shared';
import type { SectionComponentProps } from '../registry';

export function SocialProofLogoBanner({ section, onSectionClick }: SectionComponentProps) {
  const { copy, style } = section;
  const items = copy.body.split('\n').filter(Boolean);

  return (
    <SectionWrapper sectionId={section.id} bgColor={style.bg_color} textColor={style.text_color} onClick={onSectionClick}>
      <div className="py-10 md:py-14 px-6">
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-sm font-medium opacity-40 mb-8 tracking-widest uppercase">{copy.headline}</p>
          <div className="flex flex-wrap justify-center items-center gap-4 md:gap-8">
            {items.length >= 2 ? items.map((line, i) => (
              <div key={i} className="flex items-center justify-center px-6 py-3 opacity-50 hover:opacity-80 transition-opacity">
                <span className="text-sm font-semibold tracking-wider uppercase whitespace-nowrap">{line}</span>
              </div>
            )) : (
              <span className="text-sm opacity-50">{copy.body}</span>
            )}
          </div>
        </div>
      </div>
    </SectionWrapper>
  );
}
