import React from 'react';
import { SectionWrapper } from '../shared';
import type { SectionComponentProps } from '../registry';

export function ReviewBadges({ section, onSectionClick }: SectionComponentProps) {
  const { copy, style } = section;
  const reviews = copy.body.split('\n').filter(Boolean);

  return (
    <SectionWrapper sectionId={section.id} bgColor={style.bg_color} textColor={style.text_color} onClick={onSectionClick}>
      <div className="py-12 md:py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-10">{copy.headline}</h2>
          <div className="flex flex-wrap justify-center gap-6">
            {reviews.length >= 2 ? reviews.map((line, i) => {
              const [platform, rating] = line.split('|').map(s => s.trim());
              const stars = parseFloat(rating) || 5;
              return (
                <div key={i} className="flex flex-col items-center gap-2 px-6 py-4 rounded-xl bg-white/5 border border-white/10 hover-lift">
                  <span className="text-sm font-semibold opacity-70">{platform || line}</span>
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, si) => (
                      <span key={si} className="text-lg" style={{ color: si < stars ? style.accent_color : `${style.text_color}30` }}>
                        &#9733;
                      </span>
                    ))}
                  </div>
                  {rating && <span className="text-xs opacity-50">{rating}</span>}
                </div>
              );
            }) : (
              <span className="text-base opacity-60">{copy.body}</span>
            )}
          </div>
        </div>
      </div>
    </SectionWrapper>
  );
}
