/**
 * Security Utilities for Edge Functions
 *
 * Provides reusable security functions for:
 * - Input validation (UUID, arrays, content size)
 * - AI prompt sanitization
 * - Rate limiting
 * - Cost tracking
 * - Security event logging
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'

// ============================================================================
// Constants
// ============================================================================

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const COST_LIMITS = {
  perRequest: 10,        // $0.10 max per request
  perHour: 100,          // $1.00 max per user per hour
  perDay: 500,           // $5.00 max per user per day
  globalHourly: 50000,   // $500 max across all users per hour
}

export const RATE_LIMITS = {
  extractTopics: {
    requests: 20,        // 20 requests
    window: 3600,        // per hour
  },
  generateContent: {
    requests: 10,        // 10 requests
    window: 3600,        // per hour
  },
  cacheBypass: {
    requests: 3,         // 3 cache bypass requests
    window: 86400,       // per day
  },
}

export const VALIDATION_LIMITS = {
  maxTranscriptLength: 100000,      // 100KB
  maxContentLength: 50000,          // 50KB
  maxTopicIndices: 10,              // Max 10 topics per generation
}

// Prompt injection patterns to detect
const INJECTION_PATTERNS = [
  /SYSTEM[\s\S]{0,20}OVERRIDE/gi,
  /IGNORE[\s\S]{0,20}INSTRUCTIONS/gi,
  /NEW[\s\S]{0,20}TASK/gi,
  /DISREGARD[\s\S]{0,20}(POLICY|INSTRUCTIONS)/gi,
  /ADMIN[\s\S]{0,20}OVERRIDE/gi,
  /---[\s\S]{0,100}---/g,  // Markdown injection
  /\[SYSTEM\]/gi,
  /\[ADMIN\]/gi,
  /IMPORTANT:[\s\S]{0,50}(ignore|disregard)/gi,
]

// Patterns to detect in AI outputs (sensitive data)
const SENSITIVE_PATTERNS = [
  /password|credential|api[_\s-]?key|secret|token/gi,
  /AKIA[0-9A-Z]{16}/g,  // AWS access key
  /-----BEGIN[\s\S]+PRIVATE KEY-----/g,  // Private keys
  /<script|javascript:|on\w+=/gi,  // XSS attempts
  /eval\(|Function\(/gi,
]

// ============================================================================
// Type Definitions
// ============================================================================

export interface ValidationResult {
  valid: boolean
  error?: string
}

export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  reset: Date
}

export interface CostCheckResult {
  allowed: boolean
  error?: string
  currentCost: number
  limit: number
}

export type SecurityEventType =
  | 'AUTH_FAILURE'
  | 'RATE_LIMIT'
  | 'COST_ALERT'
  | 'SUSPICIOUS_PATTERN'
  | 'UNAUTHORIZED_ACCESS'

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

// ============================================================================
// Input Validation
// ============================================================================

/**
 * Validate UUID format
 */
export function isValidUUID(uuid: string): boolean {
  return typeof uuid === 'string' && UUID_REGEX.test(uuid)
}

/**
 * Validate meeting_id parameter
 */
export function validateMeetingId(meetingId: unknown): ValidationResult {
  if (!meetingId) {
    return { valid: false, error: 'meeting_id is required' }
  }

  if (typeof meetingId !== 'string') {
    return { valid: false, error: 'meeting_id must be a string' }
  }

  if (!isValidUUID(meetingId)) {
    return { valid: false, error: 'meeting_id must be a valid UUID' }
  }

  return { valid: true }
}

/**
 * Validate topic indices array
 */
export function validateTopicIndices(indices: unknown): ValidationResult {
  if (!Array.isArray(indices)) {
    return { valid: false, error: 'selected_topic_indices must be an array' }
  }

  if (indices.length === 0) {
    return { valid: false, error: 'selected_topic_indices cannot be empty' }
  }

  if (indices.length > VALIDATION_LIMITS.maxTopicIndices) {
    return {
      valid: false,
      error: `Too many topics selected (max: ${VALIDATION_LIMITS.maxTopicIndices})`,
    }
  }

  if (!indices.every((idx) => typeof idx === 'number' && idx >= 0 && Number.isInteger(idx))) {
    return { valid: false, error: 'selected_topic_indices must contain non-negative integers' }
  }

  return { valid: true }
}

/**
 * Validate content size
 */
export function validateContentSize(content: string, maxLength: number): ValidationResult {
  if (content.length > maxLength) {
    return {
      valid: false,
      error: `Content too large (max: ${maxLength} characters, got: ${content.length})`,
    }
  }

  return { valid: true }
}

// ============================================================================
// AI Prompt Sanitization
// ============================================================================

/**
 * Sanitize user input for AI prompts (removes injection attempts)
 */
export function sanitizeForPrompt(input: string, maxLength: number = 50000): string {
  let sanitized = input

  // Remove injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REMOVED_FOR_SECURITY]')
  }

  // Truncate to max length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + '\n\n[... content truncated ...]'
  }

  return sanitized
}

/**
 * Validate AI-generated output for sensitive data or malicious content
 */
export function validateAIOutput(output: string): ValidationResult {
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(output)) {
      return {
        valid: false,
        error: 'Generated content contains potentially sensitive or malicious patterns',
      }
    }
  }

  return { valid: true }
}

/**
 * Validate individual topic for suspicious content
 */
export function validateTopic(topic: { title: string; description: string }): ValidationResult {
  const combined = `${topic.title} ${topic.description}`.toLowerCase()

  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(combined)) {
      return {
        valid: false,
        error: 'Topic contains suspicious patterns (potential data leak or injection)',
      }
    }
  }

  return { valid: true }
}

// ============================================================================
// Rate Limiting (using in-memory store for now)
// ============================================================================

// Simple in-memory rate limiter (for production, use Redis/Upstash)
interface RateLimitEntry {
  count: number
  resetAt: Date
}

const rateLimitStore = new Map<string, RateLimitEntry>()

/**
 * Check rate limit for user
 * Returns whether request is allowed and current limit status
 */
export function checkRateLimit(
  userId: string,
  operation: 'extractTopics' | 'generateContent' | 'cacheBypass'
): RateLimitResult {
  const config = RATE_LIMITS[operation]
  const key = `${userId}:${operation}`
  const now = new Date()

  // Get or create entry
  let entry = rateLimitStore.get(key)

  // Reset if window expired
  if (!entry || entry.resetAt < now) {
    const resetAt = new Date(now.getTime() + config.window * 1000)
    entry = { count: 0, resetAt }
    rateLimitStore.set(key, entry)
  }

  // Increment counter
  entry.count++

  const remaining = Math.max(0, config.requests - entry.count)
  const allowed = entry.count <= config.requests

  return {
    allowed,
    limit: config.requests,
    remaining,
    reset: entry.resetAt,
  }
}

// ============================================================================
// Cost Tracking & Limits
// ============================================================================

/**
 * Check if user has exceeded cost limits
 */
export async function checkCostLimits(
  supabaseClient: SupabaseClient,
  userId: string,
  estimatedCostCents: number
): Promise<CostCheckResult> {
  // Check per-request limit
  if (estimatedCostCents > COST_LIMITS.perRequest) {
    return {
      allowed: false,
      error: 'Request exceeds per-request cost limit ($0.10)',
      currentCost: estimatedCostCents,
      limit: COST_LIMITS.perRequest,
    }
  }

  // Check hourly limit
  const { data: hourlyCost } = await supabaseClient.rpc('get_user_hourly_cost', {
    p_user_id: userId,
  })

  if (hourlyCost && hourlyCost + estimatedCostCents > COST_LIMITS.perHour) {
    return {
      allowed: false,
      error: `Hourly cost limit exceeded ($${COST_LIMITS.perHour / 100})`,
      currentCost: hourlyCost,
      limit: COST_LIMITS.perHour,
    }
  }

  // Check daily limit
  const { data: dailyCost } = await supabaseClient.rpc('get_user_daily_cost', {
    p_user_id: userId,
  })

  if (dailyCost && dailyCost + estimatedCostCents > COST_LIMITS.perDay) {
    return {
      allowed: false,
      error: `Daily cost limit exceeded ($${COST_LIMITS.perDay / 100})`,
      currentCost: dailyCost,
      limit: COST_LIMITS.perDay,
    }
  }

  return {
    allowed: true,
    currentCost: dailyCost || 0,
    limit: COST_LIMITS.perDay,
  }
}

/**
 * Record cost in tracking table
 */
export async function recordCost(
  supabaseServiceClient: SupabaseClient,
  userId: string,
  operation: 'extract_topics' | 'generate_content',
  costCents: number,
  meetingId: string,
  metadata: Record<string, any> = {}
): Promise<void> {
  await supabaseServiceClient.from('cost_tracking').insert({
    user_id: userId,
    operation,
    cost_cents: costCents,
    meeting_id: meetingId,
    metadata,
  })

  // Log alert if approaching limits
  const { data: dailyCost } = await supabaseServiceClient.rpc('get_user_daily_cost', {
    p_user_id: userId,
  })

  if (dailyCost && dailyCost > COST_LIMITS.perDay * 0.8) {
    await logSecurityEvent(supabaseServiceClient, {
      eventType: 'COST_ALERT',
      userId,
      severity: 'MEDIUM',
      details: `User approaching daily cost limit: $${dailyCost / 100}`,
      metadata: { daily_cost_cents: dailyCost, limit_cents: COST_LIMITS.perDay },
    })
  }
}

// ============================================================================
// Security Event Logging
// ============================================================================

/**
 * Log security event
 */
export async function logSecurityEvent(
  supabaseServiceClient: SupabaseClient,
  event: {
    eventType: SecurityEventType
    userId?: string
    severity: Severity
    details: string
    metadata?: Record<string, any>
  }
): Promise<void> {
  await supabaseServiceClient.from('security_events').insert({
    event_type: event.eventType,
    user_id: event.userId || null,
    severity: event.severity,
    details: event.details,
    metadata: event.metadata || {},
  })

  // In production, send alerts for HIGH/CRITICAL events
  if (event.severity === 'HIGH' || event.severity === 'CRITICAL') {
    // TODO: Send to alerting system (PagerDuty, Slack, etc.)
  }
}

// ============================================================================
// Meeting Ownership Verification
// ============================================================================

/**
 * Verify user owns the meeting (defense-in-depth)
 */
export async function verifyMeetingOwnership(
  supabaseClient: SupabaseClient,
  meetingId: string,
  userId: string
): Promise<{ authorized: boolean; meeting?: any; error?: string }> {
  const { data: meeting, error: meetingError } = await supabaseClient
    .from('meetings')
    .select('id, title, transcript_text, share_url, meeting_start, owner_user_id')
    .eq('id', meetingId)
    .single()

  if (meetingError || !meeting) {
    return {
      authorized: false,
      error: 'Meeting not found or access denied',
    }
  }

  // CRITICAL: Explicit ownership check (defense-in-depth)
  if (meeting.owner_user_id !== userId) {
    await logSecurityEvent(
      createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''),
      {
        eventType: 'UNAUTHORIZED_ACCESS',
        userId,
        severity: 'HIGH',
        details: `User ${userId} attempted to access meeting ${meetingId} owned by ${meeting.owner_user_id}`,
        metadata: { meeting_id: meetingId, owner_id: meeting.owner_user_id },
      }
    )

    return {
      authorized: false,
      error: 'Access denied: You do not own this meeting',
    }
  }

  return {
    authorized: true,
    meeting,
  }
}

// ============================================================================
// Error Sanitization
// ============================================================================

/**
 * Sanitize error messages for production (remove internal details)
 */
export function sanitizeErrorMessage(error: any, isDevelopment: boolean = false): string {
  // In development, return full error
  if (isDevelopment || Deno.env.get('ENVIRONMENT') === 'development') {
    return error?.message || String(error)
  }

  // In production, return generic message
  return 'An error occurred while processing your request'
}

// ============================================================================
// Response Helpers
// ============================================================================

export interface ErrorResponse {
  success: false
  error: string
  details?: string
}

export function createErrorResponse(
  error: string,
  details?: string,
  status: number = 400
): Response {
  const body: ErrorResponse = {
    success: false,
    error,
    ...(details && { details }),
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  })
}

export function createRateLimitResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: 'Rate limit exceeded',
      details: `Try again after ${result.reset.toISOString()}`,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-RateLimit-Limit': result.limit.toString(),
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': result.reset.getTime().toString(),
        'Retry-After': Math.ceil((result.reset.getTime() - Date.now()) / 1000).toString(),
      },
    }
  )
}
