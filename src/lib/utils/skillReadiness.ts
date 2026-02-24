/**
 * Skill Readiness Rubric
 * 
 * Evaluates platform skills and sequences for production readiness based on:
 * - Required metadata
 * - Output contract definition
 * - Safety (approval gating for writes)
 * - Capability requirements vs available integrations
 * - Sequence correctness (for agent-sequence category)
 */

import type { PlatformSkill } from '@/lib/services/platformSkillService';

export type Capability = 'crm' | 'calendar' | 'email' | 'meetings' | 'messaging' | 'tasks';

export interface CapabilityStatus {
  capability: Capability;
  available: boolean;
  provider?: string; // 'db' | 'hubspot' | 'salesforce' | 'google' | 'microsoft' | 'slack' | 'fathom' | etc.
  features?: string[];
}

export interface ReadinessCheck {
  isReady: boolean;
  score: number; // 0-100
  issues: ReadinessIssue[];
  missingCapabilities: Capability[];
  warnings: string[];
}

export interface ReadinessIssue {
  type: 'missing_metadata' | 'missing_contract' | 'unsafe_write' | 'missing_capability' | 'invalid_sequence' | 'missing_integration';
  severity: 'error' | 'warning';
  message: string;
  field?: string;
}

/**
 * Check which capabilities are available for an organization
 * This will be called from the backend/edge function context
 */
export async function checkOrgCapabilities(
  orgId: string | null,
  supabase: any
): Promise<CapabilityStatus[]> {
  const capabilities: CapabilityStatus[] = [];

  // CRM capability
  const hasHubSpot = orgId
    ? await checkHubSpotIntegration(supabase, orgId)
    : false;
  capabilities.push({
    capability: 'crm',
    available: true, // DB adapter always available
    provider: hasHubSpot ? 'hubspot' : 'db',
    features: hasHubSpot ? ['contacts', 'deals', 'companies'] : ['contacts', 'deals'], // DB-only has basic features
  });

  // Calendar capability (Google Calendar only - MeetingBaaS is for Meetings, not Calendar)
  const hasGoogleCalendar = orgId
    ? await checkGoogleCalendarIntegration(supabase, orgId)
    : false;
  capabilities.push({
    capability: 'calendar',
    available: hasGoogleCalendar,
    provider: hasGoogleCalendar ? 'google' : undefined,
    features: hasGoogleCalendar ? ['events', 'attendees', 'availability'] : [],
  });

  // Check MeetingBaaS for Meetings capability (not Calendar)
  const hasMeetingBaaS = orgId
    ? await checkMeetingBaaSIntegration(supabase, orgId)
    : false;

  // Email capability
  const hasGmail = orgId
    ? await checkGmailIntegration(supabase, orgId)
    : false;
  capabilities.push({
    capability: 'email',
    available: hasGmail || true, // DB adapter may have email storage
    provider: hasGmail ? 'gmail' : 'db',
    features: hasGmail ? ['search', 'draft', 'send'] : ['search'], // DB may have stored emails
  });

  // Meetings capability - available via Fathom OR MeetingBaaS (60 Notetaker)
  // Records: transcripts, recordings, summaries
  const hasFathom = orgId
    ? await checkFathomIntegration(supabase, orgId)
    : false;
  const hasMeetingBaaSTranscript = orgId
    ? await checkMeetingBaaSIntegration(supabase, orgId)
    : false;
  const hasMeetingsProvider = hasFathom || hasMeetingBaaSTranscript;
  capabilities.push({
    capability: 'meetings',
    available: hasMeetingsProvider,
    provider: hasFathom ? 'fathom' : hasMeetingBaaSTranscript ? 'meetingbaas' : undefined,
    features: hasMeetingsProvider ? ['transcripts', 'recordings', 'summaries'] : [],
  });

  // Messaging capability (Slack)
  const hasSlack = orgId
    ? await checkSlackIntegration(supabase, orgId)
    : false;
  capabilities.push({
    capability: 'messaging',
    available: hasSlack,
    provider: hasSlack ? 'slack' : undefined,
    features: hasSlack ? ['channels', 'messages', 'notifications'] : [],
  });

  // Tasks capability - always available via DB
  capabilities.push({
    capability: 'tasks',
    available: true, // Tasks are stored in the DB, always available
    provider: 'db',
    features: ['create', 'update', 'list', 'complete'],
  });

  return capabilities;
}

/**
 * Check if HubSpot is connected
 */
async function checkHubSpotIntegration(supabase: any, orgId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('hubspot_org_integrations')
      .select('is_connected')
      .eq('org_id', orgId)
      .eq('is_connected', true)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

/**
 * Check if Google Calendar is connected
 */
async function checkGoogleCalendarIntegration(supabase: any, orgId: string): Promise<boolean> {
  try {
    // Check google_integrations table for calendar scope
    const { data } = await supabase
      .from('google_integrations')
      .select('scopes')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .maybeSingle();
    if (!data) return false;
    const scopes = Array.isArray(data.scopes) ? data.scopes : [];
    return scopes.some(
      (s: unknown) =>
        typeof s === 'string' &&
        (s.includes('calendar') || s.includes('https://www.googleapis.com/auth/calendar'))
    );
  } catch {
    return false;
  }
}

/**
 * Check if MeetingBaaS is connected
 */
async function checkMeetingBaaSIntegration(supabase: any, orgId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('meetingbaas_calendars')
      .select('id')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

/**
 * Check if Gmail is connected
 */
async function checkGmailIntegration(supabase: any, orgId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('google_integrations')
      .select('scopes')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .maybeSingle();
    if (!data) return false;
    const scopes = Array.isArray(data.scopes) ? data.scopes : [];
    return scopes.some(
      (s: unknown) =>
        typeof s === 'string' &&
        (s.includes('gmail') || s.includes('https://www.googleapis.com/auth/gmail'))
    );
  } catch {
    return false;
  }
}

/**
 * Check if Fathom is connected
 */
async function checkFathomIntegration(supabase: any, orgId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('fathom_integrations')
      .select('is_connected')
      .eq('org_id', orgId)
      .eq('is_connected', true)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

/**
 * Check if Slack is connected
 */
async function checkSlackIntegration(supabase: any, orgId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('slack_org_settings')
      .select('is_connected')
      .eq('org_id', orgId)
      .eq('is_connected', true)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

/**
 * Evaluate readiness of a platform skill or sequence
 */
export function evaluateReadiness(
  skill: PlatformSkill,
  availableCapabilities: CapabilityStatus[]
): ReadinessCheck {
  const issues: ReadinessIssue[] = [];
  const warnings: string[] = [];
  let score = 100;

  // 1. Check metadata completeness
  if (!skill.frontmatter.name || skill.frontmatter.name.trim() === '') {
    issues.push({
      type: 'missing_metadata',
      severity: 'error',
      message: 'Missing skill name',
      field: 'frontmatter.name',
    });
    score -= 20;
  }

  if (!skill.frontmatter.description || skill.frontmatter.description.trim() === '') {
    issues.push({
      type: 'missing_metadata',
      severity: 'warning',
      message: 'Missing skill description',
      field: 'frontmatter.description',
    });
    score -= 10;
  }

  if (!skill.version || skill.version < 1) {
    issues.push({
      type: 'missing_metadata',
      severity: 'warning',
      message: 'Invalid or missing version',
      field: 'version',
    });
    score -= 5;
  }

  // 2. Check output contract
  const hasOutputContract =
    skill.frontmatter.outputs && Array.isArray(skill.frontmatter.outputs) && skill.frontmatter.outputs.length > 0;
  if (!hasOutputContract) {
    issues.push({
      type: 'missing_contract',
      severity: 'warning',
      message: 'No explicit output contract defined (frontmatter.outputs)',
      field: 'frontmatter.outputs',
    });
    score -= 15;
  }

  // 3. Check for unsafe write actions (if content mentions write actions without approval)
  const contentLower = skill.content_template.toLowerCase();
  const hasWriteActions = /(update|create|delete|send|post|put)/i.test(contentLower);
  if (hasWriteActions && !contentLower.includes('confirm') && !contentLower.includes('approval')) {
    warnings.push('Content mentions write actions but may not require approval');
    score -= 10;
  }

  // 4. Check capability requirements
  const requiredCapabilities = (skill.frontmatter.requires_capabilities ||
    []) as Capability[];
  const missingCapabilities: Capability[] = [];

  for (const cap of requiredCapabilities) {
    const capStatus = availableCapabilities.find((c) => c.capability === cap);
    if (!capStatus || !capStatus.available) {
      missingCapabilities.push(cap);
      issues.push({
        type: 'missing_capability',
        severity: 'error',
        message: `Required capability '${cap}' is not available`,
        field: 'frontmatter.requires_capabilities',
      });
      score -= 25;
    } else if (capStatus.provider === 'db' && cap !== 'crm') {
      // DB-only is acceptable for CRM, but not ideal for other capabilities
      warnings.push(`Capability '${cap}' is using DB-only adapter (no external integration)`);
    }
  }

  // 5. Sequence-specific checks
  if (skill.category === 'agent-sequence') {
    const steps = (skill.frontmatter.sequence_steps || []) as any[];
    if (!Array.isArray(steps) || steps.length === 0) {
      issues.push({
        type: 'invalid_sequence',
        severity: 'error',
        message: 'Sequence has no steps defined',
        field: 'frontmatter.sequence_steps',
      });
      score -= 30;
    } else {
      // Validate each step
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (!step.skill_key && !step.action) {
          issues.push({
            type: 'invalid_sequence',
            severity: 'error',
            message: `Step ${i + 1} has neither skill_key nor action`,
            field: `frontmatter.sequence_steps[${i}]`,
          });
          score -= 15;
        }
      }
    }
  }

  // Ensure score doesn't go below 0
  score = Math.max(0, score);

  return {
    isReady: score >= 70 && issues.filter((i) => i.severity === 'error').length === 0,
    score,
    issues,
    missingCapabilities,
    warnings,
  };
}

/**
 * Get human-readable capability name
 */
export function getCapabilityLabel(capability: Capability): string {
  const labels: Record<Capability, string> = {
    crm: 'CRM',
    calendar: 'Calendar',
    email: 'Email',
    meetings: 'Meetings',
    messaging: 'Messaging',
    tasks: 'Tasks',
  };
  return labels[capability] || capability;
}

/**
 * Get human-readable provider name
 */
export function getProviderLabel(provider?: string): string {
  if (!provider) return 'None';
  const labels: Record<string, string> = {
    db: 'Database Only',
    sixty: 'Sixty',
    hubspot: 'HubSpot',
    salesforce: 'Salesforce',
    pipedrive: 'Pipedrive',
    google: 'Google',
    microsoft: 'Microsoft',
    gmail: 'Gmail',
    outlook: 'Outlook',
    slack: 'Slack',
    fathom: 'Fathom',
    meetingbaas: '60 Notetaker',
  };
  return labels[provider] || provider;
}
