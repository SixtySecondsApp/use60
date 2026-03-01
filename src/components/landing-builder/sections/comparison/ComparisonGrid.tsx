import React from 'react';
import { SectionWrapper } from '../shared';
import type { SectionComponentProps } from '../registry';

export function ComparisonGrid({ section, onSectionClick }: SectionComponentProps) {
  const { copy, style } = section;
  const rows = copy.body.split('\n').filter(Boolean);

  return (
    <SectionWrapper sectionId={section.id} bgColor={style.bg_color} textColor={style.text_color} onClick={onSectionClick}>
      <div className="py-16 md:py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">{copy.headline}</h2>
            <p className="text-lg opacity-80 max-w-2xl mx-auto">{copy.subhead}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <tbody>
                {rows.map((row, i) => {
                  const cells = row.split('|').map(s => s.trim());
                  const isHeader = i === 0;
                  return (
                    <tr
                      key={i}
                      className="animate-table-row-slide"
                      style={{ animationDelay: `${i * 80}ms` }}
                    >
                      {cells.map((cell, ci) => {
                        const Tag = isHeader ? 'th' : 'td';
                        const isCheck = cell === 'Y' || cell === 'yes' || cell === '✓';
                        const isX = cell === 'N' || cell === 'no' || cell === '✗';
                        return (
                          <Tag
                            key={ci}
                            className={`py-4 px-4 text-left border-b border-white/10 ${
                              isHeader ? 'font-semibold text-sm uppercase tracking-wide opacity-60' : 'text-base'
                            } ${ci === 0 ? 'font-medium' : 'text-center'}`}
                          >
                            {isCheck ? (
                              <span style={{ color: style.accent_color }}>&#10003;</span>
                            ) : isX ? (
                              <span className="opacity-30">&#10005;</span>
                            ) : (
                              cell
                            )}
                          </Tag>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </SectionWrapper>
  );
}
