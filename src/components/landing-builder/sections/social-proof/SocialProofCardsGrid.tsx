import React from 'react';
import { SectionWrapper } from '../shared';
import type { SectionComponentProps } from '../registry';

export function SocialProofCardsGrid({ section, onSectionClick }: SectionComponentProps) {
  const { copy, style } = section;
  const testimonials = copy.body.split('\n').filter(Boolean);

  return (
    <SectionWrapper sectionId={section.id} bgColor={style.bg_color} textColor={style.text_color} onClick={onSectionClick}>
      <div className="py-16 md:py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">{copy.headline}</h2>
            <p className="text-lg opacity-80 max-w-2xl mx-auto">{copy.subhead}</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {testimonials.length >= 2 ? testimonials.map((line, i) => (
              <div key={i} className="p-6 rounded-2xl bg-white/60 shadow-sm border border-black/5 hover-lift" style={{ animationDelay: `${i * 100}ms` }}>
                <div className="text-lg mb-3 opacity-40">&ldquo;</div>
                <p className="text-base opacity-80 italic mb-4">{line}</p>
                <div className="h-px bg-black/10 mb-3" />
                <p className="text-sm font-medium opacity-60">Customer</p>
              </div>
            )) : (
              <div className="col-span-full text-center text-base opacity-70 italic">&ldquo;{copy.body}&rdquo;</div>
            )}
          </div>
        </div>
      </div>
    </SectionWrapper>
  );
}
