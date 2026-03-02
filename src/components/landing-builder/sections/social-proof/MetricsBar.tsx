import React from 'react';
import { SectionWrapper, ContentBlockRenderer } from '../shared';
import type { SectionComponentProps } from '../registry';

export function MetricsBar({ section, onSectionClick }: SectionComponentProps) {
  const { copy, style } = section;
  const lines = copy.body.split('\n').filter(Boolean);

  // Parse lines as "value | label" pairs
  const stats = lines.map((line) => {
    const [value, label] = line.split('|').map(s => s.trim());
    return { value: value || line, label: label || '' };
  });

  return (
    <SectionWrapper sectionId={section.id} bgColor={style.bg_color} textColor={style.text_color} onClick={onSectionClick}>
      <div className="py-12 md:py-16 px-6">
        <div className="max-w-5xl mx-auto">
          {copy.headline && (
            <h2 className="text-2xl md:text-3xl font-bold text-center mb-10">{copy.headline}</h2>
          )}
          {section.content_blocks?.length ? (
            <ContentBlockRenderer blocks={section.content_blocks} accentColor={style.accent_color} />
          ) : (
            <div className={`grid grid-cols-2 md:grid-cols-${Math.min(stats.length, 4)} gap-8`}>
              {stats.map((stat, i) => (
                <div key={i} className="text-center animate-counter" style={{ animationDelay: `${i * 150}ms` }}>
                  <div className="text-3xl md:text-4xl font-bold mb-1" style={{ color: style.accent_color }}>
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
