import React, { useState } from 'react';
import DOMPurify from 'dompurify';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExpandableDescriptionProps {
  /** Short description shown by default */
  short: string | null;
  /** Long description shown when expanded (supports markdown) */
  long: string | null;
  /** Additional CSS classes */
  className?: string;
  /** Maximum lines to show for short description */
  maxLines?: number;
}

/**
 * Expandable description component for process maps.
 * Shows a short description with a "View more" button that reveals the full description.
 * Supports markdown formatting in the long description.
 */
export function ExpandableDescription({
  short,
  long,
  className,
  maxLines = 2,
}: ExpandableDescriptionProps) {
  const [expanded, setExpanded] = useState(false);

  if (!short && !long) return null;

  const hasLong = long && long.trim().length > 0;

  // Parse markdown-style formatting to simple HTML
  const formatMarkdown = (text: string) => {
    return text
      // Bold: **text** or __text__
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.*?)__/g, '<strong>$1</strong>')
      // Italic: *text* or _text_
      .replace(/\*(?!\*)(.*?)\*/g, '<em>$1</em>')
      .replace(/_(?!_)(.*?)_/g, '<em>$1</em>')
      // Inline code: `code`
      .replace(/`([^`]+)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs font-mono">$1</code>')
      // Bullet points: - text or * text
      .replace(/^[-*]\s+(.+)$/gm, '<li class="ml-4">$1</li>')
      // Numbered list: 1. text
      .replace(/^\d+\.\s+(.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
      // Headers: remove markdown but keep bold
      .replace(/^#+\s+(.+)$/gm, '<strong class="block mt-2">$1</strong>')
      // Line breaks
      .replace(/\n\n/g, '</p><p class="mt-2">')
      .replace(/\n/g, '<br />');
  };

  if (expanded && hasLong) {
    return (
      <div className={cn('text-sm text-muted-foreground', className)}>
        <div
          className="prose prose-sm dark:prose-invert max-w-none space-y-1 [&_li]:list-disc [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(`<p>${formatMarkdown(long)}</p>`) }}
        />
        <Button
          variant="link"
          size="sm"
          onClick={() => setExpanded(false)}
          className="h-auto p-0 mt-2 text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 gap-1"
        >
          <ChevronUp className="h-3 w-3" />
          Show less
        </Button>
      </div>
    );
  }

  return (
    <div className={cn('text-sm text-muted-foreground', className)}>
      <div className="flex items-start gap-2">
        <span className={cn('flex-1', maxLines === 1 ? 'line-clamp-1' : maxLines === 2 ? 'line-clamp-2' : 'line-clamp-3')}>
          {short || 'Process visualization diagram'}
        </span>
        {hasLong && (
          <Button
            variant="link"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(true);
            }}
            className="h-auto p-0 text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 whitespace-nowrap flex-shrink-0 gap-1"
          >
            View more
            <ChevronDown className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}
