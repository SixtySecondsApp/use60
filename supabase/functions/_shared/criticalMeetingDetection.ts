/**
 * Critical Meeting Detection Logic
 *
 * Evaluates whether a meeting crosses the "critical" threshold based on
 * sentiment score, risk flags, and coach rating. Configurable per org.
 *
 * Story: US-002
 */

// =============================================================================
// Types
// =============================================================================

export interface RiskFlag {
  flag: string;
  severity: 'critical' | 'high' | 'medium';
  evidence: string;
}

export interface Commitment {
  description: string;
  suggestedOwner?: string;
  suggestedDueDate?: string;
}

export interface CriticalMeetingThresholds {
  /** Sentiment score (0-100) at or below which meeting is critical. Default: 30 (-0.4 on -1..1 scale) */
  criticalSentimentThreshold: number;
  /** Sentiment score (0-100) at or below which meeting is high risk. Default: 40 (-0.2 on -1..1 scale) */
  highSentimentThreshold: number;
  /** Coach rating at or below which meeting contributes to severity. Default: 20 */
  coachRatingThreshold: number;
}

export interface CriticalMeetingInput {
  sentimentScore: number; // 0-100 scale
  riskFlags: RiskFlag[];
  coachRating?: number; // 0-100 scale
}

export interface CriticalMeetingResult {
  isCritical: boolean;
  severity: 'critical' | 'high' | 'medium' | 'none';
  reasons: string[];
}

// =============================================================================
// Default thresholds
// =============================================================================

export const DEFAULT_THRESHOLDS: CriticalMeetingThresholds = {
  criticalSentimentThreshold: 30,
  highSentimentThreshold: 40,
  coachRatingThreshold: 20,
};

// =============================================================================
// Detection Logic
// =============================================================================

/**
 * Determine if a meeting is critical based on sentiment, risk flags, and coach rating.
 *
 * Rules:
 * - Any risk flag with severity "critical" → always critical
 * - Sentiment ≤ criticalThreshold → critical
 * - Sentiment ≤ highThreshold → high
 * - Multiple high signals compound: high sentiment + high risk flag → critical
 * - Coach rating ≤ threshold escalates by one level
 */
export function isCriticalMeeting(
  input: CriticalMeetingInput,
  thresholds: CriticalMeetingThresholds = DEFAULT_THRESHOLDS,
): CriticalMeetingResult {
  const reasons: string[] = [];
  let severity: 'critical' | 'high' | 'medium' | 'none' = 'none';

  const { sentimentScore, riskFlags, coachRating } = input;
  const { criticalSentimentThreshold, highSentimentThreshold, coachRatingThreshold } = thresholds;

  // Check for critical risk flags
  const criticalFlags = riskFlags.filter((f) => f.severity === 'critical');
  const highFlags = riskFlags.filter((f) => f.severity === 'high');

  if (criticalFlags.length > 0) {
    severity = 'critical';
    for (const f of criticalFlags) {
      reasons.push(`Critical risk flag: ${formatFlagName(f.flag)}`);
    }
  }

  // Check sentiment
  if (sentimentScore <= criticalSentimentThreshold) {
    if (severity !== 'critical') severity = 'critical';
    reasons.push(`Sentiment critically low: ${sentimentScore}/100`);
  } else if (sentimentScore <= highSentimentThreshold) {
    if (severity === 'none') severity = 'high';
    reasons.push(`Sentiment below threshold: ${sentimentScore}/100`);
  }

  // High risk flags escalate
  if (highFlags.length > 0) {
    if (severity === 'none') severity = 'medium';
    if (severity === 'high' || (severity === 'medium' && highFlags.length >= 2)) {
      severity = severity === 'high' ? 'critical' : 'high';
    }
    for (const f of highFlags) {
      reasons.push(`High risk flag: ${formatFlagName(f.flag)}`);
    }
  }

  // Coach rating compounds
  if (typeof coachRating === 'number' && coachRating <= coachRatingThreshold) {
    reasons.push(`Coach rating very low: ${coachRating}/100`);
    if (severity === 'medium') severity = 'high';
    else if (severity === 'high') severity = 'critical';
  }

  // Compound rule: negative sentiment + any risk flag = at least high
  if (sentimentScore <= highSentimentThreshold && riskFlags.length > 0 && severity === 'medium') {
    severity = 'high';
    reasons.push('Compounded: negative sentiment + risk flags');
  }

  return {
    isCritical: severity === 'critical' || severity === 'high',
    severity,
    reasons,
  };
}

// =============================================================================
// Helpers
// =============================================================================

function formatFlagName(flag: string): string {
  return flag.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Load org-specific thresholds from notification settings.
 * Falls back to defaults if not configured.
 */
export async function loadOrgThresholds(
  supabase: any,
  orgId: string,
): Promise<CriticalMeetingThresholds> {
  try {
    const { data } = await supabase
      .from('slack_notification_settings')
      .select('metadata')
      .eq('org_id', orgId)
      .eq('feature', 'critical_meeting_alert')
      .maybeSingle();

    if (data?.metadata?.thresholds) {
      return {
        ...DEFAULT_THRESHOLDS,
        ...data.metadata.thresholds,
      };
    }
  } catch (e) {
    console.warn('[criticalMeetingDetection] Failed to load org thresholds:', e);
  }

  return DEFAULT_THRESHOLDS;
}
