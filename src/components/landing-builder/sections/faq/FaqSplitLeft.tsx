import React from 'react';
import { SectionWrapper } from '../shared';
import type { SectionComponentProps } from '../registry';

export function FaqSplitLeft({ section, onSectionClick }: SectionComponentProps) {
  const { copy, style } = section;
  const items = copy.body.split('\n').filter(Boolean);

  return (
    <SectionWrapper sectionId={section.id} bgColor={style.bg_color} textColor={style.text_color} onClick={onSectionClick}>
      <div className="py-16 md:py-24 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-5 gap-12">
          <div className="md:col-span-2">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 md:sticky md:top-8">{copy.headline}</h2>
            <p className="text-lg opacity-80">{copy.subhead}</p>
          </div>
          <div className="md:col-span-3">
            {items.map((line, i) => {
              const [q, a] = line.split('|').map(s => s.trim());
              return (
                <details key={i} className="group border-b border-black/10">
                  <summary className="flex items-center justify-between py-5 cursor-pointer text-lg font-medium hover:opacity-80 transition-opacity">
                    <span>{q || line}</span>
                    <span className="ml-4 shrink-0 text-xl opacity-40 group-open:rotate-45 transition-transform duration-200">+</span>
                  </summary>
                  <div className="pb-5 text-base opacity-60">{a || ''}</div>
                </details>
              );
            })}
          </div>
        </div>
      </div>
    </SectionWrapper>
  );
}
