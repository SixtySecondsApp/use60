import React from 'react';
import type { SectionDividerType } from '../../types';

interface SectionDividerProps {
  type?: SectionDividerType;
  color?: string;
  /** Background color of the section below — the SVG shape is filled with this */
  toBg?: string;
  /** @deprecated kept for compat — ignored */
  fromBg?: string;
  className?: string;
}

/**
 * Animated section divider — absolutely positioned at the bottom of the
 * section above so the shape "flows in" from below. Uses SVG masks and
 * CSS keyframe animation to create a slow, organic drift that feels like
 * a natural part of the page rather than a stamped-on decoration.
 */
export function SectionDivider({ type = 'none', color = '#6366f1', toBg, className = '' }: SectionDividerProps) {
  const uid = React.useId().replace(/:/g, '');
  if (!type || type === 'none') return null;

  const fill = toBg || 'currentColor';
  const accent = `${color}30`;

  if (type === 'mesh') {
    return (
      <div className={className} style={{ lineHeight: 0 }}>
        <div style={{ height: 60 }} className="w-full relative">
          <div className="absolute inset-0" style={{
            background: `linear-gradient(to bottom, transparent 0%, ${fill} 100%)`,
          }}>
            <div className="h-full w-full" style={{
              backgroundImage: `radial-gradient(${color}18 1px, transparent 1px)`,
              backgroundSize: '24px 24px',
            }} />
          </div>
        </div>
      </div>
    );
  }

  // Shared animated SVG approach — a wide path that drifts left via CSS animation.
  // The SVG is 2x viewport width; the animation slides it leftward so the wave
  // appears to flow continuously. A vertical mask fades the top edge so it blends
  // with the section above rather than showing a hard shape boundary.
  const maskId = `m${uid}`;
  const glowId = `g${uid}`;
  const height = type === 'diagonal' ? 70 : 80;
  const viewH = type === 'diagonal' ? 100 : 120;

  // Path definitions — drawn at 2880 width (2× 1440) so the loop is seamless
  const paths: Record<string, { main: string; edge: string }> = {
    wave: {
      main: 'M0 60C240 110 480 10 720 60C960 110 1200 10 1440 60C1680 110 1920 10 2160 60C2400 110 2640 10 2880 60V120H0Z',
      edge: 'M0 60C240 110 480 10 720 60C960 110 1200 10 1440 60C1680 110 1920 10 2160 60C2400 110 2640 10 2880 60',
    },
    curve: {
      main: 'M0 90C360 20 720 20 1080 90C1440 20 1800 20 2160 90C2520 20 2880 90 2880 90V120H0Z',
      edge: 'M0 90C360 20 720 20 1080 90C1440 20 1800 20 2160 90C2520 20 2880 90 2880 90',
    },
    diagonal: {
      main: 'M0 80L1440 20L2880 80V100H0Z',
      edge: 'M0 80L1440 20L2880 80',
    },
  };

  const p = paths[type] ?? paths.wave;

  // The mask fades from transparent at the top to white (visible) at the bottom,
  // so the upper part of the shape dissolves softly into the section above.
  return (
    <div className={className} style={{ lineHeight: 0, overflow: 'hidden' }}>
      <svg
        viewBox={`0 0 1440 ${viewH}`}
        preserveAspectRatio="none"
        className="w-full block"
        style={{ height }}
      >
        <defs>
          {/* Vertical fade mask — top is invisible, bottom is fully revealed */}
          <linearGradient id={maskId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="black" />
            <stop offset="35%" stopColor="black" />
            <stop offset="60%" stopColor="white" />
            <stop offset="100%" stopColor="white" />
          </linearGradient>
          <mask id={`${maskId}m`}>
            <rect width="2880" height={viewH} fill={`url(#${maskId})`} />
          </mask>
          {/* Accent glow gradient */}
          <linearGradient id={glowId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.15" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Animated group — viewBox clips to 1440, the 2880-wide path drifts left */}
        <g mask={`url(#${maskId}m)`}>
          <g>
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0,0;-1440,0"
              dur={type === 'diagonal' ? '24s' : '18s'}
              repeatCount="indefinite"
            />
            {/* Soft glow layer above the shape edge */}
            <path d={p.edge} fill="none" stroke={`url(#${glowId})`} strokeWidth="20" />
            {/* Main fill — next section's background colour */}
            <path d={p.main} fill={fill} />
            {/* Thin accent stroke along the edge */}
            <path d={p.edge} fill="none" stroke={accent} strokeWidth="1" />
          </g>
        </g>
      </svg>
    </div>
  );
}
