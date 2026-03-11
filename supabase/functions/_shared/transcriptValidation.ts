/**
 * Shared transcript validation helper.
 *
 * Uses word-count (not character-count) so that short transcripts like
 * "Hello" (5 chars, 1 word) are correctly rejected, and transcripts with
 * lots of punctuation/whitespace are not incorrectly penalised.
 */

/** Minimum words required for user-initiated analysis. */
const MIN_TRANSCRIPT_WORDS = 20

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export type TranscriptValidationResult =
  | { valid: true }
  | { valid: false; error: string; details: string }

/**
 * Validate that a transcript exists and has enough content for AI analysis.
 *
 * Returns `{ valid: true }` on success, or `{ valid: false, error, details }`
 * with human-readable messages suitable for returning directly to the client.
 */
export function validateTranscript(
  transcriptText: string | null | undefined
): TranscriptValidationResult {
  if (!transcriptText || !transcriptText.trim()) {
    return {
      valid: false,
      error: 'This meeting does not have a transcript yet',
      details: 'Please wait for the transcript to be processed',
    }
  }

  const words = wordCount(transcriptText)
  if (words < MIN_TRANSCRIPT_WORDS) {
    return {
      valid: false,
      error: 'Meeting transcript is too short for analysis',
      details: `Transcript has ${words} words. Minimum ${MIN_TRANSCRIPT_WORDS} words required.`,
    }
  }

  return { valid: true }
}
