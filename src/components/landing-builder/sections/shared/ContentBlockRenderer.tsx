import React from 'react';
import type { ContentBlock } from '../../types';

interface ContentBlockRendererProps {
  blocks?: ContentBlock[];
  fallbackCopy?: string;
  accentColor?: string;
  className?: string;
}

export function ContentBlockRenderer({
  blocks,
  fallbackCopy,
  accentColor = '#6366f1',
  className = '',
}: ContentBlockRendererProps) {
  if (!blocks || blocks.length === 0) {
    if (!fallbackCopy) return null;
    return <p className={`text-base opacity-60 ${className}`}>{fallbackCopy}</p>;
  }

  return (
    <div className={`grid sm:grid-cols-2 lg:grid-cols-${Math.min(blocks.length, 4)} gap-6 ${className}`}>
      {blocks.map((block, i) => (
        <div
          key={i}
          className="animate-stagger-child"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          {block.type === 'stat' && (
            <div className="text-center">
              <div
                className="text-3xl md:text-4xl font-bold mb-1 animate-counter"
                style={{ color: accentColor, animationDelay: `${i * 150}ms` }}
              >
                {block.value}
              </div>
              <div className="text-sm opacity-60">{block.label}</div>
            </div>
          )}
          {block.type === 'bullet' && (
            <div className="flex items-start gap-3">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ backgroundColor: `${accentColor}20`, color: accentColor }}
              >
                {block.icon || '→'}
              </div>
              <div>
                <div className="font-medium">{block.label}</div>
                {block.value && <div className="text-sm opacity-60 mt-1">{block.value}</div>}
              </div>
            </div>
          )}
          {block.type === 'quote' && (
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <p className="italic opacity-80 mb-2">"{block.value}"</p>
              <p className="text-sm font-medium opacity-60">{block.label}</p>
            </div>
          )}
          {block.type === 'step' && (
            <div className="flex flex-col items-center text-center">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg mb-4"
                style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}bb)` }}
              >
                {i + 1}
              </div>
              <div className="font-medium mb-1">{block.label}</div>
              {block.value && <div className="text-sm opacity-60">{block.value}</div>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
