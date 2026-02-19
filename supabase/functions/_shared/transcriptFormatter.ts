/**
 * Shared Transcript Formatting Utility
 *
 * Formats utterance arrays into the standard transcript text format:
 * [HH:MM:SS] Speaker Name: text
 *
 * Compatible with Fathom/Fireflies transcript rendering in the frontend.
 * Used by: process-recording, process-gladia-webhook, meetingbaas-webhook, poll-stuck-bots
 */

export interface TranscriptUtterance {
  speaker: number
  start: number
  end: number
  text: string
  confidence?: number
}

export interface SpeakerNameMap {
  [speakerId: number]: string
}

/**
 * Format seconds to HH:MM:SS string (zero-padded)
 * e.g., 3723 → "01:02:03", 65 → "00:01:05"
 */
export function formatTimestampHHMMSS(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = Math.floor(totalSeconds % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * Format an array of utterances into standard transcript text.
 *
 * Output format: [HH:MM:SS] Speaker Name: text
 * One line per utterance, joined by newlines.
 *
 * @param utterances - Array of utterances with speaker IDs and timestamps
 * @param speakerNames - Optional map of speaker_id → display name.
 *   If not provided or speaker not found, uses "Speaker N" (1-indexed).
 * @returns Formatted transcript text string
 */
export function formatUtterancesToTranscriptText(
  utterances: TranscriptUtterance[],
  speakerNames?: SpeakerNameMap
): string {
  if (!utterances || utterances.length === 0) return ''

  return utterances.map(u => {
    const timestamp = formatTimestampHHMMSS(u.start)
    const name = speakerNames?.[u.speaker] ?? `Speaker ${u.speaker + 1}`
    return `[${timestamp}] ${name}: ${u.text}`
  }).join('\n')
}
