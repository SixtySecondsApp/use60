/**
 * Fathom Sync Services
 *
 * Barrel file exporting all services for the fathom-sync edge function.
 */

// Owner Resolution
export {
  resolveMeetingOwner,
  resolveOwnerFromFathomMapping,
  resolveOwnerUserIdFromEmail,
  upsertFathomUserMapping,
  extractPossibleOwnerEmails,
  type OwnerResolutionResult,
} from './ownerResolutionService.ts'

// Participant Processing
export {
  processParticipants,
  extractAndTruncateSummary,
  type ParticipantProcessingResult,
  type CalendarInvitee,
} from './participantService.ts'

// Action Items
export {
  processActionItems,
  fetchRecordingActionItems,
  fetchRecordingDetails,
  type FathomActionItem,
  type FathomRecordingDetails,
  type ActionItemInsertResult,
} from './actionItemsService.ts'

// Helpers
export {
  buildEmbedUrl,
  normalizeInviteesType,
  calculateTranscriptFetchCooldownMinutes,
  generatePlaceholderThumbnail,
  calculateDurationMinutes,
  retryWithBackoff,
  corsHeaders,
  determineProcessingStatuses,
  getDefaultDateRange,
} from './helpers.ts'

// Meeting Upsert
export {
  prepareMeetingData,
  getExistingThumbnail,
  upsertMeeting,
  seedOrgCallTypesIfNeeded,
  enqueueTranscriptRetry,
  type MeetingUpsertInput,
  type MeetingUpsertResult,
} from './meetingUpsertService.ts'

// Transcript Processing
export {
  condenseMeetingSummary,
  queueMeetingForIndexing,
  storeAIActionItems,
  autoFetchTranscriptAndAnalyze,
} from './transcriptService.ts'
