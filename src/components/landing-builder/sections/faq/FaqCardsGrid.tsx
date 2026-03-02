import React from 'react';
import { SectionWrapper, CtaButton } from '../shared';
import type { SectionComponentProps } from '../registry';

export function FaqCardsGrid({ section, onSectionClick }: SectionComponentProps) {
  const { copy, style } = section;
  const items = copy.body.split('\n').filter(Boolean);

  return (
    <SectionWrapper sectionId={section.id} bgColor={style.bg_color} textColor={style.text_color} onClick={onSectionClick}>
      <div className="py-16 md:py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">{copy.headline}</h2>
            <p className="text-lg opacity-80">{copy.subhead}</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.length >= 2 ? items.map((line, i) => {
              const [q, a] = line.split('|').map(s => s.trim());
              return (
                <div key={i} className="p-6 rounded-2xl bg-white/60 shadow-sm border border-black/5 hover-lift" style={{ animationDelay: `${i * 100}ms` }}>
                  <h3 className="text-base font-semibold mb-2">{q || line}</h3>
                  {a && <p className="text-sm opacity-60">{a}</p>}
                </div>
              );
            }) : (
              <div className="col-span-full text-base opacity-60">{copy.body}</div>
            )}
          </div>
          {copy.cta && <div className="text-center mt-12"><CtaButton label={copy.cta} accentColor={style.accent_color} /></div>}
        </div>
      </div>
    </SectionWrapper>
  );
}
