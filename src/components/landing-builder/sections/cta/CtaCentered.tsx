import React from 'react';
import { SectionWrapper, CtaButton, AssetSlot, MicroCopy } from '../shared';
import type { SectionComponentProps } from '../registry';

export function CtaCentered({ section, onSectionClick }: SectionComponentProps) {
  const { copy, style } = section;
  return (
    <SectionWrapper sectionId={section.id} bgColor={style.bg_color} textColor={style.text_color} onClick={onSectionClick}>
      <div className="py-20 md:py-28 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <AssetSlot strategy={section.asset_strategy ?? 'svg'} imageUrl={section.image_url} imageStatus={section.image_status} svgCode={section.svg_code} svgStatus={section.svg_status} iconName={section.icon_name} accentColor={style.accent_color} alt={copy.headline} className="mb-8 max-w-xs mx-auto" />
          <h2 className="text-3xl md:text-5xl font-bold mb-4">{copy.headline}</h2>
          <p className="text-lg opacity-80 mb-4">{copy.subhead}</p>
          <p className="text-base opacity-60 max-w-xl mx-auto mb-10">{copy.body}</p>
          <div><CtaButton label={copy.cta} accentColor={style.accent_color} /></div>
          <MicroCopy text={copy.micro_copy} />
        </div>
      </div>
    </SectionWrapper>
  );
}
