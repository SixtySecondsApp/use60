import React from 'react';
import type { SectionDividerType } from '../../types';

interface SectionDividerProps {
  type?: SectionDividerType;
  color?: string;
  className?: string;
}

export function SectionDivider({ type = 'none', color = '#6366f1', className = '' }: SectionDividerProps) {
  if (!type || type === 'none') return null;

  const svgMap: Record<Exclude<SectionDividerType, 'none'>, React.ReactNode> = {
    wave: (
      <svg viewBox="0 0 1440 80" fill="none" preserveAspectRatio="none" className="w-full h-12 md:h-16">
        <path
          d="M0 40C240 80 480 0 720 40C960 80 1200 0 1440 40V80H0V40Z"
          fill={`${color}15`}
        />
      </svg>
    ),
    diagonal: (
      <svg viewBox="0 0 1440 60" fill="none" preserveAspectRatio="none" className="w-full h-10 md:h-14">
        <polygon points="0,60 1440,0 1440,60" fill={`${color}10`} />
      </svg>
    ),
    curve: (
      <svg viewBox="0 0 1440 80" fill="none" preserveAspectRatio="none" className="w-full h-12 md:h-16">
        <path
          d="M0 80C360 20 720 20 1080 50C1260 65 1380 75 1440 80V80H0Z"
          fill={`${color}12`}
        />
      </svg>
    ),
    mesh: (
      <div className="h-8 md:h-12 w-full" style={{
        background: `linear-gradient(90deg, transparent, ${color}08, transparent)`,
      }}>
        <div className="h-full w-full" style={{
          backgroundImage: `radial-gradient(${color}15 1px, transparent 1px)`,
          backgroundSize: '20px 20px',
        }} />
      </div>
    ),
  };

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {svgMap[type]}
    </div>
  );
}
