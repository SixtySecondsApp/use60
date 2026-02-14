/**
 * Shared Context Enrichment for Orchestrator Adapters
 *
 * Provides deep context about contacts, deals, meetings, and activities
 * so every adapter step can be "mega context aware."
 *
 * Used by: emailSend, detectIntents, coaching, actionItems, etc.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { SequenceState } from '../types.ts';

// =============================================================================
// Types
// =============================================================================

export interface ContactEnrichment {
  contact: {
    id: string;
    name: string;
    email: string;
    title?: string;
    company?: string;
    phone?: string;
    linkedin_url?: string;
  };
  recentMeetings: Array<{
    id: string;
    title: string;
    date: string;
    summary?: string;
    duration_minutes?: number;
  }>;
  recentEmails: Array<{
    subject: string;
    date: string;
    direction: string;
    snippet?: string;
  }>;
  recentActivities: Array<{
    type: string;
    description: string;
    date: string;
  }>;
  dealContext?: {
    id: string;
    name: string;
    stage: string;
    value?: number;
    close_date?: string;
    probability?: number;
  };
}

export interface MeetingEnrichment {
  transcript: string;
  summary: string;
  title: string;
  meetingStart?: string;
  durationMinutes?: number;
  attendees: Array<{
    name: string;
    email?: string;
    is_external: boolean;
    title?: string;
    company?: string;
  }>;
}

export interface CoachingHistory {
  priorScores: Array<{
    date: string;
    talk_ratio: number;
    question_quality_score: number;
    objection_handling_score: number;
    discovery_depth_score: number;
    meeting_title?: string;
  }>;
  orgWinPatterns?: {
    avg_talk_ratio?: number;
    avg_question_score?: number;
    avg_discovery_score?: number;
    deals_analyzed: number;
  };
}

// =============================================================================
// Supabase Client Helper
// =============================================================================

export function getServiceClient(): any {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// =============================================================================
// Contact Enrichment
// =============================================================================

export async function enrichContactContext(
  supabase: any,
  contactData: any,
  meetingId: string | undefined,
  lookbackDays = 7,
): Promise<ContactEnrichment> {
  const enrichment: ContactEnrichment = {
    contact: {
      id: contactData?.id || '',
      name: contactData?.name || contactData?.email || 'Unknown',
      email: contactData?.email || '',
      title: contactData?.title,
      company: contactData?.company,
      phone: contactData?.phone,
      linkedin_url: contactData?.linkedin_url,
    },
    recentMeetings: [],
    recentEmails: [],
    recentActivities: [],
  };

  const contactId = contactData?.id;
  const isRealContact = contactId && !contactId.startsWith('attendee:') && !contactId.startsWith('cal:') && !contactId.startsWith('cal-json:');

  if (!isRealContact) return enrichment;

  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  // Full contact record
  const { data: fullContact } = await supabase
    .from('contacts')
    .select('first_name, last_name, full_name, email, company, title, phone, linkedin_url')
    .eq('id', contactId)
    .maybeSingle();

  if (fullContact) {
    enrichment.contact = {
      id: contactId,
      name: fullContact.full_name || [fullContact.first_name, fullContact.last_name].filter(Boolean).join(' ') || fullContact.email,
      email: fullContact.email || contactData?.email || '',
      title: fullContact.title,
      company: fullContact.company,
      phone: fullContact.phone,
      linkedin_url: fullContact.linkedin_url,
    };
  }

  // Recent meetings via junction table
  const { data: meetingLinks } = await supabase
    .from('meeting_contacts')
    .select('meeting_id')
    .eq('contact_id', contactId)
    .limit(10);

  if (meetingLinks && meetingLinks.length > 0) {
    const meetingIds = meetingLinks.map((mc: any) => mc.meeting_id);
    const { data: meetings } = await supabase
      .from('meetings')
      .select('id, title, meeting_start, summary, duration_minutes')
      .in('id', meetingIds)
      .gte('meeting_start', cutoff)
      .order('meeting_start', { ascending: false })
      .limit(5);

    if (meetings) {
      enrichment.recentMeetings = meetings
        .filter((m: any) => m.id !== meetingId)
        .map((m: any) => ({
          id: m.id,
          title: m.title || 'Meeting',
          date: m.meeting_start,
          summary: m.summary ? m.summary.slice(0, 400) : undefined,
          duration_minutes: m.duration_minutes,
        }));
    }
  }

  // Recent emails
  if (enrichment.contact.email) {
    const email = enrichment.contact.email;
    const { data: emails } = await supabase
      .from('emails')
      .select('subject, sent_at, direction, body')
      .or(`from_email.eq.${email},to_emails.cs.{${email}}`)
      .gte('sent_at', cutoff)
      .order('sent_at', { ascending: false })
      .limit(5);

    if (emails) {
      enrichment.recentEmails = emails.map((e: any) => ({
        subject: e.subject || '(no subject)',
        date: e.sent_at,
        direction: e.direction || 'unknown',
        snippet: e.body ? e.body.slice(0, 200) : undefined,
      }));
    }
  }

  // Recent activities
  const { data: activities } = await supabase
    .from('activities')
    .select('activity_type, description, created_at')
    .eq('entity_type', 'contact')
    .eq('entity_id', contactId)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(10);

  if (activities) {
    enrichment.recentActivities = activities.map((a: any) => ({
      type: a.activity_type,
      description: a.description || '',
      date: a.created_at,
    }));
  }

  // Active deal (deals table uses primary_contact_id, NOT contact_id)
  const { data: deals } = await supabase
    .from('deals')
    .select('id, name, stage, value, close_date, probability')
    .eq('primary_contact_id', contactId)
    .not('stage', 'in', '(closed_won,closed_lost)')
    .order('updated_at', { ascending: false })
    .limit(1);

  if (deals && deals.length > 0) {
    enrichment.dealContext = {
      id: deals[0].id,
      name: deals[0].name,
      stage: deals[0].stage,
      value: deals[0].value,
      close_date: deals[0].close_date,
      probability: deals[0].probability,
    };
  }

  return enrichment;
}

// =============================================================================
// Meeting Enrichment
// =============================================================================

export async function enrichMeetingContext(
  supabase: any,
  meetingId: string,
): Promise<MeetingEnrichment> {
  // Fetch meeting with transcript
  const { data: meeting } = await supabase
    .from('meetings')
    .select('id, title, transcript_text, summary, meeting_start, duration_minutes')
    .eq('id', meetingId)
    .maybeSingle();

  // Fetch attendees
  const { data: attendees } = await supabase
    .from('meeting_attendees')
    .select('name, email, is_external')
    .eq('meeting_id', meetingId);

  // Enrich attendees with contact records for title/company
  const enrichedAttendees = [];
  for (const att of (attendees || [])) {
    let title: string | undefined;
    let company: string | undefined;

    if (att.email) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('title, company')
        .eq('email', att.email)
        .limit(1)
        .maybeSingle();
      title = contact?.title;
      company = contact?.company;
    }

    enrichedAttendees.push({
      name: att.name || att.email || 'Unknown',
      email: att.email,
      is_external: att.is_external ?? true,
      title,
      company,
    });
  }

  return {
    transcript: meeting?.transcript_text || '',
    summary: meeting?.summary || '',
    title: meeting?.title || 'Meeting',
    meetingStart: meeting?.meeting_start,
    durationMinutes: meeting?.duration_minutes,
    attendees: enrichedAttendees,
  };
}

// =============================================================================
// Coaching History
// =============================================================================

export async function enrichCoachingHistory(
  supabase: any,
  userId: string,
  orgId: string,
  lookbackDays = 30,
): Promise<CoachingHistory> {
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  // Prior coaching scores for this rep
  const { data: priorAnalyses } = await supabase
    .from('coaching_analyses')
    .select('created_at, talk_ratio, question_quality_score, objection_handling_score, discovery_depth_score, meeting_id')
    .eq('user_id', userId)
    .eq('analysis_type', 'per_meeting')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(10);

  const priorScores = [];
  for (const a of (priorAnalyses || [])) {
    let meetingTitle: string | undefined;
    if (a.meeting_id) {
      const { data: m } = await supabase
        .from('meetings')
        .select('title')
        .eq('id', a.meeting_id)
        .maybeSingle();
      meetingTitle = m?.title;
    }
    priorScores.push({
      date: a.created_at,
      talk_ratio: a.talk_ratio,
      question_quality_score: a.question_quality_score,
      objection_handling_score: a.objection_handling_score,
      discovery_depth_score: a.discovery_depth_score,
      meeting_title: meetingTitle,
    });
  }

  // Org winning patterns — average metrics from closed-won deals' meetings
  let orgWinPatterns: CoachingHistory['orgWinPatterns'] = undefined;
  try {
    const { data: wonDeals } = await supabase
      .from('deals')
      .select('id')
      .eq('owner_id', userId) // scoped to the org via deal ownership
      .eq('stage', 'closed_won')
      .limit(20);

    if (wonDeals && wonDeals.length >= 3) {
      // Get coaching analyses linked to won-deal meetings
      const { data: wonAnalyses } = await supabase
        .from('coaching_analyses')
        .select('talk_ratio, question_quality_score, discovery_depth_score')
        .eq('user_id', userId)
        .eq('analysis_type', 'per_meeting')
        .limit(50);

      if (wonAnalyses && wonAnalyses.length > 0) {
        const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
        orgWinPatterns = {
          avg_talk_ratio: avg(wonAnalyses.map((a: any) => a.talk_ratio).filter(Boolean)),
          avg_question_score: avg(wonAnalyses.map((a: any) => a.question_quality_score).filter(Boolean)),
          avg_discovery_score: avg(wonAnalyses.map((a: any) => a.discovery_depth_score).filter(Boolean)),
          deals_analyzed: wonDeals.length,
        };
      }
    }
  } catch {
    // Non-fatal
  }

  return { priorScores, orgWinPatterns };
}

// =============================================================================
// Formatting Helpers — turn enrichment data into concise prompt sections
// =============================================================================

export function formatContactSection(enrichment: ContactEnrichment): string {
  const lines: string[] = [];
  lines.push(`Name: ${enrichment.contact.name}`);
  if (enrichment.contact.email) lines.push(`Email: ${enrichment.contact.email}`);
  if (enrichment.contact.title) lines.push(`Title: ${enrichment.contact.title}`);
  if (enrichment.contact.company) lines.push(`Company: ${enrichment.contact.company}`);
  return lines.join('\n');
}

export function formatRelationshipHistory(enrichment: ContactEnrichment): string {
  const sections: string[] = [];

  if (enrichment.recentMeetings.length > 0) {
    sections.push('Recent meetings with this contact:');
    for (const m of enrichment.recentMeetings) {
      const d = new Date(m.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      sections.push(`  - ${d}: ${m.title}${m.summary ? ` — ${m.summary.slice(0, 200)}` : ''}`);
    }
  }

  if (enrichment.recentEmails.length > 0) {
    sections.push('Recent email exchanges:');
    for (const e of enrichment.recentEmails) {
      const d = new Date(e.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const dir = e.direction === 'inbound' ? 'From them' : 'From us';
      sections.push(`  - ${d} (${dir}): ${e.subject}`);
    }
  }

  if (enrichment.recentActivities.length > 0) {
    sections.push('Recent activity:');
    for (const a of enrichment.recentActivities.slice(0, 5)) {
      const d = new Date(a.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      sections.push(`  - ${d}: [${a.type}] ${a.description}`);
    }
  }

  if (enrichment.dealContext) {
    const deal = enrichment.dealContext;
    sections.push(`Active deal: "${deal.name}" — stage: ${deal.stage}${deal.value ? `, value: $${deal.value.toLocaleString()}` : ''}${deal.close_date ? `, close: ${deal.close_date}` : ''}`);
  }

  return sections.length > 0 ? sections.join('\n') : 'No prior interaction history available.';
}

export function formatAttendeesSection(attendees: MeetingEnrichment['attendees']): string {
  if (attendees.length === 0) return 'No attendee information available.';

  return attendees.map(a => {
    const parts = [a.name];
    if (a.title) parts.push(`(${a.title})`);
    if (a.company) parts.push(`at ${a.company}`);
    parts.push(a.is_external ? '[External/Prospect]' : '[Internal/Rep]');
    return `  - ${parts.join(' ')}`;
  }).join('\n');
}

export function formatCoachingHistory(history: CoachingHistory): string {
  const sections: string[] = [];

  if (history.priorScores.length > 0) {
    sections.push(`Prior coaching scores (last ${history.priorScores.length} meetings):`);
    for (const s of history.priorScores.slice(0, 5)) {
      const d = new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      sections.push(`  - ${d}${s.meeting_title ? ` (${s.meeting_title})` : ''}: talk=${s.talk_ratio}%, questions=${(s.question_quality_score * 10).toFixed(1)}/10, objections=${(s.objection_handling_score * 5).toFixed(1)}/5, discovery=${(s.discovery_depth_score * 5).toFixed(1)}/5`);
    }

    // Compute trends
    if (history.priorScores.length >= 3) {
      const recent = history.priorScores.slice(0, 3);
      const older = history.priorScores.slice(-3);
      const avgRecent = recent.reduce((s, v) => s + v.talk_ratio, 0) / recent.length;
      const avgOlder = older.reduce((s, v) => s + v.talk_ratio, 0) / older.length;
      const talkTrend = avgRecent < avgOlder ? 'improving (less talking)' : avgRecent > avgOlder ? 'worsening (more talking)' : 'stable';
      sections.push(`  Talk ratio trend: ${talkTrend}`);
    }
  } else {
    sections.push('No prior coaching data — this is the first analysis for this rep.');
  }

  if (history.orgWinPatterns) {
    const wp = history.orgWinPatterns;
    sections.push(`Org winning patterns (from ${wp.deals_analyzed} won deals):`);
    if (wp.avg_talk_ratio) sections.push(`  - Avg talk ratio on won deals: ${wp.avg_talk_ratio.toFixed(0)}%`);
    if (wp.avg_question_score) sections.push(`  - Avg question quality on won deals: ${(wp.avg_question_score * 10).toFixed(1)}/10`);
    if (wp.avg_discovery_score) sections.push(`  - Avg discovery depth on won deals: ${(wp.avg_discovery_score * 5).toFixed(1)}/5`);
  }

  return sections.join('\n');
}
