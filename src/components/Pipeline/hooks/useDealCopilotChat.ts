/**
 * useDealCopilotChat Hook
 *
 * Dedicated copilot chat scoped to a single deal inside the DealIntelligenceSheet.
 * Wraps useCopilotChat with:
 *   - Instant synthetic greeting (no API round-trip)
 *   - Hidden deal context injection on first user message
 *   - Background enrichment (meetings + activities)
 *   - Ephemeral session (no persistence)
 */

import { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import { useCopilotChat, type ChatMessage } from '@/lib/hooks/useCopilotChat';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';
import { supabase } from '@/lib/supabase/clientV2';
import { CopilotSessionService } from '@/lib/services/copilotSessionService';
import { askMeeting } from '@/lib/services/meetingAnalyticsService';
import type { PipelineDeal } from './usePipelineData';

const DEBUG = true; // flip to false once verified
function debugLog(label: string, ...args: unknown[]) {
  if (DEBUG) console.debug(`[DealCopilot] ${label}`, ...args);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return '$0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function buildDealContextBlock(
  deal: PipelineDeal,
  enrichment: EnrichmentData | null,
): string {
  const parts: string[] = [];
  parts.push('[DEAL_CONTEXT]');
  parts.push(`Deal ID: ${deal.id}`);
  parts.push(`Deal: ${deal.name}`);
  parts.push(`Company: ${deal.company || 'Unknown'}`);
  parts.push(`Value: ${formatCurrency(deal.value)}`);
  parts.push(`Stage: ${deal.stage_name || 'Unknown'}`);
  if (deal.close_date) parts.push(`Expected close: ${deal.close_date}`);
  if (deal.primary_contact_id) parts.push(`Primary Contact ID: ${deal.primary_contact_id}`);
  if (deal.contact_name) parts.push(`Contact Name: ${deal.contact_name}`);
  if (deal.contact_email) parts.push(`Contact Email: ${deal.contact_email}`);

  if (deal.health_score !== null) {
    parts.push(`Deal Health: ${deal.health_score}/100 (${deal.health_status || 'unknown'})`);
  }
  if (deal.relationship_health_score !== null) {
    parts.push(`Relationship Health: ${deal.relationship_health_score}/100 (${deal.relationship_health_status || 'unknown'})`);
  }
  if (deal.ghost_probability !== null && deal.ghost_probability > 0) {
    parts.push(`Ghost Risk: ${deal.ghost_probability}%`);
  }

  const allRiskFactors = [...(deal.risk_factors || []), ...(deal.relationship_risk_factors || [])];
  if (allRiskFactors.length > 0) {
    parts.push(`Risk Signals: ${allRiskFactors.join(', ')}`);
  }
  if (deal.days_in_current_stage !== null) {
    parts.push(`Days in current stage: ${deal.days_in_current_stage}`);
  }
  if (deal.sentiment_trend) {
    parts.push(`Sentiment trend: ${deal.sentiment_trend}`);
  }
  if (deal.predicted_close_probability !== null) {
    parts.push(`Predicted win probability: ${deal.predicted_close_probability}%`);
  }

  // Enrichment data
  if (enrichment) {
    // Deal truth fields (MEDDICC)
    if (enrichment.truthFields && enrichment.truthFields.length > 0) {
      parts.push('');
      parts.push('Deal Intelligence:');
      const labels: Record<string, string> = {
        pain: 'Pain',
        champion: 'Champion',
        economic_buyer: 'Economic Buyer',
        success_metric: 'Success Metric',
        next_step: 'Next Step',
        top_risks: 'Top Risks',
      };
      for (const tf of enrichment.truthFields) {
        if (!tf.value) continue;
        const label = labels[tf.field_key] || tf.field_key;
        let line = `  - ${label}: ${tf.value}`;
        if (tf.field_key === 'next_step' && tf.next_step_date) {
          line += ` (by ${tf.next_step_date})`;
        }
        parts.push(line);
      }
    }

    if (enrichment.meetings.length > 0) {
      parts.push('');
      parts.push(`Recent Meetings (${enrichment.meetings.length}):`);
      for (const m of enrichment.meetings) {
        const date = m.start_time
          ? new Date(m.start_time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
          : '';
        const summary = m.summary_oneliner ? ` — ${m.summary_oneliner}` : '';
        parts.push(`  - ${date}: ${m.title || 'Untitled'}${summary}`);
      }
    }

    // Structured meeting summaries from Fathom (top 2)
    const meetingsWithSummaries = enrichment.meetings
      .filter((m) => m.summary)
      .slice(0, 2);
    if (meetingsWithSummaries.length > 0) {
      parts.push('');
      parts.push('Meeting Summaries:');
      for (const m of meetingsWithSummaries) {
        const date = m.start_time
          ? new Date(m.start_time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
          : '';
        const extracted = extractMeetingSummary(m.summary);
        if (extracted) {
          parts.push(`  [${date}: ${m.title || 'Untitled'}]`);
          parts.push(`  ${extracted}`);
        }
      }
      debugLog('context:meetingSummaries', { count: meetingsWithSummaries.length });
    }

    if (enrichment.activities.length > 0) {
      parts.push('');
      parts.push(`Recent Activity (${enrichment.activities.length}):`);
      for (const a of enrichment.activities) {
        const date = a.created_at
          ? new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
          : '';
        const subject = a.subject || (a.notes as string)?.slice(0, 60) || a.type;
        parts.push(`  - ${date}: [${a.type}] ${subject}`);
      }
    }

    if (enrichment.overdueTasks && enrichment.overdueTasks.length > 0) {
      parts.push('');
      parts.push(`Overdue Tasks (${enrichment.overdueTasks.length}):`);
      for (const t of enrichment.overdueTasks) {
        parts.push(`  - ${t.title} (due: ${t.due_date}${t.priority ? `, ${t.priority}` : ''})`);
      }
    }

    if (enrichment.temperature) {
      const pct = Math.round(enrichment.temperature.temperature * 100);
      parts.push(`Signal Temperature: ${pct}%${enrichment.temperature.trend ? ` (${enrichment.temperature.trend})` : ''}`);
    }

    if (enrichment.emailSignals && enrichment.emailSignals.length > 0) {
      parts.push('');
      parts.push(`Recent Email Signals (${enrichment.emailSignals.length}):`);
      for (const s of enrichment.emailSignals) {
        const date = s.created_at
          ? new Date(s.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
          : '';
        parts.push(`  - ${date}: ${s.signal_type.replace(/_/g, ' ')} (confidence: ${Math.round(s.confidence * 100)}%)`);
      }
    }

    if (enrichment.meetingIntelligence) {
      parts.push('');
      parts.push(`Meeting Intelligence: ${enrichment.meetingIntelligence}`);
    }

    // Persistent dossier from previous copilot sessions
    if (enrichment.dossier?.snapshot) {
      const s = enrichment.dossier.snapshot;
      parts.push('');
      parts.push('[DEAL_HISTORY]');
      if (s.narrative) parts.push(`Summary: ${s.narrative}`);
      if (s.key_facts && s.key_facts.length > 0) {
        parts.push(`Key facts: ${s.key_facts.join('; ')}`);
      }
      if (s.commitments && s.commitments.length > 0) {
        parts.push(`Commitments: ${s.commitments.join('; ')}`);
      }
      if (s.objections && s.objections.length > 0) {
        parts.push(`Objections raised: ${s.objections.join('; ')}`);
      }
      if (s.stakeholders && s.stakeholders.length > 0) {
        parts.push('Stakeholders:');
        for (const sh of s.stakeholders) {
          parts.push(`  - ${sh.name} (${sh.role}, ${sh.sentiment})`);
        }
      }
      parts.push('[/DEAL_HISTORY]');
    }
  }

  parts.push('[/DEAL_CONTEXT]');
  return parts.join('\n');
}

/**
 * Extract a condensed summary (~400 tokens) from a Fathom meeting summary JSON.
 * Returns key takeaways, action items, and pricing mentions.
 */
function extractMeetingSummary(rawSummary: unknown): string | null {
  if (!rawSummary) return null;
  try {
    const parsed = typeof rawSummary === 'string' ? JSON.parse(rawSummary) : rawSummary;
    const markdown: string = parsed?.markdown_formatted || parsed?.text || '';
    if (!markdown || markdown.length < 20) return null;

    const lines = markdown.split('\n').filter((l: string) => l.trim());
    const takeaways: string[] = [];
    const actions: string[] = [];
    const pricing: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      // Bold items are typically key takeaways in Fathom summaries
      const boldMatch = trimmed.match(/\*\*(.+?)\*\*/);
      if (boldMatch && takeaways.length < 4) {
        takeaways.push(boldMatch[1].replace(/\[|\]/g, ''));
        continue;
      }
      // Action items / next steps
      if (/action|next step|follow[- ]?up|todo|to-do|will send|agreed to/i.test(trimmed) && actions.length < 3) {
        actions.push(trimmed.replace(/^[-*•]\s*/, '').slice(0, 120));
        continue;
      }
      // Pricing / budget mentions
      if (/pric|budget|cost|\$\d|revenue|contract|proposal|quote/i.test(trimmed) && pricing.length < 2) {
        pricing.push(trimmed.replace(/^[-*•]\s*/, '').slice(0, 120));
      }
    }

    const parts: string[] = [];
    if (takeaways.length > 0) parts.push(`Key takeaways: ${takeaways.join('; ')}`);
    if (actions.length > 0) parts.push(`Actions: ${actions.join('; ')}`);
    if (pricing.length > 0) parts.push(`Pricing: ${pricing.join('; ')}`);

    if (parts.length === 0) {
      // Fallback: first 400 chars of the markdown
      return markdown.slice(0, 400).replace(/\n+/g, ' ').trim();
    }

    return parts.join(' | ');
  } catch {
    return null;
  }
}

const generateId = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MeetingRow {
  title: string | null;
  start_time: string | null;
  summary_oneliner: string | null;
  summary: unknown;
}

interface ActivityRow {
  type: string;
  subject: string | null;
  created_at: string | null;
  notes: unknown;
}

interface OverdueTaskRow {
  title: string;
  due_date: string;
  priority: string | null;
}

interface TemperatureRow {
  temperature: number;
  trend: string | null;
}

interface EmailSignalRow {
  signal_type: string;
  context: unknown;
  confidence: number;
  created_at: string;
}

interface TruthFieldRow {
  field_key: string;
  value: string | null;
  confidence: number;
  contact_id: string | null;
  next_step_date: string | null;
}

interface DossierSnapshot {
  narrative?: string;
  key_facts?: string[];
  stakeholders?: { name: string; role: string; sentiment: string }[];
  commitments?: string[];
  objections?: string[];
  timeline?: { date: string; event: string }[];
}

interface DossierRow {
  snapshot: DossierSnapshot;
  updated_at: string;
}

interface EnrichmentData {
  meetings: MeetingRow[];
  activities: ActivityRow[];
  meetingIntelligence?: string | null;
  overdueTasks?: OverdueTaskRow[];
  temperature?: TemperatureRow | null;
  emailSignals?: EmailSignalRow[];
  truthFields?: TruthFieldRow[];
  dossier?: DossierRow | null;
}

export interface DealSuggestion {
  label: string;
  prompt: string;
}

export interface UseDealCopilotChatReturn {
  /** Activate the deal chat — shows instant greeting */
  activate: () => void;
  /** Send a user message (context is injected automatically) */
  sendMessage: (text: string) => void;
  /** All messages in the conversation */
  messages: ChatMessage[];
  /** Whether the copilot is streaming / thinking */
  isLoading: boolean;
  /** Whether the session is loading from persistence */
  isLoadingSession: boolean;
  /** Stop current generation */
  stopGeneration: () => void;
  /** Reset chat state */
  reset: () => void;
  /** Context-aware suggested actions */
  suggestions: DealSuggestion[];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDealCopilotChat(deal: PipelineDeal | null): UseDealCopilotChatReturn {
  const { userId } = useAuth();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);

  const [enrichment, setEnrichment] = useState<EnrichmentData | null>(null);
  const [enrichmentReady, setEnrichmentReady] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const hasInjectedContextRef = useRef(false);
  const activeDealIdRef = useRef<string | null>(null);
  const enrichmentRef = useRef<EnrichmentData | null>(null);
  const sessionServiceRef = useRef(new CopilotSessionService(supabase));

  // Keep enrichmentRef in sync so sendMessage always has latest
  useEffect(() => {
    enrichmentRef.current = enrichment;
  }, [enrichment]);

  const chat = useCopilotChat({
    organizationId: activeOrgId || '',
    userId: userId || '',
    persistSession: true,
    dealId: deal?.id || undefined,
    initialContext: {
      currentView: 'pipeline',
      dealIds: deal ? [deal.id] : [],
    },
  });

  // -----------------------------------------------------------------------
  // Background enrichment — fetch meetings + activities when deal changes
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!deal) {
      setEnrichment(null);
      setEnrichmentReady(false);
      return;
    }

    // Skip if we already enriched this deal
    if (activeDealIdRef.current === deal.id && enrichmentReady) return;
    activeDealIdRef.current = deal.id;
    setEnrichmentReady(false);

    let cancelled = false;

    async function fetchEnrichmentData() {
      if (!deal) return;
      try {
        const companyName = deal.company || deal.name;
        debugLog('enrichment:start', { dealId: deal.id, company: companyName, primaryContactId: deal.primary_contact_id, companyId: deal.company_id });

        // Phase 1: Resolve contact + company links for meeting lookup
        // The meetings table links via primary_contact_id and company_id, NOT deal_id.
        // If the deal is missing these links, resolve them by matching on company name.
        let contactId = deal.primary_contact_id;
        let companyId = deal.company_id;
        let contactName = deal.contact_name;
        let contactEmail = deal.contact_email;

        // If deal has no primary_contact_id, try to find a contact by company name
        if (!contactId && companyName) {
          const { data: contactMatch } = await supabase
            .from('contacts')
            .select('id, first_name, last_name, email')
            .or(`company.ilike.%${companyName}%,email.ilike.%${companyName.toLowerCase().replace(/\s+/g, '')}%`)
            .eq('owner_id', deal.owner_id)
            .limit(1);
          if (contactMatch && contactMatch.length > 0) {
            contactId = contactMatch[0].id;
            contactName = contactName || `${contactMatch[0].first_name || ''} ${contactMatch[0].last_name || ''}`.trim();
            contactEmail = contactEmail || contactMatch[0].email;
            debugLog('enrichment:contact-resolved', { contactId, contactName, contactEmail });
          }
        }

        // If deal has no company_id, try to find company by domain/name
        if (!companyId && companyName) {
          const { data: companyMatch } = await supabase
            .from('companies')
            .select('id')
            .or(`name.ilike.%${companyName}%,domain.ilike.%${companyName.toLowerCase().replace(/\s+/g, '')}%`)
            .limit(1);
          if (companyMatch && companyMatch.length > 0) {
            companyId = companyMatch[0].id;
            debugLog('enrichment:company-resolved', { companyId });
          }
        }

        if (cancelled) return;

        // Phase 2: Find meetings by contact_id or company_id (meetings table has NO deal_id column)
        const meetingFilters: string[] = [];
        if (contactId) meetingFilters.push(`primary_contact_id.eq.${contactId}`);
        if (companyId) meetingFilters.push(`company_id.eq.${companyId}`);

        debugLog('enrichment:meeting-query', { contactId, companyId, filterCount: meetingFilters.length });

        const [meetingsRes, activitiesRes, overdueRes, tempRes, signalsRes, truthRes, dossierRes] = await Promise.all([
          // Meetings — scoped by contact or company (NOT deal_id — column doesn't exist)
          meetingFilters.length > 0
            ? supabase
                .from('meetings')
                .select('id, title, start_time, summary_oneliner, summary, transcript_status')
                .or(meetingFilters.join(','))
                .order('start_time', { ascending: false })
                .limit(5)
            : Promise.resolve({ data: [], error: null }),
          supabase
            .from('activities')
            .select('type, subject, created_at, notes')
            .eq('deal_id', deal.id)
            .order('created_at', { ascending: false })
            .limit(8),
          // Overdue tasks
          supabase
            .from('tasks')
            .select('title, due_date, priority')
            .eq('deal_id', deal.id)
            .eq('completed', false)
            .lt('due_date', new Date().toISOString())
            .order('due_date', { ascending: true })
            .limit(3),
          // Deal signal temperature
          supabase
            .from('deal_signal_temperature')
            .select('temperature, trend')
            .eq('deal_id', deal.id)
            .maybeSingle(),
          // Email signal events
          supabase
            .from('email_signal_events')
            .select('signal_type, context, confidence, created_at')
            .eq('deal_id', deal.id)
            .order('created_at', { ascending: false })
            .limit(3),
          // Deal truth fields (MEDDICC-style)
          supabase
            .from('deal_truth_fields')
            .select('field_key, value, confidence, contact_id, next_step_date')
            .eq('deal_id', deal.id)
            .gte('confidence', 0.3),
          // Deal dossier (persistent AI-synthesized context)
          supabase
            .from('deal_dossiers')
            .select('snapshot, updated_at')
            .eq('deal_id', deal.id)
            .maybeSingle(),
        ]);

        if (cancelled) return;

        // Fallback: if no meetings found by contact/company, search by company name in title
        let meetings = ((meetingsRes.data || []) as (MeetingRow & { id?: string; transcript_status?: string })[]);
        if (meetings.length === 0 && companyName) {
          debugLog('enrichment:meetings-fallback', 'No meetings by contact/company, trying title match');
          const { data: fallbackMeetings } = await supabase
            .from('meetings')
            .select('id, title, start_time, summary_oneliner, summary, transcript_status')
            .ilike('title', `%${companyName}%`)
            .order('start_time', { ascending: false })
            .limit(5);
          if (cancelled) return;
          meetings = (fallbackMeetings || []) as (MeetingRow & { id?: string; transcript_status?: string })[];
          debugLog('enrichment:meetings-fallback:result', { count: meetings.length });
        }

        // Extract meeting IDs for RAG search — only for meetings that have transcripts
        // Use transcript_status (not summary_oneliner) since many meetings have transcripts but no oneliner
        const meetingsWithTranscripts = meetings.filter(m => m.id && (m.transcript_status === 'complete' || m.summary_oneliner));
        const meetingIds = meetingsWithTranscripts.map(m => m.id as string);

        // Run meeting intelligence only if we have meetings with actual transcripts
        // Without this guard, the RAG handler runs unscoped vector search and returns wrong results
        let meetingIntelRes = null;
        if (meetingIds.length > 0) {
          debugLog('enrichment:askMeeting', { meetingIds, count: meetingIds.length });
          meetingIntelRes = await askMeeting({
            question: `What was last discussed with ${companyName}? One sentence.`,
            meetingIds,
            maxMeetings: 3,
          }).catch(() => null);
        } else {
          debugLog('enrichment:askMeeting:skipped', 'No meetings with transcripts found');
        }

        // Fallback: if RAG returned nothing useful, extract a oneliner from the Supabase summary field
        const ragAnswer = meetingIntelRes?.answer;
        let meetingIntelligence: string | null = ragAnswer && !ragAnswer.includes('No transcripts found') ? ragAnswer : null;

        if (!meetingIntelligence && meetings.length > 0) {
          // Try to extract from summary_oneliner or the first meeting's Fathom summary
          const bestMeeting = meetings.find(m => m.summary_oneliner) || meetings[0];
          if (bestMeeting?.summary_oneliner) {
            meetingIntelligence = bestMeeting.summary_oneliner;
          } else if (bestMeeting?.id) {
            // Fetch the summary JSON from the meeting record for a quick oneliner
            const { data: summaryRow } = await supabase
              .from('meetings')
              .select('summary')
              .eq('id', bestMeeting.id)
              .maybeSingle();
            if (cancelled) return;
            if (summaryRow?.summary) {
              try {
                const parsed = typeof summaryRow.summary === 'string' ? JSON.parse(summaryRow.summary) : summaryRow.summary;
                // Extract first key takeaway from the markdown
                const markdown = parsed?.markdown_formatted || '';
                const takeawayMatch = markdown.match(/\*\*(.+?)\*\*/);
                if (takeawayMatch) {
                  meetingIntelligence = takeawayMatch[1].replace(/\[|\]/g, '');
                }
              } catch {
                // ignore parse errors
              }
            }
          }
          if (meetingIntelligence) {
            debugLog('enrichment:meetingIntel:fallback', meetingIntelligence);
          }
        }

        if (cancelled) return;

        const data: EnrichmentData = {
          meetings: meetings as MeetingRow[],
          activities: (activitiesRes.data || []) as ActivityRow[],
          overdueTasks: (overdueRes.data || []) as OverdueTaskRow[],
          temperature: tempRes.data as TemperatureRow | null,
          emailSignals: (signalsRes.data || []) as EmailSignalRow[],
          truthFields: (truthRes.data || []) as TruthFieldRow[],
          dossier: dossierRes.data as DossierRow | null,
          meetingIntelligence,
        };

        // Inject resolved contact info into deal context if we found it
        if (contactName && !deal.contact_name) {
          (deal as unknown as Record<string, unknown>).contact_name = contactName;
        }
        if (contactEmail && !deal.contact_email) {
          (deal as unknown as Record<string, unknown>).contact_email = contactEmail;
        }

        // HEAL-001: Write back resolved links to deals table (fire-and-forget)
        const healUpdates: Record<string, string> = {};
        if (contactId && !deal.primary_contact_id) healUpdates.primary_contact_id = contactId;
        if (companyId && !deal.company_id) healUpdates.company_id = companyId;
        if (contactName && !deal.contact_name) healUpdates.contact_name = contactName;
        if (contactEmail && !deal.contact_email) healUpdates.contact_email = contactEmail;

        if (Object.keys(healUpdates).length > 0) {
          debugLog('heal:write-back', healUpdates);
          supabase
            .from('deals')
            .update(healUpdates)
            .eq('id', deal.id)
            .then(({ error }) => {
              if (error) debugLog('heal:write-back:error', error.message);
              else debugLog('heal:write-back:success', Object.keys(healUpdates));
            });
        }

        debugLog('enrichment:result', {
          meetings: data.meetings.length,
          activities: data.activities.length,
          overdueTasks: data.overdueTasks?.length ?? 0,
          temperature: data.temperature ? `${Math.round(data.temperature.temperature * 100)}%` : 'none',
          emailSignals: data.emailSignals?.length ?? 0,
          meetingIntel: data.meetingIntelligence ? 'yes' : 'no',
          resolvedContact: contactName || 'none',
          resolvedCompanyId: companyId || 'none',
        });

        setEnrichment(data);
        setEnrichmentReady(true);
      } catch (err) {
        console.warn('[DealCopilot] enrichment fetch failed:', err);
        // Non-blocking — mark ready even on failure so greeting isn't stuck
        setEnrichmentReady(true);
      }
    }

    fetchEnrichmentData();
    return () => { cancelled = true; };
  }, [deal]);

  // -----------------------------------------------------------------------
  // Reset context-injected flag when messages are cleared
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (chat.messages.length === 0) {
      hasInjectedContextRef.current = false;
    }
  }, [chat.messages.length]);

  // -----------------------------------------------------------------------
  // Build greeting from deal + enrichment
  // -----------------------------------------------------------------------
  const buildGreeting = useCallback(
    (deal: PipelineDeal, enrichData: EnrichmentData | null): string => {
      const companyName = deal.company || deal.name;
      const contactName = deal.contact_name;

      // Opening line — mention contact name when available
      let greeting = contactName
        ? `How can I help with **${contactName}** at **${companyName}**?`
        : `How can I help with the **${companyName}** deal?`;

      // Add a quick status line based on health
      if (deal.health_score !== null) {
        const status = deal.health_status || 'unknown';
        greeting += ` Health is **${deal.health_score}/100** (${status}).`;
      }
      if (deal.ghost_probability !== null && deal.ghost_probability > 30) {
        greeting += ` Ghost risk is elevated at **${deal.ghost_probability}%**.`;
      }

      // Last meeting date + key takeaway
      if (enrichData?.meetings && enrichData.meetings.length > 0) {
        const lastMeeting = enrichData.meetings[0];
        if (lastMeeting.start_time) {
          const meetingDate = new Date(lastMeeting.start_time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
          // Try to get a meaningful takeaway from the full summary, not just oneliner
          let takeaway = '';
          const extracted = extractMeetingSummary(lastMeeting.summary);
          if (extracted) {
            // Use first key takeaway segment (before the first pipe separator)
            const firstSegment = extracted.split(' | ')[0];
            takeaway = firstSegment.replace(/^Key takeaways: /, '');
          } else if (lastMeeting.summary_oneliner) {
            takeaway = lastMeeting.summary_oneliner;
          }
          if (takeaway) {
            greeting += `\n\nLast meeting (**${meetingDate}**): *${takeaway}*`;
          } else {
            greeting += `\n\nLast meeting was on **${meetingDate}** — ${lastMeeting.title || 'untitled'}.`;
          }
        }
      }

      // Next step nudge from truth fields
      if (enrichData?.truthFields) {
        const nextStep = enrichData.truthFields.find(tf => tf.field_key === 'next_step' && tf.value);
        if (nextStep) {
          const dateSuffix = nextStep.next_step_date ? ` (by ${nextStep.next_step_date})` : '';
          greeting += `\n\nNext step: **${nextStep.value}**${dateSuffix}`;
        }
      }

      // Dossier context from previous sessions
      if (enrichData?.dossier?.snapshot?.narrative) {
        greeting += `\n\n*${enrichData.dossier.snapshot.narrative}*`;
      }

      // Proactive alerts from enrichment
      const alerts: string[] = [];

      if (enrichData?.overdueTasks && enrichData.overdueTasks.length > 0) {
        const count = enrichData.overdueTasks.length;
        alerts.push(`${count} overdue task${count > 1 ? 's' : ''} need${count === 1 ? 's' : ''} attention`);
      }

      if (enrichData?.temperature) {
        const temp = enrichData.temperature;
        const pct = Math.round(temp.temperature * 100);
        if (pct < 30) {
          alerts.push(`Signal temperature is cold (${pct}%)${temp.trend ? ` — ${temp.trend}` : ''}`);
        } else if (temp.trend === 'declining') {
          alerts.push(`Signal temperature is declining (${pct}%)`);
        }
      }

      if (enrichData?.emailSignals && enrichData.emailSignals.length > 0) {
        const top = enrichData.emailSignals[0];
        const signalLabel = (top.signal_type || '').replace(/_/g, ' ');
        alerts.push(`Recent signal: ${signalLabel}`);
      }

      if (alerts.length > 0) {
        greeting += '\n\n';
        for (const alert of alerts) {
          greeting += `- ${alert}\n`;
        }
      }

      // Meeting intelligence one-liner (only if we didn't already show a takeaway above)
      if (enrichData?.meetingIntelligence && !(enrichData.meetings?.length > 0 && enrichData.meetings[0].start_time)) {
        greeting += `\n*${enrichData.meetingIntelligence}*`;
      }

      return greeting;
    },
    [],
  );

  // -----------------------------------------------------------------------
  // activate() — inject instant greeting, no API call
  // -----------------------------------------------------------------------
  const activate = useCallback(() => {
    if (!deal) return;

    // Always start fresh
    chat.clearMessages();
    hasInjectedContextRef.current = false;
    setIsActive(true);

    if (enrichmentReady) {
      // Enrichment already loaded — show full greeting immediately
      debugLog('activate', 'enrichment ready, showing full greeting');
      const greeting = buildGreeting(deal, enrichment);
      chat.injectMessages([{
        id: generateId(),
        role: 'assistant',
        content: greeting,
        timestamp: new Date(),
      }]);
    } else {
      // Enrichment still loading — show loading greeting, will be upgraded by useEffect
      debugLog('activate', 'enrichment pending, showing loading greeting');
      const companyName = deal.company || deal.name;
      chat.injectMessages([{
        id: generateId(),
        role: 'assistant',
        content: `Loading context for **${companyName}**...`,
        timestamp: new Date(),
      }]);
    }
  }, [deal, chat, enrichment, enrichmentReady, buildGreeting]);

  // -----------------------------------------------------------------------
  // Upgrade greeting when enrichment arrives after activate() was called
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!enrichmentReady || !isActive || !deal) return;

    // Only upgrade if the user hasn't sent a message yet (chat is still just the greeting/loading)
    const hasOnlyGreeting = chat.messages.length === 1 && chat.messages[0].role === 'assistant';
    if (!hasOnlyGreeting) return;

    const currentContent = chat.messages[0].content;
    const richGreeting = buildGreeting(deal, enrichment);

    // Skip if content is already the rich greeting (avoid infinite loop)
    if (currentContent === richGreeting) return;

    debugLog('greeting:upgrade', 'Replacing greeting with enriched version');
    chat.clearMessages();
    chat.injectMessages([{
      id: generateId(),
      role: 'assistant',
      content: richGreeting,
      timestamp: new Date(),
    }]);
  }, [enrichmentReady, isActive, deal, enrichment, chat, buildGreeting]);

  // -----------------------------------------------------------------------
  // sendMessage() — inject user bubble + send enriched message silently
  // -----------------------------------------------------------------------
  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim() || !deal) return;

      // Inject the visible user message
      const userMsg: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: text,
        timestamp: new Date(),
      };
      chat.injectMessages([userMsg]);

      // Persist the clean user text (not the enriched API message)
      if (chat.conversationId) {
        sessionServiceRef.current.addMessage({
          conversation_id: chat.conversationId,
          role: 'user',
          content: text,
        }).catch(() => {});
      }

      // Build the actual API message — prepend deal context on first message
      // Use enrichmentRef to always get the latest enrichment (not stale closure value)
      let apiMessage = text;
      if (!hasInjectedContextRef.current) {
        const latestEnrichment = enrichmentRef.current;
        debugLog('sendMessage:context', {
          hasEnrichment: !!latestEnrichment,
          meetings: latestEnrichment?.meetings.length ?? 0,
          activities: latestEnrichment?.activities.length ?? 0,
        });
        const contextBlock = buildDealContextBlock(deal, latestEnrichment);
        apiMessage = `${contextBlock}\n\n${text}`;
        hasInjectedContextRef.current = true;
      }

      // Send silently — no duplicate user bubble, no duplicate persistence
      chat.sendMessage(apiMessage, { silent: true });
    },
    [deal, chat],
  );

  // -----------------------------------------------------------------------
  // reset() — also triggers dossier synthesis if conversation was meaningful
  // -----------------------------------------------------------------------
  const reset = useCallback(() => {
    // DOSS-002: Synthesize dossier if chat had >= 2 user messages
    if (deal && activeOrgId) {
      const userMsgCount = chat.messages.filter(m => m.role === 'user').length;
      if (userMsgCount >= 2) {
        // Build conversation summary for dossier extraction
        const conversationText = chat.messages
          .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`)
          .join('\n\n');

        const dossierPrompt = [
          '[SYSTEM_INTERNAL] Extract a structured deal dossier from this conversation.',
          'Return ONLY valid JSON with this structure:',
          '{ "narrative": "2-3 sentence deal summary",',
          '  "key_facts": ["fact1", "fact2"],',
          '  "stakeholders": [{"name": "...", "role": "...", "sentiment": "positive|neutral|negative"}],',
          '  "commitments": ["commitment1"],',
          '  "objections": ["objection1"],',
          '  "timeline": [{"date": "...", "event": "..."}] }',
          '',
          'Conversation:',
          conversationText,
        ].join('\n');

        // Fire-and-forget: send to copilot-autonomous and upsert result
        debugLog('dossier:synthesize', { dealId: deal.id, userMessages: userMsgCount });
        supabase.functions.invoke('copilot-autonomous', {
          body: {
            messages: [{ role: 'user', content: dossierPrompt }],
            organizationId: activeOrgId,
          },
        }).then(async ({ data, error }) => {
          if (error) {
            debugLog('dossier:synthesize:error', error.message);
            return;
          }
          // Parse the AI response to extract JSON
          const responseText = data?.response || data?.content || '';
          try {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return;
            const snapshot = JSON.parse(jsonMatch[0]);
            // Upsert into deal_dossiers
            const { error: upsertError } = await supabase
              .from('deal_dossiers')
              .upsert({
                deal_id: deal.id,
                org_id: activeOrgId,
                snapshot,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'deal_id' });
            if (upsertError) debugLog('dossier:upsert:error', upsertError.message);
            else debugLog('dossier:upsert:success', deal.id);
          } catch {
            debugLog('dossier:parse:error', 'Failed to parse dossier JSON from AI response');
          }
        }).catch(() => {});
      }
    }

    chat.clearMessages();
    hasInjectedContextRef.current = false;
    setIsActive(false);
  }, [chat, deal, activeOrgId]);

  // -----------------------------------------------------------------------
  // suggestions — context-aware quick actions based on deal state
  // -----------------------------------------------------------------------
  const suggestions = useMemo<DealSuggestion[]>(() => {
    if (!deal) return [];

    const items: DealSuggestion[] = [];

    // Always-useful actions
    items.push({ label: 'Summarize deal', prompt: 'Give me a full summary of this deal' });
    items.push({ label: 'Write follow-up', prompt: 'Draft a follow-up email for this deal' });
    items.push({ label: 'Next best actions', prompt: 'What should I do next to advance this deal?' });

    // Contextual actions based on deal state
    if (deal.ghost_probability !== null && deal.ghost_probability > 30) {
      items.push({ label: 'Re-engage', prompt: 'This deal has gone quiet. Help me re-engage the prospect.' });
    }

    if (deal.health_status === 'critical' || deal.risk_level === 'critical' || deal.risk_level === 'high') {
      items.push({ label: 'Rescue plan', prompt: 'This deal is at risk. Create a rescue plan.' });
    }

    items.push({ label: 'Prep for meeting', prompt: 'Prep me for my next meeting on this deal' });
    items.push({ label: 'Research company', prompt: `Research ${deal.company || deal.name} and give me key insights` });

    // Cap at 5 suggestions
    return items.slice(0, 5);
  }, [deal]);

  return {
    activate,
    sendMessage,
    messages: chat.messages,
    isLoading: chat.isThinking || chat.isStreaming,
    isLoadingSession: chat.isLoadingSession,
    stopGeneration: chat.stopGeneration,
    reset,
    suggestions,
  };
}
