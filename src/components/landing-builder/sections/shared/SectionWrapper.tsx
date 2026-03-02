import React from 'react';

interface SectionWrapperProps {
  sectionId: string;
  bgColor: string;
  textColor: string;
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
}

export function SectionWrapper({
  sectionId,
  bgColor,
  textColor,
  className = '',
  onClick,
  children,
}: SectionWrapperProps) {
  return (
    <section
      data-section-id={sectionId}
      className={`scroll-reveal section-border-gradient ${className}`}
      style={{ backgroundColor: bgColor, color: textColor }}
      onClick={onClick}
    >
      {children}
    </section>
  );
}
