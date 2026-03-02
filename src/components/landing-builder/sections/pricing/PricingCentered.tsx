import React from 'react';
import { SectionWrapper, CtaButton, ContentBlockRenderer } from '../shared';
import type { SectionComponentProps } from '../registry';

export function PricingCentered({ section, onSectionClick }: SectionComponentProps) {
  const { copy, style } = section;
  const tiers = copy.body.split('\n').filter(Boolean);

  return (
    <SectionWrapper sectionId={section.id} bgColor={style.bg_color} textColor={style.text_color} onClick={onSectionClick}>
      <div className="py-16 md:py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">{copy.headline}</h2>
            <p className="text-lg opacity-80 max-w-2xl mx-auto">{copy.subhead}</p>
          </div>
          {section.content_blocks?.length ? (
            <ContentBlockRenderer blocks={section.content_blocks} accentColor={style.accent_color} />
          ) : (
            <div className={`grid md:grid-cols-${Math.min(tiers.length || 3, 3)} gap-6`}>
              {tiers.length >= 2 ? tiers.map((tier, i) => {
                const [name, price, ...features] = tier.split('|').map(s => s.trim());
                const isHighlighted = i === 1; // Middle tier recommended
                return (
                  <div
                    key={i}
                    className={`relative p-8 rounded-2xl border hover-lift ${
                      isHighlighted
                        ? 'border-2 shadow-lg scale-105'
                        : 'border-white/10'
                    }`}
                    style={isHighlighted ? { borderColor: style.accent_color } : {}}
                  >
                    {isHighlighted && (
                      <div
                        className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-semibold text-white"
                        style={{ backgroundColor: style.accent_color }}
                      >
                        Recommended
                      </div>
                    )}
                    <h3 className="text-xl font-bold mb-2">{name || `Tier ${i + 1}`}</h3>
                    <div className="text-3xl font-bold mb-4" style={{ color: style.accent_color }}>
                      {price || 'Contact us'}
                    </div>
                    {features.length > 0 && (
                      <ul className="space-y-2 mb-8">
                        {features.map((f, fi) => (
                          <li key={fi} className="flex items-center gap-2 text-sm opacity-70">
                            <span style={{ color: style.accent_color }}>&#10003;</span>
                            {f}
                          </li>
                        ))}
                      </ul>
                    )}
                    <CtaButton label={copy.cta || 'Get Started'} accentColor={style.accent_color} />
                  </div>
                );
              }) : (
                <div className="col-span-full text-center text-base opacity-60">{copy.body}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </SectionWrapper>
  );
}
