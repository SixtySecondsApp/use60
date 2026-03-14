/**
 * DocumentPreview — DOC-008
 *
 * Renders a structured document preview for CC detail panel and copilot responses.
 * Displays document sections as cards with a type-colored header badge and action buttons.
 */

import { useState } from 'react';
import { Copy, Edit, FileText, Send, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';

// ============================================================================
// Types
// ============================================================================

export interface DocumentSection {
  type: string;
  title: string;
  content: string;
}

export interface DocumentPreviewProps {
  documentType: string;
  documentTypeName: string;
  sections: DocumentSection[];
  onSend?: () => void;
  onEdit?: () => void;
  onCopy?: () => void;
}

// ============================================================================
// Document type color map
// ============================================================================

const DOCUMENT_TYPE_COLORS: Record<
  string,
  { bg: string; text: string; border: string; darkBg: string; darkText: string; darkBorder: string }
> = {
  proposal: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    darkBg: 'dark:bg-blue-500/10',
    darkText: 'dark:text-blue-400',
    darkBorder: 'dark:border-blue-500/20',
  },
  proposal_terms: {
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
    darkBg: 'dark:bg-indigo-500/10',
    darkText: 'dark:text-indigo-400',
    darkBorder: 'dark:border-indigo-500/20',
  },
  next_steps: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    darkBg: 'dark:bg-emerald-500/10',
    darkText: 'dark:text-emerald-400',
    darkBorder: 'dark:border-emerald-500/20',
  },
  team_brief: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    darkBg: 'dark:bg-amber-500/10',
    darkText: 'dark:text-amber-400',
    darkBorder: 'dark:border-amber-500/20',
  },
  discussion_points: {
    bg: 'bg-cyan-50',
    text: 'text-cyan-700',
    border: 'border-cyan-200',
    darkBg: 'dark:bg-cyan-500/10',
    darkText: 'dark:text-cyan-400',
    darkBorder: 'dark:border-cyan-500/20',
  },
  scoping_document: {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    darkBg: 'dark:bg-purple-500/10',
    darkText: 'dark:text-purple-400',
    darkBorder: 'dark:border-purple-500/20',
  },
  ideal_workflow: {
    bg: 'bg-teal-50',
    text: 'text-teal-700',
    border: 'border-teal-200',
    darkBg: 'dark:bg-teal-500/10',
    darkText: 'dark:text-teal-400',
    darkBorder: 'dark:border-teal-500/20',
  },
  project_plan: {
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200',
    darkBg: 'dark:bg-orange-500/10',
    darkText: 'dark:text-orange-400',
    darkBorder: 'dark:border-orange-500/20',
  },
};

const DEFAULT_COLORS = {
  bg: 'bg-slate-50',
  text: 'text-slate-700',
  border: 'border-slate-200',
  darkBg: 'dark:bg-gray-500/10',
  darkText: 'dark:text-gray-400',
  darkBorder: 'dark:border-gray-500/20',
};

// ============================================================================
// Component
// ============================================================================

export function DocumentPreview({
  documentType,
  documentTypeName,
  sections,
  onSend,
  onEdit,
  onCopy,
}: DocumentPreviewProps) {
  const [copied, setCopied] = useState(false);
  const colors = DOCUMENT_TYPE_COLORS[documentType] ?? DEFAULT_COLORS;

  const handleCopy = async () => {
    const fullText = sections
      .map((s) => `${s.title}\n\n${s.content}`)
      .join('\n\n---\n\n');

    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      toast.success('Document copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
      onCopy?.();
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  const hasActions = onSend || onEdit || onCopy;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Badge
          className={cn(
            'gap-1.5',
            colors.bg,
            colors.text,
            colors.border,
            colors.darkBg,
            colors.darkText,
            colors.darkBorder,
          )}
        >
          <FileText className="h-3 w-3" />
          {documentTypeName}
        </Badge>
      </div>

      {/* Sections */}
      <div className="space-y-3">
        {sections.map((section, i) => (
          <Card key={`${section.type}-${i}`} className="overflow-hidden">
            <CardContent className="p-4">
              <h4 className="text-sm font-semibold text-slate-800 dark:text-gray-100 mb-2">
                {section.title}
              </h4>
              <div className="text-sm text-slate-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                {section.content}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Action buttons */}
      {hasActions && (
        <div className="flex items-center gap-2 pt-1 flex-wrap">
          {onSend && (
            <Button size="sm" className="h-8 px-4 text-xs gap-1.5" onClick={onSend}>
              <Send className="h-3 w-3" />
              Send to Contact
            </Button>
          )}
          {onEdit && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-4 text-xs gap-1.5"
              onClick={onEdit}
            >
              <Edit className="h-3 w-3" />
              Edit
            </Button>
          )}
          {onCopy && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-4 text-xs gap-1.5"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-3 w-3 text-emerald-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
