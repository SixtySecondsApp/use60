import React, { useRef, useEffect, useCallback, memo } from 'react';
import { Copy, Check, Clock, Download } from 'lucide-react';
import { formatVoiceTranscript, downloadTranscriptTxt } from '@/lib/utils/transcriptExport';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { TranscriptSegment, Speaker } from './types';

interface TranscriptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transcript: TranscriptSegment[];
  speakers: Speaker[];
  currentTime: number;
  onSeek: (time: number) => void;
  title?: string;
}

/**
 * TranscriptModal - Full transcript view with audio synchronization
 * - Click on any segment to seek to that time
 * - Current segment is highlighted based on audio playback
 * - Copy button to copy plain text transcript
 */
export const TranscriptModal = memo(function TranscriptModal({
  open,
  onOpenChange,
  transcript,
  speakers,
  currentTime,
  onSeek,
  title = 'Full Transcript',
}: TranscriptModalProps) {
  const [copied, setCopied] = React.useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeSegmentRef = useRef<HTMLButtonElement>(null);

  // Find the current active segment based on playback time
  const activeSegmentIndex = React.useMemo(() => {
    if (!transcript.length) return -1;

    // Find segment where currentTime falls within start_time and end_time
    for (let i = 0; i < transcript.length; i++) {
      const segment = transcript[i];
      const startTime = segment.start_time ?? 0;
      const endTime = segment.end_time ?? (transcript[i + 1]?.start_time ?? Infinity);

      if (currentTime >= startTime && currentTime < endTime) {
        return i;
      }
    }

    // If past all segments, return last one
    const lastSegment = transcript[transcript.length - 1];
    if (lastSegment.end_time && currentTime >= lastSegment.end_time) {
      return transcript.length - 1;
    }

    return -1;
  }, [transcript, currentTime]);

  // Auto-scroll to active segment
  useEffect(() => {
    if (activeSegmentRef.current && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const element = activeSegmentRef.current;

      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();

      // Only scroll if element is outside the visible area
      if (elementRect.top < containerRect.top || elementRect.bottom > containerRect.bottom) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeSegmentIndex]);

  // Get speaker color by name
  const getSpeakerColor = useCallback((speakerName: string): string => {
    const speaker = speakers.find(s =>
      s.name.toLowerCase() === speakerName.toLowerCase() ||
      s.initials === speakerName
    );
    return speaker?.color || '#6B7280';
  }, [speakers]);

  // Handle copy transcript
  const handleCopyTranscript = useCallback(async () => {
    const plainText = formatVoiceTranscript(transcript);

    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy transcript:', err);
    }
  }, [transcript]);

  // Handle download transcript as .txt
  const handleDownloadTranscript = useCallback(() => {
    downloadTranscriptTxt({
      title: title || 'Transcript',
      transcriptText: formatVoiceTranscript(transcript),
    });
  }, [transcript, title]);

  // Handle segment click
  const handleSegmentClick = useCallback((segment: TranscriptSegment) => {
    if (segment.start_time !== undefined) {
      onSeek(segment.start_time);
    }
  }, [onSeek]);

  // Format time display
  const formatTime = (seconds?: number): string => {
    if (seconds === undefined) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="text-gray-900 dark:text-gray-100">
              {title}
            </DialogTitle>
            <div className="flex gap-2">
              <button
                onClick={handleCopyTranscript}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-all',
                  copied
                    ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                )}
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy
                  </>
                )}
              </button>
              <button
                onClick={handleDownloadTranscript}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-all bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>
          </div>
        </DialogHeader>

        {/* Transcript segments */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto -mx-6 px-6 py-4 space-y-3"
        >
          {transcript.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No transcript available
            </div>
          ) : (
            transcript.map((segment, index) => {
              const isActive = index === activeSegmentIndex;
              const speakerColor = getSpeakerColor(segment.speaker);

              return (
                <button
                  key={`${segment.speaker}-${segment.time}-${index}`}
                  ref={isActive ? activeSegmentRef : null}
                  onClick={() => handleSegmentClick(segment)}
                  className={cn(
                    'w-full text-left p-3 rounded-xl transition-all border',
                    isActive
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30'
                      : 'bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/50',
                    segment.start_time !== undefined && 'cursor-pointer'
                  )}
                  disabled={segment.start_time === undefined}
                >
                  <div className="flex items-start gap-3">
                    {/* Speaker avatar */}
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium text-white flex-shrink-0"
                      style={{ backgroundColor: speakerColor }}
                    >
                      {segment.speaker.slice(0, 2).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Speaker name and time */}
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="text-sm font-medium"
                          style={{ color: speakerColor }}
                        >
                          {segment.speaker}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                          <Clock className="w-3 h-3" />
                          {segment.time || formatTime(segment.start_time)}
                        </span>
                      </div>

                      {/* Transcript text */}
                      <p className={cn(
                        'text-sm leading-relaxed',
                        isActive
                          ? 'text-gray-900 dark:text-gray-100'
                          : 'text-gray-700 dark:text-gray-300'
                      )}>
                        {segment.text}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer with segment count */}
        <div className="flex-shrink-0 pt-4 border-t border-gray-200 dark:border-gray-700/50 text-center">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {transcript.length} segments • Click any segment to jump to that time
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
});

export default TranscriptModal;
