import type { TranscriptSegment } from '@/components/voice-recorder/types';

/**
 * Format transcript segments (voice recordings) into plain text
 */
export function formatVoiceTranscript(segments: TranscriptSegment[]): string {
  return segments
    .map(segment => `[${segment.time}] ${segment.speaker}: ${segment.text}`)
    .join('\n\n');
}

/**
 * Build a full transcript text file with header metadata
 */
export function buildTranscriptFile(opts: {
  title: string;
  date?: string | null;
  attendees?: string[];
  transcriptText: string;
}): string {
  const lines: string[] = [];
  lines.push(opts.title);
  lines.push('='.repeat(opts.title.length));
  lines.push('');

  if (opts.date) {
    const d = new Date(opts.date);
    lines.push(`Date: ${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`);
  }

  if (opts.attendees && opts.attendees.length > 0) {
    lines.push(`Attendees: ${opts.attendees.join(', ')}`);
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(opts.transcriptText);

  return lines.join('\n');
}

/**
 * Sanitize a string for use as a filename
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 80);
}

/**
 * Trigger a .txt file download in the browser
 */
export function downloadTranscriptTxt(opts: {
  title: string;
  date?: string | null;
  attendees?: string[];
  transcriptText: string;
}): void {
  const content = buildTranscriptFile(opts);
  const dateStr = opts.date
    ? new Date(opts.date).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];
  const filename = `${sanitizeFilename(opts.title)}-transcript-${dateStr}.txt`;

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Copy text to clipboard with error handling
 * Returns true on success, false on failure
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
}
