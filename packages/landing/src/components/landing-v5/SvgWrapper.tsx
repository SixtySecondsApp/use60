import { memo, useRef, useEffect, useState } from 'react';

interface SvgWrapperProps {
  svg: string;
  ariaLabel: string;
  className?: string;
}

export const SvgWrapper = memo(function SvgWrapper({ svg, ariaLabel, className = '' }: SvgWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.1 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      className={className}
      style={{ animationPlayState: isVisible ? 'running' : 'paused' }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
});
