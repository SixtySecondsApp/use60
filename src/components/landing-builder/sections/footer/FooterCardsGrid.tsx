import React from 'react';
import { SectionWrapper } from '../shared';
import type { SectionComponentProps } from '../registry';

export function FooterCardsGrid({ section, onSectionClick }: SectionComponentProps) {
  const { copy, style } = section;
  const columns = copy.body.split('\n').filter(Boolean);

  return (
    <SectionWrapper sectionId={section.id} bgColor={style.bg_color} textColor={style.text_color} onClick={onSectionClick}>
      <div className="py-12 md:py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
            <div>
              <h3 className="text-xl font-bold mb-2">{copy.headline}</h3>
              <p className="text-sm opacity-60">{copy.subhead}</p>
            </div>
            {columns.length >= 2 ? columns.map((line, i) => (
              <div key={i}><p className="text-sm opacity-60">{line}</p></div>
            )) : (
              <div className="text-sm opacity-60">{copy.body}</div>
            )}
          </div>
          <div className="border-t border-black/10 pt-6 text-center text-xs opacity-40">
            &copy; {new Date().getFullYear()} {copy.headline}
          </div>
        </div>
      </div>
    </SectionWrapper>
  );
}
