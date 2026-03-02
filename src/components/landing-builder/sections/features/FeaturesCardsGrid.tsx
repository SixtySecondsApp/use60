import React from 'react';
import { SectionWrapper, CtaButton, AssetSlot, ContentBlockRenderer } from '../shared';
import type { SectionComponentProps } from '../registry';

export function FeaturesCardsGrid({ section, onSectionClick }: SectionComponentProps) {
  const { copy, style } = section;
  const lines = copy.body.split('\n').filter(Boolean);

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
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {lines.length >= 2 ? lines.map((line, i) => (
                <div
                  key={i}
                  className="p-6 rounded-2xl bg-white/60 shadow-sm border border-black/5 hover-lift"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className="text-2xl font-bold mb-2" style={{ color: style.accent_color }}>
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <p className="text-base opacity-80">{line}</p>
                </div>
              )) : (
                <div className="col-span-full text-base opacity-70">{copy.body}</div>
              )}
            </div>
          )}
          <AssetSlot
            strategy={section.asset_strategy}
            imageUrl={section.image_url} imageStatus={section.image_status}
            svgCode={section.svg_code} svgStatus={section.svg_status}
            iconName={section.icon_name} accentColor={style.accent_color}
            alt={copy.headline} className="mt-12 max-w-md mx-auto"
          />
          {copy.cta && <div className="text-center mt-12"><CtaButton label={copy.cta} accentColor={style.accent_color} /></div>}
        </div>
      </div>
    </SectionWrapper>
  );
}
