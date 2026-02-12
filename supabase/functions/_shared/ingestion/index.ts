/**
 * Ingestion Layer — Barrel Export
 *
 * Unified adapter layer for normalizing meeting data from all providers.
 */

// Types
export type {
  MeetingProvider,
  NormalizedParticipant,
  NormalizedActionItem,
  NormalizedAIAnalysis,
  NormalizedMeetingData,
  WriteMeetingOptions,
  WriteMeetingResult,
} from './types.ts'

// Writer
export { writeMeetingData } from './meetingWriter.ts'

// Adapters
export { adaptFathomMeeting, type FathomAdapterInput } from './adapters/fathomAdapter.ts'
export { adaptFirefliesMeeting, type FirefliesAdapterInput, type FirefliesTranscript } from './adapters/firefliesAdapter.ts'
export { adaptNotetakerMeeting, type NotetakerAdapterInput } from './adapters/notetakerAdapter.ts'
