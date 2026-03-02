import React from 'react';
import { SectionWrapper, CtaButton, AssetSlot, MicroCopy } from '../shared';
import type { SectionComponentProps } from '../registry';

export function HeroSplitLeft({ section, onSectionClick }: SectionComponentProps) {
  const { copy, style } = section;
  return (
    <SectionWrapper sectionId={section.id} bgColor={style.bg_color} textColor={style.text_color} onClick={onSectionClick}>
      <div className="relative py-16 md:py-28 px-6 overflow-hidden">
        <div className="hero-orb hero-orb-1" style={{ background: `radial-gradient(circle, ${style.accent_color}25 0%, transparent 70%)` }} />
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center relative z-10">
          <div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-tight mb-6">{copy.headline}</h1>
            <p className="text-lg md:text-xl opacity-80 mb-4">{copy.subhead}</p>
            <p className="text-base opacity-60 mb-8">{copy.body}</p>
            <div><CtaButton label={copy.cta} accentColor={style.accent_color} /></div>
            <MicroCopy text={copy.micro_copy} />
          </div>
          <div>
            <AssetSlot
              strategy={section.asset_strategy}
              imageUrl={section.image_url}
              imageStatus={section.image_status}
              svgCode={section.svg_code}
              svgStatus={section.svg_status}
              iconName={section.icon_name}
              accentColor={style.accent_color}
              alt={copy.headline}
            />
          </div>
        </div>
      </div>
    </SectionWrapper>
  );
}
