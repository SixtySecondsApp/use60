/**
 * Fathom Sync Helpers
 *
 * Utility functions for the fathom-sync edge function.
 */

/**
 * Build a stable embed URL from share URL or recording ID
 */
export function buildEmbedUrl(shareUrl?: string, recordingId?: string | number): string | null {
  try {
    if (shareUrl) {
      const u = new URL(shareUrl)
      const parts = u.pathname.split('/').filter(Boolean)
      const token = parts.pop()
      if (token) {
        return `https://fathom.video/embed/${token}`
      }
    }
    if (recordingId) {
      return `https://fathom.video/embed/${recordingId}`
    }
    return null
  } catch {
    if (recordingId) {
      return `https://fathom.video/embed/${recordingId}`
    }
    return null
  }
}

/**
 * Normalize calendar_invitees_type to allowed values for DB check constraint.
 * Only 'all_internal' or 'one_or_more_external' are permitted; everything else becomes null.
 */
export function normalizeInviteesType(rawType: unknown): 'all_internal' | 'one_or_more_external' | null {
  if (!rawType || typeof rawType !== 'string') return null

  const value = rawType.toLowerCase().replace('-', '_').trim()
  if (value === 'all_internal') return 'all_internal'
  if (value === 'one_or_more_external') return 'one_or_more_external'

  return null
}

/**
 * Calculate dynamic cooldown for transcript fetch attempts.
 * Gradually increases wait time to avoid hammering Fathom API.
 */
export function calculateTranscriptFetchCooldownMinutes(attempts: number | null | undefined): number {
  const count = attempts ?? 0

  if (count >= 24) return 720 // 12 hours after many attempts
  if (count >= 12) return 180 // 3 hours after a dozen attempts
  if (count >= 6) return 60 // 1 hour after repeated attempts
  if (count >= 3) return 15 // 15 minutes after a few retries

  return 5 // default: retry after 5 minutes
}

/**
 * Generate a placeholder thumbnail URL based on meeting title
 */
export function generatePlaceholderThumbnail(title: string | undefined): string {
  const firstLetter = (title || 'M')[0].toUpperCase()
  return `https://dummyimage.com/640x360/1a1a1a/10b981&text=${encodeURIComponent(firstLetter)}`
}

/**
 * Calculate meeting duration in minutes from start/end times
 */
export function calculateDurationMinutes(
  startTime: string | undefined,
  endTime: string | undefined
): number {
  if (!startTime || !endTime) return 0

  const start = new Date(startTime)
  const end = new Date(endTime)

  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0

  return Math.round((end.getTime() - start.getTime()) / (1000 * 60))
}

/**
 * Retry helper with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Don't retry on authentication errors (401, 403)
      if (lastError.message.includes('401') || lastError.message.includes('403')) {
        throw lastError
      }

      // If this is the last attempt, throw the error
      if (attempt === maxRetries - 1) {
        throw lastError
      }

      // Calculate backoff delay with jitter
      const delay = initialDelayMs * Math.pow(2, attempt) + Math.random() * 1000
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

/**
 * CORS headers for edge function responses
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Determine initial processing statuses based on skip flags and available data
 */
export function determineProcessingStatuses(
  skipThumbnails: boolean,
  skipTranscriptFetch: boolean,
  existingThumbnailStatus: string | null,
  thumbnailUrl: string | null,
  summaryText: string | null
): {
  thumbnailStatus: string
  transcriptStatus: string
  summaryStatus: string
} {
  // Preserve existing thumbnail status if we have a valid existing thumbnail
  const thumbnailStatus = existingThumbnailStatus === 'complete'
    ? 'complete'
    : skipThumbnails
      ? 'pending'
      : (thumbnailUrl && !thumbnailUrl.includes('dummyimage.com') ? 'complete' : 'pending')

  const transcriptStatus = skipTranscriptFetch
    ? 'pending'
    : 'processing'

  const summaryStatus = skipTranscriptFetch
    ? 'pending'
    : (summaryText ? 'complete' : 'processing')

  return { thumbnailStatus, transcriptStatus, summaryStatus }
}

/**
 * Get default date range based on sync type
 */
export function getDefaultDateRange(
  syncType: string,
  isFreeTier: boolean
): { startDate: string | undefined; endDate: string } {
  const now = new Date()
  let startDate: string | undefined

  switch (syncType) {
    case 'incremental':
      // Last 24 hours for incremental sync
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
      break

    case 'all_time':
      // All time - BUT enforce free tier limit
      if (isFreeTier) {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
      } else {
        startDate = undefined
      }
      break

    case 'onboarding_fast':
      // Phase 1: 9 most recent meetings from last 30 days
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
      break

    case 'onboarding_background':
      // Phase 2: Rest of history (30 days for free tier, 90 days for paid)
      if (isFreeTier) {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
      } else {
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()
      }
      break

    case 'initial':
    case 'manual':
    default:
      // Last 30 days for initial/manual sync
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
      break
  }

  return { startDate, endDate: now.toISOString() }
}
