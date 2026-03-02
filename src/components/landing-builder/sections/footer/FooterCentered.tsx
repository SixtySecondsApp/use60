import React from 'react';
import { SectionWrapper, CtaButton } from '../shared';
import type { SectionComponentProps } from '../registry';

export function FooterCentered({ section, onSectionClick }: SectionComponentProps) {
  const { copy, style } = section;
  return (
    <SectionWrapper sectionId={section.id} bgColor={style.bg_color} textColor={style.text_color} onClick={onSectionClick}>
      <div className="py-12 md:py-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h3 className="text-xl font-bold mb-2">{copy.headline}</h3>
          <p className="text-sm opacity-60 mb-4">{copy.subhead}</p>
          <p className="text-xs opacity-40">{copy.body}</p>
          {copy.cta && <div className="mt-6"><CtaButton label={copy.cta} accentColor={style.accent_color} /></div>}
        </div>
      </div>
    </SectionWrapper>
  );
}
