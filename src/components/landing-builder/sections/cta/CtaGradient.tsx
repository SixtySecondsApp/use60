import React from 'react';
import { SectionWrapper, CtaButton, MicroCopy } from '../shared';
import type { SectionComponentProps } from '../registry';

export function CtaGradient({ section, onSectionClick }: SectionComponentProps) {
  const { copy, style } = section;
  return (
    <SectionWrapper sectionId={section.id} bgColor={style.bg_color} textColor={style.text_color} onClick={onSectionClick}>
      <div
        className="py-20 md:py-28 px-6 relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${style.accent_color}15 0%, ${style.bg_color} 50%, ${style.accent_color}10 100%)` }}
      >
        <div className="hero-orb hero-orb-2" style={{ background: `radial-gradient(circle, ${style.accent_color}20 0%, transparent 70%)` }} />
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">{copy.headline}</h2>
          <p className="text-lg opacity-80 mb-4">{copy.subhead}</p>
          <p className="text-base opacity-60 max-w-xl mx-auto mb-10">{copy.body}</p>
          <div><CtaButton label={copy.cta} accentColor={style.accent_color} /></div>
          <MicroCopy text={copy.micro_copy} />
        </div>
      </div>
    </SectionWrapper>
  );
}
