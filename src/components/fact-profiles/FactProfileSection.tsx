/**
 * FactProfileSection -- Reusable collapsible section for the Fact Profile editor.
 *
 * Shows a header with icon, title, and completeness indicator (green CheckCircle2 or
 * gray Circle). Collapses/expands with a smooth height transition on click.
 */

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, CheckCircle2, Circle } from 'lucide-react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FactProfileSectionProps {
  title: string;
  icon: React.ReactNode;
  isComplete: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FactProfileSection({
  title,
  icon,
  isComplete,
  defaultOpen = false,
  children,
}: FactProfileSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<string>(defaultOpen ? 'none' : '0px');

  // Recalculate height when open state or children change
  useEffect(() => {
    if (isOpen) {
      // Temporarily set to auto to measure, then set exact px for transition
      const el = contentRef.current;
      if (el) {
        // Use scrollHeight for the actual content height
        setMaxHeight(`${el.scrollHeight}px`);
        // After transition, allow dynamic resizing (e.g., adding tags)
        const timer = setTimeout(() => setMaxHeight('none'), 300);
        return () => clearTimeout(timer);
      }
    } else {
      // Before collapsing, set exact height so transition works
      const el = contentRef.current;
      if (el && maxHeight === 'none') {
        setMaxHeight(`${el.scrollHeight}px`);
        // Force reflow then collapse
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setMaxHeight('0px');
          });
        });
      } else {
        setMaxHeight('0px');
      }
    }
  }, [isOpen]);

  return (
    <div className="rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-3 w-full px-4 py-3.5 text-left hover:bg-[#F8FAFC] dark:hover:bg-gray-800/50 rounded-xl transition-colors"
      >
        {/* Icon */}
        <span className="flex-shrink-0 text-[#64748B] dark:text-gray-400">{icon}</span>

        {/* Title */}
        <span className="flex-1 text-sm font-medium text-[#1E293B] dark:text-gray-100">
          {title}
        </span>

        {/* Completeness indicator */}
        {isComplete ? (
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-brand-teal" />
        ) : (
          <Circle className="h-4 w-4 flex-shrink-0 text-[#94A3B8] dark:text-gray-500" />
        )}

        {/* Chevron */}
        {isOpen ? (
          <ChevronUp className="h-4 w-4 flex-shrink-0 text-[#64748B] dark:text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 flex-shrink-0 text-[#64748B] dark:text-gray-400" />
        )}
      </button>

      {/* Content with smooth height transition */}
      <div
        ref={contentRef}
        style={{ maxHeight, overflow: maxHeight === 'none' ? 'visible' : 'hidden' }}
        className="transition-[max-height] duration-300 ease-in-out"
      >
        <div className="px-4 pb-4 pt-1 space-y-4">{children}</div>
      </div>
    </div>
  );
}
