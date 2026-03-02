import React from 'react';
import { SectionWrapper, CtaButton, MicroCopy, ContentBlockRenderer } from '../shared';
import type { SectionComponentProps } from '../registry';

export function SolutionCentered({ section, onSectionClick }: SectionComponentProps) {
  const { copy, style } = section;

  const steps = copy.body.split('\n').filter(Boolean);
  const hasSteps = steps.length >= 2;

  return (
    <SectionWrapper sectionId={section.id} bgColor={style.bg_color} textColor={style.text_color} onClick={onSectionClick}>
      <div className="py-16 md:py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">{copy.headline}</h2>
            <p className="text-lg opacity-80 max-w-2xl mx-auto">{copy.subhead}</p>
          </div>
          {section.content_blocks?.length ? (
            <ContentBlockRenderer blocks={section.content_blocks} accentColor={style.accent_color} />
          ) : hasSteps ? (
            <div className={`grid sm:grid-cols-2 lg:grid-cols-${Math.min(steps.length, 4)} gap-8`}>
              {steps.map((line, i) => (
                <div key={i} className="flex flex-col items-center text-center" style={{ animationDelay: `${i * 100}ms` }}>
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg mb-4"
                    style={{ background: `linear-gradient(135deg, ${style.accent_color}, ${style.accent_color}bb)` }}
                  >
                    {i + 1}
                  </div>
                  <p className="text-base opacity-80">{line}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-base opacity-60 max-w-xl mx-auto text-center">{copy.body}</p>
          )}
          {copy.cta && (
            <div className="text-center mt-12">
              <CtaButton label={copy.cta} accentColor={style.accent_color} />
              <MicroCopy text={copy.micro_copy} />
            </div>
          )}
        </div>
      </div>
    </SectionWrapper>
  );
}
