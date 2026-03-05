import React from 'react';
import { SectionWrapper, CtaButton, ContentBlockRenderer } from '../shared';
import type { SectionComponentProps } from '../registry';

export function StepsCentered({ section, onSectionClick }: SectionComponentProps) {
  const { copy, style } = section;
  const steps = copy.body.split('\n').filter(Boolean);

  return (
    <SectionWrapper sectionId={section.id} bgColor={style.bg_color} textColor={style.text_color} onClick={onSectionClick}>
      <div className="py-16 md:py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">{copy.headline}</h2>
            <p className="text-lg opacity-80 max-w-2xl mx-auto">{copy.subhead}</p>
          </div>
          {section.content_blocks?.length ? (
            <ContentBlockRenderer blocks={section.content_blocks} accentColor={style.accent_color} />
          ) : (
            <div className="relative">
              {/* Vertical timeline line */}
              <div
                className="absolute left-6 top-0 bottom-0 w-px hidden md:block"
                style={{ backgroundColor: `${style.accent_color}30` }}
              />
              <div className="space-y-8">
                {steps.map((step, i) => {
                  const [title, description] = step.split('|').map(s => s.trim());
                  return (
                    <div key={i} className="flex items-start gap-6 animate-stagger-child" style={{ animationDelay: `${i * 150}ms` }}>
                      <div
                        className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg relative z-10"
                        style={{ background: `linear-gradient(135deg, ${style.accent_color}, ${style.accent_color}bb)` }}
                      >
                        {i + 1}
                      </div>
                      <div className="pt-2">
                        <h3 className="text-lg font-semibold mb-1">{title || step}</h3>
                        {description && <p className="text-base opacity-60">{description}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {copy.cta && (
            <div className="text-center mt-12">
              <CtaButton label={copy.cta} accentColor={style.accent_color} />
            </div>
          )}
        </div>
      </div>
    </SectionWrapper>
  );
}
