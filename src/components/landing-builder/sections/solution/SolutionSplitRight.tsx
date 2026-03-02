import React from 'react';
import { SectionWrapper, CtaButton, AssetSlot, MicroCopy } from '../shared';
import type { SectionComponentProps } from '../registry';

export function SolutionSplitRight({ section, onSectionClick }: SectionComponentProps) {
  const { copy, style } = section;
  return (
    <SectionWrapper sectionId={section.id} bgColor={style.bg_color} textColor={style.text_color} onClick={onSectionClick}>
      <div className="py-16 md:py-24 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">{copy.headline}</h2>
            <p className="text-lg opacity-80 mb-4">{copy.subhead}</p>
            <p className="text-base opacity-60 mb-8">{copy.body}</p>
            <div><CtaButton label={copy.cta} accentColor={style.accent_color} /></div>
            <MicroCopy text={copy.micro_copy} />
          </div>
          <div>
            <AssetSlot
              strategy={section.asset_strategy}
              imageUrl={section.image_url} imageStatus={section.image_status}
              svgCode={section.svg_code} svgStatus={section.svg_status}
              iconName={section.icon_name} accentColor={style.accent_color}
              alt={copy.headline}
            />
          </div>
        </div>
      </div>
    </SectionWrapper>
  );
}
