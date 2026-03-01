import React from 'react';

interface MicroCopyProps {
  text?: string;
  className?: string;
}

export function MicroCopy({ text, className = '' }: MicroCopyProps) {
  if (!text) return null;
  return (
    <p className={`mt-3 text-sm opacity-50 tracking-wide ${className}`}>
      {text}
    </p>
  );
}
