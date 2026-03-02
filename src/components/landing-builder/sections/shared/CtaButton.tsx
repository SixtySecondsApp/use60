import React from 'react';

interface CtaButtonProps {
  label: string;
  accentColor: string;
  className?: string;
}

export function CtaButton({ label, accentColor, className = '' }: CtaButtonProps) {
  if (!label) return null;
  return (
    <a
      href="#"
      className={`cta-btn inline-block px-8 py-4 rounded-full text-white font-semibold text-lg transition-all duration-300 hover:-translate-y-1 ${className}`}
      style={{
        background: `linear-gradient(135deg, ${accentColor}, ${accentColor}dd)`,
        boxShadow: `0 4px 24px ${accentColor}44, 0 2px 8px ${accentColor}33`,
      }}
      onClick={(e) => e.preventDefault()}
    >
      {label}
    </a>
  );
}
