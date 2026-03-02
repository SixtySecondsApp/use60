import React from 'react';
import { SectionWrapper, AssetSlot } from '../shared';
import type { SectionComponentProps } from '../registry';

export function ProblemCentered({ section, onSectionClick }: SectionComponentProps) {
  const { copy, style } = section;
  return (
    <SectionWrapper sectionId={section.id} bgColor={style.bg_color} textColor={style.text_color} onClick={onSectionClick}>
      <div className="py-16 md:py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <AssetSlot
            strategy={section.asset_strategy ?? 'svg'}
            imageUrl={section.image_url} imageStatus={section.image_status}
            svgCode={section.svg_code} svgStatus={section.svg_status}
            iconName={section.icon_name} accentColor={style.accent_color}
            alt={copy.headline} className="mb-10 max-w-xs mx-auto"
          />
          <h2 className="text-3xl md:text-4xl font-bold mb-4">{copy.headline}</h2>
          <p className="text-lg opacity-80 mb-4">{copy.subhead}</p>
          <p className="text-base opacity-60 max-w-xl mx-auto">{copy.body}</p>
        </div>
      </div>
    </SectionWrapper>
  );
}
