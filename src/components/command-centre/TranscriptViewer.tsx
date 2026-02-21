import { useRef, useEffect } from 'react';
import { User, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TranscriptSegment {
  speaker: string;
  text: string;
  startTime: number; // seconds
  endTime?: number;
  isActionItem?: boolean;
}

interface TranscriptViewerProps {
  transcript: string;
  currentTime?: number;
  onSeek?: (time: number) => void;
}

function parseTranscript(text: string): TranscriptSegment[] {
  if (!text) return [];

  const segments: TranscriptSegment[] = [];

  // Try to parse timestamped format: [00:00:00] Speaker: text
  // Or: Speaker (HH:MM:SS): text
  // Or fallback to paragraph-based
  const lines = text.split('\n').filter(l => l.trim());

  const timestampRegex = /^\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?\s*(?:[-–]\s*)?(.+?)(?:\s*:\s*|\s*[-–]\s*)(.+)$/;
  const speakerRegex = /^(.+?)(?:\s*:\s*)(.+)$/;

  for (const line of lines) {
    const tsMatch = line.match(timestampRegex);
    if (tsMatch) {
      const hours = tsMatch[3] ? parseInt(tsMatch[1]) : 0;
      const minutes = tsMatch[3] ? parseInt(tsMatch[2]) : parseInt(tsMatch[1]);
      const seconds = tsMatch[3] ? parseInt(tsMatch[3]) : parseInt(tsMatch[2]);
      const startTime = hours * 3600 + minutes * 60 + seconds;
      const speaker = tsMatch[4].trim();
      const segText = tsMatch[5].trim();

      segments.push({
        speaker,
        text: segText,
        startTime,
        isActionItem: /action item|todo|follow.?up|commit/i.test(segText),
      });
      continue;
    }

    const spkMatch = line.match(speakerRegex);
    if (spkMatch && spkMatch[1].length < 40) {
      segments.push({
        speaker: spkMatch[1].trim(),
        text: spkMatch[2].trim(),
        startTime: 0,
        isActionItem: /action item|todo|follow.?up|commit/i.test(spkMatch[2]),
      });
      continue;
    }

    // Plain text line
    if (segments.length > 0) {
      segments[segments.length - 1].text += ' ' + line.trim();
    } else {
      segments.push({ speaker: 'Speaker', text: line.trim(), startTime: 0 });
    }
  }

  return segments;
}

export function TranscriptViewer({ transcript, currentTime = 0, onSeek }: TranscriptViewerProps) {
  const segments = parseTranscript(transcript);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to current segment
  useEffect(() => {
    if (!containerRef.current) return;
    const active = containerRef.current.querySelector('[data-active="true"]');
    if (active) {
      active.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentTime]);

  if (segments.length === 0) {
    return (
      <div className="flex items-center justify-center h-20 text-[11px] text-slate-400 dark:text-gray-500">
        No transcript available
      </div>
    );
  }

  return (
    <div ref={containerRef} className="space-y-1.5 max-h-[300px] overflow-y-auto">
      {segments.map((seg, i) => {
        const isActive = seg.startTime > 0 &&
          currentTime >= seg.startTime &&
          (segments[i + 1]?.startTime ? currentTime < segments[i + 1].startTime : true);

        return (
          <button
            key={i}
            data-active={isActive}
            onClick={() => seg.startTime > 0 && onSeek?.(seg.startTime)}
            className={cn(
              'w-full text-left rounded-md px-2.5 py-2 transition-colors',
              isActive
                ? 'bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20'
                : 'hover:bg-slate-50 dark:hover:bg-gray-800/40',
              seg.isActionItem && 'border-l-2 border-l-amber-400',
              seg.startTime > 0 && 'cursor-pointer'
            )}
          >
            <div className="flex items-center gap-2 mb-0.5">
              <User className="h-2.5 w-2.5 text-slate-400 dark:text-gray-500" />
              <span className="text-[10px] font-semibold text-slate-600 dark:text-gray-400">
                {seg.speaker}
              </span>
              {seg.startTime > 0 && (
                <span className="text-[10px] text-slate-400 dark:text-gray-500 flex items-center gap-0.5">
                  <Clock className="h-2 w-2" />
                  {Math.floor(seg.startTime / 60)}:{(Math.floor(seg.startTime % 60)).toString().padStart(2, '0')}
                </span>
              )}
              {seg.isActionItem && (
                <span className="text-[9px] bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded px-1 py-0.5 font-medium">
                  Action Item
                </span>
              )}
            </div>
            <p className={cn(
              'text-[11px] leading-relaxed',
              isActive ? 'text-blue-900 dark:text-blue-200' : 'text-slate-600 dark:text-gray-400'
            )}>
              {seg.text}
            </p>
          </button>
        );
      })}
    </div>
  );
}
