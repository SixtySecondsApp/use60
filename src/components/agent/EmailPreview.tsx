import React from 'react';
import { Mail } from 'lucide-react';

interface EmailPreviewProps {
  from: string;
  to: string;
  subject: string;
  body: string;
  timestamp: string;
}

export function EmailPreview({ from, to, subject, body, timestamp }: EmailPreviewProps) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Email toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <Mail className="w-4 h-4 text-gray-400" />
        <span className="text-[13px] font-medium text-gray-600 dark:text-gray-300">Email Preview</span>
        <span className="ml-auto text-[11px] text-gray-400">{timestamp}</span>
      </div>
      {/* Email header */}
      <div className="px-4 py-3 space-y-1 border-b border-gray-100 dark:border-gray-800">
        <div className="flex gap-2 text-[13px]">
          <span className="text-gray-500 dark:text-gray-400 w-16 shrink-0">From:</span>
          <span className="text-gray-900 dark:text-gray-100 font-medium">{from}</span>
        </div>
        <div className="flex gap-2 text-[13px]">
          <span className="text-gray-500 dark:text-gray-400 w-16 shrink-0">To:</span>
          <span className="text-gray-900 dark:text-gray-100">{to}</span>
        </div>
        <div className="flex gap-2 text-[13px]">
          <span className="text-gray-500 dark:text-gray-400 w-16 shrink-0">Subject:</span>
          <span className="text-gray-900 dark:text-gray-100 font-medium">{subject}</span>
        </div>
      </div>
      {/* Email body */}
      <div className="px-4 py-3 text-[14px] text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
        {body}
      </div>
    </div>
  );
}
