import React from 'react';
import { SectionWrapper, CtaButton, AssetSlot, MicroCopy } from '../shared';
import type { SectionComponentProps } from '../registry';

export function HeroCentered({ section, onSectionClick }: SectionComponentProps) {
  const { copy, style } = section;
  return (
    <SectionWrapper sectionId={section.id} bgColor={style.bg_color} textColor={style.text_color} onClick={onSectionClick}>
      <div className="relative py-20 md:py-32 px-6 overflow-hidden">
        <div className="hero-orb hero-orb-1" style={{ background: `radial-gradient(circle, ${style.accent_color}30 0%, transparent 70%)` }} />
        <div className="hero-orb hero-orb-2" style={{ background: `radial-gradient(circle, ${style.accent_color}20 0%, transparent 70%)` }} />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold leading-tight mb-6">{copy.headline}</h1>
          <p className="text-lg md:text-xl opacity-80 max-w-2xl mx-auto mb-4">{copy.subhead}</p>
          <p className="text-base opacity-60 max-w-xl mx-auto mb-10">{copy.body}</p>
          <div className="mb-4"><CtaButton label={copy.cta} accentColor={style.accent_color} /></div>
          <MicroCopy text={copy.micro_copy} />
          <AssetSlot
            strategy={section.asset_strategy}
            imageUrl={section.image_url}
            imageStatus={section.image_status}
            svgCode={section.svg_code}
            svgStatus={section.svg_status}
            iconName={section.icon_name}
            accentColor={style.accent_color}
            alt={copy.headline}
            className="mt-12 max-w-3xl mx-auto"
          />
        </div>
      </div>
    </SectionWrapper>
  );
}
