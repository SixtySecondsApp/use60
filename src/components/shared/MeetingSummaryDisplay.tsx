import React from 'react';
import DOMPurify from 'dompurify';
import { formatMeetingSummaryForDisplay } from '@/lib/utils/meetingSummaryParser';

interface MeetingSummaryDisplayProps {
  summary: string | null | undefined;
  maxLength?: number;
  className?: string;
  showPlainText?: boolean;
}

/**
 * Reusable component for displaying meeting summaries
 * Handles both JSON format (Fathom) and plain text summaries
 */
export const MeetingSummaryDisplay: React.FC<MeetingSummaryDisplayProps> = ({
  summary,
  maxLength,
  className = '',
  showPlainText = false
}) => {
  if (!summary) {
    return null;
  }

  const { content, isHtml } = formatMeetingSummaryForDisplay(summary, {
    maxLength,
    showPlainText
  });

  if (!content) {
    return null;
  }

  if (isHtml) {
    return (
      <div
        className={`prose prose-sm max-w-none dark:prose-invert ${className}`}
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}
      />
    );
  }

  return (
    <div className={`whitespace-pre-line text-gray-400 ${className}`}>
      {content}
    </div>
  );
};







