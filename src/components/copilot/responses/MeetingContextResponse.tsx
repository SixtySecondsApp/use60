import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { CopilotResponse as CopilotResponseType, MeetingContextResponseData } from '../types';

interface MeetingContextResponseProps {
  data: CopilotResponseType & { data: MeetingContextResponseData };
  onActionClick?: (action: any) => void;
}

export default function MeetingContextResponse({ data, onActionClick }: MeetingContextResponseProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const responseData = data.data;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-border/50 bg-muted/30"
    >
      {/* Header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm"
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          <Search className="w-3.5 h-3.5" />
          <span className="font-medium">Meeting Context</span>
          <span className="text-xs">({responseData.metadata.meetingsAnalyzed} meetings)</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {/* Collapsible content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2">
              {/* AI Summary */}
              <div className="text-sm text-foreground/80 prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{responseData.answer}</ReactMarkdown>
              </div>

              {/* Source citations (max 3) */}
              {responseData.sources.length > 0 && (
                <div className="space-y-1">
                  {responseData.sources.slice(0, 3).map((source, i) => (
                    <div
                      key={source.transcriptId || i}
                      className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                      onClick={() =>
                        onActionClick?.({
                          type: 'open_transcript',
                          transcriptId: source.transcriptId,
                        })
                      }
                    >
                      <span className="shrink-0 w-1 h-1 rounded-full bg-muted-foreground/50" />
                      <span className="truncate font-medium">{source.transcriptTitle}</span>
                      {source.date && <span className="shrink-0">{source.date}</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* View in Meeting Analytics link */}
              <button
                onClick={() =>
                  onActionClick?.({ type: 'open_external_url', url: '/meeting-analytics' })
                }
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                View in Meeting Analytics
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
