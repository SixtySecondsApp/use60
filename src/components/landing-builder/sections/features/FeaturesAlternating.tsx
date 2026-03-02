import React from 'react';
import { SectionWrapper, CtaButton } from '../shared';
import type { SectionComponentProps } from '../registry';

export function FeaturesAlternating({ section, onSectionClick }: SectionComponentProps) {
  const { copy, style } = section;
  const items = copy.body.split('\n').filter(Boolean);

  return (
    <SectionWrapper sectionId={section.id} bgColor={style.bg_color} textColor={style.text_color} onClick={onSectionClick}>
      <div className="py-16 md:py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">{copy.headline}</h2>
            <p className="text-lg opacity-80 max-w-2xl mx-auto">{copy.subhead}</p>
          </div>
          {items.length >= 2 ? (
            <div className="space-y-8">
              {items.map((line, i) => {
                const isLeft = i % 2 === 0;
                return (
                  <div key={i} className="grid md:grid-cols-2 gap-8 items-center" style={{ animationDelay: `${i * 150}ms` }}>
                    <div className={isLeft ? '' : 'md:order-2'}>
                      <div className="text-3xl font-bold mb-2 opacity-15" style={{ color: style.accent_color }}>
                        {String(i + 1).padStart(2, '0')}
                      </div>
                      <p className="text-base opacity-80">{line}</p>
                    </div>
                    <div className={isLeft ? 'md:order-2' : ''}>
                      <div className="h-px w-full" style={{ background: `linear-gradient(90deg, transparent, ${style.accent_color}30, transparent)` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-base opacity-60 max-w-xl mx-auto text-center">{copy.body}</p>
          )}
          {copy.cta && <div className="text-center mt-12"><CtaButton label={copy.cta} accentColor={style.accent_color} /></div>}
        </div>
      </div>
    </SectionWrapper>
  );
}
