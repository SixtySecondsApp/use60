import React from 'react';
import { SectionWrapper, ContentBlockRenderer } from '../shared';
import type { SectionComponentProps } from '../registry';

export function StatsCentered({ section, onSectionClick }: SectionComponentProps) {
  const { copy, style } = section;
  const lines = copy.body.split('\n').filter(Boolean);

  const stats = lines.map((line) => {
    const [value, label] = line.split('|').map(s => s.trim());
    return { value: value || line, label: label || '' };
  });

  return (
    <SectionWrapper sectionId={section.id} bgColor={style.bg_color} textColor={style.text_color} onClick={onSectionClick}>
      <div className="py-16 md:py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">{copy.headline}</h2>
            <p className="text-lg opacity-80 max-w-2xl mx-auto">{copy.subhead}</p>
          </div>
          {section.content_blocks?.length ? (
            <ContentBlockRenderer blocks={section.content_blocks} accentColor={style.accent_color} />
          ) : (
            <div className={`grid grid-cols-2 md:grid-cols-${Math.min(stats.length, 4)} gap-8`}>
              {stats.map((stat, i) => (
                <div key={i} className="text-center animate-counter" style={{ animationDelay: `${i * 150}ms` }}>
                  <div className="text-4xl md:text-5xl font-bold mb-2" style={{ color: style.accent_color }}>
                    {stat.value}
                  </div>
                  <div className="text-sm opacity-60">{stat.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </SectionWrapper>
  );
}
