import React from 'react';
import type { AssetStrategy, AssetStatus } from '../../types';

interface AssetSlotProps {
  strategy?: AssetStrategy;
  imageUrl: string | null;
  imageStatus: AssetStatus;
  svgCode: string | null;
  svgStatus: AssetStatus;
  iconName?: string;
  accentColor?: string;
  alt?: string;
  className?: string;
}

export function AssetSlot({
  strategy = 'image',
  imageUrl,
  imageStatus,
  svgCode,
  svgStatus,
  iconName,
  accentColor = '#6366f1',
  alt = '',
  className = '',
}: AssetSlotProps) {
  if (strategy === 'none') return null;

  if (strategy === 'icon' && iconName) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: `${accentColor}15` }}
        >
          <span className="text-2xl" style={{ color: accentColor }}>
            {iconName}
          </span>
        </div>
      </div>
    );
  }

  // SVG slot
  if (strategy === 'svg' || (!imageUrl && svgCode)) {
    if (svgStatus === 'generating') {
      return (
        <div className={`w-full aspect-square max-w-xs mx-auto rounded-xl bg-gradient-to-tr from-gray-200 via-gray-50 to-gray-200 animate-pulse flex items-center justify-center ${className}`}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="opacity-20">
            <rect x="4" y="4" width="40" height="40" rx="8" stroke="currentColor" strokeWidth="2" />
            <circle cx="24" cy="24" r="8" stroke="currentColor" strokeWidth="2" />
          </svg>
        </div>
      );
    }
    if (svgStatus === 'complete' && svgCode) {
      return (
        <div
          className={`w-full max-w-xs mx-auto scroll-reveal ${className}`}
          dangerouslySetInnerHTML={{ __html: svgCode }}
        />
      );
    }
    // SVG failed — decorative gradient placeholder
    if (svgStatus === 'failed') {
      return (
        <div
          className={`w-full aspect-square max-w-xs mx-auto rounded-2xl overflow-hidden scroll-reveal ${className}`}
          style={{
            background: `linear-gradient(135deg, ${accentColor}20 0%, ${accentColor}08 50%, ${accentColor}15 100%)`,
          }}
        >
          <svg viewBox="0 0 200 200" fill="none" className="w-full h-full opacity-30">
            <circle cx="100" cy="100" r="60" stroke={accentColor} strokeWidth="1" strokeDasharray="8 4" />
            <circle cx="100" cy="100" r="30" stroke={accentColor} strokeWidth="0.5" strokeDasharray="4 4" />
            <line x1="40" y1="100" x2="160" y2="100" stroke={accentColor} strokeWidth="0.5" strokeDasharray="4 4" />
            <line x1="100" y1="40" x2="100" y2="160" stroke={accentColor} strokeWidth="0.5" strokeDasharray="4 4" />
          </svg>
        </div>
      );
    }
  }

  // Image slot (default)
  if (imageStatus === 'generating') {
    return (
      <div className={`w-full aspect-video rounded-2xl bg-gradient-to-br from-gray-200 via-gray-100 to-gray-200 animate-pulse ${className}`} />
    );
  }
  if (imageStatus === 'complete' && imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={alt}
        className={`w-full rounded-2xl shadow-lg object-cover scroll-reveal ${className}`}
      />
    );
  }
  // Image failed — decorative gradient placeholder
  if (imageStatus === 'failed') {
    return (
      <div
        className={`w-full aspect-video rounded-2xl overflow-hidden scroll-reveal ${className}`}
        style={{
          background: `linear-gradient(135deg, ${accentColor}18 0%, ${accentColor}06 40%, ${accentColor}12 100%)`,
        }}
      >
        <svg viewBox="0 0 400 225" fill="none" className="w-full h-full opacity-20">
          <rect x="20" y="20" width="360" height="185" rx="12" stroke={accentColor} strokeWidth="1" strokeDasharray="8 4" />
          <circle cx="320" cy="60" r="20" stroke={accentColor} strokeWidth="0.5" />
          <path d="M60 180 L140 100 L200 140 L280 70 L360 130" stroke={accentColor} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }

  return null;
}
